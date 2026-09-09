import { describe, expect, test } from "vitest";
import { AgentTimelineItemPayloadSchema } from "@getpaseo/protocol/messages";
import {
  budgetTimelinePage,
  MAX_TIMELINE_PAGE_BYTES,
  measureJsonBytes,
} from "./timeline-page-budget.js";
import { shrinkTimelineEntry } from "./timeline-entry-budget.js";
import type { AgentTimelineItem } from "./agent-sdk-types.js";

function entry(item: AgentTimelineItem) {
  return {
    provider: "codex" as const,
    timestamp: "2026-09-09T00:00:00.000Z",
    turnId: "turn-1",
    seqStart: 1,
    seqEnd: 10,
    sourceSeqRanges: [
      { startSeq: 1, endSeq: 1 },
      { startSeq: 10, endSeq: 10 },
    ],
    collapsed: ["tool_lifecycle"],
    item,
  };
}

describe("timeline entry byte bounds", () => {
  test("bounds an aggregate of short strings beyond the real page limit, retaining metadata", () => {
    const original = entry({
      type: "tool_call",
      callId: "tool-1",
      name: "read",
      status: "completed",
      error: null,
      metadata: { subagentId: "child-1" },
      detail: {
        type: "unknown",
        input: { path: "result.json" },
        output: Array(12).fill("x".repeat(800_000)),
      },
    });
    expect(measureJsonBytes(original)).toBeGreaterThan(MAX_TIMELINE_PAGE_BYTES);
    const result = budgetTimelinePage({
      entries: [original],
      direction: "tail",
      startSeq: 1,
      endSeq: 10,
      hasOlder: false,
      hasNewer: false,
      shrinkEntry: shrinkTimelineEntry,
    });
    expect(measureJsonBytes(result.entries)).toBeLessThanOrEqual(MAX_TIMELINE_PAGE_BYTES);
    const actual = result.entries[0]!;
    expect({ ...actual, item: undefined }).toEqual({ ...original, item: undefined });
    expect(actual.item).toMatchObject({
      callId: "tool-1",
      status: "completed",
      metadata: { subagentId: "child-1" },
    });
    expect(JSON.stringify(actual.item)).toContain("truncated by daemon");
    expect(AgentTimelineItemPayloadSchema.safeParse(actual.item).success).toBe(true);
    expect(result.truncatedEntries).toBe(1);
    expect(original.item.type === "tool_call" && original.item.detail.type).toBe("unknown");
  });

  test("uses encoded bytes for escaped Unicode text and preserves message identity", () => {
    const original = entry({
      type: "assistant_message",
      messageId: "message-1",
      text: '😀\\\n"'.repeat(2_000),
    });
    const actual = shrinkTimelineEntry(original, 2_048);
    expect(measureJsonBytes(actual)).toBeLessThanOrEqual(2_048);
    expect(actual.item).toMatchObject({ type: "assistant_message", messageId: "message-1" });
    expect(JSON.stringify(actual.item)).toContain("truncated by daemon");
    expect(AgentTimelineItemPayloadSchema.safeParse(actual.item).success).toBe(true);
    expect(original.item).toEqual({
      type: "assistant_message",
      messageId: "message-1",
      text: '😀\\\n"'.repeat(2_000),
    });
  });

  test("bounds a large list and a structured failed-tool error with visible markers", () => {
    for (const item of [
      {
        type: "todo",
        items: Array.from({ length: 1_000 }, (_, index) => ({
          text: `Task ${index}`,
          completed: false,
        })),
      },
      {
        type: "tool_call",
        callId: "failed-1",
        name: "fetch",
        status: "failed",
        error: Array(1_000).fill({ text: "bad response" }),
        detail: { type: "unknown", input: null, output: null },
      },
    ] satisfies AgentTimelineItem[]) {
      const actual = shrinkTimelineEntry(entry(item), 4_096);
      expect(measureJsonBytes(actual)).toBeLessThanOrEqual(4_096);
      expect(AgentTimelineItemPayloadSchema.safeParse(actual.item).success).toBe(true);
      expect(JSON.stringify(actual.item)).toContain("truncated by daemon");
    }
  });

  test("rejects unshrinkable identity metadata instead of corrupting IDs or exceeding the bound", () => {
    const original = entry({
      type: "assistant_message",
      messageId: "m".repeat(4_096),
      text: "x".repeat(4_096),
    });
    expect(() => shrinkTimelineEntry(original, 1_024)).toThrow(
      "metadata exceeds the page byte budget",
    );
    expect(original.item.type === "assistant_message" && original.item.messageId).toHaveLength(
      4_096,
    );
  });
});
