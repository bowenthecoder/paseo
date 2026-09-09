import { useStableEvent } from "@/hooks/use-stable-event";
import { useIsCompactFormFactor } from "@/constants/layout";
import { DropdownMenuItem, DropdownMenuSubTrigger } from "@/components/ui/dropdown-menu";
import type { MenuPageDefinition } from "@/components/ui/menu";
import { useActiveWorkspaceSelection } from "@/stores/navigation-active-workspace-store";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { useSidebarUnreadStore } from "@/stores/sidebar-unread-store";
import { navigateToAgent } from "@/utils/navigate-to-agent";
import { openSidebarChatInSplitView, resolveChatSplitAvailability } from "./chat-split-view";

export const WORKSPACE_OPEN_PAGE = "workspace-open-in";

export function WorkspaceOpenMenuTrigger() {
  return (
    <DropdownMenuSubTrigger id={WORKSPACE_OPEN_PAGE} shortcut="O">
      Open in
    </DropdownMenuSubTrigger>
  );
}

interface WorkspaceOpenOptionsProps {
  serverId: string;
  workspaceId: string;
  agentId: string;
}

function WorkspaceOpenOptions({ serverId, workspaceId, agentId }: WorkspaceOpenOptionsProps) {
  const active = useActiveWorkspaceSelection();
  const isCompact = useIsCompactFormFactor();
  const layout = useWorkspaceLayoutStore((state) =>
    active ? state.layoutByWorkspace[`${active.serverId}:${active.workspaceId}`] : undefined,
  );
  const availability = resolveChatSplitAvailability({
    active,
    serverId,
    agentId,
    isCompact,
    layout,
  });
  const openCurrent = useStableEvent(() => {
    useSidebarUnreadStore.getState().setUnread(`${serverId}:chat:${agentId}`, false);
    navigateToAgent({ serverId, workspaceId, agentId });
  });
  const openSplit = useStableEvent(() => {
    openSidebarChatInSplitView({ active, serverId, agentId, isCompact });
  });
  return (
    <>
      <DropdownMenuItem testID="sidebar-open-current-view" onSelect={openCurrent}>
        Current view
      </DropdownMenuItem>
      <DropdownMenuItem
        shortcut="S"
        testID="sidebar-open-split-right"
        disabled={!availability.available}
        description={availability.available ? undefined : availability.reason}
        onSelect={openSplit}
      >
        Open in split view
      </DropdownMenuItem>
    </>
  );
}

export function workspaceOpenMenuPage(
  serverId: string,
  workspaceId: string,
  agentId: string,
): MenuPageDefinition {
  return {
    id: WORKSPACE_OPEN_PAGE,
    title: "Open in",
    content: <WorkspaceOpenOptions {...{ serverId, workspaceId, agentId }} />,
  };
}
