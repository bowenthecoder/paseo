import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { z } from "zod";
import { createValidatedPersistStorage } from "@/storage/validated-persist-storage";
import { generateDraftId } from "@/stores/draft-keys";

const GroupFolderSchema = z.object({
  serverId: z.string(),
  path: z.string(),
  projectId: z.string().optional(),
});
const ChatGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  folder: GroupFolderSchema.nullable(),
});
const GroupStateSchema = z.object({
  groups: z.array(ChatGroupSchema),
  pinned: z.record(z.string(), z.string()).default({}),
  workspaceDefaults: z.record(z.string(), z.string()).default({}),
  assignments: z.record(z.string(), z.string().nullable()),
  order: z.record(z.string(), z.array(z.string())),
  collapsed: z.record(z.string(), z.boolean()),
});

export type ChatGroupFolder = z.infer<typeof GroupFolderSchema>;
export type SidebarChatGroup = z.infer<typeof ChatGroupSchema>;
export type SidebarChatGroupState = z.infer<typeof GroupStateSchema>;
export const EMPTY_CHAT_GROUPS: SidebarChatGroupState = {
  groups: [],
  pinned: {},
  workspaceDefaults: {},
  assignments: {},
  order: {},
  collapsed: {},
};
export const PINNED_CHAT_GROUP = "pinned";
export const UNGROUPED_CHATS = "ungrouped";

interface ChatGroupsStore extends SidebarChatGroupState {
  editor: { groupId: string | null; workspaceKey?: string } | null;
  openEditor: (groupId?: string | null, workspaceKey?: string) => void;
  closeEditor: () => void;
  saveGroup: (id: string | null, name: string) => string;
  setGroupFolder: (id: string, folder: ChatGroupFolder | null) => void;
  removeGroup: (id: string, workspaceKeys?: string[]) => void;
  moveChat: (workspaceKey: string, groupId: string | null) => void;
  setPinned: (chatKey: string, pinned: boolean) => void;
  setWorkspaceDefault: (workspaceKey: string, groupId: string) => void;
  toggleCollapsed: (id: string) => void;
}

export const useSidebarChatGroupsStore = create<ChatGroupsStore>()(
  persist(
    (set) => ({
      ...EMPTY_CHAT_GROUPS,
      editor: null,
      openEditor: (groupId = null, workspaceKey) => set({ editor: { groupId, workspaceKey } }),
      closeEditor: () => set({ editor: null }),
      saveGroup: (id, rawName) => {
        const name = rawName.trim();
        if (!name) throw new Error("Enter a group name");
        const groupId = id ?? `group:${generateDraftId()}`;
        set((state) => ({
          groups: id
            ? state.groups.map((group) => (group.id === id ? { ...group, name } : group))
            : [...state.groups, { id: groupId, name, folder: null }],
        }));
        return groupId;
      },
      setGroupFolder: (id, folder) =>
        set((state) => ({
          groups: state.groups.map((group) => (group.id === id ? { ...group, folder } : group)),
        })),
      removeGroup: (id, workspaceKeys = []) =>
        set((state) => ({
          groups: state.groups.filter((group) => group.id !== id),
          assignments: {
            ...Object.fromEntries(
              Object.entries(state.assignments).map(([key, groupId]) => [
                key,
                groupId === id ? null : groupId,
              ]),
            ),
            ...Object.fromEntries(workspaceKeys.map((key) => [key, null])),
          },
        })),
      moveChat: (workspaceKey, groupId) =>
        set((state) => {
          if (groupId && !state.groups.some((group) => group.id === groupId)) return state;
          const target = groupId ?? UNGROUPED_CHATS;
          return {
            assignments: { ...state.assignments, [workspaceKey]: groupId },
            order: {
              ...state.order,
              [target]: [
                workspaceKey,
                ...(state.order[target] ?? []).filter((key) => key !== workspaceKey),
              ],
            },
          };
        }),
      setPinned: (chatKey, pinned) =>
        set((state) => {
          const next = { ...state.pinned };
          if (pinned) next[chatKey] = new Date().toISOString();
          else delete next[chatKey];
          return { pinned: next };
        }),
      // An explicit group chosen while creating a workspace supplies a default for its new chats.
      // Individual chat assignments always override this, including an Ungrouped choice.
      setWorkspaceDefault: (workspaceKey, groupId) =>
        set((state) => ({
          workspaceDefaults: { ...state.workspaceDefaults, [workspaceKey]: groupId },
        })),
      toggleCollapsed: (id) =>
        set((state) => ({
          collapsed: { ...state.collapsed, [id]: !state.collapsed[id] },
        })),
    }),
    {
      name: "sidebar-manual-chat-groups",
      storage: createValidatedPersistStorage(AsyncStorage, GroupStateSchema),
      partialize: ({ groups, assignments, order, collapsed, pinned, workspaceDefaults }) => ({
        groups,
        pinned,
        workspaceDefaults,
        assignments,
        order,
        collapsed,
      }),
    },
  ),
);
