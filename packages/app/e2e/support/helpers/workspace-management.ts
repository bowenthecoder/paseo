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
  const search = page.getByTestId("sidebar-command-center-search");
  if (options.entry === "sidebar" || (await search.isVisible())) {
    // Compact layouts and focused terminals retain their own shortcuts. The
    // visible Search control works for both without moving terminal focus first.
    await search.click();
  } else {
    // The empty project view has no list header, and therefore no Search button.
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
