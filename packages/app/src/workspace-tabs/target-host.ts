import { type PaneHost, panelSupportsHost } from "@/panels/panel-manifest";
import { panelTargetSupportsHostForWorkspaceKey } from "@/plugins/workspace-panels/locations";
import { useSessionStore } from "@/stores/session-store";
import { isWorkspaceRootAgent } from "@/subagents/policies";
import { pluginRegistry } from "@/plugins/registry";
import { resolvePluginWorkspacePanel } from "@/plugins/workspace-panels/resolution";
import type { WorkspaceTabTarget } from "./model";

function resolveAgentTargetHost(
  workspaceKey: string,
  target: Extract<WorkspaceTabTarget, { kind: "agent" }>,
  previousHost?: PaneHost,
): PaneHost {
  const sessions = useSessionStore.getState().sessions;
  const serverId = Object.keys(sessions)
    .sort((left, right) => right.length - left.length)
    .find((id) => workspaceKey.startsWith(`${id}:`));
  const session = serverId ? sessions[serverId] : undefined;
  const agent = session?.agents.get(target.agentId) ?? session?.agentDetails.get(target.agentId);
  // Hydration must not move a saved child into main before its snapshot arrives.
  if (!agent) return previousHost ?? "main";
  if (!agent.parentAgentId) return "main";
  const parent =
    session?.agents.get(agent.parentAgentId) ?? session?.agentDetails.get(agent.parentAgentId);
  const workspaceId = serverId ? workspaceKey.slice(serverId.length + 1) : null;
  if (!parent && agent.workspaceId === workspaceId) return previousHost ?? "main";
  return agent.workspaceId !== workspaceId || !isWorkspaceRootAgent(agent, parent)
    ? "explorer"
    : "main";
}

function resolvePluginTargetHost(
  workspaceKey: string,
  target: Extract<WorkspaceTabTarget, { kind: "plugin" }>,
  previousHost?: PaneHost,
): PaneHost {
  const plugin = pluginRegistry
    .getSnapshot()
    .find(
      (candidate) =>
        candidate.id === target.pluginId && workspaceKey.startsWith(`${candidate.serverId}:`),
    );
  if (
    resolvePluginWorkspacePanel(plugin ?? null, target) &&
    panelTargetSupportsHostForWorkspaceKey(workspaceKey, target, "explorer")
  ) {
    return "explorer";
  }
  // Keep a saved unavailable panel in place until its contribution loads.
  if (previousHost && panelTargetSupportsHostForWorkspaceKey(workspaceKey, target, previousHost)) {
    return previousHost;
  }
  return panelTargetSupportsHostForWorkspaceKey(workspaceKey, target, "explorer")
    ? "explorer"
    : "main";
}

/** Root conversations stay in main; child tasks and supporting tools use the dock. */
export function resolveWorkspaceTargetHost(
  workspaceKey: string,
  target: WorkspaceTabTarget,
  previousHost?: PaneHost,
): PaneHost {
  if (target.kind === "new_tab") return previousHost ?? "main";
  if (target.kind === "agent") return resolveAgentTargetHost(workspaceKey, target, previousHost);
  if (target.kind === "plugin") return resolvePluginTargetHost(workspaceKey, target, previousHost);
  return panelSupportsHost(target.kind, "explorer") ? "explorer" : "main";
}
