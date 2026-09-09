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
  normalizeLayout,
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

  it("keeps the parent selected while opening Tasks, viewing a provider child and closing it", () => {
    const parentTabId = findPaneById(layoutOf(store).root, DEFAULT_PANE_ID)?.focusedTabId;
    const tasks = store.getState().openTab({
      workspaceKey: WORKSPACE,
      target: { kind: "subagents", parentAgentId: "agent-1" },
      intent: "reveal",
    });
    const child = store.getState().openTab({
      workspaceKey: WORKSPACE,
      target: { kind: "provider_subagent", parentAgentId: "agent-1", subagentId: "child-1" },
      intent: "reveal",
      parentTabId: tasks!,
    });
    expect(sidePanelView(store)).toBe("provider_subagent");
    expect(findPaneById(layoutOf(store).root, DEFAULT_PANE_ID)?.focusedTabId).toBe(parentTabId);
    expect(layoutOf(store).focusedPaneId).toBe(DEFAULT_PANE_ID);
    store.getState().closeTab(WORKSPACE, child!);
    expect(sidePanelView(store)).toBe("subagents");
    expect(findPaneById(layoutOf(store).root, DEFAULT_PANE_ID)?.focusedTabId).toBe(parentTabId);
  });

  it("does not place an unrelated root chat beside the current chat", () => {
    store.getState().openTab({
      workspaceKey: WORKSPACE,
      target: { kind: "agent", agentId: "another-root" },
      intent: "reveal",
      placement: { mode: "pane", paneId: EXPLORER_SIDEBAR_PANE_ID },
    });
    expect(sidePane(store)?.tabIds).not.toContain("agent_another-root");
    expect(findPaneById(layoutOf(store).root, DEFAULT_PANE_ID)?.focusedTabId).toBe(
      "agent_another-root",
    );
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

  it("returns a chat document to its parent even when Files and Changes remain in the dock", () => {
    const parentTabId = findPaneById(layoutOf(store).root, DEFAULT_PANE_ID)?.focusedTabId;
    store.getState().openTab({
      workspaceKey: WORKSPACE,
      target: { kind: "changes_tree" },
      intent: "background",
    });
    const file = store.getState().openTab({
      workspaceKey: WORKSPACE,
      target: { kind: "file", path: "guide.md" },
      intent: "reveal",
      parentTabId: parentTabId!,
    });
    store.getState().closeTab(WORKSPACE, file!);
    expect(isSidePanelOpen(store)).toBe(false);
    expect(findPaneById(layoutOf(store).root, DEFAULT_PANE_ID)?.focusedTabId).toBe(parentTabId);
    expect(collectAllTabs(layoutOf(store).root).some((tab) => tab.target.kind === "files")).toBe(
      true,
    );
    expect(
      collectAllTabs(layoutOf(store).root).some((tab) => tab.target.kind === "changes_tree"),
    ).toBe(true);
  });

  it("returns a task's document to that task rather than dismissing the supporting pane", () => {
    const child = store.getState().openTab({
      workspaceKey: WORKSPACE,
      target: { kind: "provider_subagent", parentAgentId: "agent-1", subagentId: "child-1" },
      intent: "reveal",
    });
    const file = store.getState().openTab({
      workspaceKey: WORKSPACE,
      target: { kind: "file", path: "child.md" },
      intent: "reveal",
      parentTabId: child!,
    });
    store.getState().closeTab(WORKSPACE, file!);
    expect(isSidePanelOpen(store)).toBe(true);
    expect(sidePane(store)?.focusedTabId).toBe(child);
  });

  it("does not dismiss another active supporting view when closing a background chat document", () => {
    const parentTabId = findPaneById(layoutOf(store).root, DEFAULT_PANE_ID)?.focusedTabId;
    const file = store.getState().openTab({
      workspaceKey: WORKSPACE,
      target: { kind: "file", path: "guide.md" },
      intent: "reveal",
      parentTabId: parentTabId!,
    });
    store.getState().openTab({
      workspaceKey: WORKSPACE,
      target: { kind: "terminal", terminalId: "term-1" },
      intent: "reveal",
    });
    store.getState().closeTab(WORKSPACE, file!);
    expect(isSidePanelOpen(store)).toBe(true);
    expect(sidePanelView(store)).toBe("terminal");
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
  it("reroutes a file in an old two-pane main layout and keeps its parent selected", () => {
    const legacy = normalizeLayout({
      root: {
        kind: "group",
        group: {
          id: "root",
          direction: "horizontal",
          sizes: [0.8, 0.2],
          children: [
            {
              kind: "pane",
              pane: {
                id: "main",
                tabIds: ["parent", "guide"],
                focusedTabId: "guide",
                tabs: [
                  { tabId: "parent", target: { kind: "agent", agentId: "root" }, createdAt: 1 },
                  { tabId: "guide", target: { kind: "file", path: "guide.md" }, createdAt: 2 },
                ],
              },
            },
            {
              kind: "pane",
              pane: {
                id: "explorer",
                tabIds: ["files"],
                focusedTabId: "files",
                hidden: true,
                tabs: [{ tabId: "files", target: { kind: "files" }, createdAt: 3 }],
              },
            },
          ],
        },
      },
      focusedPaneId: "main",
      parentTabIdByTabId: { guide: "parent" },
    });
    const flat = flattenLayoutToSingleChat(legacy);
    expect(findPaneById(flat.root, DEFAULT_PANE_ID)?.tabIds).toEqual(["parent"]);
    expect(findPaneById(flat.root, DEFAULT_PANE_ID)?.focusedTabId).toBe("parent");
    expect(findPaneById(flat.root, EXPLORER_SIDEBAR_PANE_ID)?.tabIds).toEqual(["guide", "files"]);
    expect(findPaneById(flat.root, EXPLORER_SIDEBAR_PANE_ID)?.focusedTabId).toBe("guide");
    expect(findPaneById(flat.root, EXPLORER_SIDEBAR_PANE_ID)?.hidden).not.toBe(true);
    expect(flat.parentTabIdByTabId).toEqual({ guide: "parent" });
  });

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
