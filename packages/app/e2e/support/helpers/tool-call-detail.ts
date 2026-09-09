import type { Page } from "@playwright/test";

/**
 * The grouped overview is the default detail level, so a spec that asserts individual tool rows
 * (the "tool-call-badge" test ids) opts back into the detailed level before the first navigation.
 * The overview migration is marked as applied; otherwise it would flip the stored value back.
 */
export async function enableDetailedToolCalls(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem(
      "@paseo:app-settings",
      JSON.stringify({ toolCallDetailLevel: "detailed" }),
    );
    localStorage.setItem(
      "@paseo:settings-migrations",
      JSON.stringify({ applied: ["overview-default"] }),
    );
  });
}
