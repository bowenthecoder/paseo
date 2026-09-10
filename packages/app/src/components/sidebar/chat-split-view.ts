import type { ActiveWorkspaceSelection } from "@/stores/last-workspace-selection";
import {
  collectAllTabs,
  collectChatPanes,
  findPaneContainingTab,
  DEFAULT_PANE_ID,
  type WorkspaceLayout,
} from "@/stores/workspace-layout-actions";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { useSidebarUnreadStore } from "@/stores/sidebar-unread-store";

interface ChatSplitInput {
  active: ActiveWorkspaceSelection | null;
  serverId: string;
  agentId: string;
  isCompact: boolean;
}

export type ChatSplitAvailability =
  | { available: false; reason: string }
  | { available: true; workspaceKey: string; parentTabId: string };

export function resolveChatSplitAvailability(
  input: ChatSplitInput & { layout: WorkspaceLayout | undefined },
): ChatSplitAvailability {
  if (input.isCompact) {
    return { available: false, reason: "Widen the window to show multiple chats together." };
  }
  if (!input.active || !input.layout) {
    return { available: false, reason: "Open a chat first." };
  }
  if (input.active.serverId !== input.serverId) {
    return { available: false, reason: "Split view requires chats on the same device." };
  }
  const panes = collectChatPanes(input.layout.root);
  const selectedPane = panes.find((pane) => pane.id === input.layout?.focusedPaneId);
  const tabs = collectAllTabs(input.layout.root);
  const focusedTabs = [selectedPane, ...panes].flatMap((pane) =>
    pane ? tabs.filter((tab) => tab.tabId === pane.focusedTabId) : [],
  );
  const selected = focusedTabs.find(
    (tab) => tab.target.kind === "agent" || tab.target.kind === "draft",
  );
  const existing = collectAllTabs(input.layout.root).find(
    (tab) =>
      tab.target.kind === "agent" &&
      tab.target.agentId === input.agentId &&
      tab.target.view === "split",
  );
  const existingPane = existing ? findPaneContainingTab(input.layout.root, existing.tabId) : null;
  const alreadySplit = Boolean(
    existingPane && existingPane.id !== DEFAULT_PANE_ID && existingPane.id !== "explorer",
  );
  const hasEmptyPane = panes.some(
    (pane) =>
      pane.id !== DEFAULT_PANE_ID &&
      collectAllTabs({ kind: "pane", pane }).every((tab) => tab.target.kind === "new_tab"),
  );
  if (!alreadySplit && panes.length >= 4 && !hasEmptyPane) {
    return { available: false, reason: "Four chat views are already open. Close a view first." };
  }
  if (!selected || (selected.target.kind !== "agent" && selected.target.kind !== "draft")) {
    return { available: false, reason: "Open a chat first." };
  }
  if (
    !alreadySplit &&
    selected.target.kind === "agent" &&
    selected.target.agentId === input.agentId
  ) {
    return { available: false, reason: "This chat is already in the current view." };
  }
  return {
    available: true,
    workspaceKey: `${input.active.serverId}:${input.active.workspaceId}`,
    parentTabId: selected.tabId,
  };
}

/** A split changes the saved view only; the chat keeps its device, folder and parentage. */
export function openSidebarChatInSplitView(input: ChatSplitInput): string | null {
  const store = useWorkspaceLayoutStore.getState();
  const key = input.active ? `${input.active.serverId}:${input.active.workspaceId}` : null;
  const destination = resolveChatSplitAvailability({
    ...input,
    layout: key ? store.layoutByWorkspace[key] : undefined,
  });
  if (!destination.available) return null;
  const tabId = store.openTab({
    workspaceKey: destination.workspaceKey,
    target: { kind: "agent", agentId: input.agentId, view: "split" },
    intent: "reveal",
    parentTabId: destination.parentTabId,
    pin: true,
  });
  if (tabId) {
    useSidebarUnreadStore.getState().setUnread(`${input.serverId}:chat:${input.agentId}`, false);
  }
  return tabId;
}
