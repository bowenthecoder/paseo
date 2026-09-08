import type { ProviderSubagentDescriptorPayload } from "@getpaseo/protocol/messages";
import type { WebSocketRoute } from "@playwright/test";
import { expect, test, type Page } from "../support/fixtures";
import { daemonWsRoutePattern } from "../support/helpers/daemon-port";
import { expectComposerVisible } from "../support/helpers/composer";
import { openAgentRoute, seedMockAgentWorkspace } from "../support/helpers/mock-agent";
import { openSubagentsTrack } from "../support/helpers/subagents";

/** Exercise the real client transport and UI with deterministic native-provider telemetry. */
async function installNativeTask(page: Page, parentAgentId: string, provider: string) {
  let clientSocket: WebSocketRoute | undefined;
  let archiveRequests = 0;
  let descriptor: ProviderSubagentDescriptorPayload = {
    id: `${provider}-native-child`,
    parentAgentId,
    provider,
    title: "Explore",
    description: "Review order synchronization",
    subtitle: "Explore · High",
    status: "running",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    toolCallId: "native-task-call",
  };
  const send = (message: unknown) =>
    clientSocket?.send(JSON.stringify({ type: "session", message }));
  await page.routeWebSocket(daemonWsRoutePattern(), (ws) => {
    clientSocket = ws;
    const server = ws.connectToServer();
    server.onMessage((message) => ws.send(message));
    ws.onMessage((raw) => {
      const envelope = JSON.parse(typeof raw === "string" ? raw : raw.toString("utf8"));
      const message = envelope.message;
      if (message?.type === "archive_agent_request") archiveRequests += 1;
      if (message?.parentAgentId !== parentAgentId) {
        server.send(raw);
        return;
      }
      if (message.type === "agent.provider_subagents.list.request") {
        send({
          type: "agent.provider_subagents.list.response",
          payload: {
            requestId: message.requestId,
            parentAgentId,
            subagents: [descriptor],
            error: null,
          },
        });
        return;
      }
      if (message.type === "agent.provider_subagents.timeline.get.request") {
        send({
          type: "agent.provider_subagents.timeline.get.response",
          payload: {
            requestId: message.requestId,
            parentAgentId,
            subagentId: descriptor.id,
            provider,
            direction: "tail",
            epoch: "native-task-epoch",
            reset: false,
            staleCursor: false,
            gap: false,
            window: { minSeq: 1, maxSeq: 1, nextSeq: 2 },
            hasOlder: false,
            hasNewer: false,
            rows: [
              {
                seq: 1,
                timestamp: descriptor.updatedAt,
                item: { type: "assistant_message", text: `${provider.toUpperCase()}_CHILD_OUTPUT` },
              },
            ],
            error: null,
          },
        });
        return;
      }
      server.send(raw);
    });
  });
  return {
    childId: descriptor.id,
    archiveRequests: () => archiveRequests,
    update(patch: Partial<ProviderSubagentDescriptorPayload>) {
      descriptor = { ...descriptor, ...patch, updatedAt: new Date().toISOString() };
      send({
        type: "agent.provider_subagents.update",
        payload: { kind: "upsert", subagent: descriptor },
      });
    },
  };
}

for (const provider of ["codex", "claude", "grok"]) {
  test(`${provider} task sidebar tracks live usage, opens output, and preserves the parent`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.addInitScript(() =>
      localStorage.setItem("@paseo:app-settings", JSON.stringify({ theme: "claude" })),
    );
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const parent = await seedMockAgentWorkspace({
      repoPrefix: "subagent-task-sidebar-",
      title: "Review marketplace orders",
    });
    try {
      const task = await installNativeTask(page, parent.agentId, provider);
      await openAgentRoute(page, parent);
      await expectComposerVisible(page);
      const trigger = page.getByTestId("subagents-track-header");
      await expect(trigger).toHaveText("1 running task");
      await openSubagentsTrack(page);

      const panel = page.getByTestId("subagents-track-header-panel");
      const row = panel.getByTestId(`subagents-track-row-${task.childId}`);
      await expect(row).toContainText("Review order synchronization");
      await expect(row).not.toContainText("tokens");
      expect((await panel.boundingBox())!.x).toBeGreaterThan(720);
      await expectComposerVisible(page);

      task.update({ subtitle: "Explore · High · 2.4k tokens" });
      await expect(row).toContainText("2.4k tokens");
      await page.screenshot({ path: testInfo.outputPath(`${provider}-running-task-sidebar.png`) });
      task.update({ status: "completed", subtitle: "Explore · High · 2.8k tokens" });
      await expect(trigger).toHaveText("1 subagent");
      await row.click();
      const child = page.getByTestId("provider-subagent-panel");
      await expect(child).toBeVisible();
      await expect(child).toContainText(`${provider.toUpperCase()}_CHILD_OUTPUT`);
      await expect(child.getByRole("textbox")).toHaveCount(0);
      await expect(page.getByTestId("provider-subagent-pane-subtitle")).toHaveText(
        "Explore · High · 2.8k tokens",
      );
      await expectComposerVisible(page);

      await openSubagentsTrack(page);
      await expect(row).toBeVisible();
      await page.reload();
      await expect(panel).toBeVisible({ timeout: 30_000 });
      await expect(row).toContainText("2.8k tokens");
      await page.getByTestId("subagents-panel-close").click();
      await expect(panel).toBeHidden();
      await openSubagentsTrack(page);
      await expect(row).toBeVisible();
      await page.getByTestId("subagents-track-archive-finished").click();
      await expect(row).toHaveCount(0);
      expect(task.archiveRequests()).toBe(0);
      await expect(parent.client.fetchAgent({ agentId: parent.agentId })).resolves.toMatchObject({
        agent: { archivedAt: null },
      });
      expect(errors).toEqual([]);
    } finally {
      await parent.cleanup();
    }
  });
}

test("compact task list remains a sheet and shows the same reported usage", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const parent = await seedMockAgentWorkspace({
    repoPrefix: "subagent-task-compact-",
    title: "Review marketplace orders",
  });
  try {
    const task = await installNativeTask(page, parent.agentId, "claude");
    await openAgentRoute(page, parent);
    await openSubagentsTrack(page);
    const panel = page.getByTestId("subagents-track-header-panel-content");
    await expect(page.getByTestId("subagents-panel-close")).toHaveCount(0);
    task.update({ subtitle: "Explore · 3.1k tokens" });
    await expect(panel).toContainText("3.1k tokens");
    const box = (await panel.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    await page.screenshot({ path: testInfo.outputPath("compact-task-sheet.png") });
  } finally {
    await parent.cleanup();
  }
});
