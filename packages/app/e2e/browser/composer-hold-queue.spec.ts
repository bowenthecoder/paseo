import { expect, test, type Page } from "../support/fixtures";
import { expectAgentIdle } from "../support/helpers/agent-stream";
import {
  expectComposerDraft,
  expectComposerVisible,
  fillComposerDraft,
  holdDraftInQueue,
} from "../support/helpers/composer";
import { openAgentRoute, seedMockAgentWorkspace } from "../support/helpers/mock-agent";

const HELD_ROW = '[data-testid="composer-queued-message"]';

function heldRows(page: Page) {
  return page.locator(HELD_ROW).filter({ visible: true });
}

function userMessages(page: Page) {
  return page.getByTestId("user-message");
}

/** An agent that is sitting idle: nothing here should ever leave the queue on its own. */
async function openIdleAgent(page: Page, repoPrefix: string) {
  const agent = await seedMockAgentWorkspace({ repoPrefix, title: "Hold queue" });
  try {
    await openAgentRoute(page, { workspaceId: agent.workspaceId, agentId: agent.agentId });
    await expectComposerVisible(page);
    await expectAgentIdle(page);
  } catch (error) {
    await agent.cleanup();
    throw error;
  }
  return agent;
}

async function holdMessage(page: Page, text: string): Promise<void> {
  await fillComposerDraft(page, text);
  await holdDraftInQueue(page);
  await expectComposerDraft(page, "");
}

test.describe("Composer hold queue", () => {
  test("holds a draft with Cmd/Ctrl+Shift+Enter and never sends it on its own", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const agent = await openIdleAgent(page, "hold-queue-hold-");
    try {
      await holdMessage(page, "held while idle");

      const row = heldRows(page).first();
      await expect(row).toBeVisible({ timeout: 10_000 });
      await expect(row).toContainText("held while idle");
      await expect(row.getByTestId("composer-queued-message-held")).toBeVisible();

      // The agent is idle and nothing drains a held message, so the transcript stays empty.
      await page.waitForTimeout(2_000);
      await expect(userMessages(page)).toHaveCount(0);
      await expect(heldRows(page)).toHaveCount(1);
      await expectAgentIdle(page);
    } finally {
      await agent.cleanup();
    }
  });

  test("offers a Queue button next to Send once the draft has content", async ({ page }) => {
    test.setTimeout(120_000);
    const agent = await openIdleAgent(page, "hold-queue-button-");
    try {
      const queueButton = page
        .getByRole("button", { name: "Queue message without sending" })
        .filter({ visible: true })
        .first();
      await expect(queueButton).toHaveCount(0);

      await fillComposerDraft(page, "queued by button");
      await expect(queueButton).toBeVisible({ timeout: 10_000 });
      await queueButton.click();

      await expectComposerDraft(page, "");
      await expect(heldRows(page).first()).toContainText("queued by button");
      await expect(userMessages(page)).toHaveCount(0);
    } finally {
      await agent.cleanup();
    }
  });

  test("Send now sends a held message and Remove drops one without sending", async ({ page }) => {
    test.setTimeout(120_000);
    const agent = await openIdleAgent(page, "hold-queue-row-actions-");
    try {
      await holdMessage(page, "send me now");
      await page.getByRole("button", { name: "Send queued message now" }).first().click();

      await expect(userMessages(page).filter({ hasText: "send me now" })).toHaveCount(1, {
        timeout: 30_000,
      });
      await expect(heldRows(page)).toHaveCount(0);

      await holdMessage(page, "drop me");
      await expect(heldRows(page)).toHaveCount(1);
      await page.getByRole("button", { name: "Remove queued message" }).first().click();

      await expect(heldRows(page)).toHaveCount(0);
      await expect(userMessages(page).filter({ hasText: "drop me" })).toHaveCount(0);
    } finally {
      await agent.cleanup();
    }
  });

  test("Send all submits every held message in queue order", async ({ page }) => {
    test.setTimeout(120_000);
    const agent = await openIdleAgent(page, "hold-queue-send-all-");
    try {
      await holdMessage(page, "first held message");
      await holdMessage(page, "second held message");
      await expect(heldRows(page)).toHaveCount(2);
      await expect(userMessages(page)).toHaveCount(0);

      await page.getByTestId("composer-queue-send-all").filter({ visible: true }).first().click();

      await expect(userMessages(page).filter({ hasText: "second held message" })).toHaveCount(1, {
        timeout: 60_000,
      });
      await expect(heldRows(page)).toHaveCount(0);

      const order = await userMessages(page).allInnerTexts();
      const first = order.findIndex((text) => text.includes("first held message"));
      const second = order.findIndex((text) => text.includes("second held message"));
      expect(first).toBeGreaterThanOrEqual(0);
      expect(second).toBeGreaterThan(first);
    } finally {
      await agent.cleanup();
    }
  });
});
