import path from "node:path";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { test, expect } from "../support/fixtures";
import {
  createSettledMockAgent,
  createSmallAssistantPng,
  expectAssistantImageRendered,
  openAssistantImageTimeline,
  openExistingImageAgentTabs,
} from "../support/helpers/assistant-images";
import { clickSessionRow, openSessions } from "../support/helpers/archive-tab";
import { delayFileReadResponse } from "../support/helpers/file-read-gate";
import { seedWorkspace } from "../support/helpers/seed-client";

test("Markdown images and document links decode local URL paths once", async ({ page }) => {
  test.setTimeout(90_000);
  const directory = "Paseo Preview 20260908";
  const documentPath = `${directory}/review %20 notes.md`;
  const workspace = await seedWorkspace({
    repoPrefix: "markdown-encoded-local-paths-",
    repo: {
      files: [{ path: documentPath, content: "# Decoded local path\n\nPERCENT_FILENAME_OK\n" }],
    },
  });
  try {
    const image = await createSmallAssistantPng(workspace, {
      alt: "Screenshot in a folder with spaces",
      fileName: `${directory}/current %20 chats.png`,
    });
    const agent = await createSettledMockAgent(workspace, "Encoded local paths");
    const imagePath = path.join(workspace.repoPath, image.relativePath);
    const imageHref = `${encodeURI(imagePath)}?preview=1`;
    const documentHref = `${encodeURI(path.join(workspace.repoPath, documentPath))}:3`;
    await workspace.client.sendAgentMessage(
      agent.id,
      `Emit settled assistant image Markdown: ![${image.alt}](${imageHref}) [Open encoded document](${documentHref})`,
    );
    const result = await workspace.client.waitForFinish(agent.id, 30_000);
    expect(result.status).toBe("idle");
    expect(result.final?.lastError).toBeFalsy();

    const gate = await delayFileReadResponse(page, imagePath);
    await openAssistantImageTimeline(page, agent);
    await gate.waitUntilHeld();
    const loading = page.getByTestId("assistant-image-loading");
    await expect(loading).toBeVisible();
    expect(
      await loading.evaluate((element) => element.getBoundingClientRect().height),
    ).toBeLessThanOrEqual(40);
    gate.release();
    await expectAssistantImageRendered(page, image);
    await expect(loading).toHaveCount(0);
    await page.getByRole("link", { name: "Open encoded document", exact: true }).last().click();
    const preview = page.getByTestId("workspace-file-pane");
    await expect(preview).toContainText("PERCENT_FILENAME_OK", { timeout: 30_000 });
    await expect(preview).not.toContainText("ENOENT");
    await expect(page.getByTestId(`workspace-tab-file_${documentPath}`).first()).toBeVisible();
  } finally {
    await workspace.cleanup();
  }
});

test("an unavailable local image stays compact and Retry reads the recovered file", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const directory = "Paseo Preview Recovery";
  const workspace = await seedWorkspace({
    repoPrefix: "markdown-image-retry-",
    repo: { files: [{ path: `${directory}/readme.md`, content: "Image retry fixture\n" }] },
  });
  try {
    const fixture = {
      alt: "Recovered local screenshot",
      fileName: `${directory}/retry %20 screenshot.png`,
    };
    const image = await createSmallAssistantPng(workspace, fixture);
    const imagePath = path.join(workspace.repoPath, image.relativePath);
    await unlink(imagePath);
    const agent = await createSettledMockAgent(workspace, "Recover missing screenshot");
    await workspace.client.sendAgentMessage(
      agent.id,
      `Emit settled assistant image Markdown: ![${image.alt}](${encodeURI(imagePath)})`,
    );
    const result = await workspace.client.waitForFinish(agent.id, 30_000);
    expect(result.status).toBe("idle");
    expect(result.final?.lastError).toBeFalsy();

    await openAssistantImageTimeline(page, agent);
    const error = page.getByTestId("assistant-image-error");
    await expect(error).toContainText("Image unavailable", { timeout: 30_000 });
    await expect(error).not.toContainText("ENOENT");
    expect(
      await error.evaluate((element) => element.getBoundingClientRect().height),
    ).toBeLessThanOrEqual(40);
    await createSmallAssistantPng(workspace, fixture);
    await error.getByRole("button", { name: "Retry", exact: true }).press("Enter");
    await expectAssistantImageRendered(page, image);
    await expect(error).toHaveCount(0);
  } finally {
    await workspace.cleanup();
  }
});

test("a repaired truncated PNG stays valid after Retry, chat remount, and reload", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const workspace = await seedWorkspace({ repoPrefix: "markdown-image-remount-" });
  try {
    const fixture = { alt: "Repaired truncated screenshot", fileName: "truncated screenshot.png" };
    const image = await createSmallAssistantPng(workspace, fixture);
    const imagePath = path.join(workspace.repoPath, image.relativePath);
    const bytes = await readFile(imagePath);
    await writeFile(imagePath, bytes.subarray(0, 8));
    const imageAgent = await createSettledMockAgent(workspace, "Repair truncated screenshot");
    const otherAgent = await createSettledMockAgent(workspace, "Keep another chat open");
    await workspace.client.sendAgentMessage(
      imageAgent.id,
      `Emit settled assistant image Markdown: ![${image.alt}](${encodeURI(imagePath)})`,
    );
    const result = await workspace.client.waitForFinish(imageAgent.id, 30_000);
    expect(result.status).toBe("idle");
    expect(result.final?.lastError).toBeFalsy();

    await openExistingImageAgentTabs(page, { imageAgent, otherAgent });
    const error = page.getByTestId("assistant-image-error");
    await expect(error).toContainText("Image unavailable", { timeout: 30_000 });
    await createSmallAssistantPng(workspace, fixture);
    await error.getByRole("button", { name: "Retry", exact: true }).click();
    await expectAssistantImageRendered(page, image);

    // History leaves the workspace route, unmounting the image without resetting caches.
    const navigationOrigin = await page.evaluate(() => performance.timeOrigin);
    await unlink(imagePath);
    await openSessions(page);
    await expect(page.getByRole("img", { name: image.alt })).toHaveCount(0);
    await clickSessionRow(page, imageAgent.title);
    await expectAssistantImageRendered(page, image);
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(navigationOrigin);
    await expect(error).toHaveCount(0);

    await createSmallAssistantPng(workspace, fixture);
    await page.reload();
    await expectAssistantImageRendered(page, image);
    await expect(error).toHaveCount(0);
  } finally {
    await workspace.cleanup();
  }
});
