import { describe, expect, it } from "vitest";
import { formatShortUsage } from "./short-usage";
import type { ProviderUsage, ProviderUsageWindow } from "./types";

function usage(overrides: Partial<ProviderUsage>): ProviderUsage {
  return {
    providerId: "claude-a",
    displayName: "Claude 1",
    status: "available",
    planLabel: "Max",
    windows: [],
    ...overrides,
  };
}

function window(
  id: string,
  label: string,
  usedPct: number | null,
  extra: Partial<ProviderUsageWindow> = {},
): ProviderUsageWindow {
  return { id, label, usedPct, ...extra };
}

describe("the model picker's short usage label", () => {
  it("shows Claude's session and weekly windows and ignores its model-scoped limit", () => {
    expect(
      formatShortUsage(
        usage({
          windows: [
            window("five_hour", "Session", 18),
            window("weekly", "Weekly", 55),
            window("weekly_fable", "Weekly · Fable", 92),
          ],
        }),
      ),
    ).toBe("18% · 55% wk");
  });

  it("reads a spent scoped limit as usable, because it only stops that model", () => {
    expect(
      formatShortUsage(
        usage({
          windows: [window("weekly", "Weekly", 40), window("weekly_fable", "Weekly · Fable", 100)],
        }),
      ),
    ).toBe("40% wk");
  });

  it("names Codex's duration window and reports a spent one as out", () => {
    expect(
      formatShortUsage(
        usage({ providerId: "codex-a", windows: [window("session", "5-hour", 73)] }),
      ),
    ).toBe("73% 5h");
    expect(
      formatShortUsage(
        usage({ providerId: "codex-a", windows: [window("session", "5-hour", 100)] }),
      ),
    ).toBe("out");
  });

  it("shows Grok's weekly window on its own", () => {
    expect(
      formatShortUsage(usage({ providerId: "grok", windows: [window("weekly", "Weekly", 6)] })),
    ).toBe("6% wk");
  });

  it("derives the used share from a provider that only reports what is left", () => {
    expect(
      formatShortUsage(
        usage({ windows: [window("monthly", "Monthly", null, { remainingPct: 30 })] }),
      ),
    ).toBe("70% mo");
  });

  it("asks for a sign-in, a retry, or nothing it cannot measure", () => {
    expect(formatShortUsage(usage({ status: "unavailable", windows: [] }))).toBe("sign in");
    expect(formatShortUsage(usage({ status: "error", error: "boom", windows: [] }))).toBe("?");
    expect(formatShortUsage(usage({ windows: [] }))).toBe("?");
    expect(formatShortUsage(usage({ windows: [window("session", "Session", null)] }))).toBe("?");
  });

  it("stays short enough to sit next to the account's name", () => {
    const longest = formatShortUsage(
      usage({ windows: [window("session", "5-hour", 99), window("weekly", "7-day", 99)] }),
    );
    expect(longest).toBe("99% 5h · 99% 7d");
    expect(longest.length).toBeLessThanOrEqual(18);
  });
});
