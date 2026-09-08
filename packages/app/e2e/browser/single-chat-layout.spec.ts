import { expect, test } from "../support/fixtures";
import { openCommandCenter } from "../support/helpers/command-center";
import { openAgentRoute } from "../support/helpers/mock-agent";
import { seedSidebarChats } from "../support/helpers/sidebar-chats";

/**
 * A workspace is one chat. Everything that used to be a tab or a split is either gone or
 * lives in the single right-hand side panel, so these assertions are as much about what is
 * absent as about what works.
 */
test("a workspace shows one chat, with terminal and browser in one side panel", async ({
  page,
}) => {
  const workspace = await seedSidebarChats(["Single chat layout"]);
  try {
    await openAgentRoute(page, {
      agentId: workspace.agents[0].id,
      workspaceId: workspace.workspaceId,
    });

    const chatPane = page.getByTestId("workspace-chat-pane").filter({ visible: true });
    await expect(chatPane.first()).toBeVisible({ timeout: 30_000 });

    // No tab strip, no new-tab button, no second pane.
    await expect(page.getByTestId("workspace-tabs-row")).toHaveCount(0);
    await expect(page.getByTestId("workspace-new-tab-button")).toHaveCount(0);
    await expect(page.getByTestId("workspace-new-tab-panel")).toHaveCount(0);
    await expect(page.getByTestId("workspace-split-pane-menu")).toHaveCount(0);
    await expect(chatPane).toHaveCount(1);

    // Header: title on the left, terminal / browser / more on the right.
    await expect(page.getByTestId("workspace-header-title")).toBeVisible();
    await expect(
      page.getByTestId("workspace-header-terminal-toggle").filter({ visible: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByTestId("workspace-header-menu-trigger").filter({ visible: true }).first(),
    ).toBeVisible();

    // The workspace menu offers the side panel's views, never a split.
    await page
      .getByTestId("workspace-header-menu-trigger")
      .filter({ visible: true })
      .first()
      .click();
    const menu = page.getByTestId("workspace-header-menu").filter({ visible: true }).first();
    await expect(menu).toBeVisible();
    await expect(menu.getByTestId("workspace-header-open-files")).toBeVisible();
    await expect(menu.getByText("Split right")).toHaveCount(0);
    await expect(menu.getByText("Split below")).toHaveCount(0);
    await expect(menu.getByText("Open to the side")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);

    // The terminal button opens the side panel with a terminal in it.
    await expect(page.getByTestId("workspace-side-panel")).toHaveCount(0);
    await page
      .getByTestId("workspace-header-terminal-toggle")
      .filter({ visible: true })
      .first()
      .click();
    const sidePanel = page.getByTestId("workspace-side-panel").filter({ visible: true }).first();
    await expect(sidePanel).toBeVisible({ timeout: 30_000 });
    await expect(
      page.locator('[data-testid^="workspace-panel-terminal_"]').filter({ visible: true }).first(),
    ).toBeVisible({ timeout: 30_000 });
    // The chat is still there beside it.
    await expect(chatPane.first()).toBeVisible();

    // Escape puts the panel away.
    await page.getByTestId("workspace-header-title").click();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("workspace-side-panel")).toHaveCount(0, { timeout: 15_000 });
  } finally {
    await workspace.cleanup();
  }
});

test("the command center offers no split or open-beside actions", async ({ page }) => {
  const workspace = await seedSidebarChats(["Command centre single chat"]);
  try {
    await openAgentRoute(page, {
      agentId: workspace.agents[0].id,
      workspaceId: workspace.workspaceId,
    });
    const panel = await openCommandCenter(page);
    for (const label of [
      "Split pane right",
      "Split pane down",
      "Close pane",
      "Move tab left",
      "Focus pane left",
      "Previous tab",
      "Next tab",
    ]) {
      await expect(panel.getByText(label, { exact: true })).toHaveCount(0);
    }
    await page.keyboard.press("Escape");
  } finally {
    await workspace.cleanup();
  }
});

test("the sidebar chat menu has no split entries", async ({ page }) => {
  const workspace = await seedSidebarChats(["Sidebar single chat"]);
  try {
    await openAgentRoute(page, {
      agentId: workspace.agents[0].id,
      workspaceId: workspace.workspaceId,
    });
    await expect(page.getByTestId("sidebar-open-split-right")).toHaveCount(0);
    await expect(page.getByTestId("sidebar-open-split-below")).toHaveCount(0);
  } finally {
    await workspace.cleanup();
  }
});
