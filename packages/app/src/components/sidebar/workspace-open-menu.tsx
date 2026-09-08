import { useStableEvent } from "@/hooks/use-stable-event";
import { useIsCompactFormFactor } from "@/constants/layout";
import { DropdownMenuItem, DropdownMenuSubTrigger } from "@/components/ui/dropdown-menu";
import type { MenuPageDefinition } from "@/components/ui/menu";
import { navigateToWorkspace } from "@/stores/navigation-active-workspace-store";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { generateDraftId } from "@/stores/draft-keys";
import { findPaneById } from "@/stores/workspace-layout-actions";
import { resolveWorkspaceOpenTarget } from "./workspace-chat-target";

export const WORKSPACE_OPEN_PAGE = "workspace-open-in";

export function WorkspaceOpenMenuTrigger() {
  return (
    <DropdownMenuSubTrigger id={WORKSPACE_OPEN_PAGE} shortcut="O">
      Open in
    </DropdownMenuSubTrigger>
  );
}

function WorkspaceOpenOptions({
  serverId,
  workspaceId,
  agentId,
}: {
  serverId: string;
  workspaceId: string;
  agentId?: string;
}) {
  const compact = useIsCompactFormFactor();
  const open = useStableEvent((position?: "right" | "bottom") => {
    const workspaceKey = `${serverId}:${workspaceId}`;
    const store = useWorkspaceLayoutStore.getState();
    const tabs = store.getWorkspaceTabs(workspaceKey);
    const target = resolveWorkspaceOpenTarget({
      tabs,
      agentId,
      draftId: generateDraftId,
    });
    if (position) {
      // Materialize a layout before splitting an unopened workspace.
      const tabId = store.openTab({
        workspaceKey,
        target,
        intent: "reveal",
        placement: { mode: "focused" },
      });
      const layout = useWorkspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];
      const paneId = layout?.focusedPaneId;
      const newPaneId =
        paneId && tabId
          ? store.splitPane(workspaceKey, {
              tabId,
              targetPaneId: paneId,
              position,
            })
          : null;
      if (newPaneId) {
        // Moving the only tab would collapse its source pane and erase the split.
        const sourcePane = layout && paneId ? findPaneById(layout.root, paneId) : null;
        if (sourcePane && sourcePane.tabIds.length <= 1) {
          store.openTab({
            workspaceKey,
            target: { kind: "draft", draftId: generateDraftId() },
            intent: "reveal",
            placement: { mode: "pane", paneId: sourcePane.id },
          });
        }
        navigateToWorkspace({
          serverId,
          workspaceId,
          target,
          placement: { mode: "pane", paneId: newPaneId },
        });
        return;
      }
    }
    navigateToWorkspace({ serverId, workspaceId, target });
  });
  const openMain = useStableEvent(() => open());
  const splitRight = useStableEvent(() => open("right"));
  const splitBelow = useStableEvent(() => open("bottom"));
  return (
    <>
      <DropdownMenuItem onSelect={openMain}>Current view</DropdownMenuItem>
      {!compact ? (
        <>
          <DropdownMenuItem shortcut="S" testID="sidebar-open-split-right" onSelect={splitRight}>
            Split right
          </DropdownMenuItem>
          <DropdownMenuItem shortcut="B" testID="sidebar-open-split-below" onSelect={splitBelow}>
            Split below
          </DropdownMenuItem>
        </>
      ) : null}
    </>
  );
}

export function workspaceOpenMenuPage(
  serverId: string,
  workspaceId: string,
  agentId?: string,
): MenuPageDefinition {
  return {
    id: WORKSPACE_OPEN_PAGE,
    title: "Open in",
    content: (
      <WorkspaceOpenOptions serverId={serverId} workspaceId={workspaceId} agentId={agentId} />
    ),
  };
}
