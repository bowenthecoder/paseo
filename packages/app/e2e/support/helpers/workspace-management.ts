import { expect, type Page } from "@playwright/test";

/**
 * Workspace and worktree lifecycle controls remain in the optional project view.
 * Select it through the public command, without changing the default chat view
 * or confusing its per-chat Archive action with archiving a whole workspace.
 */
export async function selectSidebarProjectGrouping(
  page: Page,
  options: { entry?: "keyboard" | "sidebar" } = {},
): Promise<void> {
  await expect(page.getByTestId("sidebar-global-new-workspace")).toBeVisible({
    timeout: 30_000,
  });
  if (options.entry === "sidebar") {
    // Compact layouts disable global keyboard shortcuts; use the same visible
    // command-center control available to a touch user, keeping the sidebar open.
    await page.getByTestId("sidebar-command-center-search").click();
  } else {
    await page.keyboard.press("ControlOrMeta+K");
  }
  const panel = page.getByTestId("command-center-panel");
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await panel.getByTestId("command-center-input").fill("Group by");

  const groupByProject = panel.getByRole("button", { name: /^Group by project(?:\s|$)/u });
  const groupByStatus = panel.getByRole("button", { name: /^Group by status(?:\s|$)/u });
  await expect(groupByProject.or(groupByStatus)).toBeVisible({ timeout: 15_000 });

  if (await groupByProject.isVisible()) {
    await groupByProject.click();
  } else {
    // The command always offers the other automatic mode, so Group by status
    // means project grouping is already active. Leave the current view intact.
    await page.keyboard.press("Escape");
  }
  await expect(panel).not.toBeVisible();
}
