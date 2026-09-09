import type { QueryClient } from "@tanstack/react-query";
import { parseSubscriptionUsage } from "./subscription-usage";

interface UsageRequestGeneration {
  epoch: number;
  sequence: number;
}

export interface SubscriptionUsageRequest extends UsageRequestGeneration {
  serverId: string;
}

const generations = new WeakMap<QueryClient, Map<string, UsageRequestGeneration>>();

function requestGeneration(client: QueryClient, serverId: string): UsageRequestGeneration {
  let hosts = generations.get(client);
  if (!hosts) {
    hosts = new Map();
    generations.set(client, hosts);
  }
  let generation = hosts.get(serverId);
  if (!generation) {
    generation = { epoch: 0, sequence: 0 };
    hosts.set(serverId, generation);
  }
  return generation;
}

/** Standalone plugin RPCs need identity and ordering guards before the request starts. */
export function beginSubscriptionUsageRequest(input: {
  queryClient: QueryClient;
  serverId: string;
  pluginId: string;
  method: string;
}): SubscriptionUsageRequest | null {
  if (input.pluginId !== "subscriptions" || input.method !== "subscriptions.list") return null;
  const generation = requestGeneration(input.queryClient, input.serverId);
  generation.sequence += 1;
  return { serverId: input.serverId, ...generation };
}

function isCurrentRequest(
  client: QueryClient,
  serverId: string,
  request: SubscriptionUsageRequest | null,
): boolean {
  if (!request || request.serverId !== serverId) return false;
  const current = requestGeneration(client, serverId);
  return request.epoch === current.epoch && request.sequence === current.sequence;
}

export function providerUsageQueryKey(serverId: string | null | undefined) {
  return ["providerUsage", serverId ?? ""] as const;
}

export function subscriptionUsageQueryKey(serverId: string | null | undefined) {
  return ["model-picker-subscriptions", serverId ?? ""] as const;
}

/** Changing account identity must remove old numbers while its replacement loads. */
export function resetProviderUsageQueries(client: QueryClient, serverId: string) {
  requestGeneration(client, serverId).epoch += 1;
  return Promise.all([
    client.resetQueries({ queryKey: providerUsageQueryKey(serverId), exact: true }),
    client.resetQueries({ queryKey: subscriptionUsageQueryKey(serverId), exact: true }),
  ]);
}

export async function applySubscriptionUsageRpcResult(input: {
  queryClient: QueryClient;
  serverId: string;
  pluginId: string;
  method: string;
  output: unknown;
  request: SubscriptionUsageRequest | null;
}) {
  if (input.pluginId !== "subscriptions") return;
  if (
    input.method === "subscriptions.login-status" &&
    typeof input.output === "object" &&
    input.output !== null &&
    "state" in input.output &&
    input.output.state === "done"
  ) {
    // Reset synchronously, without delaying the login UI for a provider network read.
    void resetProviderUsageQueries(input.queryClient, input.serverId);
  }
  if (input.method === "subscriptions.list") {
    if (!isCurrentRequest(input.queryClient, input.serverId, input.request)) return;
    let usage: ReturnType<typeof parseSubscriptionUsage>;
    try {
      usage = parseSubscriptionUsage(input.output);
    } catch {
      // Mirroring usage is optional; preserve the plugin's original RPC behavior.
      return;
    }
    const queryKey = subscriptionUsageQueryKey(input.serverId);
    await input.queryClient.cancelQueries({ queryKey, exact: true });
    if (!isCurrentRequest(input.queryClient, input.serverId, input.request)) return;
    input.queryClient.setQueryData(queryKey, usage);
  }
}
