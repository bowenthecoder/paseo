import { memo, useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { AdaptiveRenameModal } from "@/components/rename-modal";
import { SidebarActivityGlow } from "./activity-glow";
import { useIsCompactFormFactor } from "@/constants/layout";
import { isNative } from "@/constants/platform";
import { useToast } from "@/contexts/toast-context";
import { useArchiveAgent } from "@/hooks/use-archive-agent";
import { useKeyboardActionHandler } from "@/hooks/use-keyboard-action-handler";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import { useActiveWorkspaceSelection } from "@/stores/navigation-active-workspace-store";
import { useSidebarChatGroupsStore } from "@/stores/sidebar-chat-groups-store";
import { useSidebarUnreadStore } from "@/stores/sidebar-unread-store";
import { findPaneById } from "@/stores/workspace-layout-actions";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { navigateToAgent } from "@/utils/navigate-to-agent";
import { SidebarWorkspaceContextMenu, SidebarWorkspaceMenu } from "./sidebar-workspace-menu";
import { useOpenKebabMenuVisibility } from "./use-open-kebab-menu-visibility";
import type { ManualChatEntry } from "./manual-chat-groups";

function useChatSelected(chat: ManualChatEntry): boolean {
  const active = useActiveWorkspaceSelection();
  return useWorkspaceLayoutStore((state) => {
    if (active?.serverId !== chat.serverId || active.workspaceId !== chat.workspaceId) return false;
    const key = `${chat.serverId}:${chat.workspaceId}`;
    const layout = state.layoutByWorkspace[key];
    if (!layout) return false;
    const focusedTabId = findPaneById(layout.root, layout.focusedPaneId)?.focusedTabId;
    const target = state.getWorkspaceTabs(key).find((tab) => tab.tabId === focusedTabId)?.target;
    return target?.kind === "agent" && target.agentId === chat.agentId;
  });
}

export const ManualChatRow = memo(function ManualChatRow({
  chat,
  onWorkspacePress,
}: {
  chat: ManualChatEntry;
  onWorkspacePress?: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const selected = useChatSelected(chat);
  const compact = useIsCompactFormFactor();
  const pinned = useSidebarChatGroupsStore((state) => Boolean(state.pinned[chat.workspaceKey]));
  const unread = useSidebarUnreadStore((state) => state.unread[chat.workspaceKey] === true);
  const { archiveAgent, isArchivingAgent } = useArchiveAgent();
  const archiving = isArchivingAgent({
    serverId: chat.serverId,
    agentId: chat.agentId,
  });
  const [hovered, setHovered] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const kebab = useOpenKebabMenuVisibility(hovered || isNative || compact);
  const pointerEnter = useCallback(() => setHovered(true), []);
  const pointerLeave = useCallback(() => setHovered(false), []);
  const open = useCallback(() => {
    useSidebarUnreadStore.getState().setUnread(chat.workspaceKey, false);
    navigateToAgent({
      serverId: chat.serverId,
      workspaceId: chat.workspaceId,
      agentId: chat.agentId,
    });
    onWorkspacePress?.();
  }, [chat.agentId, chat.serverId, chat.workspaceId, chat.workspaceKey, onWorkspacePress]);
  const togglePin = useCallback(() => {
    const state = useSidebarChatGroupsStore.getState();
    state.setPinned(chat.workspaceKey, !state.pinned[chat.workspaceKey]);
  }, [chat.workspaceKey]);
  const archive = useCallback(() => {
    if (archiving) return;
    void archiveAgent({ serverId: chat.serverId, agentId: chat.agentId }).catch((error) =>
      toast.error(error instanceof Error ? error.message : "Unable to archive chat"),
    );
  }, [archiveAgent, archiving, chat.agentId, chat.serverId, toast]);
  const showRename = useCallback(() => setRenameOpen(true), []);
  const closeRename = useCallback(() => setRenameOpen(false), []);
  const rename = useCallback(
    async (value: string) => {
      const client = getHostRuntimeStore().getClient(chat.serverId);
      if (!client) throw new Error(t("workspace.terminal.hostDisconnected"));
      await client.updateAgent(chat.agentId, { name: value.trim() });
    },
    [chat.agentId, chat.serverId, t],
  );
  const title = chat.title ?? chat.name;
  const accessibilityState = useMemo(
    () => ({ selected, disabled: archiving }),
    [selected, archiving],
  );
  useKeyboardActionHandler({
    handlerId: `chat-archive-${chat.workspaceKey}`,
    actions: ["workspace.archive"],
    enabled: selected && !archiving,
    priority: 0,
    handle: () => {
      archive();
      return true;
    },
  });

  return (
    <>
      <View style={styles.frame} onPointerEnter={pointerEnter} onPointerLeave={pointerLeave}>
        <SidebarWorkspaceContextMenu
          workspace={chat}
          workspaceKey={chat.workspaceKey}
          agentId={chat.agentId}
          contextMenuOpen={contextOpen}
          onContextMenuOpenChange={setContextOpen}
          onArchive={archive}
          archiveStatus={archiving ? "pending" : "idle"}
          isPinned={pinned}
          onTogglePin={togglePin}
          onRename={showRename}
          disabled={archiving}
          accessibilityRole="button"
          accessibilityLabel={`${title}${unread ? ", unread" : ""}`}
          accessibilityState={accessibilityState}
          aria-selected={selected}
          onPress={open}
          style={[
            styles.row,
            hovered && !contextOpen && styles.hovered,
            selected && styles.selected,
          ]}
          highlightStyle={styles.pressed}
          testID={`sidebar-workspace-row-${chat.workspaceKey}`}
        >
          <ChatStatus chat={chat} unread={unread} />
          <Text style={[styles.title, selected && styles.selectedTitle]} numberOfLines={1}>
            {title}
          </Text>
          <View
            style={[styles.menu, !kebab.showKebab && styles.hidden]}
            pointerEvents={kebab.showKebab ? "auto" : "none"}
            aria-hidden={!kebab.showKebab}
            accessibilityElementsHidden={!kebab.showKebab}
            importantForAccessibility={kebab.showKebab ? "auto" : "no-hide-descendants"}
          >
            {kebab.showKebab ? (
              <SidebarWorkspaceMenu
                {...kebab.menuProps}
                workspaceKey={chat.workspaceKey}
                serverId={chat.serverId}
                workspaceId={chat.workspaceId}
                agentId={chat.agentId}
                onArchive={archive}
                archiveStatus={archiving ? "pending" : "idle"}
                isPinned={pinned}
                onTogglePin={togglePin}
                onRename={showRename}
              />
            ) : null}
          </View>
        </SidebarWorkspaceContextMenu>
      </View>
      {renameOpen ? (
        <AdaptiveRenameModal
          visible
          title="Rename chat"
          initialValue={title}
          submitLabel={t("workspace.tabs.menu.rename")}
          maxLength={200}
          onClose={closeRename}
          onSubmit={rename}
          testID={`sidebar-workspace-rename-modal-${chat.workspaceKey}`}
        />
      ) : null}
    </>
  );
});

function ChatStatus({ chat, unread }: { chat: ManualChatEntry; unread: boolean }) {
  const bucket = chat.statusBucket;
  return (
    <View style={styles.status} testID={`sidebar-chat-status-${chat.workspaceKey}`}>
      {bucket === "running" ? (
        <SidebarActivityGlow />
      ) : (
        <View
          style={[
            styles.dot,
            bucket === "needs_input" && styles.needsInput,
            bucket === "failed" && styles.failed,
            (bucket === "attention" || (unread && bucket === "done")) && styles.unread,
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  frame: { position: "relative" },
  row: {
    minHeight: { xs: 44, md: 30 },
    paddingVertical: 4,
    paddingLeft: 8,
    paddingRight: 12,
    borderRadius: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    userSelect: "none",
  },
  hovered: { backgroundColor: theme.colors.surfaceSidebarHover },
  selected: { backgroundColor: theme.colors.surfaceSidebarSelected },
  pressed: { backgroundColor: theme.colors.surface2 },
  title: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foregroundSidebar ?? theme.colors.foreground,
    fontSize: theme.fontSize.base,
    lineHeight: 20,
    fontWeight: "400",
  },
  selectedTitle: { color: theme.colors.foreground },
  status: {
    width: 14,
    height: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: theme.colors.foregroundExtraMuted,
  },
  needsInput: {
    backgroundColor: theme.colors.statusDotWarning,
    borderColor: theme.colors.statusDotWarning,
  },
  failed: {
    backgroundColor: theme.colors.statusDotDanger,
    borderColor: theme.colors.statusDotDanger,
  },
  unread: {
    backgroundColor: theme.colors.foregroundSidebar ?? theme.colors.foreground,
    borderColor: theme.colors.foregroundSidebar ?? theme.colors.foreground,
  },
  menu: { width: 14, alignItems: "center", justifyContent: "center" },
  hidden: { opacity: 0 },
}));
