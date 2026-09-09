import { formatPct } from "./format";
import type { ProviderUsage, ProviderUsageWindow } from "./types";

type LimitWindowKind = "session" | "period";

interface LimitWindow {
  kind: LimitWindowKind;
  usedPct: number;
  label: string;
}

/**
 * Which windows decide whether the account can take work. Claude's scoped weekly
 * limits (`weekly_fable`, "Weekly · Fable") are excluded on purpose: an exhausted
 * model scope stops that model, not the account. Identity comes from the id or the
 * label because Claude reports its session window as `five_hour`/"Session" while
 * Codex puts "5-hour" and "7-day" labels on the `session` and `weekly` ids.
 */
function limitWindowKind(window: ProviderUsageWindow): LimitWindowKind | null {
  if (window.id === "session" || window.label === "Session") return "session";
  if (window.id === "weekly" || window.label === "Weekly") return "period";
  if (window.id === "monthly" || window.label === "Monthly") return "period";
  return null;
}

function usedPctOf(window: ProviderUsageWindow): number | null {
  if (typeof window.usedPct === "number") return window.usedPct;
  if (typeof window.remainingPct === "number") return 100 - window.remainingPct;
  return null;
}

/** Codex can put any duration in either window position, so the label names the period. */
function windowSuffix(label: string): string {
  if (label === "Weekly") return " wk";
  if (label === "Monthly") return " mo";
  if (label === "Daily") return " 1d";
  const duration = /^(\d+)-(day|hour|minute|second)$/.exec(label);
  return duration ? ` ${duration[1]}${duration[2].charAt(0)}` : "";
}

function limitWindows(usage: ProviderUsage): LimitWindow[] {
  const limits: LimitWindow[] = [];
  for (const window of usage.windows) {
    const kind = limitWindowKind(window);
    const usedPct = usedPctOf(window);
    if (kind && usedPct !== null) limits.push({ kind, usedPct, label: window.label });
  }
  return limits;
}

function formatLimit(limit: LimitWindow): string {
  return `${formatPct(limit.usedPct)}${windowSuffix(limit.label)}`;
}

/**
 * The state a model-picker row shows after an account's label — `18% · 55% wk`,
 * `73% 5h`, `out`, `sign in`, `?` — without the label itself. The wording matches
 * the Subscriptions plugin's composer pill so one account reads the same in both
 * places, and it stays under 18 characters so the row keeps its name.
 */
export function formatShortUsage(usage: ProviderUsage): string {
  if (usage.status === "unavailable") return "sign in";
  if (usage.status === "error") return "?";
  const limits = limitWindows(usage);
  if (limits.length === 0) return "?";
  if (limits.some((limit) => limit.usedPct >= 100)) return "out";
  const session = limits.find((limit) => limit.kind === "session");
  const period = limits.find((limit) => limit.kind === "period");
  const parts: string[] = [];
  if (session) parts.push(formatLimit(session));
  if (period) parts.push(formatLimit(period));
  return parts.join(" · ");
}
