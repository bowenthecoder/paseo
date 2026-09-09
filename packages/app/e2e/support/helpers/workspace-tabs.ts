import { expect, type Locator, type Page } from "@playwright/test";

function visibleTestId(page: Page, testId: string) {
  return page.getByTestId(testId).filter({ visible: true });
}

/**
 * A workspace shows one chat and one side panel. Each mounted surface carries
 * `workspace-panel-<tabId>`, and only the one on screen is visible — that is how a spec asks
 * "which chat am I looking at" now that there is no tab strip to read.
 */
export function workspacePanelTestId(kind: string, id?: string): string {
  return id ? `workspace-panel-${kind}_${id}` : `workspace-panel-${kind}`;
}

export function agentPanel(page: Page, agentId: string): Locator {
  return visibleTestId(page, workspacePanelTestId("agent", agentId));
}

export async function getVisibleWorkspacePanelTestIds(page: Page): Promise<string[]> {
  const panels = page.locator('[data-testid^="workspace-panel-"]').filter({ visible: true });
  const count = await panels.count();
  const ids: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const testId = await panels.nth(index).getAttribute("data-testid");
    if (testId && !ids.includes(testId)) {
      ids.push(testId);
    }
  }
  return ids;
}

export async function getVisibleWorkspaceAgentPanelIds(page: Page): Promise<string[]> {
  return (await getVisibleWorkspacePanelTestIds(page)).filter((id) =>
    id.startsWith("workspace-panel-agent_"),
  );
}

export async function expectOnlyWorkspaceAgentPanelVisible(
  page: Page,
  agentId: string,
): Promise<void> {
  await expect(agentPanel(page, agentId)).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(() => getVisibleWorkspaceAgentPanelIds(page))
    .toEqual([workspacePanelTestId("agent", agentId)]);
}

export async function expectWorkspaceAgentPanelHidden(page: Page, agentId: string): Promise<void> {
  await expect(agentPanel(page, agentId)).toHaveCount(0, { timeout: 30_000 });
}

// ─── Side panel ────────────────────────────────────────────────────────────

export function sidePanel(page: Page): Locator {
  return visibleTestId(page, "workspace-side-panel").first();
}

/** Reveal the side panel without changing which view it shows. */
export async function ensureExplorerSidebar(page: Page): Promise<Locator> {
  const toggle = page.getByTestId("workspace-explorer-toggle").first();
  await expect(toggle).toBeVisible({ timeout: 30_000 });
  const panel = sidePanel(page);
  if ((await panel.count()) === 0) {
    await toggle.click();
  }
  await expect(panel).toBeVisible({ timeout: 30_000 });
  return panel;
}

export async function closeSidePanel(page: Page): Promise<void> {
  const close = visibleTestId(page, "workspace-side-panel-close").first();
  if ((await close.count()) > 0) {
    await close.click();
  }
  await expect(page.getByTestId("workspace-side-panel")).toHaveCount(0, { timeout: 15_000 });
}

async function openWorkspaceMenuItem(page: Page, itemTestId: string): Promise<void> {
  const trigger = visibleTestId(page, "workspace-header-menu-trigger").first();
  await expect(trigger).toBeVisible({ timeout: 30_000 });
  await trigger.click();
  const item = visibleTestId(page, itemTestId).first();
  await expect(item).toBeVisible({ timeout: 15_000 });
  await item.click();
}

export async function openChangesTreePanel(page: Page): Promise<void> {
  await openWorkspaceMenuItem(page, "workspace-header-open-changes");
  await expect(visibleTestId(page, "changes-tree-panel").first()).toBeVisible({ timeout: 30_000 });
}

export async function openChangesPanel(page: Page, timeout = 30_000): Promise<void> {
  await openChangesTreePanel(page);
  const changedFile = page
    .locator('[data-testid^="diff-tree-file-"][data-testid$="-toggle"]')
    .filter({ visible: true })
    .first();
  await expect(changedFile).toBeVisible({ timeout });
  await changedFile.click();
  await expect(visibleTestId(page, "working-diff-panel").first()).toBeVisible({ timeout });
}

export async function openFilesPanel(page: Page): Promise<void> {
  await openWorkspaceMenuItem(page, "workspace-header-open-files");
  await expect(visibleTestId(page, "file-explorer-tree-scroll").first()).toBeVisible({
    timeout: 30_000,
  });
}

export async function openPullRequestPanel(page: Page): Promise<void> {
  const existing = visibleTestId(page, "pr-pane").first();
  if ((await existing.count()) > 0) {
    return;
  }
  await openWorkspaceMenuItem(page, "workspace-header-open-changes");
  await expect(visibleTestId(page, "pr-pane").first()).toBeVisible({ timeout: 15_000 });
}

// ─── Setup panel ───────────────────────────────────────────────────────────

async function waitForSetupToReachWorkspace(page: Page): Promise<void> {
  const actionsButton = page.getByTestId("workspace-header-menu-trigger");
  await expect(actionsButton).toBeVisible({ timeout: 30_000 });
  await actionsButton.click();
  await expect(page.getByTestId("workspace-header-show-setup")).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press("Escape");
}

export async function expectSetupTabNotSeeded(page: Page, workspaceId: string): Promise<void> {
  await waitForSetupToReachWorkspace(page);
  const panel = page.getByTestId(workspacePanelTestId("setup", workspaceId));
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await expect(panel).toHaveCount(0);
    await page.waitForTimeout(100);
  }
}

/**
 * A failed setup seeds its surface in the background, so the panel stays shut until the user
 * asks for it. Reveal the panel and assert the setup view is the one waiting there.
 */
export async function expectFailedSetupSeededInSidePanel(
  page: Page,
  workspaceId: string,
): Promise<void> {
  const testId = workspacePanelTestId("setup", workspaceId);
  await expect(page.getByTestId(testId)).toHaveCount(1, { timeout: 30_000 });
  await ensureExplorerSidebar(page);
  await visibleTestId(page, `workspace-side-panel-view-setup_${workspaceId}`).first().click();
  await expect(visibleTestId(page, testId).first()).toBeVisible({ timeout: 30_000 });
}

export async function closeSetupTab(page: Page, workspaceId: string): Promise<void> {
  const testId = workspacePanelTestId("setup", workspaceId);
  await closeSidePanel(page);
  await expect(page.getByTestId(testId).filter({ visible: true })).toHaveCount(0);
}

// ─── Terminals ─────────────────────────────────────────────────────────────

export async function expectNoTerminalTabs(page: Page): Promise<void> {
  await expect(page.locator('[data-testid^="workspace-panel-terminal_"]')).toHaveCount(0);
}

/** Bring the first live terminal to the front of the side panel. */
export async function selectFirstTerminalView(
  page: Page,
  options?: { timeout?: number },
): Promise<void> {
  await ensureExplorerSidebar(page);
  const entry = page
    .locator('[data-testid^="workspace-side-panel-view-terminal_"]')
    .filter({ visible: true })
    .first();
  await expect(entry).toBeVisible({ timeout: options?.timeout ?? 30_000 });
  await entry.click();
}

export async function expectFirstTerminalViewContains(page: Page, text: string): Promise<void> {
  await expect(
    page
      .locator('[data-testid^="workspace-side-panel-view-terminal_"]')
      .filter({ visible: true })
      .first(),
  ).toContainText(text);
}

export async function expectTerminalTabOpen(
  page: Page,
  options?: { timeout?: number },
): Promise<void> {
  await expect(
    page.locator('[data-testid^="workspace-panel-terminal_"]').filter({ visible: true }).first(),
  ).toBeVisible({ timeout: options?.timeout ?? 30_000 });
}

export async function waitForWorkspaceTabsVisible(page: Page): Promise<void> {
  await expect(visibleTestId(page, "workspace-chat-pane").first()).toBeVisible({
    timeout: 30_000,
  });
}

/** Start another chat in the same workspace from the workspace menu. */
export async function createAgentTabFromMenu(page: Page): Promise<void> {
  await openWorkspaceMenuItem(page, "workspace-header-new-agent");
}

export async function expectWorkspaceTabsAbsent(page: Page): Promise<void> {
  await expect(page.getByTestId("workspace-tabs-row")).toHaveCount(0);
}
