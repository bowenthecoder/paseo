import { describe, expect, it } from "vitest";
import { createTestLogger } from "../../test-utils/test-logger.js";
import { ClaudeQuotaProvider } from "./providers/claude.js";
import { CodexQuotaProvider } from "./providers/codex.js";

const logger = createTestLogger();

async function claudeUsage(value: unknown) {
  return new ClaudeQuotaProvider({
    logger,
    claudeHome: "/synthetic/claude",
    credentialFileReader: async () => ({ claudeAiOauth: { accessToken: "synthetic-claude" } }),
    claudeKeychainReader: async () => null,
    fetch: async () =>
      new Response(
        JSON.stringify({
          five_hour: { utilization: value },
          seven_day: { utilization: 34 },
          limits: [
            {
              kind: "weekly_scoped",
              percent: value,
              scope: { model: { id: "test", display_name: "Test" } },
            },
          ],
        }),
      ),
  }).fetchUsage();
}

async function codexUsage(balance: unknown) {
  return new CodexQuotaProvider({
    logger,
    codexHome: "/synthetic/codex",
    credentialFileReader: async () => ({ tokens: { access_token: "synthetic-codex" } }),
    fetch: async () =>
      new Response(
        JSON.stringify({
          rate_limit: { primary_window: { used_percent: 27, limit_window_seconds: 604800 } },
          credits: { balance },
        }),
      ),
  }).fetchUsage();
}

describe("unreported subscription metrics", () => {
  it.each([undefined, null, "", "  ", false, true, "invalid", "Infinity"])(
    "keeps Claude utilization %s unknown while retaining other reported quota",
    async (value) => {
      const usage = await claudeUsage(value);
      expect(usage.status).toBe("available");
      expect(
        usage.windows.map(({ id, usedPct, remainingPct, tone }) => ({
          id,
          usedPct,
          remainingPct,
          tone,
        })),
      ).toEqual([
        { id: "five_hour", usedPct: null, remainingPct: null, tone: "default" },
        { id: "weekly", usedPct: 34, remainingPct: 66, tone: "ok" },
        { id: "weekly_model_test", usedPct: null, remainingPct: null, tone: "default" },
      ]);
    },
  );

  it.each([undefined, null, "", "  ", false, true, "invalid", "Infinity"])(
    "does not turn unreported Codex credit %s into a zero balance or lose quota",
    async (value) => {
      const usage = await codexUsage(value);
      expect(usage.status).toBe("available");
      expect(usage.balances).toEqual([]);
      expect(usage.windows).toEqual([
        {
          id: "session",
          label: "Weekly",
          usedPct: 27,
          remainingPct: 73,
          resetsAt: null,
          tone: "ok",
        },
      ]);
    },
  );

  it.each([
    [0, 0],
    ["0", 0],
    [12.5, 12.5],
    ["12.5", 12.5],
  ])("preserves explicitly reported metric %s as %s", async (value, expected) => {
    const claude = await claudeUsage(value);
    expect(claude.windows[0].usedPct).toBe(expected);
    expect(claude.windows[2].usedPct).toBe(expected);
    const codex = await codexUsage(value);
    expect(codex.balances).toEqual([
      {
        id: "credits",
        label: "Credits",
        remaining: expected,
        unit: "usd",
        tone: expected === 0 ? "danger" : "ok",
      },
    ]);
  });
});
