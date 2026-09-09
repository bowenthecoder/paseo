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

import { findPaneById } from "@/stores/workspace-layout-actions";
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
    expect(findPaneById(layout.root, "explorer")).toMatchObject({
      focusedTabId: rightId,
    });
    expect(findPaneById(layout.root, "explorer")?.hidden).not.toBe(true);
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
    expect(findPaneById(restoredLayout.root, "explorer")?.focusedTabId).toBe(rightId);
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
    expect(useWorkspaceLayoutStore.getState().layoutByWorkspace[key]).toBe(layout);
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
