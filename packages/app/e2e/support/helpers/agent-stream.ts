import { expect, type Page } from "@playwright/test";
import { readScrollMetrics, waitForContentGrowth, expectNearBottom } from "./agent-bottom-anchor";

export async function awaitAssistantMessage(page: Page, hasText?: string | RegExp): Promise<void> {
  const messages = page.getByTestId("assistant-message");
  const target = hasText === undefined ? messages.first() : messages.filter({ hasText }).first();
  await expect(target).toBeVisible({ timeout: 30_000 });
}

export async function awaitToolCall(page: Page, toolName: string | RegExp): Promise<void> {
  await expect(
    page.getByTestId("tool-call-badge").filter({ hasText: toolName }).first(),
  ).toBeVisible({ timeout: 30_000 });
}

export async function expectAgentIdle(page: Page, timeout = 30_000): Promise<void> {
  await expect(page.getByRole("button", { name: /stop|cancel/i })).toHaveCount(0, { timeout });
}

// The working indicator is an animated spinner View — no semantic ARIA role, testId is correct.
export async function expectInlineWorkingIndicator(page: Page): Promise<void> {
  await expect(page.getByTestId("turn-working-indicator")).toBeVisible({ timeout: 30_000 });
}

export async function expectRunningAgentChrome(page: Page, title: string): Promise<void> {
  const row = page
    .getByRole("button", { name: title, exact: true })
    .and(page.getByTestId(/^sidebar-workspace-row-/));

  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row.getByTestId("sidebar-activity-glow")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole("button", { name: /stop agent|canceling agent/i })).toBeVisible({
    timeout: 30_000,
  });
  await expectInlineWorkingIndicator(page);
}

export async function expectAgentReadyToInterrupt(page: Page): Promise<void> {
  await expect(page.getByRole("button", { name: "Stop agent", exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole("button", { name: "Canceling agent", exact: true })).toHaveCount(0);
}

export async function expectVisibleAgentSurfacesIdle(page: Page): Promise<void> {
  const visibleAgentPanel = page
    .getByTestId(/^workspace-panel-agent_/)
    .filter({ visible: true })
    .first();

  await expect(visibleAgentPanel).toBeVisible({ timeout: 30_000 });
  const panelId = await visibleAgentPanel.getAttribute("data-testid");
  const agentId = panelId!.slice("workspace-panel-agent_".length);
  const row = page.locator(
    `[data-testid^="sidebar-workspace-row-"][data-testid$=":chat:${agentId}"]`,
  );
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row.getByTestId("sidebar-activity-glow")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /stop agent|canceling agent/i })).toHaveCount(0);
  await expect(page.getByTestId("turn-working-indicator")).toHaveCount(0);
  await expect(page.getByTestId("turn-working-elapsed")).toHaveCount(0);
}

export async function expectAgentSurfacesIdle(page: Page, title: string): Promise<void> {
  const row = page
    .getByRole("button", { name: title, exact: true })
    .and(page.getByTestId(/^sidebar-workspace-row-/));

  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row.getByTestId("sidebar-activity-glow")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /stop agent|canceling agent/i })).toHaveCount(0);
  await expect(page.getByTestId("turn-working-indicator")).toHaveCount(0);
  await expect(page.getByTestId("turn-working-elapsed")).toHaveCount(0);
  await expectTurnCopyButton(page);
}

export async function expectTurnCopyButton(page: Page): Promise<void> {
  await expect(page.getByRole("button", { name: "Copy turn" }).first()).toBeVisible({
    timeout: 30_000,
  });
}

export async function expectScrollFollowsNewContent(page: Page): Promise<void> {
  const { contentHeight } = await readScrollMetrics(page);
  await waitForContentGrowth(page, contentHeight);
  await expectNearBottom(page);
}
