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

import AsyncStorage from "@react-native-async-storage/async-storage";
import { buildWorkspaceTabPersistenceKey, type WorkspaceTab } from "@/workspace-tabs/model";
import { defaultChangesState, type ChangesState } from "@/panels/changes/state";
import { defaultFileState, type FileState } from "@/panels/file/state";
import {
  collectAllPanes,
  collectAllTabs,
  createWorkspaceLayoutStore,
  createDefaultLayout,
  createWorkspaceLayoutWithExplorerSidebar,
  findPaneById,
  findPaneContainingTab,
  FOCUSED_PANE_PLACEMENT,
  getFocusedBrowserId,
  normalizeLayout,
  removeTabFromTree,
  selectExplorerSidebarPaneId,
  stripEphemeralTabsFromLayout,
  type SplitNode,
  type SplitPane,
} from "@/stores/workspace-layout-store";

const SERVER_ID = "server-1";
const WORKSPACE_ID = "ws-main";

function createDeterministicWorkspaceLayoutIds() {
  let values: string[] = [];
  let fallbackIndex = 0;

  function nextValue(): string {
    const value = values.shift();
    if (value) {
      return value;
    }
    fallbackIndex += 1;
    return `generated-${fallbackIndex}`;
  }

  return {
    useValues: (nextValues: string[]) => {
      values = nextValues.slice();
      fallbackIndex = 0;
    },
    reset: () => {
      values = [];
      fallbackIndex = 0;
    },
    createNodeId: (prefix: "pane" | "group") => `${prefix}_${nextValue()}`,
    createFocusRestorationToken: () => `workspace-focus-${nextValue()}`,
  };
}

const workspaceLayoutIds = createDeterministicWorkspaceLayoutIds();
const workspaceLayoutStore = createWorkspaceLayoutStore(workspaceLayoutIds);

function useWorkspaceLayoutIds(...values: string[]) {
  workspaceLayoutIds.useValues(values);
}

function createTab(
  tabId: string,
  target?: WorkspaceTab["target"],
  state?: WorkspaceTab["state"],
): WorkspaceTab {
  return {
    tabId,
    target: target ?? { kind: "draft", draftId: tabId },
    createdAt: 1,
    ...(state === undefined ? {} : { state }),
  };
}

function createPane(input: {
  id: string;
  tabIds: string[];
  focusedTabId?: string | null;
  hidden?: boolean;
  targetsByTabId?: Record<string, WorkspaceTab["target"]>;
  stateByTabId?: Record<string, WorkspaceTab["state"]>;
}): SplitNode {
  const tabs = input.tabIds.map((tabId) =>
    createTab(tabId, input.targetsByTabId?.[tabId], input.stateByTabId?.[tabId]),
  );
  return {
    kind: "pane",
    pane: {
      id: input.id,
      tabIds: input.tabIds,
      focusedTabId: input.focusedTabId ?? input.tabIds[input.tabIds.length - 1] ?? null,
      ...(input.hidden === true ? { hidden: true } : {}),
      tabs,
    } as SplitPane,
  };
}

function createWorkspaceKey(): string {
  const key = buildWorkspaceTabPersistenceKey({
    serverId: SERVER_ID,
    workspaceId: WORKSPACE_ID,
  });
  expect(key).toBeTruthy();
  return key as string;
}

function collectTabIds(root: SplitNode): string[] {
  return collectAllTabs(root).map((tab) => tab.tabId);
}

function collectContentTabs(root: SplitNode): WorkspaceTab[] {
  return contentTabs(collectAllTabs(root));
}

function contentTabs(tabs: WorkspaceTab[]): WorkspaceTab[] {
  return tabs.filter(
    (tab) =>
      tab.target.kind !== "new_tab" &&
      tab.target.kind !== "files" &&
      tab.target.kind !== "changes_tree",
  );
}

function expectGroup(node: SplitNode): Extract<SplitNode, { kind: "group" }> {
  expect(node.kind).toBe("group");
  return node as Extract<SplitNode, { kind: "group" }>;
}

describe("workspace-layout-store helpers", () => {
  it("seeds Files and Changes in the default Explorer sidebar", () => {
    const layout = createWorkspaceLayoutWithExplorerSidebar();
    const tabs = collectAllTabs(layout.root);

    expect(tabs.map((tab) => tab.target)).toEqual([
      { kind: "new_tab" },
      { kind: "files" },
      { kind: "changes_tree" },
    ]);
    expect(findPaneById(layout.root, "explorer")?.focusedTabId).toBe(
      tabs.find((tab) => tab.target.kind === "changes_tree")?.tabId,
    );
  });

  it("discards persisted New tabs and restores each empty pane with a fresh identity", async () => {
    const persisted = createWorkspaceLayoutWithExplorerSidebar();
    const persistedIds = new Set(collectAllTabs(persisted.root).map((tab) => tab.tabId));
    await AsyncStorage.setItem(
      "workspace-layout-state",
      JSON.stringify({
        state: {
          layoutByWorkspace: { workspace: persisted },
          splitSizesByWorkspace: {},
          explorerPaneIdByWorkspace: { workspace: "explorer" },
        },
        version: 1,
      }),
    );
    const restored = createWorkspaceLayoutStore(createDeterministicWorkspaceLayoutIds());
    await restored.persist.rehydrate();

    const restoredTabs = collectAllTabs(restored.getState().layoutByWorkspace.workspace.root);
    expect(restoredTabs.map((tab) => tab.target)).toEqual([
      { kind: "new_tab" },
      { kind: "files" },
      { kind: "changes_tree" },
    ]);
    const restoredNewTab = restoredTabs.find((tab) => tab.target.kind === "new_tab");
    expect(restoredNewTab).toBeTruthy();
    expect(persistedIds.has(restoredNewTab?.tabId ?? "")).toBe(false);
  });

  it("finds panes and tabs across nested groups", () => {
    const root: SplitNode = {
      kind: "group",
      group: {
        id: "group-root",
        direction: "horizontal",
        sizes: [0.4, 0.6],
        children: [
          createPane({ id: "left", tabIds: ["tab-a", "tab-b"], focusedTabId: "tab-a" }),
          {
            kind: "group",
            group: {
              id: "group-right",
              direction: "vertical",
              sizes: [0.5, 0.5],
              children: [
                createPane({ id: "top-right", tabIds: ["tab-c"] }),
                createPane({ id: "bottom-right", tabIds: ["tab-d"] }),
              ],
            },
          },
        ],
      },
    };

    expect(findPaneById(root, "top-right")?.tabIds).toEqual(["tab-c"]);
    expect(findPaneContainingTab(root, "tab-b")?.id).toBe("left");
    expect(collectAllPanes(root).map((pane) => pane.id)).toEqual([
      "left",
      "top-right",
      "bottom-right",
    ]);
    expect(collectAllTabs(root).map((tab) => tab.tabId)).toEqual([
      "tab-a",
      "tab-b",
      "tab-c",
      "tab-d",
    ]);
  });

  it("derives the focused browser id from the focused pane active tab", () => {
    const root: SplitNode = {
      kind: "group",
      group: {
        id: "group-root",
        direction: "horizontal",
        sizes: [0.5, 0.5],
        children: [
          createPane({
            id: "left",
            tabIds: ["agent-a", "browser-a"],
            focusedTabId: "browser-a",
            targetsByTabId: {
              "agent-a": { kind: "agent", agentId: "agent-a" },
              "browser-a": { kind: "browser", browserId: "browser-a-id" },
            },
          }),
          createPane({
            id: "right",
            tabIds: ["browser-b"],
            focusedTabId: "browser-b",
            targetsByTabId: {
              "browser-b": { kind: "browser", browserId: "browser-b-id" },
            },
          }),
        ],
      },
    };

    expect(getFocusedBrowserId({ root, focusedPaneId: "left" })).toBe("browser-a-id");
    expect(getFocusedBrowserId({ root, focusedPaneId: "right" })).toBe("browser-b-id");
  });

  it("returns null when the focused pane active tab is not a browser", () => {
    const root = createPane({
      id: "main",
      tabIds: ["browser-a", "agent-a"],
      focusedTabId: "agent-a",
      targetsByTabId: {
        "browser-a": { kind: "browser", browserId: "browser-a-id" },
        "agent-a": { kind: "agent", agentId: "agent-a" },
      },
    });

    expect(getFocusedBrowserId({ root, focusedPaneId: "main" })).toBeNull();
  });

  it("keeps tabs in hidden panes while excluding those panes from focus helpers", () => {
    const root = createPane({ id: "hidden", tabIds: ["tab-a"], hidden: true });

    expect(collectAllTabs(root).map((tab) => tab.tabId)).toEqual(["tab-a"]);
    expect(collectAllPanes(root)).toEqual([]);
    expect(getFocusedBrowserId({ root, focusedPaneId: "hidden" })).toBeNull();
  });
});

describe("workspace-layout-store tree transforms", () => {
  beforeEach(() => {
    workspaceLayoutIds.reset();
  });

  /**
   * The renderer keys panes by id and reconciles them positionally, so a pane that changes render
   * path is unmounted and rebuilt — the composer, terminal, and scroll state in it are lost. A
   * same-direction split has no reason to move anything: it appends a sibling into the group that
   * is already running in that direction. Perpendicular splits are excluded because nesting is the
   * only way to change axis.
   */

  it("removeTabFromTree collapses empty panes but keeps the final root pane", () => {
    const splitRoot: SplitNode = {
      kind: "group",
      group: {
        id: "group-root",
        direction: "horizontal",
        sizes: [0.5, 0.5],
        children: [
          createPane({ id: "left", tabIds: ["tab-a"] }),
          createPane({ id: "right", tabIds: ["tab-b"] }),
        ],
      },
    };

    const collapsed = removeTabFromTree(splitRoot, "tab-a");
    expect(collapsed).toEqual(createPane({ id: "right", tabIds: ["tab-b"] }));

    const singlePaneRoot = createPane({ id: "main", tabIds: ["tab-a"] });
    const emptied = removeTabFromTree(singlePaneRoot, "tab-a");
    expect(collectAllTabs(emptied)).toHaveLength(1);
    expect(collectAllTabs(emptied)[0]?.target).toEqual({ kind: "new_tab" });
  });
});

describe("workspace-layout-store actions", () => {
  it("creates duplicate Changes instances while reveal keeps the first instance", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();
    const first = store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "working_diff" },
      intent: "new",
    });
    const second = store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "working_diff" },
      intent: "new",
    });

    expect(first).not.toBe(second);
    expect(
      collectAllTabs(workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey].root).filter(
        (tab) => tab.target.kind === "working_diff",
      ),
    ).toHaveLength(2);

    expect(
      store.openTab({
        workspaceKey: workspaceKey,
        target: { kind: "working_diff" },
        intent: "reveal",
      }),
    ).toBe(first);
  });

  it("creates duplicate Pull request instances explicitly", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();
    const first = store.openTab({ workspaceKey, target: { kind: "pull_request" }, intent: "new" });
    const second = store.openTab({ workspaceKey, target: { kind: "pull_request" }, intent: "new" });
    expect(first).not.toBe(second);
    expect(
      collectAllTabs(workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey].root).filter(
        (tab) => tab.target.kind === "pull_request",
      ),
    ).toHaveLength(2);
  });

  it("preserves same-kind state, clears cross-kind state, and accepts an explicit override", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();
    const file = store.openTab({
      workspaceKey,
      target: { kind: "file", path: "/repo/a.ts" },
      intent: "new",
    })!;
    const fileState: FileState = { treeVisible: true, treeWidth: 240 };
    store.setTabState(workspaceKey, file, fileState);
    const sameKind = store.replaceTab(workspaceKey, file, { kind: "file", path: "/repo/b.ts" });
    expect(sameKind).toBe(file);
    expect(
      collectAllTabs(workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey].root).find(
        (tab) => tab.tabId === sameKind,
      )?.state,
    ).toEqual(fileState);
    const crossKind = store.replaceTab(workspaceKey, sameKind!, { kind: "working_diff" });
    expect(
      collectAllTabs(workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey].root).find(
        (tab) => tab.tabId === crossKind,
      )?.state,
    ).toBeUndefined();
    const override: ChangesState = { ...defaultChangesState, treeVisible: true };
    const overridden = store.replaceTab(
      workspaceKey,
      crossKind!,
      { kind: "working_diff" },
      override,
    );
    expect(
      collectAllTabs(workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey].root).find(
        (tab) => tab.tabId === overridden,
      )?.state,
    ).toEqual(override);
  });

  it("keeps the tab instance when a panel receives a same-kind replacement", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();
    const tabId = store.openTab({
      workspaceKey,
      target: { kind: "working_diff", focusPath: "src/a.ts", focusRequestId: 1 },
      intent: "new",
    })!;
    const state: ChangesState = { ...defaultChangesState, collapsedFilePaths: ["src/a.ts"] };
    store.setTabState(workspaceKey, tabId, state);

    const replacementTabId = store.replaceTab(workspaceKey, tabId, {
      kind: "working_diff",
      focusPath: "src/b.ts",
      focusRequestId: 2,
    });
    const replacement = collectAllTabs(
      workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey].root,
    ).find((tab) => tab.tabId === tabId);

    expect(replacementTabId).toBe(tabId);
    expect(replacement).toMatchObject({
      tabId,
      target: { kind: "working_diff", focusPath: "src/b.ts", focusRequestId: 2 },
      state,
    });
  });

  it("keeps every local Changes field independent across explicit instances", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();
    const first = store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "working_diff" },
      intent: "new",
    })!;
    const second = store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "working_diff" },
      intent: "new",
    })!;
    const changed: ChangesState = {
      treeVisible: true,
      treeWidth: 320,
      collapsedFilePaths: ["a.ts"],
      collapsedFolderPaths: ["src"],
      commitsCollapsed: false,
    };
    store.setTabState(workspaceKey, first, changed);
    const tabs = collectAllTabs(
      workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey].root,
    );
    expect(tabs.find((tab) => tab.tabId === first)?.state).toEqual(changed);
    expect(tabs.find((tab) => tab.tabId === second)?.state).toEqual(undefined);
  });

  it("restores a revealed file's parent after local replacement", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();
    const parent = store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "agent", agentId: "parent" },
      intent: "new",
    })!;
    const file = store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "file", path: "/repo/a.ts", lineStart: 1 },
      intent: "new",
    })!;
    store.setTabState(workspaceKey, file, {
      treeVisible: true,
      treeWidth: 300,
    });
    expect(
      store.openTab({
        workspaceKey: workspaceKey,
        target: { kind: "file", path: "/repo/a.ts", lineStart: 9 },
        intent: "reveal",
        placement: undefined,
        parentTabId: parent,
      }),
    ).toBe(file);
    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];
    expect(collectAllTabs(layout.root).find((tab) => tab.tabId === file)).toMatchObject({
      target: { path: "/repo/a.ts", lineStart: 9 },
      state: { ...defaultFileState, treeVisible: true, treeWidth: 300 },
    });
    expect(layout.parentTabIdByTabId?.[file]).toBe(parent);

    const replacement = store.replaceTab(
      workspaceKey,
      file,
      { kind: "file", path: "/repo/b.ts" },
      { ...defaultFileState, treeVisible: true, treeWidth: 300 },
    );
    expect(replacement).toBe(file);
    const replacedLayout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];
    expect(replacedLayout.parentTabIdByTabId?.[file]).toBe(parent);

    store.closeTab(workspaceKey, replacement as string);
    expect(
      findPaneById(workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey].root, "main")
        ?.focusedTabId,
    ).toBe(parent);
  });

  it("keeps existing child edges attached to a replacement tab", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();
    const replaced = store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "pull_request" },
      intent: "new",
    })!;
    const child = store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "file", path: "/repo/a.ts" },
      intent: "reveal",
      parentTabId: replaced,
    })!;
    const unrelatedParent = store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "draft", draftId: "unrelated" },
      intent: "new",
    })!;
    const unrelatedChild = store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "file", path: "/repo/unrelated.ts" },
      intent: "reveal",
      parentTabId: unrelatedParent,
    })!;

    const replacement = store.replaceTab(
      workspaceKey,
      replaced,
      { kind: "file", path: "/repo/b.ts" },
      { ...defaultFileState, treeVisible: true },
    )!;
    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];

    expect(layout.parentTabIdByTabId?.[child]).toBe(replacement);
    expect(layout.parentTabIdByTabId?.[unrelatedChild]).toBe(unrelatedParent);
    expect(Object.entries(layout.parentTabIdByTabId ?? {}).flat()).not.toContain(replaced);

    store.focusTab(workspaceKey, child);
    store.closeTab(workspaceKey, child);
    expect(
      findPaneById(workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey].root, "explorer")
        ?.focusedTabId,
    ).toBe(replacement);
  });

  it("reveals provider children through the child capability in a compact pane", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();
    const parent = store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "agent", agentId: "parent" },
      intent: "new",
    })!;
    const target = {
      kind: "provider_subagent" as const,
      parentAgentId: "parent",
      subagentId: "provider-child",
    };
    const compactPanePlacement = { mode: "pane" as const, paneId: "main" };

    const child = store.openTab({
      workspaceKey: workspaceKey,
      target: target,
      intent: "reveal",
      parentTabId: parent,
      placement: compactPanePlacement,
    })!;
    expect(
      store.openTab({
        workspaceKey: workspaceKey,
        target: target,
        intent: "reveal",
        parentTabId: parent,
        placement: compactPanePlacement,
      }),
    ).toBe(child);
    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];
    expect(findPaneContainingTab(layout.root, child)?.id).toBe("main");
    expect(layout.parentTabIdByTabId?.[child]).toBe(parent);

    store.closeTab(workspaceKey, child);
    expect(
      findPaneById(workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey].root, "main")
        ?.focusedTabId,
    ).toBe(parent);
  });

  it("replaces only the supplied file slot and carries its state", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();
    const preserved = store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "file", path: "/repo/a.ts" },
      intent: "new",
    });
    const local = store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "file", path: "/repo/b.ts" },
      intent: "new",
    });

    const replacement = store.replaceTab(
      workspaceKey,
      local as string,
      { kind: "file", path: "/repo/a.ts" },
      { ...defaultFileState, treeVisible: true, treeWidth: 280 },
    );

    const tabs = collectAllTabs(
      workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey].root,
    );
    expect(replacement).not.toBe(preserved);
    expect(tabs.find((tab) => tab.tabId === preserved)?.target).toEqual({
      kind: "file",
      path: "/repo/a.ts",
    });
    expect(tabs.find((tab) => tab.tabId === replacement)?.state).toEqual({
      ...defaultFileState,
      treeVisible: true,
      treeWidth: 280,
    });
  });
  beforeEach(() => {
    workspaceLayoutIds.reset();
    workspaceLayoutStore.setState({
      layoutByWorkspace: {},
      pinnedAgentIdsByWorkspace: {},
      hiddenAgentIdsByWorkspace: {},
      focusRestorationByWorkspace: {},
    });
  });

  it("replaces a pane's sole New tab when real content opens", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();
    const initialLayout = createWorkspaceLayoutWithExplorerSidebar();
    workspaceLayoutStore.setState({ layoutByWorkspace: { [workspaceKey]: initialLayout } });
    const initialMainTabId = findPaneById(initialLayout.root, "main")?.focusedTabId;

    const agentTabId = store.openTab({
      workspaceKey,
      target: { kind: "agent", agentId: "agent-1" },
      intent: "background",
    });

    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];
    expect(findPaneById(layout.root, "main")?.tabIds).toEqual([agentTabId]);
    expect(findPaneById(layout.root, "main")?.focusedTabId).toBe(agentTabId);
    expect(collectTabIds(layout.root)).not.toContain(initialMainTabId);
  });

  it("keeps a New tab's random identity when its launcher selects content", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();
    const initialLayout = createWorkspaceLayoutWithExplorerSidebar();
    workspaceLayoutStore.setState({ layoutByWorkspace: { [workspaceKey]: initialLayout } });
    const newTabId = findPaneById(initialLayout.root, "main")?.focusedTabId as string;

    const resultTabId = store.replaceTab(workspaceKey, newTabId, { kind: "files" });

    expect(resultTabId).toBe(newTabId);
    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];
    expect(findPaneById(layout.root, "main")?.tabIds).toEqual([newTabId]);
    expect(collectAllTabs(layout.root).find((tab) => tab.tabId === newTabId)?.target).toEqual({
      kind: "files",
    });
  });

  it("migrates legacy layouts to include the hidden registered explorer pane", async () => {
    const legacyLayout = createDefaultLayout();
    await AsyncStorage.setItem(
      "workspace-layout-state",
      JSON.stringify({
        state: { layoutByWorkspace: { legacy: legacyLayout } },
        version: 1,
      }),
    );
    const restored = createWorkspaceLayoutStore(createDeterministicWorkspaceLayoutIds());

    await restored.persist.rehydrate();

    const state = restored.getState();
    const layout = state.layoutByWorkspace.legacy;
    const explorerSidebarPaneId = selectExplorerSidebarPaneId(state, "legacy");
    expect(findPaneById(layout.root, "main")).toBeTruthy();
    expect(explorerSidebarPaneId).toBe("explorer");
    const explorerPane = findPaneById(layout.root, explorerSidebarPaneId);
    expect(explorerPane?.hidden).toBe(true);
    const tabsById = new Map(collectAllTabs(layout.root).map((tab) => [tab.tabId, tab]));
    expect(explorerPane?.tabIds.map((tabId) => tabsById.get(tabId)?.target)).toEqual([
      { kind: "files" },
      { kind: "changes_tree" },
    ]);
    await expect(AsyncStorage.getItem("workspace-layout-state")).resolves.not.toBeNull();
  });

  it("restores a layout saved before the Side panel rename, PR bookkeeping and all", async () => {
    const savedLayout = createWorkspaceLayoutWithExplorerSidebar();
    await AsyncStorage.setItem(
      "workspace-layout-state",
      JSON.stringify({
        state: {
          layoutByWorkspace: { renamed: savedLayout },
          explorerPaneIdByWorkspace: { renamed: "explorer" },
          acknowledgedPullRequestByWorkspace: { renamed: "url:https://example.test/pulls/1" },
        },
        version: 1,
      }),
    );
    const restored = createWorkspaceLayoutStore(createDeterministicWorkspaceLayoutIds());

    await restored.persist.rehydrate();

    const state = restored.getState();
    expect(state.layoutByWorkspace.renamed).toBeTruthy();
    expect(selectExplorerSidebarPaneId(state, "renamed")).toBe("explorer");
  });

  it("persists first-class pane targets, visibility, and focus", async () => {
    await AsyncStorage.removeItem("workspace-layout-state");
    const workspaceKey = createWorkspaceKey();
    const source = createWorkspaceLayoutStore(createDeterministicWorkspaceLayoutIds());
    await source.persist.rehydrate();

    source.getState().openTab({
      workspaceKey: workspaceKey,
      target: { kind: "agent", agentId: "agent-1" },
      intent: "reveal",
    });
    const focusedAgentTabId = source.getState().openTab({
      workspaceKey: workspaceKey,
      target: { kind: "agent", agentId: "agent-2" },
      intent: "reveal",
    });
    const explorerSidebarPaneId = source.getState().showExplorerSidebar(workspaceKey);
    expect(explorerSidebarPaneId).toBeTruthy();
    source
      .getState()
      .openTab({ workspaceKey: workspaceKey, target: { kind: "files" }, intent: "reveal" });
    source.getState().openTab({
      workspaceKey: workspaceKey,
      target: { kind: "pull_request" },
      intent: "background",
      placement: { mode: "prefer", paneId: explorerSidebarPaneId as string },
    });
    source.getState().hideExplorerSidebar(workspaceKey);

    await vi.waitFor(async () => {
      expect(await AsyncStorage.getItem("workspace-layout-state")).not.toBeNull();
    });

    const restored = createWorkspaceLayoutStore(createDeterministicWorkspaceLayoutIds());
    await restored.persist.rehydrate();
    const state = restored.getState();
    const layout = state.layoutByWorkspace[workspaceKey];

    expect(layout.focusedPaneId).toBe("main");
    expect(findPaneById(layout.root, "main")?.focusedTabId).toBe(focusedAgentTabId);
    expect(findPaneById(layout.root, explorerSidebarPaneId)?.hidden).toBe(true);
    expect(collectAllTabs(layout.root).map((tab) => tab.target.kind)).toEqual([
      "agent",
      "agent",
      "files",
      "changes_tree",
      "pull_request",
    ]);
    expect(selectExplorerSidebarPaneId(state, workspaceKey)).toBe(explorerSidebarPaneId);
  });

  it("persists and rehydrates independent Changes state through validated storage", async () => {
    await AsyncStorage.removeItem("workspace-layout-state");
    const workspaceKey = createWorkspaceKey();
    const source = createWorkspaceLayoutStore(createDeterministicWorkspaceLayoutIds());
    await source.persist.rehydrate();
    const first = source
      .getState()
      .openTab({ workspaceKey: workspaceKey, target: { kind: "working_diff" }, intent: "new" })!;
    const second = source
      .getState()
      .openTab({ workspaceKey: workspaceKey, target: { kind: "working_diff" }, intent: "new" })!;
    const firstState: ChangesState = {
      treeVisible: true,
      treeWidth: 320,
      collapsedFilePaths: ["src/a.ts"],
      collapsedFolderPaths: ["src"],
      commitsCollapsed: false,
    };
    const secondState: ChangesState = {
      treeVisible: false,
      collapsedFilePaths: ["README.md"],
      collapsedFolderPaths: ["docs"],
      commitsCollapsed: true,
    };
    source.getState().setTabState(workspaceKey, first, firstState);
    source.getState().setTabState(workspaceKey, second, secondState);

    await vi.waitFor(async () => {
      const persisted = await AsyncStorage.getItem("workspace-layout-state");
      expect(persisted).not.toBeNull();
      const root = JSON.parse(persisted ?? "{}").state.layoutByWorkspace[workspaceKey].root;
      expect(collectTabIds(root)).toEqual(["files", "changes_tree", first, second]);
    });

    const restored = createWorkspaceLayoutStore(createDeterministicWorkspaceLayoutIds());
    await restored.persist.rehydrate();
    const tabs = collectAllTabs(restored.getState().layoutByWorkspace[workspaceKey].root);
    expect(tabs.find((tab) => tab.tabId === first)?.state).toEqual(firstState);
    expect(tabs.find((tab) => tab.tabId === second)?.state).toEqual(secondState);
  });

  it("keeps ambient entity tabs out of Explorer after a background tab lands there", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "pull_request" },
      intent: "background",
      placement: { mode: "prefer", paneId: "explorer" },
    });
    store.focusPane(workspaceKey, "explorer");
    const agentTabId = store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "agent", agentId: "agent-1" },
      intent: "reveal",
    });

    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];
    expect(agentTabId).toBeTruthy();
    expect(findPaneContainingTab(layout.root, agentTabId as string)?.id).toBe("main");
    expect(layout.focusedPaneId).toBe("main");
  });

  it("places a background terminal tab in Explorer without stealing workspace focus", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();
    store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "agent", agentId: "agent-1" },
      intent: "reveal",
    });
    store.showExplorerSidebar(workspaceKey);

    const terminalTabId = store.openTab({
      workspaceKey: workspaceKey,
      target: {
        kind: "terminal",
        terminalId: "terminal-1",
      },
      intent: "background",
      placement: { mode: "pane", paneId: "explorer" },
    });

    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];
    expect(findPaneContainingTab(layout.root, terminalTabId as string)?.id).toBe("explorer");
    expect(layout.focusedPaneId).toBe("main");
  });

  it("keeps explicitly revealed browsers focused in the supporting dock", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();
    store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "browser", browserId: "browser-1" },
      intent: "reveal",
    });
    store.focusPane(workspaceKey, "explorer");

    const browserTabId = store.openTab({
      workspaceKey: workspaceKey,
      target: {
        kind: "browser",
        browserId: "browser-2",
      },
      intent: "reveal",
    });

    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];
    expect(findPaneContainingTab(layout.root, browserTabId as string)?.id).toBe("explorer");
    expect(layout.focusedPaneId).toBe("explorer");
  });

  it("keeps ambient draft opens out of the focused explorer pane", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();
    store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "agent", agentId: "agent-1" },
      intent: "reveal",
    });
    store.focusPane(workspaceKey, "explorer");

    const draftTabId = store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "draft", draftId: "draft-1" },
      intent: "reveal",
    });

    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];
    expect(findPaneContainingTab(layout.root, draftTabId as string)?.id).toBe("main");
    expect(layout.focusedPaneId).toBe("main");
  });

  it("keeps an existing user-created entity tab in its original pane", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();
    const terminalTabId = store.openTab({
      workspaceKey: workspaceKey,
      target: {
        kind: "terminal",
        terminalId: "terminal-1",
      },
      intent: "background",
    });
    store.showExplorerSidebar(workspaceKey);

    store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "terminal", terminalId: "terminal-1" },
      intent: "reveal",
      placement: FOCUSED_PANE_PLACEMENT,
    });

    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];
    expect(findPaneContainingTab(layout.root, terminalTabId as string)?.id).toBe("explorer");
    expect(findPaneById(layout.root, "main")).toBeTruthy();
    expect(layout.focusedPaneId).toBe("main");
  });

  it("defers terminal reconciliation while a user terminal is being created", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();
    store.showExplorerSidebar(workspaceKey);

    store.reconcileTabs(workspaceKey, {
      agentsHydrated: true,
      terminalsHydrated: true,
      activeAgentIds: [],
      autoOpenAgentIds: [],
      knownAgentIds: [],
      knownTerminalIds: ["terminal-1"],
      standaloneTerminalIds: ["terminal-1"],
      hasActivePendingTerminalCreate: true,
    });

    let layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];
    expect(findPaneContainingTab(layout.root, "terminal_terminal-1")).toBeNull();

    store.reconcileTabs(workspaceKey, {
      agentsHydrated: true,
      terminalsHydrated: true,
      activeAgentIds: [],
      autoOpenAgentIds: [],
      knownAgentIds: [],
      knownTerminalIds: ["terminal-1"],
      standaloneTerminalIds: ["terminal-1"],
    });

    layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];
    expect(findPaneContainingTab(layout.root, "terminal_terminal-1")?.id).toBe("explorer");
  });

  it("keeps non-entity tabs in the focused explorer pane", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();
    store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "agent", agentId: "agent-1" },
      intent: "reveal",
    });
    store.focusPane(workspaceKey, "explorer");

    const filesTabId = store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "files" },
      intent: "reveal",
    });

    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];
    expect(findPaneContainingTab(layout.root, filesTabId as string)?.id).toBe("explorer");
  });

  it("keeps reconcile auto-opened agents out of the focused explorer pane", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();
    store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "agent", agentId: "agent-1" },
      intent: "reveal",
    });
    store.focusPane(workspaceKey, "explorer");

    store.reconcileTabs(workspaceKey, {
      agentsHydrated: true,
      terminalsHydrated: true,
      activeAgentIds: ["agent-1", "agent-2"],
      autoOpenAgentIds: ["agent-1", "agent-2"],
      knownAgentIds: ["agent-1", "agent-2"],
      standaloneTerminalIds: [],
    });

    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];
    expect(findPaneContainingTab(layout.root, "agent_agent-2")?.id).toBe("main");
    expect(layout.focusedPaneId).toBe("main");
  });

  it("opens file content in Explorer when explicitly preferred there", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();
    const paneId = store.showExplorerSidebar(workspaceKey) as string;
    const tabId = store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "file", path: "/repo/worktree/a.ts" },
      intent: "reveal",
      parentTabId: "agent_agent-a",
      placement: { mode: "prefer", paneId },
    });
    const createdState = workspaceLayoutStore.getState();
    const explorerSidebarPaneId = selectExplorerSidebarPaneId(createdState, workspaceKey);

    expect(explorerSidebarPaneId).toBe("explorer");
    expect(
      findPaneContainingTab(createdState.layoutByWorkspace[workspaceKey].root, tabId!)?.id,
    ).toBe("explorer");
    expect(collectAllTabs(createdState.layoutByWorkspace[workspaceKey].root)).toContainEqual({
      tabId,
      target: { kind: "file", path: "/repo/worktree/a.ts" },
      createdAt: expect.any(Number),
    });

    store.hideExplorerSidebar(workspaceKey);
    store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "file", path: "/repo/worktree/b.ts" },
      intent: "reveal",
      placement: { mode: "prefer", paneId: store.showExplorerSidebar(workspaceKey) as string },
    });
    const revealedLayout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];

    expect(findPaneById(revealedLayout.root, explorerSidebarPaneId)?.hidden).toBeUndefined();
    expect(findPaneContainingTab(revealedLayout.root, "file_/repo/worktree/b.ts")?.id).toBe(
      "explorer",
    );
  });

  it("leaves a canonical duplicate file tab where the user placed it in Explorer", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();
    useWorkspaceLayoutIds("explorer");
    const paneId = store.showExplorerSidebar(workspaceKey) as string;
    const tabId = store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "file", path: "/repo/worktree/a.ts" },
      intent: "reveal",
      placement: { mode: "pane", paneId },
    });
    store.hideExplorerSidebar(workspaceKey);

    store.showExplorerSidebar(workspaceKey);
    const duplicateTabId = store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "file", path: "/repo/worktree/a.ts", lineStart: 12 },
      intent: "reveal",
      parentTabId: "agent_agent-a",
      placement: { mode: "prefer", paneId },
    });
    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];

    expect(duplicateTabId).toBe(tabId);
    expect(collectAllTabs(layout.root).filter((tab) => tab.tabId === tabId)).toHaveLength(1);
    expect(findPaneContainingTab(layout.root, tabId as string)?.id).toBe("explorer");
    expect(findPaneById(layout.root, paneId)?.hidden).toBeUndefined();
    expect(layout.focusedPaneId).toBe("main");
    expect(findPaneById(layout.root, paneId)?.focusedTabId).toBe(tabId);
  });

  it("restores workspace and agent plugin panel targets", async () => {
    const workspaceTarget = {
      kind: "plugin",
      pluginId: "review",
      panelId: "summary",
      context: "workspace",
    };
    const agentTarget = {
      kind: "plugin",
      pluginId: "review",
      panelId: "details",
      context: "agent",
      agentId: "agent-1",
    };
    await AsyncStorage.setItem(
      "workspace-layout-state",
      JSON.stringify({
        state: {
          layoutByWorkspace: {
            workspace: {
              root: {
                kind: "pane",
                pane: {
                  id: "main",
                  tabIds: ["workspace-panel", "agent-panel"],
                  focusedTabId: "agent-panel",
                  tabs: [
                    { tabId: "workspace-panel", target: workspaceTarget, createdAt: 1 },
                    { tabId: "agent-panel", target: agentTarget, createdAt: 2 },
                  ],
                },
              },
              focusedPaneId: "main",
            },
          },
          splitSizesByWorkspace: {},
        },
        version: 1,
      }),
    );
    const restored = createWorkspaceLayoutStore(createDeterministicWorkspaceLayoutIds());

    await restored.persist.rehydrate();

    const layout = restored.getState().layoutByWorkspace.workspace;
    expect(layout && collectContentTabs(layout.root).map((tab) => tab.target)).toEqual([
      workspaceTarget,
      agentTarget,
    ]);
  });

  it("updates an existing file tab when opening the same path at a new line range", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    const firstTabId = store.openTab({
      workspaceKey: workspaceKey,
      target: {
        kind: "file",
        path: "/repo/worktree/a.ts",
        lineStart: 5,
      },
      intent: "reveal",
    });
    const secondTabId = store.openTab({
      workspaceKey: workspaceKey,
      target: {
        kind: "file",
        path: "/repo/worktree/a.ts",
        lineStart: 10,
        lineEnd: 12,
      },
      intent: "reveal",
    });
    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];

    expect(firstTabId).toBe("file_/repo/worktree/a.ts");
    expect(secondTabId).toBe(firstTabId);
    expect(collectContentTabs(layout.root)).toEqual([
      {
        tabId: "file_/repo/worktree/a.ts",
        target: {
          kind: "file",
          path: "/repo/worktree/a.ts",
          lineStart: 10,
          lineEnd: 12,
        },
        createdAt: expect.any(Number),
      },
    ]);
  });

  it("openTab background intent inserts a tab without stealing focus", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    const agentTabId = store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "agent", agentId: "agent-1" },
      intent: "reveal",
    });
    const setupTabId = store.openTab({
      workspaceKey: workspaceKey,
      target: {
        kind: "setup",
        workspaceId: "ws-main",
      },
      intent: "background",
    });
    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];
    const pane = findPaneById(layout.root, "main")!;

    expect(agentTabId).toBe("agent_agent-1");
    expect(setupTabId).toBe("setup_ws-main");
    expect(pane.tabIds).toEqual([agentTabId]);
    expect(pane.focusedTabId).toBe(agentTabId);
    expect(findPaneById(layout.root, "explorer")?.tabIds).toContain(setupTabId);
    expect(layout.focusedPaneId).toBe("main");
  });

  it("openTab background intent on an existing target is a no-op", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    const firstTabId = store.openTab({
      workspaceKey: workspaceKey,
      target: {
        kind: "file",
        path: "/repo/worktree/a.ts",
      },
      intent: "reveal",
    });
    const secondTabId = store.openTab({
      workspaceKey: workspaceKey,
      target: {
        kind: "file",
        path: "/repo/worktree/b.ts",
      },
      intent: "reveal",
    });
    const duplicateTabId = store.openTab({
      workspaceKey: workspaceKey,
      target: {
        kind: "file",
        path: "/repo/worktree/a.ts",
      },
      intent: "background",
    });
    const layoutAfter = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];
    const pane = findPaneById(layoutAfter.root, "explorer")!;

    expect(duplicateTabId).toBe(firstTabId);
    expect(pane.tabIds).toEqual(["files", "changes_tree", firstTabId, secondTabId]);
    expect(pane.focusedTabId).toBe(secondTabId);
  });

  it("closing a focused middle tab selects the tab to its right", () => {
    const workspaceKey = createWorkspaceKey();
    const firstTabId = "draft-1";
    const closedTabId = "draft-2";
    const rightTabId = "draft-3";

    workspaceLayoutStore.setState((state) => ({
      ...state,
      layoutByWorkspace: {
        ...state.layoutByWorkspace,
        [workspaceKey]: {
          root: createPane({
            id: "main",
            tabIds: [firstTabId, closedTabId, rightTabId],
            focusedTabId: closedTabId,
          }),
          focusedPaneId: "main",
        },
      },
    }));

    workspaceLayoutStore.getState().closeTab(workspaceKey, closedTabId);
    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];
    const pane = findPaneById(layout.root, "main")!;

    expect(pane.tabIds).toEqual([firstTabId, rightTabId]);
    expect(pane.focusedTabId).toBe(rightTabId);
  });

  it("closing a focused child tab returns to its parent before using tab-strip order", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    const parentTabId = store.openTab({
      workspaceKey: workspaceKey,
      target: {
        kind: "draft",
        draftId: "draft-parent",
      },
      intent: "reveal",
    });
    const childTabId = store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "draft", draftId: "draft-child" },
      intent: "reveal",
      parentTabId: parentTabId!,
    });
    const rightTabId = store.openTab({
      workspaceKey: workspaceKey,
      target: {
        kind: "draft",
        draftId: "draft-right",
      },
      intent: "reveal",
    });
    store.focusTab(workspaceKey, childTabId!);

    workspaceLayoutStore.getState().closeTab(workspaceKey, childTabId!);
    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];
    const pane = findPaneById(layout.root, "main")!;

    expect(pane.tabIds).toEqual([parentTabId, rightTabId]);
    expect(pane.focusedTabId).toBe(parentTabId);
  });

  it("closing a focused last tab selects the tab to its left", () => {
    const workspaceKey = createWorkspaceKey();
    const leftTabId = "draft-1";
    const closedTabId = "draft-2";

    workspaceLayoutStore.setState((state) => ({
      ...state,
      layoutByWorkspace: {
        ...state.layoutByWorkspace,
        [workspaceKey]: {
          root: createPane({
            id: "main",
            tabIds: [leftTabId, closedTabId],
            focusedTabId: closedTabId,
          }),
          focusedPaneId: "main",
        },
      },
    }));

    workspaceLayoutStore.getState().closeTab(workspaceKey, closedTabId);
    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];
    const pane = findPaneById(layout.root, "main")!;

    expect(pane.tabIds).toEqual([leftTabId]);
    expect(pane.focusedTabId).toBe(leftTabId);
  });

  it("unfocuses and restores the previous focused pane", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "agent", agentId: "agent-1" },
      intent: "reveal",
    });
    const token = store.unfocusPane(workspaceKey);
    expect(token).toBeTruthy();
    expect(
      workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey]?.focusedPaneId,
    ).toBeNull();

    store.restorePaneFocus(workspaceKey, token!);
    expect(workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey]?.focusedPaneId).toBe(
      "main",
    );
  });

  it("waits for nested focus restorations before restoring", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "agent", agentId: "agent-1" },
      intent: "reveal",
    });
    const outerToken = store.unfocusPane(workspaceKey);
    const innerToken = store.unfocusPane(workspaceKey);

    store.restorePaneFocus(workspaceKey, outerToken!);
    expect(
      workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey]?.focusedPaneId,
    ).toBeNull();

    store.restorePaneFocus(workspaceKey, innerToken!);
    expect(workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey]?.focusedPaneId).toBe(
      "main",
    );
  });

  it("openTab creates distinct draft tabs for repeated Cmd+T/new-tab opens", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    const firstTabId = store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "draft", draftId: "draft-1" },
      intent: "reveal",
    });
    const secondTabId = store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "draft", draftId: "draft-2" },
      intent: "reveal",
    });
    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];

    expect(firstTabId).toBe("draft-1");
    expect(secondTabId).toBe("draft-2");
    expect(firstTabId).not.toBe(secondTabId);
    expect(findPaneById(layout.root, "main")?.tabIds).toEqual([firstTabId, secondTabId]);
    expect(collectContentTabs(layout.root)).toEqual([
      {
        tabId: firstTabId,
        target: { kind: "draft", draftId: "draft-1" },
        createdAt: expect.any(Number),
      },
      {
        tabId: secondTabId,
        target: { kind: "draft", draftId: "draft-2" },
        createdAt: expect.any(Number),
      },
    ]);
  });

  it("hides and shows Explorer without changing its default tabs or split sizes", () => {
    useWorkspaceLayoutIds("88888888-8888-8888-8888-888888888888");
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "draft", draftId: "main-tab" },
      intent: "reveal",
    });
    const paneId = store.showExplorerSidebar(workspaceKey)!;
    store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "working_diff" },
      intent: "reveal",
    });
    const sizes = expectGroup(workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey].root)
      .group.sizes;

    store.hideExplorerSidebar(workspaceKey);
    let layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];
    expect(findPaneById(layout.root, paneId)).toMatchObject({
      hidden: true,
      tabIds: ["files", "changes_tree", "working_diff"],
    });
    expect(expectGroup(layout.root).group.sizes).toEqual(sizes);
    expect(layout.focusedPaneId).toBe("main");

    store.showExplorerSidebar(workspaceKey);
    layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];
    expect(findPaneById(layout.root, paneId)).toMatchObject({
      tabIds: ["files", "changes_tree", "working_diff"],
    });
    expect(findPaneById(layout.root, paneId)?.hidden).toBeUndefined();
    expect(expectGroup(layout.root).group.sizes).toEqual(sizes);
  });

  it("focusTab reveals an Explorer tab without moving workspace focus", () => {
    useWorkspaceLayoutIds("89898989-8989-8989-8989-898989898989");
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "file", path: "/repo/worktree/a.ts" },
      intent: "reveal",
    });
    const targetTabId = store.openTab({
      workspaceKey: workspaceKey,
      target: {
        kind: "terminal",
        terminalId: "term-hidden",
      },
      intent: "reveal",
    })!;
    const paneId = store.showExplorerSidebar(workspaceKey)!;
    store.focusPane(workspaceKey, "main");
    const group = expectGroup(
      workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey].root,
    ).group;
    store.hideExplorerSidebar(workspaceKey);

    store.focusTab(workspaceKey, targetTabId);

    const state = workspaceLayoutStore.getState();
    const layout = state.layoutByWorkspace[workspaceKey];
    expect(layout.focusedPaneId).toBe("main");
    expect(findPaneById(layout.root, paneId)).toMatchObject({
      focusedTabId: targetTabId,
      tabIds: ["files", "changes_tree", "file_/repo/worktree/a.ts", targetTabId],
    });
    expect(findPaneById(layout.root, paneId)?.hidden).toBeUndefined();
    expect(expectGroup(layout.root).group.sizes).toEqual(group.sizes);
  });

  it("convertDraftToAgent replaces the draft tab with a canonical agent tab in the same pane", () => {
    useWorkspaceLayoutIds("12121212-1212-1212-1212-121212121212");
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "file", path: "/repo/worktree/a.ts" },
      intent: "reveal",
    });
    const secondTabId = store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "draft", draftId: "draft-2" },
      intent: "reveal",
    });
    const nextTabId = store.convertDraftToAgent(workspaceKey, secondTabId!, "agent-1");
    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];
    const mainPane = findPaneById(layout.root, "main");
    const convertedTab = collectAllTabs(layout.root).find((tab) => tab.tabId === nextTabId);

    expect(nextTabId).toBe("agent_agent-1");
    expect(mainPane?.tabIds).toEqual(["agent_agent-1"]);
    expect(findPaneContainingTab(layout.root, "agent_agent-1")?.id).toBe("main");
    expect(convertedTab).toEqual({
      tabId: "agent_agent-1",
      target: { kind: "agent", agentId: "agent-1" },
      createdAt: expect.any(Number),
    });
  });

  it("replaceTab keeps a draft tab in place while updating its target", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    const draftTabId = store.openTab({
      workspaceKey: workspaceKey,
      target: {
        kind: "draft",
        draftId: "draft-retarget",
      },
      intent: "reveal",
    });
    const nextTabId = store.replaceTab(workspaceKey, draftTabId!, {
      kind: "file",
      path: "/repo/worktree/retargeted.ts",
    });
    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];

    expect(draftTabId).toBe("draft-retarget");
    expect(nextTabId).toBe(draftTabId);
    expect(findPaneById(layout.root, "main")?.tabIds).toEqual([draftTabId!]);
    expect(collectContentTabs(layout.root)).toEqual([
      {
        tabId: draftTabId!,
        target: { kind: "file", path: "/repo/worktree/retargeted.ts" },
        createdAt: expect.any(Number),
      },
    ]);
  });

  it("replaceTab gives a non-draft tab the new target identity", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    const agentTabId = store.openTab({
      workspaceKey: workspaceKey,
      target: {
        kind: "agent",
        agentId: "agent-retarget",
      },
      intent: "reveal",
    });
    const nextTabId = store.replaceTab(workspaceKey, agentTabId!, {
      kind: "draft",
      draftId: "draft-from-agent",
    });
    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];

    expect(agentTabId).toBe("agent_agent-retarget");
    expect(nextTabId).toBe("draft-from-agent");
    expect(findPaneById(layout.root, "main")?.tabIds).toEqual(["draft-from-agent"]);
    expect(collectContentTabs(layout.root)).toEqual([
      {
        tabId: "draft-from-agent",
        target: { kind: "draft", draftId: "draft-from-agent" },
        createdAt: expect.any(Number),
      },
    ]);
  });

  it("replaceTab keeps a pane-local replacement beside an existing target", () => {
    useWorkspaceLayoutIds("55555555-5555-5555-5555-555555555555");
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    const existingFileTabId = store.openTab({
      workspaceKey: workspaceKey,
      target: {
        kind: "file",
        path: "/repo/worktree/existing.ts",
      },
      intent: "reveal",
    });
    const draftTabId = store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "draft", draftId: "draft-dup" },
      intent: "reveal",
    });
    const secondDraftTabId = store.openTab({
      workspaceKey: workspaceKey,
      target: {
        kind: "draft",
        draftId: "draft-dup-2",
      },
      intent: "reveal",
    });

    const nextTabId = store.replaceTab(workspaceKey, secondDraftTabId!, {
      kind: "file",
      path: "/repo/worktree/existing.ts",
    });
    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];

    expect(existingFileTabId).toBe("file_/repo/worktree/existing.ts");
    expect(draftTabId).toBe("draft-dup");
    expect(nextTabId).not.toBe(existingFileTabId);
    expect(collectContentTabs(layout.root)).toHaveLength(3);
    expect(collectAllTabs(layout.root).filter((tab) => tab.target.kind === "file")).toHaveLength(2);
  });

  it("replaceTab keeps a pane-local replacement beside an existing matching target", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    const firstDraftTabId = store.openTab({
      workspaceKey: workspaceKey,
      target: {
        kind: "draft",
        draftId: "draft-agent-1",
      },
      intent: "reveal",
    });
    const firstAgentTabId = store.replaceTab(workspaceKey, firstDraftTabId!, {
      kind: "agent",
      agentId: "agent-1",
    });
    const secondDraftTabId = store.openTab({
      workspaceKey: workspaceKey,
      target: {
        kind: "draft",
        draftId: "draft-agent-2",
      },
      intent: "reveal",
    });

    const nextTabId = store.replaceTab(workspaceKey, secondDraftTabId!, {
      kind: "agent",
      agentId: "agent-1",
    });
    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];

    expect(firstAgentTabId).toBe(firstDraftTabId);
    expect(nextTabId).not.toBe(firstDraftTabId);
    expect(collectContentTabs(layout.root)).toHaveLength(2);
    expect(collectAllTabs(layout.root).filter((tab) => tab.target.kind === "agent")).toHaveLength(
      2,
    );
  });

  it("focusPane does not turn Explorer into workspace focus", () => {
    useWorkspaceLayoutIds("57575757-5757-5757-5757-575757575757");
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "file", path: "/repo/worktree/a.ts" },
      intent: "reveal",
    });
    const paneId = store.showExplorerSidebar(workspaceKey)!;
    store.focusPane(workspaceKey, "main");
    store.hideExplorerSidebar(workspaceKey);

    store.focusPane(workspaceKey, paneId);

    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];
    expect(layout.focusedPaneId).toBe("main");
    expect(findPaneById(layout.root, paneId)?.hidden).toBe(true);
  });

  it("openTab focuses the existing tab instead of creating a duplicate entry", () => {
    useWorkspaceLayoutIds("abababab-abab-abab-abab-abababababab");
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "file", path: "/repo/worktree/a.ts" },
      intent: "reveal",
    });
    const secondTabId = store.openTab({
      workspaceKey: workspaceKey,
      target: {
        kind: "file",
        path: "/repo/worktree/b.ts",
      },
      intent: "reveal",
    });
    const duplicateTabId = store.openTab({
      workspaceKey: workspaceKey,
      target: {
        kind: "file",
        path: "/repo/worktree/b.ts",
      },
      intent: "reveal",
    });
    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];

    expect(duplicateTabId).toBe(secondTabId);
    expect(collectContentTabs(layout.root).map((tab) => tab.tabId)).toEqual([
      "file_/repo/worktree/a.ts",
      "file_/repo/worktree/b.ts",
    ]);
  });

  it("persists working diff tabs while stripping commit diff tabs", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    store.openTab({
      workspaceKey: workspaceKey,
      target: {
        kind: "working_diff",
        focusPath: "src/a.ts",
      },
      intent: "reveal",
    });
    store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "commit_diff", sha: "abc123" },
      intent: "reveal",
    });

    const partialize = workspaceLayoutStore.persist.getOptions().partialize;
    expect(partialize).toBeTypeOf("function");
    if (!partialize) {
      throw new Error("Workspace layout partialize function is missing");
    }
    const currentState = workspaceLayoutStore.getState();
    const layout = stripEphemeralTabsFromLayout(currentState.layoutByWorkspace[workspaceKey]);
    const persisted = partialize(currentState);

    expect(persisted).toEqual({
      layoutByWorkspace: { [workspaceKey]: layout },
      explorerSidebarWidthByWorkspace: currentState.explorerSidebarWidthByWorkspace,
    });
    expect(layout && collectAllTabs(layout.root).map((tab) => tab.target)).toEqual([
      { kind: "files" },
      { kind: "changes_tree" },
      {
        kind: "working_diff",
        focusPath: "src/a.ts",
      },
    ]);
  });

  it("hydrates duplicate Changes and Pull request instances without collapsing their ids or state", () => {
    const tabs = [
      {
        tabId: "changes-a",
        createdAt: 1,
        target: { kind: "working_diff" },
        state: {
          mode: "base",
          baseRef: "main",
          layout: "split",
          wrapLines: true,
          hideWhitespace: true,
          treeVisible: true,
          treeWidth: 300,
          collapsedFilePaths: ["a"],
          collapsedFolderPaths: ["src"],
          commitsCollapsed: false,
        },
      },
      {
        tabId: "changes-b",
        createdAt: 2,
        target: { kind: "working_diff" },
        state: {
          mode: "uncommitted",
          layout: "unified",
          wrapLines: false,
          hideWhitespace: false,
          treeVisible: false,
          collapsedFilePaths: [],
          collapsedFolderPaths: [],
          commitsCollapsed: true,
        },
      },
      { tabId: "pr-a", createdAt: 3, target: { kind: "pull_request" } },
      { tabId: "pr-b", createdAt: 4, target: { kind: "pull_request" } },
    ];
    const layout = normalizeLayout({
      root: {
        kind: "pane",
        pane: { id: "main", tabIds: tabs.map((tab) => tab.tabId), focusedTabId: "changes-a", tabs },
      },
      focusedPaneId: "main",
    });
    expect(collectAllTabs(layout.root).map((tab) => tab.tabId)).toEqual([
      "changes-a",
      "changes-b",
      "pr-a",
      "pr-b",
    ]);
    expect(
      collectAllTabs(layout.root).find((tab) => tab.tabId === "changes-a")?.state,
    ).toMatchObject({ baseRef: "main", treeWidth: 300, collapsedFolderPaths: ["src"] });
  });

  it("closing the last content tab creates a fresh New tab in the retained pane", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    const tabId = store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "draft", draftId: "draft-1" },
      intent: "reveal",
    });
    store.closeTab(workspaceKey, tabId!);
    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];

    const mainTab = collectAllTabs(layout.root).find(
      (tab) => findPaneContainingTab(layout.root, tab.tabId)?.id === "main",
    );
    expect(mainTab?.target).toEqual({ kind: "new_tab" });
    expect(findPaneById(layout.root, "main")?.focusedTabId).toBe(mainTab?.tabId);
    expect(findPaneById(layout.root, "explorer")?.hidden).toBe(true);
  });

  it("keeps explicitly opened pinned agents in memory per workspace without persisting them", () => {
    const workspaceKey = createWorkspaceKey();
    const otherWorkspaceKey = buildWorkspaceTabPersistenceKey({
      serverId: SERVER_ID,
      workspaceId: "ws-other-worktree",
    });

    expect(otherWorkspaceKey).toBeTruthy();

    const store = workspaceLayoutStore.getState();
    store.openTab({
      workspaceKey,
      target: { kind: "agent", agentId: "agent-1" },
      intent: "reveal",
      pin: true,
    });
    store.openTab({
      workspaceKey: otherWorkspaceKey as string,
      target: { kind: "agent", agentId: "agent-2" },
      intent: "reveal",
      pin: true,
    });

    let state = workspaceLayoutStore.getState();
    expect(Array.from(state.pinnedAgentIdsByWorkspace[workspaceKey] ?? [])).toEqual(["agent-1"]);
    expect(Array.from(state.pinnedAgentIdsByWorkspace[otherWorkspaceKey as string] ?? [])).toEqual([
      "agent-2",
    ]);

    store.unpinAgent(workspaceKey, "agent-1");

    state = workspaceLayoutStore.getState();
    expect(state.pinnedAgentIdsByWorkspace[workspaceKey]).toBeUndefined();
    expect(Array.from(state.pinnedAgentIdsByWorkspace[otherWorkspaceKey as string] ?? [])).toEqual([
      "agent-2",
    ]);

    const partialize = workspaceLayoutStore.persist.getOptions().partialize;
    expect(partialize).toBeTypeOf("function");
    expect(partialize?.(state)).not.toHaveProperty("pinnedAgentIdsByWorkspace");
  });

  it("keeps hidden agent intents in memory per workspace without persisting them", () => {
    const workspaceKey = createWorkspaceKey();
    const otherWorkspaceKey = buildWorkspaceTabPersistenceKey({
      serverId: SERVER_ID,
      workspaceId: "ws-other-worktree",
    });

    expect(otherWorkspaceKey).toBeTruthy();

    const store = workspaceLayoutStore.getState();
    store.hideAgent(workspaceKey, "agent-1");
    store.hideAgent(workspaceKey, "agent-1");
    store.hideAgent(otherWorkspaceKey as string, "agent-2");

    let state = workspaceLayoutStore.getState();
    expect(Array.from(state.hiddenAgentIdsByWorkspace[workspaceKey] ?? [])).toEqual(["agent-1"]);
    expect(Array.from(state.hiddenAgentIdsByWorkspace[otherWorkspaceKey as string] ?? [])).toEqual([
      "agent-2",
    ]);

    store.unhideAgent(workspaceKey, "agent-1");

    state = workspaceLayoutStore.getState();
    expect(state.hiddenAgentIdsByWorkspace[workspaceKey]).toBeUndefined();
    expect(Array.from(state.hiddenAgentIdsByWorkspace[otherWorkspaceKey as string] ?? [])).toEqual([
      "agent-2",
    ]);

    const partialize = workspaceLayoutStore.persist.getOptions().partialize;
    expect(partialize).toBeTypeOf("function");
    expect(partialize?.(state)).toEqual({
      layoutByWorkspace: {},
      explorerSidebarWidthByWorkspace: {},
    });
  });

  it("convertDraftToAgent removes the draft and focuses the existing canonical agent tab", () => {
    useWorkspaceLayoutIds("67676767-6767-6767-6767-676767676767");
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    const draftTabId = store.openTab({
      workspaceKey: workspaceKey,
      target: {
        kind: "draft",
        draftId: "draft-existing",
      },
      intent: "reveal",
    });
    const agentTabId = store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "agent", agentId: "agent-1" },
      intent: "reveal",
    });
    expect(agentTabId).toBe("agent_agent-1");

    const nextTabId = store.convertDraftToAgent(workspaceKey, draftTabId!, "agent-1");
    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];

    expect(nextTabId).toBe("agent_agent-1");
    expect(collectContentTabs(layout.root).map((tab) => tab.tabId)).toEqual(["agent_agent-1"]);
    expect(layout.focusedPaneId).toBe("main");
    expect(findPaneContainingTab(layout.root, "agent_agent-1")?.id).toBe("main");
  });

  it("reconcileTabs canonicalizes duplicates and prunes stale entity tabs from hydrated snapshots", () => {
    const workspaceKey = createWorkspaceKey();

    workspaceLayoutStore.setState((state) => ({
      ...state,
      layoutByWorkspace: {
        ...state.layoutByWorkspace,
        [workspaceKey]: {
          root: {
            kind: "pane",
            pane: {
              id: "main",
              tabIds: ["draft_agent", "agent_agent-1", "terminal_orphan", "draft-1"],
              focusedTabId: "draft_agent",
              tabs: [
                {
                  tabId: "draft_agent",
                  target: { kind: "agent", agentId: "agent-1" },
                  createdAt: 1,
                },
                {
                  tabId: "agent_agent-1",
                  target: { kind: "agent", agentId: "agent-1" },
                  createdAt: 2,
                },
                {
                  tabId: "terminal_orphan",
                  target: { kind: "terminal", terminalId: "term-stale" },
                  createdAt: 3,
                },
                {
                  tabId: "draft-1",
                  target: { kind: "draft", draftId: "draft-1" },
                  createdAt: 4,
                },
              ],
            } as SplitPane,
          },
          focusedPaneId: "main",
        },
      },
      pinnedAgentIdsByWorkspace: {
        [workspaceKey]: new Set<string>(["agent-2"]),
      },
    }));

    workspaceLayoutStore.getState().reconcileTabs(workspaceKey, {
      agentsHydrated: true,
      terminalsHydrated: true,
      activeAgentIds: ["agent-1"],
      autoOpenAgentIds: ["agent-1"],
      knownAgentIds: ["agent-1", "agent-2"],
      standaloneTerminalIds: ["term-1"],
      hasActivePendingDraftCreate: false,
    });

    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];
    const tabs = collectAllTabs(layout.root);

    expect(tabs.map((tab) => tab.tabId)).toEqual([
      "agent_agent-1",
      "draft-1",
      "agent_agent-2",
      "terminal_term-1",
    ]);
    expect(tabs.find((tab) => tab.tabId === "agent_agent-1")).toEqual({
      tabId: "agent_agent-1",
      target: { kind: "agent", agentId: "agent-1" },
      createdAt: 2,
    });
    expect(layout.focusedPaneId).toBe("main");
    expect(findPaneById(layout.root, "main")?.focusedTabId).toBe("agent_agent-1");
  });

  it("reconcileTabs preserves a draft-origin agent tab id when there is no duplicate", () => {
    const workspaceKey = createWorkspaceKey();

    workspaceLayoutStore.setState((state) => ({
      ...state,
      layoutByWorkspace: {
        ...state.layoutByWorkspace,
        [workspaceKey]: {
          root: {
            kind: "pane",
            pane: {
              id: "main",
              tabIds: ["draft-agent"],
              focusedTabId: "draft-agent",
              tabs: [
                {
                  tabId: "draft-agent",
                  target: { kind: "agent", agentId: "agent-1" },
                  createdAt: 1,
                },
              ],
            } as SplitPane,
          },
          focusedPaneId: "main",
        },
      },
    }));

    workspaceLayoutStore.getState().reconcileTabs(workspaceKey, {
      agentsHydrated: true,
      terminalsHydrated: true,
      activeAgentIds: ["agent-1"],
      autoOpenAgentIds: ["agent-1"],
      knownAgentIds: ["agent-1"],
      standaloneTerminalIds: [],
      hasActivePendingDraftCreate: false,
    });

    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];

    expect(collectContentTabs(layout.root)).toEqual([
      {
        tabId: "draft-agent",
        target: { kind: "agent", agentId: "agent-1" },
        createdAt: 1,
      },
    ]);
    expect(findPaneById(layout.root, "main")?.focusedTabId).toBe("draft-agent");
  });

  it("reconcileTabs does not re-add locally hidden agent tabs", () => {
    const workspaceKey = createWorkspaceKey();

    workspaceLayoutStore.setState((state) => ({
      ...state,
      hiddenAgentIdsByWorkspace: {
        [workspaceKey]: new Set<string>(["agent-1"]),
      },
    }));

    workspaceLayoutStore.getState().reconcileTabs(workspaceKey, {
      agentsHydrated: true,
      terminalsHydrated: true,
      activeAgentIds: ["agent-1"],
      autoOpenAgentIds: ["agent-1"],
      knownAgentIds: ["agent-1"],
      standaloneTerminalIds: [],
      hasActivePendingDraftCreate: false,
    });

    expect(contentTabs(workspaceLayoutStore.getState().getWorkspaceTabs(workspaceKey))).toEqual([]);
  });

  it("reconcileTabs lands on an existing agent instead of the initial New tab", () => {
    const workspaceKey = createWorkspaceKey();

    workspaceLayoutStore.getState().reconcileTabs(workspaceKey, {
      agentsHydrated: true,
      terminalsHydrated: true,
      activeAgentIds: ["agent-1"],
      autoOpenAgentIds: ["agent-1"],
      knownAgentIds: ["agent-1"],
      standaloneTerminalIds: [],
      hasActivePendingDraftCreate: false,
    });

    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];
    expect(findPaneById(layout.root, "main")?.tabIds).toEqual(["agent_agent-1"]);
    expect(findPaneById(layout.root, "main")?.focusedTabId).toBe("agent_agent-1");
  });

  it("reconcileTabs lands on a draft when the hydrated workspace is empty", () => {
    const workspaceKey = createWorkspaceKey();

    workspaceLayoutStore.getState().reconcileTabs(workspaceKey, {
      agentsHydrated: true,
      terminalsHydrated: true,
      activeAgentIds: [],
      autoOpenAgentIds: [],
      knownAgentIds: [],
      knownTerminalIds: [],
      standaloneTerminalIds: [],
      hasActivePendingDraftCreate: false,
    });

    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];
    const mainTab = collectAllTabs(layout.root).find(
      (tab) => findPaneContainingTab(layout.root, tab.tabId)?.id === "main",
    );
    expect(mainTab?.target.kind).toBe("draft");
    expect(findPaneById(layout.root, "main")?.focusedTabId).toBe(mainTab?.tabId);
  });

  it("reconcileTabs does not auto-open subagents omitted from autoOpenAgentIds", () => {
    const workspaceKey = createWorkspaceKey();

    workspaceLayoutStore.getState().reconcileTabs(workspaceKey, {
      agentsHydrated: true,
      terminalsHydrated: true,
      activeAgentIds: ["parent-agent", "child-agent"],
      autoOpenAgentIds: ["parent-agent"],
      knownAgentIds: ["parent-agent", "child-agent"],
      standaloneTerminalIds: [],
      hasActivePendingDraftCreate: false,
    });

    expect(
      contentTabs(workspaceLayoutStore.getState().getWorkspaceTabs(workspaceKey)).map(
        (tab) => tab.tabId,
      ),
    ).toEqual(["agent_parent-agent"]);
  });

  it("reconcileTabs keeps manually opened subagent tabs that remain active", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "agent", agentId: "child-agent" },
      intent: "reveal",
    });

    store.reconcileTabs(workspaceKey, {
      agentsHydrated: true,
      terminalsHydrated: true,
      activeAgentIds: ["parent-agent", "child-agent"],
      autoOpenAgentIds: ["parent-agent"],
      knownAgentIds: ["parent-agent", "child-agent"],
      standaloneTerminalIds: [],
      hasActivePendingDraftCreate: false,
    });

    expect(
      contentTabs(workspaceLayoutStore.getState().getWorkspaceTabs(workspaceKey)).map(
        (tab) => tab.tabId,
      ),
    ).toEqual(["agent_child-agent", "agent_parent-agent"]);
  });

  it("reconcileTabs prunes archived subagent tabs that are no longer active", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "agent", agentId: "child-agent" },
      intent: "reveal",
    });

    store.reconcileTabs(workspaceKey, {
      agentsHydrated: true,
      terminalsHydrated: true,
      activeAgentIds: ["parent-agent"],
      autoOpenAgentIds: ["parent-agent"],
      knownAgentIds: ["parent-agent", "child-agent"],
      standaloneTerminalIds: [],
      hasActivePendingDraftCreate: false,
    });

    expect(
      contentTabs(workspaceLayoutStore.getState().getWorkspaceTabs(workspaceKey)).map(
        (tab) => tab.tabId,
      ),
    ).toEqual(["agent_parent-agent"]);
  });

  it("openTab reveal intent reopens hidden subagent tabs and clears hidden intent", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    store.hideAgent(workspaceKey, "child-agent");
    store.reconcileTabs(workspaceKey, {
      agentsHydrated: true,
      terminalsHydrated: true,
      activeAgentIds: ["child-agent"],
      autoOpenAgentIds: [],
      knownAgentIds: ["child-agent"],
      standaloneTerminalIds: [],
      hasActivePendingDraftCreate: false,
    });

    expect(contentTabs(workspaceLayoutStore.getState().getWorkspaceTabs(workspaceKey))).toEqual([]);

    store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "agent", agentId: "child-agent" },
      intent: "reveal",
    });

    const state = workspaceLayoutStore.getState();
    expect(state.hiddenAgentIdsByWorkspace[workspaceKey]).toBeUndefined();
    expect(contentTabs(state.getWorkspaceTabs(workspaceKey)).map((tab) => tab.tabId)).toEqual([
      "agent_child-agent",
    ]);
  });

  it("reconcileTabs auto-opens only standalone terminals while keeping explicitly opened live terminals", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    const scriptTabId = store.openTab({
      workspaceKey: workspaceKey,
      target: {
        kind: "terminal",
        terminalId: "term-script",
      },
      intent: "reveal",
    });

    store.reconcileTabs(workspaceKey, {
      agentsHydrated: true,
      terminalsHydrated: true,
      activeAgentIds: [],
      autoOpenAgentIds: [],
      knownAgentIds: [],
      knownTerminalIds: ["term-script", "term-manual"],
      standaloneTerminalIds: ["term-manual"],
      hasActivePendingDraftCreate: false,
    });

    const tabs = contentTabs(workspaceLayoutStore.getState().getWorkspaceTabs(workspaceKey));
    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];
    expect(tabs.map((tab) => tab.tabId)).toEqual(["terminal_term-script", "terminal_term-manual"]);
    expect(findPaneById(layout.root, "explorer")?.focusedTabId).toBe(scriptTabId);
  });

  it("reconcileTabs does not auto-open live non-standalone terminals", () => {
    const workspaceKey = createWorkspaceKey();

    workspaceLayoutStore.getState().reconcileTabs(workspaceKey, {
      agentsHydrated: true,
      terminalsHydrated: true,
      activeAgentIds: [],
      autoOpenAgentIds: [],
      knownAgentIds: [],
      knownTerminalIds: ["term-script"],
      standaloneTerminalIds: [],
      hasActivePendingDraftCreate: false,
    });

    expect(contentTabs(workspaceLayoutStore.getState().getWorkspaceTabs(workspaceKey))).toEqual([]);
  });

  it("explicitly opening an agent tab clears hidden intent", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    store.hideAgent(workspaceKey, "agent-1");
    store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "agent", agentId: "agent-1" },
      intent: "reveal",
    });

    const state = workspaceLayoutStore.getState();
    expect(state.hiddenAgentIdsByWorkspace[workspaceKey]).toBeUndefined();
    expect(contentTabs(state.getWorkspaceTabs(workspaceKey)).map((tab) => tab.tabId)).toEqual([
      "agent_agent-1",
    ]);
  });

  it("opening a pinned agent clears hidden intent", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    store.hideAgent(workspaceKey, "agent-1");
    expect(workspaceLayoutStore.getState().hiddenAgentIdsByWorkspace[workspaceKey]).toBeDefined();

    store.openTab({
      workspaceKey,
      target: { kind: "agent", agentId: "agent-1" },
      intent: "reveal",
      pin: true,
    });

    const state = workspaceLayoutStore.getState();
    expect(state.hiddenAgentIdsByWorkspace[workspaceKey]).toBeUndefined();
    expect(Array.from(state.pinnedAgentIdsByWorkspace[workspaceKey] ?? [])).toEqual(["agent-1"]);
  });

  it("keeps an explicitly pinned archived agent before its detail is hydrated", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "agent", agentId: "archived-agent" },
      intent: "reveal",
      pin: true,
    });
    store.reconcileTabs(workspaceKey, {
      agentsHydrated: true,
      terminalsHydrated: true,
      activeAgentIds: [],
      autoOpenAgentIds: [],
      knownAgentIds: [],
      standaloneTerminalIds: [],
    });

    expect(
      store
        .getWorkspaceTabs(workspaceKey)
        .filter((tab) => tab.target.kind === "agent")
        .map((tab) => tab.tabId),
    ).toEqual(["agent_archived-agent"]);

    store.reconcileTabs(workspaceKey, {
      agentsHydrated: true,
      terminalsHydrated: true,
      activeAgentIds: [],
      autoOpenAgentIds: [],
      knownAgentIds: [],
      standaloneTerminalIds: [],
    });

    expect(
      store
        .getWorkspaceTabs(workspaceKey)
        .filter((tab) => tab.target.kind === "agent")
        .map((tab) => tab.tabId),
    ).toEqual(["agent_archived-agent"]);

    store.resolvePendingAgent(workspaceKey, "archived-agent");
    store.reconcileTabs(workspaceKey, {
      agentsHydrated: true,
      terminalsHydrated: true,
      activeAgentIds: [],
      autoOpenAgentIds: [],
      knownAgentIds: [],
      standaloneTerminalIds: [],
    });

    expect(
      store
        .getWorkspaceTabs(workspaceKey)
        .filter((tab) => tab.target.kind === "agent")
        .map((tab) => tab.tabId),
    ).toEqual([]);

    store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "agent", agentId: "archived-agent" },
      intent: "reveal",
      pin: true,
    });
    store.reconcileTabs(workspaceKey, {
      agentsHydrated: true,
      terminalsHydrated: true,
      activeAgentIds: [],
      autoOpenAgentIds: [],
      knownAgentIds: [],
      standaloneTerminalIds: [],
    });

    expect(
      store
        .getWorkspaceTabs(workspaceKey)
        .filter((tab) => tab.target.kind === "agent")
        .map((tab) => tab.tabId),
    ).toEqual(["agent_archived-agent"]);
  });

  it("atomically reveals, focuses, and pins an archived agent against reconciliation", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();
    store.openTab({
      workspaceKey,
      target: { kind: "agent", agentId: "first-agent" },
      intent: "reveal",
    });
    store.openTab({
      workspaceKey,
      target: { kind: "agent", agentId: "second-agent" },
      intent: "reveal",
    });
    store.hideAgent(workspaceKey, "archived-agent");

    const archivedTabId = store.openTab({
      workspaceKey,
      target: { kind: "agent", agentId: "archived-agent" },
      intent: "reveal",
      pin: true,
    });
    store.reconcileTabs(workspaceKey, {
      agentsHydrated: true,
      terminalsHydrated: true,
      activeAgentIds: ["first-agent", "second-agent"],
      autoOpenAgentIds: ["first-agent", "second-agent"],
      knownAgentIds: ["first-agent", "second-agent"],
      standaloneTerminalIds: [],
    });

    const state = workspaceLayoutStore.getState();
    const layout = state.layoutByWorkspace[workspaceKey];
    expect(contentTabs(state.getWorkspaceTabs(workspaceKey)).map((tab) => tab.tabId)).toContain(
      archivedTabId,
    );
    expect(findPaneById(layout.root, layout.focusedPaneId)?.focusedTabId).toBe(archivedTabId);
    expect(Array.from(state.pinnedAgentIdsByWorkspace[workspaceKey] ?? [])).toContain(
      "archived-agent",
    );
    expect(state.hiddenAgentIdsByWorkspace[workspaceKey]).toBeUndefined();
  });

  it("retargeting a tab to an agent clears hidden intent", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();

    store.hideAgent(workspaceKey, "agent-1");
    const tabId = store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "file", path: "/repo/worktree/a.ts" },
      intent: "reveal",
    });
    store.replaceTab(workspaceKey, tabId!, { kind: "agent", agentId: "agent-1" });

    const state = workspaceLayoutStore.getState();
    expect(state.hiddenAgentIdsByWorkspace[workspaceKey]).toBeUndefined();
  });

  it("closing Files leaves Changes available in Explorer", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();
    store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "agent", agentId: "kept" },
      intent: "reveal",
    });
    const paneId = store.showExplorerSidebar(workspaceKey) as string;
    const filesTabId = store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "files" },
      intent: "reveal",
      placement: { mode: "pane", paneId },
    }) as string;

    store.closeTab(workspaceKey, filesTabId);

    let layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];
    const hiddenPane = findPaneById(layout.root, paneId);
    expect(hiddenPane?.hidden).toBeUndefined();
    expect(hiddenPane?.tabIds).toHaveLength(1);
    expect(
      collectAllTabs(layout.root).find((tab) => tab.tabId === hiddenPane?.focusedTabId)?.target,
    ).toEqual({ kind: "changes_tree" });
    expect(collectAllPanes(layout.root).map((pane) => pane.id)).toEqual(["main", paneId]);

    expect(store.showExplorerSidebar(workspaceKey)).toBe(paneId);
    layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];
    expect(findPaneById(layout.root, paneId)?.tabIds).toEqual(hiddenPane?.tabIds);
    expect(findPaneById(layout.root, paneId)?.hidden).toBeUndefined();
  });

  it("closing one of several Explorer tabs leaves the sidebar visible", () => {
    const workspaceKey = createWorkspaceKey();
    const store = workspaceLayoutStore.getState();
    store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "agent", agentId: "kept" },
      intent: "reveal",
    });
    const paneId = store.showExplorerSidebar(workspaceKey) as string;
    const filesTabId = store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "files" },
      intent: "reveal",
      placement: { mode: "pane", paneId },
    }) as string;
    store.openTab({
      workspaceKey: workspaceKey,
      target: { kind: "working_diff" },
      intent: "reveal",
      placement: { mode: "pane", paneId },
    });

    store.closeTab(workspaceKey, filesTabId);

    const layout = workspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];
    expect(findPaneById(layout.root, paneId)?.hidden).toBeUndefined();
    expect(findPaneById(layout.root, paneId)?.tabIds).toEqual(["changes_tree", "working_diff"]);
  });
});
