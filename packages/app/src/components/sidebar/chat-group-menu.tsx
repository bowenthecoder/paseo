import { useCallback } from "react";
import { DropdownMenuItem, DropdownMenuSubTrigger } from "@/components/ui/dropdown-menu";
import type { MenuPageDefinition } from "@/components/ui/menu";
import { useSidebarChatGroupsStore } from "@/stores/sidebar-chat-groups-store";

const MOVE_GROUP_PAGE = "chat-move-to-group";

export function MoveChatToGroupTrigger() {
  return (
    <DropdownMenuSubTrigger id={MOVE_GROUP_PAGE} shortcut="M" testID="sidebar-move-to-group">
      Move to group
    </DropdownMenuSubTrigger>
  );
}

function MoveChatToGroupOptions({ workspaceKey }: { workspaceKey: string }) {
  const groups = useSidebarChatGroupsStore((state) => state.groups);
  const moveChat = useSidebarChatGroupsStore((state) => state.moveChat);
  const openEditor = useSidebarChatGroupsStore((state) => state.openEditor);
  const ungroup = useCallback(() => moveChat(workspaceKey, null), [moveChat, workspaceKey]);
  const create = useCallback(() => openEditor(null, workspaceKey), [openEditor, workspaceKey]);
  return (
    <>
      <DropdownMenuItem testID="sidebar-move-ungrouped" onSelect={ungroup}>
        Ungrouped
      </DropdownMenuItem>
      {groups.map((group) => (
        <GroupOption key={group.id} id={group.id} name={group.name} workspaceKey={workspaceKey} />
      ))}
      <DropdownMenuItem testID="sidebar-move-new-group" onSelect={create}>
        New group…
      </DropdownMenuItem>
    </>
  );
}

export function moveChatToGroupPage(workspaceKey: string): MenuPageDefinition {
  return {
    id: MOVE_GROUP_PAGE,
    title: "Move to group",
    content: <MoveChatToGroupOptions workspaceKey={workspaceKey} />,
  };
}

function GroupOption({
  id,
  name,
  workspaceKey,
}: {
  id: string;
  name: string;
  workspaceKey: string;
}) {
  const move = useCallback(
    () => useSidebarChatGroupsStore.getState().moveChat(workspaceKey, id),
    [id, workspaceKey],
  );
  return (
    <DropdownMenuItem testID={`sidebar-move-group-${id}`} onSelect={move}>
      {name}
    </DropdownMenuItem>
  );
}
