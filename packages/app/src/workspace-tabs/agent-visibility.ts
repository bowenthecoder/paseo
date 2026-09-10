import type { Agent } from "@/stores/session-store";
import type { WorkspaceTabSnapshot } from "@/stores/workspace-layout-actions";
import { isWorkspaceRootAgent } from "@/subagents/policies";
import { normalizeWorkspaceOpaqueId } from "@/utils/workspace-identity";

export interface WorkspaceAgentVisibility {
  activeAgentIds: Set<string>;
  autoOpenAgentIds: Set<string>;
  knownAgentIds: Set<string>;
}

function agentBelongsToWorkspace(agent: Agent, workspaceId: string): boolean {
  return normalizeWorkspaceOpaqueId(agent.workspaceId) === workspaceId;
}

function includeParentWorkspaceTasks(input: {
  agentsById: Map<string, Agent>;
  sessionAgents: Map<string, Agent> | undefined;
  workspaceId: string;
  knownAgentIds: Set<string>;
  activeAgentIds: Set<string>;
}): void {
  // Descendants can execute in other worktrees. Traverse their relationship once
  // so explicit side-panel views survive reconciliation, including nested tasks.
  const childrenByParent = new Map<string, Agent[]>();
  const queue: string[] = [];
  for (const agent of input.agentsById.values()) {
    if (agentBelongsToWorkspace(agent, input.workspaceId) || input.knownAgentIds.has(agent.id)) {
      queue.push(agent.id);
    }
    if (agent.parentAgentId) {
      const children = childrenByParent.get(agent.parentAgentId) ?? [];
      children.push(agent);
      childrenByParent.set(agent.parentAgentId, children);
    }
  }
  const visited = new Set(queue);
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    for (const child of childrenByParent.get(queue[cursor]!) ?? []) {
      if (visited.has(child.id)) continue;
      visited.add(child.id);
      queue.push(child.id);
      input.knownAgentIds.add(child.id);
      if (!child.archivedAt && input.sessionAgents?.has(child.id)) {
        input.activeAgentIds.add(child.id);
      }
    }
  }
}

function includeSplitChats(input: {
  ids: Iterable<string> | undefined;
  agentsById: Map<string, Agent>;
  sessionAgents: Map<string, Agent> | undefined;
  knownAgentIds: Set<string>;
  activeAgentIds: Set<string>;
}): void {
  for (const id of input.ids ?? []) {
    const agent = input.agentsById.get(id);
    if (!agent) continue;
    input.knownAgentIds.add(id);
    if (!agent.archivedAt && input.sessionAgents?.has(id)) input.activeAgentIds.add(id);
  }
}

export function deriveWorkspaceAgentVisibility(input: {
  sessionAgents: Map<string, Agent> | undefined;
  agentDetails?: Map<string, Agent> | undefined;
  workspaceId: string | null | undefined;
  /** Only chats explicitly opened in this workspace's split, including other folders. */
  splitAgentIds?: Iterable<string>;
}): WorkspaceAgentVisibility {
  const { sessionAgents, agentDetails } = input;
  const workspaceId = normalizeWorkspaceOpaqueId(input.workspaceId);
  if ((!sessionAgents && !agentDetails) || !workspaceId) {
    return {
      activeAgentIds: new Set<string>(),
      autoOpenAgentIds: new Set<string>(),
      knownAgentIds: new Set<string>(),
    };
  }

  const activeAgentIds = new Set<string>();
  const autoOpenAgentIds = new Set<string>();
  const knownAgentIds = new Set<string>();
  const agentsById = new Map<string, Agent>([
    ...(agentDetails?.entries() ?? []),
    ...(sessionAgents?.entries() ?? []),
  ]);
  for (const agent of sessionAgents?.values() ?? []) {
    if (!agentBelongsToWorkspace(agent, workspaceId)) {
      continue;
    }
    knownAgentIds.add(agent.id);
    if (!agent.archivedAt) {
      activeAgentIds.add(agent.id);
      const parentAgent = agent.parentAgentId ? agentsById.get(agent.parentAgentId) : undefined;
      if (isWorkspaceRootAgent(agent, parentAgent)) {
        autoOpenAgentIds.add(agent.id);
      }
    }
  }
  for (const agent of agentDetails?.values() ?? []) {
    if (!agentBelongsToWorkspace(agent, workspaceId)) {
      continue;
    }
    knownAgentIds.add(agent.id);
  }
  includeSplitChats({
    ids: input.splitAgentIds,
    agentsById,
    sessionAgents,
    knownAgentIds,
    activeAgentIds,
  });
  includeParentWorkspaceTasks({
    agentsById,
    sessionAgents,
    workspaceId,
    knownAgentIds,
    activeAgentIds,
  });

  return { activeAgentIds, autoOpenAgentIds, knownAgentIds };
}

export function buildWorkspaceTabSnapshot(input: {
  agentVisibility: WorkspaceAgentVisibility;
  agentsHydrated: boolean;
  terminalsHydrated: boolean;
  knownTerminalIds: Iterable<string>;
  standaloneTerminalIds: Iterable<string>;
  hasActivePendingTerminalCreate: boolean;
  hasActivePendingDraftCreate: boolean;
}): WorkspaceTabSnapshot {
  return {
    agentsHydrated: input.agentsHydrated,
    terminalsHydrated: input.terminalsHydrated,
    activeAgentIds: input.agentVisibility.activeAgentIds,
    autoOpenAgentIds: input.agentVisibility.autoOpenAgentIds,
    knownAgentIds: input.agentVisibility.knownAgentIds,
    knownTerminalIds: input.knownTerminalIds,
    standaloneTerminalIds: input.standaloneTerminalIds,
    hasActivePendingTerminalCreate: input.hasActivePendingTerminalCreate,
    hasActivePendingDraftCreate: input.hasActivePendingDraftCreate,
  };
}

export function workspaceAgentVisibilityEqual(
  a: WorkspaceAgentVisibility,
  b: WorkspaceAgentVisibility,
): boolean {
  return (
    setsEqual(a.activeAgentIds, b.activeAgentIds) &&
    setsEqual(a.autoOpenAgentIds, b.autoOpenAgentIds) &&
    setsEqual(a.knownAgentIds, b.knownAgentIds)
  );
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const item of a) {
    if (!b.has(item)) {
      return false;
    }
  }
  return true;
}

// Prune agent tabs that are no longer active once agents are hydrated.
// Archived agents get pruned so that archiving on one client closes the tab on all clients.
export function shouldPruneWorkspaceAgentTab(input: {
  agentId: string;
  agentsHydrated: boolean;
  activeAgentIds: Set<string>;
}): boolean {
  if (!input.agentId.trim()) {
    return false;
  }
  if (!input.agentsHydrated) {
    return false;
  }
  return !input.activeAgentIds.has(input.agentId);
}
