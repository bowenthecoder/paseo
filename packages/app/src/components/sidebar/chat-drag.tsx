import type { ReactNode } from "react";

// Native has no pointer drag between the sidebar and the chat area; the web file owns it.
export function ChatDragRoot({ children }: { children: ReactNode }) {
  return children;
}

export function ChatSplitDropZone({
  children,
}: {
  children: ReactNode;
  serverId: string;
  workspaceId: string;
  enabled: boolean;
}) {
  return children;
}
