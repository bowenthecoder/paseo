import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { expect, test, type Page } from "../support/fixtures";
import { openModelPicker } from "../support/helpers/agent-profiles";
import { openAgentRoute, seedMockAgentWorkspace } from "../support/helpers/mock-agent";
import { connectDaemonClient } from "../support/helpers/daemon-client-loader";

const ACCOUNT_LABEL = "Custom Codex account";
const SUBSCRIPTION_ERROR =
  "Account usage unavailable. Check the Subscriptions extension on this host.";

async function installSubscriptions(options: {
  initiallyUnavailable: boolean;
  providerIds: string[];
}) {
  const directory = await mkdtemp(path.join(tmpdir(), "paseo-subscriptions-retry-"));
  const client = await connectDaemonClient<
    Pick<
      DaemonClient,
      | "getDaemonConfig"
      | "patchDaemonConfig"
      | "installDirectoryPlugin"
      | "removePlugin"
      | "invokePluginRpc"
      | "connect"
      | "close"
    >
  >({ clientIdPrefix: "subscription-retry" });
  const previous = await client.getDaemonConfig();
  async function cleanup() {
    await client.removePlugin("subscriptions").catch(() => undefined);
    await client.patchDaemonConfig({ pluginsEnabled: previous.config.pluginsEnabled ?? false });
    await client.close().catch(() => undefined);
    await rm(directory, { recursive: true, force: true });
  }
  try {
    await writeFile(
      path.join(directory, "paseo-plugin.json"),
      JSON.stringify({ id: "subscriptions" }),
    );
    await writeFile(
      path.join(directory, "index.tsx"),
      `import { defineRpc } from "@getpaseo/plugin/server";
import { z } from "zod";
const list = defineRpc({ name: "subscriptions.list", input: z.object({}), output: z.unknown() });
const recover = defineRpc({ name: "subscriptions.recover", input: z.object({}), output: z.object({}) });
export default function contribute(plugin) {
  let unavailable = ${options.initiallyUnavailable};
  plugin.handle(recover, async () => { unavailable = false; return {}; });
  plugin.handle(list, async () => {
    if (unavailable) throw new Error("Temporary account lookup failure");
    return { slots: [{
      id: "codex-a",
      label: ${JSON.stringify(ACCOUNT_LABEL)},
      providerIds: ${JSON.stringify(options.providerIds)},
      usage: {
        status: "available",
        planLabel: "Mapped subscription",
        windows: [{ id: "session", label: "Session", usedPct: 37 }],
        fetchedAt: new Date().toISOString(),
        note: "Account lookup recovered",
      },
    }] };
  });
  return () => {};
}`,
    );
    await client.patchDaemonConfig({ pluginsEnabled: true });
    await client.installDirectoryPlugin(directory);
    return {
      cleanup,
      recover: () => client.invokePluginRpc("subscriptions", "subscriptions.recover", {}),
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

async function openUsage(page: Page, agent: { agentId: string; workspaceId: string }) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openAgentRoute(page, agent);
  await openModelPicker(page);
  return page.getByTestId("model-picker-usage").filter({ visible: true });
}

test("Refresh retries a custom provider's first failed subscription mapping", async ({ page }) => {
  test.setTimeout(120_000);
  // The real daemon's mock adapter has an ID unknown to subscriptionSlotId until
  // the installed plugin maps it, just like a user-defined provider alias.
  const agent = await seedMockAgentWorkspace({
    repoPrefix: "subscription-retry-",
    title: "Subscription retry",
  });
  let removeSubscriptions = async () => {};
  try {
    const subscriptions = await installSubscriptions({
      initiallyUnavailable: true,
      providerIds: ["mock"],
    });
    removeSubscriptions = subscriptions.cleanup;
    const usage = await openUsage(page, agent);
    await expect(usage.getByText(SUBSCRIPTION_ERROR, { exact: true })).toBeVisible();
    await expect(usage.getByText(ACCOUNT_LABEL, { exact: true })).toHaveCount(0);
    // Recover the real plugin handler without invalidating the app's failed
    // query. The user's Refresh action must perform the next account lookup.
    await subscriptions.recover();
    await usage.getByRole("button", { name: "Refresh usage", exact: true }).click();
    await expect(usage.getByText(ACCOUNT_LABEL, { exact: true })).toBeVisible();
    await expect(usage.getByText("Mapped subscription", { exact: true })).toBeVisible();
    await expect(usage.getByText("37%", { exact: true })).toBeVisible();
    await expect(usage.getByText(/Account lookup recovered/)).toBeVisible();
    await expect(usage.getByText(SUBSCRIPTION_ERROR, { exact: true })).toHaveCount(0);
    await expect(usage.getByText("Usage refresh failed. Try again.", { exact: true })).toHaveCount(
      0,
    );
  } finally {
    await removeSubscriptions();
    await agent.cleanup();
  }
});

for (const subscriptions of ["absent", "explicit empty mapping"] as const) {
  test(`native usage remains available with subscriptions ${subscriptions}`, async ({ page }) => {
    test.setTimeout(120_000);
    const agent = await seedMockAgentWorkspace({
      repoPrefix: "subscription-native-fallback-",
      title: "Native usage fallback",
    });
    let removeSubscriptions = async () => {};
    try {
      if (subscriptions !== "absent") {
        removeSubscriptions = (
          await installSubscriptions({ initiallyUnavailable: false, providerIds: [] })
        ).cleanup;
      }
      const usage = await openUsage(page, agent);
      await expect(
        usage.getByText("Usage unavailable for this account", { exact: true }),
      ).toBeVisible();
      await usage.getByRole("button", { name: "Refresh usage", exact: true }).click();
      await expect(
        usage.getByText("Usage unavailable for this account", { exact: true }),
      ).toBeVisible();
      await expect(usage.getByText(ACCOUNT_LABEL, { exact: true })).toHaveCount(0);
      await expect(usage.getByText(SUBSCRIPTION_ERROR, { exact: true })).toHaveCount(0);
      await expect(
        usage.getByText("Usage refresh failed. Try again.", { exact: true }),
      ).toHaveCount(0);
    } finally {
      await removeSubscriptions();
      await agent.cleanup();
    }
  });
}
