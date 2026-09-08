import { expect, test } from "../support/fixtures";
import { seedWorkspace } from "../support/helpers/seed-client";
import { openAgentRoute } from "../support/helpers/mock-agent";
import { submitMessage } from "../support/helpers/composer";
import { openSubagentsTrack } from "../support/helpers/subagents";

test.use({ e2eForkProviders: ["claude", "codex-b", "grok"] });

const childPrompt =
  "Run only the harmless shell command sleep 5, then reply exactly CHILD_TASK_OK. Do not read or change files, run other tools, or spawn any children.";
const scenarios = [
  {
    provider: "claude",
    model: "claude-sonnet-5",
    modeId: "bypassPermissions",
    prompt: `Use Claude Code's native Task tool exactly once with subagent_type general-purpose, description Sentinel check, and name sentinel_child. Child prompt: ${childPrompt} Wait for the child to finish, then reply exactly ROOT_TASK_OK. Do not use Paseo tools or do any other work.`,
  },
  {
    provider: "codex-b",
    model: "gpt-5.6-sol",
    modeId: "full-access",
    prompt: `Use the native collaboration.spawn_agent tool exactly once with task_name sentinel_child and fork_turns none. Child prompt: ${childPrompt} Wait for the child to finish using collaboration.wait_agent, then reply exactly ROOT_TASK_OK. Do not use Paseo tools or do any other work.`,
  },
  {
    provider: "grok",
    model: "grok-4.6",
    prompt: `Use your native Task or spawn_subagent tool exactly once with description Sentinel check. Child prompt: ${childPrompt} Wait for the child to finish, then reply exactly ROOT_TASK_OK. Do not use a workflow or Paseo tools or do any other work.`,
  },
];

for (const scenario of scenarios) {
  test(`${scenario.provider}: native running task, right panel, child transcript and reported tokens`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.addInitScript(() =>
      localStorage.setItem(
        "@paseo:app-settings",
        JSON.stringify({ theme: "claude", workspaceTitleSource: "title" }),
      ),
    );
    const workspace = await seedWorkspace({ repoPrefix: `native-task-${scenario.provider}-` });
    try {
      const agent = await workspace.client.createAgent({
        provider: scenario.provider,
        model: scenario.model,
        thinkingOptionId: "low",
        modeId: scenario.modeId,
        featureValues: { auto_accept: true },
        ...(scenario.provider === "codex-b"
          ? { providerOptions: { features: { multi_agent_v2: true } } }
          : {}),
        cwd: workspace.repoPath,
        workspaceId: workspace.workspaceId,
        title: `${scenario.provider} task sidebar check`,
      });
      await openAgentRoute(page, { agentId: agent.id, workspaceId: workspace.workspaceId });
      await submitMessage(page, scenario.prompt);
      await expect(page.getByTestId("subagents-track-header")).toContainText("1 running task", {
        timeout: 120_000,
      });
      await openSubagentsTrack(page);
      const panel = page.getByTestId("subagents-track-header-panel");
      await expect(panel).toBeVisible();
      const bounds = await panel.boundingBox();
      expect(bounds!.x).toBeGreaterThan(page.viewportSize()!.width / 2);
      const rows = panel.locator('[data-testid^="subagents-track-row-"]');
      await expect(rows).toHaveCount(1);
      await page.screenshot({ path: testInfo.outputPath(`${scenario.provider}-running-task.png`) });
      await expect
        .poll(
          async () =>
            (await workspace.client.listProviderSubagents(agent.id)).subagents.map(
              (child) => child.status,
            ),
          { timeout: 120_000 },
        )
        .toEqual(["completed"]);
      await expect(rows.first()).toContainText(/\d+(?:\.\d+)?k? tokens/);
      await rows.first().click();
      const childPanel = page.getByTestId("provider-subagent-panel");
      await expect(childPanel).toBeVisible();
      await expect(
        childPanel.getByTestId("assistant-message").filter({ hasText: "CHILD_TASK_OK" }).last(),
      ).toBeVisible();
      await expect(page.getByTestId("provider-subagent-pane-subtitle")).toContainText(
        /\d+(?:\.\d+)?k? tokens/,
      );
      await expect(childPanel.getByTestId("message-input")).toHaveCount(0);
      await expect(page.getByTestId("context-window-meter").first()).toBeVisible();
      await expect(
        page.getByTestId("assistant-message").filter({ hasText: "ROOT_TASK_OK" }).last(),
      ).toBeVisible({ timeout: 120_000 });
      await page.screenshot({ path: testInfo.outputPath(`${scenario.provider}-child-tokens.png`) });
      await page.reload();
      await expect(page.getByTestId("provider-subagent-panel")).toBeVisible({ timeout: 60_000 });
      await expect(page.getByTestId("provider-subagent-pane-subtitle")).toContainText(
        /\d+(?:\.\d+)?k? tokens/,
      );
      await workspace.client.archiveAgent(agent.id);
    } finally {
      await workspace.cleanup();
    }
  });
}
