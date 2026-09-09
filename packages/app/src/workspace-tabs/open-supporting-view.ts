import type { ExplorerCheckoutContext } from "@/stores/explorer-checkout-context";
import { getPanelInstanceAttributes } from "@/panels/panel-instance-attributes";
import {
  collectAllTabs,
  useWorkspaceLayoutStore,
  type WorkspaceLayout,
} from "@/stores/workspace-layout-store";
import { workspaceTabTargetsEqual } from "@/workspace-tabs/identity";
import type { WorkspaceTabTarget } from "@/workspace-tabs/model";
import {
  openExplorerSidebarView,
  usesCompactExplorerSidebar,
  type ExplorerSidebarView,
} from "@/workspace-tabs/explorer-sidebar";

interface WorkspaceViewInput {
  isCompact: boolean;
  workspaceKey: string | null;
  checkout: ExplorerCheckoutContext | null;
  supportsPaneSplits?: boolean;
}

export interface OpenWorkspaceSupportingTargetInput {
  workspaceKey: string | null;
  target: WorkspaceTabTarget;
  parentTabId?: string | null;
  /** Supplied when an unmodified file or diff already in the panel may be reused. */
  preview?: { serverId: string; workspaceId: string };
}

function openExplorerView(input: WorkspaceViewInput, view: ExplorerSidebarView): void {
  openExplorerSidebarView({ ...input, view });
}

function findReplaceablePreviewTabId(input: {
  layout: WorkspaceLayout | undefined;
  target: WorkspaceTabTarget;
  serverId: string;
  workspaceId: string;
}): string | null {
  if (!input.layout) {
    return null;
  }
  const tabs = collectAllTabs(input.layout.root);
  if (tabs.some((tab) => workspaceTabTargetsEqual(tab.target, input.target))) {
    return null;
  }
  const previewKind = input.target.kind === "working_diff" ? "working_diff" : "file";
  if (input.target.kind !== "working_diff" && input.target.kind !== "file") {
    return null;
  }
  const candidate = tabs.find((tab) => {
    if (tab.target.kind !== previewKind) return false;
    return (
      input.target.kind !== "working_diff" ||
      (tab.target.kind === "working_diff" && tab.target.workspaceId === input.target.workspaceId)
    );
  });
  if (!candidate) {
    return null;
  }
  if (previewKind === "working_diff") {
    return candidate.tabId;
  }
  return getPanelInstanceAttributes({
    serverId: input.serverId,
    workspaceId: input.workspaceId,
    tabId: candidate.tabId,
  }).modified
    ? null
    : candidate.tabId;
}

/**
 * Opens a file, diff, tree, terminal or browser. There is one place these can go — the side
 * panel — so the panel manifest picks the host and this only decides whether an unmodified
 * preview already sitting there should be reused instead of stacked behind.
 */
export function openWorkspaceSupportingTarget(
  input: OpenWorkspaceSupportingTargetInput,
): string | null {
  if (!input.workspaceKey) {
    return null;
  }
  const store = useWorkspaceLayoutStore.getState();
  if (input.preview) {
    const previewTabId = findReplaceablePreviewTabId({
      layout: store.layoutByWorkspace[input.workspaceKey],
      target: input.target,
      serverId: input.preview.serverId,
      workspaceId: input.preview.workspaceId,
    });
    if (previewTabId) {
      const tabId = store.replaceTab(input.workspaceKey, previewTabId, input.target);
      if (tabId && input.parentTabId) {
        return store.openTab({
          workspaceKey: input.workspaceKey,
          target: input.target,
          intent: "reveal",
          parentTabId: input.parentTabId,
        });
      }
      return tabId;
    }
  }
  return store.openTab({
    workspaceKey: input.workspaceKey,
    target: input.target,
    intent: "reveal",
    parentTabId: input.parentTabId ?? undefined,
  });
}

/** Opens the workspace Changes view: the compact explorer, or the desktop side panel. */
export function openWorkspaceChanges(input: WorkspaceViewInput): string | null {
  if (usesCompactExplorerSidebar(input)) {
    openExplorerView(input, "changes");
    return null;
  }
  return openWorkspaceSupportingTarget({
    workspaceKey: input.workspaceKey,
    target: { kind: "working_diff" },
  });
}

/** Reveals Changes from the composer, then opens its diff on a subsequent desktop action. */
export function openComposerChanges(input: WorkspaceViewInput): string | null {
  return openWorkspaceChanges(input);
}

/** Opens the workspace pull request in the side panel, or the compact explorer. */
export function openWorkspacePullRequest(input: WorkspaceViewInput): string | null {
  if (usesCompactExplorerSidebar(input)) {
    openExplorerView(input, "pr");
    return null;
  }
  return openWorkspaceSupportingTarget({
    workspaceKey: input.workspaceKey,
    target: { kind: "pull_request" },
  });
}
