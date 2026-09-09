import type { ArchiveAgentInput } from "@/hooks/use-archive-agent";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";

interface ArchiveSidebarChatInput extends ArchiveAgentInput {
  workspaceId: string;
  archiveAgent: (input: ArchiveAgentInput) => Promise<void>;
}

export async function archiveSidebarChat(input: ArchiveSidebarChatInput): Promise<void> {
  const workspaceKey = `${input.serverId}:${input.workspaceId}`;
  const store = useWorkspaceLayoutStore.getState();
  const tabs = store.getWorkspaceTabs(workspaceKey);

  // Close before the RPC: a later History reopen or chat selection belongs to the user.
  store.unpinAgent(workspaceKey, input.agentId);
  store.hideAgent(workspaceKey, input.agentId);
  for (const tab of tabs) {
    if (tab.target.kind === "agent" && tab.target.agentId === input.agentId) {
      store.closeTab(workspaceKey, tab.tabId);
    }
  }
  await input.archiveAgent({ serverId: input.serverId, agentId: input.agentId });
}
