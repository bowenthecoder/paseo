import { create } from "zustand";
import type { ChatSplitAvailability } from "./chat-split-view";

/** The one droppable the chat area registers for sidebar chats. */
export const CHAT_SPLIT_DROP_ID = "chat-split-target";

/** What a dragged sidebar chat carries; the drop targets only need ids and a name. */
export interface ChatDragPayload {
  kind: "chat";
  workspaceKey: string;
  serverId: string;
  workspaceId: string;
  agentId: string;
  title: string;
}

export function isChatDragPayload(value: unknown): value is ChatDragPayload {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    record.kind === "chat" &&
    typeof record.workspaceKey === "string" &&
    typeof record.serverId === "string" &&
    typeof record.workspaceId === "string" &&
    typeof record.agentId === "string" &&
    typeof record.title === "string"
  );
}

interface ChatDragState {
  /** The chat currently being dragged, so surfaces outside the sidebar can react. */
  activeDrag: ChatDragPayload | null;
  setActiveDrag: (activeDrag: ChatDragPayload | null) => void;
}

export const useChatDragStore = create<ChatDragState>((set) => ({
  activeDrag: null,
  setActiveDrag: (activeDrag) => set({ activeDrag }),
}));

export interface ChatDropPresentation {
  enabled: boolean;
  label: string;
}

/** What the chat area says while a chat hovers over it: the action, or why it is refused. */
export function describeChatDrop(input: {
  title: string;
  availability: ChatSplitAvailability;
}): ChatDropPresentation {
  if (input.availability.available) {
    const title = input.title.trim();
    return { enabled: true, label: title ? `Open "${title}" in split view` : "Open in split view" };
  }
  return { enabled: false, label: input.availability.reason };
}
