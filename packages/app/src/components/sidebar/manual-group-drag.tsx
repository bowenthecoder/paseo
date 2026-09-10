import type { ReactNode } from "react";
import type { ManualChatEntry } from "./manual-chat-groups";

export function ManualGroupDropZone({ children }: { children: ReactNode; groupId: string }) {
  return children;
}
export function ManualGroupDraggable({ children }: { children: ReactNode; chat: ManualChatEntry }) {
  return children;
}
