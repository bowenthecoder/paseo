import { describe, expect, it } from "vitest";
import {
  canDesktopAppSidebarShare,
  resolveDesktopAppChromeLayout,
  resolveDesktopAppContentMinimum,
  resolveDesktopSidebarVisibility,
  resolveDesktopSidebarWidth,
  resolveWorkspaceContentMinimum,
} from "@/components/desktop-sidebar-layout";
import type { SplitGroup, SplitNode } from "@/stores/workspace-layout-actions";

function createPaneNode(input: { id: string; hidden?: boolean }): SplitNode {
  return { kind: "pane", pane: { ...input, tabIds: [], focusedTabId: null } };
}

function createGroupNode(group: SplitGroup): SplitNode {
  return { kind: "group", group };
}

describe("desktop sidebar layout", () => {
  it("keeps a retained sidebar hidden while app chrome is suppressed", () => {
    expect(
      resolveDesktopSidebarVisibility({
        chromeEnabled: false,
        isCompactLayout: false,
        isMounted: true,
        isOpen: true,
        canShare: true,
      }),
    ).toBe(false);
  });

  it("keeps the sidebar toggle window-owned beside left window controls", () => {
    expect(
      resolveDesktopAppChromeLayout({
        desktopSidebarRendered: true,
        hasTopLeftWindowControls: true,
        sidebarControlsEnabled: true,
      }),
    ).toEqual({
      sidebarCorners: "top-left",
      contentCorners: "top-right",
      sidebarToggleOwner: "window",
    });
    expect(
      resolveDesktopAppChromeLayout({
        desktopSidebarRendered: true,
        hasTopLeftWindowControls: false,
        sidebarControlsEnabled: true,
      }),
    ).toEqual({
      sidebarCorners: "none",
      contentCorners: "both",
      sidebarToggleOwner: "content",
    });
    expect(
      resolveDesktopAppChromeLayout({
        desktopSidebarRendered: false,
        hasTopLeftWindowControls: true,
        sidebarControlsEnabled: true,
      }),
    ).toEqual({
      sidebarCorners: "none",
      contentCorners: "both",
      sidebarToggleOwner: "window",
    });
  });

  it("hides the window-owned sidebar toggle when app chrome is suppressed", () => {
    expect(
      resolveDesktopAppChromeLayout({
        desktopSidebarRendered: false,
        hasTopLeftWindowControls: true,
        sidebarControlsEnabled: false,
      }).sidebarToggleOwner,
    ).toBe("none");
  });

  it("clamps a persisted wide sidebar to preserve the center pane", () => {
    const atHalfScreen = resolveDesktopSidebarWidth({ requestedWidth: 600, viewportWidth: 751 });
    expect(atHalfScreen).toBe(351);
    expect(751 - atHalfScreen).toBe(400);

    const atBreakpoint = resolveDesktopSidebarWidth({ requestedWidth: 600, viewportWidth: 720 });
    expect(atBreakpoint).toBe(320);
    expect(720 - atBreakpoint).toBe(400);

    expect(resolveDesktopSidebarWidth({ requestedWidth: 600, viewportWidth: 1440 })).toBe(600);
  });

  it("yields app navigation when settings needs the shell width", () => {
    const settingsMinimum = resolveDesktopAppContentMinimum({ isSettingsRoute: true });
    expect(settingsMinimum).toBe(720);
    expect(
      canDesktopAppSidebarShare({
        contentMinimumWidth: settingsMinimum,
        requestedSidebarWidth: 320,
        viewportWidth: 751,
      }),
    ).toBe(false);
  });

  it("reserves room for the conversation outside settings", () => {
    expect(resolveDesktopAppContentMinimum({ isSettingsRoute: false })).toBe(400);
    expect(
      canDesktopAppSidebarShare({
        contentMinimumWidth: resolveDesktopAppContentMinimum({ isSettingsRoute: false }),
        requestedSidebarWidth: 320,
        viewportWidth: 751,
      }),
    ).toBe(true);
  });

  it("yields the chat list before two sidebars squeeze the conversation", () => {
    const root = createGroupNode({
      id: "root",
      direction: "horizontal",
      children: [createPaneNode({ id: "main" }), createPaneNode({ id: "explorer" })],
      sizes: [0.7, 0.3],
    });
    const minimum = resolveWorkspaceContentMinimum(root);
    expect(minimum).toBe(640);
    expect(
      canDesktopAppSidebarShare({
        contentMinimumWidth: minimum,
        requestedSidebarWidth: 320,
        viewportWidth: 800,
      }),
    ).toBe(false);
    expect(
      canDesktopAppSidebarShare({
        contentMinimumWidth: minimum,
        requestedSidebarWidth: 320,
        viewportWidth: 1280,
      }),
    ).toBe(true);
  });

  it("counts horizontal document panes but not hidden or vertically stacked panes twice", () => {
    const root = createGroupNode({
      id: "root",
      direction: "horizontal",
      children: [
        createGroupNode({
          id: "stack",
          direction: "vertical",
          sizes: [0.5, 0.5],
          children: [createPaneNode({ id: "main" }), createPaneNode({ id: "terminal" })],
        }),
        createPaneNode({ id: "document" }),
        createPaneNode({ id: "explorer", hidden: true }),
      ],
      sizes: [0.4, 0.4, 0.2],
    });
    expect(resolveWorkspaceContentMinimum(root)).toBe(800);
  });
});
