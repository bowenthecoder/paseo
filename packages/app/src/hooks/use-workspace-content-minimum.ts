import { resolveWorkspaceContentMinimum } from "@/components/desktop-sidebar-layout";
import { useActiveWorkspaceSelection } from "@/stores/navigation-active-workspace-store";
import { useWorkspaceFields } from "@/stores/session-store-hooks";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { buildWorkspaceTabPersistenceKey } from "@/workspace-tabs/model";

/** Navigation yields its width before shrinking the active chat and supporting panes. */
export function useWorkspaceContentMinimum(): number {
  const selection = useActiveWorkspaceSelection();
  const serverId = selection?.serverId ?? null;
  const routeWorkspaceId = selection?.workspaceId ?? null;
  const descriptorId = useWorkspaceFields(serverId, routeWorkspaceId, (workspace) => workspace.id);
  const workspaceId = descriptorId ?? routeWorkspaceId;
  const key =
    serverId && workspaceId ? buildWorkspaceTabPersistenceKey({ serverId, workspaceId }) : null;
  return useWorkspaceLayoutStore((state) =>
    resolveWorkspaceContentMinimum(
      key ? state.layoutByWorkspace[key]?.root : undefined,
      key ? (state.explorerSidebarPaneIdByWorkspace[key] ?? undefined) : undefined,
    ),
  );
}
