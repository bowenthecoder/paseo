import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { gotoAppShell } from "../support/helpers/app";
import { getServerId } from "../support/helpers/server-id";
import { seedSidebarChats } from "../support/helpers/sidebar-chats";

const PIN_SHORTCUT = "ControlOrMeta+Shift+P";

function chatRow(page: Page, agentId: string) {
  return page.getByTestId(`sidebar-workspace-row-${getServerId()}:chat:${agentId}`);
}

async function expectSelectedChat(page: Page, agentId: string, siblingId: string) {
  await expect(chatRow(page, agentId)).toHaveAttribute("aria-selected", "true");
  await expect(chatRow(page, siblingId)).toHaveAttribute("aria-selected", "false");
  await expect(
    page.getByTestId(`workspace-tab-agent_${agentId}`).filter({ visible: true }).first(),
  ).toHaveAttribute("aria-selected", "true");
}

test("Alt-number navigation opens individual chats that share one workspace", async ({ page }) => {
  const workspace = await seedSidebarChats(["First keyboard chat", "Second keyboard chat"]);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  try {
    await gotoAppShell(page);
    const prefix = `sidebar-workspace-row-${getServerId()}:chat:`;
    const rows = page
      .getByTestId("sidebar-chat-section-ungrouped")
      .locator(`[data-testid^="${prefix}"]`);
    await expect(rows).toHaveCount(2);
    // The jump order is the visible sidebar order, including its activity sort.
    const ids = await rows.evaluateAll(
      (elements, rowPrefix) =>
        elements.map((element) => element.getAttribute("data-testid")!.slice(rowPrefix.length)),
      prefix,
    );
    const [first, second] = ids;
    if (!first || !second) throw new Error("Expected two independent sidebar conversations");
    await chatRow(page, second).click();
    await expectSelectedChat(page, second, first);
    const workspaceUrl = page.url();

    await page.keyboard.press("Alt+1");
    await expectSelectedChat(page, first, second);
    await expect(page).toHaveURL(workspaceUrl);
    await page.keyboard.press("Alt+2");
    await expectSelectedChat(page, second, first);
    await expect(page).toHaveURL(workspaceUrl);
    await page.keyboard.press("Alt+1");
    await expectSelectedChat(page, first, second);
    expect(pageErrors).toEqual([]);
  } finally {
    await workspace.cleanup();
  }
});

test("the global pin shortcut follows the selected chat and works with Pinned collapsed", async ({
  page,
}) => {
  const workspace = await seedSidebarChats(["Keep this chat unpinned", "Pin only this chat"]);
  const [first, second] = workspace.agents;
  if (!first || !second) throw new Error("Expected two seeded chats");
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  try {
    await gotoAppShell(page);
    await chatRow(page, first.id).click();
    await expectSelectedChat(page, first.id, second.id);
    await chatRow(page, second.id).click();
    await expectSelectedChat(page, second.id, first.id);
    await page.keyboard.press(PIN_SHORTCUT);
    const pinned = page.getByTestId("sidebar-chat-section-pinned");
    const ungrouped = page.getByTestId("sidebar-chat-section-ungrouped");
    await expect(pinned).toContainText("Pin only this chat");
    await expect(pinned).not.toContainText("Keep this chat unpinned");
    await expect(ungrouped).toContainText("Keep this chat unpinned");
    await expect(chatRow(page, second.id)).toHaveCount(1);

    await page.getByTestId("sidebar-chat-group-pinned").click();
    await expect(chatRow(page, second.id)).toHaveCount(0);
    await page.keyboard.press(PIN_SHORTCUT);
    await expect(ungrouped).toContainText("Pin only this chat");
    await expectSelectedChat(page, second.id, first.id);

    await page.reload();
    await expect(ungrouped).toContainText("Pin only this chat");
    await page.getByTestId("sidebar-chat-group-pinned").click();
    await expect(pinned.locator('[data-testid^="sidebar-workspace-row-"]')).toHaveCount(0);
    await expect(chatRow(page, first.id)).toHaveCount(1);
    await expect(chatRow(page, second.id)).toHaveCount(1);
    expect(pageErrors).toEqual([]);
  } finally {
    await workspace.cleanup();
  }
});
