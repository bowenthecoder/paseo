import { expect, test } from "../support/fixtures";
import { gotoWorkspace } from "../support/helpers/launcher";
import { seedWorkspace } from "../support/helpers/seed-client";
import {
  ensureExplorerSidebar,
  openFilesPanel,
  waitForWorkspaceTabsVisible,
} from "../support/helpers/workspace-tabs";

function explorerSidebar(page: Parameters<typeof ensureExplorerSidebar>[0]) {
  return page.getByTestId("workspace-side-panel").filter({ visible: true });
}

test.describe("Side panel", () => {
  test("starts with Files and Changes, switches views, and toggles without disturbing the chat", async ({
    page,
  }) => {
    const workspace = await seedWorkspace({ repoPrefix: "explorer-sidebar-defaults-" });

    try {
      await gotoWorkspace(page, workspace.workspaceId);
      await waitForWorkspaceTabsVisible(page);
      const explorer = await ensureExplorerSidebar(page);
      await expect(explorer.getByTestId("workspace-side-panel-view-files")).toBeVisible();
      await expect(explorer.getByTestId("workspace-side-panel-view-changes_tree")).toBeVisible();
      await expect(explorer.getByTestId("workspace-new-tab-button")).toHaveCount(0);
      await expect(explorer.getByTestId("workspace-side-panel-close")).toBeVisible();

      await openFilesPanel(page);
      await expect(explorer.getByTestId("file-explorer-tree-scroll")).toBeVisible();

      await explorer.getByTestId("workspace-side-panel-view-changes_tree").click();
      await expect(explorer.getByTestId("changes-tree-panel")).toBeVisible();

      await page.getByTestId("workspace-explorer-toggle").first().click();
      await expect(explorerSidebar(page)).toHaveCount(0);
      // Closing the panel leaves the chat exactly where it was.
      await expect(page.getByTestId("workspace-chat-pane").filter({ visible: true })).toHaveCount(
        1,
      );
    } finally {
      await workspace.cleanup();
    }
  });
});
