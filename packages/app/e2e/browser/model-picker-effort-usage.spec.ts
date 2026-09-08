import { expect, test } from "../support/fixtures";
import { clickNewChat, gotoWorkspace } from "../support/helpers/launcher";
import { seedWorkspace } from "../support/helpers/seed-client";
import {
  openModelPicker,
  closeModelPicker,
  seedModelProvider,
  seedAgentProfiles,
  searchAllModels,
} from "../support/helpers/agent-profiles";
import { installProviderUsageFixture } from "../support/helpers/provider-usage";
import { waitForDraftComposer } from "../support/helpers/command-center-agent-controls";

test("model picker changes effort and displays the selected account's usage", async ({ page }) => {
  const workspace = await seedWorkspace({ repoPrefix: "picker-effort-usage-" });
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
            windows: [{ id: "session", label: "Session", usedPct: 37 }],
          },
        ],
      },
    ]);
    await gotoWorkspace(page, workspace.workspaceId);
    await clickNewChat(page);
    await waitForDraftComposer(page);
    await openModelPicker(page);
    await expect(page.getByTestId("model-picker-usage")).toContainText("37%");
    const high = page.getByTestId("model-picker-effort-high");
    await expect(high).toBeVisible();
    await high.click();
    await expect(high).toHaveAttribute("aria-checked", "true");
    await closeModelPicker(page);
    await openModelPicker(page);
    await expect(page.getByTestId("model-picker-effort-high")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(page.getByTestId("model-picker-usage")).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: "/tmp/paseo-model-picker-effort-usage.png" });
    await closeModelPicker(page);
    await page.setViewportSize({ width: 900, height: 650 });
    await openModelPicker(page);
    await expect(page.getByTestId("model-picker-usage")).toBeInViewport({ ratio: 1 });
    await expect(page.getByTestId("model-picker-effort-high")).toBeInViewport({ ratio: 1 });
    await expect(page.getByTestId("combobox-desktop-container")).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: "/tmp/paseo-model-picker-narrow.png" });
  } finally {
    await workspace.cleanup();
  }
});

for (const catalog of [
  {
    id: "astra-effort-test",
    model: "gpt-6-astra",
    levels: ["low", "medium", "high", "xhigh", "max", "ultra"],
  },
  {
    id: "claude-effort-test",
    model: "claude-fable-5-1",
    levels: ["low", "medium", "high", "xhigh", "max", "ultracode"],
  },
]) {
  test(`${catalog.model} retains every supported effort through the model picker`, async ({
    page,
  }) => {
    const models = [
      {
        id: catalog.model,
        label: catalog.model,
        description: "Effort selection contract",
        thinkingOptions: catalog.levels.map((id) => ({ id, label: id })),
      },
    ];
    const provider = await seedModelProvider({ id: catalog.id, label: catalog.id, models });
    const profile = await seedAgentProfiles([
      { id: "effort-anchor", name: "Effort anchor", provider: "mock" },
    ]);
    const workspace = await seedWorkspace({ repoPrefix: "all-efforts-" });
    try {
      await gotoWorkspace(page, workspace.workspaceId);
      await clickNewChat(page);
      await waitForDraftComposer(page);
      await openModelPicker(page);
      await searchAllModels(page, catalog.model);
      await page.getByTestId(`model-row-${catalog.id}-${catalog.model}`).click();
      await page.setViewportSize({ width: 900, height: 650 });
      for (const effort of catalog.levels) {
        await openModelPicker(page);
        const option = page.getByTestId(`model-picker-effort-${effort}`);
        await expect(option).toBeInViewport({ ratio: 1 });
        await option.click();
        await expect(option).toHaveAttribute("aria-checked", "true");
        await closeModelPicker(page);
        await openModelPicker(page);
        await expect(option).toHaveAttribute("aria-checked", "true");
        await expect
          .poll(() =>
            page.evaluate(
              ({ providerId, modelId }) => {
                const prefs = JSON.parse(
                  localStorage.getItem("@paseo:create-agent-preferences") ?? "{}",
                );
                return prefs.providerPreferences?.[providerId]?.thinkingByModel?.[modelId];
              },
              { providerId: catalog.id, modelId: catalog.model },
            ),
          )
          .toBe(effort);
        await closeModelPicker(page);
      }
    } finally {
      await workspace.cleanup();
      await provider.restore();
      await profile.restore();
    }
  });
}
