import { useCallback, useMemo, type ReactNode } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  pointerWithin,
  rectIntersection,
  type DragEndEvent,
  type CollisionDetection,
} from "@dnd-kit/core";

const groupCollision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : rectIntersection(args);
};

export function ManualGroupDragRoot({
  children,
  onDrop,
}: {
  children: ReactNode;
  onDrop: (workspaceKey: string, groupId: string) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );
  const finish = useCallback(
    ({ active, over }: DragEndEvent) => {
      const groupId = over?.data.current?.groupId;
      if (typeof groupId === "string") onDrop(String(active.id), groupId);
    },
    [onDrop],
  );
  return (
    <DndContext sensors={sensors} collisionDetection={groupCollision} onDragEnd={finish}>
      {children}
    </DndContext>
  );
}

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
  workspaceKey,
}: {
  children: ReactNode;
  workspaceKey: string;
}) {
  const { setNodeRef, attributes, listeners, transform, isDragging } = useDraggable({
    id: workspaceKey,
  });
  const style = useMemo(
    () => ({
      position: "relative" as const,
      zIndex: isDragging ? 2 : undefined,
      opacity: isDragging ? 0.5 : 1,
      transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
      touchAction: "pan-y",
    }),
    [isDragging, transform],
  );
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} tabIndex={-1} style={style}>
      {children}
    </div>
  );
}
