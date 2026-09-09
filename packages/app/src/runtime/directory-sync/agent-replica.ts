import type { FetchAgentsEntry } from "@getpaseo/client/internal/daemon-client";
import type { AgentSnapshotPayload } from "@getpaseo/protocol/messages";
import { clearArchiveAgentPending } from "@/hooks/use-archive-agent";
import { queryClient } from "@/data/query-client";
import { useSessionStore, type Agent } from "@/stores/session-store";
import { normalizeAgentSnapshot, projectAgentSnapshot } from "@/utils/agent-snapshots";
import {
  applyAgentDirectoryDelta,
  type AgentDirectoryDelta,
  removeAgentDirectoryReplica,
  replaceAgentPendingPermissions,
  replaceFetchedAgentDirectory,
  upsertAgentReplica,
} from "@/utils/agent-directory-sync";
import { reconcileAgentDirectory } from "@/utils/agent-directory-reconciliation";
import { applyLegacyDaemonWorkspaceOwnership } from "@/workspace/legacy-daemon-workspaces";

function projectAgentDirectoryEntry(agent: Agent): FetchAgentsEntry | null {
  return agent.projectPlacement
    ? { agent: projectAgentSnapshot(agent), project: agent.projectPlacement }
    : null;
}

export interface AgentLifecycleToken {
  readonly agentId: string;
  readonly version: number;
}

interface OpenArchivedAgentPolicy {
  isAgentExplicitlyOpen(agentId: string): boolean;
  // null means the connection changed or the lookup failed, not an authoritative deletion.
  verifyAgentExists(agentId: string): Promise<boolean | null>;
}

export class AgentDirectoryReplica {
  private readonly lifecycleVersions = new Map<string, number>();
  private readonly members = new Set<string>();
  private readonly pendingCacheReads = new Set<string>();
  private readonly pendingExistenceChecks = new Map<
    string,
    {
      token: AgentLifecycleToken;
      needsRecheck: boolean;
    }
  >();

  constructor(
    private readonly serverId: string,
    private readonly onStoppedRunning: (agentId: string) => void,
    private readonly openArchivedAgentPolicy?: OpenArchivedAgentPolicy,
  ) {}

  captureTimeline(agentId: string): AgentLifecycleToken {
    return { agentId, version: this.lifecycleVersions.get(agentId) ?? 0 };
  }

  captureCache(agentId: string): AgentLifecycleToken {
    this.pendingCacheReads.add(agentId);
    return this.captureTimeline(agentId);
  }

  commitCached(agents: Map<string, Agent>): void {
    this.members.clear();
    for (const [agentId, agent] of agents) {
      this.members.add(agentId);
      useSessionStore.getState().setAgentLastActivity(agentId, agent.lastActivityAt);
    }
    useSessionStore.getState().setAgents(this.serverId, agents);
  }

  commitCachedAgent(token: AgentLifecycleToken, agent: Agent): boolean {
    this.pendingCacheReads.delete(token.agentId);
    if (token.version !== (this.lifecycleVersions.get(token.agentId) ?? 0)) return false;
    if (this.members.has(agent.id)) return false;
    this.members.add(agent.id);
    useSessionStore.getState().setAgents(this.serverId, (current) => {
      if (current.has(agent.id)) return current;
      const next = new Map(current);
      next.set(agent.id, agent);
      return next;
    });
    useSessionStore.getState().setAgentLastActivity(agent.id, agent.lastActivityAt);
    return true;
  }

  submitTimelineAgent(token: AgentLifecycleToken, payload: AgentSnapshotPayload): boolean {
    if (token.version !== (this.lifecycleVersions.get(token.agentId) ?? 0)) {
      return false;
    }
    const session = useSessionStore.getState().sessions[this.serverId];
    const existing = session?.agents.get(token.agentId) ?? session?.agentDetails.get(token.agentId);
    const timelineAgent = applyLegacyDaemonWorkspaceOwnership({
      serverId: this.serverId,
      agent: normalizeAgentSnapshot(payload, this.serverId),
    });
    const normalized: Agent = {
      ...timelineAgent,
      projectPlacement: timelineAgent.projectPlacement ?? existing?.projectPlacement,
    };
    // A History timeline is detail demand, not membership in the active directory.
    const accepted = normalized.archivedAt
      ? normalized
      : upsertAgentReplica(this.serverId, normalized);
    if (accepted.archivedAt) {
      this.storeArchivedDetail(accepted);
      this.members.delete(accepted.id);
    } else {
      this.members.add(accepted.id);
    }
    replaceAgentPendingPermissions(this.serverId, accepted);
    useSessionStore.getState().setAgentLastActivity(accepted.id, accepted.lastActivityAt);
    if (accepted.archivedAt) {
      clearArchiveAgentPending({ queryClient, serverId: this.serverId, agentId: accepted.id });
    }
    return true;
  }

  applyDelta(delta: AgentDirectoryDelta): void {
    const before = this.members.has(delta.kind === "remove" ? delta.agentId : delta.agent.id);
    if (delta.kind === "remove") {
      this.members.delete(delta.agentId);
      this.removeDirectoryMember(delta.agentId);
      return;
    }
    const result = applyAgentDirectoryDelta({ serverId: this.serverId, delta });
    this.members.add(delta.agent.id);
    if (!before) this.advance(delta.agent.id);
    if (result.stoppedRunning) this.onStoppedRunning(result.agentId);
  }

  commitSnapshot(
    entries: FetchAgentsEntry[],
    deltas: readonly AgentDirectoryDelta[],
  ): Map<string, Agent> {
    const previous = useSessionStore.getState().sessions[this.serverId]?.agents ?? new Map();
    const reconciled = reconcileAgentDirectory({ previous, snapshot: entries, deltas });
    const nextIds = new Set(reconciled.entries.map((entry) => entry.agent.id));
    const retainedIds = new Set<string>();
    const missingIds = new Set([
      ...previous.keys(),
      // An archived tab is outside active membership. Recheck it on reconnect too.
      ...Array.from(useSessionStore.getState().sessions[this.serverId]?.agentDetails.values() ?? [])
        .filter(
          (agent) =>
            agent.archivedAt && this.openArchivedAgentPolicy?.isAgentExplicitlyOpen(agent.id),
        )
        .map((agent) => agent.id),
      ...deltas.flatMap((delta) => (delta.kind === "remove" ? [delta.agentId] : [])),
    ]);
    for (const agentId of missingIds) {
      if (nextIds.has(agentId)) continue;
      if (this.retainOpenedArchivedDetail(agentId)) {
        retainedIds.add(agentId);
        this.verifyOpenedArchivedAgent(agentId);
      } else {
        this.remove(agentId);
      }
    }
    for (const agentId of this.pendingCacheReads) {
      if (!nextIds.has(agentId) && !retainedIds.has(agentId)) this.advance(agentId);
    }
    for (const agentId of this.members) {
      if (!nextIds.has(agentId) && !retainedIds.has(agentId)) this.advance(agentId);
    }
    for (const agentId of nextIds) {
      if (!this.members.has(agentId)) this.advance(agentId);
    }
    this.members.clear();
    this.pendingCacheReads.clear();
    for (const agentId of nextIds) this.members.add(agentId);
    const { agents } = replaceFetchedAgentDirectory({
      serverId: this.serverId,
      entries: reconciled.entries,
    });
    for (const agentId of reconciled.stoppedRunningAgentIds) this.onStoppedRunning(agentId);
    return agents;
  }

  commitChanges(
    entries: FetchAgentsEntry[],
    removals: readonly { id: string }[],
    deltas: readonly AgentDirectoryDelta[],
  ): Map<string, Agent> {
    const previous = useSessionStore.getState().sessions[this.serverId]?.agents ?? new Map();
    const merged = new Map<string, FetchAgentsEntry>();
    for (const agent of previous.values()) {
      const entry = projectAgentDirectoryEntry(agent);
      if (entry) merged.set(agent.id, entry);
    }
    for (const entry of entries) merged.set(entry.agent.id, entry);
    const removalsAsDeltas: AgentDirectoryDelta[] = removals.map(({ id }) => ({
      kind: "remove",
      agentId: id,
    }));
    return this.commitSnapshot(Array.from(merged.values()), [...removalsAsDeltas, ...deltas]);
  }

  archive(agentId: string, archivedAt: string): void {
    this.advance(agentId);
    useSessionStore.getState().setAgents(this.serverId, (current) => {
      const agent = current.get(agentId);
      if (!agent) return current;
      const next = new Map(current);
      next.set(agentId, { ...agent, archivedAt: new Date(archivedAt) });
      return next;
    });
    clearArchiveAgentPending({ queryClient, serverId: this.serverId, agentId });
  }

  remove(agentId: string): void {
    this.members.delete(agentId);
    this.advance(agentId);
    removeAgentDirectoryReplica(this.serverId, agentId);
  }

  private storeArchivedDetail(agent: Agent): void {
    const store = useSessionStore.getState();
    // Publish the detail first so a synchronous layout subscriber never sees a gap.
    store.setAgentDetails(this.serverId, (current) => {
      if (current.get(agent.id) === agent) return current;
      return new Map(current).set(agent.id, agent);
    });
    store.setAgents(this.serverId, (current) => {
      if (!current.has(agent.id)) return current;
      const next = new Map(current);
      next.delete(agent.id);
      return next;
    });
  }

  private retainOpenedArchivedDetail(agentId: string): boolean {
    if (!this.openArchivedAgentPolicy?.isAgentExplicitlyOpen(agentId)) return false;
    const session = useSessionStore.getState().sessions[this.serverId];
    const agent = session?.agents.get(agentId) ?? session?.agentDetails.get(agentId);
    if (!agent?.archivedAt) return false;
    this.storeArchivedDetail(agent);
    clearArchiveAgentPending({ queryClient, serverId: this.serverId, agentId });
    return true;
  }

  private removeDirectoryMember(agentId: string): void {
    // Directory removal covers both archive/filter mismatch and actual deletion.
    // Only an explicitly opened archive can survive while existence is confirmed.
    if (this.retainOpenedArchivedDetail(agentId)) {
      this.verifyOpenedArchivedAgent(agentId);
      return;
    }
    this.advance(agentId);
    removeAgentDirectoryReplica(this.serverId, agentId);
  }

  private verifyOpenedArchivedAgent(agentId: string): void {
    const policy = this.openArchivedAgentPolicy;
    if (!policy) return;
    const pending = this.pendingExistenceChecks.get(agentId);
    if (pending) {
      pending.needsRecheck = true;
      return;
    }
    const token = this.captureTimeline(agentId);
    const check = { token, needsRecheck: false };
    this.pendingExistenceChecks.set(agentId, check);
    void policy
      .verifyAgentExists(agentId)
      .then((exists) => {
        this.pendingExistenceChecks.delete(agentId);
        if (token.version !== (this.lifecycleVersions.get(agentId) ?? 0)) {
          // A newer lifecycle event wins. If it retained another opened archive,
          // validate that generation after the previous request has settled.
          if (this.retainOpenedArchivedDetail(agentId)) this.verifyOpenedArchivedAgent(agentId);
          return null;
        }
        if (exists === false) this.remove(agentId);
        else if (check.needsRecheck && this.retainOpenedArchivedDetail(agentId)) {
          this.verifyOpenedArchivedAgent(agentId);
        }
        return null;
      })
      .catch((error: unknown) => {
        this.pendingExistenceChecks.delete(agentId);
        console.warn("[AgentDirectoryReplica] Could not verify an opened archived chat", error);
      });
  }

  private advance(agentId: string): void {
    this.lifecycleVersions.set(agentId, (this.lifecycleVersions.get(agentId) ?? 0) + 1);
  }
}
