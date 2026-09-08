import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => {
  const storage = new Map<string, string>();
  return {
    default: {
      getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
      setItem: vi.fn(async (key: string, value: string) => {
        storage.set(key, value);
      }),
      removeItem: vi.fn(async (key: string) => {
        storage.delete(key);
      }),
    },
  };
});

import {
  createWorkspaceLayoutStore,
  EXPLORER_SIDEBAR_PANE_ID,
  DEFAULT_PANE_ID,
  collectAllTabs,
  findPaneById,
  flattenLayoutToSingleChat,
  type WorkspaceLayout,
} from "@/stores/workspace-layout-store";
import { deriveWorkspacePaneState } from "@/screens/workspace/workspace-pane-state";

const WORKSPACE = "server-1:workspace-1";

type Store = ReturnType<typeof createWorkspaceLayoutStore>;

function layoutOf(store: Store): WorkspaceLayout {
  const layout = store.getState().layoutByWorkspace[WORKSPACE];
  expect(layout).toBeDefined();
  return layout as WorkspaceLayout;
}

function sidePane(store: Store) {
  return findPaneById(layoutOf(store).root, EXPLORER_SIDEBAR_PANE_ID);
}

function sidePanelView(store: Store): string | null {
  const pane = sidePane(store);
  const state = deriveWorkspacePaneState({ pane, tabs: collectAllTabs(layoutOf(store).root) });
  return state.activeTab?.descriptor.target.kind ?? null;
}

function isSidePanelOpen(store: Store): boolean {
  const pane = sidePane(store);
  return Boolean(pane && pane.hidden !== true);
}

describe("workspace side panel", () => {
  let store: Store;

  beforeEach(() => {
    store = createWorkspaceLayoutStore();
    store.getState().openTab({
      workspaceKey: WORKSPACE,
      target: { kind: "agent", agentId: "agent-1" },
      intent: "reveal",
    });
  });

  it("keeps the chat in the chat pane and puts a terminal in the side panel", () => {
    store.getState().openTab({
      workspaceKey: WORKSPACE,
      target: { kind: "terminal", terminalId: "term-1" },
      intent: "reveal",
    });

    const chatPane = findPaneById(layoutOf(store).root, DEFAULT_PANE_ID);
    const tabs = collectAllTabs(layoutOf(store).root);
    const chatTabs = tabs.filter((tab) => chatPane?.tabIds.includes(tab.tabId));
    expect(chatTabs.map((tab) => tab.target.kind)).toEqual(["agent"]);
    expect(sidePanelView(store)).toBe("terminal");
    expect(isSidePanelOpen(store)).toBe(true);
  });

  it("switches the panel from the terminal to the browser and back", () => {
    store.getState().openTab({
      workspaceKey: WORKSPACE,
      target: { kind: "terminal", terminalId: "term-1" },
      intent: "reveal",
    });
    store.getState().openTab({
      workspaceKey: WORKSPACE,
      target: { kind: "browser", browserId: "browser-1" },
      intent: "reveal",
    });
    expect(sidePanelView(store)).toBe("browser");

    const terminalTab = collectAllTabs(layoutOf(store).root).find(
      (tab) => tab.target.kind === "terminal",
    );
    store.getState().focusTab(WORKSPACE, terminalTab?.tabId ?? "");
    expect(sidePanelView(store)).toBe("terminal");
  });

  it("hides the panel without dropping what is in it, and shows it again", () => {
    store.getState().openTab({
      workspaceKey: WORKSPACE,
      target: { kind: "terminal", terminalId: "term-1" },
      intent: "reveal",
    });

    store.getState().hideExplorerSidebar(WORKSPACE);
    expect(isSidePanelOpen(store)).toBe(false);
    expect(collectAllTabs(layoutOf(store).root).some((tab) => tab.target.kind === "terminal")).toBe(
      true,
    );

    store.getState().showExplorerSidebar(WORKSPACE);
    expect(isSidePanelOpen(store)).toBe(true);
    expect(sidePanelView(store)).toBe("terminal");
  });

  it("hides the panel when its last view is closed", () => {
    store.getState().openTab({
      workspaceKey: WORKSPACE,
      target: { kind: "terminal", terminalId: "term-1" },
      intent: "reveal",
    });
    const pane = sidePane(store);
    for (const tabId of pane?.tabIds.slice() ?? []) {
      store.getState().closeTab(WORKSPACE, tabId);
    }
    expect(isSidePanelOpen(store)).toBe(false);
  });

  it("remembers the panel width per workspace", () => {
    expect(store.getState().explorerSidebarWidthByWorkspace[WORKSPACE]).toBeUndefined();
    store.getState().resizeExplorerSidebar(WORKSPACE, 420);
    expect(store.getState().explorerSidebarWidthByWorkspace[WORKSPACE]).toBe(420);
  });

  it("never leaves the chat pane holding a terminal", () => {
    store.getState().openTab({
      workspaceKey: WORKSPACE,
      target: { kind: "terminal", terminalId: "term-1" },
      intent: "reveal",
      placement: { mode: "pane", paneId: DEFAULT_PANE_ID },
    });
    const chatPane = findPaneById(layoutOf(store).root, DEFAULT_PANE_ID);
    const chatKinds = collectAllTabs(layoutOf(store).root)
      .filter((tab) => chatPane?.tabIds.includes(tab.tabId))
      .map((tab) => tab.target.kind);
    expect(chatKinds).not.toContain("terminal");
    expect(sidePanelView(store)).toBe("terminal");
  });
});

describe("flattenLayoutToSingleChat", () => {
  it("collapses a saved split tree into one chat pane and one side panel", () => {
    const legacy = {
      root: {
        kind: "group" as const,
        group: {
          id: "root",
          direction: "horizontal" as const,
          sizes: [0.5, 0.5],
          children: [
            {
              kind: "pane" as const,
              pane: {
                id: "main",
                tabIds: ["tab-agent", "tab-file"],
                focusedTabId: "tab-agent",
                tabs: [
                  {
                    tabId: "tab-agent",
                    target: { kind: "agent" as const, agentId: "a1" },
                    createdAt: 1,
                  },
                  {
                    tabId: "tab-file",
                    target: { kind: "file" as const, path: "src/a.ts" },
                    createdAt: 2,
                  },
                ],
              },
            },
            {
              kind: "pane" as const,
              pane: {
                id: "pane_second",
                tabIds: ["tab-agent-2"],
                focusedTabId: "tab-agent-2",
                tabs: [
                  {
                    tabId: "tab-agent-2",
                    target: { kind: "agent" as const, agentId: "a2" },
                    createdAt: 3,
                  },
                ],
              },
            },
          ],
        },
      },
      focusedPaneId: "pane_second",
    } as unknown as WorkspaceLayout;

    const flat = flattenLayoutToSingleChat(legacy);
    const chatPane = findPaneById(flat.root, DEFAULT_PANE_ID);
    const panelPane = findPaneById(flat.root, EXPLORER_SIDEBAR_PANE_ID);
    const tabs = collectAllTabs(flat.root);

    expect(chatPane?.tabIds).toEqual(["tab-agent", "tab-agent-2"]);
    expect(panelPane?.tabIds).toEqual(["tab-file"]);
    expect(panelPane?.hidden).toBe(true);
    expect(tabs).toHaveLength(3);
    expect(flat.focusedPaneId).toBe(DEFAULT_PANE_ID);
  });

  it("leaves an already flat layout alone", () => {
    const store = createWorkspaceLayoutStore();
    store.getState().openTab({
      workspaceKey: WORKSPACE,
      target: { kind: "agent", agentId: "agent-1" },
      intent: "reveal",
    });
    const layout = layoutOf(store);
    expect(flattenLayoutToSingleChat(layout)).toBe(layout);
  });
});
