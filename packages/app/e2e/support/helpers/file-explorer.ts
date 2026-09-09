import { expect, type Page } from "@playwright/test";
import { openFilesPanel } from "./workspace-tabs";

function fileExplorerTree(page: Page) {
  return page.getByTestId("file-explorer-tree-scroll").filter({ visible: true });
}

function fileExplorerEntry(page: Page, name: string) {
  return fileExplorerTree(page).getByText(name, { exact: true }).first();
}

export async function openFileExplorer(page: Page): Promise<void> {
  if (!(await fileExplorerTree(page).isVisible())) await openFilesPanel(page);
  await expect(fileExplorerTree(page)).toBeVisible({ timeout: 30_000 });
}

export async function expandFolder(page: Page, folderName: string): Promise<void> {
  await openFileExplorer(page);
  await fileExplorerEntry(page, folderName).click();
}

export async function collapseFolder(page: Page, folderName: string): Promise<void> {
  await openFileExplorer(page);
  await fileExplorerEntry(page, folderName).click();
}

export async function openFileFromExplorer(page: Page, fileName: string): Promise<void> {
  await openFileExplorer(page);
  await fileExplorerEntry(page, fileName).click();
}

export async function expectExplorerEntryVisible(page: Page, name: string): Promise<void> {
  await openFileExplorer(page);
  await expect(fileExplorerEntry(page, name)).toBeVisible({ timeout: 30_000 });
}

export async function expectExplorerEntryHidden(page: Page, name: string): Promise<void> {
  await openFileExplorer(page);
  await expect(fileExplorerEntry(page, name)).toBeHidden({ timeout: 30_000 });
}

export async function expectFileTabOpen(page: Page, filePath: string): Promise<void> {
  const view = page
    .getByTestId(`workspace-side-panel-view-file_${filePath}`)
    .filter({ visible: true });
  await expect(view).toBeVisible({
    timeout: 30_000,
  });
  await expect(view).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("workspace-file-pane").filter({ visible: true })).toBeVisible();
}
