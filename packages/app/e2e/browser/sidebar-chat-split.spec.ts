import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { openAgentRoute, seedMockAgentWorkspace } from "../support/helpers/mock-agent";
import { getServerId } from "../support/helpers/server-id";
import { agentPanel, sidePanel } from "../support/helpers/workspace-tabs";

function chatRow(page: Page, agentId: string) {
  return page.getByTestId(`sidebar-workspace-row-${getServerId()}:chat:${agentId}`);
}

async function openChatMenu(page: Page, agentId: string, keyboard = false) {
  await chatRow(page, agentId).click({ button: "right" });
  if (keyboard) {
    await page.keyboard.press("o");
  } else {
    await page.getByRole("menuitem", { name: /^Open in/ }).click();
  }
  await expect(page.getByTestId("sidebar-open-split-right")).toBeVisible();
}

async function openSplit(page: Page, agentId: string, keyboard = false) {
  await openChatMenu(page, agentId, keyboard);
  await expect(page.getByTestId("sidebar-open-split-right")).toBeEnabled();
  if (keyboard) {
    await page.keyboard.press("s");
  } else {
    await page.getByTestId("sidebar-open-split-right").click();
  }
  await expect(sidePanel(page).getByTestId(`workspace-panel-agent_${agentId}`)).toBeVisible();
}

test("O then S opens an independent chat beside the current chat with its own folder and saved draft", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 820 });
  const left = await seedMockAgentWorkspace({
    repoPrefix: "split-left-folder-",
    title: "Keep primary conversation",
    repo: { files: [{ path: "guide.md", content: "# Left guide\n\nLEFT_FOLDER_ONLY\n" }] },
  });
  const right = await seedMockAgentWorkspace({
    repoPrefix: "split-right-folder-",
    title: "Compare independent conversation",
    repo: { files: [{ path: "guide.md", content: "# Right guide\n\nRIGHT_FOLDER_ONLY\n" }] },
    initialPrompt: "Show the guide link",
    featureValues: { mockStreamingAssistantResponse: "[Open guide](guide.md)" },
  });
  try {
    await right.client.waitForFinish(right.agentId, 30_000);
    await openAgentRoute(page, left);
    const leftPanel = agentPanel(page, left.agentId);
    const leftInput = leftPanel.getByTestId("message-input-root").locator("textarea");
    const rightPanel = agentPanel(page, right.agentId);
    const rightInput = rightPanel.getByTestId("message-input-root").locator("textarea");
    await expect(leftPanel).toBeVisible();
    await leftInput.fill("Keep the primary draft");
    const primaryUrl = page.url();

    await openChatMenu(page, left.agentId, true);
    await expect(page.getByTestId("sidebar-open-split-right")).toBeDisabled();
    await expect(page.getByText("This chat is already in the current view.")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(leftInput).toHaveValue("Keep the primary draft");

    await openSplit(page, right.agentId, true);
    await expect(leftPanel).toBeVisible();
    await expect(page).toHaveURL(primaryUrl);
    await expect(chatRow(page, left.agentId)).toHaveAttribute("aria-selected", "true");
    await expect(chatRow(page, right.agentId)).toHaveAttribute("aria-selected", "false");
    await rightInput.fill("Keep the independent draft");
    await rightPanel.locator('a[href="guide.md"]').click();
    const preview = sidePanel(page).getByTestId("workspace-file-pane");
    await expect(preview).toContainText("RIGHT_FOLDER_ONLY");
    await expect(preview).not.toContainText("LEFT_FOLDER_ONLY");
    await expect(leftInput).toHaveValue("Keep the primary draft");

    // A normal menu click reuses the chat that was already open behind the document.
    await openSplit(page, right.agentId);
    await expect(page.getByTestId(`workspace-panel-agent_${right.agentId}`)).toHaveCount(1);
    await expect(rightInput).toHaveValue("Keep the independent draft");
    await page.reload();
    await expect(leftInput).toHaveValue("Keep the primary draft");
    await expect(
      sidePanel(page).getByTestId(`workspace-panel-agent_${right.agentId}`),
    ).toBeVisible();
    await expect(rightInput).toHaveValue("Keep the independent draft");
    await expect(page).toHaveURL(primaryUrl);
    await expect(chatRow(page, left.agentId)).toHaveAttribute("aria-selected", "true");

    const [leftBounds, rightBounds] = await Promise.all([
      leftPanel.boundingBox(),
      rightPanel.boundingBox(),
    ]);
    expect(leftBounds).not.toBeNull();
    expect(rightBounds).not.toBeNull();
    expect(leftBounds!.width).toBeGreaterThanOrEqual(400);
    expect(rightBounds!.width).toBeGreaterThanOrEqual(240);
    expect(rightBounds!.x).toBeGreaterThanOrEqual(leftBounds!.x + leftBounds!.width - 1);
    expect(rightBounds!.x + rightBounds!.width).toBeLessThanOrEqual(1280);

    const screenshotPath = testInfo.outputPath("two-independent-chats.png");
    await page.screenshot({ path: screenshotPath });
    await testInfo.attach("two-independent-chats", {
      path: screenshotPath,
      contentType: "image/png",
    });
    await sidePanel(page).getByTestId(`workspace-side-panel-view-agent_${right.agentId}`).hover();
    await sidePanel(page)
      .getByTestId(`workspace-side-panel-close-view-agent_${right.agentId}`)
      .click();
    await expect(rightPanel).toHaveCount(0);
    await expect(leftInput).toHaveValue("Keep the primary draft");
    await expect(page).toHaveURL(primaryUrl);
    expect(
      (await right.client.fetchAgent({ agentId: right.agentId }))?.agent.archivedAt,
    ).toBeNull();

    await openChatMenu(page, right.agentId);
    await page.getByTestId("sidebar-open-current-view").click();
    await expect(page).toHaveURL(new RegExp(encodeURIComponent(right.workspaceId)));
    await expect(rightInput).toHaveValue("Keep the independent draft");
    await page.goto(primaryUrl);
    await expect(leftInput).toHaveValue("Keep the primary draft");
    await openSplit(page, right.agentId);
    await expect(rightInput).toHaveValue("Keep the independent draft");

    // Archive is explicit and closes the split even though its chat belongs to another folder.
    await chatRow(page, right.agentId).click({ button: "right" });
    await expect(
      page.getByTestId(`sidebar-workspace-menu-archive-${getServerId()}:chat:${right.agentId}`),
    ).toBeVisible();
    await page.keyboard.press("a");
    await expect(chatRow(page, right.agentId)).toHaveCount(0);
    await expect(rightPanel).toHaveCount(0);
    await expect(leftInput).toHaveValue("Keep the primary draft");
    await expect(page).toHaveURL(primaryUrl);
    await expect
      .poll(
        async () => (await right.client.fetchAgent({ agentId: right.agentId }))?.agent.archivedAt,
      )
      .not.toBeNull();
    expect((await left.client.fetchAgent({ agentId: left.agentId }))?.agent.archivedAt).toBeNull();
  } finally {
    await right.cleanup();
    await left.cleanup();
  }
});
