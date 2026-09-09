import { test, expect } from "../support/fixtures";
import { openWorkspaceWithAgents } from "../support/helpers/archive-tab";
import {
  expectNoCollapsedComposerToolbarFrame,
  recordComposerToolbarFrames,
} from "../support/helpers/composer-control-density";
import { clickNewChat, gotoWorkspace } from "../support/helpers/launcher";
import { seedWorkspace, type SeededWorkspace } from "../support/helpers/seed-client";
import { getServerId } from "../support/helpers/server-id";

const SETTLE_MS = 1_000;

async function seedSettledMockAgent(workspace: SeededWorkspace, title: string) {
  const agent = await workspace.client.createAgent({
    provider: "mock",
    model: "ten-second-stream",
    modeId: "load-test",
    cwd: workspace.repoPath,
    workspaceId: workspace.workspaceId,
    title,
  });
  await workspace.client.waitForAgentUpsert(
    agent.id,
    (snapshot) => snapshot.status === "idle",
    30_000,
  );
  return { id: agent.id, title, cwd: workspace.repoPath, workspaceId: workspace.workspaceId };
}

async function selectChat(
  page: import("@playwright/test").Page,
  agent: { id: string; title: string },
) {
  await page.getByTestId(`sidebar-workspace-row-${getServerId()}:chat:${agent.id}`).click();
  await expect(
    page.getByTestId(`workspace-panel-agent_${agent.id}`).filter({ visible: true }),
  ).toBeVisible();
}

test.describe("Composer control density across chat switches", () => {
  test.describe.configure({ timeout: 180_000 });

  test("switching between sidebar chats never paints a collapsed composer toolbar", async ({
    page,
  }) => {
    const workspace = await seedWorkspace({ repoPrefix: "composer-density-agents-" });
    try {
      const first = await seedSettledMockAgent(workspace, "First chat");
      const second = await seedSettledMockAgent(workspace, "Second chat");
      await openWorkspaceWithAgents(page, [first, second]);

      await recordComposerToolbarFrames(page);
      await selectChat(page, first);
      await page.waitForTimeout(SETTLE_MS);
      await selectChat(page, second);
      await page.waitForTimeout(SETTLE_MS);

      await expectNoCollapsedComposerToolbarFrame(page);
    } finally {
      await workspace.cleanup();
    }
  });

  test("New chat and Drafts reuse the current composer without collapsing its toolbar", async ({
    page,
  }) => {
    const workspace = await seedWorkspace({ repoPrefix: "composer-density-drafts-" });
    try {
      await page.addInitScript(() => {
        localStorage.setItem(
          "@paseo:create-agent-preferences",
          JSON.stringify({
            provider: "mock",
            providerPreferences: { mock: { mode: "load-test" } },
          }),
        );
      });
      await gotoWorkspace(page, workspace.workspaceId);
      const draftPanels = page
        .locator('[data-testid^="workspace-panel-draft"]')
        .filter({ visible: true });
      await expect(draftPanels).toHaveCount(1, { timeout: 30_000 });
      const firstDraftId = await draftPanels.getAttribute("data-testid");
      const composer = page.getByRole("textbox", { name: "Message agent..." });
      await composer.fill("Keep this first draft");
      await expect(
        page.locator('[data-testid="mode-control"]').filter({ visible: true }).first(),
      ).toBeVisible({ timeout: 30_000 });

      await recordComposerToolbarFrames(page);
      await clickNewChat(page);
      await expect(draftPanels).toHaveCount(1);
      await expect(draftPanels).toHaveAttribute("data-testid", firstDraftId!);
      await expect(composer).toHaveValue("Keep this first draft");
      await expect(page.locator('[data-testid^="workspace-panel-draft"]')).toHaveCount(1);
      await page.waitForTimeout(SETTLE_MS);
      await page.getByTestId("workspace-header-menu-trigger").filter({ visible: true }).click();
      await page.getByTestId("workspace-header-drafts").click();
      await page.getByRole("menuitem", { name: "Keep this first draft", exact: true }).click();
      await expect(draftPanels).toHaveCount(1);
      await expect(draftPanels).toHaveAttribute("data-testid", firstDraftId!);
      await expect(composer).toHaveValue("Keep this first draft");
      await page.waitForTimeout(SETTLE_MS);

      await expectNoCollapsedComposerToolbarFrame(page);
    } finally {
      await workspace.cleanup();
    }
  });
});
