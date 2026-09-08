import { useStableEvent } from "@/hooks/use-stable-event";
import { useState } from "react";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useToast } from "@/contexts/toast-context";
import { useForkAgent } from "@/hooks/use-fork-agent";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import { useSessionStore } from "@/stores/session-store";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { findPaneById } from "@/stores/workspace-layout-actions";
import { confirmDialog } from "@/utils/confirm-dialog";
import { resolveWorkspaceActionAgent } from "./workspace-chat-target";

/** Workspace rows can contain several chats; name the selected chat before acting on it. */
export function WorkspaceChatActions({
  serverId,
  workspaceId,
  agentId,
  action,
}: {
  serverId: string;
  workspaceId: string;
  agentId?: string;
  action?: "fork" | "delete";
}) {
  const toast = useToast();
  const client = useHostRuntimeClient(serverId);
  const fork = useForkAgent({ serverId, toast });
  const [pending, setPending] = useState(false);
  const key = `${serverId}:${workspaceId}`;
  const layout = useWorkspaceLayoutStore((state) => state.layoutByWorkspace[key]);
  const focusedTabId = layout
    ? findPaneById(layout.root, layout.focusedPaneId)?.focusedTabId
    : null;
  const tabs = useWorkspaceLayoutStore.getState().getWorkspaceTabs(key);
  const focused = tabs.find((tab) => tab.tabId === focusedTabId)?.target;
  const agent = useSessionStore((state) =>
    resolveWorkspaceActionAgent({
      agents: state.sessions[serverId]?.agents,
      workspaceId,
      agentId,
      focusedTarget: focused,
    }),
  );
  const run = async (operation: () => Promise<void>) => {
    setPending(true);
    try {
      await operation();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Chat action failed");
    } finally {
      setPending(false);
    }
  };
  const handleFork = useStableEvent(() => {
    if (!agent) return;
    void run(async () => {
      await fork({ agentId: agent.id, agent, workspaceId, target: "tab" });
    });
  });
  const handleDelete = useStableEvent(() => {
    if (!agent) return;
    void run(async () => {
      if (!client) return;
      const confirmed = await confirmDialog({
        title: "Delete chat?",
        message: `Delete “${
          agent.title ?? "Untitled chat"
        }” and its conversation history? This cannot be undone.`,
        confirmLabel: "Delete",
        destructive: true,
      });
      if (confirmed) await client.deleteAgent(agent.id);
    });
  });
  if (!agent) return null;
  return (
    <>
      {!action ? <DropdownMenuSeparator /> : null}
      {action !== "delete" ? (
        <DropdownMenuItem
          shortcut="F"
          description={agentId ? undefined : (agent.title ?? "Selected chat")}
          disabled={pending || !client}
          testID="sidebar-workspace-fork"
          onSelect={handleFork}
        >
          Fork
        </DropdownMenuItem>
      ) : null}
      {action !== "fork" ? (
        <DropdownMenuItem
          shortcut="D"
          description={agentId ? undefined : (agent.title ?? "Selected chat")}
          destructive
          disabled={pending || !client}
          testID="sidebar-workspace-delete"
          onSelect={handleDelete}
        >
          Delete chat
        </DropdownMenuItem>
      ) : null}
    </>
  );
}
