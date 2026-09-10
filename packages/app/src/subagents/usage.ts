import type { AgentUsage } from "@getpaseo/protocol/agent-types";

/** Providers normalize context usage; raw input/cache counters have different accounting. */
export function reportedSubagentContextTokens(usage: AgentUsage | undefined): number | null {
  const tokens = usage?.contextWindowUsedTokens;
  return typeof tokens === "number" && Number.isFinite(tokens) && tokens >= 0 ? tokens : null;
}
