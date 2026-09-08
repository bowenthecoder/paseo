import { expect, test } from "../support/fixtures";
import { seedMockAgentWorkspace, openAgentRoute } from "../support/helpers/mock-agent";
import { installProviderUsageFixture } from "../support/helpers/provider-usage";

const response = (usedPct: number, status: "available" | "error" = "available") => ({
  fetchedAt: new Date().toISOString(),
  providers: [
    {
      providerId: "mock",
      displayName: "Test subscription",
      status,
      planLabel: "Test plan",
      windows: [{ id: "session", label: "Session", usedPct }],
      error: status === "error" ? "Usage service is temporarily unavailable" : null,
    },
  ],
});

test("account usage stays beside context and refreshes on demand", async ({ page }, testInfo) => {
  const fixture = await installProviderUsageFixture(page, [response(21), response(64)]);
  const session = await seedMockAgentWorkspace({
    repoPrefix: "context-plan-",
    title: "Context and account usage",
    initialPrompt: "emit 1 coalesced agent stream update",
  });
  try {
    await openAgentRoute(page, session);
    const badge = page.getByTestId("account-usage-badge");
    const context = page.getByTestId("context-window-meter");
    await expect(badge).toHaveText("Plan 21%");
    await expect(context).toBeVisible();
    await context.hover();
    await expect(page.getByText("Context window", { exact: true })).toBeVisible();
    await expect(page.getByText("Test subscription", { exact: true })).toBeVisible();
    await expect(badge).toHaveText("Plan 64%");
    expect(fixture.requestCount()).toBeGreaterThanOrEqual(2);
    await page.mouse.move(0, 0);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(badge).toBeInViewport({ ratio: 1 });
    await expect(context).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: testInfo.outputPath("mobile-context-plan.png") });
  } finally {
    await session.cleanup();
  }
});

test("usage errors are visible and manual refresh recovers", async ({ page }) => {
  await installProviderUsageFixture(page, [response(0, "error"), response(33)]);
  const session = await seedMockAgentWorkspace({
    repoPrefix: "plan-error-",
    title: "Usage recovery",
    initialPrompt: "emit 1 coalesced agent stream update",
  });
  try {
    await openAgentRoute(page, session);
    const badge = page.getByTestId("account-usage-badge");
    await expect(badge).toHaveText("Plan —");
    await badge.hover();
    await expect(page.getByText("Usage service is temporarily unavailable")).toBeVisible();
    await badge.click();
    await expect(badge).toHaveText("Plan 33%");
  } finally {
    await session.cleanup();
  }
});

test("account usage refreshes automatically while the chat remains open", async ({ page }) => {
  await page.clock.install();
  const fixture = await installProviderUsageFixture(page, [response(21), response(64)]);
  const session = await seedMockAgentWorkspace({
    repoPrefix: "plan-poll-",
    title: "Automatic plan refresh",
    initialPrompt: "emit 1 coalesced agent stream update",
  });
  try {
    await openAgentRoute(page, session);
    const badge = page.getByTestId("account-usage-badge");
    await expect(badge).toHaveText("Plan 21%");
    await page.clock.fastForward(5 * 60 * 1000 + 1000);
    await expect(badge).toHaveText("Plan 64%");
    expect(fixture.requestCount()).toBeGreaterThanOrEqual(2);
  } finally {
    await session.cleanup();
  }
});
