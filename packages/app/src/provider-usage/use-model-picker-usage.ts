import { useInstalledPlugin } from "@/plugins/registry";
import { subscriptionSlotId } from "./subscription-usage";
import { parseSubscriptionUsage } from "./subscription-usage";
import { useFetchQuery } from "@/data/query";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import type { ProviderUsageView } from "./types";
import { useProviderUsage } from "./use-provider-usage";

export function useModelPickerUsage(serverId: string | null, providerId: string, enabled: boolean) {
  const plugin = useInstalledPlugin(serverId ?? "", "subscriptions");
  const slotId = subscriptionSlotId(providerId);
  const isSubscription =
    slotId !== null && (plugin !== null || /^(claude|codex)-[ab]$/.test(providerId));
  const builtin = useProviderUsage(serverId, { enabled: enabled && !isSubscription });
  const client = useHostRuntimeClient(serverId ?? "");
  const connected = useHostRuntimeIsConnected(serverId ?? "");
  const canFetch = Boolean(client && connected && serverId);
  const query = useFetchQuery({
    dataShape: "value",
    queryKey: ["model-picker-subscriptions", serverId],
    enabled: enabled && isSubscription && canFetch,
    queryFn: async () => {
      if (!client) throw new Error("Connect to this host to see account usage");
      return parseSubscriptionUsage(
        await client.invokePluginRpc("subscriptions", "subscriptions.list", {}),
      );
    },
    staleTimeMs: 120_000,
    refetchInterval: enabled && isSubscription && canFetch ? 120_000 : false,
    retry: false,
  });
  if (!isSubscription) return builtin;
  let view: ProviderUsageView = { kind: "loading" };
  if (!canFetch) {
    view = { kind: "error", message: "Connect to this host to see account usage" };
  } else if (query.isError) {
    view = {
      kind: "error",
      message: "Account usage unavailable. Check the Subscriptions extension on this host.",
    };
  } else if (query.data) {
    view = {
      kind: "ready",
      isRefreshing: query.isFetching,
      payload: {
        requestId: "subscriptions",
        fetchedAt: new Date(query.dataUpdatedAt).toISOString(),
        providers: query.data.map((usage) =>
          usage.providerId === slotId ? { ...usage, providerId } : usage,
        ),
      },
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
