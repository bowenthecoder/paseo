import { ArrowUp, Folder, HardDrive, House } from "lucide-react-native";
import { useCallback } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import {
  PaneContentToolbar,
  ToolbarButton,
  ToolbarControls,
  paneContentToolbarIconSize,
} from "@/components/ui/pane-content-toolbar";
import { useIsCompactFormFactor } from "@/constants/layout";
import type { Theme } from "@/styles/theme";
import {
  explorerFilesystemRoot,
  explorerParentDirectory,
  normalizeExplorerBrowsePath,
} from "./navigation";

const UpIcon = withUnistyles(ArrowUp);
const HomeIcon = withUnistyles(House);
const RootIcon = withUnistyles(HardDrive);
const FolderIcon = withUnistyles(Folder);
const iconColor = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

export function FileExplorerNavigationBar({
  browsingRoot,
  workspaceRoot,
  onNavigate,
}: {
  browsingRoot: string;
  workspaceRoot: string;
  onNavigate(path: string): void;
}) {
  const { t } = useTranslation();
  const compact = useIsCompactFormFactor();
  const parent = explorerParentDirectory(browsingRoot);
  const root = explorerFilesystemRoot(workspaceRoot);
  const size = paneContentToolbarIconSize(compact);
  const openParent = useCallback(() => {
    if (parent) onNavigate(parent);
  }, [onNavigate, parent]);
  const openHome = useCallback(() => onNavigate("~"), [onNavigate]);
  const openRoot = useCallback(() => {
    if (root) onNavigate(root);
  }, [onNavigate, root]);
  const openWorkingFolder = useCallback(
    () => onNavigate(workspaceRoot),
    [onNavigate, workspaceRoot],
  );

  return (
    <PaneContentToolbar testID="files-navigation-bar">
      <View style={styles.row}>
        <ToolbarButton
          label={t("workspace.fileExplorer.actions.parentFolder")}
          compact={compact}
          disabled={!parent}
          onPress={openParent}
          testID="files-browse-parent"
        >
          <UpIcon size={size} uniProps={iconColor} />
        </ToolbarButton>
        <Text
          numberOfLines={1}
          ellipsizeMode="middle"
          accessibilityLabel={browsingRoot}
          style={styles.path}
          testID="files-browse-path"
        >
          {browsingRoot}
        </Text>
        <ToolbarControls>
          <ToolbarButton
            label={t("workspace.fileExplorer.actions.homeFolder")}
            compact={compact}
            onPress={openHome}
            testID="files-browse-home"
          >
            <HomeIcon size={size} uniProps={iconColor} />
          </ToolbarButton>
          <ToolbarButton
            label={t("workspace.fileExplorer.actions.deviceRoot")}
            compact={compact}
            disabled={!root || browsingRoot === root}
            onPress={openRoot}
            testID="files-browse-root"
          >
            <RootIcon size={size} uniProps={iconColor} />
          </ToolbarButton>
          <ToolbarButton
            label={t("workspace.fileExplorer.actions.workingFolder")}
            compact={compact}
            disabled={browsingRoot === normalizeExplorerBrowsePath(workspaceRoot)}
            onPress={openWorkingFolder}
            testID="files-browse-workspace"
          >
            <FolderIcon size={size} uniProps={iconColor} />
          </ToolbarButton>
        </ToolbarControls>
      </View>
    </PaneContentToolbar>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    height: "100%",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing[2],
    gap: theme.spacing[1],
  },
  path: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
}));
