import { describe, expect, test } from "vitest";
import {
  budgetTimelinePage,
  measureJsonBytes,
  truncateLongStrings,
} from "./timeline-page-budget.js";

interface Entry {
  seqStart: number;
  seqEnd: number;
  text: string;
}

function entry(seq: number, chars: number): Entry {
  return { seqStart: seq, seqEnd: seq, text: "x".repeat(chars) };
}

describe("budgetTimelinePage", () => {
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
    expect(result.entries).toBe(entries === result.entries ? entries : result.entries);
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
      maxStringChars: 1_000,
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

  test("the page always carries at least one entry even when it stays oversized", () => {
    const entries = [entry(1, 100), entry(2, 100)];
    const result = budgetTimelinePage({
      direction: "after",
      entries,
      startSeq: 1,
      endSeq: 2,
      hasOlder: false,
      hasNewer: false,
      maxBytes: 1,
      maxStringChars: 50,
    });
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.seqStart).toBe(1);
    expect(result).toMatchObject({ endSeq: 1, hasNewer: true, droppedEntries: 1 });
  });
});

describe("truncateLongStrings", () => {
  test("returns the same reference when nothing is long", () => {
    const value = { a: "short", b: ["x", { c: "y" }], d: 5, e: null };
    const result = truncateLongStrings(value, 10);
    expect(result.truncated).toBe(false);
    expect(result.value).toBe(value);
  });

  test("cuts nested strings without mutating the input", () => {
    const value = { a: "x".repeat(20), b: [{ c: "y".repeat(20) }, "ok"] };
    const result = truncateLongStrings(value, 5);
    expect(result.truncated).toBe(true);
    expect(result.value.a).toBe("xxxxx\n[truncated by daemon: 15 characters omitted]");
    expect((result.value.b[0] as { c: string }).c.startsWith("yyyyy\n[truncated")).toBe(true);
    expect(result.value.b[1]).toBe("ok");
    expect(value.a).toHaveLength(20);
  });
});
