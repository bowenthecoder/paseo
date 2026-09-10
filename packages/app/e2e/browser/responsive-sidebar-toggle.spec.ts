import { test, expect } from "../support/fixtures";
import { openAgentRoute } from "../support/helpers/mock-agent";
import { seedSidebarChats } from "../support/helpers/sidebar-chats";
import { getServerId } from "../support/helpers/server-id";
import { ensureExplorerSidebar } from "../support/helpers/workspace-tabs";

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "platform", { get: () => "MacIntel" });
    localStorage.setItem("@paseo:app-settings", JSON.stringify({ theme: "claude" }));
  });
});

test("one click reveals Chats at 800px by yielding Explorer and preserving the draft", async ({
  page,
}) => {
  const workspace = await seedSidebarChats(["Keep my draft"]);
  try {
    await openAgentRoute(page, {
      workspaceId: workspace.workspaceId,
      agentId: workspace.agents[0].id,
    });
    const composer = page.getByTestId("message-input-root").filter({ visible: true });
    const input = composer.locator("textarea");
    await input.fill("An unsent draft stays here");
    await ensureExplorerSidebar(page);
    await page.setViewportSize({ width: 800, height: 700 });
    const row = page.getByTestId(
      `sidebar-workspace-row-${getServerId()}:chat:${workspace.agents[0].id}`,
    );
    const menu = page.getByTestId("menu-button").filter({ visible: true }).first();
    await expect(row).toBeHidden();
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await menu.click();
    await expect(row).toBeVisible();
    await expect(menu).toHaveAttribute("aria-expanded", "true");
    await expect(
      page.getByTestId("workspace-explorer-sidebar").filter({ visible: true }),
    ).toHaveCount(0);
    await expect(page.getByTestId("desktop-sidebar-drawer")).toHaveCount(0);
    await expect(input).toHaveValue("An unsent draft stays here");
    await expect(composer).toBeInViewport({ ratio: 1 });
    await page.keyboard.press("Meta+B");
    await expect(row).toBeHidden();
    await page.keyboard.press("Meta+B");
    await expect(row).toBeVisible();
  } finally {
    await workspace.cleanup();
  }
});

test("two main splits keep their drafts while Chats opens as a dismissible desktop drawer", async ({
  page,
}, testInfo) => {
  const workspace = await seedSidebarChats(["First draft", "Second draft"]);
  try {
    await openAgentRoute(page, {
      workspaceId: workspace.workspaceId,
      agentId: workspace.agents[0].id,
    });
    await page
      .getByTestId("message-input-root")
      .filter({ visible: true })
      .locator("textarea")
      .fill("First unsent draft");
    const row = page.getByTestId(
      `sidebar-workspace-row-${getServerId()}:chat:${workspace.agents[1].id}`,
    );
    await row.click({ button: "right" });
    await page.keyboard.press("o");
    await page.getByTestId("sidebar-open-split-right").click();
    const composers = page.getByTestId("message-input-root").filter({ visible: true });
    await expect(composers).toHaveCount(2);
    await composers.nth(1).locator("textarea").fill("Second unsent draft");
    const explorer = await ensureExplorerSidebar(page);
    await explorer.getByTestId("explorer-sidebar-tab-files").click();
    await page.setViewportSize({ width: 800, height: 700 });
    await expect(row).toBeHidden();
    await page.keyboard.press("Meta+B");
    const drawer = page.getByTestId("desktop-sidebar-drawer");
    await expect(drawer).toBeVisible();
    await expect(row).toBeVisible();
    await expect(
      page.getByTestId("workspace-explorer-sidebar").filter({ visible: true }),
    ).toHaveCount(0);
    await expect(composers).toHaveCount(2);
    await page.screenshot({
      path: testInfo.outputPath("narrow-split-chat-drawer.png"),
      scale: "css",
    });
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
    await expect(row).toBeHidden();
    const menu = page.getByTestId("menu-button").filter({ visible: true }).first();
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await menu.click();
    await expect(drawer).toBeVisible();
    await page.getByTestId("desktop-sidebar-backdrop").click({ position: { x: 700, y: 500 } });
    await expect(drawer).toHaveCount(0);
    await expect(composers.nth(0).locator("textarea")).toHaveValue("First unsent draft");
    await expect(composers.nth(1).locator("textarea")).toHaveValue("Second unsent draft");
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
      .toBeLessThanOrEqual(1);
  } finally {
    await workspace.cleanup();
  }
});
