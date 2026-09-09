import { describe, expect, it } from "vitest";
import { en } from "@/i18n/resources/en";
import type { OverviewSummary } from "./model";
import { buildOverviewDiffText, buildOverviewSummaryText } from "./summary-text";

function translate(key: string, options: Record<string, unknown> = {}): string {
  const value = key
    .split(".")
    .reduce<unknown>((node, segment) => (node as Record<string, unknown>)?.[segment], en);
  if (typeof value !== "string") throw new Error(`Missing string ${key}`);
  return value.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(options[name]));
}

function summary(overrides: Partial<OverviewSummary> = {}): OverviewSummary {
  const none = { total: 0, failed: 0 };
  return {
    edits: none,
    creates: none,
    commands: none,
    reads: none,
    searches: none,
    agents: none,
    others: none,
    paseoCalls: none,
    editedFileCount: 0,
    createdFileCount: 0,
    readFileCount: 0,
    readFileNames: [],
    commandCount: 0,
    searchCount: 0,
    agentCount: 0,
    otherToolCount: 0,
    paseoCallCount: 0,
    failedToolCount: 0,
    canceledToolCount: 0,
    runningToolCount: 0,
    additions: 0,
    deletions: 0,
    ...overrides,
  };
}

describe("overview summary text", () => {
  it("reads like the Claude Code app: commands and a named file", () => {
    expect(
      buildOverviewSummaryText(
        summary({
          commands: { total: 4, failed: 0 },
          reads: { total: 1, failed: 0 },
          readFileCount: 1,
          readFileNames: ["bb5hlxzmr.txt"],
        }),
        translate,
      ),
    ).toBe("Ran 4 commands, read bb5hlxzmr.txt");
  });

  it("keeps failures inside their category and counts edits, creates and diff lines", () => {
    const value = summary({
      reads: { total: 5, failed: 0 },
      readFileCount: 5,
      readFileNames: ["a", "b", "c", "d", "e"],
      edits: { total: 5, failed: 1 },
      editedFileCount: 4,
      creates: { total: 1, failed: 0 },
      createdFileCount: 1,
      commands: { total: 3, failed: 0 },
      failedToolCount: 1,
      additions: 44,
      deletions: 100,
    });
    expect(buildOverviewSummaryText(value, translate)).toBe(
      "Edited 4 files (1 failed), created a file, ran 3 commands, read 5 files",
    );
    expect(buildOverviewDiffText(value)).toBe("+44 -100");
  });

  it("counts subagent launches on their own instead of as other tools", () => {
    expect(
      buildOverviewSummaryText(
        summary({ agents: { total: 12, failed: 0 }, agentCount: 12 }),
        translate,
      ),
    ).toBe("Launched 12 subagents");
    expect(
      buildOverviewSummaryText(
        summary({
          commands: { total: 1, failed: 0 },
          commandCount: 1,
          agents: { total: 1, failed: 1 },
          agentCount: 1,
          failedToolCount: 1,
        }),
        translate,
      ),
    ).toBe("Ran 1 command, launched a subagent (1 failed)");
  });

  it("names only failures when nothing succeeded, and appends canceled and running work", () => {
    expect(
      buildOverviewSummaryText(
        summary({ commands: { total: 2, failed: 2 }, failedToolCount: 2 }),
        translate,
      ),
    ).toBe("Ran 2 commands (2 failed)");
    expect(
      buildOverviewSummaryText(
        summary({ others: { total: 1, failed: 1 }, failedToolCount: 1 }),
        translate,
      ),
    ).toBe("Used 1 tool (1 failed)");
    expect(
      buildOverviewSummaryText(
        summary({
          reads: { total: 1, failed: 0 },
          readFileCount: 1,
          readFileNames: ["notes.md"],
          canceledToolCount: 1,
          runningToolCount: 2,
        }),
        translate,
      ),
    ).toBe("Read notes.md, 1 tool canceled, 2 tools running");
    expect(buildOverviewDiffText(summary())).toBeUndefined();
  });
});
