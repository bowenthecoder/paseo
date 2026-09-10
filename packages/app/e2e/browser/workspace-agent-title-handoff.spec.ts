import { test, expect, type Page } from "../support/fixtures";
import { expectComposerVisible, submitMessage } from "../support/helpers/composer";
import { delayCreatedAgentInitialTailResponse } from "../support/helpers/agent-timeline-gate";
import { delayBrowserAgentCreatedStatus } from "../support/helpers/new-workspace";
import { seedWorkspace, type SeedDaemonClient } from "../support/helpers/seed-client";
import {
  createAgentTabFromMenu,
  waitForWorkspaceTabsVisible,
} from "../support/helpers/workspace-tabs";
import { getServerId } from "../support/helpers/server-id";
import { buildHostWorkspaceRoute } from "@/utils/host-routes";

function mainChat(page: Page) {
  return page.getByTestId("workspace-chat-pane").filter({ visible: true });
}

function chatRow(page: Page, agentId: string) {
  return page.getByTestId(`sidebar-workspace-row-${getServerId()}:chat:${agentId}`);
}

async function expectCreatedChatVisible(page: Page, agentId: string): Promise<void> {
  // A promoted draft keeps its slot ID. The selected sidebar row identifies the
  // authoritative agent while its existing main chat surface remains visible.
  await expect(chatRow(page, agentId)).toHaveAttribute("aria-selected", "true", {
    timeout: 15_000,
  });
  await expect(mainChat(page)).toHaveCount(1);
  await expect(mainChat(page).getByTestId("agent-chat-scroll")).toBeVisible({
    timeout: 15_000,
  });
}

async function waitForCreatedAgentId(
  client: SeedDaemonClient,
  input: { cwd: string; workspaceId: string },
): Promise<string> {
  await expect
    .poll(
      async () => {
        const result = await client.fetchAgents({ scope: "active" });
        return result.entries
          .filter(
            (entry) =>
              entry.agent.cwd === input.cwd && entry.agent.workspaceId === input.workspaceId,
          )
          .map((entry) => entry.agent.id);
      },
      { timeout: 30_000 },
    )
    .toHaveLength(1);
  const result = await client.fetchAgents({ scope: "active" });
  const agent = result.entries.find(
    (entry) => entry.agent.cwd === input.cwd && entry.agent.workspaceId === input.workspaceId,
  );
  if (!agent) {
    throw new Error(`Expected one created agent in ${input.cwd}`);
  }
  return agent.agent.id;
}

async function fetchActiveAgentTitle(
  client: SeedDaemonClient,
  agentId: string,
): Promise<string | null> {
  const result = await client.fetchAgents({ scope: "active" });
  return result.entries.find((entry) => entry.agent.id === agentId)?.agent.title ?? null;
}

test.describe("Workspace agent title handoff", () => {
  test("does not cover the agent pane while the optimistic create becomes authoritative", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });

    const timelineGate = await delayCreatedAgentInitialTailResponse(page);
    const workspace = await seedWorkspace({ repoPrefix: "workspace-create-handoff-flash-" });

    try {
      await page.goto(buildHostWorkspaceRoute(getServerId(), workspace.workspaceId));
      await waitForWorkspaceTabsVisible(page);
      await createAgentTabFromMenu(page);
      await expectComposerVisible(page);

      const prompt = "Keep the optimistic agent pane visible during handoff";
      await submitMessage(page, prompt);
      const agentId = await timelineGate.waitForCreatedAgent();
      await timelineGate.waitForDelayedResponse();

      await expectCreatedChatVisible(page, agentId);
      await expect(mainChat(page).getByText(prompt, { exact: true })).toBeVisible();
      await expect(page.getByTestId("agent-history-overlay")).toHaveCount(0);

      const overlayAppeared = page
        .getByTestId("agent-history-overlay")
        .waitFor({ state: "attached", timeout: 2_000 })
        .then(
          () => true,
          () => false,
        );
      timelineGate.release();
      await timelineGate.waitForForwardedResponse();

      expect(await overlayAppeared).toBe(false);
    } finally {
      timelineGate.release();
      await workspace.cleanup();
    }
  });

  test("shows the prompt chat title and replaces it when the daemon title updates", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });

    const agentCreatedDelay = await delayBrowserAgentCreatedStatus(page);
    const workspace = await seedWorkspace({ repoPrefix: "workspace-title-handoff-" });

    try {
      await page.goto(buildHostWorkspaceRoute(getServerId(), workspace.workspaceId));
      await waitForWorkspaceTabsVisible(page);
      await createAgentTabFromMenu(page);
      await expectComposerVisible(page);

      const promptTitle = "Investigate optimistic tab title handoff";
      const generatedTitle = "Generated Handoff Title";
      await submitMessage(page, `${promptTitle}\n\nMake the UI state deterministic.`);
      await agentCreatedDelay.waitForCreateRequest();
      await agentCreatedDelay.waitForDelayedCreatedStatus();

      const agentId = await waitForCreatedAgentId(workspace.client, {
        cwd: workspace.repoPath,
        workspaceId: workspace.workspaceId,
      });
      const row = chatRow(page, agentId);
      await expect(row).toContainText(promptTitle, { timeout: 15_000 });
      await expect(
        page.getByText(/Loading agent title|Loading\.\.\./).filter({ visible: true }),
      ).toHaveCount(0);

      const userMessage = mainChat(page)
        .getByTestId("user-message")
        .filter({ hasText: promptTitle });
      await expect(userMessage).toBeVisible();
      await expect(userMessage).toHaveAttribute("aria-busy", "true");
      agentCreatedDelay.release();

      await expectCreatedChatVisible(page, agentId);
      await expect(userMessage).toHaveAttribute("aria-busy", "false");
      await expect
        .poll(() => fetchActiveAgentTitle(workspace.client, agentId), { timeout: 10_000 })
        .toBe(promptTitle);
      await expect(row).toContainText(promptTitle, { timeout: 15_000 });
      await row.click({ button: "right" });
      const rename = page.getByTestId(
        `sidebar-workspace-menu-rename-${getServerId()}:chat:${agentId}`,
      );
      await expect(rename).toBeVisible({ timeout: 10_000 });
      await expect(rename).toContainText("Rename");
      await page.keyboard.press("Escape");
      await expect(
        page.getByText(/Loading agent title|Loading\.\.\./).filter({ visible: true }),
      ).toHaveCount(0);

      await workspace.client.updateAgent(agentId, { name: generatedTitle });
      await expect
        .poll(() => fetchActiveAgentTitle(workspace.client, agentId), { timeout: 10_000 })
        .toBe(generatedTitle);
      await expect(row).toContainText(generatedTitle, {
        timeout: 15_000,
      });
    } finally {
      agentCreatedDelay.release();
      await workspace.cleanup();
    }
  });
});
