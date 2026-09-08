import type { ReactNode } from "react";

export function ManualGroupDragRoot({
  children,
}: {
  children: ReactNode;
  onDrop: (workspaceKey: string, groupId: string) => void;
}) {
  return children;
}
export function ManualGroupDropZone({ children }: { children: ReactNode; groupId: string }) {
  return children;
}
export function ManualGroupDraggable({ children }: { children: ReactNode; workspaceKey: string }) {
  return children;
}
