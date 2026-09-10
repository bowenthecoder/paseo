import { describe, expect, test } from "vitest";
import { museContributorCostUsd, withMuseContributorCost } from "./muse-contributor-cost.js";

describe("museContributorCostUsd", () => {
  test("uses Contributor list rates and does not double-count cache", () => {
    expect(
      museContributorCostUsd({
        inputTokens: 1_000_000,
        cachedInputTokens: 400_000,
        outputTokens: 1_000_000,
      }),
    ).toBe(0.2608);
  });

  test("omits cost when no token field was reported", () => {
    expect(museContributorCostUsd({})).toBeUndefined();
  });

  test("treats a reported zero as a real measurement", () => {
    expect(museContributorCostUsd({ inputTokens: 0, outputTokens: 0 })).toBe(0);
  });
});

describe("withMuseContributorCost", () => {
  test("fills totalCostUsd for the Muse provider id", () => {
    expect(
      withMuseContributorCost("muse", {
        inputTokens: 1_000_000,
        cachedInputTokens: 400_000,
        outputTokens: 1_000_000,
      }),
    ).toEqual({
      inputTokens: 1_000_000,
      cachedInputTokens: 400_000,
      outputTokens: 1_000_000,
      totalCostUsd: 0.2608,
    });
  });

  test("leaves ACP transport-family usage unpriced", () => {
    const usage = { inputTokens: 1_000_000, outputTokens: 1_000_000 };
    expect(withMuseContributorCost("acp", usage)).toEqual(usage);
  });
});
