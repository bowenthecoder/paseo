import { useMemo } from "react";
import { useActiveWorkspaceSelection } from "@/stores/navigation-active-workspace-store";
import { useWorkspaceFields } from "@/stores/session-store-hooks";
import { findPaneById, useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { buildWorkspaceTabPersistenceKey } from "@/workspace-tabs/model";
import type { SidebarShortcutWorkspaceTarget } from "@/utils/sidebar-shortcuts";

/** Workspace routes do not change when the user selects another chat in that workspace. */
export function useActiveSidebarShortcutTarget(): SidebarShortcutWorkspaceTarget | null {
  const selection = useActiveWorkspaceSelection();
  const serverId = selection?.serverId ?? null;
  const routeWorkspaceId = selection?.workspaceId ?? null;
  const descriptorId = useWorkspaceFields(serverId, routeWorkspaceId, (workspace) => workspace.id);
  const workspaceId = descriptorId ?? routeWorkspaceId;
  const workspaceKey =
    serverId && workspaceId ? buildWorkspaceTabPersistenceKey({ serverId, workspaceId }) : null;
  const agentId = useWorkspaceLayoutStore((state) => {
    if (!workspaceKey) return null;
    const layout = state.layoutByWorkspace[workspaceKey];
    if (!layout) return null;
    const focusedTabId = findPaneById(layout.root, layout.focusedPaneId)?.focusedTabId;
    const target = state
      .getWorkspaceTabs(workspaceKey)
      .find((tab) => tab.tabId === focusedTabId)?.target;
    return target?.kind === "agent" ? target.agentId : null;
  });
  return useMemo(
    () =>
      serverId && workspaceId ? { serverId, workspaceId, ...(agentId ? { agentId } : {}) } : null,
    [agentId, serverId, workspaceId],
  );
}
