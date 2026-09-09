import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  },
}));

import { usePanelStore } from "@/stores/panel-store";
import {
  collectAllTabs,
  findPaneById,
  selectExplorerSidebarPaneId,
  useWorkspaceLayoutStore,
} from "@/stores/workspace-layout-store";
import {
  openComposerChanges,
  openWorkspaceChanges,
  openWorkspacePullRequest,
  openWorkspaceSupportingTarget,
} from "@/workspace-tabs/open-supporting-view";

const WORKSPACE_KEY = "server-1:workspace-1";
const CHECKOUT = { serverId: "server-1", cwd: "/tmp/repo", isGit: true };

beforeEach(() => {
  usePanelStore.setState({
    mobilePanel: { target: "agent", revision: 0 },
    explorerTab: "files",
    explorerTabByCheckout: {},
  });
  useWorkspaceLayoutStore.setState({
    layoutByWorkspace: {},
  });
});

describe("openWorkspaceChanges", () => {
  it("opens Changes in the compact Explorer", () => {
    openWorkspaceChanges({
      isCompact: true,
      workspaceKey: WORKSPACE_KEY,
      checkout: CHECKOUT,
    });

    expect(usePanelStore.getState().mobilePanel.target).toBe("file-explorer");
    expect(usePanelStore.getState().explorerTab).toBe("changes");
  });
});

describe("openComposerChanges", () => {
  const input = {
    isCompact: false,
    supportsPaneSplits: true,
    workspaceKey: WORKSPACE_KEY,
    checkout: CHECKOUT,
  };

  it("opens Changes in the desktop side panel", () => {
    openComposerChanges(input);

    const state = useWorkspaceLayoutStore.getState();
    const explorerPaneId = selectExplorerSidebarPaneId(state, WORKSPACE_KEY);
    const layout = state.layoutByWorkspace[WORKSPACE_KEY];
    const explorerPane =
      layout && explorerPaneId ? findPaneById(layout.root, explorerPaneId) : null;
    const workingDiffTab = layout
      ? collectAllTabs(layout.root).find((tab) => tab.target.kind === "working_diff")
      : null;

    expect(explorerPane?.hidden).not.toBe(true);
    expect(workingDiffTab).toBeDefined();
    expect(explorerPane?.tabIds).toContain(workingDiffTab?.tabId);
    expect(explorerPane?.focusedTabId).toBe(workingDiffTab?.tabId);
  });

  it("keeps opening the compact Explorer on Changes", () => {
    openComposerChanges({ ...input, isCompact: true });
    openComposerChanges({ ...input, isCompact: true });

    expect(usePanelStore.getState().mobilePanel.target).toBe("file-explorer");
    expect(usePanelStore.getState().explorerTab).toBe("changes");
    expect(useWorkspaceLayoutStore.getState().layoutByWorkspace[WORKSPACE_KEY]).toBeUndefined();
  });
});

describe("supporting view source identity", () => {
  it("keeps Changes from parent and child worktrees as separate reusable views", () => {
    const parent = openWorkspaceSupportingTarget({
      workspaceKey: WORKSPACE_KEY,
      target: { kind: "working_diff" },
    });
    const child = openWorkspaceSupportingTarget({
      workspaceKey: WORKSPACE_KEY,
      target: { kind: "working_diff", workspaceId: "child-ws" },
      preview: { serverId: "server-1", workspaceId: "workspace-1" },
    });
    expect(child).not.toBe(parent);
    const repeated = openWorkspaceSupportingTarget({
      workspaceKey: WORKSPACE_KEY,
      target: { kind: "working_diff", workspaceId: "child-ws", focusPath: "child.ts" },
    });
    expect(repeated).toBe(child);
    const targets = useWorkspaceLayoutStore
      .getState()
      .getWorkspaceTabs(WORKSPACE_KEY)
      .filter((tab) => tab.target.kind === "working_diff")
      .map((tab) => tab.target);
    expect(targets).toEqual([
      { kind: "working_diff" },
      { kind: "working_diff", workspaceId: "child-ws", focusPath: "child.ts" },
    ]);
  });

  it("returns a reused file preview to the chat or task that most recently opened it", () => {
    const store = useWorkspaceLayoutStore.getState();
    const parent = store.openTab({
      workspaceKey: WORKSPACE_KEY,
      target: { kind: "agent", agentId: "parent" },
      intent: "reveal",
    });
    const child = store.openTab({
      workspaceKey: WORKSPACE_KEY,
      target: { kind: "provider_subagent", parentAgentId: "parent", subagentId: "child" },
      intent: "reveal",
    });
    const preview = { serverId: "server-1", workspaceId: "workspace-1" };
    const first = openWorkspaceSupportingTarget({
      workspaceKey: WORKSPACE_KEY,
      target: { kind: "file", path: "a.md" },
      parentTabId: parent,
      preview,
    });
    const second = openWorkspaceSupportingTarget({
      workspaceKey: WORKSPACE_KEY,
      target: { kind: "file", path: "/child/b.md" },
      parentTabId: child,
      preview,
    });
    expect(second).toBe(first);
    expect(
      useWorkspaceLayoutStore.getState().layoutByWorkspace[WORKSPACE_KEY].parentTabIdByTabId?.[
        second!
      ],
    ).toBe(child);
    store.closeTab(WORKSPACE_KEY, second!);
    const side = findPaneById(
      useWorkspaceLayoutStore.getState().layoutByWorkspace[WORKSPACE_KEY].root,
      "explorer",
    );
    expect(side?.focusedTabId).toBe(child);
    expect(side?.hidden).not.toBe(true);
  });
});

describe("openWorkspacePullRequest", () => {
  const input = {
    isCompact: false,
    supportsPaneSplits: true,
    workspaceKey: WORKSPACE_KEY,
    checkout: CHECKOUT,
  };

  it("opens the compact PR view in Explorer", () => {
    openWorkspacePullRequest({ ...input, isCompact: true });

    expect(usePanelStore.getState().mobilePanel.target).toBe("file-explorer");
    expect(usePanelStore.getState().explorerTab).toBe("pr");
    expect(useWorkspaceLayoutStore.getState().layoutByWorkspace[WORKSPACE_KEY]).toBeUndefined();
  });

  it("opens PRs in the side panel", () => {
    openWorkspacePullRequest(input);

    const state = useWorkspaceLayoutStore.getState();
    const layout = state.layoutByWorkspace[WORKSPACE_KEY];
    const explorerPaneId = selectExplorerSidebarPaneId(state, WORKSPACE_KEY);
    const explorerPane =
      layout && explorerPaneId ? findPaneById(layout.root, explorerPaneId) : null;
    const pullRequestTab = layout
      ? collectAllTabs(layout.root).find((tab) => tab.target.kind === "pull_request")
      : null;

    expect(pullRequestTab).not.toBeNull();
    expect(explorerPane?.tabIds).toContain(pullRequestTab?.tabId);
    expect(explorerPane?.hidden).not.toBe(true);
  });
});
