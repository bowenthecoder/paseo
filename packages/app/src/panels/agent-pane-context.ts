import type { PaneContextValue } from "@/panels/pane-context";
import { anchorWorkspaceFileOpenRequest } from "@/workspace/file-open";

interface AgentPaneDirectory {
  workspaceId?: string;
  cwd: string;
}

/** Keeps task tools bound to their working folder while opening views in the parent dock. */
export function createAgentPaneContext(
  context: PaneContextValue,
  agent: AgentPaneDirectory | null,
): PaneContextValue {
  if (context.host !== "explorer" || !agent) return context;
  const layoutWorkspaceId = context.layoutWorkspaceId ?? context.workspaceId;
  return {
    ...context,
    workspaceId: agent.workspaceId ?? context.workspaceId,
    layoutWorkspaceId,
    openTab: (target) => {
      context.openTab(
        target.kind === "working_diff" &&
          !target.workspaceId &&
          agent.workspaceId &&
          agent.workspaceId !== layoutWorkspaceId
          ? { ...target, workspaceId: agent.workspaceId }
          : target,
      );
    },
    openFileInWorkspace: (request) => {
      const anchored = anchorWorkspaceFileOpenRequest(request, agent.cwd);
      if (anchored) context.openFileInWorkspace(anchored);
    },
  };
}
