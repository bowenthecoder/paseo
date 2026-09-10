import type { Agent } from "@/stores/session-store";
import type { WorkspaceTab, WorkspaceTabTarget } from "@/workspace-tabs/model";

/** Explicit chat actions must never fall back to a different chat in the same folder. */
export function resolveWorkspaceActionAgent(input: {
  agents: ReadonlyMap<string, Agent> | undefined;
  workspaceId: string;
  agentId?: string;
  focusedTarget?: WorkspaceTabTarget;
}): Agent | null {
  const { agents, workspaceId, agentId, focusedTarget } = input;
  if (!agents) return null;
  if (agentId !== undefined) {
    const selected = agents.get(agentId);
    return selected?.workspaceId === workspaceId && !selected.archivedAt ? selected : null;
  }
  if (focusedTarget?.kind === "agent") {
    const selected = agents.get(focusedTarget.agentId);
    if (selected?.workspaceId === workspaceId && !selected.archivedAt) return selected;
  }
  const candidates = Array.from(agents.values()).filter(
    (agent) => agent.workspaceId === workspaceId && !agent.archivedAt && !agent.parentAgentId,
  );
  return candidates.length === 1 ? candidates[0]! : null;
}

export function resolveWorkspaceOpenTarget(input: {
  tabs: readonly WorkspaceTab[];
  agentId?: string;
  draftId: () => string;
}): WorkspaceTabTarget {
  if (input.agentId !== undefined) return { kind: "agent", agentId: input.agentId };
  return (
    input.tabs.find((tab) => tab.target.kind === "agent")?.target ??
    input.tabs.find((tab) => tab.target.kind !== "new_tab")?.target ?? {
      kind: "draft",
      draftId: input.draftId(),
    }
  );
}
