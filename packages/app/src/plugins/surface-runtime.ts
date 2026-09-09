import { createPaseoApi, type PaseoApi } from "@getpaseo/client";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { queryClient } from "@/data/query-client";
import {
  applySubscriptionUsageRpcResult,
  beginSubscriptionUsageRequest,
} from "@/provider-usage/query-cache";

export interface PluginSurfaceRuntime {
  paseo: PaseoApi;
  invoke(method: string, input: unknown): Promise<unknown>;
}

export function createPluginSurfaceRuntime(
  client: DaemonClient | null,
  pluginId: string,
  serverId: string,
): PluginSurfaceRuntime | null {
  if (!client) return null;
  return {
    paseo: createPaseoApi(client),
    invoke: async (method, input) => {
      const request = beginSubscriptionUsageRequest({ queryClient, serverId, pluginId, method });
      const output = await client.invokePluginRpc(pluginId, method, input);
      await applySubscriptionUsageRpcResult({
        queryClient,
        serverId,
        pluginId,
        method,
        output,
        request,
      });
      return output;
    },
  };
}
