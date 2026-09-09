import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { z } from "zod";
import { expect, test } from "../support/fixtures";
import { connectDaemonClient } from "../support/helpers/daemon-client-loader";
import { seedWorkspace } from "../support/helpers/seed-client";
import { openAgentRoute } from "../support/helpers/mock-agent";
import { openModelPicker, closeModelPicker } from "../support/helpers/agent-profiles";
import { daemonWsRoutePattern } from "../support/helpers/daemon-port";

const alias = "work-codex";
const customLabel = "Work Codex B review";
const model = "gpt-5.6-sol";
let expectedEnv: Record<string, string>;
const accountProviderIds = ["codex-b", alias];
const expectedProfiles = new Map<string, unknown>();
type SubscriptionReviewClient = Pick<
  DaemonClient,
  | "connect"
  | "close"
  | "getDaemonConfig"
  | "patchDaemonConfig"
  | "installDirectoryPlugin"
  | "fetchAgent"
  | "invokePluginRpc"
>;
// Local projections keep Playwright's CommonJS transform from loading the protocol module
// used by the dynamically imported ESM client. Original frames are forwarded unchanged.
const slotListRequestSchema = z.object({
  type: z.literal("session"),
  message: z.object({
    type: z.literal("plugin.rpc.invoke.request"),
    requestId: z.string(),
    pluginId: z.literal("subscriptions"),
    method: z.literal("subscriptions.list"),
  }),
});
const pluginRpcResponseSchema = z.object({
  type: z.literal("session"),
  message: z.object({
    type: z.literal("plugin.rpc.invoke.response"),
    payload: z.object({ requestId: z.string(), output: z.unknown() }),
  }),
});
const slotMappingsSchema = z.object({
  slots: z.array(z.object({ id: z.string(), providerIds: z.array(z.string()).optional() })),
});
function mapsAliasToCodexB(slot: z.infer<typeof slotMappingsSchema>["slots"][number]): boolean {
  return slot.id === "codex-b" && slot.providerIds?.includes(alias) === true;
}
function settingsWithoutEnabled(profile: unknown): Record<string, unknown> | null {
  const parsed = z.record(z.string(), z.unknown()).safeParse(profile);
  if (!parsed.success) return null;
  delete parsed.data.enabled;
  return parsed.data;
}

function expectedProviderStates(enabled: boolean) {
  return Object.fromEntries(
    accountProviderIds.map((id) => [id, { exists: true, settingsPreserved: true, enabled }]),
  );
}
const connectSubscriptionClient = () =>
  connectDaemonClient<SubscriptionReviewClient>({ clientIdPrefix: "subscriptions-custom-alias" });
test.use({ e2eForkProviders: ["codex-b"] });

test.beforeAll(async () => {
  const pluginPath = process.env.E2E_SUBSCRIPTIONS_PLUGIN;
  if (!pluginPath)
    throw new Error("Set E2E_SUBSCRIPTIONS_PLUGIN to the frozen subscriptions integration");
  const home = process.env.E2E_PASEO_HOME;
  if (!home || home === process.env.HOME || home === path.join(process.env.HOME ?? "", ".paseo")) {
    throw new Error("Requires the existing isolated worker fixture");
  }
  const state = path.join(home, "plugins-state");
  await mkdir(state, { recursive: true });
  await writeFile(
    path.join(state, "subscriptions.json"),
    JSON.stringify({
      autoSwitch: { claude: false, codex: false },
      cliLook: true,
      toolLogs: true,
      alertsEnabled: false,
    }),
  );
  const client = await connectSubscriptionClient();
  try {
    // The worker already forked only the saved Paseo provider configuration.
    // We reuse its launch environment; no native authentication file is read or copied here.
    const source = (await client.getDaemonConfig()).config.providers["codex-b"];
    const sourceEnv = z.record(z.string(), z.string()).safeParse(source?.env);
    if (!source || !sourceEnv.success || typeof sourceEnv.data.CODEX_HOME !== "string") {
      throw new Error("Forked Codex B provider must declare its native CODEX_HOME route");
    }
    expectedEnv = { ...sourceEnv.data, PASEO_CUSTOM_ALIAS_REVIEW: "preserve-this-value" };
    await client.patchDaemonConfig({
      pluginsEnabled: true,
      providers: {
        [alias]: {
          ...source,
          extends: "codex",
          enabled: true,
          label: customLabel,
          env: expectedEnv,
          models: [{ id: model, label: "GPT-5.6 Sol", isDefault: true }],
        },
      },
    });
    const configured = (await client.getDaemonConfig()).config.providers;
    for (const id of accountProviderIds) {
      if (!configured[id]) throw new Error(`Expected configured account provider: ${id}`);
      expectedProfiles.set(id, configured[id]);
    }
    await client.installDirectoryPlugin(pluginPath);
  } finally {
    await client.close();
  }
});

test("arbitrary provider gains its B account pill after real slot discovery, preserves custom config and replies", async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 960 });
  const workspace = await seedWorkspace({ repoPrefix: "custom-alias-live-" });
  let hold = true;
  const releases: Array<() => void> = [];
  let aliasWasMappedToB = false;
  let heldSlotResponses = 0;
  let deliveredSlotResponses = 0;
  let agentId = "";
  let accountClient: SubscriptionReviewClient | null = null;
  const releaseSlots = () => {
    hold = false;
    for (const release of releases.splice(0)) release();
  };
  try {
    const client = await connectSubscriptionClient();
    accountClient = client;
    // Delay actual data without inventing quota, changing its values or delaying other RPCs.
    await page.routeWebSocket(daemonWsRoutePattern(), (browser) => {
      const server = browser.connectToServer();
      const listRequests = new Set<string>();
      browser.onMessage((message) => {
        try {
          const envelope = slotListRequestSchema.parse(
            JSON.parse(typeof message === "string" ? message : message.toString("utf8")),
          );
          listRequests.add(envelope.message.requestId);
        } catch {
          /* Forward other frames unchanged. */
        }
        server.send(message);
      });
      server.onMessage((message) => {
        let isSlotResponse = false;
        try {
          const envelope = pluginRpcResponseSchema.parse(
            JSON.parse(typeof message === "string" ? message : message.toString("utf8")),
          );
          const response = envelope.message;
          if (listRequests.has(response.payload.requestId)) {
            isSlotResponse = true;
            const mappings = slotMappingsSchema.safeParse(response.payload.output);
            if (mappings.success) {
              aliasWasMappedToB ||= mappings.data.slots.some(mapsAliasToCodexB);
            }
          }
        } catch {
          /* Forward other frames unchanged. */
        }
        const deliver = () => {
          if (isSlotResponse) deliveredSlotResponses++;
          browser.send(message);
        };
        if (hold && isSlotResponse) {
          heldSlotResponses++;
          releases.push(deliver);
        } else deliver();
      });
    });
    const agent = await workspace.client.createAgent({
      provider: alias,
      model,
      modeId: "auto",
      cwd: workspace.repoPath,
      workspaceId: workspace.workspaceId,
      title: "Custom alias subscription review",
    });
    agentId = agent.id;
    await openAgentRoute(page, { agentId, workspaceId: workspace.workspaceId });
    const panel = page.getByTestId(`workspace-panel-agent_${agentId}`).filter({ visible: true });
    const composer = panel.getByTestId("message-input-root").locator("textarea");
    await expect(composer).toBeEditable();
    await expect.poll(() => heldSlotResponses, { timeout: 90_000 }).toBeGreaterThan(0);
    expect(deliveredSlotResponses).toBe(0);
    expect(aliasWasMappedToB).toBe(true);
    releaseSlots();

    const pill = panel.getByRole("button", { name: "Accounts & models", exact: true });
    await expect(pill).toBeVisible({ timeout: 30_000 });
    await expect(pill).toContainText("Codex 2");
    await expect(pill).toContainText(/\d+\s*%/);
    const usage = panel.getByTestId("account-usage-badge");
    await expect(usage).toBeVisible({ timeout: 60_000 });
    await expect(usage).toContainText(/\d+\s*%/);
    await usage.hover();
    const usagePopup = page
      .getByText("Click the usage badge to refresh", { exact: true })
      .locator("..");
    await expect(usagePopup.getByText("Codex 2", { exact: true })).toBeVisible();
    await page.mouse.move(0, 0);
    await openModelPicker(page);
    await expect(page.getByTestId("model-picker-usage")).toContainText("Codex 2", {
      timeout: 60_000,
    });
    await expect(page.getByTestId(`model-row-${alias}-${model}`)).toBeVisible();
    await closeModelPicker(page);
    await page.screenshot({ path: testInfo.outputPath("custom-alias-pill-after-discovery.png") });

    await composer.fill(
      "Reply with exactly PASEO_CUSTOM_ALIAS_B_OK. Do not use tools, read files, or change anything.",
    );
    await composer.press("Enter");
    await expect(panel.getByText("PASEO_CUSTOM_ALIAS_B_OK", { exact: true }).last()).toBeVisible({
      timeout: 120_000,
    });
    const current = (await client.fetchAgent({ agentId }))?.agent;
    expect(current?.provider).toBe(alias);
    expect(current?.model).toBe(model);
    const preservedConfig = async () => {
      const providers = (await client.getDaemonConfig()).config.providers;
      return Object.fromEntries(
        accountProviderIds.map((id) => [
          id,
          {
            exists: providers[id] !== undefined,
            settingsPreserved: isDeepStrictEqual(
              settingsWithoutEnabled(providers[id]),
              settingsWithoutEnabled(expectedProfiles.get(id)),
            ),
            enabled: providers[id]?.enabled !== false,
          },
        ]),
      );
    };
    await expect.poll(preservedConfig).toEqual(expectedProviderStates(true));
    await client.invokePluginRpc("subscriptions", "subscriptions.set-enabled", {
      slotId: "codex-b",
      enabled: false,
    });
    await expect.poll(preservedConfig).toEqual(expectedProviderStates(false));
    await client.invokePluginRpc("subscriptions", "subscriptions.set-enabled", {
      slotId: "codex-b",
      enabled: true,
    });
    await expect.poll(preservedConfig).toEqual(expectedProviderStates(true));
    await page.reload();
    await expect(pill).toContainText("Codex 2", { timeout: 60_000 });
    await expect(panel.getByText("PASEO_CUSTOM_ALIAS_B_OK", { exact: true }).last()).toBeVisible();
    await expect(usage).toContainText(/\d+\s*%/);
    await composer.fill(
      "Reply with exactly PASEO_CUSTOM_ALIAS_B_REENABLED. Do not use tools, read files, or change anything.",
    );
    await composer.press("Enter");
    await expect(
      panel.getByText("PASEO_CUSTOM_ALIAS_B_REENABLED", { exact: true }).last(),
    ).toBeVisible({ timeout: 120_000 });
    await expect.poll(preservedConfig).toEqual(expectedProviderStates(true));
    await page.screenshot({ path: testInfo.outputPath("custom-alias-reply-restored.png") });
    await testInfo.attach("custom-alias-evidence", {
      contentType: "application/json",
      body: JSON.stringify(
        {
          alias,
          expectedSlot: "codex-b",
          customLabel,
          heldSlotResponses,
          deliveredSlotResponses,
          aliasWasMappedToB,
          nativeReply: true,
          customEnvironmentPreserved: true,
          restoredProviderIds: accountProviderIds,
          fullProviderSettingsPreserved: true,
          isolatedHome: process.env.E2E_PASEO_HOME,
        },
        null,
        2,
      ),
    });
  } catch (error) {
    await page
      .screenshot({ path: testInfo.outputPath("custom-alias-before-cleanup.png") })
      .catch(() => {});
    throw error;
  } finally {
    releaseSlots();
    if (agentId) await workspace.client.archiveAgent(agentId).catch(() => {});
    await accountClient?.close().catch(() => {});
    await workspace.cleanup();
  }
});
