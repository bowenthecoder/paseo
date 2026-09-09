import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { PaseoApi } from "@getpaseo/client";
import { PaseoApiProvider } from "@getpaseo/plugin/host";
import { usePaseo } from "@getpaseo/plugin";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { queryClient } from "@/data/query-client";
import {
  providerUsageQueryKey,
  resetProviderUsageQueries,
  subscriptionUsageQueryKey,
} from "@/provider-usage/query-cache";
import { createPluginSurfaceRuntime } from "./surface-runtime";

afterEach(() => queryClient.clear());

function clientWithWorkspace(id: string) {
  const createWorkspace = vi.fn(async () => ({
    error: null,
    workspace: {
      id,
      projectId: `project-${id}`,
      workspaceDirectory: `/tmp/${id}`,
      name: id,
      status: "active",
    },
  }));
  const createAgent = vi.fn(async () => ({
    id: `agent-${id}`,
    provider: "codex",
    cwd: `/tmp/${id}`,
    workspaceId: id,
    status: "idle",
  }));
  const invokePluginRpc = vi.fn(async () => id);
  return {
    client: { createWorkspace, createAgent, invokePluginRpc } as unknown as DaemonClient,
    createWorkspace,
    createAgent,
    invokePluginRpc,
  };
}

function borrowFromAppProvider(paseo: PaseoApi): PaseoApi {
  let borrowed: PaseoApi | null = null;
  function PluginSurface() {
    borrowed = usePaseo();
    return null;
  }
  renderToStaticMarkup(
    <PaseoApiProvider paseo={paseo}>
      <PluginSurface />
    </PaseoApiProvider>,
  );
  if (!borrowed) throw new Error("Plugin surface did not receive Paseo API");
  return borrowed;
}

describe("plugin surface host runtime", () => {
  it("creates a PR worktree and agent through usePaseo on the selected app host", async () => {
    const selected = clientWithWorkspace("workspace-a");
    const runtime = createPluginSurfaceRuntime(
      selected.client,
      "workspace-plugin",
      "selected-host",
    );
    if (!runtime) throw new Error("Expected selected host runtime");

    const paseo = borrowFromAppProvider(runtime.paseo);
    const workspace = await paseo.workspaces.create({
      source: {
        kind: "worktree",
        cwd: "/tmp/repository",
        action: "checkout",
        checkoutSource: { kind: "change_request", forge: "github", number: 42 },
      },
    });
    const agent = await workspace.agents.create({
      config: { provider: "codex/gpt-5" },
      prompt: "Review PR #42",
    });

    expect(workspace.id).toBe("workspace-a");
    expect(agent.id).toBe("agent-workspace-a");
    expect(selected.createWorkspace).toHaveBeenCalledOnce();
    expect(selected.createAgent).toHaveBeenCalledOnce();
  });

  it("switches all plugin calls when the selected host changes", async () => {
    const hostA = clientWithWorkspace("workspace-a");
    const hostB = clientWithWorkspace("workspace-b");
    const first = createPluginSurfaceRuntime(hostA.client, "same-plugin", "host-a");
    const second = createPluginSurfaceRuntime(hostB.client, "same-plugin", "host-b");
    if (!first || !second) throw new Error("Expected online host runtimes");

    await first.invoke("host", {});
    await borrowFromAppProvider(second.paseo).workspaces.create({
      source: { kind: "directory", path: "/tmp/workspace-b" },
    });

    expect(hostA.invokePluginRpc).toHaveBeenCalledWith("same-plugin", "host", {});
    expect(hostA.createWorkspace).not.toHaveBeenCalled();
    expect(hostB.createWorkspace).toHaveBeenCalledOnce();
  });

  it("keeps an offline selected host unavailable instead of borrowing another host", () => {
    const otherHost = clientWithWorkspace("workspace-online");

    expect(createPluginSurfaceRuntime(null, "same-plugin", "host-a")).toBeNull();
    expect(otherHost.createWorkspace).not.toHaveBeenCalled();
  });

  it("does not restore an old account when its standalone list finishes after a host reset", async () => {
    const oldList = deferred<unknown>();
    const runtime = subscriptionRuntime("host-a", (method) =>
      method === "subscriptions.login-status"
        ? Promise.resolve({ state: "done" })
        : oldList.promise,
    );
    const pending = runtime.invoke("subscriptions.list", {});
    const key = subscriptionUsageQueryKey("host-a");
    const currentAccount = [{ providerId: "codex", windows: [{ usedPct: 12 }] }];
    queryClient.setQueryData(providerUsageQueryKey("host-a"), { account: "old" });
    queryClient.setQueryData(subscriptionUsageQueryKey("host-b"), { account: "other-host" });

    await runtime.invoke("subscriptions.login-status", {});
    expect(queryClient.getQueryData(providerUsageQueryKey("host-a"))).toBeUndefined();
    queryClient.setQueryData(key, currentAccount);
    const output = subscriptionList(90);
    oldList.resolve(output);

    await expect(pending).resolves.toBe(output);
    expect(queryClient.getQueryData(key)).toEqual(currentAccount);
    expect(queryClient.getQueryData(subscriptionUsageQueryKey("host-b"))).toEqual({
      account: "other-host",
    });
  });

  it("keeps the newer list when two standalone requests finish out of order", async () => {
    const lists = [deferred<unknown>(), deferred<unknown>()];
    let call = 0;
    const runtime = subscriptionRuntime("host-a", () => lists[call++]!.promise);
    const older = runtime.invoke("subscriptions.list", {});
    const newer = runtime.invoke("subscriptions.list", {});
    lists[1]!.resolve(subscriptionList(12));
    await newer;
    lists[0]!.resolve(subscriptionList(90));
    await older;

    expect(queryClient.getQueryData(subscriptionUsageQueryKey("host-a"))).toMatchObject([
      { providerId: "codex", windows: [{ usedPct: 12 }] },
    ]);
  });

  it("ignores a list superseded while its cache cancellation is settling", async () => {
    const runtime = subscriptionRuntime("host-a", async () => subscriptionList(90));
    const pending = runtime.invoke("subscriptions.list", {});
    // The RPC continuation has entered the awaited QueryClient cancellation.
    await Promise.resolve();
    await resetProviderUsageQueries(queryClient, "host-a");
    await pending;

    expect(queryClient.getQueryData(subscriptionUsageQueryKey("host-a"))).toBeUndefined();
  });

  it("keeps pending list generations independent across hosts", async () => {
    const firstList = deferred<unknown>();
    const first = subscriptionRuntime("host-a", () => firstList.promise);
    const second = subscriptionRuntime("host-b", async () => subscriptionList(12));
    const pending = first.invoke("subscriptions.list", {});
    await second.invoke("subscriptions.list", {});
    await resetProviderUsageQueries(queryClient, "host-b");
    firstList.resolve(subscriptionList(90));
    await pending;

    expect(queryClient.getQueryData(subscriptionUsageQueryKey("host-a"))).toMatchObject([
      { providerId: "codex", windows: [{ usedPct: 90 }] },
    ]);
    expect(queryClient.getQueryData(subscriptionUsageQueryKey("host-b"))).toBeUndefined();
  });

  it("preserves plugin RPC output when optional usage mirroring cannot parse it", async () => {
    const output = { slots: [{ id: "codex-a", usage: { windows: "bad" } }] };
    const runtime = subscriptionRuntime("host-a", async () => output);

    await expect(runtime.invoke("subscriptions.list", {})).resolves.toBe(output);
    expect(queryClient.getQueryData(subscriptionUsageQueryKey("host-a"))).toBeUndefined();
  });
});

function subscriptionRuntime(serverId: string, invoke: (method: string) => Promise<unknown>) {
  const client = {
    invokePluginRpc: (_pluginId: string, method: string) => invoke(method),
  } as unknown as DaemonClient;
  const runtime = createPluginSurfaceRuntime(client, "subscriptions", serverId);
  if (!runtime) throw new Error("Expected online subscriptions runtime");
  return runtime;
}

function subscriptionList(usedPct: number) {
  return {
    slots: [
      {
        id: "codex-a",
        label: "Codex A",
        providerIds: ["codex"],
        usage: {
          status: "available",
          windows: [{ id: "session", label: "Session", usedPct }],
          fetchedAt: "2026-09-09T06:00:00Z",
        },
      },
    ],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
