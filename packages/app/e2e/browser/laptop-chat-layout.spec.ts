import { expect, test } from "../support/fixtures";
import { openAgentRoute } from "../support/helpers/mock-agent";
import { seedSidebarChats } from "../support/helpers/sidebar-chats";
import { ensureExplorerSidebar } from "../support/helpers/workspace-tabs";

test("chat and composer stay visible when a laptop window shrinks beside Explorer", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.addInitScript(() => {
    localStorage.setItem("@paseo:app-settings", JSON.stringify({ theme: "claude" }));
  });
  const workspace = await seedSidebarChats(["Laptop layout check"]);
  try {
    await openAgentRoute(page, {
      agentId: workspace.agents[0].id,
      workspaceId: workspace.workspaceId,
    });
    const composer = page.getByTestId("message-input-root").filter({ visible: true });
    const input = composer.locator("textarea");
    await expect(composer).toBeInViewport({ ratio: 1 });
    await input.fill(Array.from({ length: 40 }, (_, i) => `Draft line ${i + 1}`).join("\n"));
    await expect(composer).toBeInViewport({ ratio: 1 });
    await ensureExplorerSidebar(page);
    await page.setViewportSize({ width: 800, height: 600 });
    await expect(composer).toBeInViewport({ ratio: 1 });
    await expect
      .poll(async () => (await composer.boundingBox())?.width ?? 0)
      .toBeGreaterThanOrEqual(360);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
      .toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath("laptop-chat.png") });
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(composer).toBeInViewport({ ratio: 1 });
    await expect(input).toHaveValue(/Draft line 40/);
  } finally {
    await workspace.cleanup();
  }
});
