import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildWorkspaceTabSnapshot,
  deriveWorkspaceAgentVisibility,
  type WorkspaceAgentVisibility,
} from "@/workspace-tabs/agent-visibility";
import { buildWorkspaceTabPersistenceKey } from "@/workspace-tabs/model";
import { selectSubagentsForParent } from "@/subagents/select";
import {
  useWorkspaceLayoutStore,
  findPaneById,
  flattenLayoutToSingleChat,
  DEFAULT_PANE_ID,
  EXPLORER_SIDEBAR_PANE_ID,
} from "./workspace-layout-store";
import { useSessionStore, type Agent } from "./session-store";
import { resolveWorkspaceTargetHost } from "@/workspace-tabs/target-host";
import { resolveClientSlashCommand } from "@/client-slash-commands";
import {
  executeAgentClientCommand,
  type ExecuteAgentClientCommandInput,
} from "@/client-slash-commands/execute";
import {
  navigateToWorkspace,
  type NavigateToWorkspaceInput,
} from "@/stores/navigation-active-workspace-store/navigation";

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

const SERVER_ID = "server-1";
const WORKSPACE_ID = "ws-main";
const WORKSPACE_DIRECTORY = "/repo/worktree";

const AGENT_TIMESTAMP = new Date("2026-04-21T10:00:00.000Z");

const AGENT_DEFAULTS: Agent = {
  serverId: SERVER_ID,
  id: "agent",
  provider: "codex",
  status: "idle",
  activeTurn: null,
  createdAt: AGENT_TIMESTAMP,
  updatedAt: AGENT_TIMESTAMP,
  lastUserMessageAt: null,
  lastActivityAt: AGENT_TIMESTAMP,
  capabilities: {
    supportsStreaming: true,
    supportsSessionPersistence: true,
    supportsDynamicModes: true,
    supportsMcpServers: true,
    supportsReasoningStream: true,
    supportsToolInvocations: true,
  },
  currentModeId: null,
  availableModes: [],
  pendingPermissions: [],
  persistence: null,
  runtimeInfo: undefined,
  lastUsage: undefined,
  lastError: null,
  title: "Agent",
  cwd: WORKSPACE_DIRECTORY,
  workspaceId: WORKSPACE_ID,
  model: null,
  features: undefined,
  thinkingOptionId: undefined,
  requiresAttention: false,
  attentionReason: null,
  attentionTimestamp: null,
  archivedAt: null,
  parentAgentId: null,
  labels: {},
  projectPlacement: null,
};

function makeAgent(input: Partial<Agent> & Pick<Agent, "id">): Agent {
  return { ...AGENT_DEFAULTS, ...input };
}

function initializeAgents(agents: Agent[]): void {
  useSessionStore.getState().initializeSession(SERVER_ID, null as unknown as DaemonClient);
  useSessionStore
    .getState()
    .setAgents(SERVER_ID, new Map(agents.map((agent) => [agent.id, agent])));
}

function appendAgent(agent: Agent): void {
  useSessionStore.getState().setAgents(SERVER_ID, (agents) => {
    const nextAgents = new Map(agents);
    nextAgents.set(agent.id, agent);
    return nextAgents;
  });
}

function deriveVisibilityFromSession(): WorkspaceAgentVisibility {
  const sessionAgents = useSessionStore.getState().sessions[SERVER_ID]?.agents ?? new Map();
  return deriveWorkspaceAgentVisibility({
    sessionAgents,
    workspaceId: WORKSPACE_ID,
  });
}

function reconcileWorkspaceTabs(workspaceKey: string, visibility: WorkspaceAgentVisibility): void {
  useWorkspaceLayoutStore.getState().reconcileTabs(
    workspaceKey,
    buildWorkspaceTabSnapshot({
      agentVisibility: visibility,
      agentsHydrated: true,
      terminalsHydrated: true,
      knownTerminalIds: [],
      standaloneTerminalIds: [],
      hasActivePendingTerminalCreate: false,
      hasActivePendingDraftCreate: false,
    }),
  );
}

function getWorkspaceAgentTabIds(workspaceKey: string): string[] {
  return useWorkspaceLayoutStore
    .getState()
    .getWorkspaceTabs(workspaceKey)
    .filter((tab) => tab.target.kind === "agent")
    .map((tab) => tab.tabId);
}

afterEach(() => {
  useSessionStore.getState().clearSession(SERVER_ID);
  useWorkspaceLayoutStore.setState({
    layoutByWorkspace: {},
    pinnedAgentIdsByWorkspace: {},
    pendingAgentIdsByWorkspace: {},
    hiddenAgentIdsByWorkspace: {},
  });
});

function createTaskCommandFixture(childWorkspaceId = "ws-child") {
  const parent = makeAgent({ id: "parent" });
  const child = makeAgent({
    id: "child",
    parentAgentId: parent.id,
    workspaceId: childWorkspaceId,
    cwd: "/child/worktree",
    model: "gpt-5.4",
    thinkingOptionId: "high",
    currentModeId: "full-access",
  });
  initializeAgents([parent, child]);
  const workspaceKey = `${SERVER_ID}:${WORKSPACE_ID}`;
  const store = useWorkspaceLayoutStore.getState();
  const parentTab = store.openTab({
    workspaceKey,
    target: { kind: "agent", agentId: parent.id },
    intent: "reveal",
  })!;
  store.setTabState(workspaceKey, parentTab, { scrollOffset: 42 });
  const childTab = store.openTab({
    workspaceKey,
    target: { kind: "agent", agentId: child.id },
    intent: "reveal",
    pin: true,
    parentTabId: parentTab,
  })!;
  const pane: ExecuteAgentClientCommandInput["pane"] = {
    workspaceId: childWorkspaceId,
    layoutWorkspaceId: WORKSPACE_ID,
    host: "explorer",
    tabId: childTab,
    retargetCurrentTab: (target) => {
      store.replaceTab(workspaceKey, childTab, target);
    },
  };
  return { parent, child, workspaceKey, parentTab, childTab, pane, store };
}

function createCommandNavigation() {
  const routes: string[] = [];
  const navigate = vi.fn((input: NavigateToWorkspaceInput) =>
    navigateToWorkspace(input, {
      getSessionWorkspaces: () => null,
      getSessionAgents: () => [],
      isWorkspaceLayoutHydrated: () => true,
      openTab: (request) => useWorkspaceLayoutStore.getState().openTab(request),
      rememberLastWorkspace: () => {},
      navigateToRoute: (route) => routes.push(route),
    }),
  );
  return { navigate, routes };
}

function createArchiveRequest() {
  let complete = () => {};
  const request = new Promise<void>((resolve) => {
    complete = resolve;
  });
  const archiveAgent = vi.fn(() => request);
  return { complete, archiveAgent };
}

function requireClientCommand(text: string) {
  const command = resolveClientSlashCommand({ text, hasAttachments: false });
  if (!command) {
    throw new Error(`Unknown client command: ${text}`);
  }
  return command;
}

describe("managed task client commands", () => {
  it("quits the child view in its parent layout without mutating the child's own layout", async () => {
    const fixture = createTaskCommandFixture();
    const { child, workspaceKey, parentTab, childTab, pane, store } = fixture;
    const childKey = `${SERVER_ID}:${child.workspaceId}`;
    store.openTab({
      workspaceKey: childKey,
      target: { kind: "agent", agentId: child.id },
      intent: "reveal",
      pin: true,
    });
    const childLayout = useWorkspaceLayoutStore.getState().layoutByWorkspace[childKey];
    const archive = createArchiveRequest();
    const navigation = createCommandNavigation();
    const command = executeAgentClientCommand({
      serverId: SERVER_ID,
      agent: child,
      command: requireClientCommand("/quit"),
      pane,
      archiveAgent: archive.archiveAgent,
      navigateToWorkspace: navigation.navigate,
    });

    expect(store.getWorkspaceTabs(workspaceKey).map((tab) => tab.tabId)).not.toContain(childTab);
    expect(
      store.getWorkspaceTabs(workspaceKey).find((tab) => tab.tabId === parentTab)?.state,
    ).toEqual({
      scrollOffset: 42,
    });
    const state = useWorkspaceLayoutStore.getState();
    expect(
      findPaneById(state.layoutByWorkspace[workspaceKey].root, DEFAULT_PANE_ID)?.focusedTabId,
    ).toBe(parentTab);
    expect(state.pinnedAgentIdsByWorkspace[workspaceKey]?.has(child.id)).not.toBe(true);
    expect(state.hiddenAgentIdsByWorkspace[workspaceKey]?.has(child.id)).toBe(true);
    expect(state.layoutByWorkspace[childKey]).toBe(childLayout);
    expect(state.pinnedAgentIdsByWorkspace[childKey]?.has(child.id)).toBe(true);
    expect(navigation.routes).toEqual([]);
    expect(archive.archiveAgent).toHaveBeenCalledWith({ serverId: SERVER_ID, agentId: child.id });

    const reopened = store.openTab({
      workspaceKey,
      target: { kind: "agent", agentId: child.id },
      intent: "reveal",
      pin: true,
      parentTabId: parentTab,
    });
    archive.complete();
    await command;
    expect(
      findPaneById(
        useWorkspaceLayoutStore.getState().layoutByWorkspace[workspaceKey].root,
        EXPLORER_SIDEBAR_PANE_ID,
      )?.focusedTabId,
    ).toBe(reopened);
    expect(
      useWorkspaceLayoutStore.getState().pinnedAgentIdsByWorkspace[workspaceKey]?.has(child.id),
    ).toBe(true);
  });

  it.each([WORKSPACE_ID, "ws-child"])(
    "starts /new in the child's %s workspace and keeps its parent chat",
    async (childWorkspaceId) => {
      const { parent, child, workspaceKey, parentTab, childTab, pane, store } =
        createTaskCommandFixture(childWorkspaceId);
      const archive = createArchiveRequest();
      const navigation = createCommandNavigation();
      const command = executeAgentClientCommand({
        serverId: SERVER_ID,
        agent: child,
        command: requireClientCommand("/new"),
        pane,
        archiveAgent: archive.archiveAgent,
        navigateToWorkspace: navigation.navigate,
      });

      expect(navigation.navigate).toHaveBeenCalledOnce();
      expect(navigation.navigate.mock.calls[0][0]).toMatchObject({
        serverId: SERVER_ID,
        workspaceId: childWorkspaceId,
        target: {
          kind: "draft",
          setup: {
            cwd: child.cwd,
            provider: child.provider,
            model: child.model,
            thinkingOptionId: child.thinkingOptionId,
            modeId: child.currentModeId,
          },
        },
      });
      const childKey = `${SERVER_ID}:${childWorkspaceId}`;
      const childLayout = useWorkspaceLayoutStore.getState().layoutByWorkspace[childKey];
      const draft = store.getWorkspaceTabs(childKey).find((tab) => tab.target.kind === "draft");
      expect(draft).toBeDefined();
      expect(findPaneById(childLayout.root, DEFAULT_PANE_ID)?.focusedTabId).toBe(draft?.tabId);
      expect(store.getWorkspaceTabs(workspaceKey).map((tab) => tab.tabId)).not.toContain(childTab);
      expect(
        store.getWorkspaceTabs(workspaceKey).find((tab) => tab.tabId === parentTab),
      ).toMatchObject({
        target: { kind: "agent", agentId: parent.id },
        state: { scrollOffset: 42 },
      });
      if (childWorkspaceId !== WORKSPACE_ID) {
        expect(
          findPaneById(
            useWorkspaceLayoutStore.getState().layoutByWorkspace[workspaceKey].root,
            DEFAULT_PANE_ID,
          )?.focusedTabId,
        ).toBe(parentTab);
      }

      store.focusTab(workspaceKey, parentTab);
      archive.complete();
      await command;
      expect(
        findPaneById(
          useWorkspaceLayoutStore.getState().layoutByWorkspace[workspaceKey].root,
          DEFAULT_PANE_ID,
        )?.focusedTabId,
      ).toBe(parentTab);
      expect(navigation.navigate).toHaveBeenCalledOnce();
      expect(archive.archiveAgent).toHaveBeenCalledWith({ serverId: SERVER_ID, agentId: child.id });
    },
  );

  it("clears a root chat in place without navigating to another workspace", async () => {
    const { parent, workspaceKey, parentTab, store } = createTaskCommandFixture();
    const navigation = createCommandNavigation();
    await executeAgentClientCommand({
      serverId: SERVER_ID,
      agent: parent,
      command: requireClientCommand("/clear"),
      pane: {
        workspaceId: WORKSPACE_ID,
        host: "main",
        tabId: parentTab,
        retargetCurrentTab: (target) => {
          store.replaceTab(workspaceKey, parentTab, target);
        },
      },
      archiveAgent: async () => {},
      navigateToWorkspace: navigation.navigate,
    });
    const layout = useWorkspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];
    const mainTabId = findPaneById(layout.root, DEFAULT_PANE_ID)?.focusedTabId;
    expect(
      store.getWorkspaceTabs(workspaceKey).find((tab) => tab.tabId === mainTabId)?.target,
    ).toMatchObject({
      kind: "draft",
      setup: { cwd: parent.cwd, provider: parent.provider },
    });
    expect(navigation.routes).toEqual([]);
  });
});

describe("workspace subagents integration", () => {
  it("keeps a restored child in the supporting pane before and after host hydration", () => {
    const key = `${SERVER_ID}:${WORKSPACE_ID}`;
    const parent = makeAgent({ id: "parent" });
    const child = makeAgent({ id: "child", parentAgentId: parent.id, workspaceId: "child-ws" });
    initializeAgents([parent, child]);
    const store = useWorkspaceLayoutStore.getState();
    const parentTab = store.openTab({
      workspaceKey: key,
      target: { kind: "agent", agentId: parent.id },
      intent: "reveal",
    });
    const childTab = store.openTab({
      workspaceKey: key,
      target: { kind: "agent", agentId: child.id },
      intent: "reveal",
      parentTabId: parentTab!,
    });
    const savedLayout = useWorkspaceLayoutStore.getState().layoutByWorkspace[key];
    useSessionStore.getState().clearSession(SERVER_ID);
    const restored = flattenLayoutToSingleChat(savedLayout, (target, previousHost) =>
      resolveWorkspaceTargetHost(key, target, previousHost),
    );
    expect(findPaneById(restored.root, EXPLORER_SIDEBAR_PANE_ID)?.focusedTabId).toBe(childTab);
    useWorkspaceLayoutStore.setState({ layoutByWorkspace: { [key]: restored } });
    store.openTab({
      workspaceKey: key,
      target: { kind: "agent", agentId: child.id },
      intent: "reveal",
    });
    expect(
      findPaneById(
        useWorkspaceLayoutStore.getState().layoutByWorkspace[key].root,
        EXPLORER_SIDEBAR_PANE_ID,
      )?.focusedTabId,
    ).toBe(childTab);
    initializeAgents([child, parent]);
    reconcileWorkspaceTabs(key, deriveVisibilityFromSession());
    const hydrated = useWorkspaceLayoutStore.getState().layoutByWorkspace[key];
    expect(findPaneById(hydrated.root, DEFAULT_PANE_ID)?.focusedTabId).toBe(parentTab);
    expect(findPaneById(hydrated.root, EXPLORER_SIDEBAR_PANE_ID)?.focusedTabId).toBe(childTab);
  });

  it("keeps an explicitly viewed cross-worktree grandchild through reconciliation", () => {
    const key = `${SERVER_ID}:${WORKSPACE_ID}`;
    const parent = makeAgent({ id: "parent" });
    const child = makeAgent({ id: "child", parentAgentId: parent.id, workspaceId: "child-ws" });
    const grandchild = makeAgent({
      id: "grandchild",
      parentAgentId: child.id,
      workspaceId: "grandchild-ws",
    });
    initializeAgents([grandchild, parent, child]);
    const store = useWorkspaceLayoutStore.getState();
    const parentTab = store.openTab({
      workspaceKey: key,
      target: { kind: "agent", agentId: parent.id },
      intent: "reveal",
    });
    const childTab = store.openTab({
      workspaceKey: key,
      target: { kind: "agent", agentId: child.id },
      intent: "reveal",
      parentTabId: parentTab!,
    });
    const grandchildTab = store.openTab({
      workspaceKey: key,
      target: { kind: "agent", agentId: grandchild.id },
      intent: "reveal",
      parentTabId: childTab!,
    });
    reconcileWorkspaceTabs(key, deriveVisibilityFromSession());
    const layout = useWorkspaceLayoutStore.getState().layoutByWorkspace[key];
    expect(findPaneById(layout.root, DEFAULT_PANE_ID)?.focusedTabId).toBe(parentTab);
    expect(findPaneById(layout.root, EXPLORER_SIDEBAR_PANE_ID)?.focusedTabId).toBe(grandchildTab);
    expect(layout.parentTabIdByTabId?.[grandchildTab!]).toBe(childTab);
  });

  it.each([WORKSPACE_ID, "child-worktree"])(
    "keeps a managed child from %s beside its parent through reconciliation",
    (childWorkspaceId) => {
      const key = `${SERVER_ID}:${WORKSPACE_ID}`;
      const parent = makeAgent({ id: "parent-agent" });
      const child = makeAgent({
        id: "child-agent",
        parentAgentId: parent.id,
        workspaceId: childWorkspaceId,
        cwd: "/child/worktree",
      });
      initializeAgents([parent, child]);
      const store = useWorkspaceLayoutStore.getState();
      const parentTab = store.openTab({
        workspaceKey: key,
        target: { kind: "agent", agentId: parent.id },
        intent: "reveal",
      });
      const childTab = store.openTab({
        workspaceKey: key,
        target: { kind: "agent", agentId: child.id },
        intent: "reveal",
        parentTabId: parentTab!,
        placement: { mode: "pane", paneId: DEFAULT_PANE_ID },
      });
      reconcileWorkspaceTabs(key, deriveVisibilityFromSession());
      const layout = useWorkspaceLayoutStore.getState().layoutByWorkspace[key];
      expect(findPaneById(layout.root, DEFAULT_PANE_ID)?.focusedTabId).toBe(parentTab);
      expect(findPaneById(layout.root, EXPLORER_SIDEBAR_PANE_ID)?.focusedTabId).toBe(childTab);
      expect(findPaneById(layout.root, EXPLORER_SIDEBAR_PANE_ID)?.hidden).not.toBe(true);
      expect(useSessionStore.getState().sessions[SERVER_ID]?.agents.get(child.id)?.cwd).toBe(
        "/child/worktree",
      );
      store.closeTab(key, childTab!);
      expect(
        useSessionStore.getState().sessions[SERVER_ID]?.agents.get(child.id)?.archivedAt,
      ).toBeNull();
      expect(
        findPaneById(
          useWorkspaceLayoutStore.getState().layoutByWorkspace[key].root,
          DEFAULT_PANE_ID,
        )?.focusedTabId,
      ).toBe(parentTab);
    },
  );

  it("keeps a child ingested before its parent out of auto-tabs, then exposes it in the parent section", () => {
    const workspaceKey = buildWorkspaceTabPersistenceKey({
      serverId: SERVER_ID,
      workspaceId: WORKSPACE_ID,
    });
    expect(workspaceKey).toBeTruthy();

    const child = makeAgent({
      id: "child-agent",
      parentAgentId: "parent-agent",
      title: "Child agent",
    });
    const parent = makeAgent({
      id: "parent-agent",
      title: "Parent agent",
    });

    initializeAgents([child]);

    reconcileWorkspaceTabs(workspaceKey!, deriveVisibilityFromSession());

    expect(getWorkspaceAgentTabIds(workspaceKey!)).toEqual([]);

    appendAgent(parent);

    reconcileWorkspaceTabs(workspaceKey!, deriveVisibilityFromSession());

    expect(getWorkspaceAgentTabIds(workspaceKey!)).toEqual(["agent_parent-agent"]);
    expect(
      selectSubagentsForParent(
        useSessionStore.getState(),
        {
          serverId: SERVER_ID,
          parentAgentId: "parent-agent",
        },
        new Set(),
      ).map((row) => row.id),
    ).toEqual(["child-agent"]);
  });

  it("moves a detached child out of the parent section and back into normal workspace tabs", () => {
    const workspaceKey = buildWorkspaceTabPersistenceKey({
      serverId: SERVER_ID,
      workspaceId: WORKSPACE_ID,
    });
    expect(workspaceKey).toBeTruthy();

    const parent = makeAgent({
      id: "parent-agent",
      title: "Parent agent",
    });
    const child = makeAgent({
      id: "child-agent",
      parentAgentId: "parent-agent",
      title: "Child agent",
    });

    initializeAgents([parent, child]);
    reconcileWorkspaceTabs(workspaceKey!, deriveVisibilityFromSession());

    expect(getWorkspaceAgentTabIds(workspaceKey!)).toEqual(["agent_parent-agent"]);
    expect(
      selectSubagentsForParent(
        useSessionStore.getState(),
        {
          serverId: SERVER_ID,
          parentAgentId: "parent-agent",
        },
        new Set(),
      ).map((row) => row.id),
    ).toEqual(["child-agent"]);

    appendAgent({ ...child, parentAgentId: null, labels: {} });
    reconcileWorkspaceTabs(workspaceKey!, deriveVisibilityFromSession());

    expect(getWorkspaceAgentTabIds(workspaceKey!)).toEqual([
      "agent_parent-agent",
      "agent_child-agent",
    ]);
    expect(
      selectSubagentsForParent(
        useSessionStore.getState(),
        {
          serverId: SERVER_ID,
          parentAgentId: "parent-agent",
        },
        new Set(),
      ),
    ).toEqual([]);
  });

  it("auto-opens a cross-workspace child while retaining it in the parent section", () => {
    const workspaceKey = buildWorkspaceTabPersistenceKey({
      serverId: SERVER_ID,
      workspaceId: WORKSPACE_ID,
    });
    expect(workspaceKey).toBeTruthy();

    const parent = makeAgent({
      id: "parent-agent",
      workspaceId: "ws-parent",
      title: "Parent agent",
    });
    const child = makeAgent({
      id: "child-agent",
      parentAgentId: parent.id,
      title: "Cross-workspace child",
    });

    initializeAgents([parent, child]);
    reconcileWorkspaceTabs(workspaceKey!, deriveVisibilityFromSession());

    expect(getWorkspaceAgentTabIds(workspaceKey!)).toEqual(["agent_child-agent"]);
    expect(
      selectSubagentsForParent(
        useSessionStore.getState(),
        {
          serverId: SERVER_ID,
          parentAgentId: parent.id,
        },
        new Set(),
      ).map((row) => row.id),
    ).toEqual([child.id]);
  });
});
