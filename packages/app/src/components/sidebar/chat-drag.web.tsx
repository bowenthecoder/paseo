import { useCallback, useMemo, type ReactNode } from "react";
import { Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Columns2 } from "lucide-react-native";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useIsCompactFormFactor } from "@/constants/layout";
import { useStableEvent } from "@/hooks/use-stable-event";
import { useActiveWorkspaceSelection } from "@/stores/navigation-active-workspace-store";
import {
  PINNED_CHAT_GROUP,
  UNGROUPED_CHATS,
  useSidebarChatGroupsStore,
} from "@/stores/sidebar-chat-groups-store";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import type { Theme } from "@/styles/theme";
import { openSidebarChatInSplitView, resolveChatSplitAvailability } from "./chat-split-view";
import {
  CHAT_SPLIT_DROP_ID,
  describeChatDrop,
  isChatDragPayload,
  useChatDragStore,
} from "./chat-drag-store";

const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : rectIntersection(args);
};

function moveChatToGroup(workspaceKey: string, groupId: string): void {
  const state = useSidebarChatGroupsStore.getState();
  const pinned = groupId === PINNED_CHAT_GROUP;
  state.setPinned(workspaceKey, pinned);
  if (!pinned) state.moveChat(workspaceKey, groupId === UNGROUPED_CHATS ? null : groupId);
}

/**
 * One drag context above both the sidebar and the chat area, so a chat row can be dropped on
 * a sidebar group or on the chat area. The row itself stays put; the floating chip is what
 * follows the pointer, the way the Claude Code app drags a session out to a new pane.
 */
export function ChatDragRoot({ children }: { children: ReactNode }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );
  const active = useActiveWorkspaceSelection();
  const isCompact = useIsCompactFormFactor();
  const activeDrag = useChatDragStore((state) => state.activeDrag);
  const setActiveDrag = useChatDragStore((state) => state.setActiveDrag);
  const start = useCallback(
    ({ active: dragged }: DragStartEvent) => {
      const data = dragged.data.current;
      setActiveDrag(isChatDragPayload(data) ? data : null);
    },
    [setActiveDrag],
  );
  const cancel = useCallback(() => setActiveDrag(null), [setActiveDrag]);
  const finish = useStableEvent(({ active: dragged, over }: DragEndEvent) => {
    setActiveDrag(null);
    const data = dragged.data.current;
    if (!isChatDragPayload(data)) return;
    const target = over?.data.current;
    const groupId = target?.groupId;
    if (typeof groupId === "string") {
      moveChatToGroup(data.workspaceKey, groupId);
      return;
    }
    if (target?.kind === "chat-split") {
      openSidebarChatInSplitView({
        active,
        serverId: data.serverId,
        agentId: data.agentId,
        isCompact,
      });
    }
  });
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={start}
      onDragEnd={finish}
      onDragCancel={cancel}
    >
      {children}
      <DragOverlay dropAnimation={null} zIndex={2000}>
        {activeDrag ? (
          <View style={styles.chip} testID="chat-drag-chip">
            <ThemedColumns size={14} uniProps={mutedIconColorMapping} />
            <Text numberOfLines={1} style={styles.chipText}>
              {activeDrag.title}
            </Text>
          </View>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

/**
 * Wraps the chat grid. While a sidebar chat is being dragged it shows what dropping here does:
 * open the chat as the next view, or the reason the split is refused (four views open, wrong
 * device, already the current view). The drop itself is resolved by the root.
 */
export function ChatSplitDropZone({
  children,
  serverId,
  workspaceId,
  enabled,
}: {
  children: ReactNode;
  serverId: string;
  workspaceId: string;
  enabled: boolean;
}) {
  const activeDrag = useChatDragStore((state) => state.activeDrag);
  const isCompact = useIsCompactFormFactor();
  const layout = useWorkspaceLayoutStore(
    (state) => state.layoutByWorkspace[`${serverId}:${workspaceId}`],
  );
  const { setNodeRef, isOver } = useDroppable({
    id: CHAT_SPLIT_DROP_ID,
    data: { kind: "chat-split" },
    disabled: !enabled || !activeDrag,
  });
  const presentation = useMemo(
    () =>
      enabled && activeDrag
        ? describeChatDrop({
            title: activeDrag.title,
            availability: resolveChatSplitAvailability({
              active: { serverId, workspaceId },
              serverId: activeDrag.serverId,
              agentId: activeDrag.agentId,
              isCompact,
              layout,
            }),
          })
        : null,
    [activeDrag, enabled, isCompact, layout, serverId, workspaceId],
  );
  const overlayDataSet = useMemo(
    () => ({
      over: isOver ? "true" : "false",
      enabled: presentation?.enabled ? "true" : "false",
    }),
    [isOver, presentation?.enabled],
  );
  return (
    <div ref={setNodeRef} style={dropZoneStyle} data-testid="chat-split-drop-zone">
      {children}
      {presentation ? (
        <View
          pointerEvents="none"
          style={styles.overlay}
          testID="chat-split-drop-overlay"
          dataSet={overlayDataSet}
        >
          <View style={styles.backdrop} />
          <View
            style={[
              styles.card,
              presentation.enabled ? null : styles.cardRefused,
              isOver && presentation.enabled ? styles.cardOver : null,
            ]}
          >
            <ThemedColumns
              size={20}
              uniProps={presentation.enabled ? accentIconColorMapping : mutedIconColorMapping}
            />
            <Text style={presentation.enabled ? styles.cardText : styles.cardTextMuted}>
              {presentation.label}
            </Text>
          </View>
        </View>
      ) : null}
    </div>
  );
}

const dropZoneStyle = {
  flex: 1,
  minHeight: 0,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  position: "relative",
} as const;

const ThemedColumns = withUnistyles(Columns2);
const mutedIconColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const accentIconColorMapping = (theme: Theme) => ({ color: theme.colors.accent });

const styles = StyleSheet.create((theme) => ({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    maxWidth: 280,
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
  },
  chipText: {
    flexShrink: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.surface0,
    opacity: 0.7,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    maxWidth: 420,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    borderRadius: theme.borderRadius.md,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
  },
  cardOver: {
    borderColor: theme.colors.accent,
  },
  cardRefused: {
    borderStyle: "dashed",
  },
  cardText: {
    flexShrink: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
  },
  cardTextMuted: {
    flexShrink: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
  },
}));
