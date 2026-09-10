import { expect } from "@playwright/test";
import { test } from "../support/fixtures";
import { gotoWorkspace } from "../support/helpers/launcher";
import { seedWorkspace } from "../support/helpers/seed-client";
import { waitForWorkspaceTabsVisible } from "../support/helpers/workspace-tabs";

const MODIFIER = process.platform === "darwin" ? "Meta" : "Control";

test.describe("side panel keyboard", () => {
  test("Cmd+E reveals the side panel with the repository Changes tree", async ({ page }) => {
    const workspace = await seedWorkspace({ repoPrefix: "side-panel-keyboard-" });

    try {
      await gotoWorkspace(page, workspace.workspaceId);
      await waitForWorkspaceTabsVisible(page);

      await page.keyboard.press(`${MODIFIER}+E`);
      const panel = page.getByTestId("workspace-side-panel").filter({ visible: true });
      await expect(panel).toBeVisible({ timeout: 30_000 });
      await expect(panel.getByTestId("workspace-side-panel-view-changes_tree")).toBeVisible();
      await expect(panel.getByTestId("changes-tree-panel")).toBeVisible();
    } finally {
      await workspace.cleanup();
    }
  });

  test("Escape closes the side panel", async ({ page }) => {
    const workspace = await seedWorkspace({ repoPrefix: "side-panel-escape-" });

    try {
      await gotoWorkspace(page, workspace.workspaceId);
      await waitForWorkspaceTabsVisible(page);
      await page.keyboard.press(`${MODIFIER}+E`);
      await expect(page.getByTestId("workspace-side-panel").filter({ visible: true })).toBeVisible({
        timeout: 30_000,
      });

      // Escape yields to the composer (interrupt) and to a focused terminal, so this is the
      // case it owns: focus outside both, panel open.
      await page.getByTestId("workspace-header-title").click();
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("workspace-side-panel")).toHaveCount(0, { timeout: 15_000 });
    } finally {
      await workspace.cleanup();
    }
  });
});
