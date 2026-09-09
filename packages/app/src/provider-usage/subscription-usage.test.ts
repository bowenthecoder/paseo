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
  it("selects a custom alias only when the host maps it to an account", () => {
    const result = parseSubscriptionUsage({
      slots: [
        { ...slot("codex-a", 91), providerIds: ["codex"] },
        { ...slot("codex-b", 12), providerIds: ["work-codex"] },
      ],
    });
    const providerId = subscriptionSlotId("work-codex/gpt-model", result);
    expect(providerId).toBe("work-codex");
    expect(result.find((usage) => usage.providerId === providerId)?.windows[0].usedPct).toBe(12);
    expect(subscriptionSlotId("other-codex", result)).toBeNull();
    expect(subscriptionSlotId("work-codex", [])).toBeNull();
    expect(subscriptionSlotId("work-codex")).toBeNull();
  });

  it("uses the host's explicit account mapping for built-in providers", () => {
    const result = parseSubscriptionUsage({
      slots: [
        { ...slot("codex-a", 100), providerIds: ["codex-a"] },
        { ...slot("codex-b", 12), providerIds: ["codex-b", "codex"] },
      ],
    });
    expect(result.map((entry) => [entry.providerId, entry.windows[0].usedPct])).toEqual([
      ["codex-a", 100],
      ["codex-b", 12],
      ["codex", 12],
    ]);
  });
  it("does not expose an unlinked slot as its similarly named provider", () => {
    expect(
      parseSubscriptionUsage({
        slots: [{ ...slot("claude-a", 40), providerIds: [] }],
      }),
    ).toEqual([]);
  });
  it("omits ambiguous provider mappings rather than choosing an account", () => {
    const result = parseSubscriptionUsage({
      slots: [
        { ...slot("claude-a", 90), providerIds: ["claude-a", "claude"] },
        { ...slot("claude-b", 10), providerIds: ["claude-b", "claude"] },
      ],
    });
    expect(result.map((entry) => entry.providerId)).toEqual(["claude-a", "claude-b"]);
  });
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
    ["claude", "claude-b", "codex", "codex-b", "grok", "unknown"].map((id) =>
      subscriptionSlotId(id),
    ),
  ).toEqual(["claude", "claude-b", "codex", "codex-b", "grok", null]);
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
