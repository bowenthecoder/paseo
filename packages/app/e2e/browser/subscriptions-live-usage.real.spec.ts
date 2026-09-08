import { mkdir, copyFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "../support/fixtures";
import { connectNewWorkspaceDaemonClient } from "../support/helpers/new-workspace";
import { seedWorkspace } from "../support/helpers/seed-client";
import { openAgentRoute } from "../support/helpers/mock-agent";
import { submitMessage } from "../support/helpers/composer";
import { openModelPicker, closeModelPicker } from "../support/helpers/agent-profiles";

test.use({ e2eForkProviders: ["claude", "codex-a", "codex-b", "grok"] });

test.beforeAll(async () => {
  const pluginPath = process.env.E2E_SUBSCRIPTIONS_PLUGIN;
  if (!pluginPath)
    throw new Error("Set E2E_SUBSCRIPTIONS_PLUGIN to the local subscriptions extension");
  const state = path.join(process.env.E2E_PASEO_HOME!, "plugins-state");
  await mkdir(state, { recursive: true });
  if (process.env.E2E_USAGE_CACHE)
    await copyFile(process.env.E2E_USAGE_CACHE, path.join(state, "subscriptions-usage.json"));
  await writeFile(
    path.join(state, "subscriptions.json"),
    JSON.stringify({
      autoSwitch: { claude: false, codex: false },
      cliLook: false,
      toolLogs: false,
      alertsEnabled: false,
    }),
  );
  const client = await connectNewWorkspaceDaemonClient({ ownProjects: false });
  try {
    // Curated labels must retain native effort discovery, as on hosts with older model caches.
    await client.patchDaemonConfig({
      pluginsEnabled: true,
      providers: {
        "codex-a": { models: [{ id: "gpt-5.6-sol", label: "GPT-5.6 Sol", isDefault: true }] },
        "codex-b": { models: [{ id: "gpt-5.6-sol", label: "GPT-5.6 Sol", isDefault: true }] },
      },
    });
    await client.installDirectoryPlugin(pluginPath);
  } finally {
    await client.close();
  }
});

for (const entry of [
  { provider: "claude", model: "claude-sonnet-5", effort: true, label: "Claude 1" },
  { provider: "codex-a", model: "gpt-5.6-sol", effort: true, label: "Codex 1" },
  { provider: "codex-b", model: "gpt-5.6-sol", effort: true, label: "Codex 2" },
  { provider: "grok", model: "grok-4.6", effort: true, label: "Grok" },
]) {
  test(`${entry.provider}: real reply, subscription usage and context`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    const workspace = await seedWorkspace({ repoPrefix: `usage-smoke-${entry.provider}-` });
    try {
      const agent = await workspace.client.createAgent({
        provider: entry.provider,
        model: entry.model,
        cwd: workspace.repoPath,
        workspaceId: workspace.workspaceId,
        title: `${entry.label} usage smoke check`,
      });
      await openAgentRoute(page, { agentId: agent.id, workspaceId: workspace.workspaceId });
      await expect(page.getByTestId("account-usage-badge")).toBeVisible({ timeout: 60_000 });
      await openModelPicker(page);
      const usage = page.getByTestId("model-picker-usage");
      await expect(usage).toContainText(entry.label, { timeout: 60_000 });
      await expect(usage).not.toContainText("Loading usage");
      if (entry.effort) {
        await page.getByTestId("model-picker-effort-low").click();
        await expect(page.getByTestId("model-picker-effort-low")).toHaveAttribute(
          "aria-checked",
          "true",
        );
      } else {
        await expect(page.getByTestId("model-picker-effort-low")).toHaveCount(0);
      }
      await page.screenshot({ path: testInfo.outputPath("model-and-usage.png") });
      await closeModelPicker(page);
      await submitMessage(
        page,
        "Reply with exactly PASEO_SMOKE_OK. Do not use tools, read files, or change anything.",
      );
      await expect(page.getByText("PASEO_SMOKE_OK", { exact: true }).last()).toBeVisible({
        timeout: 120_000,
      });
      await expect(page.getByTestId("account-usage-badge")).toBeInViewport({ ratio: 1 });
      await page.getByTestId("account-usage-badge").hover();
      await expect(page.getByText(entry.label, { exact: true }).last()).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath("reply-and-usage.png") });
      await page.mouse.move(0, 0);
      {
        await expect(page.getByTestId("context-window-meter")).toBeVisible();
        await page.getByTestId("context-window-meter").hover();
        await expect(page.getByText("Context window", { exact: true })).toBeVisible();
        await page.mouse.move(0, 0);
      }
      // Every configured provider reports real context alongside account usage.
      await expect(page.getByTestId("account-usage-badge")).toBeVisible();
      await workspace.client.archiveAgent(agent.id);
    } finally {
      await workspace.cleanup();
    }
  });
}
