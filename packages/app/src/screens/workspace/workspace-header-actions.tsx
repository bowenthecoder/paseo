import { useMemo } from "react";
import { View } from "react-native";
import { Globe, SquareTerminal } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import type { TerminalProfile } from "@getpaseo/protocol/messages";
import { WorkspaceActions } from "@/git/workspace-actions";
import { WorkspaceOpenInEditorButton } from "@/workspace/open-in-editor/button";
import { WorkspaceScriptsButton } from "@/screens/workspace/workspace-scripts-button";
import {
  WorkspaceExplorerToggle,
  WorkspaceHeaderExplorerToggle,
  type WorkspaceExplorerToggleOwner,
} from "@/screens/workspace/workspace-explorer-toggle";
import {
  WorkspaceHeaderMenuDesktop,
  WorkspaceHeaderMenuMobile,
} from "@/screens/workspace/workspace-header-menu";
import type { WorkspaceDescriptor } from "@/stores/session-store";
import type { WorkspaceFileLocation } from "@/workspace/file-open";
import { HeaderToggleButton } from "@/components/headers/header-toggle-button";
import {
  extraMutedIconColorMapping,
  iconButtonChromeGlyphSize,
} from "@/components/ui/icon-button-chrome";
import type { ShortcutKey } from "@/utils/format-shortcut";

const ThemedSquareTerminal = withUnistyles(SquareTerminal);
const ThemedGlobe = withUnistyles(Globe);

const TERMINAL_TOGGLE_KEYS: ShortcutKey[] = ["mod", "`"];
const NO_SHORTCUT_KEYS: ShortcutKey[] = [];

interface WorkspaceHeaderToggleProps {
  isActive: boolean;
  disabled?: boolean;
  onPress: () => void;
}

/**
 * Terminal and browser both live in the one side panel, so these are toggles rather than
 * openers: pressing the lit one puts the panel away again.
 */
export function WorkspaceHeaderTerminalToggle({
  isActive,
  disabled,
  onPress,
}: WorkspaceHeaderToggleProps) {
  const { t } = useTranslation();
  const accessibilityState = useMemo(
    () => ({ expanded: isActive, disabled: disabled === true }),
    [disabled, isActive],
  );
  return (
    <HeaderToggleButton
      testID="workspace-header-terminal-toggle"
      onPress={onPress}
      disabled={disabled}
      tooltipLabel={t("workspace.header.actions.toggleTerminal")}
      tooltipKeys={TERMINAL_TOGGLE_KEYS}
      tooltipSide="bottom"
      accessible
      accessibilityRole="button"
      accessibilityLabel={t("workspace.header.actions.toggleTerminal")}
      accessibilityState={accessibilityState}
    >
      <ThemedSquareTerminal
        size={iconButtonChromeGlyphSize("large")}
        strokeWidth={1.5}
        uniProps={extraMutedIconColorMapping}
      />
    </HeaderToggleButton>
  );
}

export function WorkspaceHeaderBrowserToggle({
  isActive,
  disabled,
  onPress,
}: WorkspaceHeaderToggleProps) {
  const { t } = useTranslation();
  const accessibilityState = useMemo(
    () => ({ expanded: isActive, disabled: disabled === true }),
    [disabled, isActive],
  );
  return (
    <HeaderToggleButton
      testID="workspace-header-browser-toggle"
      onPress={onPress}
      disabled={disabled}
      tooltipLabel={t("workspace.header.actions.toggleBrowser")}
      tooltipKeys={NO_SHORTCUT_KEYS}
      tooltipSide="bottom"
      accessible
      accessibilityRole="button"
      accessibilityLabel={t("workspace.header.actions.toggleBrowser")}
      accessibilityState={accessibilityState}
    >
      <ThemedGlobe
        size={iconButtonChromeGlyphSize("large")}
        strokeWidth={1.5}
        uniProps={extraMutedIconColorMapping}
      />
    </HeaderToggleButton>
  );
}

export interface WorkspaceHeaderActionsProps {
  normalizedServerId: string;
  normalizedWorkspaceId: string;
  workspaceScripts: WorkspaceDescriptor["scripts"];
  workspaceDirectory: string | null;
  activeFileLocation: WorkspaceFileLocation | null;
  liveTerminalIds: string[];
  isMobile: boolean;
  isTerminalInSidePanel: boolean;
  isBrowserInSidePanel: boolean;
  showCreateBrowserTab: boolean;
  createTerminalDisabled: boolean;
  importAgentDisabled: boolean;
  currentBranchName: string | null;
  showWorkspaceSetup: boolean;
  isGitCheckout: boolean;
  explorerToggleOwner: WorkspaceExplorerToggleOwner;
  explorerSidebarToggleLabel: string;
  explorerSidebarToggleAccessibilityState: { expanded: boolean };
  onScriptTerminalStarted: (terminalId: string) => void;
  onViewScriptTerminal: (terminalId: string) => void;
  onOpenUrlInBrowserTab: (url: string) => void;
  onToggleTerminal: () => void;
  onToggleBrowser: () => void;
  onCreateDraftTab: () => void;
  onCreateTerminalWithProfile: (profile: TerminalProfile) => void;
  onOpenImportSheet: () => void;
  onCopyWorkspacePath: () => void;
  onCopyBranchName: () => void;
  onOpenSetupTab: () => void;
  onOpenChanges: () => void;
  onOpenFiles: () => void;
  onToggleExplorerSidebar: () => void;
}

/**
 * The header's right cluster: terminal, browser, the workspace menu, and the side panel
 * toggle. Git and editor affordances sit ahead of them on wide layouts.
 */
export function WorkspaceHeaderActions({
  normalizedServerId,
  normalizedWorkspaceId,
  workspaceScripts,
  workspaceDirectory,
  activeFileLocation,
  liveTerminalIds,
  isMobile,
  isTerminalInSidePanel,
  isBrowserInSidePanel,
  showCreateBrowserTab,
  createTerminalDisabled,
  importAgentDisabled,
  currentBranchName,
  showWorkspaceSetup,
  isGitCheckout,
  explorerToggleOwner,
  explorerSidebarToggleLabel,
  explorerSidebarToggleAccessibilityState,
  onScriptTerminalStarted,
  onViewScriptTerminal,
  onOpenUrlInBrowserTab,
  onToggleTerminal,
  onToggleBrowser,
  onCreateDraftTab,
  onCreateTerminalWithProfile,
  onOpenImportSheet,
  onCopyWorkspacePath,
  onCopyBranchName,
  onOpenSetupTab,
  onOpenChanges,
  onOpenFiles,
  onToggleExplorerSidebar,
}: WorkspaceHeaderActionsProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.headerRight}>
      {!isMobile && workspaceScripts.length > 0 ? (
        <WorkspaceScriptsButton
          serverId={normalizedServerId}
          workspaceId={normalizedWorkspaceId}
          scripts={workspaceScripts}
          liveTerminalIds={liveTerminalIds}
          onScriptTerminalStarted={onScriptTerminalStarted}
          onViewTerminal={onViewScriptTerminal}
          onOpenUrlInBrowserTab={onOpenUrlInBrowserTab}
          hideLabels
        />
      ) : null}
      {!isMobile && workspaceDirectory ? (
        <>
          <WorkspaceOpenInEditorButton
            serverId={normalizedServerId}
            cwd={workspaceDirectory}
            activeFile={activeFileLocation}
            hideLabels
          />
          <WorkspaceActions serverId={normalizedServerId} cwd={workspaceDirectory} />
        </>
      ) : null}
      <WorkspaceHeaderTerminalToggle
        isActive={isTerminalInSidePanel}
        disabled={createTerminalDisabled}
        onPress={onToggleTerminal}
      />
      {showCreateBrowserTab ? (
        <WorkspaceHeaderBrowserToggle isActive={isBrowserInSidePanel} onPress={onToggleBrowser} />
      ) : null}
      {isMobile ? (
        <WorkspaceHeaderMenuMobile
          normalizedServerId={normalizedServerId}
          currentBranchName={currentBranchName}
          showWorkspaceSetup={showWorkspaceSetup}
          showCreateBrowserTab={showCreateBrowserTab}
          createTerminalDisabled={createTerminalDisabled}
          importAgentDisabled={importAgentDisabled}
          copyPathDisabled={!workspaceDirectory}
          onCreateDraftTab={onCreateDraftTab}
          onCreateTerminal={onToggleTerminal}
          onCreateTerminalWithProfile={onCreateTerminalWithProfile}
          onCreateBrowser={onToggleBrowser}
          onOpenImportSheet={onOpenImportSheet}
          onCopyWorkspacePath={onCopyWorkspacePath}
          onCopyBranchName={onCopyBranchName}
          onOpenSetupTab={onOpenSetupTab}
        />
      ) : (
        <WorkspaceHeaderMenuDesktop
          normalizedServerId={normalizedServerId}
          currentBranchName={currentBranchName}
          showWorkspaceSetup={showWorkspaceSetup}
          createTerminalDisabled={createTerminalDisabled}
          importAgentDisabled={importAgentDisabled}
          copyPathDisabled={!workspaceDirectory}
          showChanges={isGitCheckout}
          onCreateDraftTab={onCreateDraftTab}
          onCreateTerminalWithProfile={onCreateTerminalWithProfile}
          onOpenImportSheet={onOpenImportSheet}
          onCopyWorkspacePath={onCopyWorkspacePath}
          onCopyBranchName={onCopyBranchName}
          onOpenSetupTab={onOpenSetupTab}
          onOpenChanges={onOpenChanges}
          onOpenFiles={onOpenFiles}
        />
      )}
      {isMobile ? (
        <WorkspaceExplorerToggle
          onPress={onToggleExplorerSidebar}
          label={explorerSidebarToggleLabel}
          tooltipLabel={t("workspace.tabs.explorerSidebar.toggle")}
          tooltipKeys={EXPLORER_TOGGLE_KEYS}
          accessibilityState={explorerSidebarToggleAccessibilityState}
          mobile
        />
      ) : (
        <WorkspaceHeaderExplorerToggle
          owner={explorerToggleOwner}
          onPress={onToggleExplorerSidebar}
          label={explorerSidebarToggleLabel}
          tooltipLabel={t("workspace.tabs.explorerSidebar.toggle")}
          tooltipKeys={EXPLORER_TOGGLE_KEYS}
          accessibilityState={explorerSidebarToggleAccessibilityState}
        />
      )}
    </View>
  );
}

const EXPLORER_TOGGLE_KEYS: ShortcutKey[] = ["mod", "E"];

const styles = StyleSheet.create((theme) => ({
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
}));
