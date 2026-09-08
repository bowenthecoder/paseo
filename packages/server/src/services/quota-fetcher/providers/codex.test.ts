import { describe, expect, it, vi } from "vitest";
import { createTestLogger } from "../../../test-utils/test-logger.js";
import { CodexQuotaProvider } from "./codex.js";

// Supply only the credential boundary; quota responses still pass through the real API parser.
vi.mock("node:fs", () => ({
  existsSync: () => true,
  promises: {
    readFile: async () => JSON.stringify({ tokens: { access_token: "quota-window-test" } }),
  },
}));

const RESET_AT = 1_749_072_000;

async function fetchUsage(rateLimit: object, extra: object = {}) {
  return new CodexQuotaProvider({
    logger: createTestLogger(),
    fetch: async () => new Response(JSON.stringify({ rate_limit: rateLimit, ...extra })),
  }).fetchUsage();
}

describe("Codex quota window labels", () => {
  it("labels a weekly primary window by its reported duration while retaining its ID and usage", async () => {
    const usage = await fetchUsage({
      primary_window: { used_percent: 42, reset_at: RESET_AT, limit_window_seconds: 604_800 },
      secondary_window: { used_percent: 8, reset_at: RESET_AT + 60, limit_window_seconds: 18_000 },
    });
    expect(usage.windows).toEqual([
      {
        id: "session",
        label: "Weekly",
        usedPct: 42,
        remainingPct: 58,
        resetsAt: new Date(RESET_AT * 1000).toISOString(),
        tone: "ok",
      },
      {
        id: "weekly",
        label: "5-hour",
        usedPct: 8,
        remainingPct: 92,
        resetsAt: new Date((RESET_AT + 60) * 1000).toISOString(),
        tone: "ok",
      },
    ]);
  });

  it.each([
    [86_400, "Daily"],
    [172_800, "2-day"],
    [7_200, "2-hour"],
    [900, "15-minute"],
    [90, "90-second"],
    ["604800", "Weekly"],
    [undefined, "Primary limit"],
    [null, "Primary limit"],
    [0, "Primary limit"],
    [-1, "Primary limit"],
    [1.5, "Primary limit"],
    ["unknown", "Primary limit"],
    [true, "Primary limit"],
    [false, "Primary limit"],
    ["", "Primary limit"],
    [" ", "Primary limit"],
  ])("duration %s uses %s without changing the quota", async (duration, label) => {
    const usage = await fetchUsage({
      primary_window: {
        used_percent: "92",
        reset_at: String(RESET_AT),
        limit_window_seconds: duration,
      },
    });
    expect(usage.windows).toEqual([
      {
        id: "session",
        label,
        usedPct: 92,
        remainingPct: 8,
        resetsAt: new Date(RESET_AT * 1000).toISOString(),
        tone: "danger",
      },
    ]);
  });

  it("keeps unknown primary and secondary windows neutral even with a distant reset", async () => {
    const usage = await fetchUsage(
      {
        primary_window: { used_percent: 12, reset_at: RESET_AT },
        secondary_window: { used_percent: 73, reset_at: RESET_AT + 604_800 },
      },
      {
        code_review_rate_limit: {
          primary_window: { used_percent: 4, reset_at: RESET_AT, limit_window_seconds: 604_800 },
        },
        credits: { balance: "3.5" },
      },
    );
    expect(usage.windows.map(({ id, label, usedPct }) => ({ id, label, usedPct }))).toEqual([
      { id: "session", label: "Primary limit", usedPct: 12 },
      { id: "weekly", label: "Secondary limit", usedPct: 73 },
      { id: "code_review", label: "Code review", usedPct: 4 },
    ]);
    expect(usage.balances).toEqual([
      { id: "credits", label: "Credits", remaining: 3.5, unit: "usd", tone: "ok" },
    ]);
  });

  it("keeps missing and null usage unknown across primary, secondary and code review windows", async () => {
    const usage = await fetchUsage(
      {
        primary_window: { limit_window_seconds: 604_800 },
        secondary_window: { used_percent: null, reset_at: null },
      },
      {
        code_review_rate_limit: { primary_window: {} },
      },
    );
    expect(usage.windows).toEqual([
      {
        id: "session",
        label: "Weekly",
        usedPct: null,
        remainingPct: null,
        resetsAt: null,
        tone: "default",
      },
      {
        id: "weekly",
        label: "Secondary limit",
        usedPct: null,
        remainingPct: null,
        resetsAt: null,
        tone: "default",
      },
      {
        id: "code_review",
        label: "Code review",
        usedPct: null,
        remainingPct: null,
        resetsAt: null,
        tone: "default",
      },
    ]);
  });

  it.each([true, false, "", " ", "not-a-number"])(
    "rejects malformed usage percentage %s",
    async (usedPercent) => {
      await expect(fetchUsage({ primary_window: { used_percent: usedPercent } })).rejects.toThrow();
    },
  );

  it.each([true, false, "", " ", "not-a-number"])(
    "rejects malformed reset metadata %s",
    async (resetAt) => {
      await expect(
        fetchUsage({ primary_window: { used_percent: 8, reset_at: resetAt } }),
      ).rejects.toThrow();
    },
  );

  it("preserves actual zero and fractional quota values while ignoring out-of-range reset dates", async () => {
    const usage = await fetchUsage({
      primary_window: { used_percent: "0", reset_at: 0 },
      secondary_window: { used_percent: "12.5", reset_at: 1e100 },
    });
    expect(usage.windows).toEqual([
      {
        id: "session",
        label: "Primary limit",
        usedPct: 0,
        remainingPct: 100,
        resetsAt: "1970-01-01T00:00:00.000Z",
        tone: "ok",
      },
      {
        id: "weekly",
        label: "Secondary limit",
        usedPct: 12.5,
        remainingPct: 87.5,
        resetsAt: null,
        tone: "ok",
      },
    ]);
  });
});
