import { buildHostWorkspaceRoute } from "../../app/src/utils/host-routes";
import { expect, test, type Page } from "../../app/e2e/support/fixtures";
import { gotoAppShell } from "../../app/e2e/support/helpers/app";
import { getE2EDaemonPort } from "../../app/e2e/support/helpers/daemon-port";
import { installDaemonWebSocketGate } from "../../app/e2e/support/helpers/daemon-websocket-gate";
import { expectAppRoute } from "../../app/e2e/support/helpers/route-assertions";
import { seedWorkspace } from "../../app/e2e/support/helpers/seed-client";
import { getServerId } from "../../app/e2e/support/helpers/server-id";
import { selectChatInSidebar } from "../../app/e2e/support/helpers/sidebar";
import { installDesktopRuntime, waitForDesktopDaemonStartRequest } from "./support/runtime";

type StartupPresentation = "splash" | "app";

declare global {
  interface Window {
    __paseoStartupPresentationTrace?: StartupPresentation[];
  }
}

async function observeStartupPresentation(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const trace: StartupPresentation[] = [];
    window.__paseoStartupPresentationTrace = trace;

    document.addEventListener("DOMContentLoaded", () => {
      const recordPresentation = () => {
        let presentation: StartupPresentation | null = null;
        if (document.querySelector('[data-testid="startup-splash"]')) {
          presentation = "splash";
        } else if (
          document.querySelector(
            '[data-testid="workspace-header-title"], [data-testid="sidebar-settings"]',
          )
        ) {
          presentation = "app";
        }
        if (presentation && trace.at(-1) !== presentation) {
          trace.push(presentation);
        }
      };
      new MutationObserver(recordPresentation).observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
      recordPresentation();
    });
  });
}

async function getStartupPresentation(page: Page): Promise<StartupPresentation[]> {
  return page.evaluate(() => window.__paseoStartupPresentationTrace?.slice() ?? []);
}

async function expectWorkspaceLocation(
  page: Page,
  input: {
    serverId: string;
    workspace: Awaited<ReturnType<typeof seedWorkspace>>;
    agentId: string;
  },
): Promise<void> {
  await expectAppRoute(page, buildHostWorkspaceRoute(input.serverId, input.workspace.workspaceId), {
    timeout: 30_000,
  });
  await expect(page.getByTestId(`workspace-panel-agent_${input.agentId}`)).toBeVisible();
  await expect(page.getByTestId("workspace-header-title").filter({ visible: true })).toHaveText(
    input.workspace.workspaceName,
  );
  await expect(
    page.getByTestId(`sidebar-workspace-row-${input.serverId}:chat:${input.agentId}`),
  ).toHaveAttribute("aria-selected", "true");
}

test("refresh keeps one continuous splash before restoring the desktop workspace", async ({
  page,
}) => {
  const serverId = getServerId();
  const daemonGate = await installDaemonWebSocketGate(page);
  const workspace = await seedWorkspace({ repoPrefix: "workspace-refresh-route-" });

  try {
    const title = `workspace-refresh-route-${Date.now()}`;
    const agent = await workspace.client.createAgent({
      provider: "mock",
      model: "ten-second-stream",
      modeId: "load-test",
      cwd: workspace.repoPath,
      workspaceId: workspace.workspaceId,
      title,
    });
    await installDesktopRuntime(page, {
      serverId,
      manageBuiltInDaemon: true,
      hangDaemonStart: true,
      desktopSettingsDelayMs: 250,
      daemonListen: `127.0.0.1:${getE2EDaemonPort()}`,
    });
    await gotoAppShell(page);
    await selectChatInSidebar(page, {
      serverId,
      workspaceId: workspace.workspaceId,
      agentId: agent.id,
    });
    await expectWorkspaceLocation(page, { serverId, workspace, agentId: agent.id });

    await observeStartupPresentation(page);
    await daemonGate.drop();
    await page.reload();
    await waitForDesktopDaemonStartRequest(page);
    daemonGate.restore();
    await expectWorkspaceLocation(page, { serverId, workspace, agentId: agent.id });
    expect(await getStartupPresentation(page)).toEqual(["splash", "app"]);
  } finally {
    daemonGate.restore();
    await workspace.cleanup();
  }
});
