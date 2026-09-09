import { test, expect } from "../support/fixtures";
import {
  clickSessionRow,
  closeWorkspaceAgentTab,
  createMockIdleAgent,
  expectArchivedAgentFocused,
  fetchAgentArchivedAt,
  openSessions,
  openWorkspaceWithAgents,
} from "../support/helpers/archive-tab";
import { seedWorkspace } from "../support/helpers/seed-client";
import { agentPanel } from "../support/helpers/workspace-tabs";

test("History focuses the chat reopened immediately after archiving with A", async ({
  page,
}, testInfo) => {
  const frames: unknown[] = [];
  page.on("websocket", (ws) => {
    ws.on("framereceived", ({ payload }) => {
      try {
        frames.push({ at: Date.now(), message: JSON.parse(String(payload)) });
      } catch {}
    });
  });
  const workspace = await seedWorkspace({ repoPrefix: "history-reopen-focus-" });
  try {
    const input = { cwd: workspace.repoPath, workspaceId: workspace.workspaceId };
    const archived = await createMockIdleAgent(workspace.client, {
      ...input,
      title: "Reopen this conversation",
    });
    const surviving = await createMockIdleAgent(workspace.client, {
      ...input,
      title: "Keep the other conversation",
    });
    await openWorkspaceWithAgents(page, [surviving, archived]);
    const archivedPanel = agentPanel(page, archived.id);
    await expect(archivedPanel).toBeVisible();
    await closeWorkspaceAgentTab(page, archived.id);
    await openSessions(page);
    await clickSessionRow(page, archived.title);
    await expect(archivedPanel).toBeVisible();
    await expectArchivedAgentFocused(page, archived.id);
    expect(await fetchAgentArchivedAt(workspace.client, archived.id)).not.toBeNull();
    expect(await fetchAgentArchivedAt(workspace.client, surviving.id)).toBeNull();
    // This seed client is separate from the browser, so deletion must propagate remotely.
    await workspace.client.deleteAgent(archived.id);
    await expect(archivedPanel).toHaveCount(0);
    await expect(agentPanel(page, surviving.id)).toBeVisible();
  } finally {
    await testInfo.attach("archive-events", {
      body: JSON.stringify(frames, null, 2),
      contentType: "application/json",
    });
    await workspace.cleanup();
  }
});
