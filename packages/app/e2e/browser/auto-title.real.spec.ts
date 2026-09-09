import { expect, test } from "../support/fixtures";
import { submitMessage } from "../support/helpers/composer";
import { openAgentRoute } from "../support/helpers/mock-agent";
import { seedWorkspace } from "../support/helpers/seed-client";
import { agentPanel } from "../support/helpers/workspace-tabs";

// Empty chats take a short, model-written name from their first real prompt. Claude 1 and
// Grok are the accounts with usage today; Codex is covered by short-chat-title.real.spec.ts.
const profiles = [
  { provider: "claude", model: "claude-sonnet-5", label: "Claude 1" },
  { provider: "grok", model: "grok-4.6", label: "Grok" },
] as const;

test.use({ e2eForkProviders: ["claude", "grok"] });

for (const profile of profiles) {
  test(`${profile.label}: an empty chat is named after the job in a few words`, async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const workspace = await seedWorkspace({ repoPrefix: `auto-title-${profile.provider}-` });
    try {
      const agent = await workspace.client.createAgent({
        provider: profile.provider,
        model: profile.model,
        cwd: workspace.repoPath,
        workspaceId: workspace.workspaceId,
      });
      await openAgentRoute(page, { workspaceId: workspace.workspaceId, agentId: agent.id });
      await expect(agentPanel(page, agent.id)).toBeVisible();
      const prompt =
        "Please investigate why nightly order sync jobs fail after midnight. For this smoke check, reply exactly TITLE_SMOKE_OK and do not use tools or read any files.";
      await submitMessage(page, prompt);
      await expect(
        agentPanel(page, agent.id).getByText("TITLE_SMOKE_OK", { exact: true }).last(),
      ).toBeVisible({ timeout: 120_000 });

      const readTitle = async () => {
        const agents = (await workspace.client.fetchAgents({ scope: "active" })).entries;
        return agents.find((entry) => entry.agent.id === agent.id)?.agent.title ?? null;
      };
      await expect
        .poll(readTitle, { timeout: 120_000 })
        .toMatch(/^(?!.*(?:Please|smoke check|TITLE_SMOKE)).{4,48}$/);
      const title = (await readTitle()) ?? "";
      expect(title.split(/\s+/).length).toBeLessThanOrEqual(6);
      expect(title.toLowerCase()).toMatch(/order|sync|nightly|job/);
    } finally {
      await workspace.cleanup();
    }
  });
}
