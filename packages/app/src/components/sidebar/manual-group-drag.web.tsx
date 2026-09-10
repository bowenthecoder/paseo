import { useMemo, type ReactNode } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import type { ManualChatEntry } from "./manual-chat-groups";
import type { ChatDragPayload } from "./chat-drag-store";

export function ManualGroupDropZone({
  children,
  groupId,
}: {
  children: ReactNode;
  groupId: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `chat-group:${groupId}`, data: { groupId } });
  return (
    <div ref={setNodeRef} data-testid={`sidebar-group-drop-${groupId}`}>
      <View style={isOver ? styles.dropActive : styles.dropIdle}>{children}</View>
    </div>
  );
}

const styles = StyleSheet.create((theme) => ({
  dropIdle: { borderRadius: 6 },
  dropActive: {
    borderRadius: 6,
    backgroundColor: theme.colors.surfaceSidebarHover,
    outlineWidth: 1,
    outlineStyle: "solid",
    outlineColor: theme.colors.foregroundMuted,
    outlineOffset: -1,
  },
}));

export function ManualGroupDraggable({
  children,
  chat,
}: {
  children: ReactNode;
  chat: ManualChatEntry;
}) {
  const payload = useMemo<ChatDragPayload>(
    () => ({
      kind: "chat",
      workspaceKey: chat.workspaceKey,
      serverId: chat.serverId,
      workspaceId: chat.workspaceId,
      agentId: chat.agentId,
      title: chat.title ?? chat.name,
    }),
    [chat.agentId, chat.name, chat.serverId, chat.title, chat.workspaceId, chat.workspaceKey],
  );
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: chat.workspaceKey,
    data: payload,
  });
  // The row stays in place; the ChatDragRoot overlay chip is what follows the pointer.
  const style = useMemo(
    () => ({
      position: "relative" as const,
      opacity: isDragging ? 0.5 : 1,
      touchAction: "pan-y",
    }),
    [isDragging],
  );
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} tabIndex={-1} style={style}>
      {children}
    </div>
  );
}
