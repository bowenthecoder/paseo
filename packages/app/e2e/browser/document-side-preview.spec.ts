import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "../support/fixtures";
import { expectComposerDraft, fillComposerDraft } from "../support/helpers/composer";
import { openAgentRoute, seedMockAgentWorkspace } from "../support/helpers/mock-agent";
import { openFileExplorer, openFileFromExplorer } from "../support/helpers/file-explorer";

const MARKDOWN =
  "# Preview guide\n\nRendered **Markdown** beside the conversation.\n\n- Keep the chat open\n";
const NOTES = "A plain text document.\nThe working conversation stays available.\n";

function filePane(page: Page) {
  return page.getByTestId("workspace-file-pane").filter({ visible: true });
}

function chatPane(page: Page) {
  return page.getByTestId("message-input-root").filter({ visible: true });
}

function fileTab(page: Page, filename: string) {
  return page
    .locator('[data-testid^="workspace-panel-file_"]')
    .filter({ hasText: filename, visible: true });
}

async function closeFile(page: Page, filename: string) {
  await fileTab(page, filename).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Close", exact: true }).click();
  await expect(fileTab(page, filename)).toHaveCount(0);
}

async function expectDocumentBesideChat(page: Page) {
  await expect(filePane(page)).toBeVisible();
  await expect(chatPane(page)).toBeVisible();
  const [document, chat] = await Promise.all([
    filePane(page).boundingBox(),
    chatPane(page).boundingBox(),
  ]);
  if (!document || !chat) throw new Error("Document and chat must both have visible geometry");
  expect(document.x).toBeGreaterThanOrEqual(chat.x + chat.width - 1);
  expect(document.width).toBeGreaterThan(280);
  expect(chat.width).toBeGreaterThan(280);
  expect(document.x + document.width).toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) + 1);
}

async function seedDocuments() {
  const session = await seedMockAgentWorkspace({
    repoPrefix: "document-side-preview-",
    title: "Document preview chat",
    initialPrompt: [
      "Generate a title and a git branch name for a coding agent from the user prompt and attachments.",
      "Return JSON only with fields 'title' and 'branch'.",
      "<user-prompt>",
      "Open `guide.md`, `notes.txt`, and `missing.txt` now",
      "</user-prompt>",
    ].join("\n"),
  });
  await writeFile(path.join(session.cwd, "guide.md"), MARKDOWN, "utf8");
  await writeFile(path.join(session.cwd, "notes.txt"), NOTES, "utf8");
  return session;
}

test.describe("Documents alongside the conversation", () => {
  test("opens Markdown and text on the right, preserves the draft and recovers a missing file", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const session = await seedDocuments();
    try {
      await openAgentRoute(page, session);
      await expect(page.getByText("guide.md", { exact: true })).toBeVisible();
      await fillComposerDraft(page, "Continue after reading");
      await page.getByText("guide.md", { exact: true }).click();
      await expectDocumentBesideChat(page);
      await expect(filePane(page).getByText("Preview guide", { exact: true })).toBeVisible();
      await expect(page.getByTestId("file-mode-preview")).toHaveAttribute("aria-selected", "true");
      await page.getByTestId("file-mode-source").click();
      await expect(filePane(page).getByTestId("file-source-editor")).toContainText(
        "# Preview guide",
      );
      await page.getByTestId("file-mode-preview").click();
      await testInfo.attach("markdown-beside-chat", {
        body: await page.screenshot(),
        contentType: "image/png",
      });

      await page.setViewportSize({ width: 800, height: 700 });
      await expectDocumentBesideChat(page);
      await closeFile(page, "guide.md");
      await expectComposerDraft(page, "Continue after reading");

      await page.getByText("notes.txt", { exact: true }).click();
      await expectDocumentBesideChat(page);
      await expect(filePane(page).getByTestId("file-source-editor")).toContainText(
        "A plain text document.",
      );
      await expect(page.getByTestId("file-preview-mode")).toHaveCount(0);
      await closeFile(page, "notes.txt");
      await expectComposerDraft(page, "Continue after reading");

      await page.getByText("missing.txt", { exact: true }).click();
      await expect(page.getByTestId("assistant-file-link-not-found-toast")).toContainText(
        "No file found",
      );
      await expect(chatPane(page)).toBeVisible();
      await writeFile(path.join(session.cwd, "missing.txt"), "Recovered document", "utf8");
      await page.getByText("missing.txt", { exact: true }).click();
      await expectDocumentBesideChat(page);
      await expect(filePane(page).getByTestId("file-source-editor")).toContainText(
        "Recovered document",
      );
      await closeFile(page, "missing.txt");
      await expectComposerDraft(page, "Continue after reading");
      expect(errors).toEqual([]);
    } finally {
      await session.cleanup();
    }
  });

  test("respects Main and offers an explicit Open to the side action", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.addInitScript(() => {
      localStorage.setItem(
        "@paseo:app-settings",
        JSON.stringify({ openInSidePane: { chatFiles: false } }),
      );
    });
    const session = await seedDocuments();
    try {
      await openAgentRoute(page, session);
      const link = page.getByText("guide.md", { exact: true });
      await expect(link).toBeVisible();
      await link.click();
      await expect(filePane(page).getByText("Preview guide", { exact: true })).toBeVisible();
      await expect(chatPane(page)).toHaveCount(0);
      await closeFile(page, "guide.md");
      await expect(chatPane(page)).toBeVisible();

      await link.click({ button: "right" });
      await page.getByRole("menuitem", { name: "Open to the side", exact: true }).click();
      await expectDocumentBesideChat(page);
      await expect(filePane(page).getByText("Preview guide", { exact: true })).toBeVisible();
    } finally {
      await session.cleanup();
    }
  });

  test("uses a full-width document on compact screens and returns to the same chat", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const session = await seedDocuments();
    try {
      await openAgentRoute(page, session);
      await expect(page.getByText("guide.md", { exact: true })).toBeVisible();
      await fillComposerDraft(page, "Compact draft retained");
      await page.getByText("guide.md", { exact: true }).click();
      await expect(filePane(page).getByText("Preview guide", { exact: true })).toBeVisible();
      await expect(chatPane(page)).toHaveCount(0);
      const document = await filePane(page).boundingBox();
      if (!document) throw new Error("Compact document has no geometry");
      expect(document.width).toBeGreaterThan(350);
      expect(document.x + document.width).toBeLessThanOrEqual(391);
      await page.getByTestId("file-mode-source").click();
      await expect(filePane(page).getByTestId("file-source-editor")).toContainText(
        "# Preview guide",
      );
      await page.getByRole("button", { name: /Switch tabs/ }).click();
      await page
        .locator('[data-testid^="workspace-tab-menu-file_"][data-testid$="-trigger"]')
        .filter({ visible: true })
        .click();
      await page
        .locator('[data-testid^="workspace-tab-menu-file_"][data-testid$="-close"]')
        .filter({ visible: true })
        .click();
      await expect(filePane(page)).toHaveCount(0);
      await expectComposerDraft(page, "Compact draft retained");
    } finally {
      await session.cleanup();
    }
  });

  test("browses outside the working folder and opens the correct host file", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const session = await seedMockAgentWorkspace({
      repoPrefix: "device-files-tree-",
      title: "Files tree seed",
    });
    try {
      const workingFolder = path.join(session.cwd, "working");
      await mkdir(workingFolder);
      await writeFile(path.join(workingFolder, "inside.txt"), "Inside working folder", "utf8");
      await writeFile(
        path.join(session.cwd, "outside.txt"),
        "Outside working folder, same device",
        "utf8",
      );
      const created = await session.client.createWorkspace({
        source: { kind: "directory", path: workingFolder },
      });
      if (!created.workspace) throw new Error(created.error ?? "Failed to create nested workspace");
      const agent = await session.client.createAgent({
        provider: "mock",
        cwd: workingFolder,
        workspaceId: created.workspace.id,
        title: "Device Files chat",
        modeId: "load-test",
        model: "e2e-fast-stream",
      });
      await openAgentRoute(page, { agentId: agent.id, workspaceId: created.workspace.id });
      await openFileExplorer(page);
      await expect(page.getByTestId("files-browse-path")).toHaveText(
        workingFolder.replaceAll("\\", "/"),
      );
      await page.getByTestId("files-browse-parent").click();
      await expect(page.getByTestId("files-browse-path")).toHaveText(
        session.cwd.replaceAll("\\", "/"),
      );
      await openFileFromExplorer(page, "outside.txt");
      await expect(filePane(page).getByTestId("file-source-editor")).toContainText(
        "Outside working folder, same device",
      );
      await expect(
        page.locator('[data-testid^="workspace-panel-file_"]').filter({ visible: true }),
      ).toHaveAttribute(
        "data-testid",
        `workspace-panel-file_${path.join(session.cwd, "outside.txt").replaceAll("\\", "/")}`,
      );

      await page.getByTestId("files-browse-home").click();
      await expect(page.getByTestId("files-browse-path")).toHaveText("~");
      await page.getByTestId("files-browse-root").click();
      await expect(page.getByTestId("files-browse-path")).toHaveText(
        path.parse(workingFolder).root.replaceAll("\\", "/"),
      );
      await expect(page.getByTestId("files-browse-parent")).toBeDisabled();
      await page.getByTestId("files-browse-workspace").click();
      await expect(
        page.getByTestId("file-explorer-tree-scroll").getByText("inside.txt", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByTestId("file-explorer-tree-scroll").getByText("outside.txt", { exact: true }),
      ).toHaveCount(0);
      const agents = await session.client.fetchAgents();
      expect(agents.entries.find((entry) => entry.agent.id === agent.id)?.agent.cwd).toBe(
        workingFolder,
      );
    } finally {
      await session.cleanup();
    }
  });
});
