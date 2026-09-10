import { test, expect } from "../support/fixtures";
import { openAgentRoute, seedMockAgentWorkspace } from "../support/helpers/mock-agent";
import { getServerId } from "../support/helpers/server-id";

test("running chats use a quiet glow that stops for reduced motion and completion", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => {
    localStorage.setItem("@paseo:app-settings", JSON.stringify({ theme: "claude" }));
  });
  const agent = await seedMockAgentWorkspace({
    repoPrefix: "sidebar-glow-",
    title: "Working quietly",
    model: "ten-second-stream",
  });
  try {
    await openAgentRoute(page, agent);
    const row = page.getByTestId(`sidebar-workspace-row-${getServerId()}:chat:${agent.agentId}`);
    await expect(row).toBeVisible();
    await agent.client.sendAgentMessage(agent.agentId, "A short sidebar activity check.");
    const glow = row.getByTestId("sidebar-activity-glow");
    await expect(glow).toBeVisible();
    await expect(glow).toHaveAttribute("aria-label", "Running");
    await expect(glow.getByTestId("sidebar-activity-glow-core")).toHaveCSS("width", "5px");
    await expect(glow.getByTestId("sidebar-activity-glow-core")).toHaveCSS(
      "background-color",
      "rgb(195, 194, 184)",
    );
    await expect
      .poll(() =>
        glow.evaluate((element) => element.getAnimations()[0]?.effect?.getTiming().duration),
      )
      .toBe(2800);
    await page.screenshot({ path: testInfo.outputPath("quiet-sidebar-glow.png"), scale: "css" });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect.poll(() => glow.evaluate((element) => element.getAnimations().length)).toBe(0);
    await expect(glow).toHaveCSS("opacity", "0.8");
    await agent.client.waitForFinish(agent.agentId, 30_000);
    await expect(glow).toHaveCount(0);
    await expect(row).toBeVisible();
  } finally {
    await agent.cleanup();
  }
});
