import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "../support/fixtures";
import { connectNewWorkspaceDaemonClient } from "../support/helpers/new-workspace";
import { openAgentRoute, seedMockAgentWorkspace } from "../support/helpers/mock-agent";
import { submitMessage } from "../support/helpers/composer";

async function subscriptions(page: Page) {
  await page.locator('[data-testid^="plugin-sidebar-"][data-testid$="-subscriptions"]').click();
  await expect(page.getByRole("switch", { name: "Tool logs", exact: true })).toBeVisible();
}

test.beforeAll(async () => {
  const pluginPath = process.env.E2E_SUBSCRIPTIONS_PLUGIN;
  if (!pluginPath) throw new Error("Set E2E_SUBSCRIPTIONS_PLUGIN to the subscriptions checkout");
  const state = path.join(process.env.E2E_PASEO_HOME!, "plugins-state");
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
  const client = await connectNewWorkspaceDaemonClient({ ownProjects: false });
  try {
    await client.patchDaemonConfig({ pluginsEnabled: true });
    await client.installDirectoryPlugin(pluginPath);
  } finally {
    await client.close();
  }
});

test("the installed subscriptions Tool logs toggle preserves activity and persists across reload", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const agent = await seedMockAgentWorkspace({
    repoPrefix: "subscriptions-tool-logs-",
    title: "Tool logs integration",
    model: "ten-second-stream",
  });
  try {
    await openAgentRoute(page, agent);
    await subscriptions(page);
    const toolLogs = page.getByRole("switch", { name: "Tool logs", exact: true });
    await expect(toolLogs).toBeChecked();
    await expect(page.getByRole("switch", { name: "CLI look", exact: true })).toBeChecked();
    await page.goBack();
    await submitMessage(
      page,
      "Replay a codex-shaped foreground shell tool call while the user steers this turn.",
    );
    await expect(
      page.getByTestId("subscriptions-tool-log").filter({ visible: true }).first(),
    ).toContainText("sleep 5");
    await agent.client.waitForFinish(agent.agentId, 30_000);
    await subscriptions(page);
    await toolLogs.click();
    await expect(toolLogs).not.toBeChecked();
    await page.goBack();
    await expect(page.getByTestId("subscriptions-tool-log").filter({ visible: true })).toHaveCount(
      0,
    );
    await expect(
      page
        .getByTestId("subscriptions-tool-trace")
        .or(page.getByTestId("tool-call-badge"))
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("tool-logs-off.png") });
    await subscriptions(page);
    await page.reload();
    await expect(toolLogs).not.toBeChecked();
    await toolLogs.click();
    await expect(toolLogs).toBeChecked();
    await openAgentRoute(page, agent);
    await expect(
      page.getByTestId("subscriptions-tool-log").filter({ visible: true }).first(),
    ).toContainText("sleep 5");
    await page.screenshot({ path: testInfo.outputPath("tool-logs-on.png") });
    expect(errors).toEqual([]);
  } finally {
    await agent.cleanup();
  }
});
