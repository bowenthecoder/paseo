import { useMemo } from "react";
import { subscriptionSlotId } from "./subscription-usage";
import type { ProviderUsage } from "./types";
import { useRequestsSubscriptions, useSubscriptionUsage } from "./use-model-picker-usage";
import { useProviderUsage } from "./use-provider-usage";

/**
 * Usage for every account the picker lists, keyed by picker provider id. It reads the
 * two queries the picker footer already uses, so showing numbers on every row costs no
 * extra lookup. Providers the host has no numbers for are absent rather than empty.
 *
 * `providerIds` must be stable across renders; pass a memoized array.
 */
export function useModelPickerUsageMap(
  serverId: string | null,
  providerIds: readonly string[],
  enabled: boolean,
): Map<string, ProviderUsage> {
  const requestsSubscriptions = useRequestsSubscriptions(serverId, providerIds);
  const { query } = useSubscriptionUsage(serverId, { enabled, requestsSubscriptions });
  const slots = query.data;
  const slotIds = useMemo(() => {
    const resolved = new Map<string, string | null>();
    for (const providerId of providerIds) {
      resolved.set(
        providerId,
        requestsSubscriptions ? subscriptionSlotId(providerId, slots) : null,
      );
    }
    return resolved;
  }, [providerIds, requestsSubscriptions, slots]);
  // Ask the host for its own numbers only once the plugin has answered and named no
  // account for a row. Until then every id may still belong to one, and the built-in
  // account's usage must never stand in for a named subscription.
  const hasUnmappedProvider =
    !requestsSubscriptions ||
    (slots !== undefined && providerIds.some((providerId) => slotIds.get(providerId) === null));
  const builtin = useProviderUsage(serverId, { enabled: enabled && hasUnmappedProvider });
  const builtinView = builtin.view;
  const native = builtinView.kind === "ready" ? builtinView.payload.providers : undefined;

  return useMemo(() => {
    const usageById = new Map<string, ProviderUsage>();
    for (const providerId of providerIds) {
      const slotId = slotIds.get(providerId) ?? null;
      if (slotId !== null || (requestsSubscriptions && !slots)) {
        const slot = slots?.find((usage) => usage.providerId === slotId);
        if (slot) usageById.set(providerId, { ...slot, providerId });
        continue;
      }
      const usage = native?.find((entry) => entry.providerId === providerId);
      if (usage) usageById.set(providerId, usage);
    }
    return usageById;
  }, [native, providerIds, requestsSubscriptions, slotIds, slots]);
}
