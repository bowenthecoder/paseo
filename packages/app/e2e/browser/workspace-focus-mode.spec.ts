import { expect, test, type Page } from "../support/fixtures";
import { PARENT_AGENT_ID_LABEL } from "@getpaseo/protocol/agent-labels";
import { openAgentRoute, seedMockAgentWorkspace } from "../support/helpers/mock-agent";
import { expectComposerDraft, fillComposerDraft } from "../support/helpers/composer";

const modifier = process.platform === "darwin" ? "Meta" : "Control";

async function pressFocusModeShortcut(page: Page) {
  await page.keyboard.press(`${modifier}+Shift+F`);
}

async function pressSettingsShortcut(page: Page) {
  await page.keyboard.press(`${modifier}+Comma`);
}

async function pressRightSidebarShortcut(page: Page) {
  await page.keyboard.press(`${modifier}+E`);
}

async function returnToWorkspace(page: Page, workspaceUrl: string) {
  await page.goto(workspaceUrl);
}

async function blurActiveElement(page: Page) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

function exitFocusModeButton(page: Page) {
  return page.getByRole("button", { name: "Exit focus mode" });
}

async function enterFocusMode(page: Page) {
  await blurActiveElement(page);
  await pressFocusModeShortcut(page);
  await expect(exitFocusModeButton(page)).toBeVisible();
}

test("sidebar shortcuts exit focus mode and execute their action", async ({
  page,
  withWorkspace,
}) => {
  const workspace = await withWorkspace({ prefix: "focus-mode-sidebar-shortcut-" });
  await workspace.navigateTo();
  await enterFocusMode(page);

  await pressRightSidebarShortcut(page);

  await expect(exitFocusModeButton(page)).toHaveCount(0);
  await expect(
    page.getByText("Changes", { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible();
});

test("sidebar shortcuts outside a workspace preserve its focus mode", async ({
  page,
  withWorkspace,
}) => {
  const workspace = await withWorkspace({ prefix: "focus-mode-sidebar-boundary-" });
  await workspace.navigateTo();
  await enterFocusMode(page);
  const workspaceUrl = page.url();

  await pressSettingsShortcut(page);
  await expect(page.getByRole("navigation", { name: "Settings" })).toBeVisible();

  await pressRightSidebarShortcut(page);
  await returnToWorkspace(page, workspaceUrl);

  await expect(exitFocusModeButton(page)).toBeVisible();
});

test("focus mode only applies to the active workspace screen", async ({ page, withWorkspace }) => {
  const workspace = await withWorkspace({ prefix: "focus-mode-boundary-" });
  await workspace.navigateTo();
  const exitFocusMode = exitFocusModeButton(page);
  const settingsButton = page.getByRole("button", { name: "Settings", exact: true });
  const settingsSidebar = page.getByRole("navigation", { name: "Settings" });

  await expect(settingsButton).toBeVisible();
  await expect(exitFocusMode).toHaveCount(0);

  await blurActiveElement(page);
  await pressFocusModeShortcut(page);

  await expect(exitFocusMode).toBeVisible();
  await expect(settingsButton).toHaveCount(0);
  const workspaceUrl = page.url();

  await pressSettingsShortcut(page);

  await expect(settingsSidebar).toBeVisible();
  await expect(exitFocusMode).toHaveCount(0);

  await page.reload();
  await expect(settingsSidebar).toBeVisible();
  await expect(exitFocusMode).toHaveCount(0);

  await pressFocusModeShortcut(page);
  await returnToWorkspace(page, workspaceUrl);

  await expect(exitFocusMode).toBeVisible();
  await exitFocusMode.click();

  await expect(exitFocusMode).toHaveCount(0);
  await expect(settingsButton).toBeVisible();
});

test("New terminal leaves focus mode and reveals the requested shell beside the chat", async ({
  page,
  withWorkspace,
}) => {
  const workspace = await withWorkspace({ prefix: "focus-mode-new-terminal-" });
  await workspace.navigateTo();
  await fillComposerDraft(page, "Keep this draft while opening a shell");
  const workspaceUrl = page.url();
  await enterFocusMode(page);

  await page.keyboard.press("ControlOrMeta+Shift+T");

  await expect(exitFocusModeButton(page)).toHaveCount(0);
  await expect(page.getByTestId("workspace-side-panel")).toBeVisible();
  await expect(page.getByTestId("terminal-surface").filter({ visible: true })).toBeVisible();
  await expectComposerDraft(page, "Keep this draft while opening a shell");
  await expect(page).toHaveURL(workspaceUrl);
});

test("file and Tasks actions leave focus mode while background task updates preserve it", async ({
  page,
}) => {
  const session = await seedMockAgentWorkspace({
    repoPrefix: "focus-mode-supporting-views-",
    title: "Focus mode supporting views",
    repo: { files: [{ path: "guide.md", content: "# Focus document\n\nFOCUS_DOCUMENT\n" }] },
    initialPrompt: [
      "Generate a title and a git branch name for a coding agent from the user prompt and attachments.",
      "Return JSON only with fields 'title' and 'branch'.",
      "<user-prompt>",
      "Open `guide.md` now",
      "</user-prompt>",
    ].join("\n"),
  });
  try {
    await openAgentRoute(page, session);
    const documentLink = page.locator('a[href="guide.md"]').filter({ visible: true });
    await expect(documentLink).toBeVisible({ timeout: 30_000 });
    await fillComposerDraft(page, "Keep this focused conversation");
    const workspaceUrl = page.url();
    await enterFocusMode(page);

    const child = await session.client.createAgent({
      provider: "mock",
      cwd: session.cwd,
      workspaceId: session.workspaceId,
      title: "Background child task",
      modeId: "load-test",
      model: "e2e-fast-stream",
      labels: { [PARENT_AGENT_ID_LABEL]: session.agentId },
    });
    const tasks = page.getByTestId("subagents-track-header");
    await expect(tasks).toBeVisible({ timeout: 30_000 });
    await expect(exitFocusModeButton(page)).toBeVisible();
    await expect(page.getByTestId("workspace-side-panel")).not.toBeVisible();

    await documentLink.click();
    await expect(exitFocusModeButton(page)).toHaveCount(0);
    await expect(page.getByTestId("workspace-file-pane")).toContainText("FOCUS_DOCUMENT");
    await expectComposerDraft(page, "Keep this focused conversation");

    await enterFocusMode(page);
    await tasks.click();
    await expect(exitFocusModeButton(page)).toHaveCount(0);
    await expect(page.getByTestId("workspace-side-panel")).toBeVisible();
    await expect(page.getByTestId(`subagents-track-row-${child.id}`)).toBeVisible();
    await expectComposerDraft(page, "Keep this focused conversation");
    await expect(page).toHaveURL(workspaceUrl);

    await enterFocusMode(page);
    await page.reload();
    await expect(exitFocusModeButton(page)).toBeVisible();
    await expect(page.getByTestId("workspace-side-panel")).not.toBeVisible();
    await expectComposerDraft(page, "Keep this focused conversation");
  } finally {
    await session.cleanup();
  }
});
