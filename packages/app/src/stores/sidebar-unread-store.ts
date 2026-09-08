import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { z } from "zod";
import { createValidatedPersistStorage } from "@/storage/validated-persist-storage";

// A personal reminder, independent of daemon attention and running-agent status.
export const useSidebarUnreadStore = create<{
  unread: Record<string, boolean>;
  setUnread: (workspaceKey: string, unread: boolean) => void;
}>()(
  persist(
    (set) => ({
      unread: {},
      setUnread: (key, value) =>
        set((state) => {
          const unread = { ...state.unread };
          if (value) unread[key] = true;
          else delete unread[key];
          return { unread };
        }),
    }),
    {
      name: "sidebar-unread-workspaces",
      storage: createValidatedPersistStorage(
        AsyncStorage,
        z.object({ unread: z.record(z.string(), z.boolean()) }),
      ),
      partialize: (state) => ({ unread: state.unread }),
    },
  ),
);
