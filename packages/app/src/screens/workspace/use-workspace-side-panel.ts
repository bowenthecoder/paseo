import { useMemo } from "react";
import { deriveWorkspacePaneState } from "@/screens/workspace/workspace-pane-state";
import {
  EXPLORER_SIDEBAR_PANE_ID,
  findPaneById,
  type WorkspaceLayout,
} from "@/stores/workspace-layout-store";
import type { WorkspaceTab, WorkspaceTabTarget } from "@/workspace-tabs/model";

export interface WorkspaceSidePanelState {
  /** Whether the dock is on screen. Compact renders it instead of the chat, wide beside it. */
  isVisible: boolean;
  /** What the dock is showing, so a header toggle knows whether to put it away. */
  viewKind: WorkspaceTabTarget["kind"] | null;
}

export function useWorkspaceSidePanelState(input: {
  layout: WorkspaceLayout | null;
  tabs: WorkspaceTab[];
}): WorkspaceSidePanelState {
  const pane = input.layout ? findPaneById(input.layout.root, EXPLORER_SIDEBAR_PANE_ID) : null;
  const isVisible = Boolean(pane && pane.hidden !== true);
  const paneState = useMemo(
    () => deriveWorkspacePaneState({ pane, tabs: input.tabs }),
    [pane, input.tabs],
  );
  return useMemo(
    () => ({ isVisible, viewKind: paneState.activeTab?.descriptor.target.kind ?? null }),
    [isVisible, paneState.activeTab],
  );
}
