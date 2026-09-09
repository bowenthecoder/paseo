import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => new Map<string, string>());
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => storage.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      storage.set(key, value);
    },
    removeItem: async (key: string) => {
      storage.delete(key);
    },
  },
}));

import {
  collectChatPanes,
  collectAllTabs,
  findPaneById,
  findPaneContainingTab,
} from "@/stores/workspace-layout-actions";
import {
  createWorkspaceLayoutStore,
  useWorkspaceLayoutStore,
} from "@/stores/workspace-layout-store";
import type { Agent } from "@/stores/session-store";
import { deriveWorkspaceAgentVisibility } from "@/workspace-tabs/agent-visibility";
import { normalizeWorkspaceTabTarget } from "@/workspace-tabs/identity";
import { openSidebarChatInSplitView, resolveChatSplitAvailability } from "./chat-split-view";

const active = { serverId: "split-host", workspaceId: "left-folder" };
const key = `${active.serverId}:${active.workspaceId}`;

function openMain(agentId = "left-chat") {
  return useWorkspaceLayoutStore.getState().openTab({
    workspaceKey: key,
    target: { kind: "agent", agentId },
    intent: "reveal",
  });
}

function openSplit(agentId = "right-chat") {
  return openSidebarChatInSplitView({
    active,
    serverId: active.serverId,
    agentId,
    isCompact: false,
  });
}

function makeAgent(id: string, workspaceId: string, parentAgentId: string | null = null): Agent {
  return {
    id,
    workspaceId,
    cwd: `/${workspaceId}`,
    parentAgentId,
    archivedAt: null,
  } as Agent;
}

describe("explicit sidebar chat split", () => {
  beforeEach(async () => {
    storage.clear();
    await useWorkspaceLayoutStore.persist.rehydrate();
    useWorkspaceLayoutStore.setState({
      layoutByWorkspace: {},
      pinnedAgentIdsByWorkspace: {},
      pendingAgentIdsByWorkspace: {},
      hiddenAgentIdsByWorkspace: {},
      focusRestorationByWorkspace: {},
    });
  });

  it("keeps the selected chat on the left and restores the explicit right chat after hydration", async () => {
    const leftId = openMain();
    const rightId = openSplit();
    expect(rightId).toBeTruthy();
    expect(openSplit()).toBe(rightId);
    const layout = useWorkspaceLayoutStore.getState().layoutByWorkspace[key];
    expect(findPaneById(layout.root, "main")?.focusedTabId).toBe(leftId);
    expect(findPaneById(layout.root, "chat-2")).toMatchObject({
      focusedTabId: rightId,
    });
    expect(findPaneById(layout.root, "chat-2")?.hidden).not.toBe(true);
    expect(layout.parentTabIdByTabId?.[rightId!]).toBe(leftId);

    const restored = createWorkspaceLayoutStore();
    await restored.persist.rehydrate();
    const restoredTabs = restored.getState().getWorkspaceTabs(key);
    expect(restoredTabs.find((tab) => tab.tabId === rightId)?.target).toEqual({
      kind: "agent",
      agentId: "right-chat",
      view: "split",
    });
    const restoredLayout = restored.getState().layoutByWorkspace[key];
    expect(findPaneById(restoredLayout.root, "main")?.focusedTabId).toBe(leftId);
    expect(findPaneById(restoredLayout.root, "chat-2")?.focusedTabId).toBe(rightId);
  });

  it("migrates a selected version-three dock chat into a grid cell without opening unrelated tools", async () => {
    const mainId = openMain();
    const splitId = openSplit();
    const layout = useWorkspaceLayoutStore.getState().layoutByWorkspace[key];
    const side = findPaneById(layout.root, "explorer")!;
    const split = useWorkspaceLayoutStore
      .getState()
      .getWorkspaceTabs(key)
      .find((tab) => tab.tabId === splitId)!;
    const sideTabs = [...collectAllTabs({ kind: "pane", pane: side }), split];
    storage.set(
      "workspace-layout-state",
      JSON.stringify({
        version: 3,
        state: {
          layoutByWorkspace: {
            [key]: {
              root: {
                kind: "group",
                group: {
                  id: "workspace-root",
                  direction: "horizontal",
                  sizes: [0.5, 0.5],
                  children: [
                    { kind: "pane", pane: findPaneById(layout.root, "main") },
                    {
                      kind: "pane",
                      pane: {
                        ...side,
                        hidden: false,
                        tabs: sideTabs,
                        tabIds: sideTabs.map((tab) => tab.tabId),
                        focusedTabId: splitId,
                      },
                    },
                  ],
                },
              },
              focusedPaneId: "main",
              parentTabIdByTabId: layout.parentTabIdByTabId,
            },
          },
        },
      }),
    );
    const restored = createWorkspaceLayoutStore();
    await restored.persist.rehydrate();
    const updated = restored.getState().layoutByWorkspace[key];
    expect(findPaneById(updated.root, "main")?.focusedTabId).toBe(mainId);
    expect(findPaneById(updated.root, "chat-2")?.focusedTabId).toBe(splitId);
    expect(findPaneById(updated.root, "explorer")?.hidden).toBe(true);
  });

  it("moves an already-open sibling to the right without duplicating its view", () => {
    const rightId = openMain("right-chat");
    const leftId = openMain();
    expect(openSplit()).toBe(rightId);
    const store = useWorkspaceLayoutStore.getState();
    const tabs = store.getWorkspaceTabs(key);
    expect(tabs.filter((tab) => tab.target.kind === "agent")).toHaveLength(2);
    expect(findPaneById(store.layoutByWorkspace[key].root, "main")?.focusedTabId).toBe(leftId);

    // Choosing Current view clears the explicit split placement, retaining the same chat view.
    useWorkspaceLayoutStore.getState().focusPane(key, "main");
    expect(openMain("right-chat")).toBe(rightId);
    const updated = useWorkspaceLayoutStore.getState();
    expect(findPaneById(updated.layoutByWorkspace[key].root, "main")?.focusedTabId).toBe(rightId);
    expect(updated.getWorkspaceTabs(key).find((tab) => tab.tabId === rightId)?.target).toEqual({
      kind: "agent",
      agentId: "right-chat",
    });
  });

  it("retains an explicitly split chat and its tasks from another folder without auto-opening other chats", () => {
    const left = makeAgent("left-chat", active.workspaceId);
    const right = makeAgent("right-chat", "right-folder");
    const child = makeAgent("right-task", "task-folder", right.id);
    const unrelated = makeAgent("unrelated", "unrelated-folder");
    const agents = new Map([left, right, child, unrelated].map((agent) => [agent.id, agent]));
    const visibility = deriveWorkspaceAgentVisibility({
      workspaceId: active.workspaceId,
      sessionAgents: agents,
      splitAgentIds: [right.id],
    });
    expect(visibility.knownAgentIds).toEqual(new Set([left.id, right.id, child.id]));
    expect(visibility.activeAgentIds).toEqual(new Set([left.id, right.id, child.id]));
    expect(visibility.autoOpenAgentIds).toEqual(new Set([left.id]));

    openMain();
    const rightId = openSplit();
    const snapshot = {
      ...visibility,
      agentsHydrated: true,
      terminalsHydrated: true,
      standaloneTerminalIds: [],
    };
    useWorkspaceLayoutStore.getState().reconcileTabs(key, snapshot);
    expect(
      useWorkspaceLayoutStore
        .getState()
        .getWorkspaceTabs(key)
        .map((tab) => tab.tabId),
    ).toContain(rightId);

    agents.delete(right.id);
    agents.delete(child.id);
    useWorkspaceLayoutStore.getState().resolvePendingAgent(key, right.id);
    useWorkspaceLayoutStore.getState().reconcileTabs(key, {
      ...snapshot,
      ...deriveWorkspaceAgentVisibility({
        workspaceId: active.workspaceId,
        sessionAgents: agents,
        splitAgentIds: [right.id],
      }),
    });
    expect(
      useWorkspaceLayoutStore
        .getState()
        .getWorkspaceTabs(key)
        .map((tab) => tab.tabId),
    ).not.toContain(rightId);
  });

  it("does not turn an archived split chat back into an active chat", () => {
    const archived = { ...makeAgent("archived", "other-folder"), archivedAt: new Date() };
    const visibility = deriveWorkspaceAgentVisibility({
      workspaceId: active.workspaceId,
      sessionAgents: undefined,
      agentDetails: new Map([[archived.id, archived]]),
      splitAgentIds: [archived.id],
    });
    expect(visibility.knownAgentIds).toEqual(new Set([archived.id]));
    expect(visibility.activeAgentIds.size).toBe(0);
    expect(visibility.autoOpenAgentIds.size).toBe(0);
  });

  it("explains unavailable splits and never moves the current chat or mixes devices", () => {
    openMain();
    const layout = useWorkspaceLayoutStore.getState().layoutByWorkspace[key];
    const base = {
      active,
      serverId: active.serverId,
      agentId: "right-chat",
      isCompact: false,
      layout,
    };
    expect(resolveChatSplitAvailability({ ...base, serverId: "another-device" })).toEqual({
      available: false,
      reason: "Split view requires chats on the same device.",
    });
    expect(resolveChatSplitAvailability({ ...base, agentId: "left-chat" })).toMatchObject({
      available: false,
    });
    expect(resolveChatSplitAvailability({ ...base, isCompact: true })).toMatchObject({
      available: false,
    });
    expect(resolveChatSplitAvailability({ ...base, active: null })).toMatchObject({
      available: false,
    });
    expect(openSplit("left-chat")).toBeNull();
    expect(useWorkspaceLayoutStore.getState().layoutByWorkspace[key]).toEqual(layout);
  });

  it("keeps four independent chat views, refuses a fifth and preserves focus and state across reload", async () => {
    const main = openMain();
    const second = openSplit("second");
    const third = openSplit("third");
    const fourth = openSplit("fourth");
    const store = useWorkspaceLayoutStore.getState();
    expect(
      collectChatPanes(store.layoutByWorkspace[key].root).map((pane) => pane.focusedTabId),
    ).toEqual([main, second, third, fourth]);
    expect(openSplit("fifth")).toBeNull();
    store.setTabState(key, second!, { draftText: "second draft" });
    store.setTabState(key, third!, { draftText: "third draft" });
    store.focusPane(key, "chat-3");
    const restored = createWorkspaceLayoutStore();
    await restored.persist.rehydrate();
    const layout = restored.getState().layoutByWorkspace[key];
    expect(collectChatPanes(layout.root).map((pane) => pane.id)).toEqual([
      "main",
      "chat-2",
      "chat-3",
      "chat-4",
    ]);
    expect(layout.focusedPaneId).toBe("chat-3");
    expect(
      restored
        .getState()
        .getWorkspaceTabs(key)
        .find((tab) => tab.tabId === second)?.state,
    ).toEqual({ draftText: "second draft" });
    expect(
      restored
        .getState()
        .getWorkspaceTabs(key)
        .find((tab) => tab.tabId === third)?.state,
    ).toEqual({ draftText: "third draft" });
    const file = restored.getState().openTab({
      workspaceKey: key,
      target: { kind: "file", path: "/third/guide.md" },
      intent: "reveal",
      parentTabId: third!,
    });
    expect(findPaneContainingTab(restored.getState().layoutByWorkspace[key].root, file!)?.id).toBe(
      "explorer",
    );
    expect(
      collectChatPanes(restored.getState().layoutByWorkspace[key].root).map(
        (pane) => pane.focusedTabId,
      ),
    ).toEqual([main, second, third, fourth]);
    restored.getState().closeTab(key, fourth!);
    expect(collectChatPanes(restored.getState().layoutByWorkspace[key].root)).toHaveLength(3);
    expect(
      restored
        .getState()
        .getWorkspaceTabs(key)
        .some((tab) => tab.tabId === third),
    ).toBe(true);
  });

  it("fills empty grid slots after focusing a file and closes panes without discarding chats", () => {
    const main = openMain();
    const store = useWorkspaceLayoutStore.getState();
    store.addChatPane(key);
    store.addChatPane(key);
    store.addChatPane(key);
    const second = openSplit("second");
    expect(second).toBe("agent_second");
    store.openTab({
      workspaceKey: key,
      target: { kind: "file", path: "/guide.md" },
      intent: "reveal",
      parentTabId: second!,
    });
    store.focusPane(key, "explorer");
    const third = openSplit("third");
    expect(third).toBe("agent_third");
    store.setTabState(key, second!, { draft: "keep this" });
    store.closeChatPane(key, "chat-2");
    const layout = useWorkspaceLayoutStore.getState().layoutByWorkspace[key];
    expect(findPaneById(layout.root, "chat-2")).toBeNull();
    expect(findPaneById(layout.root, "main")?.focusedTabId).toBe(main);
    expect(
      useWorkspaceLayoutStore
        .getState()
        .getWorkspaceTabs(key)
        .find((tab) => tab.tabId === second)?.state,
    ).toEqual({ draft: "keep this" });
    store.closeChatPane(key, "main");
    const promoted = useWorkspaceLayoutStore.getState().layoutByWorkspace[key];
    expect(findPaneById(promoted.root, "main")?.focusedTabId).toBe(third);
    expect(
      useWorkspaceLayoutStore
        .getState()
        .getWorkspaceTabs(key)
        .map((tab) => tab.tabId),
    ).toContain(main);
  });

  it("keeps surviving chat positions stable when reusing a closed middle slot", async () => {
    openMain();
    openSplit("second");
    openSplit("third");
    openSplit("fourth");
    const store = useWorkspaceLayoutStore.getState();
    store.closeChatPane(key, "chat-2");
    expect(store.addChatPane(key)).toBe("chat-2");
    expect(openSplit("replacement")).toBe("agent_replacement");
    const order = ["main", "chat-3", "chat-4", "chat-2"];
    expect(
      collectChatPanes(useWorkspaceLayoutStore.getState().layoutByWorkspace[key].root).map(
        (pane) => pane.id,
      ),
    ).toEqual(order);
    store.focusPane(key, "chat-3");
    const restored = createWorkspaceLayoutStore();
    await restored.persist.rehydrate();
    expect(
      collectChatPanes(restored.getState().layoutByWorkspace[key].root).map((pane) => pane.id),
    ).toEqual(order);
    expect(
      resolveChatSplitAvailability({
        active,
        serverId: active.serverId,
        agentId: "second",
        isCompact: false,
        layout: restored.getState().layoutByWorkspace[key],
      }),
    ).toEqual({
      available: false,
      reason: "Four chat views are already open. Close a view first.",
    });
  });

  it("opens a pane-local draft and converts it to an agent without stealing another chat", () => {
    const main = openMain();
    const store = useWorkspaceLayoutStore.getState();
    expect(store.addChatPane(key)).toBe("chat-2");
    const draft = store.openTab({
      workspaceKey: key,
      target: {
        kind: "draft",
        draftId: "second-draft",
        setup: {
          provider: "codex",
          cwd: "/second-folder",
          modeId: null,
          model: "gpt-5",
          thinkingOptionId: null,
          featureValues: {},
        },
      },
      intent: "new",
      placement: { mode: "pane", paneId: "chat-2" },
    });
    expect(
      findPaneContainingTab(useWorkspaceLayoutStore.getState().layoutByWorkspace[key].root, draft!)
        ?.id,
    ).toBe("chat-2");
    const agent = store.convertDraftToAgent(key, draft!, "second-agent");
    const layout = useWorkspaceLayoutStore.getState().layoutByWorkspace[key];
    expect(findPaneById(layout.root, "main")?.focusedTabId).toBe(main);
    expect(findPaneById(layout.root, "chat-2")?.focusedTabId).toBe(agent);
    expect(layout.focusedPaneId).toBe("chat-2");
  });

  it("keeps old root targets unchanged while preserving an explicit split marker", () => {
    expect(normalizeWorkspaceTabTarget({ kind: "agent", agentId: " root " })).toEqual({
      kind: "agent",
      agentId: "root",
    });
    expect(
      normalizeWorkspaceTabTarget({ kind: "agent", agentId: " right ", view: "split" }),
    ).toEqual({ kind: "agent", agentId: "right", view: "split" });
  });
});
