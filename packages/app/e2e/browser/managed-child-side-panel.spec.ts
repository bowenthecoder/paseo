import { PARENT_AGENT_ID_LABEL } from "@getpaseo/protocol/agent-labels";
import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "../support/fixtures";
import { openAgentRoute } from "../support/helpers/mock-agent";
import { seedWorkspace } from "../support/helpers/seed-client";
import { openSubagentsTrack } from "../support/helpers/subagents";
import { agentPanel, closeSidePanel, sidePanel } from "../support/helpers/workspace-tabs";

test("a managed child stays beside its parent and opens files from its own working folder", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 960 });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() => {
    localStorage.setItem(
      "@paseo:changes-preferences",
      JSON.stringify({ layout: "unified", wrapLines: false, hideWhitespace: false }),
    );
  });
  const parentWorkspace = await seedWorkspace({
    repoPrefix: "parent-side-context-",
    repo: { files: [{ path: "guide.md", content: "PARENT_FOLDER_ONLY" }] },
  });
  const childWorkspace = await seedWorkspace({
    repoPrefix: "child-side-context-",
    repo: {
      withRemote: true,
      files: [{ path: "guide.md", content: "# Child guide\n\nCHILD_FOLDER_ONLY\n" }],
    },
  });
  try {
    const parent = await parentWorkspace.client.createAgent({
      provider: "mock",
      model: "e2e-fast-stream",
      modeId: "load-test",
      cwd: parentWorkspace.repoPath,
      workspaceId: parentWorkspace.workspaceId,
      title: "Parent conversation",
    });
    const child = await childWorkspace.client.createAgent({
      provider: "mock",
      model: "e2e-fast-stream",
      modeId: "load-test",
      cwd: childWorkspace.repoPath,
      workspaceId: childWorkspace.workspaceId,
      title: "Review child document",
      labels: { [PARENT_AGENT_ID_LABEL]: parent.id },
      initialPrompt: [
        "Generate a title and a git branch name for a coding agent from the user prompt and attachments.",
        "Return JSON only with fields 'title' and 'branch'.",
        "<user-prompt>",
        "Open `guide.md` now",
        "</user-prompt>",
      ].join("\n"),
    });
    await childWorkspace.client.waitForFinish(child.id, 30_000);
    await openAgentRoute(page, { agentId: parent.id, workspaceId: parentWorkspace.workspaceId });
    const parentPanel = agentPanel(page, parent.id);
    const parentInput = parentPanel.getByTestId("message-input-root").locator("textarea");
    await expect(parentPanel).toBeVisible();
    await parentInput.fill("Keep this parent draft");
    const parentUrl = page.url();
    await openSubagentsTrack(page);
    await page.getByTestId(`subagents-track-row-${child.id}`).click();
    await expect(sidePanel(page).getByTestId(`workspace-panel-agent_${child.id}`)).toBeVisible();
    await expect(parentPanel).toBeVisible();
    await expect(page).toHaveURL(parentUrl);
    const childPanel = agentPanel(page, child.id);
    const childInput = childPanel.getByTestId("message-input-root").locator("textarea");
    await childInput.fill("Keep this child draft");
    await childPanel.locator('a[href="guide.md"]').click();
    const preview = sidePanel(page).getByTestId("workspace-file-pane");
    await expect(preview).toContainText("CHILD_FOLDER_ONLY");
    await expect(preview).not.toContainText("PARENT_FOLDER_ONLY");
    await expect(parentInput).toHaveValue("Keep this parent draft");
    await closeSidePanel(page);
    await openSubagentsTrack(page);
    await page.getByTestId(`subagents-track-row-${child.id}`).click();
    await expect(childInput).toHaveValue("Keep this child draft");
    await expect(parentInput).toHaveValue("Keep this parent draft");

    await rm(path.join(childWorkspace.repoPath, "remote.git"), { recursive: true });
    await writeFile(
      path.join(childWorkspace.repoPath, "guide.md"),
      "# Child guide\n\nCHILD_FOLDER_ONLY\n\nCHILD_CHANGE_ONLY\n",
    );
    await childWorkspace.client.checkoutRefresh(childWorkspace.repoPath);
    await expect
      .poll(async () => {
        const result = await childWorkspace.client.fetchWorkspaces();
        return result.entries.find((entry) => entry.id === childWorkspace.workspaceId)?.diffStat;
      })
      .toEqual({ additions: 2, deletions: 0 });
    await childPanel.getByTestId("composer-diff-stat-pill").click();
    const childDiff = sidePanel(page).getByTestId("working-diff-panel");
    await expect(childDiff).toBeVisible();
    await expectOverflowingRailToRevealActiveView(page);
    await expect(
      childDiff.locator('[data-diff-header-path="guide.md"]').getByTestId("diff-file-0"),
    ).toHaveAttribute("aria-label", "guide.md, +2, -0");
    await expect(childDiff.getByTestId("git-diff-canvas")).toBeVisible();
    await expect
      .poll(() => copyChildGuideDiff(page, childDiff))
      .toBe("# Child guide\n\nCHILD_FOLDER_ONLY\n\nCHILD_CHANGE_ONLY");
    await expect(parentInput).toHaveValue("Keep this parent draft");
    const screenshotPath = testInfo.outputPath("child-diff-beside-parent.png");
    await page.screenshot({ path: screenshotPath });
    await testInfo.attach("child-diff-beside-parent", {
      path: screenshotPath,
      contentType: "image/png",
    });
    await closeSidePanel(page);
    await openSubagentsTrack(page);
    await page.getByTestId(`subagents-track-row-${child.id}`).click();

    await page.reload();
    await expect(parentPanel).toBeVisible();
    await expect(sidePanel(page).getByTestId(`workspace-panel-agent_${child.id}`)).toBeVisible();
    await expect(childInput).toHaveValue("Keep this child draft");
    await expect(parentInput).toHaveValue("Keep this parent draft");

    const grandchild = await childWorkspace.client.createAgent({
      provider: "mock",
      model: "e2e-fast-stream",
      modeId: "load-test",
      cwd: childWorkspace.repoPath,
      workspaceId: childWorkspace.workspaceId,
      title: "Review nested task",
      labels: { [PARENT_AGENT_ID_LABEL]: child.id },
    });
    await childPanel.getByTestId("subagents-track-header").click();
    await page.getByTestId(`subagents-track-row-${grandchild.id}`).click();
    const grandchildPanel = agentPanel(page, grandchild.id);
    await expect(
      sidePanel(page).getByTestId(`workspace-panel-agent_${grandchild.id}`),
    ).toBeVisible();
    await expect(parentInput).toHaveValue("Keep this parent draft");
    await grandchildPanel
      .getByTestId("message-input-root")
      .locator("textarea")
      .fill("Nested draft");
    await page.reload();
    await expect(grandchildPanel.getByTestId("message-input-root").locator("textarea")).toHaveValue(
      "Nested draft",
    );
    await expectOverflowingRailToRevealActiveView(page);
    await expect(parentInput).toHaveValue("Keep this parent draft");
    await expect(page).toHaveURL(parentUrl);

    const nestedInput = grandchildPanel.getByTestId("message-input-root").locator("textarea");
    await nestedInput.fill("/quit");
    await nestedInput.press("Enter");
    await expect(grandchildPanel).toBeHidden();
    await expect(parentInput).toHaveValue("Keep this parent draft");
    await expect(page).toHaveURL(parentUrl);

    await parentPanel.getByTestId("subagents-track-header").click();
    await page.getByTestId(`subagents-track-row-${child.id}`).click();
    await childInput.fill("/clear");
    await childInput.press("Enter");
    await expect(page).toHaveURL(new RegExp(encodeURIComponent(childWorkspace.workspaceId)));
    await expect(
      page.locator('[data-testid^="workspace-panel-draft_"]').filter({ visible: true }),
    ).toBeVisible();
    await expect
      .poll(() => childWorkspace.client.fetchAgent({ agentId: child.id }))
      .toMatchObject({ agent: { archivedAt: expect.any(String) } });
    await page.goto(parentUrl);
    await expect(parentInput).toHaveValue("Keep this parent draft");
  } finally {
    await childWorkspace.cleanup();
    await parentWorkspace.cleanup();
  }
});

async function expectOverflowingRailToRevealActiveView(page: Page): Promise<void> {
  await expect
    .poll(() =>
      sidePanel(page)
        .getByTestId("workspace-side-panel-rail")
        .evaluate((rail) => {
          const viewport = rail.querySelector<HTMLElement>(
            '[data-testid="workspace-side-panel-rail-scroll"]',
          );
          const active = rail.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
          const close = rail.querySelector<HTMLElement>(
            '[data-testid="workspace-side-panel-close"]',
          );
          if (!viewport || !active || !close) {
            return { viewportPresent: !!viewport, activePresent: !!active, closePresent: !!close };
          }
          const viewportRect = viewport.getBoundingClientRect();
          const activeRect = active.parentElement!.getBoundingClientRect();
          const closeRect = close.getBoundingClientRect();
          const entries = Array.from(rail.querySelectorAll<HTMLElement>('[role="tab"]'));
          const entryRects = entries.map((entry) => entry.parentElement!.getBoundingClientRect());
          const noOverlap = entryRects.every(
            (rect, index) => index === 0 || rect.left >= entryRects[index - 1].right - 1,
          );
          return {
            overflowing: viewport.scrollWidth > viewport.clientWidth,
            scrolled: viewport.scrollLeft > 0,
            activeVisible:
              activeRect.left >= viewportRect.left - 1 &&
              activeRect.right <= viewportRect.right + 1,
            closeReachable:
              viewportRect.right <= closeRect.left &&
              closeRect.right <= rail.getBoundingClientRect().right,
            noOverlap,
            scrollLeft: viewport.scrollLeft,
            contentWidth: viewport.scrollWidth,
            viewport: { left: viewportRect.left, right: viewportRect.right },
            active: { left: activeRect.left, right: activeRect.right },
            close: { left: closeRect.left, right: closeRect.right },
            entries: entryRects.map((rect) => ({ left: rect.left, right: rect.right })),
          };
        }),
    )
    .toMatchObject({
      overflowing: true,
      scrolled: true,
      activeVisible: true,
      closeReachable: true,
      noOverlap: true,
    });
}

async function copyChildGuideDiff(page: Page, panel: Locator): Promise<string> {
  const [bodyBounds, metrics] = await Promise.all([
    panel.getByTestId("diff-file-0-body").boundingBox(),
    panel.getByTestId("git-diff-canvas").evaluate((element) => {
      const style = getComputedStyle(element);
      const fontSize = Number.parseFloat(style.fontSize);
      const measurement = document.createElement("canvas").getContext("2d");
      if (!measurement) throw new Error("Canvas text measurement unavailable");
      measurement.font = `${fontSize}px ${style.fontFamily}`;
      return { fontSize, characterWidth: measurement.measureText("A").width };
    }),
  ]);
  if (!bodyBounds) throw new Error("Child diff body has no bounds");
  const lineHeight = Math.round(metrics.fontSize * 1.5);
  const gutterWidth = 2 * Math.ceil(metrics.fontSize * 0.62) + 12;
  const textLeft = bodyBounds.x + gutterWidth + 8;
  // Start at the text's end so the hover review button beside the gutter cannot
  // intercept pointer-down. Pointer capture then keeps the full backward selection.
  await page.mouse.move(
    textLeft + "CHILD_CHANGE_ONLY".length * metrics.characterWidth - 1,
    bodyBounds.y + lineHeight * 5.5,
  );
  await page.mouse.down();
  await page.mouse.move(textLeft + 1, bodyBounds.y + lineHeight * 1.5, { steps: 12 });
  await page.mouse.up();
  await page.keyboard.press("ControlOrMeta+C");
  return page.evaluate(() => navigator.clipboard.readText());
}
