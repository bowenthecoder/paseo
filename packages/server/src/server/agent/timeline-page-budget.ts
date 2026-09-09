// A timeline page is one WebSocket frame. The physical socket refuses any frame
// above its 64 MiB bound, so a page must stay well below it no matter how many
// rows the caller asked for (limit 0 means "all") or how large one row grew.
// Budget the page by bytes and let the cursors tell the client to keep paging.
export const MAX_TIMELINE_PAGE_BYTES = 8 * 1024 * 1024;
// Only a single entry that alone breaks the page budget gets its strings cut.
export const MAX_TIMELINE_ENTRY_STRING_CHARS = 1024 * 1024;

export type TimelinePageDirection = "tail" | "before" | "after";

export interface BudgetedTimelineEntry {
  seqStart: number;
  seqEnd: number;
}

export interface TimelinePageBudgetInput<T extends BudgetedTimelineEntry> {
  direction: TimelinePageDirection;
  entries: T[];
  startSeq: number | null;
  endSeq: number | null;
  hasOlder: boolean;
  hasNewer: boolean;
  maxBytes?: number;
  maxStringChars?: number;
  measure?: (entry: T) => number;
}

export interface TimelinePageBudgetResult<T extends BudgetedTimelineEntry> {
  entries: T[];
  startSeq: number | null;
  endSeq: number | null;
  hasOlder: boolean;
  hasNewer: boolean;
  droppedEntries: number;
  truncatedEntries: number;
  bytes: number;
}

export function measureJsonBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value) ?? "");
}

/**
 * Deep-copies `value` with every string longer than `maxChars` cut to that length and
 * marked. Returns the original reference untouched when nothing needed cutting.
 */
export function truncateLongStrings<T>(
  value: T,
  maxChars: number,
): { value: T; truncated: boolean } {
  let truncated = false;
  const visit = (node: unknown): unknown => {
    if (typeof node === "string") {
      if (node.length <= maxChars) return node;
      truncated = true;
      const omitted = node.length - maxChars;
      return `${node.slice(0, maxChars)}\n[truncated by daemon: ${omitted} characters omitted]`;
    }
    if (Array.isArray(node)) {
      let changed = false;
      const next = node.map((child) => {
        const visited = visit(child);
        if (visited !== child) changed = true;
        return visited;
      });
      return changed ? next : node;
    }
    if (node && typeof node === "object") {
      let changed = false;
      const next: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
        const visited = visit(child);
        if (visited !== child) changed = true;
        next[key] = visited;
      }
      return changed ? next : node;
    }
    return node;
  };
  const result = visit(value) as T;
  return { value: result, truncated };
}

/**
 * Keeps the entries nearest the page anchor (the newest for tail/before, the oldest
 * for after) until the byte budget is spent, and moves the far cursor so the client
 * keeps paging from where the page was cut. The page always carries at least one
 * entry; an entry that alone exceeds the budget is shrunk instead of dropped.
 */
export function budgetTimelinePage<T extends BudgetedTimelineEntry>(
  input: TimelinePageBudgetInput<T>,
): TimelinePageBudgetResult<T> {
  const maxBytes = input.maxBytes ?? MAX_TIMELINE_PAGE_BYTES;
  const maxStringChars = input.maxStringChars ?? MAX_TIMELINE_ENTRY_STRING_CHARS;
  const measure = input.measure ?? measureJsonBytes;
  const anchorNewest = input.direction !== "after";
  // Walk from the anchor outward: newest-first for tail/before, oldest-first for after.
  const ordered = anchorNewest ? input.entries.toReversed() : [...input.entries];

  const kept: T[] = [];
  let bytes = 0;
  let truncatedEntries = 0;
  for (const entry of ordered) {
    let candidate = entry;
    let candidateBytes = measure(candidate);
    if (kept.length === 0 && candidateBytes > maxBytes) {
      const cut = truncateLongStrings(candidate, maxStringChars);
      if (cut.truncated) {
        candidate = cut.value;
        candidateBytes = measure(candidate);
        truncatedEntries += 1;
      }
    }
    if (kept.length > 0 && bytes + candidateBytes > maxBytes) break;
    kept.push(candidate);
    bytes += candidateBytes;
  }

  const droppedEntries = input.entries.length - kept.length;
  const entries = anchorNewest ? kept.toReversed() : kept;
  if (droppedEntries === 0) {
    return {
      entries,
      startSeq: input.startSeq,
      endSeq: input.endSeq,
      hasOlder: input.hasOlder,
      hasNewer: input.hasNewer,
      droppedEntries,
      truncatedEntries,
      bytes,
    };
  }

  if (anchorNewest) {
    // Dropped the oldest entries: the page now starts after the newest dropped row.
    const dropped = input.entries.slice(0, droppedEntries);
    const droppedMaxSeq = Math.max(...dropped.map((entry) => entry.seqEnd));
    const keptMinSeq = Math.min(...entries.map((entry) => entry.seqStart));
    const startSeq = Math.max(input.startSeq ?? keptMinSeq, droppedMaxSeq + 1, keptMinSeq);
    return {
      entries,
      startSeq,
      endSeq: input.endSeq,
      hasOlder: true,
      hasNewer: input.hasNewer,
      droppedEntries,
      truncatedEntries,
      bytes,
    };
  }

  // Dropped the newest entries: the page now ends before the oldest dropped row.
  const dropped = input.entries.slice(input.entries.length - droppedEntries);
  const droppedMinSeq = Math.min(...dropped.map((entry) => entry.seqStart));
  const keptMaxSeq = Math.max(...entries.map((entry) => entry.seqEnd));
  const endSeq = Math.min(input.endSeq ?? keptMaxSeq, droppedMinSeq - 1, keptMaxSeq);
  return {
    entries,
    startSeq: input.startSeq,
    endSeq,
    hasOlder: input.hasOlder,
    hasNewer: true,
    droppedEntries,
    truncatedEntries,
    bytes,
  };
}
