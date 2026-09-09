import { writeFile } from "node:fs/promises";
import type { Dialog } from "@playwright/test";
import { expect, test, type Page } from "../support/fixtures";
import { gotoAppShell, openSettings } from "../support/helpers/app";
import { connectDaemonClient } from "../support/helpers/daemon-client-loader";
import { getServerId } from "../support/helpers/server-id";
import {
  expectProviderInstalledInSettings,
  installAcpCatalogProvider,
  openAddProviderArea,
  openSettingsHost,
  openSettingsHostSection,
} from "../support/helpers/settings";

const CUSTOM_PROVIDER = {
  id: "junie",
  name: "Junie",
} as const;

interface ProviderRemovalDaemonClient {
  connect(): Promise<void>;
  close(): Promise<void>;
  patchDaemonConfig(config: { removeProviders?: string[] }): Promise<unknown>;
  getProvidersSnapshot(): Promise<{
    entries: Array<{ provider: string; source?: "builtin" | "custom"; status?: string }>;
  }>;
}

async function removeCustomProvider(client: ProviderRemovalDaemonClient): Promise<void> {
  await client.patchDaemonConfig({ removeProviders: [CUSTOM_PROVIDER.id] });
}

async function expectProviderSource(
  client: ProviderRemovalDaemonClient,
  source: "custom" | undefined,
): Promise<void> {
  await expect
    .poll(async () => {
      const snapshot = await client.getProvidersSnapshot();
      return snapshot.entries.find((entry) => entry.provider === CUSTOM_PROVIDER.id)?.source;
    })
    .toBe(source);
}

async function clickRemoveProviderAndAcceptWarning(page: Page): Promise<Dialog> {
  let warning: Dialog | undefined;
  let acceptance: Promise<void> | undefined;
  page.once("dialog", (dialog) => {
    warning = dialog;
    expect(dialog.message()).toContain(`Remove ${CUSTOM_PROVIDER.name}?`);
    expect(dialog.message()).toContain("This deletes the provider entry from config.json.");
    acceptance = dialog.accept();
  });
  await page.getByTestId(`provider-remove-${CUSTOM_PROVIDER.id}`).click();
  if (!warning) {
    throw new Error("Expected a provider removal confirmation dialog, but none was shown.");
  }
  await acceptance;
  return warning;
}

function recordProviderRemovalEvents(page: Page) {
  const startedAt = Date.now();
  const events: Record<string, unknown>[] = [];
  const record = (stage: string, details: Record<string, unknown> = {}) => {
    if (events.length >= 500) events.shift();
    events.push({ elapsedMs: Date.now() - startedAt, stage, ...details });
  };
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  const describeJunie = (entries: unknown) => {
    if (!Array.isArray(entries)) return undefined;
    const junie = entries.find(
      (entry: unknown) => isRecord(entry) && entry.provider === CUSTOM_PROVIDER.id,
    );
    if (!isRecord(junie)) return null;
    return { source: junie.source, status: junie.status, enabled: junie.enabled };
  };
  const requestTypes = new Set([
    "get_providers_snapshot_request",
    "get_providers_snapshot_response",
    "refresh_providers_snapshot_request",
    "refresh_providers_snapshot_response",
    "providers_snapshot_update",
    "set_daemon_config_request",
    "set_daemon_config_response",
    "rpc_error",
    "status",
  ]);
  page.on("websocket", (socket) => {
    let observedSession = false;
    const onFrame = (direction: string, raw: string | Buffer) => {
      let envelope: unknown;
      try {
        envelope = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (!isRecord(envelope) || envelope.type !== "session" || !isRecord(envelope.message)) return;
      observedSession = true;
      const message = envelope.message;
      if (typeof message.type !== "string" || !requestTypes.has(message.type)) return;
      const payload = isRecord(message.payload) ? message.payload : message;
      if (message.type === "status" && payload.status !== "daemon_config_changed") return;
      const compact = isRecord(payload.compactSnapshot) ? payload.compactSnapshot : null;
      const entries = compact?.entries ?? payload.entries;
      const config = isRecord(payload.config) ? payload.config : null;
      record(direction, {
        type: message.type,
        requestId: payload.requestId,
        requestType: payload.requestType,
        errorCode: payload.code,
        cwd: payload.cwd,
        notModified: payload.notModified,
        snapshotHash: payload.snapshotHash,
        providerIds:
          config && isRecord(config.providers) ? Object.keys(config.providers) : undefined,
        removeProviders: config?.removeProviders,
        refreshProviders:
          message.type === "refresh_providers_snapshot_request" ? payload.providers : undefined,
        junie: describeJunie(entries),
      });
    };
    socket.on("framesent", (event) => onFrame("sent", event.payload));
    socket.on("framereceived", (event) => onFrame("received", event.payload));
    socket.on("close", () => {
      if (observedSession) record("socket-closed");
    });
  });
  return { events, record };
}

test.describe("provider removal", () => {
  test("removes a custom provider from Settings", async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const diagnostics = recordProviderRemovalEvents(page);
    const client = await connectDaemonClient<ProviderRemovalDaemonClient>({
      clientIdPrefix: "provider-removal-e2e",
    });

    try {
      await removeCustomProvider(client);

      await gotoAppShell(page);
      await openSettings(page);
      await openSettingsHost(page, getServerId());
      await openSettingsHostSection(page, getServerId(), "providers");

      await expect(page.getByTestId("provider-actions-claude")).toHaveCount(0);
      await openAddProviderArea(page);
      await installAcpCatalogProvider(page, CUSTOM_PROVIDER.name);
      await expectProviderInstalledInSettings(page, CUSTOM_PROVIDER.name);
      await expectProviderSource(client, "custom");
      diagnostics.record("installed-row-and-config-confirmed");

      await page.getByTestId(`provider-actions-${CUSTOM_PROVIDER.id}`).click();
      await expect(page.getByTestId(`provider-remove-${CUSTOM_PROVIDER.id}`)).toBeVisible();
      await clickRemoveProviderAndAcceptWarning(page);
      diagnostics.record("removal-confirmation-accepted");

      await expect(
        page.getByRole("button", {
          name: `${CUSTOM_PROVIDER.name} provider details`,
          exact: true,
        }),
      ).toHaveCount(0);
      await expectProviderSource(client, undefined);
      diagnostics.record("removed-row-and-config-confirmed");
    } catch (error) {
      diagnostics.record("failed-before-cleanup");
      const screenshotPath = testInfo.outputPath("provider-removal-before-cleanup.png");
      await page.screenshot({ path: screenshotPath });
      await testInfo.attach("provider-removal-before-cleanup", {
        path: screenshotPath,
        contentType: "image/png",
      });
      const domPath = testInfo.outputPath("provider-removal-dom-before-cleanup.txt");
      await writeFile(domPath, await page.locator("body").ariaSnapshot());
      await testInfo.attach("provider-removal-dom-before-cleanup", {
        path: domPath,
        contentType: "text/plain",
      });
      const snapshot = await client.getProvidersSnapshot().catch(() => null);
      const junie = snapshot?.entries.find((entry) => entry.provider === CUSTOM_PROVIDER.id);
      diagnostics.record("daemon-before-cleanup", {
        junie: junie
          ? { provider: junie.provider, source: junie.source, status: junie.status }
          : null,
      });
      throw error;
    } finally {
      diagnostics.record("cleanup-started");
      await removeCustomProvider(client).catch(() => undefined);
      await client.close().catch(() => undefined);
      const eventsPath = testInfo.outputPath("provider-removal-events.json");
      await writeFile(eventsPath, JSON.stringify(diagnostics.events, null, 2));
      await testInfo.attach("provider-removal-events", {
        path: eventsPath,
        contentType: "application/json",
      });
    }
  });
});
