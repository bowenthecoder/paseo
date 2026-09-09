import { expect, test, type Page } from "../support/fixtures";
import { buildHostWorkspaceRoute } from "../../src/utils/host-routes";
import { runWorkspaceActionFromCommandCenter } from "../support/helpers/command-center-workspace-actions";
import { getServerId } from "../support/helpers/server-id";
import { TerminalE2EHarness } from "../support/helpers/terminal-dsl";
import { getTerminalBufferText } from "../support/helpers/terminal-perf";

async function createTerminalFromMenu(page: Page): Promise<void> {
  const trigger = page.getByTestId("workspace-header-menu-trigger").filter({ visible: true });
  await expect(trigger).toBeVisible({ timeout: 30_000 });
  await trigger.click();
  await page.getByTestId("workspace-header-new-terminal").click();
}

async function listTerminalIds(harness: TerminalE2EHarness): Promise<string[]> {
  const result = await harness.client.listTerminals(harness.tempRepo.path, undefined, {
    workspaceId: harness.workspaceId,
  });
  return result.terminals.map((terminal) => terminal.id).sort();
}

async function waitForNewTerminal(
  page: Page,
  harness: TerminalE2EHarness,
  previousIds: string[],
): Promise<string> {
  const previous = new Set(previousIds);
  await expect
    .poll(async () => (await listTerminalIds(harness)).filter((id) => !previous.has(id)).length, {
      timeout: 15_000,
    })
    .toBe(1);
  const terminalId = (await listTerminalIds(harness)).find((id) => !previous.has(id));
  if (!terminalId) throw new Error("The newly created terminal was not listed by the host");
  await expect(harness.terminalSurface(page).filter({ visible: true })).toBeVisible({
    timeout: 30_000,
  });
  const marker = `NEW_SHELL_${terminalId}`;
  harness.client.sendTerminalInput(terminalId, {
    type: "input",
    data: `printf '\\n${marker}\\n'\n`,
  });
  await expect.poll(() => getTerminalBufferText(page), { timeout: 15_000 }).toContain(marker);
  return terminalId;
}

test.describe("Workspace terminal creation", () => {
  let harness: TerminalE2EHarness;

  test.beforeEach(async () => {
    harness = await TerminalE2EHarness.create({ tempPrefix: "terminal-creation" });
  });

  test.afterEach(async () => {
    await harness.cleanup();
  });

  test("menu, shortcut, and command create shells while the header toggle preserves them", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto(buildHostWorkspaceRoute(getServerId(), harness.workspaceId));

    await createTerminalFromMenu(page);
    const firstId = await waitForNewTerminal(page, harness, []);

    // Linux reserves terminal-focused shortcuts for the shell. Focus the chat
    // before invoking the workspace's new-terminal keyboard action.
    await page.getByRole("textbox", { name: "Message agent..." }).click();
    await page.keyboard.press("ControlOrMeta+Shift+T");
    const secondId = await waitForNewTerminal(page, harness, [firstId]);

    await runWorkspaceActionFromCommandCenter(page, "New terminal");
    const thirdId = await waitForNewTerminal(page, harness, [firstId, secondId]);
    const expectedIds = [firstId, secondId, thirdId].sort();
    await expect.poll(() => listTerminalIds(harness)).toEqual(expectedIds);

    const newestPanel = page.getByTestId(`workspace-panel-terminal_${thirdId}`);
    await expect(newestPanel).toBeVisible();
    const terminalToggle = page.getByTestId("workspace-header-terminal-toggle");
    await expect(terminalToggle).toHaveAttribute("aria-expanded", "true");
    await terminalToggle.click();
    await expect(page.getByTestId("workspace-side-panel")).not.toBeVisible();
    await expect.poll(() => listTerminalIds(harness)).toEqual(expectedIds);

    await terminalToggle.click();
    await expect(newestPanel).toBeVisible();
    await expect(terminalToggle).toHaveAttribute("aria-expanded", "true");
    await expect.poll(() => listTerminalIds(harness)).toEqual(expectedIds);

    // Earlier shells remain reachable in the dock after creating and hiding later ones.
    await page.getByTestId(`workspace-side-panel-view-terminal_${firstId}`).click();
    await expect(page.getByTestId(`workspace-panel-terminal_${firstId}`)).toBeVisible();
    await page.getByTestId(`workspace-side-panel-view-terminal_${secondId}`).click();
    await expect(page.getByTestId(`workspace-panel-terminal_${secondId}`)).toBeVisible();
  });

  test("the compact workspace menu creates another shell without closing the existing one", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(buildHostWorkspaceRoute(getServerId(), harness.workspaceId));

    await createTerminalFromMenu(page);
    const firstId = await waitForNewTerminal(page, harness, []);
    await createTerminalFromMenu(page);
    const secondId = await waitForNewTerminal(page, harness, [firstId]);
    await expect.poll(() => listTerminalIds(harness)).toEqual([firstId, secondId].sort());
    await expect(harness.terminalSurface(page).filter({ visible: true })).toHaveCount(1);
  });
});
