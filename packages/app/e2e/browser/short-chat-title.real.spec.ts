import { expect, test } from "../support/fixtures";
import { seedWorkspace } from "../support/helpers/seed-client";
import { openAgentRoute } from "../support/helpers/mock-agent";
import { submitMessage } from "../support/helpers/composer";
import { getServerId } from "../support/helpers/server-id";

test.use({ e2eForkProviders: ["codex-b"] });
test("an empty real chat gets a first-prompt title and preserves a manual rename", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  const workspace = await seedWorkspace({ repoPrefix: "short-chat-title-" });
  try {
    const agent = await workspace.client.createAgent({
      provider: "codex-b",
      model: "gpt-5.6-sol",
      thinkingOptionId: "low",
      cwd: workspace.repoPath,
      workspaceId: workspace.workspaceId,
    });
    await openAgentRoute(page, { agentId: agent.id, workspaceId: workspace.workspaceId });
    const readTitle = async () => {
      const data = await workspace.client.fetchAgents();
      return data.entries.find((entry) => entry.agent.id === agent.id)?.agent.title ?? "";
    };
    const emptyTitle = await readTitle();
    await submitMessage(
      page,
      "Please investigate order sync failures. For this smoke check, reply exactly PASEO_TITLE_OK and do not use tools or read any files.",
    );
    await expect(page.getByText("PASEO_TITLE_OK", { exact: true }).last()).toBeVisible({
      timeout: 120_000,
    });
    await expect.poll(readTitle, { timeout: 120_000 }).not.toBe(emptyTitle);
    const title = await readTitle();
    expect(title.length).toBeGreaterThan(0);
    expect(title.length).toBeLessThanOrEqual(48);
    expect(title.toLowerCase()).toMatch(/order|sync/);
    expect(title).not.toContain("Please");
    const header = page.getByTestId("workspace-header-title").filter({ visible: true });
    await expect(header).toHaveText(title);
    await page.screenshot({ path: testInfo.outputPath("short-chat-title.png") });
    const key = `${getServerId()}:chat:${agent.id}`;
    const row = page.getByTestId(`sidebar-workspace-row-${key}`);
    await row.click({ button: "right" });
    await page.getByTestId(`sidebar-workspace-menu-rename-${key}`).click();
    const name = "Order sync production review";
    await page.getByTestId(`sidebar-workspace-rename-modal-${key}-input`).fill(name);
    await page.getByTestId(`sidebar-workspace-rename-modal-${key}-submit`).click();
    await expect.poll(readTitle).toBe(name);
    await expect(header).toHaveText(name);
    await page.reload();
    await expect(row).toContainText(name);
    await expect(header).toHaveText(name);
    await submitMessage(page, "Reply exactly PASEO_RENAMED_OK. Do not use tools or read files.");
    await expect(page.getByText("PASEO_RENAMED_OK", { exact: true }).last()).toBeVisible({
      timeout: 120_000,
    });
    await expect.poll(readTitle).toBe(name);
    await expect(row).toContainText(name);
    await expect(header).toHaveText(name);
    await page.screenshot({ path: testInfo.outputPath("manual-title-after-next-turn.png") });
    await workspace.client.archiveAgent(agent.id);
  } finally {
    await workspace.cleanup();
  }
});
