import { describe, expect, it } from "vitest";
import {
  resolveExplorerSidebarDockSizes,
  resolveExplorerSidebarWidth,
} from "@/components/explorer-sidebar-layout";

describe("Explorer sidebar layout", () => {
  it("balances explicit chat splits when no width was chosen", () => {
    expect(resolveExplorerSidebarWidth({ containerWidth: 1120, balanceChats: true })).toBe(560);
    expect(resolveExplorerSidebarDockSizes({ containerWidth: 1120, balanceChats: true })).toEqual([
      0.5, 0.5,
    ]);
  });

  it("keeps the document and task default narrow without an explicit chat split", () => {
    expect(resolveExplorerSidebarWidth({ containerWidth: 1120 })).toBe(320);
    expect(resolveExplorerSidebarWidth({ containerWidth: 1120, balanceChats: false })).toBe(320);
  });

  it("preserves a saved or in-progress resize when a chat split is present", () => {
    for (const requestedWidth of [320, 450, 600]) {
      expect(
        resolveExplorerSidebarWidth({ containerWidth: 1120, balanceChats: true, requestedWidth }),
      ).toBe(requestedWidth);
    }
  });

  it("clamps balanced splits around the chat minimum on narrow desktop windows", () => {
    expect(resolveExplorerSidebarWidth({ containerWidth: 750, balanceChats: true })).toBe(350);
    expect(resolveExplorerSidebarWidth({ containerWidth: 640, balanceChats: true })).toBe(240);
    expect(
      resolveExplorerSidebarWidth({
        containerWidth: 900,
        minimumBodyWidth: 500,
        balanceChats: true,
      }),
    ).toBe(400);
    expect(resolveExplorerSidebarWidth({ containerWidth: 0, balanceChats: true })).toBe(320);
  });
  it("keeps the sidebar width fixed when the workspace body changes size", () => {
    const narrow = resolveExplorerSidebarDockSizes({ requestedWidth: 320, containerWidth: 1200 });
    const wide = resolveExplorerSidebarDockSizes({ requestedWidth: 320, containerWidth: 1520 });

    expect(narrow[1] * 1200).toBeCloseTo(320);
    expect(wide[1] * 1520).toBeCloseTo(320);
  });

  it("has no fixed maximum while preserving room for the workspace body", () => {
    expect(resolveExplorerSidebarWidth({ requestedWidth: 100, containerWidth: 1200 })).toBe(240);
    expect(resolveExplorerSidebarWidth({ requestedWidth: 900, containerWidth: 1600 })).toBe(900);
    expect(resolveExplorerSidebarWidth({ requestedWidth: 900, containerWidth: 1200 })).toBe(800);
    expect(resolveExplorerSidebarWidth({ requestedWidth: 600, containerWidth: 750 })).toBe(350);
  });

  it("reserves both chat and document widths before a wide Explorer", () => {
    expect(
      resolveExplorerSidebarWidth({
        requestedWidth: 700,
        containerWidth: 1280,
        minimumBodyWidth: 800,
      }),
    ).toBe(480);
  });
});
