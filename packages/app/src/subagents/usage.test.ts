import { describe, expect, it } from "vitest";
import { reportedSubagentContextTokens } from "./usage";

describe("reported subagent context tokens", () => {
  it("uses the provider's context reading without recombining input and cached usage", () => {
    expect(
      reportedSubagentContextTokens({
        contextWindowUsedTokens: 2280,
        inputTokens: 1200,
        outputTokens: 80,
        cachedInputTokens: 1000,
      }),
    ).toBe(2280);
  });

  it("leaves missing context telemetry unreported instead of guessing from input counters", () => {
    for (const usage of [
      undefined,
      { inputTokens: 1200 },
      { inputTokens: 1200, outputTokens: 80, cachedInputTokens: 1000 },
      { contextWindowUsedTokens: Number.NaN },
      { contextWindowUsedTokens: -1 },
    ]) {
      expect(reportedSubagentContextTokens(usage)).toBeNull();
    }
  });

  it("retains a reported zero instead of treating it as missing", () => {
    expect(reportedSubagentContextTokens({ contextWindowUsedTokens: 0 })).toBe(0);
  });
});
