import { test, expect } from "../support/fixtures";
import {
  clickSessionRow,
  createMockIdleAgent,
  expectArchivedAgentFocused,
  fetchAgentArchivedAt,
  openSessions,
  openWorkspaceWithAgents,
} from "../support/helpers/archive-tab";
import { seedWorkspace } from "../support/helpers/seed-client";

test("History focuses the chat reopened immediately after closing its tab", async ({
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
    const tab = page.getByTestId(`workspace-tab-agent_${archived.id}`).filter({ visible: true });
    await expect(tab).toHaveAttribute("aria-selected", "true");
    await tab.click({ button: "right" });
    await page.getByRole("menuitem", { name: "Close", exact: true }).click();
    await expect(tab).toHaveCount(0);
    await openSessions(page);
    await clickSessionRow(page, archived.title);
    await expect(tab).toHaveAttribute("aria-selected", "true");
    await expectArchivedAgentFocused(page, archived.id);
    expect(await fetchAgentArchivedAt(workspace.client, archived.id)).not.toBeNull();
    expect(await fetchAgentArchivedAt(workspace.client, surviving.id)).toBeNull();
    // This seed client is separate from the browser, so deletion must propagate remotely.
    await workspace.client.deleteAgent(archived.id);
    await expect(tab).toHaveCount(0);
    await expect(
      page.getByTestId(`workspace-tab-agent_${surviving.id}`).filter({ visible: true }),
    ).toHaveAttribute("aria-selected", "true");
  } finally {
    await testInfo.attach("archive-events", {
      body: JSON.stringify(frames, null, 2),
      contentType: "application/json",
    });
    await workspace.cleanup();
  }
});
