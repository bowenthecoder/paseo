import { expect, type Page } from "@playwright/test";
import { PARENT_AGENT_ID_LABEL } from "@getpaseo/protocol/agent-labels";
import { buildHostAgentDetailRoute } from "@/utils/host-routes";
import { test } from "../support/fixtures";
import { seedWorkspace, type SeedDaemonClient } from "../support/helpers/seed-client";
import { getServerId } from "../support/helpers/server-id";
import { observeTimelineSubscriptions } from "../support/helpers/timeline-delivery";
import { agentPanel, waitForWorkspaceTabsVisible } from "../support/helpers/workspace-tabs";
import { installDaemonWebSocketGate } from "../support/helpers/daemon-websocket-gate";
import { openSubagentsTrack } from "../support/helpers/subagents";
import {
  expectAgentIdle,
  expectInlineWorkingIndicator,
  expectTurnCopyButton,
} from "../support/helpers/agent-stream";
import {
  expectReconnectingToastGone,
  expectReconnectingToastVisible,
} from "../support/helpers/workspace-ui";

interface ViewedTimelineScenario {
  client: SeedDaemonClient;
  workspaceId: string;
  firstAgentId: string;
  secondAgentId: string;
  cleanup(): Promise<void>;
}

async function seedViewedTimelineScenario(
  options: { firstAgentModel?: string; secondAgentIsChild?: boolean } = {},
): Promise<ViewedTimelineScenario> {
  const workspace = await seedWorkspace({ repoPrefix: "viewed-timelines-" });
  const createAgent = (title: string, model = "ten-second-stream", parentAgentId?: string) =>
    workspace.client.createAgent({
      provider: "mock",
      cwd: workspace.repoPath,
      workspaceId: workspace.workspaceId,
      title,
      modeId: "load-test",
      model,
      labels: parentAgentId ? { [PARENT_AGENT_ID_LABEL]: parentAgentId } : undefined,
    });
  const firstAgent = await createAgent("First viewed chat", options.firstAgentModel);
  const secondAgent = await createAgent(
    "Second viewed chat",
    "ten-second-stream",
    options.secondAgentIsChild ? firstAgent.id : undefined,
  );
  return {
    client: workspace.client,
    workspaceId: workspace.workspaceId,
    firstAgentId: firstAgent.id,
    secondAgentId: secondAgent.id,
    cleanup: workspace.cleanup,
  };
}

async function openAgent(page: Page, scenario: ViewedTimelineScenario, agentId: string) {
  await page.goto(buildHostAgentDetailRoute(getServerId(), agentId, scenario.workspaceId));
  await page.waitForURL(
    (url) => url.pathname.includes("/workspace/") && !url.searchParams.has("open"),
  );
  await waitForWorkspaceTabsVisible(page);
}

function chatRow(page: Page, agentId: string) {
  return page.getByTestId(`sidebar-workspace-row-${getServerId()}:chat:${agentId}`);
}

async function selectAgent(page: Page, agentId: string) {
  await chatRow(page, agentId).click();
}

async function commitMessage(scenario: ViewedTimelineScenario, agentId: string, prompt: string) {
  await scenario.client.sendAgentMessage(agentId, prompt);
  const finish = await scenario.client.waitForFinish(agentId, 30_000);
  expect(finish.status).toBe("idle");
}

async function startVisibleTurn(
  page: Page,
  scenario: ViewedTimelineScenario,
  prompt: string,
): Promise<void> {
  await scenario.client.sendAgentMessage(scenario.firstAgentId, prompt);
  await expect(page.getByText(prompt, { exact: true })).toBeVisible();
  await expectInlineWorkingIndicator(page);
}

async function expectAgentConsistentlyIdle(page: Page, agentId: string): Promise<void> {
  const tab = chatRow(page, agentId);
  await expect(tab.getByTestId("sidebar-activity-glow")).toHaveCount(0);
  await expectAgentIdle(page);
  await expect(page.getByTestId("turn-working-indicator")).toHaveCount(0);
  await expectTurnCopyButton(page);
}

test.describe("Viewed agent timelines", () => {
  test("a turn that finishes while hidden reopens with consistently idle chrome", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    const subscriptions = observeTimelineSubscriptions(page);
    const scenario = await seedViewedTimelineScenario({ firstAgentModel: "one-minute-stream" });
    try {
      await openAgent(page, scenario, scenario.firstAgentId);
      await startVisibleTurn(page, scenario, "Finish after this chat becomes hidden.");
      await selectAgent(page, scenario.secondAgentId);
      await subscriptions.waitForSubscribedAgents([scenario.firstAgentId, scenario.secondAgentId]);
      const finish = await scenario.client.waitForFinish(scenario.firstAgentId, 90_000);
      expect(finish.status).toBe("idle");

      await selectAgent(page, scenario.firstAgentId);
      await expectAgentConsistentlyIdle(page, scenario.firstAgentId);
    } finally {
      await scenario.cleanup();
    }
  });

  test("a hidden hot chat stays current", async ({ page }) => {
    test.setTimeout(60_000);
    const subscriptions = observeTimelineSubscriptions(page);
    const scenario = await seedViewedTimelineScenario();
    try {
      await openAgent(page, scenario, scenario.firstAgentId);
      await selectAgent(page, scenario.secondAgentId);
      await subscriptions.waitForSubscribedAgents([scenario.firstAgentId, scenario.secondAgentId]);
      await commitMessage(
        scenario,
        scenario.firstAgentId,
        "Committed while the first chat is hidden.",
      );
      await expect(
        page.getByText("Committed while the first chat is hidden.", { exact: true }),
      ).toBeHidden();
      await selectAgent(page, scenario.firstAgentId);
      await expect(
        page.getByText("Committed while the first chat is hidden.", { exact: true }),
      ).toBeVisible();
      await expect(page.getByText("(end of synthetic stream)", { exact: true })).toBeVisible();
    } finally {
      await scenario.cleanup();
    }
  });

  test("the parent and its child in the side panel both stay current", async ({ page }) => {
    const scenario = await seedViewedTimelineScenario({ secondAgentIsChild: true });
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await openAgent(page, scenario, scenario.firstAgentId);
      await openSubagentsTrack(page);
      await page.getByTestId(`subagents-track-row-${scenario.secondAgentId}`).click();
      const parent = agentPanel(page, scenario.firstAgentId);
      const child = page
        .getByTestId("workspace-side-panel")
        .locator(agentPanel(page, scenario.secondAgentId));
      await expect(parent).toBeVisible();
      await expect(child).toBeVisible();
      await expect(page.getByRole("textbox", { name: "Message agent..." })).toHaveCount(2);
      await commitMessage(scenario, scenario.firstAgentId, "Parent visible pane update.");
      await expect(parent.getByText("Parent visible pane update.", { exact: true })).toBeVisible();
      await expect(child.getByText("Parent visible pane update.", { exact: true })).toHaveCount(0);
      await commitMessage(scenario, scenario.secondAgentId, "Child visible pane update.");
      await expect(child.getByText("Child visible pane update.", { exact: true })).toBeVisible();
      await expect(parent.getByText("Child visible pane update.", { exact: true })).toHaveCount(0);
      await expect(parent).toBeVisible();
    } finally {
      await scenario.cleanup();
    }
  });

  test("a visible chat catches up after reconnecting", async ({ page }) => {
    const gate = await installDaemonWebSocketGate(page);
    const scenario = await seedViewedTimelineScenario();
    try {
      await openAgent(page, scenario, scenario.firstAgentId);
      await expect(chatRow(page, scenario.firstAgentId)).toHaveAttribute("aria-selected", "true");
      await gate.drop();
      await gate.waitForBlockedConnection();
      await commitMessage(scenario, scenario.firstAgentId, "Committed while the chat reconnects.");
      await expect(
        page.getByText("Committed while the chat reconnects.", { exact: true }),
      ).toHaveCount(0);
      // Hold the first authoritative catch-up response so the assertion observes
      // the reconnect boundary instead of racing a socket that has not reopened yet.
      gate.holdNextServerMessage("fetch_agent_timeline_response");
      gate.restore();
      await gate.waitForHeldServerMessage("fetch_agent_timeline_response");
      gate.releaseHeldServerMessage("fetch_agent_timeline_response");
      await expectReconnectingToastGone(page);
      const recoveredMessage = page.getByText("Committed while the chat reconnects.", {
        exact: true,
      });
      await expect(recoveredMessage).toHaveCount(1);
      await expect(recoveredMessage).toBeVisible();
    } finally {
      gate.restore();
      await scenario.cleanup();
    }
  });

  test("preserves reconnecting toast through retained tab switches", async ({ page }) => {
    const gate = await installDaemonWebSocketGate(page);
    const scenario = await seedViewedTimelineScenario();
    try {
      await openAgent(page, scenario, scenario.firstAgentId);
      await selectAgent(page, scenario.secondAgentId);
      await expect(page.getByRole("textbox", { name: "Message agent..." })).toBeVisible();
      await selectAgent(page, scenario.firstAgentId);
      await gate.drop();
      await gate.waitForBlockedConnection();
      await expectReconnectingToastVisible(page);

      await selectAgent(page, scenario.secondAgentId);
      await expectReconnectingToastVisible(page, { timeout: 500 });
    } finally {
      gate.restore();
      await scenario.cleanup();
    }
  });
});
