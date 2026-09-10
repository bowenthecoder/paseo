/** Muse Spark 1.3 Contributor list prices, USD per 1M tokens. */
export const MUSE_CONTRIBUTOR_INPUT_PER_MILLION = 0.1;
export const MUSE_CONTRIBUTOR_CACHED_INPUT_PER_MILLION = 0.002;
export const MUSE_CONTRIBUTOR_OUTPUT_PER_MILLION = 0.2;

export interface MuseContributorUsage {
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
}

/**
 * USD for a Muse Contributor turn from observed token counts.
 * Cached tokens are billed at the cache rate and removed from uncached input.
 */
export function museContributorCostUsd(parts: MuseContributorUsage): number | undefined {
  const hasAny =
    parts.inputTokens != null || parts.cachedInputTokens != null || parts.outputTokens != null;
  if (!hasAny) return undefined;
  const input = finiteOrZero(parts.inputTokens);
  const cached = finiteOrZero(parts.cachedInputTokens);
  const output = finiteOrZero(parts.outputTokens);
  const uncached = Math.max(0, input - cached);
  return (
    (uncached * MUSE_CONTRIBUTOR_INPUT_PER_MILLION +
      cached * MUSE_CONTRIBUTOR_CACHED_INPUT_PER_MILLION +
      output * MUSE_CONTRIBUTOR_OUTPUT_PER_MILLION) /
    1_000_000
  );
}

function finiteOrZero(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
