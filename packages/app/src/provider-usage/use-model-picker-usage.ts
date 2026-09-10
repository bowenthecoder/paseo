import type { UseQueryResult } from "@tanstack/react-query";
import { useInstalledPlugin } from "@/plugins/registry";
import { subscriptionSlotId } from "./subscription-usage";
import { parseSubscriptionUsage } from "./subscription-usage";
import { useFetchQuery } from "@/data/query";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import type { ProviderUsage, ProviderUsageView } from "./types";
import { useProviderUsage } from "./use-provider-usage";
import { subscriptionUsageQueryKey } from "./query-cache";

interface SubscriptionUsageSource {
  canFetch: boolean;
  query: UseQueryResult<ProviderUsage[], Error>;
}

/**
 * Whether the picker reads these providers' numbers from the Subscriptions plugin.
 * The host maps custom IDs to accounts; their names cannot tell us whether they match.
 */
export function useRequestsSubscriptions(
  serverId: string | null,
  providerIds: readonly string[],
): boolean {
  const plugin = useInstalledPlugin(serverId ?? "", "subscriptions");
  return plugin !== null || providerIds.some((id) => /^(claude|codex)-[ab]$/.test(id));
}

/**
 * The plugin's account list. Every model-picker usage reader shares one query key,
 * so a picker with five accounts still performs one account lookup per interval.
 */
export function useSubscriptionUsage(
  serverId: string | null,
  input: { enabled: boolean; requestsSubscriptions: boolean },
): SubscriptionUsageSource {
  const client = useHostRuntimeClient(serverId ?? "");
  const connected = useHostRuntimeIsConnected(serverId ?? "");
  const canFetch = Boolean(client && connected && serverId);
  const queryEnabled = input.enabled && input.requestsSubscriptions && canFetch;
  const query = useFetchQuery({
    dataShape: "value",
    queryKey: subscriptionUsageQueryKey(serverId),
    enabled: queryEnabled,
    queryFn: async () => {
      if (!client) throw new Error("Connect to this host to see account usage");
      return parseSubscriptionUsage(
        await client.invokePluginRpc("subscriptions", "subscriptions.list", {}),
      );
    },
    staleTimeMs: 120_000,
    refetchInterval: queryEnabled ? 120_000 : false,
    retry: false,
  });
  return { canFetch, query };
}

export function useModelPickerUsage(serverId: string | null, providerId: string, enabled: boolean) {
  const requestsSubscriptions = useRequestsSubscriptions(serverId, [providerId]);
  const { canFetch, query } = useSubscriptionUsage(serverId, { enabled, requestsSubscriptions });
  const slotId = subscriptionSlotId(providerId, query.data);
  const isSubscription = requestsSubscriptions && slotId !== null;
  // A failed first lookup has not ruled out a custom account mapping. Keep its
  // error and Refresh action on the plugin query until a response resolves it.
  const unresolvedSubscription = requestsSubscriptions && !query.data;
  const usesSubscriptionView = isSubscription || unresolvedSubscription;
  const builtin = useProviderUsage(serverId, {
    enabled: enabled && !usesSubscriptionView,
  });
  if (!usesSubscriptionView) return builtin;
  let view: ProviderUsageView = { kind: "loading" };
  if (!canFetch) {
    view = { kind: "error", message: "Connect to this host to see account usage" };
  } else if (query.isError) {
    view = {
      kind: "error",
      message: "Account usage unavailable. Check the Subscriptions extension on this host.",
    };
  } else if (query.data) {
    view = query.data.some((usage) => usage.providerId === slotId)
      ? {
          kind: "ready",
          isRefreshing: query.isFetching,
          payload: {
            requestId: "subscriptions",
            fetchedAt: new Date(query.dataUpdatedAt).toISOString(),
            providers: query.data.map((usage) =>
              usage.providerId === slotId ? { ...usage, providerId } : usage,
            ),
          },
        }
      : {
          kind: "error",
          message: "This provider is not linked to a Subscriptions account on this host.",
        };
  }
  return {
    view,
    canFetch,
    refresh: async () => {
      await query.refetch({ throwOnError: true });
    },
  };
}
