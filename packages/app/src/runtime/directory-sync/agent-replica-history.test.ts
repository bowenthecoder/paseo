import { afterEach, describe, expect, it, vi } from "vitest";
import type { DaemonClient, FetchAgentsEntry } from "@getpaseo/client/internal/daemon-client";
import type { AgentSnapshotPayload, SessionOutboundMessage } from "@getpaseo/protocol/messages";
import { useSessionStore } from "@/stores/session-store";
import {
  createWorkspaceLayoutStore,
  findPaneById,
  useWorkspaceLayoutStore,
} from "@/stores/workspace-layout-store";
import { deriveWorkspaceAgentVisibility } from "@/workspace-tabs/agent-visibility";
import { createUserMessage } from "@/types/stream";
import { AgentDirectoryReplica } from "./agent-replica";
import { DirectorySync } from "./index";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function agent(id: string): AgentSnapshotPayload {
  return {
    id,
    workspaceId: "workspace",
    provider: "codex",
    cwd: "/repo",
    model: null,
    createdAt: "2026-07-17T00:00:00.000Z",
    updatedAt: "2026-07-17T00:01:00.000Z",
    lastUserMessageAt: null,
    status: "idle",
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
    title: id,
    labels: {},
  };
}

function entry(snapshot: AgentSnapshotPayload): FetchAgentsEntry {
  return {
    agent: snapshot,
    project: {
      projectKey: "/repo",
      projectName: "repo",
      checkout: {
        cwd: "/repo",
        isGit: false,
        currentBranch: null,
        remoteUrl: null,
        worktreeRoot: null,
        isPaseoOwnedWorktree: false,
        mainRepoRoot: null,
      },
    },
  };
}

function fixture(
  verifyAgentExists: (agentId: string) => Promise<boolean | null>,
  layouts = createWorkspaceLayoutStore(),
) {
  const serverId = `history-${cleanups.length}`;
  const workspaceKey = `${serverId}:workspace`;
  const session = () => useSessionStore.getState().sessions[serverId]!;
  const layout = layouts.getState();
  useSessionStore.getState().initializeSession(serverId, null as unknown as DaemonClient);
  cleanups.push(() => {
    layout.purgeWorkspace(workspaceKey);
    useSessionStore.getState().clearSession(serverId);
  });
  const replica = new AgentDirectoryReplica(
    serverId,
    () => undefined,
    () => undefined,
    {
      isAgentExplicitlyOpen: (agentId) =>
        Boolean(layouts.getState().pinnedAgentIdsByWorkspace[workspaceKey]?.has(agentId)) &&
        layouts
          .getState()
          .getWorkspaceTabs(workspaceKey)
          .some((tab) => tab.target.kind === "agent" && tab.target.agentId === agentId),
      verifyAgentExists,
    },
  );
  replica.commitSnapshot([entry(agent("survivor")), entry(agent("archived"))], []);
  const survivorTab = layout.openTab({
    workspaceKey,
    target: { kind: "agent", agentId: "survivor" },
    intent: "reveal",
  });
  const closingTab = layout.openTab({
    workspaceKey,
    target: { kind: "agent", agentId: "archived" },
    intent: "reveal",
  });
  layout.unpinAgent(workspaceKey, "archived");
  layout.hideAgent(workspaceKey, "archived");
  layout.closeTab(workspaceKey, closingTab!);
  replica.applyDelta({ kind: "remove", agentId: "archived" });
  replica.archive("archived", "2026-07-17T00:02:00.000Z");
  const archivedTab = layout.openTab({
    workspaceKey,
    target: { kind: "agent", agentId: "archived" },
    intent: "reveal",
    pin: true,
  });
  replica.submitTimelineAgent(replica.captureTimeline("archived"), {
    ...agent("archived"),
    archivedAt: "2026-07-17T00:02:00.000Z",
  });
  layout.resolvePendingAgent(workspaceKey, "archived");
  const history = createUserMessage({
    id: "saved-message",
    text: "Keep this history",
    timestamp: new Date(),
  });
  useSessionStore.getState().setAgentStreamState(serverId, "archived", { tail: [history] });
  useSessionStore.getState().setAgentAuthoritativeHistoryApplied(serverId, "archived", true);
  const reconcile = () => {
    const visibility = deriveWorkspaceAgentVisibility({
      sessionAgents: session().agents,
      agentDetails: session().agentDetails,
      workspaceId: "workspace",
    });
    layout.reconcileTabs(workspaceKey, {
      ...visibility,
      agentsHydrated: true,
      terminalsHydrated: true,
      standaloneTerminalIds: [],
    });
  };
  const focusedTab = () => {
    const current = layouts.getState().layoutByWorkspace[workspaceKey];
    return findPaneById(current.root, current.focusedPaneId)?.focusedTabId;
  };
  return {
    serverId,
    replica,
    session,
    reconcile,
    focusedTab,
    archivedTab,
    survivorTab,
    history,
    layout,
    workspaceKey,
  };
}

describe("History reopening during filtered directory removals", () => {
  it("keeps reopened focus and history across repeated removals with one authoritative check", async () => {
    const check = deferred<boolean | null>();
    const verify = vi.fn(() => check.promise);
    const f = fixture(verify);
    f.replica.applyDelta({ kind: "remove", agentId: "archived" });
    f.reconcile();
    f.replica.applyDelta({ kind: "remove", agentId: "archived" });
    f.reconcile();
    expect(f.focusedTab()).toBe(f.archivedTab);
    expect(f.session().agents.has("archived")).toBe(false);
    expect(f.session().agentDetails.get("archived")?.archivedAt).toBeTruthy();
    expect(f.session().agentStreamTail.get("archived")).toEqual([f.history]);
    expect(verify).toHaveBeenCalledTimes(1);
    check.resolve(true);
    await check.promise;
    f.reconcile();
    expect(f.focusedTab()).toBe(f.archivedTab);
  });

  it("clears a remotely deleted archived chat when the authoritative lookup returns not found", async () => {
    const check = deferred<boolean | null>();
    const f = fixture(() => check.promise);
    f.replica.applyDelta({ kind: "remove", agentId: "archived" });
    check.resolve(false);
    await check.promise;
    f.reconcile();
    expect(f.session().agentDetails.has("archived")).toBe(false);
    expect(f.session().agentStreamTail.has("archived")).toBe(false);
    expect(f.focusedTab()).toBe(f.survivorTab);
  });

  it("lets an authoritative delete defeat an older in-flight existence check", async () => {
    const check = deferred<boolean | null>();
    const f = fixture(() => check.promise);
    f.replica.applyDelta({ kind: "remove", agentId: "archived" });
    const staleTimeline = f.replica.captureTimeline("archived");
    f.replica.remove("archived");
    check.resolve(true);
    await check.promise;
    expect(f.replica.submitTimelineAgent(staleTimeline, agent("archived"))).toBe(false);
    f.reconcile();
    expect(f.session().agentDetails.has("archived")).toBe(false);
    expect(f.session().agentStreamTail.has("archived")).toBe(false);
    expect(f.focusedTab()).toBe(f.survivorTab);
  });

  it("checks a detail-only archive after reconnect and removes a deletion missed while offline", async () => {
    const check = deferred<boolean | null>();
    const verify = vi.fn(() => check.promise);
    const f = fixture(verify);
    expect(f.session().agents.has("archived")).toBe(false);
    f.replica.commitSnapshot([entry(agent("survivor"))], []);
    f.reconcile();
    expect(f.focusedTab()).toBe(f.archivedTab);
    expect(verify).toHaveBeenCalledOnce();
    check.resolve(false);
    await check.promise;
    f.reconcile();
    expect(f.session().agentDetails.has("archived")).toBe(false);
    expect(f.focusedTab()).toBe(f.survivorTab);
  });

  it("rechecks a removal received during an older successful lookup without concurrent requests", async () => {
    const first = deferred<boolean | null>();
    const second = deferred<boolean | null>();
    const verify = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const f = fixture(verify);
    f.replica.applyDelta({ kind: "remove", agentId: "archived" });
    f.replica.applyDelta({ kind: "remove", agentId: "archived" });
    expect(verify).toHaveBeenCalledTimes(1);
    first.resolve(true);
    await first.promise;
    expect(verify).toHaveBeenCalledTimes(2);
    second.resolve(false);
    await second.promise;
    f.reconcile();
    expect(f.session().agentDetails.has("archived")).toBe(false);
    expect(f.focusedTab()).toBe(f.survivorTab);
  });

  it("does not retain a closed archived chat", () => {
    const verify = vi.fn(async () => true);
    const f = fixture(verify);
    f.layout.unpinAgent(f.workspaceKey, "archived");
    f.layout.closeTab(f.workspaceKey, f.archivedTab!);
    f.replica.applyDelta({ kind: "remove", agentId: "archived" });
    expect(f.session().agentDetails.has("archived")).toBe(false);
    expect(f.session().agentStreamTail.has("archived")).toBe(false);
    expect(verify).not.toHaveBeenCalled();
  });
});

function connectDirectory(serverId: string, fetchAgent: DaemonClient["fetchAgent"]) {
  const handlers = new Map<string, (message: SessionOutboundMessage) => void>();
  const client = {
    fetchAgent,
    on: (type: string, handler: (message: SessionOutboundMessage) => void) => {
      handlers.set(type, handler);
      return () => handlers.delete(type);
    },
  } as unknown as DaemonClient;
  const directory = new DirectorySync(serverId, {
    onAgentStoppedRunning: () => {},
    markAgentLoading: () => {},
    markAgentReady: () => {},
    markAgentError: () => {},
  });
  const source = { clientGeneration: 1, connectionEpoch: 1 };
  directory.connectionChanged({ client, status: "online", source });
  cleanups.push(() => directory.dispose());
  return {
    directory,
    client,
    source,
    remove: () =>
      handlers.get("agent_update")?.({
        type: "agent_update",
        payload: { kind: "remove", agentId: "archived" },
      }),
  };
}

describe("DirectorySync archived-chat existence checks", () => {
  it.each(["null response", "not-found error"])(
    "honors authoritative %s from the daemon",
    async (outcome) => {
      const f = fixture(async () => true, useWorkspaceLayoutStore);
      const fetchAgent = vi.fn(async () => {
        if (outcome === "not-found error") throw new Error("Agent not found: archived");
        return null;
      });
      const connected = connectDirectory(f.serverId, fetchAgent);
      connected.remove();
      await vi.waitFor(() => expect(f.session().agentDetails.has("archived")).toBe(false));
      expect(fetchAgent).toHaveBeenCalledWith({ agentId: "archived" });
      f.reconcile();
      expect(f.focusedTab()).toBe(f.survivorTab);
    },
  );

  it("preserves the open archive on a transient lookup error", async () => {
    const f = fixture(async () => true, useWorkspaceLayoutStore);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    cleanups.push(() => warn.mockRestore());
    const connected = connectDirectory(
      f.serverId,
      vi.fn(async () => {
        throw new Error("Connection lost while requesting archived");
      }),
    );
    connected.remove();
    await vi.waitFor(() =>
      expect(warn).toHaveBeenCalledWith(
        "[DirectorySync] Could not verify an opened archived chat",
        expect.objectContaining({ message: "Connection lost while requesting archived" }),
      ),
    );
    f.reconcile();
    expect(f.session().agentStreamTail.get("archived")).toEqual([f.history]);
    expect(f.focusedTab()).toBe(f.archivedTab);
  });

  it("ignores not-found from a connection that was replaced during the request", async () => {
    const f = fixture(async () => true, useWorkspaceLayoutStore);
    const check = deferred<null>();
    const connected = connectDirectory(
      f.serverId,
      vi.fn(() => check.promise),
    );
    connected.remove();
    connected.directory.connectionChanged({
      client: null,
      status: "offline",
      source: { clientGeneration: 2, connectionEpoch: 1 },
    });
    check.resolve(null);
    await check.promise;
    await Promise.resolve();
    f.reconcile();
    expect(f.session().agentStreamTail.get("archived")).toEqual([f.history]);
    expect(f.focusedTab()).toBe(f.archivedTab);
  });
});
