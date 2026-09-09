import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import {
  openAgentRoute,
  seedMockAgentWorkspace,
  type MockAgentWorkspace,
} from "../support/helpers/mock-agent";
import { expectWorkspaceAgentConfiguration } from "../support/helpers/command-center-agent-controls";
import { getServerId } from "../support/helpers/server-id";
import { agentPanel, sidePanel } from "../support/helpers/workspace-tabs";

async function splitChat(page: Page, agentId: string) {
  await page
    .getByTestId(`sidebar-workspace-row-${getServerId()}:chat:${agentId}`)
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: /^Open in/ }).click();
  await page.getByTestId("sidebar-open-split-right").click();
  await expect(agentPanel(page, agentId)).toBeVisible();
}

test("four chats keep separate folders, drafts, input focus and output through reload and compact mode", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1600, height: 1100 });
  const chats: MockAgentWorkspace[] = [];
  try {
    for (let index = 0; index < 4; index += 1) {
      chats.push(
        await seedMockAgentWorkspace({
          repoPrefix: `four-chat-${index}-`,
          title: `Independent chat ${index + 1}`,
          repo: {
            files: [
              { path: "guide.md", content: `# Folder ${index + 1}\n\nFOLDER_${index + 1}_ONLY\n` },
            ],
          },
          initialPrompt: "Show guide",
          featureValues: {
            mockStreamingAssistantResponse: `[Folder ${index + 1} guide](guide.md)`,
          },
        }),
      );
      await chats[index]!.client.waitForFinish(chats[index]!.agentId, 30_000);
    }
    await openAgentRoute(page, chats[0]!);
    for (const chat of chats.slice(1)) await splitChat(page, chat.agentId);
    const paneIds = ["main", "chat-2", "chat-3", "chat-4"];
    for (const [index, chat] of chats.entries()) {
      const input = agentPanel(page, chat.agentId)
        .getByTestId("message-input-root")
        .locator("textarea");
      await input.fill(`Draft for chat ${index + 1}`);
      await expect(page.getByTestId(`workspace-chat-view-${paneIds[index]}`)).toHaveAttribute(
        "data-pane-focused",
        "true",
      );
    }
    await expect(page.getByTestId("workspace-add-chat-view")).toBeDisabled();
    const boxes = await Promise.all(
      paneIds.map((id) => page.getByTestId(`workspace-chat-view-${id}`).boundingBox()),
    );
    expect(boxes[0]!.x).toBeLessThan(boxes[1]!.x);
    expect(boxes[0]!.y).toBe(boxes[1]!.y);
    expect(boxes[2]!.y).toBeGreaterThan(boxes[0]!.y);
    expect(boxes[2]!.x).toBe(boxes[0]!.x);
    for (const box of boxes) {
      expect(box!.width).toBeGreaterThan(400);
      expect(box!.height).toBeGreaterThan(350);
    }
    const screenshot = testInfo.outputPath("four-independent-chats.png");
    await page.screenshot({ path: screenshot });
    await testInfo.attach("four-independent-chats", { path: screenshot, contentType: "image/png" });
    await page.reload();
    await expect(page.getByTestId("workspace-chat-view-chat-4")).toHaveAttribute(
      "data-pane-focused",
      "true",
    );
    for (const [index, chat] of chats.entries()) {
      await expect(
        agentPanel(page, chat.agentId).getByTestId("message-input-root").locator("textarea"),
      ).toHaveValue(`Draft for chat ${index + 1}`);
    }
    await agentPanel(page, chats[1]!.agentId)
      .getByRole("button", { name: /^Select model/ })
      .click();
    const modelSearch = page.getByRole("textbox", { name: /search model/i });
    await modelSearch.fill("Ten second stream");
    await page.getByRole("dialog").getByText("Ten second stream", { exact: true }).click();
    await expectWorkspaceAgentConfiguration(chats[1]!, {
      id: chats[1]!.agentId,
      provider: "mock",
      model: "ten-second-stream",
      modeId: "load-test",
    });
    await expectWorkspaceAgentConfiguration(chats[0]!, {
      id: chats[0]!.agentId,
      provider: "mock",
      model: "e2e-fast-stream",
      modeId: "load-test",
    });
    await agentPanel(page, chats[2]!.agentId).locator('a[href="guide.md"]').click();
    await expect(sidePanel(page).getByTestId("workspace-file-pane")).toContainText("FOLDER_3_ONLY");
    for (const chat of chats) await expect(agentPanel(page, chat.agentId)).toBeVisible();
    await page.getByTestId("workspace-focus-chat-chat-2").click();
    await expect(agentPanel(page, chats[1]!.agentId)).toBeVisible();
    await expect(agentPanel(page, chats[0]!.agentId)).toBeHidden();
    await page.getByTestId("workspace-exit-focus-mode").click();
    for (const chat of chats) await expect(agentPanel(page, chat.agentId)).toBeVisible();
    // Return from the supporting dock, then prove Enter is handled by the clicked first pane.
    const firstInput = agentPanel(page, chats[0]!.agentId)
      .getByTestId("message-input-root")
      .locator("textarea");
    await firstInput.click();
    await firstInput.press("Enter");
    await expect(firstInput).toHaveValue("");
    await expect(agentPanel(page, chats[0]!.agentId)).toContainText("Draft for chat 1");
    await expect(
      agentPanel(page, chats[1]!.agentId).getByTestId("message-input-root").locator("textarea"),
    ).toHaveValue("Draft for chat 2");
    await page.setViewportSize({ width: 390, height: 844 });
    // Compact's supporting dock owns the one visible surface, including the same folder.
    await expect(page.getByTestId("workspace-file-pane")).toContainText("FOLDER_3_ONLY");
    await page.setViewportSize({ width: 1600, height: 1100 });
    for (const chat of chats) await expect(agentPanel(page, chat.agentId)).toBeVisible();
    await page.getByTestId("workspace-close-chat-chat-4").click();
    await expect(agentPanel(page, chats[3]!.agentId)).toBeHidden();
    expect(
      (await chats[3]!.client.fetchAgent({ agentId: chats[3]!.agentId }))?.agent.archivedAt,
    ).toBeNull();
    await expect(page.getByTestId("workspace-add-chat-view")).toBeEnabled();
  } finally {
    for (const chat of chats.toReversed()) await chat.cleanup();
  }
});

test("four-view control creates independent draft slots that survive reload", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  const chat = await seedMockAgentWorkspace({
    repoPrefix: "four-empty-views-",
    title: "Primary chat",
  });
  try {
    await openAgentRoute(page, chat);
    await page.getByTestId("workspace-four-chat-views").click();
    for (const paneId of ["main", "chat-2", "chat-3", "chat-4"]) {
      await expect(page.getByTestId(`workspace-chat-view-${paneId}`)).toBeVisible();
    }
    await page.reload();
    for (const paneId of ["main", "chat-2", "chat-3", "chat-4"]) {
      await expect(page.getByTestId(`workspace-chat-view-${paneId}`)).toBeVisible();
    }
    const secondPane = page.getByTestId("workspace-chat-view-chat-2");
    const thirdPane = page.getByTestId("workspace-chat-view-chat-3");
    await secondPane.getByTestId("workspace-empty-chat-start").click();
    await secondPane
      .getByRole("textbox", { name: "Message agent..." })
      .fill("Send from the second view");
    await thirdPane.getByTestId("workspace-empty-chat-start").click();
    await thirdPane.getByRole("textbox", { name: "Message agent..." }).fill("Keep the third draft");
    await page.reload();
    await expect(secondPane.getByRole("textbox", { name: "Message agent..." })).toHaveValue(
      "Send from the second view",
    );
    await expect(thirdPane.getByRole("textbox", { name: "Message agent..." })).toHaveValue(
      "Keep the third draft",
    );
    await expect(thirdPane).toHaveAttribute("data-pane-focused", "true");
    await secondPane.getByRole("textbox", { name: "Message agent..." }).press("Enter");
    await expect(
      secondPane
        .getByTestId("user-message")
        .getByText("Send from the second view", { exact: true }),
    ).toBeVisible();
    await expect(agentPanel(page, chat.agentId)).toBeVisible();
    await expect(thirdPane.getByRole("textbox", { name: "Message agent..." })).toHaveValue(
      "Keep the third draft",
    );
    await page.getByTestId("workspace-close-chat-chat-3").click();
    await expect(page.getByTestId("workspace-chat-view-chat-3")).toHaveCount(0);
    await expect(agentPanel(page, chat.agentId)).toBeVisible();
  } finally {
    await chat.cleanup();
  }
});
