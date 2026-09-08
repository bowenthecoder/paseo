import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { getOpenAgentTabLabel } from "@getpaseo/protocol/agent-labels";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { useIsFocused } from "@react-navigation/native";
import { BackHandler, Keyboard, Pressable, Text, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter, type Href } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { Theme } from "@/styles/theme";
import invariant from "tiny-invariant";
import { SidebarMenuToggle } from "@/components/headers/menu-header";
import { ScreenHeader } from "@/components/headers/screen-header";
import { ScreenTitle } from "@/components/headers/screen-title";
import { HostBadge } from "@/hosts/host-badge";
import { useHostBadges } from "@/hosts/use-host-badges";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import {
  FloatingPanelPortalHost,
  FloatingPanelPortalHostNameProvider,
} from "@/components/ui/floating-panel-portal";
import { RetainedPanel } from "@/components/retained-panel";
import { ImportSessionSheet } from "@/components/import-session-sheet";
import { useToast } from "@/contexts/toast-context";
import { getOrCreateClientId } from "@/utils/client-id";
import { selectIsAgentListOpen, usePanelStore } from "@/stores/panel-store";
import { toggleDesktopSidebarsWithCheckoutIntent } from "@/utils/desktop-sidebar-toggle";
import {
  hideExplorerSidebar,
  isExplorerSidebarOpen,
  openExplorerSidebarView,
  toggleExplorerSidebar,
  useIsExplorerSidebarOpen,
} from "@/workspace-tabs/explorer-sidebar";
import {
  openWorkspacePullRequest,
  openWorkspaceSupportingTarget,
} from "@/workspace-tabs/open-supporting-view";
import { type ExplorerCheckoutContext } from "@/stores/explorer-checkout-context";
import { traceInstant } from "@/performance/native-trace";
import { useSessionStore, type WorkspaceDescriptor } from "@/stores/session-store";
import {
  collectAllTabs,
  DEFAULT_PANE_ID,
  EXPLORER_SIDEBAR_PANE_ID,
  getFocusedBrowserId,
  FOCUSED_PANE_PLACEMENT,
  selectExplorerSidebarPaneId,
  selectIsExplorerSidebarVisible,
  type WorkspaceLayout,
  type WorkspaceTabPlacement,
  useWorkspaceLayoutStore,
  useWorkspaceLayoutStoreHydrated,
} from "@/stores/workspace-layout-store";
import {
  buildWorkspaceTabPersistenceKey,
  type WorkspaceTab,
  type WorkspaceTabTarget,
} from "@/workspace-tabs/model";
import { useKeyboardActionHandler } from "@/hooks/use-keyboard-action-handler";
import { buildWorkspaceKeyboardHandlerId } from "@/keyboard/handler-id";
import type { KeyboardActionDefinition } from "@/keyboard/keyboard-action-dispatcher";
import { useCreateFlowStore } from "@/stores/create-flow-store";
import { normalizeWorkspaceTabTarget, workspaceTabTargetsEqual } from "@/workspace-tabs/identity";
import { useVisibleAgentIds } from "./visible-agent-ids";
import {
  getHostRuntimeStore,
  useHostRuntimeClient,
  useHostRuntimeIsConnected,
  useHostRuntimeSnapshot,
  useHosts,
} from "@/runtime/host-runtime";
import { prefetchProvidersSnapshot } from "@/hooks/use-providers-snapshot";
import {
  shouldSeedWorkspaceSetupTab,
  shouldShowWorkspaceSetup,
  useWorkspaceSetupStore,
} from "@/stores/workspace-setup-store";
import { useWorkspace } from "@/stores/session-store-hooks";
import { useWorkspaceTerminalSessionRetention } from "@/terminal/hooks/use-workspace-terminal-session-retention";
import type { CheckoutStatusPayload } from "@/git/use-status-query";
import { confirmDialog } from "@/utils/confirm-dialog";
import { useArchiveAgent } from "@/hooks/use-archive-agent";
import { useStableEvent } from "@/hooks/use-stable-event";
import { removeResidentBrowserWebview } from "@/desktop/browser/resident-webviews";
import { createWorkspaceBrowser, useBrowserStore } from "@/desktop/browser/store";
import { getDesktopHost } from "@/desktop/host";
import { buildProviderCommand } from "@/utils/provider-command-templates";
import { generateDraftId } from "@/stores/draft-keys";
import { resolveWorkspaceRouteId } from "@/utils/workspace-identity";
import { useOpenAgentTabLabels } from "@/subagents/use-open-agent-tab-labels";
import {
  WorkspaceTabPresentationResolver,
  WorkspaceTabIcon,
  WorkspaceTabOptionRow,
  type WorkspaceTabPresentation,
} from "@/screens/workspace/workspace-tab-presentation";
import {
  useWorkspaceTabRename,
  WorkspaceTabRenameModal,
} from "@/screens/workspace/use-workspace-tab-rename";
import { MobileTabTrailingAccessory } from "@/screens/workspace/workspace-tab-trailing-accessory";
import {
  buildWorkspaceTabMenuEntries,
  type WorkspaceTabMenuLabels,
} from "@/screens/workspace/workspace-tab-menu";
import { useDesktopBrowserNewTabRequests } from "@/desktop/browser/new-tab-requests";
import type { WorkspaceTabDescriptor } from "@/screens/workspace/workspace-tabs-types";
import { resolveWorkspaceExplorerToggleOwner } from "@/screens/workspace/workspace-explorer-toggle";
import { useHasWindowChromeObstruction } from "@/utils/desktop-window";
import {
  resolveWorkspaceHeaderRenderState,
  type WorkspaceHeaderCheckoutState,
} from "@/screens/workspace/workspace-header-source";
import {
  resolveWorkspaceRouteState,
  type WorkspaceRouteState,
} from "@/screens/workspace/workspace-route-state";
import { renderWorkspaceRouteGate } from "@/screens/workspace/workspace-route-state-views";
import { useWorkspaceRecovery } from "@/workspace-recovery/use-workspace-recovery";
import type { WorkspaceRecoveryModel } from "@/workspace-recovery/model";
import {
  buildWorkspaceTabSnapshot,
  deriveWorkspaceAgentVisibility,
  workspaceAgentVisibilityEqual,
} from "@/workspace-tabs/agent-visibility";
import { deriveWorkspacePaneState } from "@/screens/workspace/workspace-pane-state";
import {
  buildWorkspacePaneContentModel,
  WorkspacePaneContent,
  type WorkspacePaneContentModel,
} from "@/screens/workspace/workspace-pane-content";
import { useMountedTabSet } from "@/screens/workspace/use-mounted-tab-set";
import { useWorkspaceSidePanelState } from "@/screens/workspace/use-workspace-side-panel";
import { WorkspaceFocusProvider } from "@/workspace/focus";
import { DiffDocumentWorkspaceCacheProvider } from "@/git/diff-document/workspace-cache";
import type { TerminalTabDestination } from "@/screens/workspace/terminals/use-workspace-terminals";
import { resolveCloseAgentTabPolicy } from "@/subagents";
import {
  getPanelInstanceAttributes,
  useModifiedPanelTabIds,
} from "@/panels/panel-instance-attributes";
import { panelSupportsHost } from "@/panels/panel-manifest";
import { supportsDesktopPaneSplits, useIsCompactFormFactor } from "@/constants/layout";
import { getIsElectron, isNative, isWeb } from "@/constants/platform";
import type { SurfaceBackdrop } from "@/styles/surface-backdrop";
import { buildHostRootRoute, buildSettingsHostRoute } from "@/utils/host-routes";
import { useWorkspaceTerminals } from "@/screens/workspace/terminals/use-workspace-terminals";
import type { TerminalProfile } from "@getpaseo/protocol/messages";
import { WorkspaceHeaderActions } from "@/screens/workspace/workspace-header-actions";
import { WorkspaceChatLayout } from "@/screens/workspace/workspace-chat-layout";
import {
  createWorkspaceFileTabTarget,
  normalizeWorkspaceFileLocation,
  type WorkspaceFileLocation,
  type WorkspaceFileOpenRequest,
} from "@/workspace/file-open";
import { RenderProfile } from "@/utils/render-profiler";
import { useWorkspaceCheckoutStatus } from "@/screens/workspace/use-workspace-checkout-status";

const WORKSPACE_FLOATING_PANEL_PORTAL_HOST_PREFIX = "workspace-floating-panels";
const EMPTY_UI_TABS: WorkspaceTab[] = [];
const EMPTY_WORKSPACE_SCRIPTS: WorkspaceDescriptor["scripts"] = [];
const EMPTY_PINNED_AGENT_IDS = new Set<string>();
const EMPTY_SET = new Set<string>();

function getWorkspaceScripts(
  workspaceDescriptor: WorkspaceDescriptor | null | undefined,
): WorkspaceDescriptor["scripts"] {
  return workspaceDescriptor?.scripts ?? EMPTY_WORKSPACE_SCRIPTS;
}

interface WorkspaceFileLocationFields {
  path: string | null;
  lineStart?: number;
  lineEnd?: number;
}

function getWorkspaceFileLocationFields(
  tab: WorkspaceTabDescriptor | null,
): WorkspaceFileLocationFields {
  const target = tab?.target;
  if (target?.kind !== "file") {
    return { path: null };
  }
  return { path: target.path, lineStart: target.lineStart, lineEnd: target.lineEnd };
}

function buildWorkspaceFileLocation(
  fields: WorkspaceFileLocationFields,
): WorkspaceFileLocation | null {
  if (fields.path === null) {
    return null;
  }
  return { path: fields.path, lineStart: fields.lineStart, lineEnd: fields.lineEnd };
}

const ThemedLoadingSpinner = withUnistyles(LoadingSpinner);
const ThemedChevronDown = withUnistyles(ChevronDown);

const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

const GATED_WORKSPACE_HEADER_LEFT = <SidebarMenuToggle />;

interface WorkspaceScreenProps {
  serverId: string;
  workspaceId: string;
  isRouteFocused?: boolean;
  recoveryRequested?: boolean;
  recoveryAgentId?: string | null;
}

type WorkspaceScreenContentProps = WorkspaceScreenProps & {
  isRouteFocused: boolean;
  recoveryRequested: boolean;
  recoveryAgentId: string | null;
};

function trimNonEmpty(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function useSyncWorkspaceActiveBrowser(input: {
  workspaceLayout: WorkspaceLayout | null;
  isRouteFocused: boolean;
  workspaceId: string;
}) {
  const focusedBrowserId = useMemo(
    () => getFocusedBrowserId(input.workspaceLayout),
    [input.workspaceLayout],
  );

  useEffect(() => {
    if (!getIsElectron()) {
      return;
    }
    void getDesktopHost()?.browser?.setWorkspaceActiveBrowser?.({
      workspaceId: input.workspaceId,
      browserId: focusedBrowserId,
    });
  }, [focusedBrowserId, input.workspaceId]);
}

function getFallbackTabOptionLabel(
  tab: WorkspaceTabDescriptor,
  labels: {
    newTab: string;
    newAgent: string;
    setup: string;
    terminal: string;
    browser: string;
    agent: string;
    changes: string;
    files: string;
    pullRequest: string;
  },
): string {
  if (tab.target.kind === "new_tab") {
    return labels.newTab;
  }
  if (tab.target.kind === "draft") {
    return labels.newAgent;
  }
  if (tab.target.kind === "setup") {
    return labels.setup;
  }
  if (tab.target.kind === "terminal") {
    return labels.terminal;
  }
  if (tab.target.kind === "browser") {
    return labels.browser;
  }
  if (tab.target.kind === "file") {
    return tab.target.path.split("/").findLast(Boolean) ?? tab.target.path;
  }
  if (tab.target.kind === "working_diff" || tab.target.kind === "changes_tree") {
    return labels.changes;
  }
  if (tab.target.kind === "files") {
    return labels.files;
  }
  if (tab.target.kind === "pull_request") {
    return labels.pullRequest;
  }
  if (tab.target.kind === "commit_diff") {
    return tab.target.sha.slice(0, 7);
  }
  return labels.agent;
}

function getFallbackTabOptionDescription(
  tab: WorkspaceTabDescriptor,
  labels: {
    newTab: string;
    newAgent: string;
    workspaceSetup: string;
    agent: string;
    terminal: string;
    browser: string;
    changes: string;
    files: string;
    pullRequest: string;
  },
): string {
  if (tab.target.kind === "new_tab") {
    return labels.newTab;
  }
  if (tab.target.kind === "draft") {
    return labels.newAgent;
  }
  if (tab.target.kind === "setup") {
    return labels.workspaceSetup;
  }
  if (tab.target.kind === "agent") {
    return labels.agent;
  }
  if (tab.target.kind === "terminal") {
    return labels.terminal;
  }
  if (tab.target.kind === "browser") {
    return labels.browser;
  }
  if (tab.target.kind === "provider_subagent" || tab.target.kind === "subagents") {
    return labels.agent;
  }
  if (tab.target.kind === "commit_diff") {
    return tab.target.sha.slice(0, 7);
  }
  if (tab.target.kind === "working_diff" || tab.target.kind === "changes_tree") {
    return labels.changes;
  }
  if (tab.target.kind === "files") {
    return labels.files;
  }
  if (tab.target.kind === "pull_request") {
    return labels.pullRequest;
  }
  if (tab.target.kind === "plugin") {
    return tab.target.panelId;
  }
  return tab.target.path;
}

interface MobileWorkspaceTabSwitcherProps {
  tabs: WorkspaceTabDescriptor[];
  activeTabKey: string;
  activeTab: WorkspaceTabDescriptor | null;
  tabSwitcherOptions: ComboboxOption[];
  tabByKey: Map<string, WorkspaceTabDescriptor>;
  normalizedServerId: string;
  normalizedWorkspaceId: string;
  onSelectSwitcherTab: (key: string) => void;
  onCopyResumeCommand: (agentId: string) => Promise<void> | void;
  onCopyAgentId: (agentId: string) => Promise<void> | void;
  onCopyTerminalId: (terminalId: string) => Promise<void> | void;
  onCopyFilePath: (path: string) => Promise<void> | void;
  onReloadAgent: (agentId: string) => Promise<void> | void;
  onRenameTab: (tab: WorkspaceTabDescriptor) => void;
  onCloseTab: (tabId: string) => Promise<void> | void;
}

function MobileActiveTabTrigger({
  activeTab,
  normalizedServerId,
  normalizedWorkspaceId,
  backdrop,
}: {
  activeTab: WorkspaceTabDescriptor | null;
  normalizedServerId: string;
  normalizedWorkspaceId: string;
  backdrop: SurfaceBackdrop;
}) {
  if (!activeTab) {
    return null;
  }

  return (
    <ResolvedMobileActiveTabTrigger
      activeTab={activeTab}
      normalizedServerId={normalizedServerId}
      normalizedWorkspaceId={normalizedWorkspaceId}
      backdrop={backdrop}
    />
  );
}

function ResolvedMobileActiveTabTrigger({
  activeTab,
  normalizedServerId,
  normalizedWorkspaceId,
  backdrop,
}: {
  activeTab: WorkspaceTabDescriptor;
  normalizedServerId: string;
  normalizedWorkspaceId: string;
  backdrop: SurfaceBackdrop;
}) {
  const { t } = useTranslation();
  return (
    <WorkspaceTabPresentationResolver
      tab={activeTab}
      serverId={normalizedServerId}
      workspaceId={normalizedWorkspaceId}
    >
      {(presentation) => (
        <>
          <View style={styles.switcherTriggerIcon} testID="workspace-active-tab-icon">
            <WorkspaceTabIcon presentation={presentation} active backdrop={backdrop} />
          </View>

          <Text style={styles.switcherTriggerText} numberOfLines={1}>
            {presentation.titleState === "loading"
              ? t("workspace.tabs.loading")
              : presentation.label}
          </Text>
        </>
      )}
    </WorkspaceTabPresentationResolver>
  );
}

function WorkspaceDocumentTitleEffect({
  label,
  titleState,
}: {
  label: string;
  titleState: "ready" | "loading";
}) {
  const { t } = useTranslation();
  useEffect(() => {
    if (isNative || typeof document === "undefined") {
      return;
    }
    const resolvedLabel = label.trim();
    document.title =
      titleState === "loading"
        ? t("workspace.tabs.loading")
        : resolvedLabel || t("workspace.tabs.fallback.workspace");
  }, [label, titleState, t]);

  return null;
}

function switcherTriggerStyle({ pressed }: { pressed?: boolean }) {
  return [styles.switcherTrigger, Boolean(pressed) && styles.switcherTriggerPressed];
}

function MobileWorkspaceTabOption({
  tab,
  normalizedServerId,
  normalizedWorkspaceId,
  selected,
  active,
  onPress,
  onCopyResumeCommand,
  onCopyAgentId,
  onCopyTerminalId,
  onCopyFilePath,
  onReloadAgent,
  onRenameTab,
  onCloseTab,
}: {
  tab: WorkspaceTabDescriptor;
  normalizedServerId: string;
  normalizedWorkspaceId: string;
  selected: boolean;
  active: boolean;
  onPress: () => void;
  onCopyResumeCommand: (agentId: string) => Promise<void> | void;
  onCopyAgentId: (agentId: string) => Promise<void> | void;
  onCopyTerminalId: (terminalId: string) => Promise<void> | void;
  onCopyFilePath: (path: string) => Promise<void> | void;
  onReloadAgent: (agentId: string) => Promise<void> | void;
  onRenameTab: (tab: WorkspaceTabDescriptor) => void;
  onCloseTab: (tabId: string) => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const tabMenuLabels = useMemo<WorkspaceTabMenuLabels>(
    () => ({
      copyResumeCommand: t("workspace.tabs.menu.copyResumeCommand"),
      copyAgentId: t("workspace.tabs.menu.copyAgentId"),
      copyTerminalId: t("workspace.tabs.menu.copyTerminalId"),
      copyFilePath: t("workspace.tabs.menu.copyFilePath"),
      rename: t("workspace.tabs.menu.rename"),
      reloadAgent: t("workspace.tabs.menu.reloadAgent"),
      reloadAgentTooltip: t("workspace.tabs.menu.reloadAgentTooltip"),
      close: t("workspace.tabs.menu.close"),
    }),
    [t],
  );
  const menuTestIDBase = `workspace-tab-menu-${tab.tabId}`;
  const menuEntries = buildWorkspaceTabMenuEntries({
    tab,
    menuTestIDBase,
    onCopyResumeCommand,
    onCopyAgentId,
    onCopyTerminalId,
    onCopyFilePath,
    onReloadAgent,
    onRenameTab,
    onCloseTab,
    labels: tabMenuLabels,
  });

  const fallbackLabels = useMemo(
    () => ({
      newTab: t("workspace.chat.empty.title"),
      newAgent: t("workspace.tabs.fallback.newAgent"),
      setup: t("workspace.tabs.fallback.setup"),
      terminal: t("workspace.tabs.fallback.terminal"),
      browser: t("workspace.tabs.fallback.browser"),
      agent: t("workspace.tabs.fallback.agent"),
      changes: t("panels.diff.changesLabel"),
      files: t("panels.files.label"),
      pullRequest: t("panels.pullRequest.label"),
    }),
    [t],
  );
  const fallbackLabel = getFallbackTabOptionLabel(tab, fallbackLabels);
  const trailingAccessory = useMemo(
    () => (
      <MobileTabTrailingAccessory
        menuTestIDBase={menuTestIDBase}
        presentationLabel={fallbackLabel}
        menuEntries={menuEntries}
      />
    ),
    [menuTestIDBase, fallbackLabel, menuEntries],
  );

  const renderPresentation = useCallback(
    (presentation: WorkspaceTabPresentation) => (
      <WorkspaceTabOptionRow
        presentation={presentation}
        selected={selected}
        active={active}
        onPress={onPress}
        trailingAccessory={trailingAccessory}
      />
    ),
    [selected, active, onPress, trailingAccessory],
  );

  return (
    <WorkspaceTabPresentationResolver
      tab={tab}
      serverId={normalizedServerId}
      workspaceId={normalizedWorkspaceId}
    >
      {renderPresentation}
    </WorkspaceTabPresentationResolver>
  );
}

const MobileWorkspaceTabSwitcher = memo(function MobileWorkspaceTabSwitcher({
  tabs,
  activeTabKey,
  activeTab,
  tabSwitcherOptions,
  tabByKey,
  normalizedServerId,
  normalizedWorkspaceId,
  onSelectSwitcherTab,
  onCopyResumeCommand,
  onCopyAgentId,
  onCopyTerminalId,
  onCopyFilePath,
  onReloadAgent,
  onRenameTab,
  onCloseTab,
}: MobileWorkspaceTabSwitcherProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<View>(null);
  const handleOpenSwitcher = useCallback(() => {
    Keyboard.dismiss();
    setIsOpen(true);
  }, []);

  const renderTabOption = useCallback(
    ({
      option,
      selected,
      active,
      onPress,
    }: {
      option: ComboboxOption;
      selected: boolean;
      active: boolean;
      onPress: () => void;
    }) => {
      const tab = tabByKey.get(option.id);
      if (!tab) {
        return <View />;
      }
      return (
        <MobileWorkspaceTabOption
          tab={tab}
          normalizedServerId={normalizedServerId}
          normalizedWorkspaceId={normalizedWorkspaceId}
          selected={selected}
          active={active}
          onPress={onPress}
          onCopyResumeCommand={onCopyResumeCommand}
          onCopyAgentId={onCopyAgentId}
          onCopyTerminalId={onCopyTerminalId}
          onCopyFilePath={onCopyFilePath}
          onReloadAgent={onReloadAgent}
          onRenameTab={onRenameTab}
          onCloseTab={onCloseTab}
        />
      );
    },
    [
      tabByKey,
      normalizedServerId,
      normalizedWorkspaceId,
      onCopyResumeCommand,
      onCopyAgentId,
      onCopyTerminalId,
      onCopyFilePath,
      onReloadAgent,
      onRenameTab,
      onCloseTab,
    ],
  );

  return (
    <View style={styles.mobileTabsRow} testID="workspace-tabs-row">
      <Pressable
        ref={anchorRef}
        testID="workspace-tab-switcher-trigger"
        accessibilityRole="button"
        accessibilityLabel={t("workspace.tabs.switcher.trigger", { count: tabs.length })}
        style={switcherTriggerStyle}
        onPress={handleOpenSwitcher}
      >
        {({ pressed }) => (
          <>
            <View style={styles.switcherTriggerLeft}>
              <MobileActiveTabTrigger
                activeTab={activeTab}
                normalizedServerId={normalizedServerId}
                normalizedWorkspaceId={normalizedWorkspaceId}
                backdrop={pressed ? "surface1" : "surface0"}
              />
            </View>
            <ThemedChevronDown size={14} uniProps={mutedColorMapping} />
          </>
        )}
      </Pressable>

      <Combobox
        options={tabSwitcherOptions}
        value={activeTabKey}
        onSelect={onSelectSwitcherTab}
        searchable={false}
        title={t("workspace.tabs.switcher.title")}
        searchPlaceholder={t("workspace.tabs.switcher.searchPlaceholder")}
        open={isOpen}
        onOpenChange={setIsOpen}
        anchorRef={anchorRef}
        renderOption={renderTabOption}
      />
    </View>
  );
});

interface MobileMountedTabSlotProps {
  tabDescriptor: WorkspaceTabDescriptor;
  isVisible: boolean;
  isWorkspaceFocused: boolean;
  isPaneFocused: boolean;
  paneId: string | null;
  buildPaneContentModel: (input: {
    paneId: string | null;
    tab: WorkspaceTabDescriptor;
  }) => WorkspacePaneContentModel;
}

const MobileMountedTabSlot = memo(function MobileMountedTabSlot({
  tabDescriptor,
  isVisible,
  isWorkspaceFocused,
  isPaneFocused,
  paneId,
  buildPaneContentModel,
}: MobileMountedTabSlotProps) {
  const content = useMemo(
    () =>
      buildPaneContentModel({
        paneId,
        tab: tabDescriptor,
      }),
    [buildPaneContentModel, paneId, tabDescriptor],
  );

  return (
    <RenderProfile id={`MobileMountedTabSlot:${tabDescriptor.kind}:${tabDescriptor.tabId}`}>
      <RetainedPanel active={isVisible} style={styles.mobileMountedTabSlot}>
        <WorkspacePaneContent
          content={content}
          isWorkspaceFocused={isWorkspaceFocused}
          isPaneFocused={isPaneFocused}
        />
      </RetainedPanel>
    </RenderProfile>
  );
});

function useStableTabDescriptorMap(tabDescriptors: WorkspaceTabDescriptor[]) {
  const cacheRef = useRef(new Map<string, WorkspaceTabDescriptor>());
  const tabDescriptorMap = useMemo(() => {
    const next = new Map<string, WorkspaceTabDescriptor>();
    for (const tabDescriptor of tabDescriptors) {
      const cachedDescriptor = cacheRef.current.get(tabDescriptor.tabId);
      if (
        cachedDescriptor &&
        cachedDescriptor.key === tabDescriptor.key &&
        cachedDescriptor.kind === tabDescriptor.kind &&
        cachedDescriptor.state === tabDescriptor.state &&
        workspaceTabTargetsEqual(cachedDescriptor.target, tabDescriptor.target)
      ) {
        next.set(tabDescriptor.tabId, cachedDescriptor);
        continue;
      }
      next.set(tabDescriptor.tabId, tabDescriptor);
    }
    return next;
  }, [tabDescriptors]);
  useEffect(() => {
    cacheRef.current = tabDescriptorMap;
  }, [tabDescriptorMap]);

  return tabDescriptorMap;
}

export const WorkspaceScreen = memo(function WorkspaceScreen({
  serverId,
  workspaceId,
  isRouteFocused,
  recoveryRequested,
  recoveryAgentId,
}: WorkspaceScreenProps) {
  const navigationFocused = useIsFocused();
  useEffect(() => {
    traceInstant("paseo.workspace.mount", { serverId, workspaceId });
    return () => {
      traceInstant("paseo.workspace.unmount", { serverId, workspaceId });
    };
  }, [serverId, workspaceId]);
  return (
    <WorkspaceScreenContent
      serverId={serverId}
      workspaceId={workspaceId}
      isRouteFocused={isRouteFocused ?? navigationFocused}
      recoveryRequested={recoveryRequested ?? false}
      recoveryAgentId={recoveryAgentId ?? null}
    />
  );
});

interface UseCloseTabsResult {
  closeTab: (tabId: string, action: () => Promise<void>) => Promise<void>;
}

/** Guards against a double close while the first one is still confirming or archiving. */
function useCloseTabs(): UseCloseTabsResult {
  const pendingRef = useRef(new Set<string>());

  const closeTab = useCallback(async (tabId: string, action: () => Promise<void>) => {
    const normalized = tabId.trim();
    if (!normalized || pendingRef.current.has(normalized)) {
      return;
    }
    pendingRef.current.add(normalized);
    try {
      await action();
    } finally {
      pendingRef.current.delete(normalized);
    }
  }, []);

  return { closeTab };
}

/**
 * Which project the workspace belongs to, and which machine it runs on.
 *
 * Compact gets both, on their own line under the workspace name: this header is the only thing on
 * screen that says where the workspace lives, because the sidebar that normally carries the host
 * badge is closed. It still follows the host's own badge setting, so a purely local setup stays
 * quiet. A project name that only repeats the workspace name is dropped on wide, where the two sit
 * side by side, and kept on compact, where the line exists for the host anyway.
 */
function WorkspaceHeaderProjectRow({
  subtitle,
  isSubtitleDistinct,
  serverId,
}: {
  subtitle: string;
  isSubtitleDistinct: boolean;
  serverId: string;
}) {
  const isCompact = useIsCompactFormFactor();
  const hostBadge = useHostBadges({ enabled: isCompact }).get(serverId) ?? null;
  const showProject = isSubtitleDistinct || isCompact;
  if (!showProject && !hostBadge) {
    return null;
  }
  return (
    <View style={styles.headerProjectRow}>
      {showProject ? (
        <Text
          testID="workspace-header-subtitle"
          style={styles.headerProjectTitle}
          numberOfLines={1}
        >
          {subtitle}
        </Text>
      ) : null}
      {showProject && hostBadge ? <Text style={styles.headerProjectSeparator}>·</Text> : null}
      {hostBadge ? <HostBadge badge={hostBadge} /> : null}
    </View>
  );
}

interface WorkspaceHeaderTitleBarProps {
  isLoading: boolean;
  title: string;
  subtitle: string;
  isSubtitleDistinct: boolean;
  normalizedServerId: string;
}

/**
 * The Claude-desktop left-hand title: the chat's name with its project and host underneath.
 * Everything actionable sits in the header's right cluster.
 */
function WorkspaceHeaderTitleBar({
  isLoading,
  title,
  subtitle,
  isSubtitleDistinct,
  normalizedServerId,
}: WorkspaceHeaderTitleBarProps) {
  return (
    <View style={styles.headerTitleContainer}>
      {isLoading ? (
        <View style={styles.headerTitleTextGroup}>
          <View style={styles.headerTitleSkeleton} />
        </View>
      ) : (
        <View style={styles.headerTitleTextGroup}>
          <ScreenTitle testID="workspace-header-title">{title}</ScreenTitle>
          <WorkspaceHeaderProjectRow
            subtitle={subtitle}
            isSubtitleDistinct={isSubtitleDistinct}
            serverId={normalizedServerId}
          />
        </View>
      )}
    </View>
  );
}

interface RenderWorkspaceContentInput {
  isMissingWorkspaceDirectory: boolean;
  activeTabDescriptor: WorkspaceTabDescriptor | null;
  hasHydratedAgents: boolean;
  hasLoadedTerminals: boolean;
  mountedFocusedPaneTabIds: string[];
  focusedPaneTabDescriptorMap: Map<string, WorkspaceTabDescriptor>;
  isRouteFocused: boolean;
  focusedPaneId: string | null;
  buildMobilePaneContentModel: (input: {
    paneId: string | null;
    tab: WorkspaceTabDescriptor;
  }) => WorkspacePaneContentModel;
}

function renderWorkspaceContent(input: RenderWorkspaceContentInput): React.ReactNode {
  const {
    isMissingWorkspaceDirectory,
    activeTabDescriptor,
    hasHydratedAgents,
    hasLoadedTerminals,
    mountedFocusedPaneTabIds,
    focusedPaneTabDescriptorMap,
    isRouteFocused,
    focusedPaneId,
    buildMobilePaneContentModel,
  } = input;

  if (isMissingWorkspaceDirectory) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyStateText}>
          Workspace directory is missing. Reload workspace data before opening this chat.
        </Text>
      </View>
    );
  }
  if (!activeTabDescriptor && (!hasHydratedAgents || !hasLoadedTerminals)) {
    return (
      <View style={styles.emptyState}>
        <ThemedLoadingSpinner uniProps={mutedColorMapping} />
      </View>
    );
  }
  if (!activeTabDescriptor) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyStateText}>No chat is open yet.</Text>
      </View>
    );
  }
  return mountedFocusedPaneTabIds.map((tabId) => {
    const tabDescriptor = focusedPaneTabDescriptorMap.get(tabId);
    if (!tabDescriptor) {
      return null;
    }
    return (
      <MobileMountedTabSlot
        key={tabId}
        tabDescriptor={tabDescriptor}
        isVisible={isRouteFocused && tabId === activeTabDescriptor.tabId}
        isWorkspaceFocused={isRouteFocused}
        isPaneFocused={tabId === activeTabDescriptor.tabId}
        paneId={focusedPaneId}
        buildPaneContentModel={buildMobilePaneContentModel}
      />
    );
  });
}

interface WorkspaceHeaderFields {
  isWorkspaceHeaderLoading: boolean;
  workspaceHeaderTitle: string;
  workspaceHeaderSubtitle: string;
  isWorkspaceHeaderSubtitleDistinct: boolean;
  isGitCheckout: boolean;
  currentBranchName: string | null;
}

function buildWorkspaceHeaderCheckoutState(input: {
  isCheckoutStatusLoading: boolean;
  isError: boolean;
  data: CheckoutStatusPayload | undefined;
}): WorkspaceHeaderCheckoutState {
  if (input.isCheckoutStatusLoading) {
    return { kind: "pending" };
  }
  if (input.isError || !input.data) {
    return { kind: "error" };
  }
  return {
    kind: "ready",
    checkout: {
      isGit: input.data.isGit,
      currentBranch: input.data.currentBranch,
    },
  };
}

function deriveWorkspaceHeaderFields(input: {
  workspace: WorkspaceDescriptor | null;
  checkoutState: WorkspaceHeaderCheckoutState;
}): WorkspaceHeaderFields {
  const renderState = resolveWorkspaceHeaderRenderState(input);
  if (renderState.kind !== "ready") {
    return {
      isWorkspaceHeaderLoading: true,
      workspaceHeaderTitle: "",
      workspaceHeaderSubtitle: "",
      isWorkspaceHeaderSubtitleDistinct: false,
      isGitCheckout: false,
      currentBranchName: null,
    };
  }
  return {
    isWorkspaceHeaderLoading: false,
    workspaceHeaderTitle: renderState.title,
    workspaceHeaderSubtitle: renderState.subtitle,
    isWorkspaceHeaderSubtitleDistinct: renderState.isSubtitleDistinct,
    isGitCheckout: renderState.isGitCheckout,
    currentBranchName: renderState.currentBranchName,
  };
}

function getHostDisplayName(host: { label?: string | null } | null, fallback: string): string {
  const trimmed = host?.label?.trim();
  return trimmed ? trimmed : fallback;
}

function useWorkspaceRouteActions(normalizedServerId: string): {
  handleRetryHost: () => void;
  handleManageHost: () => void;
  handleDismissMissingWorkspace: () => void;
} {
  const router = useRouter();
  const handleRetryHost = useCallback(() => {
    if (!normalizedServerId) {
      return;
    }
    void getHostRuntimeStore().runProbeCycleNow(normalizedServerId);
  }, [normalizedServerId]);
  const handleManageHost = useCallback(() => {
    if (!normalizedServerId) {
      return;
    }
    router.push(buildSettingsHostRoute(normalizedServerId) as Href);
  }, [normalizedServerId, router]);
  const handleDismissMissingWorkspace = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    if (normalizedServerId) {
      router.replace(buildHostRootRoute(normalizedServerId) as Href);
      return;
    }
    router.replace("/" as Href);
  }, [normalizedServerId, router]);

  return {
    handleRetryHost,
    handleManageHost,
    handleDismissMissingWorkspace,
  };
}

function useResolvedWorkspaceRouteState(input: {
  serverId: string;
  workspace: WorkspaceDescriptor | null;
  hasHydratedWorkspaces: boolean;
  recovery: WorkspaceRecoveryModel;
}): WorkspaceRouteState {
  const hosts = useHosts();
  const host = useMemo(
    () => hosts.find((entry) => entry.serverId === input.serverId) ?? null,
    [hosts, input.serverId],
  );
  const hostSnapshot = useHostRuntimeSnapshot(input.serverId);
  const hostName = useMemo(() => getHostDisplayName(host, input.serverId), [host, input.serverId]);
  return useMemo(
    () =>
      resolveWorkspaceRouteState({
        hostName,
        connectionStatus: hostSnapshot?.connectionStatus ?? "connecting",
        lastError: hostSnapshot?.lastError ?? null,
        workspace: input.workspace,
        hasHydratedWorkspaces: input.hasHydratedWorkspaces,
        recovery: input.recovery,
      }),
    [
      hostName,
      hostSnapshot?.connectionStatus,
      hostSnapshot?.lastError,
      input.workspace,
      input.hasHydratedWorkspaces,
      input.recovery,
    ],
  );
}

function shouldInspectWorkspaceRecovery(
  hasHydratedWorkspaces: boolean,
  workspace: WorkspaceDescriptor | null,
  recoveryRequested: boolean,
): boolean {
  return recoveryRequested && hasHydratedWorkspaces && workspace === null;
}

function WorkspaceScreenGateFrame({ children }: { children: ReactNode }) {
  return (
    <>
      <ScreenHeader left={GATED_WORKSPACE_HEADER_LEFT} />
      <View style={styles.centerContent}>{children}</View>
    </>
  );
}

function WorkspaceContentProviders({
  children,
  workspaceKey,
}: {
  children: ReactNode;
  workspaceKey: string | null;
}) {
  return (
    <WorkspaceFocusProvider workspaceKey={workspaceKey}>
      <DiffDocumentWorkspaceCacheProvider>{children}</DiffDocumentWorkspaceCacheProvider>
    </WorkspaceFocusProvider>
  );
}

function WorkspacePanelContent({ content }: { content: ReactNode }) {
  return <View style={styles.content}>{content}</View>;
}

function renderWorkspaceScreenGateShell(input: {
  gate: ReactNode;
  workspaceKey: string | null;
}): ReactElement | null {
  if (!input.gate) {
    return null;
  }

  return (
    <WorkspaceFocusProvider workspaceKey={input.workspaceKey}>
      <View style={styles.container}>
        <View style={styles.threePaneRow}>
          <View style={styles.centerColumn}>
            <WorkspaceScreenGateFrame>{input.gate}</WorkspaceScreenGateFrame>
          </View>
        </View>
      </View>
    </WorkspaceFocusProvider>
  );
}

function WorkspaceDocumentTitleEffectSlot({
  tab,
  serverId,
  workspaceId,
  isRouteFocused,
}: {
  tab: WorkspaceTabDescriptor | null;
  serverId: string;
  workspaceId: string;
  isRouteFocused: boolean;
}) {
  if (!isRouteFocused || !isWeb || !tab) {
    return null;
  }

  return (
    <WorkspaceTabPresentationResolver tab={tab} serverId={serverId} workspaceId={workspaceId}>
      {(presentation) => (
        <WorkspaceDocumentTitleEffect
          label={presentation.label}
          titleState={presentation.titleState}
        />
      )}
    </WorkspaceTabPresentationResolver>
  );
}

function shouldShowWorkspaceScreenHeader(input: {
  isFocusModeEnabled: boolean;
  isMobile: boolean;
}): boolean {
  return !input.isFocusModeEnabled || input.isMobile;
}

function buildWorkspaceTerminalScopeKey(serverId: string, workspaceId: string): string | null {
  if (!serverId || !workspaceId) {
    return null;
  }
  return `${serverId}:${workspaceId}`;
}

interface WorkspaceTerminalTabActionsInput {
  persistenceKey: string | null;
  openWorkspaceTabFocused: (
    workspaceKey: string,
    target: WorkspaceTabTarget,
    placement?: WorkspaceTabPlacement,
  ) => string | null;
  replaceWorkspaceTabTarget: (
    workspaceKey: string,
    tabId: string,
    target: WorkspaceTabTarget,
  ) => string | null;
  labels: {
    workspacePathUnavailable: string;
    terminalQueued: string;
  };
  toast: {
    error: (message: string) => void;
    show: (message: string) => void;
  };
}

interface WorkspaceTerminalTabActions {
  handleTerminalCreated: (input: {
    terminalId: string;
    destination: TerminalTabDestination;
  }) => void;
  handleScriptTerminalSelected: (terminalId: string) => void;
  handleWorkspacePathUnavailable: () => void;
  handleTerminalCreateQueued: () => void;
  handleTerminalCreateFailed: (reason: string) => void;
}

function useWorkspaceTerminalTabActions({
  persistenceKey,
  openWorkspaceTabFocused,
  replaceWorkspaceTabTarget,
  labels,
  toast,
}: WorkspaceTerminalTabActionsInput): WorkspaceTerminalTabActions {
  const handleTerminalCreated = useCallback(
    ({ terminalId, destination }: { terminalId: string; destination: TerminalTabDestination }) => {
      if (!persistenceKey) {
        return;
      }
      if (destination.kind === "replace") {
        replaceWorkspaceTabTarget(persistenceKey, destination.tabId, {
          kind: "terminal",
          terminalId,
        });
        return;
      }
      openWorkspaceTabFocused(persistenceKey, { kind: "terminal", terminalId });
    },
    [openWorkspaceTabFocused, persistenceKey, replaceWorkspaceTabTarget],
  );
  const handleScriptTerminalSelected = useCallback(
    (terminalId: string) => {
      if (!persistenceKey) {
        return;
      }
      openWorkspaceTabFocused(
        persistenceKey,
        { kind: "terminal", terminalId },
        FOCUSED_PANE_PLACEMENT,
      );
    },
    [openWorkspaceTabFocused, persistenceKey],
  );
  const handleWorkspacePathUnavailable = useCallback(() => {
    toast.error(labels.workspacePathUnavailable);
  }, [labels.workspacePathUnavailable, toast]);
  const handleTerminalCreateQueued = useCallback(() => {
    toast.show(labels.terminalQueued);
  }, [labels.terminalQueued, toast]);
  const handleTerminalCreateFailed = useCallback(
    (reason: string) => {
      toast.error(reason);
    },
    [toast],
  );

  return {
    handleTerminalCreated,
    handleScriptTerminalSelected,
    handleWorkspacePathUnavailable,
    handleTerminalCreateQueued,
    handleTerminalCreateFailed,
  };
}

function WorkspaceScreenContent({
  serverId,
  workspaceId,
  isRouteFocused,
  recoveryRequested,
  recoveryAgentId,
}: WorkspaceScreenContentProps) {
  const { t } = useTranslation();
  const _insets = useSafeAreaInsets();
  const toast = useToast();
  const isMobile = useIsCompactFormFactor();
  const hasMacTrafficLights = useHasWindowChromeObstruction("top-left");
  const explorerToggleOwner = resolveWorkspaceExplorerToggleOwner({
    isMobile,
    hasMacTrafficLights,
  });
  const isFocusModeEnabled = usePanelStore((state) => state.desktop.focusModeEnabled);
  const toggleFocusMode = usePanelStore((state) => state.toggleFocusMode);

  const normalizedServerId = useMemo(() => trimNonEmpty(decodeSegment(serverId)) ?? "", [serverId]);

  const normalizedWorkspaceId = useMemo(
    () => resolveWorkspaceRouteId({ routeWorkspaceId: workspaceId }) ?? "",
    [workspaceId],
  );
  const workspaceDescriptor = useWorkspace(normalizedServerId, normalizedWorkspaceId);
  useEffect(() => {
    if (!normalizedServerId || !normalizedWorkspaceId || workspaceDescriptor) return;
    void getHostRuntimeStore()
      .prepareWorkspaceRoute(normalizedServerId, normalizedWorkspaceId)
      .catch(() => undefined);
  }, [normalizedServerId, normalizedWorkspaceId, workspaceDescriptor]);
  const workspaceScripts = getWorkspaceScripts(workspaceDescriptor);
  const { handleRetryHost, handleManageHost, handleDismissMissingWorkspace } =
    useWorkspaceRouteActions(normalizedServerId);

  const workspaceTerminalScopeKey = useMemo(
    () => buildWorkspaceTerminalScopeKey(normalizedServerId, normalizedWorkspaceId),
    [normalizedServerId, normalizedWorkspaceId],
  );
  useWorkspaceTerminalSessionRetention({
    scopeKey: workspaceTerminalScopeKey,
  });

  const client = useHostRuntimeClient(normalizedServerId);
  const isConnected = useHostRuntimeIsConnected(normalizedServerId);
  const supportsProvidersSnapshot = useSessionStore(
    (state) => state.sessions[normalizedServerId]?.serverInfo?.features?.providersSnapshot === true,
  );
  const workspaceDirectory = workspaceDescriptor?.workspaceDirectory || null;
  const isMissingWorkspaceDirectory = Boolean(workspaceDescriptor) && !workspaceDirectory;
  const [isImportSheetVisible, setIsImportSheetVisible] = useState(false);
  const canOpenImportSheet = [client, isConnected, workspaceDirectory].every(Boolean);
  const openImportSheet = useCallback(() => {
    setIsImportSheetVisible(true);
  }, []);
  const closeImportSheet = useCallback(() => {
    setIsImportSheetVisible(false);
  }, []);

  useEffect(() => {
    if (
      !isRouteFocused ||
      !isConnected ||
      !client ||
      !workspaceDirectory ||
      !supportsProvidersSnapshot
    ) {
      return;
    }
    prefetchProvidersSnapshot(normalizedServerId, client, { cwd: workspaceDirectory });
  }, [
    client,
    isConnected,
    isRouteFocused,
    normalizedServerId,
    supportsProvidersSnapshot,
    workspaceDirectory,
  ]);

  const persistenceKey = useMemo(
    () =>
      buildWorkspaceTabPersistenceKey({
        serverId: normalizedServerId,
        workspaceId: normalizedWorkspaceId,
      }),
    [normalizedServerId, normalizedWorkspaceId],
  );
  const openTab = useWorkspaceLayoutStore((state) => state.openTab);
  const replaceWorkspaceTabTarget = useWorkspaceLayoutStore((state) => state.replaceTab);
  const openWorkspaceTabFocused = useCallback(
    (workspaceKey: string, target: WorkspaceTabTarget, placement?: WorkspaceTabPlacement) =>
      openTab({ workspaceKey, target, intent: "reveal", placement }),
    [openTab],
  );
  const revealWorkspaceChildTab = useCallback(
    (
      workspaceKey: string,
      target: WorkspaceTabTarget,
      parentTabId: string,
      placement?: WorkspaceTabPlacement,
    ) => openTab({ workspaceKey, target, intent: "reveal", parentTabId, placement }),
    [openTab],
  );
  // File targets stay identity-stable so the same path reuses its tab. Keep navigation
  // requests separate so clicking an unchanged path:line can still recenter the pane.
  const [fileNavigationRevisionByTabId, setFileNavigationRevisionByTabId] = useState<
    Record<string, number>
  >({});
  const requestFileNavigation = useCallback((tabId: string) => {
    setFileNavigationRevisionByTabId((current) => ({
      ...current,
      [tabId]: (current[tabId] ?? 0) + 1,
    }));
  }, []);
  const hasHydratedWorkspaces = useSessionStore(
    (state) => state.sessions[normalizedServerId]?.hasHydratedWorkspaces ?? false,
  );
  const workspaceRecovery = useWorkspaceRecovery({
    serverId: normalizedServerId,
    workspaceId: normalizedWorkspaceId,
    agentId: recoveryAgentId,
    enabled: shouldInspectWorkspaceRecovery(
      hasHydratedWorkspaces,
      workspaceDescriptor,
      recoveryRequested,
    ),
  });

  const workspaceAgentVisibility = useStoreWithEqualityFn(
    useSessionStore,
    (state) =>
      deriveWorkspaceAgentVisibility({
        sessionAgents: state.sessions[normalizedServerId]?.agents,
        agentDetails: state.sessions[normalizedServerId]?.agentDetails,
        workspaceId: normalizedWorkspaceId,
      }),
    workspaceAgentVisibilityEqual,
  );

  const {
    handleTerminalCreated,
    handleScriptTerminalSelected,
    handleWorkspacePathUnavailable,
    handleTerminalCreateQueued,
    handleTerminalCreateFailed,
  } = useWorkspaceTerminalTabActions({
    persistenceKey,
    openWorkspaceTabFocused,
    replaceWorkspaceTabTarget,
    labels: {
      workspacePathUnavailable: t("workspace.header.toasts.workspacePathUnavailable"),
      terminalQueued: t("workspace.header.toasts.terminalQueued"),
    },
    toast,
  });
  const queryClient = useQueryClient();
  const {
    createMutation: createTerminalMutation,
    createTerminal,
    handleScriptTerminalStarted,
    handleViewScriptTerminal,
    invalidateTerminals,
    killMutation: killTerminalMutation,
    knownTerminalIds,
    liveTerminalIds,
    pendingCreateInput: pendingTerminalCreateInput,
    query: terminalsQuery,
    queryKey: terminalsQueryKey,
    removeTerminalFromCache,
    standaloneTerminalIds,
  } = useWorkspaceTerminals({
    client,
    isConnected,
    isRouteFocused,
    normalizedServerId,
    normalizedWorkspaceId,
    workspaceDirectory,
    workspaceScripts,
    hasHydratedWorkspaces,
    isMissingWorkspaceDirectory,
    onTerminalCreated: handleTerminalCreated,
    onScriptTerminalSelected: handleScriptTerminalSelected,
    onWorkspacePathUnavailable: handleWorkspacePathUnavailable,
    onTerminalCreateQueued: handleTerminalCreateQueued,
    onTerminalCreateFailed: handleTerminalCreateFailed,
  });
  const { archiveAgent } = useArchiveAgent();

  const { checkoutQuery, isCheckoutStatusLoading } = useWorkspaceCheckoutStatus({
    client,
    isConnected,
    isRouteFocused,
    normalizedServerId,
    normalizedWorkspaceId,
    workspaceDirectory,
  });
  const hasHydratedAgents = useSessionStore(
    (state) => state.sessions[normalizedServerId]?.hasHydratedAgents ?? false,
  );
  const workspaceRouteState = useResolvedWorkspaceRouteState({
    serverId: normalizedServerId,
    workspace: workspaceDescriptor,
    hasHydratedWorkspaces,
    recovery: workspaceRecovery.state,
  });
  const workspaceHeaderCheckoutState = buildWorkspaceHeaderCheckoutState({
    isCheckoutStatusLoading,
    isError: checkoutQuery.isError,
    data: checkoutQuery.data,
  });
  const {
    isWorkspaceHeaderLoading,
    workspaceHeaderTitle,
    workspaceHeaderSubtitle,
    isWorkspaceHeaderSubtitleDistinct,
    isGitCheckout,
    currentBranchName,
  } = deriveWorkspaceHeaderFields({
    workspace: workspaceDescriptor,
    checkoutState: workspaceHeaderCheckoutState,
  });
  const showMobileAgent = usePanelStore((state) => state.showMobileAgent);

  const activeExplorerCheckout = useMemo<ExplorerCheckoutContext | null>(() => {
    if (!normalizedServerId || !workspaceDirectory) {
      return null;
    }
    return {
      serverId: normalizedServerId,
      cwd: workspaceDirectory,
      isGit: isGitCheckout,
    };
  }, [isGitCheckout, normalizedServerId, workspaceDirectory]);

  const isExplorerSidebarShowing = useIsExplorerSidebarOpen({
    isCompact: isMobile,
    workspaceKey: persistenceKey,
  });
  const explorerSidebarToggleAccessibilityState = useMemo(
    () => ({ expanded: isExplorerSidebarShowing }),
    [isExplorerSidebarShowing],
  );

  useEffect(() => {
    // Back dismisses the compact overlay only. On a wide native layout the
    // explorer is a tab, `showMobileAgent` has no rendered consumer, and
    // returning true would swallow Back with nothing to show for it.
    if (!isRouteFocused || isWeb || !isMobile || !isExplorerSidebarShowing) {
      return;
    }

    const handler = BackHandler.addEventListener("hardwareBackPress", () => {
      showMobileAgent();
      return true;
    });

    return () => handler.remove();
  }, [isExplorerSidebarShowing, isMobile, isRouteFocused, showMobileAgent]);

  const workspaceLayout = useWorkspaceLayoutStore((state) =>
    persistenceKey ? (state.layoutByWorkspace[persistenceKey] ?? null) : null,
  );
  const explorerSidebarPaneId = useWorkspaceLayoutStore((state) =>
    persistenceKey ? selectExplorerSidebarPaneId(state, persistenceKey) : null,
  );
  const hasHydratedWorkspaceLayoutStore = useWorkspaceLayoutStoreHydrated();
  const workspaceSetupSnapshot = useWorkspaceSetupStore((state) =>
    persistenceKey ? (state.snapshots[persistenceKey] ?? null) : null,
  );
  const ensureWorkspaceSetupStatus = useWorkspaceSetupStore((state) => state.ensureSetupStatus);
  const claimFailedSetupSurface = useWorkspaceSetupStore((state) => state.claimFailedSetupSurface);
  const showWorkspaceSetup = shouldShowWorkspaceSetup(workspaceSetupSnapshot);
  const uiTabs = useMemo(
    () => (workspaceLayout ? collectAllTabs(workspaceLayout.root) : EMPTY_UI_TABS),
    [workspaceLayout],
  );
  useOpenAgentTabLabels({
    client,
    serverId: normalizedServerId,
    tabs: uiTabs,
    enabled: hasHydratedWorkspaceLayoutStore,
  });
  useSyncWorkspaceActiveBrowser({
    workspaceLayout,
    isRouteFocused,
    workspaceId: normalizedWorkspaceId,
  });
  const openWorkspaceTabInBackground = useCallback(
    (workspaceKey: string, target: WorkspaceTabTarget, placement?: WorkspaceTabPlacement) =>
      openTab({ workspaceKey, target, intent: "background", placement }),
    [openTab],
  );
  const focusWorkspaceTab = useWorkspaceLayoutStore((state) => state.focusTab);
  const selectWorkspaceTabInPane = useWorkspaceLayoutStore((state) => state.selectTabInPane);
  const closeWorkspaceTab = useWorkspaceLayoutStore((state) => state.closeTab);
  const unpinWorkspaceAgent = useWorkspaceLayoutStore((state) => state.unpinAgent);
  const hideWorkspaceAgent = useWorkspaceLayoutStore((state) => state.hideAgent);
  const setWorkspaceTabState = useWorkspaceLayoutStore((state) => state.setTabState);
  const reconcileWorkspaceTabs = useWorkspaceLayoutStore((state) => state.reconcileTabs);
  const showWorkspaceSidePanel = useWorkspaceLayoutStore((state) => state.showExplorerSidebar);
  const isSidePanelOpen = useWorkspaceLayoutStore((state) =>
    persistenceKey ? selectIsExplorerSidebarVisible(state, persistenceKey) : false,
  );
  const handleToggleExplorerSidebar = useCallback(() => {
    toggleExplorerSidebar({
      isCompact: isMobile,
      workspaceKey: persistenceKey,
      checkout: activeExplorerCheckout,
    });
  }, [activeExplorerCheckout, isMobile, persistenceKey]);
  const _pinnedAgentIds = useWorkspaceLayoutStore((state) =>
    persistenceKey
      ? (state.pinnedAgentIdsByWorkspace[persistenceKey] ?? EMPTY_PINNED_AGENT_IDS)
      : EMPTY_PINNED_AGENT_IDS,
  );
  const _hiddenAgentIds = useWorkspaceLayoutStore((state) =>
    persistenceKey ? (state.hiddenAgentIdsByWorkspace[persistenceKey] ?? EMPTY_SET) : EMPTY_SET,
  );
  const pendingByDraftId = useCreateFlowStore((state) => state.pendingByDraftId);
  const { closeTab } = useCloseTabs();
  const closeWorkspaceTabWithCleanup = useCallback(
    function closeWorkspaceTabWithCleanup(input: {
      tabId: string;
      target?: WorkspaceTabTarget | null;
    }) {
      const normalizedTabId = trimNonEmpty(input.tabId);
      if (!normalizedTabId || !persistenceKey) {
        return;
      }

      if (input.target?.kind === "agent") {
        unpinWorkspaceAgent(persistenceKey, input.target.agentId);
        hideWorkspaceAgent(persistenceKey, input.target.agentId);
      }
      if (input.target?.kind === "browser") {
        const { browserId } = input.target;
        useBrowserStore.getState().removeBrowser(browserId);
        removeResidentBrowserWebview(browserId);
        void getDesktopHost()?.browser?.unregisterWorkspaceBrowser?.(browserId);
      }
      closeWorkspaceTab(persistenceKey, normalizedTabId);
    },
    [closeWorkspaceTab, hideWorkspaceAgent, persistenceKey, unpinWorkspaceAgent],
  );

  const sidePanelState = useWorkspaceSidePanelState({ layout: workspaceLayout, tabs: uiTabs });
  /**
   * Compact has one surface, so it shows whichever of the two panes is live: the side panel
   * while it is open, and the chat otherwise. Wide renders both at once and does not use this.
   */
  const focusedPaneTabState = useMemo(
    () =>
      deriveWorkspacePaneState({
        layout: workspaceLayout,
        paneId: sidePanelState.isVisible ? EXPLORER_SIDEBAR_PANE_ID : DEFAULT_PANE_ID,
        tabs: uiTabs,
      }),
    [sidePanelState.isVisible, uiTabs, workspaceLayout],
  );
  const compactTabs = useMemo<WorkspaceTabDescriptor[]>(
    () =>
      uiTabs.map((tab) => ({
        key: tab.tabId,
        tabId: tab.tabId,
        kind: tab.target.kind,
        target: tab.target,
        state: tab.state,
      })),
    [uiTabs],
  );
  const viewedTimelineSync = useSessionStore(
    (state) => state.sessions[normalizedServerId]?.viewedTimelineSync ?? null,
  );
  const syncFocusedPaneOnly = useMemo(
    () => isMobile || isFocusModeEnabled || !supportsDesktopPaneSplits(),
    [isFocusModeEnabled, isMobile],
  );
  const visibleAgentIds = useVisibleAgentIds({
    layout: workspaceLayout,
    tabs: uiTabs,
    routeFocused: isRouteFocused,
    focusedPaneOnly: syncFocusedPaneOnly,
  });
  useEffect(() => {
    for (const agentId of visibleAgentIds) {
      void getHostRuntimeStore()
        .prepareAgentTimeline(normalizedServerId, agentId)
        .catch(() => undefined);
    }
  }, [normalizedServerId, visibleAgentIds]);
  useLayoutEffect(() => {
    if (!persistenceKey || !viewedTimelineSync) {
      return;
    }
    viewedTimelineSync.replaceVisibleAgentIds(persistenceKey, visibleAgentIds);
  }, [persistenceKey, viewedTimelineSync, visibleAgentIds]);
  useEffect(() => {
    if (!persistenceKey || !viewedTimelineSync) {
      return;
    }
    return () => viewedTimelineSync.replaceVisibleAgentIds(persistenceKey, []);
  }, [persistenceKey, viewedTimelineSync]);
  const setFocusedAgentId = useSessionStore((state) => state.setFocusedAgentId);
  const setFocusedTerminalId = useSessionStore((state) => state.setFocusedTerminalId);
  const focusedPaneAgentId = useMemo(() => {
    const target = focusedPaneTabState.activeTab?.descriptor.target;
    if (target?.kind !== "agent") {
      return null;
    }
    return target.agentId;
  }, [focusedPaneTabState.activeTab]);
  const focusedPaneTerminalId = useMemo(() => {
    const target = focusedPaneTabState.activeTab?.descriptor.target;
    if (target?.kind !== "terminal") {
      return null;
    }
    return target.terminalId;
  }, [focusedPaneTabState.activeTab]);

  useEffect(() => {
    if (!isRouteFocused) {
      return;
    }
    setFocusedAgentId(normalizedServerId, focusedPaneAgentId);
    setFocusedTerminalId(normalizedServerId, focusedPaneTerminalId);
  }, [
    focusedPaneAgentId,
    focusedPaneTerminalId,
    isRouteFocused,
    normalizedServerId,
    setFocusedAgentId,
    setFocusedTerminalId,
  ]);

  useEffect(() => {
    if (!isRouteFocused) {
      return;
    }
    return () => {
      setFocusedAgentId(normalizedServerId, null);
      setFocusedTerminalId(normalizedServerId, null);
    };
  }, [isRouteFocused, normalizedServerId, setFocusedAgentId, setFocusedTerminalId]);

  const openWorkspaceDraftTab = useCallback(
    function openWorkspaceDraftTab(input?: { draftId?: string; focus?: boolean }) {
      if (!persistenceKey) {
        return null;
      }

      const target = normalizeWorkspaceTabTarget({
        kind: "draft",
        draftId: trimNonEmpty(input?.draftId) ?? generateDraftId(),
      });
      invariant(target?.kind === "draft", "Draft tab target must be valid");
      if (input?.focus === false) {
        return openWorkspaceTabInBackground(persistenceKey, target);
      }
      return openWorkspaceTabFocused(persistenceKey, target);
    },
    [openWorkspaceTabFocused, openWorkspaceTabInBackground, persistenceKey],
  );

  useLayoutEffect(() => {
    if (!isRouteFocused) {
      return;
    }
    if (!normalizedServerId || !normalizedWorkspaceId || !persistenceKey) {
      return;
    }
    if (!hasHydratedWorkspaceLayoutStore) {
      return;
    }

    const hasActivePendingDraftCreateInWorkspace = uiTabs.some((tab) => {
      if (tab.target.kind !== "draft") {
        return false;
      }
      const pending = pendingByDraftId[tab.target.draftId];
      return pending?.serverId === normalizedServerId && pending.lifecycle === "active";
    });

    reconcileWorkspaceTabs(
      persistenceKey,
      buildWorkspaceTabSnapshot({
        agentVisibility: workspaceAgentVisibility,
        agentsHydrated: hasHydratedAgents,
        terminalsHydrated: terminalsQuery.isSuccess,
        knownTerminalIds,
        standaloneTerminalIds,
        hasActivePendingTerminalCreate:
          createTerminalMutation.isPending || pendingTerminalCreateInput !== null,
        hasActivePendingDraftCreate: hasActivePendingDraftCreateInWorkspace,
      }),
    );
  }, [
    hasHydratedAgents,
    hasHydratedWorkspaceLayoutStore,
    pendingTerminalCreateInput,
    createTerminalMutation.isPending,
    isRouteFocused,
    normalizedServerId,
    normalizedWorkspaceId,
    pendingByDraftId,
    persistenceKey,
    reconcileWorkspaceTabs,
    knownTerminalIds,
    standaloneTerminalIds,
    terminalsQuery.isSuccess,
    uiTabs,
    workspaceAgentVisibility,
  ]);

  const activeTabId = focusedPaneTabState.activeTabId;
  const activeTab = focusedPaneTabState.activeTab;

  const tabs = useMemo<WorkspaceTabDescriptor[]>(
    () => focusedPaneTabState.tabs.map((tab) => tab.descriptor),
    [focusedPaneTabState.tabs],
  );
  /** Compact's switcher lists every open surface, not just the visible pane's. */
  const switcherTabs = isMobile ? compactTabs : tabs;
  const hasSetupTab = useMemo(
    () =>
      uiTabs.some(
        (tab) => tab.target.kind === "setup" && tab.target.workspaceId === normalizedWorkspaceId,
      ),
    [normalizedWorkspaceId, uiTabs],
  );
  const navigateToTabId = useCallback(
    function navigateToTabId(tabId: string) {
      if (!tabId || !persistenceKey) {
        return;
      }
      focusWorkspaceTab(persistenceKey, tabId);
    },
    [focusWorkspaceTab, persistenceKey],
  );
  const handleImportedAgent = useCallback(
    (agentId: string) => {
      if (!persistenceKey) {
        return;
      }
      const tabId = openWorkspaceTabFocused(
        persistenceKey,
        { kind: "agent", agentId },
        FOCUSED_PANE_PLACEMENT,
      );
      if (tabId) {
        navigateToTabId(tabId);
      }
    },
    [navigateToTabId, openWorkspaceTabFocused, persistenceKey],
  );

  useEffect(() => {
    if (!isRouteFocused) {
      return;
    }
    if (!persistenceKey) {
      return;
    }
    if (!shouldSeedWorkspaceSetupTab(workspaceSetupSnapshot)) {
      return;
    }

    const target = normalizeWorkspaceTabTarget({
      kind: "setup",
      workspaceId: normalizedWorkspaceId,
    });
    if (!target) {
      return;
    }
    if (
      !claimFailedSetupSurface({
        serverId: normalizedServerId,
        workspaceId: normalizedWorkspaceId,
      })
    ) {
      return;
    }
    if (hasSetupTab) {
      return;
    }

    openWorkspaceTabInBackground(persistenceKey, target);
  }, [
    claimFailedSetupSurface,
    hasSetupTab,
    isRouteFocused,
    normalizedWorkspaceId,
    normalizedServerId,
    openWorkspaceTabInBackground,
    persistenceKey,
    workspaceSetupSnapshot,
  ]);

  useEffect(() => {
    if (!isRouteFocused || !client || !normalizedServerId || !normalizedWorkspaceId) {
      return;
    }
    ensureWorkspaceSetupStatus({
      serverId: normalizedServerId,
      workspaceId: normalizedWorkspaceId,
      client,
    });
  }, [
    client,
    ensureWorkspaceSetupStatus,
    isRouteFocused,
    normalizedServerId,
    normalizedWorkspaceId,
  ]);

  /**
   * Every file, from chat, the tree or a terminal link, opens in the one side panel. There is
   * no second destination left to choose between, so the request's disposition is ignored.
   */
  const handleOpenFileFromChat = useCallback(
    (location: WorkspaceFileLocation, parentTabId?: string | null) => {
      const normalizedLocation = normalizeWorkspaceFileLocation(location);
      if (!normalizedLocation || !persistenceKey) {
        return;
      }
      if (isMobile) {
        showMobileAgent();
      }
      const tabId = openWorkspaceSupportingTarget({
        workspaceKey: persistenceKey,
        target: createWorkspaceFileTabTarget(normalizedLocation),
        parentTabId,
        preview: { serverId: normalizedServerId, workspaceId: normalizedWorkspaceId },
      });
      if (tabId) {
        requestFileNavigation(tabId);
        navigateToTabId(tabId);
      }
    },
    [
      isMobile,
      navigateToTabId,
      normalizedServerId,
      normalizedWorkspaceId,
      persistenceKey,
      requestFileNavigation,
      showMobileAgent,
    ],
  );

  const handleOpenWorkspaceFileFromPane = useStableEvent(function handleOpenWorkspaceFileFromPane({
    request,
    parentTabId,
  }: {
    request: WorkspaceFileOpenRequest;
    parentTabId: string;
  }) {
    handleOpenFileFromChat(request.location, parentTabId);
  });

  const { handleRenameTab, renamingTab, handleRenameModalSubmit, handleRenameModalClose } =
    useWorkspaceTabRename({
      client,
      normalizedServerId,
      queryClient,
      terminalsData: terminalsQuery.data,
      terminalsQueryKey,
    });

  const tabByKey = useMemo(() => {
    const map = new Map<string, WorkspaceTabDescriptor>();
    for (const tab of switcherTabs) {
      map.set(tab.key, tab);
    }
    return map;
  }, [switcherTabs]);

  const allTabDescriptorsById = useMemo(() => {
    const map = new Map<string, WorkspaceTabDescriptor>();
    for (const tab of uiTabs) {
      map.set(tab.tabId, {
        key: tab.tabId,
        tabId: tab.tabId,
        kind: tab.target.kind,
        target: tab.target,
      });
    }
    return map;
  }, [uiTabs]);
  const explorerSidebarToggleLabel = isExplorerSidebarShowing
    ? t("workspace.tabs.explorerSidebar.close")
    : t("workspace.tabs.explorerSidebar.open");

  const activeTabKey = useMemo(() => activeTabId ?? "", [activeTabId]);
  const tabFallbackLabels = useMemo(
    () => ({
      newTab: t("workspace.chat.empty.title"),
      newAgent: t("workspace.tabs.fallback.newAgent"),
      setup: t("workspace.tabs.fallback.setup"),
      workspaceSetup: t("workspace.tabs.fallback.workspaceSetup"),
      terminal: t("workspace.tabs.fallback.terminal"),
      browser: t("workspace.tabs.fallback.browser"),
      agent: t("workspace.tabs.fallback.agent"),
      changes: t("panels.diff.changesLabel"),
      files: t("panels.files.label"),
      pullRequest: t("panels.pullRequest.label"),
    }),
    [t],
  );

  const tabSwitcherOptions = useMemo(
    () =>
      switcherTabs.map((tab) => ({
        id: tab.key,
        label: getFallbackTabOptionLabel(tab, tabFallbackLabels),
        description: getFallbackTabOptionDescription(tab, tabFallbackLabels),
      })),
    [switcherTabs, tabFallbackLabels],
  );

  const handleCreateDraftTab = useCallback(() => {
    openWorkspaceDraftTab();
  }, [openWorkspaceDraftTab]);

  const isTerminalInSidePanel = sidePanelState.isVisible && sidePanelState.viewKind === "terminal";
  const isBrowserInSidePanel = sidePanelState.isVisible && sidePanelState.viewKind === "browser";

  const closeSidePanel = useCallback(() => {
    if (persistenceKey) {
      hideExplorerSidebar({
        isCompact: isMobile,
        workspaceKey: persistenceKey,
        checkout: activeExplorerCheckout,
      });
    }
  }, [activeExplorerCheckout, isMobile, persistenceKey]);

  /**
   * The header button is a toggle over one dock: put the terminal away when it is the thing on
   * screen, bring the newest one back when it is not, and only start a new one when none is live.
   */
  const handleToggleTerminal = useStableEvent(() => {
    if (!persistenceKey) {
      return;
    }
    if (isTerminalInSidePanel) {
      closeSidePanel();
      return;
    }
    const existing = uiTabs.findLast((tab) => tab.target.kind === "terminal");
    if (existing) {
      showWorkspaceSidePanel(persistenceKey);
      focusWorkspaceTab(persistenceKey, existing.tabId);
      return;
    }
    createTerminal({ destination: { kind: "open" } });
  });

  const handleOpenChangesView = useStableEvent(() => {
    if (!persistenceKey) {
      return;
    }
    openExplorerSidebarView({
      isCompact: isMobile,
      workspaceKey: persistenceKey,
      checkout: activeExplorerCheckout,
      view: "changes",
    });
  });

  const handleOpenFilesView = useStableEvent(() => {
    if (!persistenceKey) {
      return;
    }
    openExplorerSidebarView({
      isCompact: isMobile,
      workspaceKey: persistenceKey,
      checkout: activeExplorerCheckout,
      view: "files",
    });
  });

  const handleCreateTerminalWithProfile = useCallback(
    (profile: TerminalProfile) => {
      createTerminal({ profile, destination: { kind: "open" } });
    },
    [createTerminal],
  );

  const handleToggleBrowser = useStableEvent(() => {
    if (!persistenceKey || !getIsElectron()) {
      return;
    }
    if (isBrowserInSidePanel) {
      closeSidePanel();
      return;
    }
    const existing = uiTabs.findLast((tab) => tab.target.kind === "browser");
    if (existing) {
      showWorkspaceSidePanel(persistenceKey);
      focusWorkspaceTab(persistenceKey, existing.tabId);
      return;
    }
    const { browserId } = createWorkspaceBrowser();
    openWorkspaceTabFocused(persistenceKey, { kind: "browser", browserId });
  });

  const handleOpenUrlInBrowserTab = useCallback(
    (url: string) => {
      if (!persistenceKey || !getIsElectron()) {
        return;
      }
      const { browserId } = createWorkspaceBrowser({ initialUrl: url });
      openWorkspaceTabFocused(persistenceKey, { kind: "browser", browserId });
    },
    [openWorkspaceTabFocused, persistenceKey],
  );

  useDesktopBrowserNewTabRequests({
    enabled: Boolean(persistenceKey),
    workspaceLayout,
    openUrl: handleOpenUrlInBrowserTab,
  });

  const handleSelectSwitcherTab = useCallback(
    (key: string) => {
      if (!persistenceKey) {
        return;
      }
      // Picking a chat puts the side panel away; picking anything else brings it forward.
      const chosen = uiTabs.find((tab) => tab.tabId === key) ?? null;
      if (chosen && panelSupportsHost(chosen.target.kind, "main")) {
        closeSidePanel();
      }
      navigateToTabId(key);
    },
    [closeSidePanel, navigateToTabId, persistenceKey, uiTabs],
  );

  const killTerminalAsync = killTerminalMutation.mutateAsync;

  const handleCloseTerminalTab = useCallback(
    async (input: { tabId: string; terminalId: string }) => {
      const { tabId, terminalId } = input;
      await closeTab(tabId, async () => {
        const confirmed = await confirmDialog({
          title: t("workspace.tabs.confirmations.closeTerminalTitle"),
          message: t("workspace.tabs.confirmations.closeTerminalMessage"),
          confirmLabel: t("workspace.tabs.confirmations.close"),
          cancelLabel: t("workspace.tabs.confirmations.cancel"),
          destructive: true,
        });
        if (!confirmed) {
          return;
        }

        removeTerminalFromCache(terminalId);
        if (persistenceKey) {
          closeWorkspaceTabWithCleanup({
            tabId,
            target: { kind: "terminal", terminalId },
          });
        }

        void killTerminalAsync(terminalId).catch(invalidateTerminals);
      });
    },
    [
      closeTab,
      closeWorkspaceTabWithCleanup,
      invalidateTerminals,
      killTerminalAsync,
      persistenceKey,
      removeTerminalFromCache,
      t,
    ],
  );

  const handleCloseAgentTab = useCallback(
    async (input: { tabId: string; agentId: string }) => {
      const { tabId, agentId } = input;
      await closeTab(tabId, async () => {
        if (!normalizedServerId) {
          return;
        }

        const agent =
          useSessionStore.getState().sessions[normalizedServerId]?.agents?.get(agentId) ?? null;
        let closePolicy = resolveCloseAgentTabPolicy(agent);
        const isRunning = agent?.status === "running";

        if (isRunning && closePolicy.kind === "archive-on-close") {
          const confirmed = await confirmDialog({
            title: t("workspace.tabs.confirmations.archiveRunningAgentTitle"),
            message: t("workspace.tabs.confirmations.archiveRunningAgentMessage"),
            confirmLabel: t("workspace.tabs.confirmations.archive"),
            cancelLabel: t("workspace.tabs.confirmations.cancel"),
            destructive: true,
          });
          if (!confirmed) {
            return;
          }
        }

        if (closePolicy.kind === "layout-only") {
          const sessionClient = useSessionStore.getState().sessions[normalizedServerId]?.client;
          if (!sessionClient) {
            toast.error(t("common.errors.daemonClientUnavailable"));
            return;
          }
          try {
            const clientId = await getOrCreateClientId();
            await sessionClient.updateAgent(agentId, {
              labels: { [getOpenAgentTabLabel(clientId)]: "false" },
            });
            const latestAgent =
              useSessionStore.getState().sessions[normalizedServerId]?.agents?.get(agentId) ?? null;
            closePolicy = resolveCloseAgentTabPolicy(latestAgent);
          } catch (error) {
            console.error("[WorkspaceScreen] Failed to close subagent tab", { error, agentId });
            toast.error(t("workspace.tabs.toasts.failedToCloseAgent"));
            return;
          }
        }

        if (persistenceKey) {
          closeWorkspaceTabWithCleanup({
            tabId,
            target: { kind: "agent", agentId },
          });
        }

        if (closePolicy.kind === "layout-only") {
          return;
        }

        // Errors (e.g. timeout) are handled by the mutation's onSettled callback
        void archiveAgent({ serverId: normalizedServerId, agentId }).catch(() => {});
      });
    },
    [
      archiveAgent,
      closeTab,
      closeWorkspaceTabWithCleanup,
      normalizedServerId,
      persistenceKey,
      t,
      toast,
    ],
  );

  const handleClosePassiveTab = useCallback(
    function handleClosePassiveTab(input: { tabId: string; target?: WorkspaceTabTarget | null }) {
      if (persistenceKey) {
        closeWorkspaceTabWithCleanup({ tabId: input.tabId, target: input.target });
      }
    },
    [closeWorkspaceTabWithCleanup, persistenceKey],
  );

  const confirmDiscardModifiedTab = useCallback(
    async (tabId: string): Promise<boolean> => {
      const attributes = getPanelInstanceAttributes({
        serverId: normalizedServerId,
        workspaceId: normalizedWorkspaceId,
        tabId,
      });
      if (!attributes.modified) return true;
      const resumePendingSave = attributes.suspendPendingSave?.();
      const confirmed = await confirmDialog({
        title: t("workspace.tabs.confirmations.unsavedTitle"),
        message: t("workspace.tabs.confirmations.unsavedMessage"),
        confirmLabel: t("workspace.tabs.confirmations.closeWithoutSaving"),
        cancelLabel: t("workspace.tabs.confirmations.cancel"),
        destructive: true,
      });
      if (!confirmed) resumePendingSave?.();
      return confirmed;
    },
    [normalizedServerId, normalizedWorkspaceId, t],
  );

  const handleCloseTabById = useCallback(
    async (tabId: string) => {
      const tab = allTabDescriptorsById.get(tabId);
      if (!tab) {
        return;
      }
      if (!(await confirmDiscardModifiedTab(tabId))) {
        return;
      }
      if (tab.target.kind === "terminal") {
        await handleCloseTerminalTab({ tabId, terminalId: tab.target.terminalId });
        return;
      }
      if (tab.target.kind === "agent") {
        await handleCloseAgentTab({ tabId, agentId: tab.target.agentId });
        return;
      }
      handleClosePassiveTab({ tabId, target: tab.target });
    },
    [
      allTabDescriptorsById,
      confirmDiscardModifiedTab,
      handleCloseAgentTab,
      handleClosePassiveTab,
      handleCloseTerminalTab,
    ],
  );

  const handleCopyAgentId = useCallback(
    async (agentId: string) => {
      if (!agentId) return;
      try {
        await Clipboard.setStringAsync(agentId);
        toast.copied(t("workspace.tabs.toasts.agentIdCopiedLabel"));
      } catch {
        toast.error(t("workspace.tabs.toasts.copyFailed"));
      }
    },
    [toast, t],
  );

  const handleCopyTerminalId = useCallback(
    async (terminalId: string) => {
      if (!terminalId) return;
      try {
        await Clipboard.setStringAsync(terminalId);
        toast.copied(t("workspace.tabs.toasts.terminalIdCopiedLabel"));
      } catch {
        toast.error(t("workspace.tabs.toasts.copyFailed"));
      }
    },
    [toast, t],
  );

  const handleCopyFilePath = useCallback(
    async (path: string) => {
      if (!path) return;
      try {
        await Clipboard.setStringAsync(path);
        toast.copied(t("workspace.tabs.toasts.filePathCopiedLabel"));
      } catch {
        toast.error(t("workspace.tabs.toasts.copyFailed"));
      }
    },
    [toast, t],
  );

  const handleCopyResumeCommand = useCallback(
    async (agentId: string) => {
      if (!agentId) return;
      const agent =
        useSessionStore.getState().sessions[normalizedServerId]?.agents?.get(agentId) ?? null;
      const providerSessionId =
        agent?.runtimeInfo?.sessionId ?? agent?.persistence?.sessionId ?? null;
      if (!agent || !providerSessionId) {
        toast.error(t("workspace.tabs.toasts.resumeIdUnavailable"));
        return;
      }

      const command =
        buildProviderCommand({
          provider: agent.provider,
          id: "resume",
          sessionId: providerSessionId,
        }) ?? null;
      if (!command) {
        toast.error(t("workspace.tabs.toasts.resumeCommandUnavailable"));
        return;
      }
      try {
        await Clipboard.setStringAsync(command);
        toast.copied(t("workspace.tabs.toasts.resumeCommandCopiedLabel"));
      } catch {
        toast.error(t("workspace.tabs.toasts.copyFailed"));
      }
    },
    [normalizedServerId, toast, t],
  );

  const handleReloadAgent = useCallback(
    async (agentId: string) => {
      if (!client || !isConnected) {
        toast.error(t("workspace.terminal.hostDisconnected"));
        return;
      }

      toast.show(t("workspace.tabs.toasts.reloadingAgent"), { durationMs: null });
      try {
        await client.refreshAgent(agentId);
        // Send the existing cursor so the server detects the new epoch and
        // returns reset:true. Without a cursor, the server returns reset:false
        // and the client takes the incremental path, where new-epoch rows are
        // dropped against the stale cursor.
        const sessionState = useSessionStore.getState().sessions[normalizedServerId];
        const currentCursor = sessionState?.agentTimelineCursor.get(agentId);
        await getHostRuntimeStore().fetchAgentTimeline(normalizedServerId, agentId, {
          direction: "tail",
          projection: "projected",
          ...(currentCursor
            ? { cursor: { epoch: currentCursor.epoch, seq: currentCursor.endSeq } }
            : {}),
        });
        toast.show(t("workspace.tabs.toasts.reloadedAgent"), { variant: "success" });
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : t("workspace.tabs.toasts.failedToReloadAgent"),
        );
      }
    },
    [client, isConnected, normalizedServerId, toast, t],
  );

  const handleCopyWorkspacePath = useCallback(async () => {
    if (!workspaceDirectory) {
      toast.error(t("workspace.header.toasts.workspacePathUnavailable"));
      return;
    }

    try {
      await Clipboard.setStringAsync(workspaceDirectory);
      toast.copied(t("workspace.header.toasts.workspacePathCopiedLabel"));
    } catch {
      toast.error(t("workspace.tabs.toasts.copyFailed"));
    }
  }, [toast, workspaceDirectory, t]);

  const handleCopyBranchName = useCallback(async () => {
    if (!currentBranchName) {
      toast.error(t("workspace.header.toasts.branchNameUnavailable"));
      return;
    }

    try {
      await Clipboard.setStringAsync(currentBranchName);
      toast.copied(t("workspace.header.toasts.branchNameCopiedLabel"));
    } catch {
      toast.error(t("workspace.tabs.toasts.copyFailed"));
    }
  }, [currentBranchName, toast, t]);

  const handleOpenSetupTab = useCallback(() => {
    if (!persistenceKey) {
      return;
    }
    const target = normalizeWorkspaceTabTarget({
      kind: "setup",
      workspaceId: normalizedWorkspaceId,
    });
    if (!target) {
      return;
    }
    openWorkspaceTabFocused(persistenceKey, target, FOCUSED_PANE_PLACEMENT);
  }, [normalizedWorkspaceId, openWorkspaceTabFocused, persistenceKey]);

  const handleWorkspacePanelOpenAction = useCallback(
    (action: KeyboardActionDefinition): boolean => {
      if (action.id !== "workspace.tab.open") return false;
      if (!persistenceKey) return true;

      if (action.target === "files" || action.target === "changes") {
        openExplorerSidebarView({
          isCompact: isMobile,
          workspaceKey: persistenceKey,
          checkout: activeExplorerCheckout,
          view: action.target === "files" ? "files" : "changes",
        });
        return true;
      }
      openWorkspacePullRequest({
        isCompact: isMobile,
        workspaceKey: persistenceKey,
        checkout: activeExplorerCheckout,
      });
      return true;
    },
    [activeExplorerCheckout, isMobile, persistenceKey],
  );

  const handleWorkspaceCurrentTabMetadataAction = useCallback(
    (action: KeyboardActionDefinition): boolean => {
      const descriptor = activeTab?.descriptor;
      switch (action.id) {
        case "workspace.tab.rename-current":
          if (descriptor) handleRenameTab(descriptor);
          return true;
        case "workspace.tab.reload-current":
          if (descriptor?.target.kind === "agent")
            void handleReloadAgent(descriptor.target.agentId);
          return true;
        case "workspace.tab.copy-resume-command":
          if (descriptor?.target.kind === "agent") {
            void handleCopyResumeCommand(descriptor.target.agentId);
          }
          return true;
        case "workspace.tab.copy-id":
          if (descriptor?.target.kind === "agent")
            void handleCopyAgentId(descriptor.target.agentId);
          if (descriptor?.target.kind === "terminal") {
            void handleCopyTerminalId(descriptor.target.terminalId);
          }
          return true;
        case "workspace.tab.copy-file-path":
          if (descriptor?.target.kind === "file") void handleCopyFilePath(descriptor.target.path);
          return true;
        default:
          return false;
      }
    },
    [
      activeTab,
      handleCopyAgentId,
      handleCopyFilePath,
      handleCopyResumeCommand,
      handleCopyTerminalId,
      handleReloadAgent,
      handleRenameTab,
    ],
  );

  const handleWorkspaceChatAction = useCallback(
    (action: KeyboardActionDefinition): boolean => {
      switch (action.id) {
        case "workspace.agent.new":
        case "workspace.tab.target.agent":
          handleCreateDraftTab();
          return true;
        case "workspace.terminal.new":
          handleToggleTerminal();
          return true;
        case "workspace.browser.new":
        case "workspace.tab.target.browser":
          handleToggleBrowser();
          return true;
        case "workspace.tab.target.changes":
          if (persistenceKey && isGitCheckout) {
            openExplorerSidebarView({
              isCompact: isMobile,
              workspaceKey: persistenceKey,
              checkout: activeExplorerCheckout,
              view: "changes",
            });
          }
          return true;
        case "workspace.tab.target.files":
          if (persistenceKey) {
            openExplorerSidebarView({
              isCompact: isMobile,
              workspaceKey: persistenceKey,
              checkout: activeExplorerCheckout,
              view: "files",
            });
          }
          return true;
        case "workspace.tab.close-current":
          if (activeTabId) {
            void handleCloseTabById(activeTabId);
          }
          return true;
        case "workspace.sidePanel.close":
          if (isSidePanelOpen) {
            closeSidePanel();
          }
          return isSidePanelOpen;
        default:
          return false;
      }
    },
    [
      activeExplorerCheckout,
      activeTabId,
      closeSidePanel,
      handleCloseTabById,
      handleCreateDraftTab,
      handleToggleBrowser,
      handleToggleTerminal,
      isGitCheckout,
      isMobile,
      isSidePanelOpen,
      persistenceKey,
    ],
  );

  const handleWorkspaceSidebarAction = useCallback(
    (action: KeyboardActionDefinition): boolean => {
      if (action.id === "sidebar.toggle.right") {
        handleToggleExplorerSidebar();
        return true;
      }
      if (action.id !== "sidebar.toggle.both") {
        return false;
      }
      // This screen owns the layout key and the checkout, so it is the only
      // place that can read "is the explorer open" correctly.
      const panel = usePanelStore.getState();
      toggleDesktopSidebarsWithCheckoutIntent({
        isAgentListOpen: selectIsAgentListOpen(panel, { isCompact: isMobile }),
        isExplorerOpen: isExplorerSidebarOpen({
          isCompact: isMobile,
          workspaceKey: persistenceKey,
        }),
        openAgentList: () => panel.openAgentListForLayout({ isCompact: isMobile }),
        closeAgentList: () => panel.closeAgentListForLayout({ isCompact: isMobile }),
        toggleExplorer: handleToggleExplorerSidebar,
      });
      return true;
    },
    [handleToggleExplorerSidebar, isMobile, persistenceKey],
  );

  const handleWorkspaceFocusModeAction = useCallback((): boolean => {
    toggleFocusMode();
    return true;
  }, [toggleFocusMode]);

  // Shared by every handler below: these actions only exist on a focused workspace route.
  const workspaceActionsEnabled = Boolean(
    isRouteFocused && normalizedServerId && normalizedWorkspaceId,
  );

  useKeyboardActionHandler({
    handlerId: buildWorkspaceKeyboardHandlerId({
      name: "workspace-chat-actions",
      serverId: normalizedServerId,
      workspaceId: normalizedWorkspaceId,
    }),
    actions: [
      "workspace.agent.new",
      "workspace.tab.close-current",
      "workspace.terminal.new",
      "workspace.browser.new",
      "workspace.tab.target.agent",
      "workspace.tab.target.browser",
      "workspace.tab.target.changes",
      "workspace.tab.target.files",
      "workspace.sidePanel.close",
    ] as const,
    enabled: workspaceActionsEnabled,
    priority: 100,
    isActive: () => true,
    handle: handleWorkspaceChatAction,
  });

  useKeyboardActionHandler({
    handlerId: buildWorkspaceKeyboardHandlerId({
      name: "workspace-panel-open-actions",
      serverId: normalizedServerId,
      workspaceId: normalizedWorkspaceId,
    }),
    actions: ["workspace.tab.open"] as const,
    enabled: workspaceActionsEnabled,
    priority: 100,
    isActive: () => true,
    handle: handleWorkspacePanelOpenAction,
  });

  useKeyboardActionHandler({
    handlerId: buildWorkspaceKeyboardHandlerId({
      name: "workspace-current-tab-metadata-actions",
      serverId: normalizedServerId,
      workspaceId: normalizedWorkspaceId,
    }),
    actions: [
      "workspace.tab.rename-current",
      "workspace.tab.reload-current",
      "workspace.tab.copy-resume-command",
      "workspace.tab.copy-id",
      "workspace.tab.copy-file-path",
    ] as const,
    enabled: workspaceActionsEnabled,
    priority: 100,
    isActive: () => true,
    handle: handleWorkspaceCurrentTabMetadataAction,
  });

  useKeyboardActionHandler({
    handlerId: buildWorkspaceKeyboardHandlerId({
      name: "workspace-focus-mode-actions",
      serverId: normalizedServerId,
      workspaceId: normalizedWorkspaceId,
    }),
    actions: ["workspace.focus.toggle"] as const,
    enabled: workspaceActionsEnabled,
    priority: 100,
    isActive: () => true,
    handle: handleWorkspaceFocusModeAction,
  });

  useKeyboardActionHandler({
    handlerId: buildWorkspaceKeyboardHandlerId({
      name: "workspace-sidebar-actions",
      serverId: normalizedServerId,
      workspaceId: normalizedWorkspaceId,
    }),
    actions: ["sidebar.toggle.right", "sidebar.toggle.both"] as const,
    enabled: workspaceActionsEnabled,
    priority: 100,
    isActive: () => true,
    handle: handleWorkspaceSidebarAction,
  });

  // Gated on the same predicate as the header menu item, so the command center never lists a
  // Show setup entry the menu would hide.
  // Gated by isActive so the handler is only dispatched when the workspace has visible setup;
  // the command center contribution is separately gated by canShowSetup in workspace-registration.
  useKeyboardActionHandler({
    handlerId: `workspace-setup-show:${normalizedServerId}:${normalizedWorkspaceId}`,
    actions: ["workspace.setup.show"] as const,
    enabled: workspaceActionsEnabled,
    priority: 100,
    isActive: () => showWorkspaceSetup,
    handle: () => {
      handleOpenSetupTab();
      return true;
    },
  });

  const activeTabDescriptor = useMemo(() => activeTab?.descriptor ?? null, [activeTab]);
  const activeFileFields = getWorkspaceFileLocationFields(activeTabDescriptor);
  const activeFilePath = activeFileFields.path;
  const activeFileLineStart = activeFileFields.lineStart;
  const activeFileLineEnd = activeFileFields.lineEnd;
  const activeFileLocation = useMemo<WorkspaceFileLocation | null>(
    () =>
      buildWorkspaceFileLocation({
        path: activeFilePath,
        lineStart: activeFileLineStart,
        lineEnd: activeFileLineEnd,
      }),
    [activeFileLineEnd, activeFileLineStart, activeFilePath],
  );
  useEffect(() => {
    if (!isRouteFocused || isNative || typeof document === "undefined" || activeTabDescriptor) {
      return;
    }
    document.title = "Workspace";
  }, [activeTabDescriptor, isRouteFocused]);
  const buildPaneContentModel = useCallback(
    (input: { tab: WorkspaceTabDescriptor; paneId?: string | null }) =>
      buildWorkspacePaneContentModel({
        tab: input.tab,
        normalizedServerId,
        normalizedWorkspaceId,
        host: input.paneId === explorerSidebarPaneId ? "explorer" : "main",
        fileNavigationRevision: fileNavigationRevisionByTabId[input.tab.tabId] ?? 0,
        onOpenTab: (target) => {
          if (!persistenceKey) {
            return;
          }
          const tabId = revealWorkspaceChildTab(persistenceKey, target, input.tab.tabId);
          if (tabId && target.kind === "file") {
            requestFileNavigation(tabId);
          }
          if (tabId) {
            navigateToTabId(tabId);
          }
        },
        onCloseCurrentTab: () => {
          void handleCloseTabById(input.tab.tabId);
        },
        onRetargetCurrentTab: (target) => {
          if (!persistenceKey) {
            return;
          }
          replaceWorkspaceTabTarget(persistenceKey, input.tab.tabId, target);
        },
        onSetCurrentTabState: (state) => {
          if (persistenceKey) {
            setWorkspaceTabState(persistenceKey, input.tab.tabId, state);
          }
        },
        onOpenWorkspaceFile: (request: WorkspaceFileOpenRequest) => {
          handleOpenWorkspaceFileFromPane({ request, parentTabId: input.tab.tabId });
        },
        onOpenImportSheet: openImportSheet,
      }),
    [
      explorerSidebarPaneId,
      fileNavigationRevisionByTabId,
      handleCloseTabById,
      handleOpenWorkspaceFileFromPane,
      navigateToTabId,
      normalizedServerId,
      normalizedWorkspaceId,
      openImportSheet,
      persistenceKey,
      replaceWorkspaceTabTarget,
      requestFileNavigation,
      revealWorkspaceChildTab,
      setWorkspaceTabState,
    ],
  );
  const focusedPaneId = useMemo(
    () => focusedPaneTabState.pane?.id ?? null,
    [focusedPaneTabState.pane],
  );
  const focusedPaneTabIds = useMemo(() => tabs.map((tab) => tab.tabId), [tabs]);
  const modifiedFocusedPaneTabIds = useModifiedPanelTabIds({
    serverId: normalizedServerId,
    workspaceId: normalizedWorkspaceId,
    tabIds: focusedPaneTabIds,
  });
  const focusedPaneTabDescriptorMap = useStableTabDescriptorMap(tabs);
  const { mountedTabIds: mountedFocusedPaneTabIdsSet } = useMountedTabSet({
    activeTabId,
    allTabIds: focusedPaneTabIds,
    retainedTabIds: modifiedFocusedPaneTabIds,
    cap: 3,
  });
  const mountedFocusedPaneTabIds = useMemo(
    () => focusedPaneTabIds.filter((tabId) => mountedFocusedPaneTabIdsSet.has(tabId)),
    [focusedPaneTabIds, mountedFocusedPaneTabIdsSet],
  );
  const buildMobilePaneContentModel = useCallback(
    function buildMobilePaneContentModel(input: {
      paneId: string | null;
      tab: WorkspaceTabDescriptor;
    }) {
      return buildPaneContentModel({ tab: input.tab, paneId: input.paneId });
    },
    [buildPaneContentModel],
  );
  const content = renderWorkspaceContent({
    isMissingWorkspaceDirectory,
    activeTabDescriptor,
    hasHydratedAgents,
    hasLoadedTerminals: terminalsQuery.isSuccess,
    mountedFocusedPaneTabIds,
    focusedPaneTabDescriptorMap,
    isRouteFocused,
    focusedPaneId,
    buildMobilePaneContentModel,
  });

  const handleSelectSidePanelView = useCallback(
    (paneId: string, tabId: string) => {
      if (persistenceKey) {
        selectWorkspaceTabInPane(persistenceKey, paneId, tabId);
      }
    },
    [persistenceKey, selectWorkspaceTabInPane],
  );

  const containerStyle = [styles.container, styles.containerWorkspaceBackground];

  const workspaceScreenGate = renderWorkspaceRouteGate({
    state: workspaceRouteState,
    actions: {
      onRetryHost: handleRetryHost,
      onManageHost: handleManageHost,
      onDismissMissingWorkspace: handleDismissMissingWorkspace,
      onRecoverWorkspace: workspaceRecovery.restore,
      onRetryRecoveryInspection: workspaceRecovery.retryInspection,
    },
  });
  const gatedWorkspaceScreen = renderWorkspaceScreenGateShell({
    gate: workspaceScreenGate,
    workspaceKey: persistenceKey,
  });

  const createTerminalDisabled = useMemo(
    () => createTerminalMutation.isPending || pendingTerminalCreateInput !== null,
    [createTerminalMutation.isPending, pendingTerminalCreateInput],
  );
  const showCreateBrowserTab = getIsElectron();

  const headerRight = useMemo(
    () => (
      <WorkspaceHeaderActions
        normalizedServerId={normalizedServerId}
        normalizedWorkspaceId={normalizedWorkspaceId}
        workspaceScripts={workspaceScripts}
        workspaceDirectory={workspaceDirectory}
        activeFileLocation={activeFileLocation}
        liveTerminalIds={liveTerminalIds}
        isMobile={isMobile}
        isTerminalInSidePanel={isTerminalInSidePanel}
        isBrowserInSidePanel={isBrowserInSidePanel}
        showCreateBrowserTab={showCreateBrowserTab}
        createTerminalDisabled={createTerminalDisabled}
        importAgentDisabled={!canOpenImportSheet}
        currentBranchName={currentBranchName}
        showWorkspaceSetup={showWorkspaceSetup}
        isGitCheckout={isGitCheckout}
        explorerToggleOwner={explorerToggleOwner}
        explorerSidebarToggleLabel={explorerSidebarToggleLabel}
        explorerSidebarToggleAccessibilityState={explorerSidebarToggleAccessibilityState}
        onScriptTerminalStarted={handleScriptTerminalStarted}
        onViewScriptTerminal={handleViewScriptTerminal}
        onOpenUrlInBrowserTab={handleOpenUrlInBrowserTab}
        onToggleTerminal={handleToggleTerminal}
        onToggleBrowser={handleToggleBrowser}
        onCreateDraftTab={handleCreateDraftTab}
        onCreateTerminalWithProfile={handleCreateTerminalWithProfile}
        onOpenImportSheet={openImportSheet}
        onCopyWorkspacePath={handleCopyWorkspacePath}
        onCopyBranchName={handleCopyBranchName}
        onOpenSetupTab={handleOpenSetupTab}
        onOpenChanges={handleOpenChangesView}
        onOpenFiles={handleOpenFilesView}
        onToggleExplorerSidebar={handleToggleExplorerSidebar}
      />
    ),
    [
      activeFileLocation,
      canOpenImportSheet,
      createTerminalDisabled,
      currentBranchName,
      explorerSidebarToggleAccessibilityState,
      explorerSidebarToggleLabel,
      explorerToggleOwner,
      handleCopyBranchName,
      handleCopyWorkspacePath,
      handleCreateDraftTab,
      handleCreateTerminalWithProfile,
      handleOpenChangesView,
      handleOpenFilesView,
      handleOpenSetupTab,
      handleOpenUrlInBrowserTab,
      handleScriptTerminalStarted,
      handleToggleBrowser,
      handleToggleExplorerSidebar,
      handleToggleTerminal,
      handleViewScriptTerminal,
      isBrowserInSidePanel,
      openImportSheet,
      isGitCheckout,
      isMobile,
      isTerminalInSidePanel,
      liveTerminalIds,
      normalizedServerId,
      normalizedWorkspaceId,
      showCreateBrowserTab,
      showWorkspaceSetup,
      workspaceDirectory,
      workspaceScripts,
    ],
  );

  const showScreenHeader = useMemo(
    () => shouldShowWorkspaceScreenHeader({ isFocusModeEnabled, isMobile }),
    [isFocusModeEnabled, isMobile],
  );
  const desktopFocusModeEnabled = useMemo(
    () => isFocusModeEnabled && !isMobile,
    [isFocusModeEnabled, isMobile],
  );
  const workspaceFloatingPanelPortalHostName = useMemo(
    () =>
      `${WORKSPACE_FLOATING_PANEL_PORTAL_HOST_PREFIX}:${normalizedServerId}:${normalizedWorkspaceId}`,
    [normalizedServerId, normalizedWorkspaceId],
  );
  const renderWorkspaceScreenHeader = useCallback(
    () =>
      showScreenHeader ? (
        <ScreenHeader
          left={
            <>
              <SidebarMenuToggle />
              <WorkspaceHeaderTitleBar
                isLoading={isWorkspaceHeaderLoading}
                title={workspaceHeaderTitle}
                subtitle={workspaceHeaderSubtitle}
                isSubtitleDistinct={isWorkspaceHeaderSubtitleDistinct}
                normalizedServerId={normalizedServerId}
              />
            </>
          }
          right={headerRight}
        />
      ) : null,
    [
      headerRight,
      isWorkspaceHeaderLoading,
      isWorkspaceHeaderSubtitleDistinct,
      normalizedServerId,
      showScreenHeader,
      workspaceHeaderSubtitle,
      workspaceHeaderTitle,
    ],
  );
  const desktopChatContent = useMemo(() => {
    if (isMobile || !workspaceLayout || !persistenceKey) {
      return null;
    }
    return (
      <WorkspaceChatLayout
        layout={workspaceLayout}
        workspaceKey={persistenceKey}
        normalizedServerId={normalizedServerId}
        normalizedWorkspaceId={normalizedWorkspaceId}
        isWorkspaceFocused={isRouteFocused}
        uiTabs={uiTabs}
        renderHeader={renderWorkspaceScreenHeader}
        focusModeEnabled={desktopFocusModeEnabled}
        buildPaneContentModel={buildPaneContentModel}
        onSelectSidePanelView={handleSelectSidePanelView}
        onCloseSidePanelView={handleCloseTabById}
        onCloseSidePanel={closeSidePanel}
      />
    );
  }, [
    buildPaneContentModel,
    closeSidePanel,
    desktopFocusModeEnabled,
    handleCloseTabById,
    handleSelectSidePanelView,
    isMobile,
    isRouteFocused,
    normalizedServerId,
    normalizedWorkspaceId,
    persistenceKey,
    renderWorkspaceScreenHeader,
    uiTabs,
    workspaceLayout,
  ]);
  const desktopContent = desktopChatContent ?? content;
  const rendersDesktopChatContent = !isMobile && desktopChatContent !== null;

  const workspacePanelContent = (
    <WorkspacePanelContent content={isMobile ? content : desktopContent} />
  );

  const workspaceCenterColumn = (
    <View style={styles.centerColumn}>
      {rendersDesktopChatContent ? null : renderWorkspaceScreenHeader()}

      {isMobile ? (
        <MobileWorkspaceTabSwitcher
          tabs={switcherTabs}
          activeTabKey={activeTabKey}
          activeTab={activeTabDescriptor}
          tabSwitcherOptions={tabSwitcherOptions}
          tabByKey={tabByKey}
          normalizedServerId={normalizedServerId}
          normalizedWorkspaceId={normalizedWorkspaceId}
          onSelectSwitcherTab={handleSelectSwitcherTab}
          onCopyResumeCommand={handleCopyResumeCommand}
          onCopyAgentId={handleCopyAgentId}
          onCopyTerminalId={handleCopyTerminalId}
          onCopyFilePath={handleCopyFilePath}
          onReloadAgent={handleReloadAgent}
          onRenameTab={handleRenameTab}
          onCloseTab={handleCloseTabById}
        />
      ) : null}

      <View style={styles.centerContent}>{workspacePanelContent}</View>
    </View>
  );

  const renderedWorkspaceScreen = (
    <RenderProfile id="WorkspaceScreenContent">
      <View style={containerStyle}>
        <WorkspaceDocumentTitleEffectSlot
          tab={activeTabDescriptor}
          serverId={normalizedServerId}
          workspaceId={normalizedWorkspaceId}
          isRouteFocused={isRouteFocused}
        />
        <View style={styles.threePaneRow}>
          <FloatingPanelPortalHostNameProvider hostName={workspaceFloatingPanelPortalHostName}>
            {workspaceCenterColumn}
          </FloatingPanelPortalHostNameProvider>
          <FloatingPanelPortalHost name={workspaceFloatingPanelPortalHostName} />
        </View>
        <ImportSessionSheet
          visible={isRouteFocused && isImportSheetVisible}
          client={client}
          serverId={normalizedServerId}
          cwd={workspaceDirectory}
          workspaceId={normalizedWorkspaceId}
          onClose={closeImportSheet}
          onImportedAgent={handleImportedAgent}
        />
        <WorkspaceTabRenameModal
          renamingTab={isRouteFocused ? renamingTab : null}
          onSubmit={handleRenameModalSubmit}
          onClose={handleRenameModalClose}
        />
      </View>
    </RenderProfile>
  );

  if (gatedWorkspaceScreen) {
    return gatedWorkspaceScreen;
  }
  return (
    <WorkspaceContentProviders key={persistenceKey} workspaceKey={persistenceKey}>
      {renderedWorkspaceScreen}
    </WorkspaceContentProviders>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surface0,
  },
  containerWorkspaceBackground: {
    backgroundColor: theme.colors.surfaceWorkspace,
  },
  threePaneRow: {
    flex: 1,
    minHeight: 0,
    flexDirection: "row",
    alignItems: "stretch",
  },
  centerColumn: {
    flex: 1,
    minHeight: 0,
  },
  headerTitleContainer: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: {
      xs: theme.spacing[1],
      md: theme.spacing[2],
    },
    overflow: "hidden",
  },
  headerTitleTextGroup: {
    minWidth: 0,
    overflow: "hidden",
    flexShrink: 1,
    flexGrow: {
      xs: 1,
      md: 0,
    },
    flexDirection: {
      xs: "column",
      md: "row",
    },
    alignItems: {
      xs: "flex-start",
      md: "center",
    },
    justifyContent: "flex-start",
    gap: {
      xs: 0,
      md: theme.spacing[2],
    },
  },
  // No width cap. A percentage cap resolves against the title group, whose own width comes from
  // this row's content, so it clips the project name while there is still room beside it.
  // `flexShrink` on both this row and the title already gives up space only when there is none.
  headerProjectRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
    minWidth: 0,
    flexShrink: 1,
  },
  headerProjectTitle: {
    color: theme.colors.foregroundMuted,
    fontSize: {
      xs: theme.fontSize.sm,
      md: theme.fontSize.base,
    },
    flexShrink: 1,
    minWidth: 0,
  },
  headerProjectSeparator: {
    color: theme.colors.foregroundExtraMuted,
    fontSize: theme.fontSize.sm,
    flexShrink: 0,
  },
  headerTitleSkeleton: {
    width: 220,
    maxWidth: "100%",
    height: 22,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface3,
    opacity: 0.25,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: {
      xs: theme.spacing[1],
      md: theme.spacing[2],
    },
  },
  compactHeaderActionButton: {
    marginRight: {
      xs: 0,
      md: -theme.spacing[2],
    },
  },
  compactHeaderMenuCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: {
      xs: 0,
      md: theme.spacing[2],
    },
  },
  newTabActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  newTabActionButton: {
    width: 30,
    height: 30,
    borderRadius: theme.borderRadius.md,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
    alignItems: "center",
    justifyContent: "center",
  },
  newTabActionButtonHovered: {
    backgroundColor: theme.colors.surface2,
  },
  newTabTooltipText: {
    fontSize: theme.fontSize.base,
    color: theme.colors.popoverForeground,
  },
  newTabTooltipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  newTabTooltipShortcut: {},
  mobileTabsRow: {
    backgroundColor: theme.colors.surface0,
    borderBottomWidth: theme.borderWidth[1],
    borderBottomColor: theme.colors.border,
  },
  switcherTrigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[2] + theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  switcherTriggerPressed: {
    backgroundColor: theme.colors.surface1,
  },
  switcherTriggerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    flex: 1,
    minWidth: 0,
  },
  switcherTriggerIcon: {
    flexShrink: 0,
  },
  switcherTriggerText: {
    minWidth: 0,
    flex: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
  },
  headerMenuProfileIconWrapper: {
    width: 16,
    height: 16,
  },
  tabsContainer: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
    flexDirection: "row",
    alignItems: "center",
  },
  tabsScroll: {
    flex: 1,
    minWidth: 0,
  },
  tabsContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
  },
  tabsActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingRight: theme.spacing[2],
    paddingVertical: theme.spacing[1],
  },
  centerContent: {
    flex: 1,
    minHeight: 0,
  },
  tab: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    maxWidth: 260,
  },
  tabHandle: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    flex: 1,
    minWidth: 0,
  },
  tabIcon: {
    flexShrink: 0,
  },
  tabActive: {
    backgroundColor: theme.colors.surface2,
  },
  tabHovered: {
    backgroundColor: theme.colors.surface2,
  },
  tabLabel: {
    flexShrink: 1,
    minWidth: 0,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.normal,
  },
  tabLabelWithCloseButton: {
    paddingRight: 0,
  },
  tabLabelActive: {
    color: theme.colors.foreground,
  },
  tabCloseButton: {
    width: 18,
    height: 18,
    marginLeft: 0,
    borderRadius: theme.borderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  tabCloseButtonShown: {
    opacity: 1,
  },
  tabCloseButtonHidden: {
    opacity: 0,
  },
  tabCloseButtonActive: {
    backgroundColor: theme.colors.surface3,
  },
  content: {
    flex: 1,
    minHeight: 0,
    backgroundColor: theme.colors.surface0,
    position: "relative",
  },
  mobileMountedTabSlot: {
    ...StyleSheet.absoluteFillObject,
  },
  contentPlaceholder: {
    flex: 1,
    minHeight: 0,
    backgroundColor: theme.colors.surface0,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[6],
  },
  emptyStateText: {
    color: theme.colors.foregroundMuted,
    textAlign: "center",
  },
}));
