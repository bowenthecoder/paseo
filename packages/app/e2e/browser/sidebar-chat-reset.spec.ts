import { expect, test } from "../support/fixtures";
import { fetchAgentArchivedAt } from "../support/helpers/archive-tab";
import { waitForDraftComposer } from "../support/helpers/command-center-agent-controls";
import { expectComposerVisible } from "../support/helpers/composer";
import { openAgentRoute, seedMockAgentWorkspace } from "../support/helpers/mock-agent";
import { getServerId } from "../support/helpers/server-id";

// "Reset context" is the menu form of /clear: the old chat goes to History and a fresh
// draft with the same provider and model takes its place, so the model starts clean.
test("the chat menu resets a chat into a fresh draft with the same setup", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  const chat = await seedMockAgentWorkspace({
    repoPrefix: "chat-reset-",
    title: "Remember pineapple",
    model: "ten-second-stream",
  });
  try {
    await openAgentRoute(page, chat);
    await expectComposerVisible(page);
    const row = page.getByTestId(`sidebar-workspace-row-${getServerId()}:chat:${chat.agentId}`);
    await row.click({ button: "right" });
    const reset = page.getByTestId(
      `sidebar-workspace-menu-reset-${getServerId()}:chat:${chat.agentId}`,
    );
    await expect(reset).toBeVisible();
    await page.keyboard.press("n");

    await waitForDraftComposer(page);
    await expect(row).toHaveCount(0);
    await expect
      .poll(() => fetchAgentArchivedAt(chat.client, chat.agentId), { timeout: 15_000 })
      .not.toBeNull();
    // The draft keeps the chat's model so the next message goes to the same kind of agent.
    await expect(page.getByRole("button", { name: /Ten second stream/i }).first()).toBeVisible();
  } finally {
    await chat.cleanup();
  }
});
