import { expect, type Page } from "@playwright/test";
import { buildHostWorkspaceRoute } from "../../../src/utils/host-routes";
import { createTempGitRepo } from "./workspace";
import { getServerId } from "./server-id";
import {
  agentPanel,
  createAgentTabFromMenu,
  getVisibleWorkspacePanelTestIds,
  workspacePanelTestId,
} from "./workspace-tabs";

// ─── Navigation ────────────────────────────────────────────────────────────

/** Navigate to a workspace and wait for its chat surface. */
export async function gotoWorkspace(page: Page, workspaceId: string): Promise<void> {
  const route = buildHostWorkspaceRoute(getServerId(), workspaceId);
  await page.goto(route);
  await waitForChatSurface(page);
}

/** Wait for the workspace chat surface to be on screen. */
export async function waitForChatSurface(page: Page): Promise<void> {
  await expect(
    page.getByTestId("workspace-chat-pane").filter({ visible: true }).first(),
  ).toBeVisible({ timeout: 30_000 });
}

// ─── Open surface queries ──────────────────────────────────────────────────

/** Return the test IDs of every surface currently on screen. */
export async function getTabTestIds(page: Page): Promise<string[]> {
  return getVisibleWorkspacePanelTestIds(page);
}

/** Count the visible surfaces whose test ID mentions a kind ("agent", "terminal", …). */
export async function countTabsOfKind(page: Page, kind: string): Promise<number> {
  const ids = await getTabTestIds(page);
  return ids.filter((id) => id.includes(kind)).length;
}

// ─── Actions ───────────────────────────────────────────────────────────────

/** Start another chat in this workspace from the workspace menu. */
export async function clickNewChat(page: Page): Promise<void> {
  await createAgentTabFromMenu(page);
}

/** Toggle the terminal in the side panel from the header. */
export async function clickNewTerminal(page: Page): Promise<void> {
  const toggle = page.getByTestId("workspace-header-terminal-toggle").filter({ visible: true });
  await expect(toggle.first()).toBeVisible({ timeout: 10_000 });
  await toggle.first().click();
}

export async function pressDirectNewTabShortcut(page: Page, key: string): Promise<void> {
  const modifier = process.platform === "darwin" ? "Meta" : "Control";
  await page.keyboard.press(`${modifier}+Shift+${key}`);
}

// ─── Assertions ────────────────────────────────────────────────────────────

export async function expectAgentTabActive(page: Page, agentId: string): Promise<void> {
  await expect(agentPanel(page, agentId).first()).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(async () =>
      (await getTabTestIds(page)).filter((id) => id.startsWith("workspace-panel-agent_")),
    )
    .toEqual([workspacePanelTestId("agent", agentId)]);
}

export function terminalSurfaceLocator(page: Page) {
  return page.locator('[data-testid="terminal-surface"]').filter({ visible: true }).first();
}

// ─── Workspace setup ───────────────────────────────────────────────────────

/** Create a temp git repo and return its path with a cleanup function. */
export async function createWorkspace(
  prefix = "launcher-e2e-",
): ReturnType<typeof createTempGitRepo> {
  return createTempGitRepo(prefix);
}
