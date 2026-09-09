import { expect, test, type Page } from "../support/fixtures";
import { clickNewChat, gotoWorkspace } from "../support/helpers/launcher";
import { expectComposerDraft, fillComposerDraft } from "../support/helpers/composer";
import { seedWorkspace } from "../support/helpers/seed-client";
import { getServerId } from "../support/helpers/server-id";

async function openDrafts(page: Page) {
  await page.getByTestId("workspace-header-menu-trigger").filter({ visible: true }).click();
  await page.getByTestId("workspace-header-drafts").click();
}

test("New chat reuses the unsent draft and migrated drafts remain recoverable from the menu", async ({
  page,
}) => {
  const workspace = await seedWorkspace({ repoPrefix: "recover-workspace-drafts-" });
  try {
    await gotoWorkspace(page, workspace.workspaceId);
    await clickNewChat(page);
    await fillComposerDraft(page, "Keep the first draft");
    const draftPanel = page
      .locator('[data-testid^="workspace-panel-draft_"]')
      .filter({ visible: true });
    const firstId = await draftPanel.getAttribute("data-testid");
    await clickNewChat(page);
    await expectComposerDraft(page, "Keep the first draft");
    await expect(draftPanel).toHaveAttribute("data-testid", firstId!);
    // Reconstruct the older three-pane shape before app hydration. No active app state is edited.
    const workspaceKey = `${getServerId()}:${workspace.workspaceId}`;
    await page.addInitScript(
      ({ workspaceKey: savedWorkspaceKey }) => {
        if (localStorage.getItem("@paseo:e2e-legacy-drafts")) return;
        const saved = JSON.parse(localStorage.getItem("workspace-layout-state") || "{}");
        const layout = saved.state?.layoutByWorkspace?.[savedWorkspaceKey];
        if (!layout?.root?.group) throw new Error("Expected persisted workspace layout");
        const tab = {
          tabId: "draft_legacy-recovered",
          target: { kind: "draft", draftId: "legacy-recovered" },
          createdAt: Date.now(),
        };
        layout.root.group.children.push({
          kind: "pane",
          pane: {
            id: "legacy-draft-pane",
            tabs: [tab],
            tabIds: [tab.tabId],
            focusedTabId: tab.tabId,
          },
        });
        layout.root.group.sizes = [0.4, 0.3, 0.3];
        saved.version = 2;
        localStorage.setItem("workspace-layout-state", JSON.stringify(saved));
        localStorage.setItem("@paseo:e2e-legacy-drafts", "1");
      },
      { workspaceKey },
    );
    await page.reload();
    await openDrafts(page);
    await page.getByTestId("workspace-recover-draft-legacy-recovered").click();
    await fillComposerDraft(page, "Keep the recovered draft");
    await openDrafts(page);
    await page.getByRole("menuitem", { name: "Keep the first draft", exact: true }).click();
    await expectComposerDraft(page, "Keep the first draft");
    await page.reload();
    await expectComposerDraft(page, "Keep the first draft");
    await openDrafts(page);
    await page.getByRole("menuitem", { name: "Keep the recovered draft", exact: true }).click();
    await expectComposerDraft(page, "Keep the recovered draft");
    await expect(page.getByTestId("workspace-chat-pane").filter({ visible: true })).toHaveCount(1);
  } finally {
    await workspace.cleanup();
  }
});
