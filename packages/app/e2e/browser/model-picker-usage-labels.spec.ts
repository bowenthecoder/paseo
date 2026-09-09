import { expect, test } from "../support/fixtures";
import { clickNewChat, gotoWorkspace } from "../support/helpers/launcher";
import { seedWorkspace } from "../support/helpers/seed-client";
import {
  openModelPicker,
  seedAgentProfiles,
  seedModelProvider,
} from "../support/helpers/agent-profiles";
import { installProviderUsageFixture } from "../support/helpers/provider-usage";
import { waitForDraftComposer } from "../support/helpers/command-center-agent-controls";

const SPENT_PROVIDER = "usage-label-spent";

test("each provider row names its own account usage", async ({ page }) => {
  // The E2E daemon has one provider with models, so a second account needs registering.
  const provider = await seedModelProvider({
    id: SPENT_PROVIDER,
    label: "Spent account",
    models: [{ id: "spent-model", label: "Spent model", description: "Usage label contract" }],
  });
  // A pinned profile keeps the picker on its root view, where the provider rows are.
  const profiles = await seedAgentProfiles([
    { id: "usage-label-anchor", name: "Usage label anchor", provider: "mock" },
  ]);
  const workspace = await seedWorkspace({ repoPrefix: "picker-usage-labels-" });
  try {
    await installProviderUsageFixture(page, [
      {
        fetchedAt: new Date().toISOString(),
        providers: [
          {
            providerId: "mock",
            displayName: "Mock account",
            status: "available",
            planLabel: "Test plan",
            windows: [
              { id: "session", label: "Session", usedPct: 37 },
              { id: "weekly", label: "Weekly", usedPct: 80 },
              // A spent model scope stops that model, not the account.
              { id: "weekly_fable", label: "Weekly · Fable", usedPct: 100 },
            ],
          },
          {
            providerId: SPENT_PROVIDER,
            displayName: "Spent account",
            status: "available",
            planLabel: "Test plan",
            windows: [{ id: "session", label: "5-hour", usedPct: 100 }],
          },
        ],
      },
    ]);
    await gotoWorkspace(page, workspace.workspaceId);
    await clickNewChat(page);
    await waitForDraftComposer(page);
    await openModelPicker(page);

    const available = page.getByTestId("model-provider-mock");
    await available.scrollIntoViewIfNeeded();
    await expect(available).toContainText("· 37% · 80% wk");
    await expect(available).not.toContainText("· out");
    await expect(page.getByTestId(`model-provider-${SPENT_PROVIDER}`)).toContainText("· out");
    await page.screenshot({ path: "/tmp/paseo-model-picker-usage-labels.png" });
  } finally {
    await workspace.cleanup();
    await profiles.restore();
    await provider.restore();
  }
});
