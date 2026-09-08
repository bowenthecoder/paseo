import {
  useCallback,
  useMemo,
  type ComponentProps,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { type PressableStateCallbackType } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import {
  Archive,
  CircleCheck,
  Copy,
  MoreVertical,
  Pencil,
  Pin,
  PinOff,
  Tag,
} from "lucide-react-native";
import { useSidebarWorkspacePinController } from "@/hooks/use-sidebar-workspace-pin";
import { isWeb } from "@/constants/platform";
import { getForgePresentation, normalizeForge } from "@/git/forge";
import type { SidebarWorkspaceEntry } from "@/hooks/use-sidebar-workspaces-list";
import { useAppSettings } from "@/hooks/use-settings";
import type { Theme } from "@/styles/theme";
import type { ShortcutKey } from "@/utils/format-shortcut";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useSidebarUnreadStore } from "@/stores/sidebar-unread-store";
import { WorkspaceChatActions } from "./workspace-chat-actions";
import { MoveChatToGroupTrigger, moveChatToGroupPage } from "./chat-group-menu";
import { WorkspaceOpenMenuTrigger, workspaceOpenMenuPage } from "./workspace-open-menu";
import { OpenInFileManagerMenuItem } from "@/workspace/open-in-file-manager/menu-item";
import { resolveSidebarWorkspaceAccessibilityLabel } from "@/components/sidebar/sidebar-workspace-title";
import {
  workspaceServiceLabelKey,
  type WorkspaceServiceSummary,
} from "@/components/sidebar/workspace-meta-row";
import {
  useWorkspaceLabelMenuPages,
  WORKSPACE_LABEL_PAGE_ID,
  type WorkspaceLabelTarget,
} from "@/workspace-labels/picker";

const foregroundColorMapping = (theme: Theme) => ({
  color: theme.colors.foreground,
});
const foregroundMutedColorMapping = (theme: Theme) => ({
  color: theme.colors.foregroundMuted,
});

const ThemedMoreVertical = withUnistyles(MoreVertical);
const ThemedCopy = withUnistyles(Copy);
const ThemedArchive = withUnistyles(Archive);
const ThemedPencil = withUnistyles(Pencil);
const ThemedCircleCheck = withUnistyles(CircleCheck);
const ThemedPin = withUnistyles(Pin);
const ThemedPinOff = withUnistyles(PinOff);
const ThemedTag = withUnistyles(Tag);

const copyLeadingIcon = <ThemedCopy size={14} uniProps={foregroundMutedColorMapping} />;
const renameLeadingIcon = <ThemedPencil size={14} uniProps={foregroundMutedColorMapping} />;
const markAsReadLeadingIcon = (
  <ThemedCircleCheck size={14} uniProps={foregroundMutedColorMapping} />
);
const archiveLeadingIcon = <ThemedArchive size={14} uniProps={foregroundMutedColorMapping} />;
const pinLeadingIcon = <ThemedPin size={14} uniProps={foregroundMutedColorMapping} />;
const unpinLeadingIcon = <ThemedPinOff size={14} uniProps={foregroundMutedColorMapping} />;
const labelLeadingIcon = <ThemedTag size={14} uniProps={foregroundMutedColorMapping} />;

function renderTriggerIcon({ hovered }: { hovered?: boolean }) {
  return (
    <ThemedMoreVertical
      size={14}
      uniProps={hovered ? foregroundColorMapping : foregroundMutedColorMapping}
    />
  );
}

export interface SidebarWorkspaceMenuProps {
  workspaceKey: string;
  serverId?: string;
  workspaceId?: string;
  /** A manual chat row always passes its own agent, independent of the focused workspace tab. */
  agentId?: string;
  workspaceLabels?: readonly string[];
  onCopyPath?: () => void;
  onCopyBranchName?: () => void;
  onRename?: () => void;
  onMarkAsRead?: () => void;
  onArchive: () => void;
  archiveLabel?: string;
  archiveStatus?: "idle" | "pending" | "success";
  archivePendingLabel?: string;
  archiveShortcutKeys?: ShortcutKey[][] | null;
  isPinned?: boolean;
  onTogglePin?: () => void;
  openInFileManagerPath?: string | null;
  /**
   * Lifted so the row that reveals the kebab can keep it mounted while its menu is up. See
   * `useOpenKebabMenuVisibility`.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

interface SidebarWorkspaceMenuItemsProps extends Omit<
  SidebarWorkspaceMenuProps,
  "onArchive" | "open" | "onOpenChange"
> {
  onArchive?: () => void;
}

type MenuSurface = "context" | "dropdown";

function WorkspaceMenuItem({
  surface,
  children,
  ...props
}: PropsWithChildren<
  Omit<ComponentProps<typeof DropdownMenuItem>, "children"> & {
    surface: MenuSurface;
  }
>) {
  if (surface === "context") {
    return <ContextMenuItem {...props}>{children}</ContextMenuItem>;
  }
  return <DropdownMenuItem {...props}>{children}</DropdownMenuItem>;
}

function WorkspaceCopyMenuItems({
  surface,
  workspaceKey,
  onCopyPath,
  onCopyBranchName,
}: Pick<SidebarWorkspaceMenuItemsProps, "workspaceKey" | "onCopyPath" | "onCopyBranchName"> & {
  surface: MenuSurface;
}) {
  const { t } = useTranslation();
  return (
    <>
      {onCopyPath ? (
        <WorkspaceMenuItem
          surface={surface}
          testID={`sidebar-workspace-menu-copy-path-${workspaceKey}`}
          leading={copyLeadingIcon}
          onSelect={onCopyPath}
        >
          {t("sidebar.workspace.actions.copyPath")}
        </WorkspaceMenuItem>
      ) : null}
      {onCopyBranchName ? (
        <WorkspaceMenuItem
          surface={surface}
          testID={`sidebar-workspace-menu-copy-branch-name-${workspaceKey}`}
          leading={copyLeadingIcon}
          onSelect={onCopyBranchName}
        >
          {t("sidebar.workspace.actions.copyBranchName")}
        </WorkspaceMenuItem>
      ) : null}
    </>
  );
}

function WorkspaceLabelsMenuItem({
  workspaceKey,
  serverId,
  workspaceId,
  agentId,
}: Pick<SidebarWorkspaceMenuItemsProps, "workspaceKey" | "serverId" | "workspaceId" | "agentId">) {
  const { t } = useTranslation();
  if (!serverId || !workspaceId || agentId) return null;
  return (
    <DropdownMenuSubTrigger
      id={WORKSPACE_LABEL_PAGE_ID}
      leading={labelLeadingIcon}
      testID={`sidebar-workspace-menu-labels-${workspaceKey}`}
    >
      {t("workspaceLabels.title")}
    </DropdownMenuSubTrigger>
  );
}

function useWorkspaceMenuPresentation(agentId: string | undefined, isPinned: boolean | undefined) {
  const { t } = useTranslation();
  if (agentId) {
    return {
      pinIcon: undefined,
      pinLabel: isPinned ? t("sidebar.workspace.actions.unpin") : "Pin",
      renameIcon: undefined,
      renameLabel: t("renameModal.rename"),
      archiveIcon: undefined,
    };
  }
  return {
    pinIcon: isPinned ? unpinLeadingIcon : pinLeadingIcon,
    pinLabel: isPinned ? t("sidebar.workspace.actions.unpin") : t("sidebar.workspace.actions.pin"),
    renameIcon: renameLeadingIcon,
    renameLabel: t("sidebar.workspace.actions.rename"),
    archiveIcon: archiveLeadingIcon,
  };
}

function SidebarWorkspaceMenuItems({
  surface,
  workspaceKey,
  serverId,
  workspaceId,
  agentId,
  onCopyPath,
  onCopyBranchName,
  onRename,
  onMarkAsRead,
  onArchive,
  archiveLabel,
  archiveStatus,
  archivePendingLabel,
  isPinned,
  onTogglePin,
  openInFileManagerPath,
}: SidebarWorkspaceMenuItemsProps & { surface: MenuSurface }): ReactNode {
  const { t } = useTranslation();
  const presentation = useWorkspaceMenuPresentation(agentId, isPinned);

  const unread = useSidebarUnreadStore((state) => state.unread[workspaceKey] === true);
  const toggleUnread = useCallback(
    () => useSidebarUnreadStore.getState().setUnread(workspaceKey, !unread),
    [workspaceKey, unread],
  );
  return (
    <>
      {serverId && workspaceId ? <WorkspaceOpenMenuTrigger /> : null}
      {agentId ? <DropdownMenuSeparator /> : null}
      {onTogglePin ? (
        <WorkspaceMenuItem
          surface={surface}
          shortcut="P"
          testID={`sidebar-workspace-menu-pin-${workspaceKey}`}
          leading={presentation.pinIcon}
          onSelect={onTogglePin}
        >
          {presentation.pinLabel}
        </WorkspaceMenuItem>
      ) : null}
      <WorkspaceMenuItem surface={surface} shortcut="U" onSelect={toggleUnread}>
        {unread ? "Mark as read" : "Mark as unread"}
      </WorkspaceMenuItem>
      <WorkspaceCopyMenuItems
        surface={surface}
        workspaceKey={workspaceKey}
        onCopyPath={onCopyPath}
        onCopyBranchName={onCopyBranchName}
      />
      {onRename ? (
        <WorkspaceMenuItem
          surface={surface}
          shortcut="R"
          testID={`sidebar-workspace-menu-rename-${workspaceKey}`}
          leading={presentation.renameIcon}
          onSelect={onRename}
        >
          {presentation.renameLabel}
        </WorkspaceMenuItem>
      ) : null}
      {onMarkAsRead ? (
        <WorkspaceMenuItem
          surface={surface}
          testID={`sidebar-workspace-menu-mark-as-read-${workspaceKey}`}
          leading={markAsReadLeadingIcon}
          onSelect={onMarkAsRead}
        >
          Mark as read
        </WorkspaceMenuItem>
      ) : null}
      {agentId && serverId && workspaceId ? (
        <WorkspaceChatActions
          serverId={serverId}
          workspaceId={workspaceId}
          agentId={agentId}
          action="fork"
        />
      ) : null}
      {agentId ? <DropdownMenuSeparator /> : null}
      <MoveChatToGroupTrigger />
      <WorkspaceLabelsMenuItem
        workspaceKey={workspaceKey}
        serverId={serverId}
        workspaceId={workspaceId}
        agentId={agentId}
      />
      <OpenInFileManagerMenuItem
        surface={surface}
        path={openInFileManagerPath}
        testID={`sidebar-workspace-menu-open-folder-${workspaceKey}`}
      />
      {agentId ? <DropdownMenuSeparator /> : null}
      {onArchive ? (
        <WorkspaceMenuItem
          surface={surface}
          shortcut="A"
          testID={`sidebar-workspace-menu-archive-${workspaceKey}`}
          leading={presentation.archiveIcon}
          status={archiveStatus}
          pendingLabel={archivePendingLabel}
          onSelect={onArchive}
        >
          {archiveLabel ?? t("sidebar.workspace.actions.archive")}
        </WorkspaceMenuItem>
      ) : null}
      {serverId && workspaceId ? (
        <WorkspaceChatActions
          serverId={serverId}
          workspaceId={workspaceId}
          agentId={agentId}
          action={agentId ? "delete" : undefined}
        />
      ) : null}
    </>
  );
}

export function SidebarWorkspaceMenu({
  workspaceKey,
  serverId,
  workspaceId,
  agentId,
  workspaceLabels,
  onCopyPath,
  onCopyBranchName,
  onRename,
  onMarkAsRead,
  onArchive,
  archiveLabel,
  archiveStatus,
  archivePendingLabel,
  archiveShortcutKeys,
  isPinned,
  onTogglePin,
  openInFileManagerPath,
  open,
  onOpenChange,
}: SidebarWorkspaceMenuProps) {
  const { t } = useTranslation();
  const workspaceTarget = useMemo<WorkspaceLabelTarget | null>(
    () =>
      serverId && workspaceId ? { serverId, workspaceId, labels: workspaceLabels ?? [] } : null,
    [serverId, workspaceId, workspaceLabels],
  );
  const labelPages = useWorkspaceLabelMenuPages(agentId ? null : workspaceTarget);
  const pages = workspaceTarget
    ? [
        ...labelPages,
        moveChatToGroupPage(workspaceKey),
        workspaceOpenMenuPage(workspaceTarget.serverId, workspaceTarget.workspaceId, agentId),
      ]
    : [...labelPages, moveChatToGroupPage(workspaceKey)];
  return (
    <DropdownMenu compactMode="sheet" open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        hitSlop={8}
        style={triggerStyle}
        accessibilityRole={isWeb ? undefined : "button"}
        accessibilityLabel={t("sidebar.workspace.actions.menu")}
        testID={`sidebar-workspace-kebab-${workspaceKey}`}
      >
        {renderTriggerIcon}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        width={260}
        pages={pages}
        sheetTitle={t("sidebar.workspace.actions.menu")}
      >
        <SidebarWorkspaceMenuItems
          surface="dropdown"
          workspaceKey={workspaceKey}
          serverId={serverId}
          workspaceId={workspaceId}
          agentId={agentId}
          workspaceLabels={workspaceLabels}
          onCopyPath={onCopyPath}
          onCopyBranchName={onCopyBranchName}
          onRename={onRename}
          onMarkAsRead={onMarkAsRead}
          onArchive={onArchive}
          archiveLabel={archiveLabel}
          archiveStatus={archiveStatus}
          archivePendingLabel={archivePendingLabel}
          archiveShortcutKeys={archiveShortcutKeys}
          isPinned={isPinned}
          onTogglePin={onTogglePin}
          openInFileManagerPath={openInFileManagerPath}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type ContextTriggerProps = Omit<
  ComponentProps<typeof ContextMenuTrigger>,
  "children" | "enabledOnMobile" | "highlightStyle"
>;

export function SidebarWorkspaceContextMenu({
  children,
  contextMenuOpen,
  onContextMenuOpenChange,
  workspace,
  leadingProjectName,
  hostBadgeLabel,
  serviceSummary,
  workspaceKey,
  agentId,
  onCopyPath,
  onCopyBranchName,
  onRename,
  onMarkAsRead,
  onArchive,
  archiveLabel,
  archiveStatus,
  archivePendingLabel,
  archiveShortcutKeys,
  isPinned,
  onTogglePin,
  openInFileManagerPath,
  accessibilityLabel,
  highlightStyle,
  ...triggerProps
}: PropsWithChildren<
  SidebarWorkspaceMenuItemsProps &
    ContextTriggerProps & {
      contextMenuOpen: boolean;
      onContextMenuOpenChange: (open: boolean) => void;
      workspace: SidebarWorkspaceEntry;
      leadingProjectName?: string | null;
      hostBadgeLabel?: string | null;
      serviceSummary?: WorkspaceServiceSummary | null;
      highlightStyle: ComponentProps<typeof ContextMenuTrigger>["highlightStyle"];
    }
>) {
  const {
    settings: { workspaceTitleSource },
  } = useAppSettings();
  const { t } = useTranslation();
  const pullRequestLabel = workspace.prHint
    ? t("workspace.git.pr.accessibility.pullRequest", {
        number: workspace.prHint.number,
        context: getForgePresentation(normalizeForge(workspace.prHint.forge)).changeRequestContext,
      })
    : null;
  const rowAccessibilityLabel = resolveSidebarWorkspaceAccessibilityLabel({
    workspace,
    workspaceTitleSource,
    leadingProjectName,
    hostBadgeLabel,
    pullRequestLabel,
    serviceLabel: serviceSummary
      ? t(workspaceServiceLabelKey(serviceSummary), {
          name: serviceSummary.name,
        })
      : null,
  });
  const workspaceTarget = useMemo<WorkspaceLabelTarget>(
    () => ({
      serverId: workspace.serverId,
      workspaceId: workspace.workspaceId,
      labels: workspace.labels ?? [],
    }),
    [workspace],
  );
  const labelPages = useWorkspaceLabelMenuPages(agentId ? null : workspaceTarget);
  const pages = workspaceTarget
    ? [
        ...labelPages,
        moveChatToGroupPage(workspaceKey),
        workspaceOpenMenuPage(workspaceTarget.serverId, workspaceTarget.workspaceId, agentId),
      ]
    : [...labelPages, moveChatToGroupPage(workspaceKey)];

  const togglePin = useSidebarWorkspacePinController();
  const handleTogglePin = useCallback(() => togglePin(workspace), [togglePin, workspace]);
  return (
    <ContextMenu open={contextMenuOpen} onOpenChange={onContextMenuOpenChange}>
      <ContextMenuTrigger
        {...triggerProps}
        enabledOnMobile={false}
        accessibilityLabel={accessibilityLabel ?? rowAccessibilityLabel}
        highlightStyle={highlightStyle}
      >
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent
        align="start"
        width={260}
        testID={`sidebar-workspace-context-menu-${workspaceKey}`}
        pages={pages}
      >
        <SidebarWorkspaceMenuItems
          surface="context"
          workspaceKey={workspaceKey}
          serverId={workspaceTarget.serverId}
          workspaceId={workspaceTarget.workspaceId}
          agentId={agentId}
          workspaceLabels={workspaceTarget.labels}
          onCopyPath={onCopyPath}
          onCopyBranchName={onCopyBranchName}
          onRename={onRename}
          onMarkAsRead={onMarkAsRead}
          onArchive={onArchive}
          archiveLabel={archiveLabel}
          archiveStatus={archiveStatus}
          archivePendingLabel={archivePendingLabel}
          archiveShortcutKeys={archiveShortcutKeys}
          isPinned={isPinned ?? workspace.pinnedAt != null}
          onTogglePin={onTogglePin ?? (agentId ? undefined : handleTogglePin)}
          openInFileManagerPath={openInFileManagerPath}
        />
      </ContextMenuContent>
    </ContextMenu>
  );
}

function triggerStyle({ hovered = false }: PressableStateCallbackType & { hovered?: boolean }) {
  return [styles.trigger, hovered && styles.triggerHovered];
}

const styles = StyleSheet.create((theme) => ({
  trigger: {
    padding: 2,
    borderRadius: 4,
    marginLeft: 2,
    // MoreVertical paints only around the center of its SVG. Keep the padded hit box, but
    // pull the painted dots through that unused view-box space onto the trailing-content rail.
    marginRight: -7,
  },
  triggerHovered: {
    backgroundColor: theme.colors.surface2,
  },
}));
