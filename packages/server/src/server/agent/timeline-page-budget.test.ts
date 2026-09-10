import { describe, expect, test } from "vitest";
import { selectProjectedTimelinePage } from "./timeline-projection.js";
import type { AgentTimelineRow } from "./agent-manager.js";
import { budgetTimelinePage, measureJsonBytes } from "./timeline-page-budget.js";

interface Entry {
  seqStart: number;
  seqEnd: number;
  text: string;
}

function entry(seq: number, chars: number): Entry {
  return { seqStart: seq, seqEnd: seq, text: "x".repeat(chars) };
}

describe("budgetTimelinePage", () => {
  test.each(["after", "before"] as const)(
    "%s paging progresses through interleaved tool lifecycle entries without losing messages",
    (direction) => {
      const toolRow = (seq: number, status: "running" | "completed"): AgentTimelineRow => ({
        seq,
        timestamp: new Date(seq).toISOString(),
        item: {
          type: "tool_call",
          callId: "tool-1",
          name: "shell",
          status,
          error: null,
          detail: { type: "unknown", input: null, output: "t".repeat(800) },
        },
      });
      const rows: AgentTimelineRow[] = [
        toolRow(1, "running"),
        ...Array.from(
          { length: 3 },
          (_, index): AgentTimelineRow => ({
            seq: index + 2,
            timestamp: new Date(index + 2).toISOString(),
            item: { type: "user_message", text: "u".repeat(700) },
          }),
        ),
        toolRow(5, "completed"),
      ];
      let cursor = direction === "after" ? 0 : 6;
      const received = new Set<number>();
      let finished = false;
      for (let pageIndex = 0; pageIndex < 6; pageIndex += 1) {
        const selection = selectProjectedTimelinePage({
          rows,
          direction,
          cursorSeq: cursor,
          limit: 0,
        });
        const page = budgetTimelinePage({ ...selection, direction, maxBytes: 1500 });
        for (const receivedEntry of page.entries) received.add(receivedEntry.seqStart);
        const next = direction === "after" ? page.endSeq : page.startSeq;
        expect(next).not.toBeNull();
        if (direction === "after") expect(next!).toBeGreaterThan(cursor);
        else expect(next!).toBeLessThan(cursor);
        expect(page.startSeq!).toBeLessThanOrEqual(page.endSeq!);
        cursor = next!;
        if (!(direction === "after" ? page.hasNewer : page.hasOlder)) {
          finished = true;
          break;
        }
      }
      expect(finished).toBe(true);
      expect([...received].sort()).toEqual([1, 2, 3, 4]);
    },
  );

  test("leaves a page that fits untouched", () => {
    const entries = [entry(1, 10), entry(2, 10), entry(3, 10)];
    const result = budgetTimelinePage({
      direction: "tail",
      entries,
      startSeq: 1,
      endSeq: 3,
      hasOlder: false,
      hasNewer: false,
      maxBytes: 10_000,
    });
    expect(result.entries).toEqual(entries);
    expect(result.entries.map((e) => e.seqStart)).toEqual([1, 2, 3]);
    expect(result).toMatchObject({
      startSeq: 1,
      endSeq: 3,
      hasOlder: false,
      hasNewer: false,
      droppedEntries: 0,
    });
  });

  test("a tail page keeps the newest entries and moves the older cursor", () => {
    const entries = [entry(1, 1000), entry(2, 1000), entry(3, 1000), entry(4, 1000)];
    const perEntry = measureJsonBytes(entries[0]);
    const result = budgetTimelinePage({
      direction: "tail",
      entries,
      startSeq: 1,
      endSeq: 4,
      hasOlder: false,
      hasNewer: false,
      maxBytes: perEntry * 2 + 10,
    });
    expect(result.entries.map((e) => e.seqStart)).toEqual([3, 4]);
    expect(result).toMatchObject({
      startSeq: 3,
      endSeq: 4,
      hasOlder: true,
      hasNewer: false,
      droppedEntries: 2,
    });
  });

  test("a before page behaves like a tail page", () => {
    const entries = [entry(10, 1000), entry(11, 1000), entry(12, 1000)];
    const perEntry = measureJsonBytes(entries[0]);
    const result = budgetTimelinePage({
      direction: "before",
      entries,
      startSeq: 10,
      endSeq: 12,
      hasOlder: true,
      hasNewer: true,
      maxBytes: perEntry + 10,
    });
    expect(result.entries.map((e) => e.seqStart)).toEqual([12]);
    expect(result).toMatchObject({
      startSeq: 12,
      endSeq: 12,
      hasOlder: true,
      hasNewer: true,
      droppedEntries: 2,
    });
  });

  test("an after page keeps the oldest entries and moves the newer cursor", () => {
    const entries = [entry(5, 1000), entry(6, 1000), entry(7, 1000), entry(8, 1000)];
    const perEntry = measureJsonBytes(entries[0]);
    const result = budgetTimelinePage({
      direction: "after",
      entries,
      startSeq: 5,
      endSeq: 8,
      hasOlder: true,
      hasNewer: false,
      maxBytes: perEntry * 3 + 10,
    });
    expect(result.entries.map((e) => e.seqStart)).toEqual([5, 6, 7]);
    expect(result).toMatchObject({
      startSeq: 5,
      endSeq: 7,
      hasOlder: true,
      hasNewer: true,
      droppedEntries: 1,
    });
  });

  test("an after page never advances the cursor past a dropped wide entry", () => {
    const entries: Entry[] = [
      { seqStart: 1, seqEnd: 6, text: "x".repeat(1000) },
      { seqStart: 3, seqEnd: 3, text: "x".repeat(1000) },
    ];
    const perEntry = measureJsonBytes(entries[0]);
    const result = budgetTimelinePage({
      direction: "after",
      entries,
      startSeq: 1,
      endSeq: 6,
      hasOlder: false,
      hasNewer: false,
      maxBytes: perEntry + 10,
    });
    expect(result.entries.map((e) => e.seqStart)).toEqual([1]);
    expect(result.endSeq).toBe(2);
    expect(result.hasNewer).toBe(true);
  });

  test("a single entry above the budget is shrunk rather than dropped", () => {
    const huge = entry(1, 50_000);
    const result = budgetTimelinePage({
      direction: "tail",
      entries: [huge],
      startSeq: 1,
      endSeq: 1,
      hasOlder: false,
      hasNewer: false,
      maxBytes: 5_000,
      shrinkEntry: (value) => ({
        ...value,
        text: `${value.text.slice(0, 1_000)}\n[truncated by daemon: 49000 characters omitted]`,
      }),
    });
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.text.startsWith("x".repeat(1_000))).toBe(true);
    expect(result.entries[0]?.text).toContain("[truncated by daemon: 49000 characters omitted]");
    expect(result).toMatchObject({
      droppedEntries: 0,
      truncatedEntries: 1,
      startSeq: 1,
      endSeq: 1,
    });
    expect(huge.text).toHaveLength(50_000);
  });

  test("rejects an entry that cannot fit instead of returning an oversized page", () => {
    const entries = [entry(1, 100), entry(2, 100)];
    expect(() =>
      budgetTimelinePage({
        direction: "after",
        entries,
        startSeq: 1,
        endSeq: 2,
        hasOlder: false,
        hasNewer: false,
        maxBytes: 1,
        shrinkEntry: (value) => value,
      }),
    ).toThrow("exceeds the page byte budget");
  });
});
