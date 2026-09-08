import { access } from "node:fs/promises";
import path from "node:path";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { gotoAppShell } from "../support/helpers/app";
import { seedSidebarChats } from "../support/helpers/sidebar-chats";
import { getServerId } from "../support/helpers/server-id";
import { chooseAddProjectMethod, addProjectFlowInput } from "../support/helpers/add-project-flow";
import { submitNewWorkspaceEmpty } from "../support/helpers/new-workspace";

async function newGroup(page: Page, name: string): Promise<string> {
  await page.getByTestId("sidebar-new-group").click();
  await page.getByTestId("sidebar-chat-group-editor-input").fill(name);
  await page.getByTestId("sidebar-chat-group-editor-submit").click();
  const heading = page.getByRole("button", { name: `Collapse ${name}`, exact: true });
  await expect(heading).toBeVisible();
  await expect(page.getByTestId("sidebar-chat-group-editor-input")).toHaveCount(0);
  return (await heading.getAttribute("data-testid"))!.replace("sidebar-chat-group-", "");
}

test("manual groups persist, P pins once, M moves, and group removal preserves chats and folders", async ({
  page,
}) => {
  const workspace = await seedSidebarChats(["Review orders", "Sibling chat"]);
  const key = `${getServerId()}:chat:${workspace.agents[0].id}`;
  const row = page.getByTestId(`sidebar-workspace-row-${key}`);
  try {
    await gotoAppShell(page);
    await expect(page.locator('[data-testid^="sidebar-project-row-"]')).toHaveCount(0);
    await expect(page.getByTestId("sidebar-chat-section-ungrouped")).toContainText("Review orders");
    const id = await newGroup(page, "CueRetail");
    await row.click({ button: "right" });
    await page.keyboard.press("m");
    await page.getByTestId(`sidebar-move-group-${id}`).click();
    await expect(page.getByTestId(`sidebar-chat-section-${id}`)).toContainText("Review orders");
    await row.click({ button: "right" });
    await page.keyboard.press("p");
    await expect(page.getByTestId("sidebar-chat-section-pinned")).toContainText("Review orders");
    await expect(row).toHaveCount(1);
    await expect(page.getByTestId("sidebar-chat-section-ungrouped")).toContainText("Sibling chat");
    await expect(page.getByTestId("sidebar-chat-section-pinned")).not.toContainText("Sibling chat");
    await page.reload();
    await expect(page.getByTestId("sidebar-chat-section-pinned")).toContainText("Review orders");
    await row.click({ button: "right" });
    await page.keyboard.press("p");
    await expect(page.getByTestId(`sidebar-chat-section-${id}`)).toContainText("Review orders");
    await page.getByTestId(`sidebar-group-menu-${id}`).click();
    await page.getByRole("menuitem", { name: "Rename group", exact: true }).click();
    await page.getByTestId("sidebar-chat-group-editor-input").fill("Operations");
    await page.getByTestId("sidebar-chat-group-editor-submit").click();
    await expect(page.getByRole("button", { name: "Collapse Operations" })).toBeVisible();
    await page.getByTestId(`sidebar-group-menu-${id}`).click();
    await page.getByRole("menuitem", { name: "Remove group", exact: true }).click();
    await expect(page.getByTestId("sidebar-chat-section-ungrouped")).toContainText("Review orders");
    await expect(page.getByTestId(`sidebar-chat-section-${id}`)).toHaveCount(0);
    await access(workspace.repoPath);
  } finally {
    await workspace.cleanup();
  }
});

test("drag chats into groups, into Pinned, and back to Ungrouped", async ({ page }) => {
  const workspace = await seedSidebarChats(["Shipping review"]);
  const key = `${getServerId()}:chat:${workspace.agents[0].id}`;
  const row = page.getByTestId(`sidebar-workspace-row-${key}`);
  const dragTo = async (id: string) => {
    await row.click({ trial: true });
    const source = await row.boundingBox();
    const target = await page.getByTestId(`sidebar-chat-group-${id}`).boundingBox();
    await page.mouse.move(source!.x + 100, source!.y + source!.height / 2);
    await page.mouse.down();
    await page.mouse.move(source!.x + 110, source!.y + source!.height / 2, { steps: 4 });
    await page.mouse.move(target!.x + 100, target!.y + target!.height / 2, { steps: 15 });
    const feedback = page.getByTestId(`sidebar-group-drop-${id}`).locator(":scope > div");
    await expect(feedback).toHaveCSS("outline-style", "solid");
    await expect(feedback).not.toHaveCSS("outline-color", "rgb(0, 0, 0)");
    await page.mouse.up();
  };
  try {
    await gotoAppShell(page);
    const id = await newGroup(page, "Tloom");
    await dragTo(id);
    await expect(page.getByTestId(`sidebar-chat-section-${id}`)).toContainText("Shipping review");
    await dragTo("pinned");
    await expect(page.getByTestId("sidebar-chat-section-pinned")).toContainText("Shipping review");
    await dragTo("ungrouped");
    await expect(page.getByTestId("sidebar-chat-section-ungrouped")).toContainText(
      "Shipping review",
    );
    await page.reload();
    await expect(page.getByTestId("sidebar-chat-section-ungrouped")).toContainText(
      "Shipping review",
    );
    await access(workspace.repoPath);
  } finally {
    await workspace.cleanup();
  }
});

test("folder selection associates chats with the chosen group and creates in the correct directory", async ({
  page,
}) => {
  const workspace = await seedSidebarChats(["Existing task"]);
  try {
    await gotoAppShell(page);
    const id = await newGroup(page, "Working folder");
    await page.getByTestId(`sidebar-group-menu-${id}`).click();
    await page.getByRole("menuitem", { name: "Choose working folder…", exact: true }).click();
    await chooseAddProjectMethod(page, "directory-search");
    await addProjectFlowInput(page).fill(workspace.repoPath);
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("add-project-flow")).toHaveCount(0);
    await expect(page.getByTestId(`sidebar-chat-section-${id}`)).toContainText("Existing task");
    await page.getByTestId("sidebar-global-new-workspace").click();
    await expect(page.getByTestId("host-picker-trigger")).toBeVisible();
    await expect(page.getByRole("button", { name: "Working folder", exact: true })).toContainText(
      "No folder",
    );
    await page.getByTestId(`sidebar-group-new-chat-${id}`).click();
    await expect(page.getByRole("button", { name: "Working folder", exact: true })).toContainText(
      path.basename(workspace.repoPath),
    );
    expect(new URL(page.url()).searchParams.get("dir")).toBe(workspace.repoPath);
    expect(new URL(page.url()).searchParams.get("serverId")).toBe(getServerId());
    await submitNewWorkspaceEmpty(page);
    await expect(page).toHaveURL(/\/workspace\//);
    const createdId = new URL(page.url()).pathname.split("/").at(-1)!;
    const listing = await workspace.client.fetchWorkspaces();
    expect(listing.entries.find((entry) => entry.id === createdId)?.workspaceDirectory).toBe(
      workspace.repoPath,
    );
    // An empty working folder is not a conversation. Its first chat inherits the chosen group.
    const createdChat = await workspace.client.createAgent({
      provider: "mock",
      cwd: workspace.repoPath,
      workspaceId: createdId,
      title: "New group task",
      modeId: "load-test",
      model: "e2e-fast-stream",
    });
    await expect(
      page
        .getByTestId(`sidebar-chat-section-${id}`)
        .getByTestId(`sidebar-workspace-row-${getServerId()}:chat:${createdChat.id}`),
    ).toBeVisible();
    if (createdId !== workspace.workspaceId) await workspace.client.archiveWorkspace(createdId);
  } finally {
    await workspace.cleanup();
  }
});

test("A archives only the clicked chat and opening clears its unread marker", async ({ page }) => {
  const workspace = await seedSidebarChats(["Archive only me", "Keep sibling"]);
  try {
    await gotoAppShell(page);
    const key = `${getServerId()}:chat:${workspace.agents[0].id}`;
    const row = page.getByTestId(`sidebar-workspace-row-${key}`);
    const sibling = page.getByTestId(
      `sidebar-workspace-row-${getServerId()}:chat:${workspace.agents[1].id}`,
    );
    await expect(sibling).toBeVisible();
    await row.click({ button: "right" });
    await page.keyboard.press("u");
    await expect(row).toHaveAttribute("aria-label", /, unread/);
    await row.click();
    await expect(row).not.toHaveAttribute("aria-label", /, unread/);
    await sibling.click(); // Archive a chat other than the selected chat.
    await row.click({ button: "right" });
    await page.keyboard.press("a");
    await expect(row).toHaveCount(0);
    await expect(sibling).toBeVisible();
    expect(
      (await workspace.client.fetchAgent({ agentId: workspace.agents[0].id }))?.agent.archivedAt,
    ).toBeTruthy();
    expect(
      (await workspace.client.fetchAgent({ agentId: workspace.agents[1].id }))?.agent.archivedAt,
    ).toBeFalsy();
    expect(
      (await workspace.client.fetchWorkspaces()).entries.some(
        (entry) => entry.id === workspace.workspaceId,
      ),
    ).toBe(true);
    await page.reload();
    await expect(row).toHaveCount(0);
    await expect(sibling).toBeVisible();
    await access(workspace.repoPath);
  } finally {
    await workspace.cleanup();
  }
});
