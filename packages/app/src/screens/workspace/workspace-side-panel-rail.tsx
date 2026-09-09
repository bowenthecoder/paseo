import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { PanelRightClose, X } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { titlebarDragSurfaceStyle } from "@/components/desktop/titlebar-drag-region";
import { WORKSPACE_SECONDARY_HEADER_HEIGHT } from "@/constants/layout";
import { iconButtonChromeGlyphSize } from "@/components/ui/icon-button-chrome";
import { HEADER_CONTROL_HEIGHT } from "@/components/ui/control-geometry";
import {
  WorkspaceTabIcon,
  WorkspaceTabPresentationResolver,
  type WorkspaceTabPresentation,
} from "@/screens/workspace/workspace-tab-presentation";
import type { WorkspaceTabDescriptor } from "@/screens/workspace/workspace-tabs-types";
import type { Theme } from "@/styles/theme";

const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

const ThemedX = withUnistyles(X);
const ThemedPanelRightClose = withUnistyles(PanelRightClose);

export interface WorkspaceSidePanelRailItem {
  tab: WorkspaceTabDescriptor;
  isActive: boolean;
}

interface WorkspaceSidePanelRailProps {
  items: WorkspaceSidePanelRailItem[];
  normalizedServerId: string;
  normalizedWorkspaceId: string;
  onSelect: (tabId: string) => void;
  onClose: (tabId: string) => Promise<void> | void;
  onClosePanel: () => void;
  headerAction?: ReactNode;
}

/**
 * The side panel holds one terminal, browser or tree at a time. When more than one is live
 * this row is how you get between them and how you close the one you are done with — it is a
 * switcher, not a tab strip: nothing is created here and nothing is dragged out of it.
 */
function WorkspaceSidePanelRailEntry({
  item,
  showClose,
  normalizedServerId,
  normalizedWorkspaceId,
  onSelect,
  onClose,
}: {
  item: WorkspaceSidePanelRailItem;
  showClose: boolean;
  normalizedServerId: string;
  normalizedWorkspaceId: string;
  onSelect: (tabId: string) => void;
  onClose: (tabId: string) => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);
  const handlePress = useCallback(() => onSelect(item.tab.tabId), [item.tab.tabId, onSelect]);
  const handleHoverIn = useCallback(() => setHovered(true), []);
  const handleHoverOut = useCallback(() => setHovered(false), []);
  const handleClose = useCallback(() => {
    void onClose(item.tab.tabId);
  }, [item.tab.tabId, onClose]);
  const accessibilityState = useMemo(() => ({ selected: item.isActive }), [item.isActive]);
  const renderPresentation = useCallback(
    (presentation: WorkspaceTabPresentation) => (
      <View style={styles.entrySlot}>
        <Tooltip delayDuration={300} enabledOnDesktop enabledOnMobile={false}>
          <TooltipTrigger asChild triggerRefProp="triggerRef">
            <Pressable
              testID={`workspace-side-panel-view-${item.tab.tabId}`}
              accessibilityRole="tab"
              accessibilityLabel={presentation.tooltip}
              accessibilityState={accessibilityState}
              onPress={handlePress}
              onHoverIn={handleHoverIn}
              onHoverOut={handleHoverOut}
              style={[
                styles.entry,
                hovered ? styles.entryHovered : null,
                item.isActive ? styles.entryActive : null,
              ]}
            >
              <WorkspaceTabIcon
                presentation={presentation}
                active={item.isActive}
                size={iconButtonChromeGlyphSize("small")}
                strokeWidth={1.5}
                backdrop="surfaceSidebar"
              />
              <Text
                selectable={false}
                numberOfLines={1}
                ellipsizeMode="tail"
                style={[styles.entryLabel, item.isActive ? styles.entryLabelActive : null]}
              >
                {presentation.label}
              </Text>
              {/* A laid-out sibling of the label, not an overlay, so a truncated label ends
                  before the dot rather than running underneath it. */}
              {presentation.modified ? (
                <View
                  style={styles.entryModifiedDot}
                  accessibilityLabel={t("workspace.tabs.modified")}
                  testID={`workspace-side-panel-modified-${item.tab.tabId}`}
                />
              ) : null}
            </Pressable>
          </TooltipTrigger>
          <TooltipContent
            side="bottom"
            align="center"
            offset={8}
            testID={`workspace-side-panel-tooltip-${item.tab.tabId}`}
          >
            <Text style={styles.tooltipText}>{presentation.tooltip}</Text>
          </TooltipContent>
        </Tooltip>
        {showClose ? (
          <Pressable
            testID={`workspace-side-panel-close-view-${item.tab.tabId}`}
            accessibilityRole="button"
            accessibilityLabel={presentation.tooltip}
            onPress={handleClose}
            style={styles.entryCloseButton}
          >
            <ThemedX size={12} uniProps={mutedColorMapping} />
          </Pressable>
        ) : null}
      </View>
    ),
    [
      accessibilityState,
      handleClose,
      handleHoverIn,
      handleHoverOut,
      handlePress,
      hovered,
      item.isActive,
      item.tab.tabId,
      showClose,
      t,
    ],
  );

  return (
    <WorkspaceTabPresentationResolver
      tab={item.tab}
      serverId={normalizedServerId}
      workspaceId={normalizedWorkspaceId}
    >
      {renderPresentation}
    </WorkspaceTabPresentationResolver>
  );
}

export function WorkspaceSidePanelRail({
  items,
  normalizedServerId,
  normalizedWorkspaceId,
  onSelect,
  onClose,
  onClosePanel,
  headerAction,
}: WorkspaceSidePanelRailProps) {
  const { t } = useTranslation();
  const showClose = items.length > 1;

  return (
    <View
      style={[styles.track, titlebarDragSurfaceStyle as never]}
      accessibilityRole="tablist"
      testID="workspace-side-panel-rail"
    >
      <View style={styles.entries}>
        {items.map((item) => (
          <WorkspaceSidePanelRailEntry
            key={item.tab.tabId}
            item={item}
            showClose={showClose}
            normalizedServerId={normalizedServerId}
            normalizedWorkspaceId={normalizedWorkspaceId}
            onSelect={onSelect}
            onClose={onClose}
          />
        ))}
      </View>
      {headerAction ? <View style={styles.trailingAccessory}>{headerAction}</View> : null}
      <Pressable
        testID="workspace-side-panel-close"
        accessibilityRole="button"
        accessibilityLabel={t("workspace.sidePanel.close")}
        onPress={onClosePanel}
        style={styles.panelCloseButton}
      >
        <ThemedPanelRightClose size={14} uniProps={mutedColorMapping} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  track: {
    minWidth: 0,
    height: WORKSPACE_SECONDARY_HEADER_HEIGHT,
    backgroundColor: theme.colors.surfaceSidebar,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
    gap: theme.spacing[1],
  },
  entries: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  entrySlot: {
    minWidth: 0,
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  entry: {
    height: HEADER_CONTROL_HEIGHT,
    maxWidth: 180,
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    userSelect: "none",
  },
  entryHovered: {
    backgroundColor: theme.colors.interactionHighlight,
  },
  entryActive: {
    backgroundColor: theme.colors.interactionHighlight,
  },
  entryLabel: {
    minWidth: 0,
    flexShrink: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.normal,
    userSelect: "none",
  },
  entryLabelActive: {
    color: theme.colors.foreground,
  },
  entryModifiedDot: {
    width: 6,
    height: 6,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.foregroundMuted,
  },
  entryCloseButton: {
    width: 18,
    height: 18,
    marginLeft: -2,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.sm,
  },
  panelCloseButton: {
    width: HEADER_CONTROL_HEIGHT,
    height: HEADER_CONTROL_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
  },
  trailingAccessory: {
    flexShrink: 0,
  },
  tooltipText: {
    color: theme.colors.popoverForeground,
    fontSize: theme.fontSize.base,
  },
}));
