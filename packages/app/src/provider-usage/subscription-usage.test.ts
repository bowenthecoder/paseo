import { describe, expect, it } from "vitest";
import { parseSubscriptionUsage, subscriptionSlotId } from "./subscription-usage";

function slot(id: string, usedPct: number | null, overrides = {}) {
  return {
    id,
    label: id,
    usage: {
      status: "available",
      windows: [{ id: "session", label: "Session", usedPct }],
      fetchedAt: "2026-09-08T12:00:00Z",
      ...overrides,
    },
  };
}

describe("subscription usage in the model picker", () => {
  it("keeps the two accounts' quotas separate", () => {
    const result = parseSubscriptionUsage({ slots: [slot("codex-a", 100), slot("codex-b", 12)] });
    expect(result.map((entry) => [entry.providerId, entry.windows[0].usedPct])).toEqual([
      ["codex-a", 100],
      ["codex-b", 12],
    ]);
    expect(result.find((entry) => entry.providerId === "codex")).toBeUndefined();
  });
  it("labels rate-limited cached data with its original timestamp", () => {
    const [usage] = parseSubscriptionUsage({
      slots: [
        slot("claude-b", 62, {
          stale: true,
          staleSince: "2026-09-08T10:00:00Z",
        }),
      ],
    });
    expect(usage.fetchedAt).toBe("2026-09-08T10:00:00Z");
    expect(usage.sourceLabel).toContain("Cached usage");
  });
  it("shows expired sign-in as unavailable", () => {
    const [usage] = parseSubscriptionUsage({
      slots: [slot("claude-a", 0, { status: "needs_signin" })],
    });
    expect(usage.status).toBe("unavailable");
    expect(usage.error).toContain("Relink");
  });
  it("rejects malformed usage responses", () => {
    expect(() =>
      parseSubscriptionUsage({ slots: [{ id: "codex-a", usage: { windows: "bad" } }] }),
    ).toThrow();
  });
});

it("matches Claude, Codex and Grok registration aliases without mixing sibling accounts", () => {
  expect(
    ["claude", "claude-b", "codex", "codex-b", "grok", "unknown"].map(subscriptionSlotId),
  ).toEqual(["claude-a", "claude-b", "codex-a", "codex-b", "grok", null]);
});
it("keeps Grok credit balances and explains missing numeric quotas", () => {
  const [credits] = parseSubscriptionUsage({
    slots: [
      slot("grok", null, {
        balances: [{ id: "credits", label: "Credits", unit: "credits", remaining: 75 }],
      }),
    ],
  });
  expect(credits.balances?.[0].remaining).toBe(75);
  const [unknown] = parseSubscriptionUsage({ slots: [slot("grok", null)] });
  expect(unknown.windows[0].usedPct).toBeNull();
  expect(unknown.sourceLabel).toContain("not reported a numeric quota");
});
