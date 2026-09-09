import { test, expect } from "../support/fixtures";
import { expectComposerVisible } from "../support/helpers/composer";
import { openAgentRoute, seedMockAgentWorkspace } from "../support/helpers/mock-agent";

// The real app, daemon, transport and persisted timeline run against the explicit
// development provider fixture. This verifies presentation, not a live model call.
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`shows failed and canceled outcomes before expansion at ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
      localStorage.setItem(
        "@paseo:app-settings",
        JSON.stringify({ toolCallDetailLevel: "overview" }),
      );
    });
    const agent = await seedMockAgentWorkspace({
      repoPrefix: "overview-outcomes-",
      title: "Tool outcomes",
    });
    try {
      await openAgentRoute(page, agent);
      await expectComposerVisible(page);
      await agent.client.sendAgentMessage(agent.agentId, "Emit the overview tool outcome fixture.");
      await agent.client.waitForFinish(agent.agentId, 30_000);
      const group = page.getByTestId("tool-call-group");
      const expected = "Ran 1 command (1 failed), read overview-fixture.ts, 1 tool canceled";
      await expect(group).toHaveCount(1);
      await expect(group).toContainText(expected);
      await expect(group).not.toContainText("edited");
      await page.screenshot({ path: testInfo.outputPath("collapsed-outcomes.png") });
      await group.click();
      await expect(page.getByTestId("tool-call-badge").filter({ visible: true })).toHaveCount(3);
      await page.getByTestId("tool-call-badge").filter({ visible: true }).first().click();
      await expect(page.getByText("Fixture command failed", { exact: true }).first()).toBeVisible();
      await page.reload();
      await expectComposerVisible(page);
      await expect(page.getByTestId("tool-call-group")).toHaveCount(1);
      await expect(page.getByTestId("tool-call-group")).toContainText(expected);
    } catch (error) {
      await page.screenshot({ path: testInfo.outputPath("outcomes-before-cleanup.png") });
      await testInfo.attach("pane-geometry", {
        body: JSON.stringify(
          await page.locator("textarea, [data-testid^='workspace-pane-']").evaluateAll((elements) =>
            elements.map((element) => ({
              tag: element.tagName,
              testId: element.getAttribute("data-testid"),
              bounds: element.getBoundingClientRect().toJSON(),
            })),
          ),
          null,
          2,
        ),
        contentType: "application/json",
      });
      throw error;
    } finally {
      await agent.cleanup();
    }
  });
}
