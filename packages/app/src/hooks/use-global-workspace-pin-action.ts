import { useCallback } from "react";
import { useKeyboardActionHandler } from "@/hooks/use-keyboard-action-handler";
import { useSidebarWorkspacePinController } from "@/hooks/use-sidebar-workspace-pin";
import type { KeyboardActionId } from "@/keyboard/keyboard-action-dispatcher";
import { useHostFeature } from "@/runtime/host-features";
import { useActiveSidebarShortcutTarget } from "@/hooks/use-active-sidebar-shortcut-target";
import { useSidebarChatGroupsStore } from "@/stores/sidebar-chat-groups-store";
import { useSidebarViewStore } from "@/stores/sidebar-view-store";
import { useWorkspaceFields } from "@/stores/session-store-hooks";
import { buildWorkspaceTabPersistenceKey } from "@/workspace-tabs/model";

const WORKSPACE_PIN_ACTIONS: readonly KeyboardActionId[] = ["workspace.pin"];

// The pin shortcut used to live on the sidebar row, so it disappeared whenever the row was not
// rendered — a collapsed project or status group, a collapsed Pinned section, or focus mode.
// One global registration keeps pinning available while rows are hidden. Manual grouping pins
// the chat in the focused pane; project and status grouping pin the routed workspace.
export function useGlobalWorkspacePinAction() {
  const selection = useActiveSidebarShortcutTarget();
  const groupMode = useSidebarViewStore((state) => state.groupMode);
  const serverId = selection?.serverId ?? null;
  const agentId = selection?.agentId ?? null;
  const routeWorkspaceId = selection?.workspaceId ?? null;
  // Narrow projection so pin state changes don't re-render on every gitRuntime/diffStat tick.
  // A null result means the workspace is gone, which `pinnedAt: null` alone could not express.
  //
  // `id` is projected rather than reusing the route id: the route carries an opaque workspace id
  // that is not guaranteed to equal the descriptor id (that is why `selectWorkspace` resolves it
  // through `resolveWorkspaceMapKeyByIdentity`). The RPC and the in-flight key both need the
  // descriptor id, so that sidebar rows and this handler agree on one identity.
  const fields = useWorkspaceFields(serverId, routeWorkspaceId, (workspace) => ({
    id: workspace.id,
    pinnedAt: workspace.pinnedAt ?? null,
  }));
  const canPin = useHostFeature(serverId, "workspacePinning");
  const togglePin = useSidebarWorkspacePinController();

  const handle = useCallback(() => {
    if (groupMode === "manual") {
      if (!serverId || !agentId) return false;
      const key = `${serverId}:chat:${agentId}`;
      const state = useSidebarChatGroupsStore.getState();
      state.setPinned(key, !state.pinned[key]);
      return true;
    }
    if (!serverId || !fields || !canPin) {
      return false;
    }
    const workspaceKey = buildWorkspaceTabPersistenceKey({
      serverId,
      workspaceId: fields.id,
    });
    if (!workspaceKey) {
      return false;
    }
    togglePin({
      serverId,
      workspaceId: fields.id,
      workspaceKey,
      pinnedAt: fields.pinnedAt,
    });
    return true;
  }, [agentId, canPin, fields, groupMode, serverId, togglePin]);

  useKeyboardActionHandler({
    handlerId: "workspace-pin-global",
    actions: WORKSPACE_PIN_ACTIONS,
    enabled:
      groupMode === "manual"
        ? serverId !== null && agentId !== null
        : serverId !== null && fields !== null && canPin,
    priority: 0,
    handle,
  });
}
