import type { AgentTimelineItem } from "./agent-sdk-types.js";
import { MAX_TIMELINE_ENTRY_STRING_CHARS, measureJsonBytes } from "./timeline-page-budget.js";

/** Limits display content while preserving timeline positions and item identity. */
export function shrinkTimelineEntry<T extends { item: AgentTimelineItem }>(
  entry: T,
  maxBytes: number,
): T {
  const buildItem = contentExcerptBuilder(entry.item);
  const build = (chars: number): T => ({ ...entry, item: buildItem(chars) });
  let low = 0;
  let high = Math.min(MAX_TIMELINE_ENTRY_STRING_CHARS, Math.max(0, maxBytes));
  const fullExcerpt = build(high);
  if (measureJsonBytes(fullExcerpt) <= maxBytes) return fullExcerpt;
  let fitting = build(low);
  if (measureJsonBytes(fitting) > maxBytes) {
    throw new Error("Timeline entry metadata exceeds the page byte budget");
  }
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = build(mid);
    if (measureJsonBytes(candidate) <= maxBytes) {
      low = mid;
      fitting = candidate;
    } else {
      high = mid - 1;
    }
  }
  return fitting;
}

function prefix(text: string, chars: number): string {
  let end = Math.min(text.length, chars);
  const lastCodeUnit = text.charCodeAt(end - 1);
  if (end < text.length && lastCodeUnit >= 0xd800 && lastCodeUnit <= 0xdbff) end -= 1;
  return text.slice(0, end);
}

function truncateText(text: string, chars: number): string {
  if (text.length <= chars) return text;
  const visible = prefix(text, chars);
  const excerpt = `${visible}\n[truncated by daemon: ${text.length - visible.length} characters omitted]`;
  return excerpt.length < text.length ? excerpt : text;
}

function contentExcerptBuilder(item: AgentTimelineItem): (chars: number) => AgentTimelineItem {
  switch (item.type) {
    case "user_message":
    case "assistant_message":
    case "reasoning":
      return (chars) => ({ ...item, text: truncateText(item.text, chars) });
    case "error":
      return (chars) => ({ ...item, message: truncateText(item.message, chars) });
    case "tool_call": {
      const detail = boundedJsonPreview(item.detail, MAX_TIMELINE_ENTRY_STRING_CHARS);
      const error =
        item.status === "failed"
          ? boundedJsonPreview(item.error, MAX_TIMELINE_ENTRY_STRING_CHARS)
          : null;
      return (chars) => {
        const excerpt = {
          type: "plain_text",
          text: `${prefix(detail, chars)}\n[truncated by daemon: oversized tool content shown as an excerpt]`,
        } as const;
        return item.status === "failed"
          ? {
              ...item,
              detail: excerpt,
              error: `${prefix(error ?? "", chars)}\n[truncated by daemon: oversized error shown as an excerpt]`,
            }
          : { ...item, detail: excerpt };
      };
    }
    case "todo": {
      const shown = item.items.slice(0, 32);
      return (chars) => ({
        ...item,
        items: [
          ...shown.map((todo) => ({
            ...todo,
            text: truncateText(todo.text, Math.floor(chars / Math.max(1, shown.length))),
          })),
          ...(shown.length < item.items.length
            ? [
                {
                  text: `[truncated by daemon: ${item.items.length - shown.length} task entries omitted]`,
                  completed: false,
                },
              ]
            : []),
        ],
      });
    }
    case "compaction":
      return () => item;
  }
}

// Stop visiting once the display excerpt is full; a huge array of short values
// must not require allocating a second full JSON document just to truncate it.
function boundedJsonPreview(value: unknown, maxChars: number): string {
  let remaining = maxChars;
  const parts: string[] = [];
  const write = (text: string) => {
    const part = prefix(text, remaining);
    parts.push(part);
    remaining -= part.length;
  };
  const visit = (node: unknown, depth: number): void => {
    if (remaining <= 0) return;
    if (depth > 64) {
      write('"[nested content omitted]"');
    } else if (typeof node === "string") {
      write(JSON.stringify(prefix(node, remaining)));
    } else if (Array.isArray(node)) {
      write("[");
      for (let index = 0; index < node.length; index += 1) {
        if (remaining <= 0) break;
        if (index > 0) write(",");
        visit(node[index], depth + 1);
      }
      write("]");
    } else if (node && typeof node === "object") {
      write("{");
      let first = true;
      for (const key in node) {
        if (remaining <= 0) break;
        if (!Object.hasOwn(node, key)) continue;
        if (!first) write(",");
        first = false;
        write(JSON.stringify(prefix(key, remaining)));
        write(":");
        visit((node as Record<string, unknown>)[key], depth + 1);
      }
      write("}");
    } else {
      write(JSON.stringify(node) ?? "null");
    }
  };
  visit(value, 0);
  return parts.join("");
}
