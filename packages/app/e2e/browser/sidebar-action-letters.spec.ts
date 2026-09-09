import { access } from "node:fs/promises";
import { test, expect } from "../support/fixtures";
import { gotoAppShell } from "../support/helpers/app";
import { seedSidebarChats } from "../support/helpers/sidebar-chats";
import { getServerId } from "../support/helpers/server-id";

test("context letters act immediately and rename typing stays in the field", async ({
  page,
}, testInfo) => {
  const workspace = await seedSidebarChats(["Letter shortcuts", "Another chat"]);
  const key = `${getServerId()}:chat:${workspace.agents[0].id}`;
  try {
    // Equal workspace/project labels used to hide the folder line. The chat title
    // must make it distinct again without renaming the underlying workspace.
    await workspace.client.renameProject(workspace.projectId, workspace.workspaceName);
    await gotoAppShell(page);
    const row = page.getByTestId(`sidebar-workspace-row-${key}`);
    await row.click();
    const chatPane = page.getByTestId("workspace-chat-pane").filter({ visible: true });
    await expect(chatPane).toHaveCount(1);
    const openMenu = async () => {
      await row.click({ button: "right" });
      const menu = page.getByTestId(`sidebar-workspace-context-menu-${key}`);
      await expect(menu).toBeVisible();
      await expect(menu.locator('[data-menu-item="true"]').first()).toBeFocused();
      await expect(menu).toHaveCSS("opacity", "1");
    };
    await openMenu();
    await expect(page.getByTestId(`sidebar-workspace-menu-rename-${key}`)).toHaveText("RenameR");
    await page.screenshot({ path: "/tmp/paseo-sidebar-menu.png" });
    await page.keyboard.press("u");
    await expect(row).toHaveAttribute("aria-label", /, unread/);
    await expect(page.getByTestId(`sidebar-workspace-context-menu-${key}`)).toBeHidden();
    await openMenu();
    await page.keyboard.press("u");
    await expect(row).not.toHaveAttribute("aria-label", /, unread/);
    await openMenu();
    await page.keyboard.press("r");
    const input = page.getByTestId(`sidebar-workspace-rename-modal-${key}-input`);
    await expect(input).toBeVisible();
    await input.fill("PARU letters remain text");
    await page.getByTestId(`sidebar-workspace-rename-modal-${key}-submit`).click();
    await expect(input).toHaveCount(0);
    await expect(row).toContainText("PARU letters remain text");
    const header = page.getByTestId("workspace-header-title").filter({ visible: true });
    const subtitle = page.getByTestId("workspace-header-subtitle").filter({ visible: true });
    await expect(header).toHaveText("PARU letters remain text");
    await expect(subtitle).toHaveText(workspace.workspaceName);
    await page
      .getByTestId(`sidebar-workspace-row-${getServerId()}:chat:${workspace.agents[1].id}`)
      .click();
    await expect(header).toHaveText("Another chat");
    await row.click();
    await expect(header).toHaveText("PARU letters remain text");
    await page.reload();
    await expect(header).toHaveText("PARU letters remain text");
    await expect(subtitle).toHaveText(workspace.workspaceName);
    const workspaces = await workspace.client.fetchWorkspaces();
    expect(workspaces.entries.find((entry) => entry.id === workspace.workspaceId)).toMatchObject({
      name: workspace.workspaceName,
      workspaceDirectory: workspace.workspaceDirectory,
      projectDisplayName: workspace.workspaceName,
    });
    await page.screenshot({ path: testInfo.outputPath("renamed-chat-header.png") });
    await openMenu();
    await page.keyboard.press("p");
    await openMenu();
    await expect(page.getByTestId(`sidebar-workspace-menu-pin-${key}`)).toContainText("Unpin");
    await openMenu();
    await page.keyboard.press("a");
    await expect(row).toBeHidden();
    await access(workspace.repoPath);
  } catch (error) {
    await page.screenshot({ path: "/tmp/paseo-sidebar-before-cleanup.png" });
    console.log(
      "OPEN PANELS",
      await page
        .locator('[data-testid^="workspace-panel-"]:visible')
        .evaluateAll((elements) => elements.map((element) => element.getAttribute("data-testid"))),
    );
    throw error;
  } finally {
    await workspace.cleanup();
  }
});
