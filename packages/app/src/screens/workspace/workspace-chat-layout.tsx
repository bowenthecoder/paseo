import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Text, View, type LayoutChangeEvent } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { X, Plus, Grid2X2, Maximize2, RotateCw } from "lucide-react-native";
import { WorkspacePaneFocusBoundary } from "@/screens/workspace/workspace-pane-focus-boundary";
import { RetainedPanel } from "@/components/retained-panel";
import { collectChatPanes } from "@/stores/workspace-layout-actions";
import {
  WorkspaceTabPresentationResolver,
  WorkspaceTabIcon,
} from "@/screens/workspace/workspace-tab-presentation";
import { ResizeHandle } from "@/components/resize-handle";
import { ScreenHeader } from "@/components/headers/screen-header";
import {
  PaneContentToolbar,
  ToolbarButton,
  ToolbarControls,
} from "@/components/ui/pane-content-toolbar";
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
  type SplitPane,
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
const ThemedPlus = withUnistyles(Plus);
const ThemedGrid = withUnistyles(Grid2X2);
const ThemedMaximize = withUnistyles(Maximize2);
const ThemedReload = withUnistyles(RotateCw);

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
  onReloadAgent: (agentId: string) => Promise<void>;
}

function WorkspaceChatView({
  pane,
  uiTabs,
  normalizedServerId,
  normalizedWorkspaceId,
  isWorkspaceFocused,
  isPaneFocused,
  showChrome,
  onFocusPane,
  onCloseView,
  onReloadAgent,
  buildPaneContentModel,
}: Pick<
  WorkspaceChatLayoutProps,
  | "uiTabs"
  | "normalizedServerId"
  | "normalizedWorkspaceId"
  | "isWorkspaceFocused"
  | "buildPaneContentModel"
  | "onReloadAgent"
> & {
  pane: SplitPane;
  isPaneFocused: boolean;
  showChrome: boolean;
  onFocusPane: (paneId: string) => void;
  onCloseView: WorkspaceChatLayoutProps["onCloseSidePanelView"];
}) {
  const state = useMemo(() => deriveWorkspacePaneState({ pane, tabs: uiTabs }), [pane, uiTabs]);
  const tabs = useMemo(() => state.tabs.map((tab) => tab.descriptor), [state.tabs]);
  const active = state.activeTab?.descriptor;
  const [reloading, setReloading] = useState(false);
  const focus = useCallback(() => onFocusPane(pane.id), [onFocusPane, pane.id]);
  const maximize = useCallback(() => {
    focus();
    usePanelStore.getState().toggleFocusMode();
  }, [focus]);
  const dataset = useMemo(() => ({ "pane-focused": String(isPaneFocused) }), [isPaneFocused]);
  const closeView = useCallback(() => {
    void onCloseView(pane.id);
  }, [pane.id, onCloseView]);
  const reload = useCallback(async () => {
    if (active?.target.kind !== "agent" || reloading) return;
    setReloading(true);
    try {
      await onReloadAgent(active.target.agentId);
    } finally {
      setReloading(false);
    }
  }, [active, onReloadAgent, reloading]);
  const content = (
    <View style={styles.chatView} testID={`workspace-chat-view-${pane.id}`} dataSet={dataset}>
      {showChrome && active ? (
        <PaneContentToolbar
          style={[styles.chatToolbar, isPaneFocused ? styles.focusedToolbar : null]}
        >
          <WorkspaceTabPresentationResolver
            tab={active}
            serverId={normalizedServerId}
            workspaceId={normalizedWorkspaceId}
          >
            {(presentation) => (
              <View style={styles.viewTitle}>
                <WorkspaceTabIcon
                  presentation={presentation}
                  active={isPaneFocused}
                  size={14}
                  backdrop="surfaceSidebar"
                />
                <Text numberOfLines={1} style={styles.viewTitleText}>
                  {presentation.label}
                </Text>
              </View>
            )}
          </WorkspaceTabPresentationResolver>
          <ToolbarControls>
            {active.target.kind === "agent" ? (
              <ToolbarButton
                label={reloading ? "Reloading chat..." : "Reload chat"}
                disabled={reloading}
                onPress={reload}
              >
                <ThemedReload size={14} uniProps={mutedIconColorMapping} />
              </ToolbarButton>
            ) : null}
            <ToolbarButton
              label="Focus chat view"
              testID={`workspace-focus-chat-${pane.id}`}
              onPress={maximize}
            >
              <ThemedMaximize size={14} uniProps={mutedIconColorMapping} />
            </ToolbarButton>
            <ToolbarButton
              label="Close chat view"
              testID={`workspace-close-chat-${pane.id}`}
              onPress={closeView}
            >
              <ThemedX size={14} uniProps={mutedIconColorMapping} />
            </ToolbarButton>
          </ToolbarControls>
        </PaneContentToolbar>
      ) : null}
      <View style={styles.chatContent}>
        <WorkspacePanelHost
          paneId={pane.id}
          tabs={tabs}
          activeTabId={state.activeTabId}
          normalizedServerId={normalizedServerId}
          normalizedWorkspaceId={normalizedWorkspaceId}
          isWorkspaceFocused={isWorkspaceFocused}
          isPaneFocused={isPaneFocused}
          onFocusPane={onFocusPane}
          buildPaneContentModel={buildPaneContentModel}
        />
      </View>
    </View>
  );
  return <WorkspacePaneFocusBoundary onFocus={focus}>{content}</WorkspacePaneFocusBoundary>;
}

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
  onReloadAgent,
}: WorkspaceChatLayoutProps) {
  const chatPanes = useMemo(() => collectChatPanes(layout.root), [layout.root]);
  const chatPane = findPaneById(layout.root, DEFAULT_PANE_ID);
  const focusPane = useWorkspaceLayoutStore((state) => state.focusPane);
  const addChatPane = useWorkspaceLayoutStore((state) => state.addChatPane);
  const closeChatPane = useWorkspaceLayoutStore((state) => state.closeChatPane);
  const closeChatView = useCallback(
    (paneId: string) => closeChatPane(workspaceKey, paneId),
    [closeChatPane, workspaceKey],
  );
  const handleFocusPane = useCallback(
    (paneId: string) => focusPane(workspaceKey, paneId),
    [focusPane, workspaceKey],
  );
  const handleAddChat = useCallback(() => addChatPane(workspaceKey), [addChatPane, workspaceKey]);
  const handleFourViews = useCallback(() => {
    for (let count = chatPanes.length; count < 4; count += 1) addChatPane(workspaceKey);
  }, [addChatPane, chatPanes.length, workspaceKey]);
  const focusedChatId =
    chatPanes.find((pane) => pane.id === layout.focusedPaneId)?.id ?? DEFAULT_PANE_ID;
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
  const balanceChats = false;
  const minimumBodyWidth =
    resolveWorkspaceContentMinimum(chatPane ? { kind: "pane", pane: chatPane } : undefined) *
    Math.min(chatPanes.length, 2);
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

  const cellStyle = useMemo(() => {
    if (focusModeEnabled || chatPanes.length === 1) return styles.singleCell;
    return chatPanes.length === 2 ? styles.halfCell : styles.quarterCell;
  }, [chatPanes.length, focusModeEnabled]);
  const viewToolbar = (
    <PaneContentToolbar style={styles.chatToolbar}>
      <Text style={styles.viewCount}>
        {chatPanes.length === 1 ? "Chat" : `${chatPanes.length} chat views`}
      </Text>
      <ToolbarControls>
        <ToolbarButton
          label="Add chat view"
          testID="workspace-add-chat-view"
          disabled={chatPanes.length >= 4}
          onPress={handleAddChat}
        >
          <ThemedPlus size={14} uniProps={mutedIconColorMapping} />
        </ToolbarButton>
        <ToolbarButton
          label="Four chat views"
          testID="workspace-four-chat-views"
          disabled={chatPanes.length >= 4}
          onPress={handleFourViews}
        >
          <ThemedGrid size={14} uniProps={mutedIconColorMapping} />
        </ToolbarButton>
      </ToolbarControls>
    </PaneContentToolbar>
  );

  return (
    <RenderProfile id="WorkspaceChatLayout">
      <View style={styles.workspaceShell} onLayout={handleShellLayout}>
        <WindowChromeRegion corners={chatColumnCorners}>
          <View style={styles.chatColumn} testID="workspace-chat-pane">
            {focusModeEnabled ? <WorkspaceFocusModeHeader /> : renderHeader?.()}
            {!focusModeEnabled ? viewToolbar : null}
            <View style={styles.chatGrid} testID="workspace-chat-grid">
              {chatPanes.map((pane) => (
                <RetainedPanel
                  key={pane.id}
                  active={!focusModeEnabled || pane.id === focusedChatId}
                  style={cellStyle}
                >
                  <WorkspaceChatView
                    pane={pane}
                    uiTabs={uiTabs}
                    normalizedServerId={normalizedServerId}
                    normalizedWorkspaceId={normalizedWorkspaceId}
                    isWorkspaceFocused={isWorkspaceFocused}
                    isPaneFocused={
                      layout.focusedPaneId === pane.id ||
                      Boolean(focusModeEnabled && pane.id === focusedChatId)
                    }
                    showChrome={chatPanes.length > 1 && !focusModeEnabled}
                    onFocusPane={handleFocusPane}
                    onCloseView={closeChatView}
                    onReloadAgent={onReloadAgent}
                    buildPaneContentModel={buildPaneContentModel}
                  />
                </RetainedPanel>
              ))}
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
                isPaneFocused={layout.focusedPaneId === sidePane.id}
                onFocusPane={handleFocusPane}
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
  chatGrid: { flex: 1, minHeight: 0, minWidth: 0, flexDirection: "row", flexWrap: "wrap" },
  singleCell: {
    flex: undefined,
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "auto",
    width: "100%",
    height: "100%",
    minWidth: 0,
    minHeight: 0,
  },
  halfCell: {
    flex: undefined,
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "auto",
    width: "50%",
    height: "100%",
    minWidth: 0,
    minHeight: 0,
  },
  quarterCell: {
    flex: undefined,
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "auto",
    width: "50%",
    height: "50%",
    minWidth: 0,
    minHeight: 0,
  },
  chatView: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
  },
  viewTitle: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    gap: theme.spacing[2],
    alignItems: "center",
  },
  viewTitleText: {
    flexShrink: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  viewCount: { flex: 1, color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
  chatToolbar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing[2],
    gap: theme.spacing[2],
  },
  focusedToolbar: { backgroundColor: theme.colors.surface2 },
  sidePanelDock: {
    flexShrink: 0,
    minWidth: 240,
    minHeight: 0,
    backgroundColor: theme.colors.surfaceSidebar,
  },
}));
