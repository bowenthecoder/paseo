import type { ArchiveAgentInput } from "@/hooks/use-archive-agent";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";

interface ArchiveSidebarChatInput extends ArchiveAgentInput {
  workspaceId: string;
  archiveAgent: (input: ArchiveAgentInput) => Promise<void>;
}

export async function archiveSidebarChat(input: ArchiveSidebarChatInput): Promise<void> {
  const workspaceKey = `${input.serverId}:${input.workspaceId}`;
  const store = useWorkspaceLayoutStore.getState();

  // Close before the RPC: a later History reopen or chat selection belongs to the user.
  // A chat may also be displayed beside another folder's chat on the same device.
  const keys = new Set([
    workspaceKey,
    ...Object.keys(store.layoutByWorkspace).filter((key) => key.startsWith(`${input.serverId}:`)),
  ]);
  for (const key of keys) {
    const tabs = store
      .getWorkspaceTabs(key)
      .filter((tab) => tab.target.kind === "agent" && tab.target.agentId === input.agentId);
    if (key !== workspaceKey && tabs.length === 0) continue;
    store.unpinAgent(key, input.agentId);
    store.hideAgent(key, input.agentId);
    for (const tab of tabs) {
      store.closeTab(key, tab.tabId);
    }
  }
  await input.archiveAgent({ serverId: input.serverId, agentId: input.agentId });
}
