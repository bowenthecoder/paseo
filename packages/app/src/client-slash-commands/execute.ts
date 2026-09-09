import { buildDraftAgentSetup, type ClientSlashCommand } from "@/client-slash-commands";
import type { ArchiveAgentInput } from "@/hooks/use-archive-agent";
import type { PaneContextValue } from "@/panels/pane-context";
import { generateDraftId } from "@/stores/draft-keys";
import type { NavigateToWorkspaceInput } from "@/stores/navigation-active-workspace-store/navigation";
import type { Agent } from "@/stores/session-store";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { buildWorkspaceTabPersistenceKey, type WorkspaceTabTarget } from "@/workspace-tabs/model";

export interface ExecuteAgentClientCommandInput {
  serverId: string;
  agent: Agent;
  command: ClientSlashCommand;
  pane: Pick<
    PaneContextValue,
    "workspaceId" | "layoutWorkspaceId" | "host" | "tabId" | "retargetCurrentTab"
  >;
  archiveAgent: (input: ArchiveAgentInput) => Promise<void>;
  navigateToWorkspace: (input: NavigateToWorkspaceInput) => void;
}

export async function executeAgentClientCommand(
  input: ExecuteAgentClientCommandInput,
): Promise<void> {
  const { serverId, agent, command, pane } = input;
  const workspaceKey = buildWorkspaceTabPersistenceKey({
    serverId,
    workspaceId: pane.layoutWorkspaceId ?? pane.workspaceId,
  });
  const store = useWorkspaceLayoutStore.getState();
  if (workspaceKey) {
    store.unpinAgent(workspaceKey, agent.id);
    store.hideAgent(workspaceKey, agent.id);
  }

  if (command.kind === "replace-agent-with-draft") {
    const target: WorkspaceTabTarget = {
      kind: "draft",
      draftId: generateDraftId(),
      setup: buildDraftAgentSetup(agent),
    };
    if (pane.host === "explorer") {
      if (workspaceKey) {
        store.closeTab(workspaceKey, pane.tabId);
      }
      input.navigateToWorkspace({
        serverId,
        workspaceId: agent.workspaceId ?? pane.workspaceId,
        target,
      });
    } else {
      pane.retargetCurrentTab(target);
    }
  } else if (workspaceKey) {
    store.closeTab(workspaceKey, pane.tabId);
  }

  // Complete local selection before the request so a later History reopen remains selected.
  await input.archiveAgent({ serverId, agentId: agent.id });
}
