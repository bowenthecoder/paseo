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
  sourceSeqRanges?: Array<{ startSeq: number; endSeq: number }>;
}

export interface TimelinePageBudgetInput<T extends BudgetedTimelineEntry> {
  direction: TimelinePageDirection;
  entries: T[];
  startSeq: number | null;
  endSeq: number | null;
  hasOlder: boolean;
  hasNewer: boolean;
  maxBytes?: number;
  measure?: (entry: T) => number;
  shrinkEntry?: (entry: T, maxBytes: number) => T;
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
 * Keeps the entries nearest the page anchor (the newest for tail/before, the oldest
 * for after) until the byte budget is spent, and moves the far cursor so the client
 * keeps paging from where the page was cut. A nonempty page carries at least one
 * entry, or fails explicitly when identity metadata cannot fit without corruption.
 */
export function budgetTimelinePage<T extends BudgetedTimelineEntry>(
  input: TimelinePageBudgetInput<T>,
): TimelinePageBudgetResult<T> {
  const maxBytes = input.maxBytes ?? MAX_TIMELINE_PAGE_BYTES;
  const measure = input.measure ?? measureJsonBytes;
  const anchorNewest = input.direction !== "after";
  const firstRequestedSeq = input.startSeq ?? 0;
  const indexed = input.entries.map((entry, index) => ({
    entry,
    index,
    nextSourceSeq: firstSourceSeqAtOrAfter(entry, firstRequestedSeq),
  }));
  // A completed tool keeps its old display position but may have a much newer
  // source update. Forward pages must spend their budget in source order.
  const ordered = anchorNewest
    ? indexed.toReversed()
    : [...indexed].sort(
        (left, right) => left.nextSourceSeq - right.nextSourceSeq || left.index - right.index,
      );

  const kept: typeof indexed = [];
  let bytes = 2; // JSON array brackets; commas are included below.
  let truncatedEntries = 0;
  for (const indexedEntry of ordered) {
    let candidate = indexedEntry.entry;
    let candidateBytes = measure(candidate);
    if (kept.length === 0 && candidateBytes + bytes > maxBytes) {
      if (!input.shrinkEntry) throw new Error("Timeline entry exceeds the page byte budget");
      candidate = input.shrinkEntry(candidate, maxBytes - bytes);
      candidateBytes = measure(candidate);
      if (candidateBytes + bytes > maxBytes)
        throw new Error("Timeline entry exceeds the page byte budget");
      truncatedEntries += 1;
    }
    const separatorBytes = kept.length > 0 ? 1 : 0;
    if (bytes + separatorBytes + candidateBytes > maxBytes) break;
    kept.push({ ...indexedEntry, entry: candidate });
    bytes += separatorBytes + candidateBytes;
  }

  const droppedEntries = input.entries.length - kept.length;
  const entries = kept
    .toSorted((left, right) => left.index - right.index)
    .map(({ entry }) => entry);
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
    // Backward selection follows display anchors, as the projector does. A
    // dropped tool's late completion must not jump past the entries we kept.
    const keptMinSeq = entries.reduce(
      (minimum, entry) => Math.min(minimum, entry.seqStart),
      Infinity,
    );
    const startSeq = Math.max(input.startSeq ?? keptMinSeq, keptMinSeq);
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
  const droppedMinSeq = ordered[kept.length]!.nextSourceSeq;
  const endSeq = Math.min(input.endSeq ?? droppedMinSeq - 1, droppedMinSeq - 1);
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

function firstSourceSeqAtOrAfter(entry: BudgetedTimelineEntry, startSeq: number): number {
  const ranges = entry.sourceSeqRanges ?? [{ startSeq: entry.seqStart, endSeq: entry.seqEnd }];
  for (const range of ranges) {
    if (range.endSeq >= startSeq) return Math.max(startSeq, range.startSeq);
  }
  return Number.POSITIVE_INFINITY;
}
