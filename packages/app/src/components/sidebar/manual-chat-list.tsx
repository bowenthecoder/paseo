import { useCallback, useMemo, type ReactElement } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { ChevronDown, ChevronRight, MoreHorizontal, Plus } from "lucide-react-native";
import { router } from "expo-router";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { Theme } from "@/styles/theme";
import { useShallow } from "zustand/react/shallow";
import type { SidebarWorkspaceEntry } from "@/hooks/use-sidebar-workspaces-list";
import {
  useSidebarChatGroupsStore,
  PINNED_CHAT_GROUP,
  UNGROUPED_CHATS,
} from "@/stores/sidebar-chat-groups-store";
import { useAddProjectFlowStore } from "@/stores/add-project-flow-store";
import { buildNewWorkspaceRoute } from "@/utils/host-routes";
import { AdaptiveRenameModal } from "@/components/rename-modal";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { ManualChatRow } from "./manual-chat-row";
import { useSidebarModel } from "./sidebar-model";
import {
  buildManualChatSections,
  resolveChatGroup,
  type ManualChatSection,
  type ManualChatEntry,
} from "./manual-chat-groups";
import {
  ManualGroupDragRoot,
  ManualGroupDropZone,
  ManualGroupDraggable,
} from "./manual-group-drag";

export function SidebarManualChatList({
  listHeaderComponent,
  onWorkspacePress,
}: {
  workspaceEntriesByKey: ReadonlyMap<string, SidebarWorkspaceEntry>;
  listHeaderComponent?: ReactElement | null;
  onWorkspacePress?: () => void;
}) {
  const { manualChatEntries, allManualChatEntries } = useSidebarModel();
  const allChatEntriesByKey = useMemo(
    () => new Map(allManualChatEntries.map((chat) => [chat.workspaceKey, chat])),
    [allManualChatEntries],
  );
  const chatEntriesByKey = useMemo(
    () => new Map(manualChatEntries.map((chat) => [chat.workspaceKey, chat])),
    [manualChatEntries],
  );
  const grouping = useSidebarChatGroupsStore(
    useShallow(({ groups, assignments, order, collapsed, pinned, workspaceDefaults }) => ({
      pinned,
      workspaceDefaults,
      groups,
      assignments,
      order,
      collapsed,
    })),
  );
  const sections = useMemo(
    () => buildManualChatSections(manualChatEntries, grouping),
    [manualChatEntries, grouping],
  );
  const drop = useCallback(
    (key: string, groupId: string) => {
      if (!chatEntriesByKey.has(key)) return;
      const state = useSidebarChatGroupsStore.getState();
      const pinned = groupId === PINNED_CHAT_GROUP;
      state.setPinned(key, pinned);
      if (!pinned) state.moveChat(key, groupId === UNGROUPED_CHATS ? null : groupId);
    },
    [chatEntriesByKey],
  );
  return (
    <>
      <ManualGroupDragRoot onDrop={drop}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          testID="sidebar-project-workspace-list-scroll"
        >
          {listHeaderComponent}
          {sections.map((section) => (
            <ManualGroupDropZone key={section.id} groupId={section.id}>
              <View style={styles.section} testID={`sidebar-chat-section-${section.id}`}>
                <ManualChatGroupHeader section={section} workspaces={allChatEntriesByKey} />
                {!section.collapsed
                  ? section.rows.map((workspace) => (
                      <ManualGroupDraggable
                        key={workspace.workspaceKey}
                        workspaceKey={workspace.workspaceKey}
                      >
                        <ManualChatRow chat={workspace} onWorkspacePress={onWorkspacePress} />
                      </ManualGroupDraggable>
                    ))
                  : null}
              </View>
            </ManualGroupDropZone>
          ))}
        </ScrollView>
      </ManualGroupDragRoot>
      <ChatGroupEditor />
    </>
  );
}

const mutedIcon = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const ThemedChevronDown = withUnistyles(ChevronDown);
const ThemedChevronRight = withUnistyles(ChevronRight);
const ThemedPlus = withUnistyles(Plus);
const ThemedMore = withUnistyles(MoreHorizontal);

function ManualChatGroupHeader({
  section,
  workspaces,
}: {
  section: ManualChatSection;
  workspaces: ReadonlyMap<string, ManualChatEntry>;
}) {
  const custom = section.id !== PINNED_CHAT_GROUP && section.id !== UNGROUPED_CHATS;
  const openChat = useCallback(
    () =>
      router.push(
        buildNewWorkspaceRoute({
          ...(section.folder
            ? {
                serverId: section.folder.serverId,
                sourceDirectory: section.folder.path,
                projectId: section.folder.projectId,
              }
            : {}),
          ...(custom ? { chatGroupId: section.id } : {}),
        }),
      ),
    [custom, section.folder, section.id],
  );
  const chooseFolder = useCallback(
    () =>
      useAddProjectFlowStore.getState().openForSelection((folder) => {
        useSidebarChatGroupsStore.getState().setGroupFolder(section.id, {
          serverId: folder.serverId,
          path: folder.path,
          projectId: folder.projectId,
        });
      }, section.folder?.serverId),
    [section.id, section.folder?.serverId],
  );
  const toggle = useCallback(
    () => useSidebarChatGroupsStore.getState().toggleCollapsed(section.id),
    [section.id],
  );
  const rename = useCallback(
    () => useSidebarChatGroupsStore.getState().openEditor(section.id),
    [section.id],
  );
  const clearFolder = useCallback(
    () => useSidebarChatGroupsStore.getState().setGroupFolder(section.id, null),
    [section.id],
  );
  const remove = useCallback(() => {
    const state = useSidebarChatGroupsStore.getState();
    const members = [...workspaces.values()]
      .filter((workspace) => resolveChatGroup(workspace, state) === section.id)
      .map((workspace) => workspace.workspaceKey);
    state.removeGroup(section.id, members);
  }, [section.id, workspaces]);
  const Chevron = section.collapsed ? ThemedChevronRight : ThemedChevronDown;
  return (
    <View style={styles.header}>
      <Pressable
        style={styles.headingButton}
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={`${section.collapsed ? "Expand" : "Collapse"} ${section.name}`}
        testID={`sidebar-chat-group-${section.id}`}
      >
        <Text style={styles.heading} numberOfLines={1}>
          {section.name}
        </Text>
        <Chevron size={12} uniProps={mutedIcon} />
      </Pressable>
      {custom ? (
        <View style={styles.actions}>
          <Pressable
            style={styles.iconButton}
            onPress={openChat}
            accessibilityRole="button"
            accessibilityLabel={`New chat in ${section.name}`}
            testID={`sidebar-group-new-chat-${section.id}`}
          >
            <ThemedPlus size={16} uniProps={mutedIcon} />
          </Pressable>
          <DropdownMenu>
            <DropdownMenuTrigger
              style={styles.iconButton}
              accessibilityLabel={`Manage ${section.name}`}
              testID={`sidebar-group-menu-${section.id}`}
            >
              <ThemedMore size={16} uniProps={mutedIcon} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" width={250}>
              <DropdownMenuItem onSelect={rename}>Rename group</DropdownMenuItem>
              <DropdownMenuItem onSelect={chooseFolder}>Choose working folder…</DropdownMenuItem>
              {section.folder ? (
                <DropdownMenuItem onSelect={clearFolder}>Clear working folder</DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onSelect={remove}>Remove group</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </View>
      ) : null}
    </View>
  );
}

function ChatGroupEditor() {
  const editor = useSidebarChatGroupsStore((state) => state.editor);
  const groups = useSidebarChatGroupsStore((state) => state.groups);
  const group = groups.find((item) => item.id === editor?.groupId);
  const submit = useCallback(
    (name: string) => {
      const state = useSidebarChatGroupsStore.getState();
      const id = state.saveGroup(editor?.groupId ?? null, name);
      if (editor?.workspaceKey) state.moveChat(editor.workspaceKey, id);
    },
    [editor],
  );
  return (
    <AdaptiveRenameModal
      visible={Boolean(editor)}
      title={group ? "Rename group" : "New group"}
      initialValue={group?.name ?? ""}
      placeholder="Group name"
      submitLabel={group ? "Save" : "Create group"}
      maxLength={60}
      onSubmit={submit}
      onClose={useSidebarChatGroupsStore.getState().closeEditor}
      testID="sidebar-chat-group-editor"
    />
  );
}

const styles = StyleSheet.create((theme) => ({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 8, paddingBottom: 16 },
  section: { paddingBottom: 12, minHeight: 40 },
  header: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    gap: 8,
  },
  headingButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
    paddingVertical: 8,
  },
  heading: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.base, flexShrink: 1 },
  actions: { flexDirection: "row", alignItems: "center" },
  iconButton: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
  },
}));
