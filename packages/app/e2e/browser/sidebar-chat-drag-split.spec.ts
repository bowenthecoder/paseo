import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { openAgentRoute, seedMockAgentWorkspace } from "../support/helpers/mock-agent";
import { getServerId } from "../support/helpers/server-id";
import { agentPanel } from "../support/helpers/workspace-tabs";

function chatRow(page: Page, agentId: string): Locator {
  return page.getByTestId(`sidebar-workspace-row-${getServerId()}:chat:${agentId}`);
}

async function center(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Element has no layout box");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Picks the row up with the mouse and holds it over the chat grid without releasing. */
async function holdChatOverGrid(page: Page, agentId: string): Promise<Locator> {
  const row = chatRow(page, agentId);
  await row.click({ trial: true });
  const from = await center(row);
  const to = await center(page.getByTestId("workspace-chat-grid"));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 8, from.y + 4, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 15 });
  const overlay = page.getByTestId("chat-split-drop-overlay");
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveAttribute("data-over", "true");
  await expect(page.getByTestId("chat-drag-chip")).toBeVisible();
  return overlay;
}

/** Releases the row and waits for the drag to be fully over before the test continues. */
async function releaseDrag(page: Page): Promise<void> {
  await page.mouse.up();
  await expect(page.getByTestId("chat-split-drop-overlay")).toHaveCount(0);
  await expect(page.getByTestId("chat-drag-chip")).toHaveCount(0);
  // dnd-kit swallows the click that immediately follows a pointer drag; a person cannot
  // click again within this window, so the test waits it out before pressing anything.
  await page.waitForTimeout(300);
}

test("dragging a sidebar chat onto the chat area opens it in a split view", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 960 });
  const left = await seedMockAgentWorkspace({
    repoPrefix: "drag-split-left-",
    title: "Primary conversation",
  });
  const right = await seedMockAgentWorkspace({
    repoPrefix: "drag-split-right-",
    title: "Dragged conversation",
  });
  try {
    await openAgentRoute(page, left);
    const leftPanel = agentPanel(page, left.agentId);
    await expect(leftPanel).toBeVisible();
    const leftInput = leftPanel.getByTestId("message-input-root").locator("textarea");
    await leftInput.fill("Keep the primary draft");
    const primaryUrl = page.url();

    const overlay = await holdChatOverGrid(page, right.agentId);
    await expect(overlay).toHaveAttribute("data-enabled", "true");
    await expect(overlay).toContainText('Open "Dragged conversation" in split view');
    await releaseDrag(page);

    await expect(
      page
        .getByTestId("workspace-chat-view-chat-2")
        .getByTestId(`workspace-panel-agent_${right.agentId}`),
    ).toBeVisible();
    await expect(leftPanel).toBeVisible();
    await expect(leftInput).toHaveValue("Keep the primary draft");
    await expect(page).toHaveURL(primaryUrl);
    // The chat is a view now, not a move: its sidebar row is still where it was.
    await expect(chatRow(page, right.agentId)).toBeVisible();
    await expect(chatRow(page, left.agentId)).toHaveAttribute("aria-selected", "true");
  } finally {
    await Promise.all([left.cleanup(), right.cleanup()]);
  }
});

test("the chat area refuses the current chat and a fifth chat, and says why", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 960 });
  const current = await seedMockAgentWorkspace({
    repoPrefix: "drag-split-current-",
    title: "Current conversation",
  });
  const extra = await seedMockAgentWorkspace({
    repoPrefix: "drag-split-extra-",
    title: "Extra conversation",
  });
  try {
    await openAgentRoute(page, current);
    await expect(agentPanel(page, current.agentId)).toBeVisible();

    let overlay = await holdChatOverGrid(page, current.agentId);
    await expect(overlay).toHaveAttribute("data-enabled", "false");
    await expect(overlay).toContainText("This chat is already in the current view.");
    await releaseDrag(page);
    await expect(page.getByTestId("workspace-chat-view-chat-2")).toHaveCount(0);

    await page.getByTestId("workspace-four-chat-views").click();
    for (const paneId of ["chat-2", "chat-3", "chat-4"]) {
      await expect(page.getByTestId(`workspace-chat-view-${paneId}`)).toBeVisible();
    }
    // Empty views are reusable, so fill them before asking for a fifth chat.
    const fillers = [] as Array<{ cleanup: () => Promise<void> }>;
    for (let index = 0; index < 3; index += 1) {
      const filler = await seedMockAgentWorkspace({
        repoPrefix: `drag-split-filler-${index}-`,
        title: `Filler ${index + 1}`,
      });
      fillers.push(filler);
      const fillerOverlay = await holdChatOverGrid(page, filler.agentId);
      await expect(fillerOverlay).toHaveAttribute("data-enabled", "true");
      await releaseDrag(page);
      await expect(page.getByTestId(`workspace-panel-agent_${filler.agentId}`)).toBeVisible();
    }
    try {
      overlay = await holdChatOverGrid(page, extra.agentId);
      await expect(overlay).toHaveAttribute("data-enabled", "false");
      await expect(overlay).toContainText("Four chat views are already open. Close a view first.");
      await releaseDrag(page);
      await expect(page.getByTestId(`workspace-panel-agent_${extra.agentId}`)).toHaveCount(0);
      await expect(page.getByTestId("workspace-chat-view-chat-4")).toBeVisible();
    } finally {
      await Promise.all(fillers.map((filler) => filler.cleanup()));
    }
  } finally {
    await Promise.all([current.cleanup(), extra.cleanup()]);
  }
});
