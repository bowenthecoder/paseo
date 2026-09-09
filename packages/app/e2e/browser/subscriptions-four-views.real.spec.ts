import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "../support/fixtures";
import { connectNewWorkspaceDaemonClient } from "../support/helpers/new-workspace";
import { seedWorkspace, type SeededWorkspace } from "../support/helpers/seed-client";
import { openAgentRoute } from "../support/helpers/mock-agent";
import { getServerId } from "../support/helpers/server-id";
import { agentPanel } from "../support/helpers/workspace-tabs";
import { expectWorkspaceAgentConfiguration } from "../support/helpers/command-center-agent-controls";

test.use({ e2eForkProviders: ["claude", "codex-a", "codex-b", "grok"] });

test.beforeAll(async () => {
  const pluginPath = process.env.E2E_SUBSCRIPTIONS_PLUGIN;
  if (!pluginPath)
    throw new Error("Set E2E_SUBSCRIPTIONS_PLUGIN to the local subscriptions extension");
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

const profiles = [
  {
    provider: "claude",
    model: "claude-sonnet-5",
    label: "Claude 1",
    marker: "PASEO_FOUR_CLAUDE_OK",
  },
  { provider: "codex-a", model: "gpt-5.6-sol", label: "Codex 1", marker: "PASEO_FOUR_CODEX_A_OK" },
  { provider: "codex-b", model: "gpt-5.6-sol", label: "Codex 2", marker: "PASEO_FOUR_CODEX_B_OK" },
  { provider: "grok", model: "grok-4.6", label: "Grok", marker: "PASEO_FOUR_GROK_OK" },
] as const;

interface RealChat {
  workspace: SeededWorkspace;
  agentId: string;
  profile: (typeof profiles)[number];
}

test("four native profiles reply concurrently with separate account usage, models and restored output", async ({
  page,
}, testInfo) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1600, height: 1100 });
  const chats: RealChat[] = [];
  try {
    for (const profile of profiles) {
      const workspace = await seedWorkspace({
        repoPrefix: `four-live-${profile.provider}-`,
        repo: { files: [{ path: "smoke.txt", content: profile.marker }] },
      });
      const chat: RealChat = { workspace, agentId: "", profile };
      chats.push(chat);
      const agent = await workspace.client.createAgent({
        provider: profile.provider,
        model: profile.model,
        cwd: workspace.repoPath,
        workspaceId: workspace.workspaceId,
        title: `${profile.label} four-view smoke`,
      });
      chat.agentId = agent.id;
    }
    await openAgentRoute(page, {
      agentId: chats[0]!.agentId,
      workspaceId: chats[0]!.workspace.workspaceId,
    });
    for (const chat of chats.slice(1)) {
      await page
        .getByTestId(`sidebar-workspace-row-${getServerId()}:chat:${chat.agentId}`)
        .click({ button: "right" });
      await page.getByRole("menuitem", { name: /^Open in/ }).click();
      await page.getByTestId("sidebar-open-split-right").click();
      await expect(agentPanel(page, chat.agentId)).toBeVisible();
    }
    const paneIds = ["main", "chat-2", "chat-3", "chat-4"];
    for (const [index, chat] of chats.entries()) {
      const panel = agentPanel(page, chat.agentId);
      const usage = panel.getByTestId("account-usage-badge");
      await expect(usage).toBeVisible({ timeout: 60_000 });
      await expect(usage).toContainText(/\d+\s*%/);
      await usage.hover();
      await expect(page.getByText(chat.profile.label, { exact: true }).last()).toBeVisible();
      await page.mouse.move(0, 0);
      const input = panel.getByTestId("message-input-root").locator("textarea");
      await input.fill(
        `Reply with exactly ${chat.profile.marker}. Do not use tools, read files, or change anything.`,
      );
      await expect(page.getByTestId(`workspace-chat-view-${paneIds[index]}`)).toHaveAttribute(
        "data-pane-focused",
        "true",
      );
      await input.press("Enter");
    }
    for (const chat of chats) {
      const panel = agentPanel(page, chat.agentId);
      await expect(panel.getByText(chat.profile.marker, { exact: true }).last()).toBeVisible({
        timeout: 120_000,
      });
      await expect(panel.getByTestId("account-usage-badge")).toBeInViewport({ ratio: 1 });
      await expect(panel.getByRole("button", { name: /^Select model/ })).toBeVisible();
    }
    await page.screenshot({ path: testInfo.outputPath("four-native-replies-usage.png") });
    await page.reload();
    for (const chat of chats) {
      const panel = agentPanel(page, chat.agentId);
      await expect(panel.getByText(chat.profile.marker, { exact: true }).last()).toBeVisible({
        timeout: 60_000,
      });
      await expect(panel.getByTestId("account-usage-badge")).toContainText(/\d+\s*%/);
      await panel.getByTestId("account-usage-badge").hover();
      await expect(page.getByText(chat.profile.label, { exact: true }).last()).toBeVisible();
      await page.mouse.move(0, 0);
      const agents = (await chat.workspace.client.fetchAgents({ scope: "active" })).entries;
      const agent = agents.find((entry) => entry.agent.id === chat.agentId)!.agent;
      await expectWorkspaceAgentConfiguration(chat.workspace, {
        id: chat.agentId,
        provider: chat.profile.provider,
        model: chat.profile.model,
        modeId: agent.currentModeId,
      });
    }
    // Exercise native session replacement as well as browser-state restoration.
    for (const [index, chat] of chats.entries()) {
      const view = page.getByTestId(`workspace-chat-view-${paneIds[index]}`);
      const reload = view.getByRole("button", { name: "Reload chat", exact: true });
      await reload.click();
      await expect(reload).toBeEnabled({ timeout: 60_000 });
      const panel = agentPanel(page, chat.agentId);
      const marker = `PASEO_AFTER_NATIVE_RELOAD_${index}_OK`;
      const input = panel.getByTestId("message-input-root").locator("textarea");
      await input.fill(`Reply with exactly ${marker}. Do not use tools or read files.`);
      await input.press("Enter");
      await expect(panel.getByText(marker, { exact: true }).last()).toBeVisible({
        timeout: 120_000,
      });
      await expect(panel.getByTestId("account-usage-badge")).toContainText(/\d+\s*%/);
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    for (const chat of chats) {
      await expect(
        agentPanel(page, chat.agentId).getByTestId("account-usage-badge"),
      ).toBeInViewport({ ratio: 1 });
    }
    await page.screenshot({ path: testInfo.outputPath("four-native-replies-usage-1280.png") });
    for (const chat of chats) await chat.workspace.client.archiveAgent(chat.agentId);
  } finally {
    for (const chat of chats.toReversed()) await chat.workspace.cleanup();
  }
});

for (const profile of [profiles[0], profiles[1]]) {
  test(`${profile.provider}: native file read renders the actual tool trace and output after reload`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 960 });
    const marker = `NATIVE_READ_${profile.provider.replaceAll("-", "_").toUpperCase()}_VERIFIED`;
    const workspace = await seedWorkspace({
      repoPrefix: `native-tool-${profile.provider}-`,
      repo: { files: [{ path: "smoke.txt", content: `${marker}\n` }] },
    });
    try {
      const agent = await workspace.client.createAgent({
        provider: profile.provider,
        model: profile.model,
        modeId: profile.provider === "claude" ? "default" : "auto",
        cwd: workspace.repoPath,
        workspaceId: workspace.workspaceId,
        title: `${profile.label} native read smoke`,
      });
      await openAgentRoute(page, { agentId: agent.id, workspaceId: workspace.workspaceId });
      const panel = agentPanel(page, agent.id);
      const input = panel.getByTestId("message-input-root").locator("textarea");
      await input.fill(
        `Use your native ${profile.provider === "claude" ? "Bash" : "exec_command"} tool to run exactly cat smoke.txt in your current directory. Read no other files and run no other commands. Reply with its exact contents. Do not edit anything.`,
      );
      await input.press("Enter");
      const log = panel.getByTestId("subscriptions-tool-log").filter({ visible: true });
      await expect(log.filter({ hasText: "smoke.txt" }).first()).toBeVisible({ timeout: 90_000 });
      await expect(panel.getByText(marker, { exact: true }).last()).toBeVisible({
        timeout: 90_000,
      });
      await page.screenshot({ path: testInfo.outputPath("native-read-before-output-check.png") });
      await expect(log.filter({ hasText: marker }).first()).toBeVisible();
      await expect(log.filter({ hasText: "cat smoke.txt" }).first()).toContainText(
        profile.provider === "claude" ? "Bash(" : "Ran ",
      );
      await page.screenshot({ path: testInfo.outputPath("native-read-tool-output.png") });
      await page.reload();
      await expect(log.filter({ hasText: "smoke.txt" }).first()).toBeVisible({ timeout: 60_000 });
      await expect(log.filter({ hasText: marker }).first()).toBeVisible();
      await expect(panel.getByText(marker, { exact: true }).last()).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath("native-read-tool-output-restored.png") });
      await workspace.client.archiveAgent(agent.id);
    } finally {
      await workspace.cleanup();
    }
  });
}
