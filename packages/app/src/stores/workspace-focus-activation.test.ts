import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  },
}));

import { usePanelStore } from "@/stores/panel-store";
import { createWorkspaceLayoutStore, findPaneById } from "@/stores/workspace-layout-store";
import type { WorkspaceTabTarget } from "@/workspace-tabs/model";

const WORKSPACE_KEY = "server:workspace";
const store = createWorkspaceLayoutStore();
const SUPPORTING_TARGETS: WorkspaceTabTarget[] = [
  { kind: "terminal", terminalId: "terminal" },
  { kind: "file", path: "guide.md" },
  { kind: "files" },
  { kind: "working_diff" },
  { kind: "subagents", parentAgentId: "parent" },
  { kind: "provider_subagent", parentAgentId: "parent", subagentId: "child" },
  { kind: "browser", browserId: "browser" },
];

beforeEach(() => {
  store.setState({ layoutByWorkspace: {}, focusRestorationByWorkspace: {} });
  usePanelStore.setState({ desktop: { agentListOpen: true, focusModeEnabled: true } });
});

describe("explicit supporting view activation in focus mode", () => {
  it.each(SUPPORTING_TARGETS)("reveals $kind and leaves focus mode", (target) => {
    const tabId = store
      .getState()
      .openTab({ workspaceKey: WORKSPACE_KEY, target, intent: "reveal" });
    const layout = store.getState().layoutByWorkspace[WORKSPACE_KEY];
    const side = findPaneById(layout.root, "explorer");

    expect(tabId).not.toBeNull();
    expect(side).not.toBeNull();
    expect(side?.hidden).not.toBe(true);
    expect(side?.focusedTabId).toBe(tabId);
    expect(layout.focusedPaneId).toBe("main");
    expect(usePanelStore.getState().desktop.focusModeEnabled).toBe(false);
  });

  it("leaves focus mode when explicitly reopening an existing supporting view", () => {
    const input = {
      workspaceKey: WORKSPACE_KEY,
      target: { kind: "file", path: "guide.md" } as const,
      intent: "reveal" as const,
    };
    const first = store.getState().openTab(input);
    usePanelStore.getState().toggleFocusMode();
    expect(usePanelStore.getState().desktop.focusModeEnabled).toBe(true);

    expect(store.getState().openTab(input)).toBe(first);
    expect(usePanelStore.getState().desktop.focusModeEnabled).toBe(false);
  });

  it("leaves focus mode when selecting a saved supporting view or explicitly showing the dock", () => {
    const tabId = store.getState().openTab({
      workspaceKey: WORKSPACE_KEY,
      target: { kind: "file", path: "guide.md" },
      intent: "background",
    });
    if (!tabId) throw new Error("Expected a saved file view");
    expect(usePanelStore.getState().desktop.focusModeEnabled).toBe(true);

    store.getState().focusTab(WORKSPACE_KEY, tabId);
    expect(usePanelStore.getState().desktop.focusModeEnabled).toBe(false);
    store.getState().hideExplorerSidebar(WORKSPACE_KEY);
    usePanelStore.getState().toggleFocusMode();
    store.getState().showExplorerSidebar(WORKSPACE_KEY);
    expect(usePanelStore.getState().desktop.focusModeEnabled).toBe(false);
    const side = findPaneById(store.getState().layoutByWorkspace[WORKSPACE_KEY].root, "explorer");
    expect(side).toMatchObject({ focusedTabId: tabId });
    expect(side?.hidden).not.toBe(true);
  });

  it("keeps focus mode through background opens, retained state updates, and reconciliation", async () => {
    const fileId = store.getState().openTab({
      workspaceKey: WORKSPACE_KEY,
      target: { kind: "file", path: "guide.md" },
      intent: "background",
    });
    if (!fileId) throw new Error("Expected a saved file view");
    store.getState().openTab({
      workspaceKey: WORKSPACE_KEY,
      target: { kind: "subagents", parentAgentId: "parent" },
      intent: "background",
    });
    store.getState().setTabState(WORKSPACE_KEY, fileId, { treeVisible: true });
    store.getState().reconcileTabs(WORKSPACE_KEY, {
      agentsHydrated: true,
      terminalsHydrated: true,
      activeAgentIds: [],
      autoOpenAgentIds: [],
      knownAgentIds: [],
      knownTerminalIds: ["background-shell"],
      standaloneTerminalIds: ["background-shell"],
    });
    await store.persist.rehydrate();

    expect(usePanelStore.getState().desktop.focusModeEnabled).toBe(true);
    expect(
      findPaneById(store.getState().layoutByWorkspace[WORKSPACE_KEY].root, "explorer")?.hidden,
    ).toBe(true);
  });

  it("keeps focus mode when opening the main chat or receiving invalid activation requests", () => {
    store.getState().openTab({
      workspaceKey: WORKSPACE_KEY,
      target: { kind: "draft", draftId: "draft" },
      intent: "reveal",
    });
    store.getState().focusTab(WORKSPACE_KEY, "missing");
    expect(store.getState().showExplorerSidebar("")).toBeNull();
    expect(usePanelStore.getState().desktop.focusModeEnabled).toBe(true);
  });
});
