import { test, expect } from "../support/fixtures";
import { gotoAppShell } from "../support/helpers/app";
import { seedSidebarChats } from "../support/helpers/sidebar-chats";
import { getServerId } from "../support/helpers/server-id";

test("compact chat rows keep selection and keyboard actions readable", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.addInitScript(() =>
    localStorage.setItem(
      "@paseo:app-settings",
      JSON.stringify({
        theme: "claude",
        workspaceTitleSource: "title",
        sidebarRowItems: {
          branch: false,
          project: false,
          host: false,
          changeRequest: true,
          labels: true,
          services: true,
        },
      }),
    ),
  );
  const projects = [
    {
      name: "CueRetail · Hermes",
      titles: [
        "Order support and marketplace operations",
        "Amazon tracking and fulfillment",
        "Customer messages and refunds",
        "Investigate the latest sync",
      ],
    },
    {
      name: "CueRetail · Dashboard",
      titles: [
        "Dashboard improvements",
        "Review orders and revenue",
        "Inventory health and alerts",
      ],
    },
    {
      name: "Tloom",
      titles: [
        "Product listings and storefront",
        "Delivery estimates and checkout",
        "Product photography review",
        "Supplier catalog updates",
      ],
    },
  ];
  const sessions = [];
  try {
    for (const project of projects) {
      const session = await seedSidebarChats(project.titles);
      sessions.push(session);
    }
    await gotoAppShell(page);
    const row = page.getByTestId(
      `sidebar-workspace-row-${getServerId()}:chat:${sessions[0].agents[0].id}`,
    );
    await expect(row).toBeVisible();
    await row.click();
    await page.mouse.move(1000, 150);
    const box = await row.boundingBox();
    expect(box!.height).toBeLessThanOrEqual(32);
    await page.screenshot({ path: "/tmp/paseo-final-design.png" });
    await page.screenshot({
      path: "/tmp/paseo-final-sidebar.png",
      clip: { x: 0, y: 0, width: 320, height: 1000 },
    });
    await row.click({ button: "right" });
    const menu = page.getByTestId(
      `sidebar-workspace-context-menu-${getServerId()}:chat:${sessions[0].agents[0].id}`,
    );
    await expect(menu).toHaveCSS("opacity", "1");
    await page.screenshot({ path: "/tmp/paseo-final-design-menu.png" });
    await page.keyboard.press("Escape");
  } finally {
    for (const session of sessions) await session.cleanup();
  }
});
