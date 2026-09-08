import { expect, test } from "../support/fixtures";
import { seedWorkspace } from "../support/helpers/seed-client";
import { openAgentRoute } from "../support/helpers/mock-agent";

test.use({ e2eForkProviders: ["codex-b"] });
test("a real first prompt becomes a short task title", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const workspace = await seedWorkspace({ repoPrefix: "short-chat-title-" });
  try {
    const agent = await workspace.client.createAgent({
      provider: "codex-b",
      model: "gpt-5.6-sol",
      thinkingOptionId: "low",
      cwd: workspace.repoPath,
      workspaceId: workspace.workspaceId,
      initialPrompt:
        "Please investigate order sync failures. For this smoke check, reply exactly PASEO_TITLE_OK and do not use tools or read any files.",
    });
    await openAgentRoute(page, { agentId: agent.id, workspaceId: workspace.workspaceId });
    await expect(page.getByText("PASEO_TITLE_OK", { exact: true }).last()).toBeVisible({
      timeout: 120_000,
    });
    const readTitle = async () => {
      const data = await workspace.client.fetchAgents();
      return data.entries.find((entry) => entry.agent.id === agent.id)?.agent.title ?? "";
    };
    await expect
      .poll(readTitle, { timeout: 120_000 })
      .not.toBe("investigate order sync failures. For this");
    const title = await readTitle();
    expect(title.length).toBeGreaterThan(0);
    expect(title.length).toBeLessThanOrEqual(48);
    expect(title.toLowerCase()).toMatch(/order|sync/);
    expect(title).not.toContain("Please");
    await page.screenshot({ path: testInfo.outputPath("short-chat-title.png") });
    await workspace.client.archiveAgent(agent.id);
  } finally {
    await workspace.cleanup();
  }
});
