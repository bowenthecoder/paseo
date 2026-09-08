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
