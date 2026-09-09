import { expect, test } from "../support/fixtures";
import { gotoWorkspace } from "../support/helpers/launcher";
import { seedWorkspace } from "../support/helpers/seed-client";
import { waitForWorkspaceTabsVisible } from "../support/helpers/workspace-tabs";

const CHANGES_SHORTCUT = `${process.platform === "darwin" ? "Meta" : "Control"}+Shift+G`;

test("Changes shortcut reveals the Changes tree in the side panel", async ({ page }) => {
  const workspace = await seedWorkspace({ repoPrefix: "changes-shortcut-side-panel-" });

  try {
    await page.setViewportSize({ width: 1400, height: 900 });
    await gotoWorkspace(page, workspace.workspaceId);
    await waitForWorkspaceTabsVisible(page);

    await page.keyboard.press(CHANGES_SHORTCUT);

    const panel = page.getByTestId("workspace-side-panel").filter({ visible: true });
    await expect(panel.getByTestId("workspace-side-panel-view-changes_tree")).toBeVisible({
      timeout: 30_000,
    });
    await expect(panel.getByTestId("changes-tree-panel")).toBeVisible();
    // The chat keeps its own pane; Changes never takes it over.
    await expect(page.getByTestId("workspace-chat-pane").filter({ visible: true })).toHaveCount(1);
  } finally {
    await workspace.cleanup();
  }
});
