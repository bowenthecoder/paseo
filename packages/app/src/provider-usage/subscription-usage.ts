import { z } from "zod";
import { ProviderUsageBalanceSchema, ProviderUsageWindowSchema } from "@getpaseo/protocol/messages";
import type { ProviderUsage } from "./types";

// The optional subscriptions plugin owns per-account credentials and rate-limit backoff.
// Never substitute the built-in account's usage for a named subscription.
const subscriptionResponse = z.object({
  slots: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      providerIds: z.array(z.string().min(1)).optional(),
      usage: z.object({
        status: z.enum(["available", "needs_signin", "unavailable", "error"]),
        planLabel: z.string().optional(),
        windows: z.array(ProviderUsageWindowSchema),
        balances: z.array(ProviderUsageBalanceSchema).optional(),
        fetchedAt: z.string(),
        error: z.string().optional(),
        stale: z.boolean().optional(),
        staleSince: z.string().optional(),
        note: z.string().optional(),
      }),
    }),
  ),
});

export function parseSubscriptionUsage(input: unknown): ProviderUsage[] {
  const slots = subscriptionResponse.parse(input).slots;
  // Modern plugins resolve aliases against the host's credential homes. An empty
  // mapping is authoritative; older plugins can only identify their explicit slot.
  const providerOwners = new Map<string, number>();
  for (const slot of slots) {
    for (const providerId of new Set(slot.providerIds ?? [slot.id])) {
      providerOwners.set(providerId, (providerOwners.get(providerId) ?? 0) + 1);
    }
  }
  return slots.flatMap(({ id, label, usage, providerIds }) =>
    [...new Set(providerIds ?? [id])]
      .filter((providerId) => providerOwners.get(providerId) === 1)
      .map((providerId) => ({
        providerId,
        displayName: label,
        status: usage.status === "needs_signin" ? "unavailable" : usage.status,
        planLabel: usage.planLabel ?? null,
        windows: usage.windows,
        balances: usage.balances,
        fetchedAt: usage.stale ? (usage.staleSince ?? usage.fetchedAt) : usage.fetchedAt,
        sourceLabel: usage.stale
          ? (usage.note ?? "Cached usage · provider rate limited")
          : (usage.note ?? numericQuotaNote(usage.windows, usage.balances)),
        error:
          usage.status === "needs_signin" ? "Relink this account in Subscriptions" : usage.error,
      })),
  );
}

export function subscriptionSlotId(
  providerId: string,
  usages?: readonly Pick<ProviderUsage, "providerId">[],
): string | null {
  const id = providerId.split("/")[0];
  if (usages?.some((usage) => usage.providerId === id)) return id;
  if (id === "claude" || id === "codex") return id;
  if (id === "grok" || /^(claude|codex)-[ab]$/.test(id)) return id;
  return null;
}

function numericQuotaNote(
  windows: ProviderUsage["windows"],
  balances: ProviderUsage["balances"],
): string | null {
  const numeric =
    windows.some((window) => window.usedPct != null || window.remainingPct != null) ||
    balances?.some((balance) => balance.remaining != null || balance.used != null);
  return numeric ? null : "Provider has not reported a numeric quota";
}
