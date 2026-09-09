import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
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
import { getSidePanelRailScrollOffset } from "./workspace-side-panel-rail-layout";

const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

const ThemedX = withUnistyles(X);
const ThemedPanelRightClose = withUnistyles(PanelRightClose);
const STATUS_DATASETS = {
  none: { "status-bucket": "none" },
  needs_input: { "status-bucket": "needs_input" },
  failed: { "status-bucket": "failed" },
  running: { "status-bucket": "running" },
  attention: { "status-bucket": "attention" },
  done: { "status-bucket": "done" },
} as const;

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
  onLayout,
}: {
  item: WorkspaceSidePanelRailItem;
  showClose: boolean;
  normalizedServerId: string;
  normalizedWorkspaceId: string;
  onSelect: (tabId: string) => void;
  onClose: (tabId: string) => Promise<void> | void;
  onLayout: (tabId: string, event: LayoutChangeEvent) => void;
}) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);
  const handlePress = useCallback(() => onSelect(item.tab.tabId), [item.tab.tabId, onSelect]);
  const handleHoverIn = useCallback(() => setHovered(true), []);
  const handleHoverOut = useCallback(() => setHovered(false), []);
  const handleClose = useCallback(() => {
    void onClose(item.tab.tabId);
  }, [item.tab.tabId, onClose]);
  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => onLayout(item.tab.tabId, event),
    [item.tab.tabId, onLayout],
  );
  const accessibilityState = useMemo(() => ({ selected: item.isActive }), [item.isActive]);
  // A reusable preview keeps its slot id as its target changes. Public file selectors
  // describe the current target, while React and the callbacks keep the stable slot.
  const testIdSuffix =
    item.tab.target.kind === "file" ? `file_${item.tab.target.path}` : item.tab.tabId;
  const renderPresentation = useCallback(
    (presentation: WorkspaceTabPresentation) => (
      <View style={styles.entrySlot} onLayout={handleLayout}>
        <Tooltip delayDuration={300} enabledOnDesktop enabledOnMobile={false}>
          <TooltipTrigger asChild triggerRefProp="triggerRef">
            <Pressable
              testID={`workspace-side-panel-view-${testIdSuffix}`}
              dataSet={STATUS_DATASETS[presentation.statusBucket ?? "none"]}
              accessibilityRole="tab"
              accessibilityLabel={presentation.tooltip}
              accessibilityState={accessibilityState}
              aria-selected={item.isActive}
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
                  testID={`workspace-side-panel-modified-${testIdSuffix}`}
                />
              ) : null}
            </Pressable>
          </TooltipTrigger>
          <TooltipContent
            side="bottom"
            align="center"
            offset={8}
            testID={`workspace-side-panel-tooltip-${testIdSuffix}`}
          >
            <Text style={styles.tooltipText}>{presentation.tooltip}</Text>
          </TooltipContent>
        </Tooltip>
        {showClose ? (
          <Pressable
            testID={`workspace-side-panel-close-view-${testIdSuffix}`}
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
      handleLayout,
      handlePress,
      hovered,
      item.isActive,
      showClose,
      t,
      testIdSuffix,
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
  const activeTabId = items.find((item) => item.isActive)?.tab.tabId;
  const scrollRef = useRef<ScrollView>(null);
  const entryLayouts = useRef(new Map<string, { left: number; width: number }>());
  const viewportWidth = useRef(0);
  const scrollOffset = useRef(0);
  const revealActiveEntry = useCallback(() => {
    const entry = activeTabId ? entryLayouts.current.get(activeTabId) : undefined;
    if (!entry) return;
    const nextOffset = getSidePanelRailScrollOffset({
      currentOffset: scrollOffset.current,
      viewportWidth: viewportWidth.current,
      itemLeft: entry.left,
      itemWidth: entry.width,
    });
    if (Math.abs(nextOffset - scrollOffset.current) < 1) return;
    scrollOffset.current = nextOffset;
    scrollRef.current?.scrollTo({ x: nextOffset, animated: false });
  }, [activeTabId]);
  useEffect(revealActiveEntry, [revealActiveEntry]);
  useEffect(() => {
    const tabIds = new Set(items.map((item) => item.tab.tabId));
    for (const tabId of entryLayouts.current.keys()) {
      if (!tabIds.has(tabId)) entryLayouts.current.delete(tabId);
    }
  }, [items]);
  const handleViewportLayout = useCallback(
    (event: LayoutChangeEvent) => {
      viewportWidth.current = event.nativeEvent.layout.width;
      revealActiveEntry();
    },
    [revealActiveEntry],
  );
  const handleEntryLayout = useCallback(
    (tabId: string, event: LayoutChangeEvent) => {
      const { x, width } = event.nativeEvent.layout;
      entryLayouts.current.set(tabId, { left: x, width });
      revealActiveEntry();
    },
    [revealActiveEntry],
  );
  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollOffset.current = Math.max(0, event.nativeEvent.contentOffset.x);
  }, []);

  return (
    <View
      style={[styles.track, titlebarDragSurfaceStyle as never]}
      accessibilityRole="tablist"
      testID="workspace-side-panel-rail"
    >
      <ScrollView
        ref={scrollRef}
        horizontal
        tabIndex={0}
        showsHorizontalScrollIndicator={false}
        bounces={false}
        keyboardShouldPersistTaps="handled"
        style={styles.entriesViewport}
        contentContainerStyle={styles.entries}
        onLayout={handleViewportLayout}
        onContentSizeChange={revealActiveEntry}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        testID="workspace-side-panel-rail-scroll"
      >
        {items.map((item) => (
          <WorkspaceSidePanelRailEntry
            key={item.tab.tabId}
            item={item}
            showClose={showClose}
            normalizedServerId={normalizedServerId}
            normalizedWorkspaceId={normalizedWorkspaceId}
            onSelect={onSelect}
            onClose={onClose}
            onLayout={handleEntryLayout}
          />
        ))}
      </ScrollView>
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
  entriesViewport: {
    flex: 1,
    minWidth: 0,
    alignSelf: "stretch",
  },
  entries: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  entrySlot: {
    minWidth: 0,
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
  },
  entry: {
    height: HEADER_CONTROL_HEIGHT,
    flexShrink: 0,
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
    flexShrink: 0,
    width: 6,
    height: 6,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.foregroundMuted,
  },
  entryCloseButton: {
    flexShrink: 0,
    width: 18,
    height: 18,
    marginLeft: -2,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.sm,
  },
  panelCloseButton: {
    flexShrink: 0,
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
    fontFamily: theme.fontFamily.ui,
  },
}));
