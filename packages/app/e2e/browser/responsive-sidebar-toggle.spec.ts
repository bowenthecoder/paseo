import { test, expect } from "../support/fixtures";
import { openAgentRoute } from "../support/helpers/mock-agent";
import { seedSidebarChats } from "../support/helpers/sidebar-chats";
import { getServerId } from "../support/helpers/server-id";
import { ensureExplorerSidebar } from "../support/helpers/workspace-tabs";
import {
  closeMobileAgentSidebar,
  expectMobileAgentSidebarHidden,
  expectMobileAgentSidebarVisible,
} from "../support/helpers/sidebar";

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
    await expect(page.getByTestId("workspace-side-panel").filter({ visible: true })).toHaveCount(0);
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

test("compact Chats navigation opens and closes without losing either draft", async ({
  page,
}, testInfo) => {
  const workspace = await seedSidebarChats(["First draft", "Second draft"]);
  try {
    await openAgentRoute(page, {
      workspaceId: workspace.workspaceId,
      agentId: workspace.agents[0].id,
    });
    const composers = page.getByTestId("message-input-root").filter({ visible: true });
    await composers.locator("textarea").fill("First unsent draft");
    const firstRow = page.getByTestId(
      `sidebar-workspace-row-${getServerId()}:chat:${workspace.agents[0].id}`,
    );
    const secondRow = page.getByTestId(
      `sidebar-workspace-row-${getServerId()}:chat:${workspace.agents[1].id}`,
    );
    await secondRow.click();
    await expect(composers).toHaveCount(1);
    await composers.locator("textarea").fill("Second unsent draft");
    await page.setViewportSize({ width: 560, height: 700 });
    await expectMobileAgentSidebarHidden(page);
    const menu = page.getByTestId("menu-button").filter({ visible: true }).first();
    await menu.click();
    await expectMobileAgentSidebarVisible(page);
    await expect(secondRow).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: testInfo.outputPath("compact-chat-navigation.png") });
    await closeMobileAgentSidebar(page);
    await expectMobileAgentSidebarHidden(page);
    await expect(composers.locator("textarea")).toHaveValue("Second unsent draft");
    await menu.click();
    await firstRow.click();
    await expectMobileAgentSidebarHidden(page);
    await expect(composers.locator("textarea")).toHaveValue("First unsent draft");
    await menu.click();
    await secondRow.click();
    await expectMobileAgentSidebarHidden(page);
    await expect(composers.locator("textarea")).toHaveValue("Second unsent draft");
    await expect(composers).toBeInViewport({ ratio: 1 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
      .toBeLessThanOrEqual(1);
  } finally {
    await workspace.cleanup();
  }
});
