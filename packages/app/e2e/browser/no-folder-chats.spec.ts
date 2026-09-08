import { homedir } from "node:os";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { gotoAppShell } from "../support/helpers/app";
import { addConnectedHostsAndReload } from "../support/helpers/hosts";
import { startIsolatedHostDaemon } from "../support/helpers/isolated-host-daemon";
import {
  openGlobalNewWorkspaceComposer,
  selectNewWorkspaceHost,
  submitNewWorkspacePrompt,
} from "../support/helpers/new-workspace";
import { connectSeedClient, type SeedDaemonClient } from "../support/helpers/seed-client";
import { seedSidebarChats } from "../support/helpers/sidebar-chats";
import { getServerId } from "../support/helpers/server-id";

async function expectDeviceChat(page: Page, client: SeedDaemonClient, serverId: string) {
  await expect(page).toHaveURL(new RegExp(`/h/${serverId}/workspace/`));
  const workspaceId = new URL(page.url()).pathname.split("/").at(-1)!;
  const workspace = (await client.fetchWorkspaces()).entries.find(
    (entry) => entry.id === workspaceId,
  );
  expect(workspace?.workspaceDirectory).toBe(homedir());
  await expect
    .poll(async () =>
      (await client.fetchAgents()).entries.find((entry) => entry.agent.workspaceId === workspaceId),
    )
    .toBeTruthy();
  const agent = (await client.fetchAgents()).entries.find(
    (entry) => entry.agent.workspaceId === workspaceId,
  )!.agent;
  expect(agent.cwd).toBe(homedir());
  const finished = await client.waitForFinish(agent.id, 30_000);
  expect(finished.status).toBe("idle");
  expect(finished.final?.lastError).toBeFalsy();
  return { workspace: workspace!, agent };
}

async function removeHomeProject(client: SeedDaemonClient) {
  const homes = (await client.fetchWorkspaces()).entries.filter(
    (entry) => entry.workspaceDirectory === homedir(),
  );
  for (const projectId of new Set(homes.map((workspace) => workspace.projectId))) {
    await client.removeProject(projectId);
  }
}

test("No folder submits a chat in the device home without creating a sidebar group", async ({
  page,
}, testInfo) => {
  const client = await connectSeedClient();
  try {
    await gotoAppShell(page);
    await openGlobalNewWorkspaceComposer(page);
    await expect(page.getByRole("button", { name: "Working folder", exact: true })).toContainText(
      "No folder",
    );
    await expect(page.getByTestId("host-picker-trigger")).toContainText("localhost");
    await submitNewWorkspacePrompt(page, "Summarize this device task without changing any files.");
    const { agent } = await expectDeviceChat(page, client, getServerId());
    await expect(
      page
        .getByTestId("sidebar-chat-section-ungrouped")
        .getByTestId(`sidebar-workspace-row-${getServerId()}:chat:${agent.id}`),
    ).toBeVisible();
    await expect(page.locator('[data-testid^="sidebar-group-menu-"]')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("no-folder-device-chat.png"), scale: "css" });
  } finally {
    await removeHomeProject(client);
    await client.close();
  }
});

test("No folder uses the selected remote device and keeps an explicitly chosen group", async ({
  page,
}) => {
  const daemon = await startIsolatedHostDaemon("no-folder-remote-device");
  const client = await connectSeedClient({ port: daemon.port });
  try {
    await gotoAppShell(page);
    await addConnectedHostsAndReload(
      page,
      [{ serverId: daemon.serverId, label: "Remote device", port: daemon.port }],
      { primaryLabel: "This Mac" },
    );
    await page.getByTestId("sidebar-new-group").click();
    await page.getByTestId("sidebar-chat-group-editor-input").fill("Device tasks");
    await page.getByTestId("sidebar-chat-group-editor-submit").click();
    const heading = page.getByRole("button", { name: "Collapse Device tasks", exact: true });
    await expect(heading).toBeVisible();
    const groupId = (await heading.getAttribute("data-testid"))!.replace("sidebar-chat-group-", "");
    await page.getByTestId(`sidebar-group-new-chat-${groupId}`).click();
    await selectNewWorkspaceHost(page, "Remote device");
    await expect(page.getByRole("button", { name: "Working folder", exact: true })).toContainText(
      "No folder",
    );
    await submitNewWorkspacePrompt(page, "Check the selected device without modifying any files.");
    const { agent } = await expectDeviceChat(page, client, daemon.serverId);
    await expect(
      page
        .getByTestId(`sidebar-chat-section-${groupId}`)
        .getByTestId(`sidebar-workspace-row-${daemon.serverId}:chat:${agent.id}`),
    ).toBeVisible();
  } finally {
    await removeHomeProject(client);
    await client.close();
    await daemon.close();
  }
});

test("a chosen working folder can be cleared back to No folder before sending", async ({
  page,
}) => {
  const seeded = await seedSidebarChats(["Existing folder task"]);
  try {
    await page.goto(
      `/new?${new URLSearchParams({
        serverId: getServerId(),
        projectId: seeded.projectId,
        dir: seeded.repoPath,
      })}`,
    );
    const folder = page.getByRole("button", { name: "Working folder", exact: true });
    await expect(folder).not.toContainText("No folder");
    await folder.click();
    await page.getByTestId("new-workspace-project-picker-no-folder").click();
    await expect(folder).toContainText("No folder");
    await submitNewWorkspacePrompt(page, "Use the device home for this new task.");
    await expectDeviceChat(page, seeded.client, getServerId());
    expect(
      (await seeded.client.fetchWorkspaces()).entries.find(
        (entry) => entry.id === seeded.workspaceId,
      )?.workspaceDirectory,
    ).toBe(seeded.repoPath);
  } finally {
    await removeHomeProject(seeded.client);
    await seeded.cleanup();
  }
});
