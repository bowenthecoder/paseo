import { useCallback, useMemo, useState, type ReactNode } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react-native";
import { ResizeHandle } from "@/components/resize-handle";
import { ScreenHeader } from "@/components/headers/screen-header";
import { ToolbarButton } from "@/components/ui/pane-content-toolbar";
import { mutedIconColorMapping } from "@/components/ui/icon-color";
import { resolveWorkspaceContentMinimum } from "@/components/desktop-sidebar-layout";
import { useShortcutKeys } from "@/hooks/use-shortcut-keys";
import { usePanelStore } from "@/stores/panel-store";
import {
  resolveExplorerSidebarDockSizes,
  resolveExplorerSidebarWidth,
} from "@/components/explorer-sidebar-layout";
import { WorkspacePanelHost } from "@/screens/workspace/workspace-panel-host";
import { deriveWorkspacePaneState } from "@/screens/workspace/workspace-pane-state";
import { WorkspaceSidePanel } from "@/screens/workspace/workspace-side-panel";
import type { WorkspacePaneContentModel } from "@/screens/workspace/workspace-pane-content";
import type { WorkspaceTabDescriptor } from "@/screens/workspace/workspace-tabs-types";
import {
  DEFAULT_PANE_ID,
  EXPLORER_SIDEBAR_PANE_ID,
  findPaneById,
  useWorkspaceLayoutStore,
  type WorkspaceLayout,
} from "@/stores/workspace-layout-store";
import type { WorkspaceTab } from "@/workspace-tabs/model";
import { RenderProfile } from "@/utils/render-profiler";
import {
  removeWindowChromeCorner,
  WindowChromeRegion,
  useWindowChromeCorners,
} from "@/utils/desktop-window";

const SIDE_PANEL_RESIZE_GROUP_ID = "workspace-side-panel";
const ThemedX = withUnistyles(X);

function WorkspaceFocusModeHeader() {
  const { t } = useTranslation();
  const focusModeKeys = useShortcutKeys("toggle-focus");
  const exitFocusMode = usePanelStore((state) => state.exitFocusMode);
  const action = useMemo(
    () => (
      <ToolbarButton
        label={t("workspace.tabs.actions.exitFocusMode")}
        shortcut={focusModeKeys}
        testID="workspace-exit-focus-mode"
        onPress={exitFocusMode}
      >
        <ThemedX size={14} uniProps={mutedIconColorMapping} />
      </ToolbarButton>
    ),
    [exitFocusMode, focusModeKeys, t],
  );

  return <ScreenHeader borderless right={action} />;
}

interface WorkspaceChatLayoutProps {
  layout: WorkspaceLayout;
  workspaceKey: string;
  normalizedServerId: string;
  normalizedWorkspaceId: string;
  isWorkspaceFocused: boolean;
  uiTabs: WorkspaceTab[];
  renderHeader?: () => ReactNode;
  renderSidePanelHeaderAction?: () => ReactNode;
  focusModeEnabled?: boolean;
  buildPaneContentModel: (input: {
    paneId: string;
    tab: WorkspaceTabDescriptor;
  }) => WorkspacePaneContentModel;
  onSelectSidePanelView: (paneId: string, tabId: string) => void;
  onCloseSidePanelView: (tabId: string) => Promise<void> | void;
  onCloseSidePanel: () => void;
}

/**
 * One chat, and one dock beside it. There is no pane tree left to render: the chat pane shows
 * whichever agent the route or the sidebar selected, and everything else lives in the side
 * panel, which the user can drag wider and close.
 */
export function WorkspaceChatLayout({
  layout,
  workspaceKey,
  normalizedServerId,
  normalizedWorkspaceId,
  isWorkspaceFocused,
  uiTabs,
  renderHeader,
  renderSidePanelHeaderAction,
  focusModeEnabled,
  buildPaneContentModel,
  onSelectSidePanelView,
  onCloseSidePanelView,
  onCloseSidePanel,
}: WorkspaceChatLayoutProps) {
  const chatPane = findPaneById(layout.root, DEFAULT_PANE_ID);
  const sidePane = findPaneById(layout.root, EXPLORER_SIDEBAR_PANE_ID);
  const inheritedWindowChromeCorners = useWindowChromeCorners();
  const storedSidePanelWidth = useWorkspaceLayoutStore(
    (state) => state.explorerSidebarWidthByWorkspace[workspaceKey],
  );
  const resizeSidePanel = useWorkspaceLayoutStore((state) => state.resizeExplorerSidebar);
  const [shellWidth, setShellWidth] = useState(0);
  const [previewWidth, setPreviewWidth] = useState<number | null>(null);
  const requestedWidth = previewWidth ?? storedSidePanelWidth;
  // Keep the split width while its chat opens a document or another supporting view.
  // A user's saved resize always takes precedence over this first-open default.
  const balanceChats = uiTabs.some(
    (tab) => tab.target.kind === "agent" && tab.target.view === "split",
  );
  const minimumBodyWidth = resolveWorkspaceContentMinimum(
    chatPane ? { kind: "pane", pane: chatPane } : undefined,
  );
  const showSidePanel = Boolean(!focusModeEnabled && sidePane && sidePane.hidden !== true);
  const sidePanelWidth = resolveExplorerSidebarWidth({
    requestedWidth,
    containerWidth: shellWidth,
    minimumBodyWidth,
    balanceChats,
  });
  const sidePanelSizes = useMemo(
    () =>
      resolveExplorerSidebarDockSizes({
        requestedWidth,
        containerWidth: shellWidth,
        minimumBodyWidth,
        balanceChats,
      }),
    [balanceChats, minimumBodyWidth, requestedWidth, shellWidth],
  );
  const sidePanelStyle = useMemo(
    () => [styles.sidePanelDock, { width: sidePanelWidth }],
    [sidePanelWidth],
  );
  const chatColumnCorners = showSidePanel
    ? removeWindowChromeCorner(inheritedWindowChromeCorners, "top-right")
    : inheritedWindowChromeCorners;
  const handleShellLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    setShellWidth((current) => (current === nextWidth ? current : nextWidth));
  }, []);
  const previewResize = useCallback(
    (_groupId: string, sizes: number[]) => {
      const nextRatio = sizes[1];
      if (nextRatio === undefined) {
        return;
      }
      setPreviewWidth(
        resolveExplorerSidebarWidth({
          requestedWidth: nextRatio * shellWidth,
          containerWidth: shellWidth,
          minimumBodyWidth,
        }),
      );
    },
    [minimumBodyWidth, shellWidth],
  );
  const commitResize = useCallback(
    (_groupId: string, sizes: number[]) => {
      setPreviewWidth(null);
      const nextRatio = sizes[1];
      if (nextRatio === undefined) {
        return;
      }
      resizeSidePanel(
        workspaceKey,
        resolveExplorerSidebarWidth({
          requestedWidth: nextRatio * shellWidth,
          containerWidth: shellWidth,
          minimumBodyWidth,
        }),
      );
    },
    [minimumBodyWidth, resizeSidePanel, shellWidth, workspaceKey],
  );

  const chatState = useMemo(
    () => deriveWorkspacePaneState({ pane: chatPane, tabs: uiTabs }),
    [chatPane, uiTabs],
  );
  const chatTabs = useMemo(() => chatState.tabs.map((tab) => tab.descriptor), [chatState.tabs]);

  return (
    <RenderProfile id="WorkspaceChatLayout">
      <View style={styles.workspaceShell} onLayout={handleShellLayout}>
        <WindowChromeRegion corners={chatColumnCorners}>
          <View style={styles.chatColumn} testID="workspace-chat-pane">
            {focusModeEnabled ? <WorkspaceFocusModeHeader /> : renderHeader?.()}
            <View style={styles.chatContent}>
              {chatPane ? (
                <WorkspacePanelHost
                  paneId={chatPane.id}
                  tabs={chatTabs}
                  activeTabId={chatState.activeTabId}
                  normalizedServerId={normalizedServerId}
                  normalizedWorkspaceId={normalizedWorkspaceId}
                  isWorkspaceFocused={isWorkspaceFocused}
                  isPaneFocused
                  buildPaneContentModel={buildPaneContentModel}
                />
              ) : null}
            </View>
          </View>
        </WindowChromeRegion>
        {showSidePanel && sidePane ? (
          <>
            <ResizeHandle
              testID="workspace-side-panel-resize-handle"
              direction="horizontal"
              hitAreaAlignment="end"
              groupId={SIDE_PANEL_RESIZE_GROUP_ID}
              index={0}
              sizes={sidePanelSizes}
              containerSize={shellWidth}
              onPreviewResizeSplit={previewResize}
              onResizeSplit={commitResize}
            />
            <View style={sidePanelStyle}>
              <WorkspaceSidePanel
                pane={sidePane}
                uiTabs={uiTabs}
                normalizedServerId={normalizedServerId}
                normalizedWorkspaceId={normalizedWorkspaceId}
                isWorkspaceFocused={isWorkspaceFocused}
                onSelectView={onSelectSidePanelView}
                onCloseView={onCloseSidePanelView}
                onClosePanel={onCloseSidePanel}
                buildPaneContentModel={buildPaneContentModel}
                headerAction={renderSidePanelHeaderAction?.()}
              />
            </View>
          </>
        ) : null}
      </View>
    </RenderProfile>
  );
}

const styles = StyleSheet.create((theme) => ({
  workspaceShell: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    flexDirection: "row",
  },
  chatColumn: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    minHeight: 0,
  },
  chatContent: {
    position: "relative",
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    backgroundColor: theme.colors.surface0,
    overflow: "hidden",
  },
  sidePanelDock: {
    flexShrink: 0,
    minWidth: 240,
    minHeight: 0,
    backgroundColor: theme.colors.surfaceSidebar,
  },
}));
