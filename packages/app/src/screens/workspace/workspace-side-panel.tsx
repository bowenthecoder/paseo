import { useCallback, useMemo, type ReactNode } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { WorkspacePaneFocusBoundary } from "@/screens/workspace/workspace-pane-focus-boundary";
import { RetainedPanel } from "@/components/retained-panel";
import { TitlebarDragRegion } from "@/components/desktop/titlebar-drag-region";
import { WorkspacePanelHost } from "@/screens/workspace/workspace-panel-host";
import { deriveWorkspacePaneState } from "@/screens/workspace/workspace-pane-state";
import {
  WorkspaceSidePanelRail,
  type WorkspaceSidePanelRailItem,
} from "@/screens/workspace/workspace-side-panel-rail";
import type { WorkspacePaneContentModel } from "@/screens/workspace/workspace-pane-content";
import type { WorkspaceTabDescriptor } from "@/screens/workspace/workspace-tabs-types";
import type { SplitPane } from "@/stores/workspace-layout-store";
import type { WorkspaceTab } from "@/workspace-tabs/model";
import { WindowChromeRegion, WindowChromeSafeArea } from "@/utils/desktop-window";

interface WorkspaceSidePanelProps {
  pane: SplitPane;
  uiTabs: WorkspaceTab[];
  normalizedServerId: string;
  normalizedWorkspaceId: string;
  isWorkspaceFocused: boolean;
  isPaneFocused: boolean;
  onFocusPane: (paneId: string) => void;
  onSelectView: (paneId: string, tabId: string) => void;
  onCloseView: (tabId: string) => Promise<void> | void;
  onClosePanel: () => void;
  buildPaneContentModel: (input: {
    paneId: string;
    tab: WorkspaceTabDescriptor;
  }) => WorkspacePaneContentModel;
  headerAction?: ReactNode;
}

/**
 * The one right-hand dock in a workspace. Terminals, the in-app browser, Changes, Files and
 * Setup all render here, one at a time, with the rail above switching between whatever is live.
 */
export function WorkspaceSidePanel({
  pane,
  uiTabs,
  normalizedServerId,
  normalizedWorkspaceId,
  isWorkspaceFocused,
  isPaneFocused,
  onFocusPane,
  onSelectView,
  onCloseView,
  onClosePanel,
  buildPaneContentModel,
  headerAction,
}: WorkspaceSidePanelProps) {
  const paneState = useMemo(() => deriveWorkspacePaneState({ pane, tabs: uiTabs }), [pane, uiTabs]);
  const tabs = useMemo(() => paneState.tabs.map((tab) => tab.descriptor), [paneState.tabs]);
  const activeTabId = paneState.activeTabId;
  const railItems = useMemo<WorkspaceSidePanelRailItem[]>(
    () => tabs.map((tab) => ({ tab, isActive: tab.tabId === activeTabId })),
    [activeTabId, tabs],
  );
  const handleSelect = useMemo(
    () => (tabId: string) => onSelectView(pane.id, tabId),
    [onSelectView, pane.id],
  );

  const focusPane = useCallback(() => onFocusPane(pane.id), [onFocusPane, pane.id]);
  const content = (
    <RetainedPanel active>
      <WindowChromeRegion corners="top-right">
        <View style={styles.dock} testID="workspace-side-panel">
          <WindowChromeSafeArea placement="inline" style={styles.rail}>
            <TitlebarDragRegion />
            <WorkspaceSidePanelRail
              items={railItems}
              normalizedServerId={normalizedServerId}
              normalizedWorkspaceId={normalizedWorkspaceId}
              onSelect={handleSelect}
              onClose={onCloseView}
              onClosePanel={onClosePanel}
              headerAction={headerAction}
            />
            <View pointerEvents="none" style={styles.railDivider} />
          </WindowChromeSafeArea>
          <View style={styles.content}>
            <WorkspacePanelHost
              paneId={pane.id}
              tabs={tabs}
              activeTabId={activeTabId}
              normalizedServerId={normalizedServerId}
              normalizedWorkspaceId={normalizedWorkspaceId}
              isWorkspaceFocused={isWorkspaceFocused}
              isPaneFocused={isPaneFocused}
              onFocusPane={onFocusPane}
              buildPaneContentModel={buildPaneContentModel}
            />
          </View>
        </View>
      </WindowChromeRegion>
    </RetainedPanel>
  );
  return <WorkspacePaneFocusBoundary onFocus={focusPane}>{content}</WorkspacePaneFocusBoundary>;
}

const styles = StyleSheet.create((theme) => ({
  dock: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    backgroundColor: theme.colors.surfaceSidebar,
  },
  rail: {
    position: "relative",
    flexShrink: 0,
    backgroundColor: theme.colors.surfaceSidebar,
  },
  railDivider: {
    position: "absolute",
    right: 0,
    bottom: 0,
    left: 0,
    height: theme.borderWidth[1],
    backgroundColor: theme.colors.border,
  },
  content: {
    flex: 1,
    minHeight: 0,
    backgroundColor: theme.colors.surfaceSidebar,
  },
}));
