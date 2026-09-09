import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { z } from "zod";
import type { JsonValue } from "@getpaseo/protocol/agent-types";
import type { WorkspaceTab, WorkspaceTabTarget } from "@/workspace-tabs/model";
import {
  defaultWorkspaceLayoutIds,
  type WorkspaceLayoutIdSource,
} from "@/stores/workspace-layout-ids";
import {
  addChatPaneToLayout,
  closeChatPaneInLayout,
  collectChatPanes,
  normalizeWorkspaceChatLayout,
  closeTabInLayout,
  collectAllPanes,
  collectAllTabs,
  convertDraftToAgentInLayout,
  createTabInLayout,
  createDefaultLayout,
  DEFAULT_PANE_ID,
  AMBIENT_PLACEMENT,
  createWorkspaceLayoutWithExplorerSidebar,
  FOCUSED_PANE_PLACEMENT,
  EXPLORER_SIDEBAR_PANE_ID,
  findPaneById,
  findPaneContainingTab,
  flattenLayoutToSingleChat,
  focusPaneInLayout,
  focusTabInLayout,
  getFocusedBrowserId,
  normalizeLayout,
  openTabInLayoutBackground,
  replaceTabTargetInLayout,
  revealTargetInLayout,
  restoreEmptyPanesInLayout,
  reconcileWorkspaceTabs,
  removeTabFromTree,
  setPaneHiddenInLayout,
  setTabStateInLayout,
  selectTabInPaneInLayout,
  stripEphemeralTabsFromLayout,
  type SplitGroup,
  type SplitNode,
  type SplitPane,
  type WorkspaceTabPlacement,
  type WorkspaceTabReconcileState,
  type WorkspaceTabSnapshot,
  type WorkspaceLayout,
} from "@/stores/workspace-layout-actions";
import { normalizeWorkspaceTabTarget } from "@/workspace-tabs/identity";
import { createValidatedPersistStorage } from "@/storage/validated-persist-storage";
import { resolveWorkspaceTargetHost } from "@/workspace-tabs/target-host";
import { usePanelStore } from "@/stores/panel-store";

export {
  AMBIENT_PLACEMENT,
  collectAllPanes,
  collectAllTabs,
  createDefaultLayout,
  DEFAULT_PANE_ID,
  EXPLORER_SIDEBAR_PANE_ID,
  createWorkspaceLayoutWithExplorerSidebar,
  FOCUSED_PANE_PLACEMENT,
  findPaneById,
  findPaneContainingTab,
  flattenLayoutToSingleChat,
  getFocusedBrowserId,
  normalizeLayout,
  removeTabFromTree,
  stripEphemeralTabsFromLayout,
};
export type {
  SplitGroup,
  SplitNode,
  SplitPane,
  WorkspaceLayout,
  WorkspaceTabPlacement,
  WorkspaceTabReconcileState,
  WorkspaceTabSnapshot,
};

export type WorkspaceTabOpenIntent = "new" | "reveal" | "background";
export interface OpenWorkspaceTabInput {
  workspaceKey: string;
  target: WorkspaceTabTarget;
  intent: WorkspaceTabOpenIntent;
  /** Keeps an explicitly opened agent visible even when it is archived. */
  pin?: boolean;
  placement?: WorkspaceTabPlacement;
  parentTabId?: string;
  state?: JsonValue;
}

interface WorkspaceLayoutStore {
  layoutByWorkspace: Record<string, WorkspaceLayout>;
  explorerSidebarWidthByWorkspace: Record<string, number>;
  pinnedAgentIdsByWorkspace: Record<string, Set<string>>;
  pendingAgentIdsByWorkspace: Record<string, Set<string>>;
  hiddenAgentIdsByWorkspace: Record<string, Set<string>>;
  focusRestorationByWorkspace: Record<string, WorkspaceFocusRestorationState>;
  addChatPane: (workspaceKey: string) => string | null;
  closeChatPane: (workspaceKey: string, paneId: string) => void;
  openTab: (input: OpenWorkspaceTabInput) => string | null;
  /** Reveals the side panel without selecting a view. Returns its pane id. */
  showExplorerSidebar: (workspaceKey: string) => string | null;
  hideExplorerSidebar: (workspaceKey: string) => void;
  closeTab: (workspaceKey: string, tabId: string) => void;
  focusTab: (workspaceKey: string, tabId: string) => void;
  selectTabInPane: (workspaceKey: string, paneId: string, tabId: string) => void;
  replaceTab: (
    workspaceKey: string,
    tabId: string,
    target: WorkspaceTabTarget,
    state?: JsonValue,
  ) => string | null;
  setTabState: (workspaceKey: string, tabId: string, state: JsonValue | undefined) => void;
  convertDraftToAgent: (workspaceKey: string, tabId: string, agentId: string) => string | null;
  reconcileTabs: (workspaceKey: string, snapshot: WorkspaceTabSnapshot) => void;
  resolvePendingAgent: (workspaceKey: string, agentId: string) => void;
  getWorkspaceTabs: (workspaceKey: string) => WorkspaceTab[];
  focusPane: (workspaceKey: string, paneId: string) => void;
  unfocusPane: (workspaceKey: string) => string | null;
  restorePaneFocus: (workspaceKey: string, token: string) => void;
  resizeExplorerSidebar: (workspaceKey: string, width: number) => void;
  unpinAgent: (workspaceKey: string, agentId: string) => void;
  hideAgent: (workspaceKey: string, agentId: string) => void;
  unhideAgent: (workspaceKey: string, agentId: string) => void;
  purgeWorkspace: (workspaceKey: string) => void;
}

interface WorkspaceFocusRestorationState {
  restorePaneId: string | null;
  tokens: string[];
}

const WorkspaceDraftTabSetupStorageSchema = z.strictObject({
  provider: z.string(),
  cwd: z.string(),
  modeId: z.string().nullable(),
  model: z.string().nullable(),
  thinkingOptionId: z.string().nullable(),
  featureValues: z.record(z.string(), z.union([z.boolean(), z.string(), z.null()])),
});
const WorkspaceTabTargetStorageSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("new_tab") }),
  z.strictObject({
    kind: z.literal("draft"),
    draftId: z.string(),
    setup: WorkspaceDraftTabSetupStorageSchema.optional(),
  }),
  z.strictObject({
    kind: z.literal("agent"),
    agentId: z.string(),
    view: z.literal("split").optional(),
  }),
  z.strictObject({ kind: z.literal("subagents"), parentAgentId: z.string() }),
  z.strictObject({
    kind: z.literal("provider_subagent"),
    parentAgentId: z.string(),
    subagentId: z.string(),
  }),
  z.strictObject({ kind: z.literal("terminal"), terminalId: z.string() }),
  z.strictObject({ kind: z.literal("browser"), browserId: z.string() }),
  z.strictObject({ kind: z.literal("changes_tree") }),
  z.strictObject({ kind: z.literal("files") }),
  z.strictObject({ kind: z.literal("pull_request") }),
  z.strictObject({
    kind: z.literal("file"),
    path: z.string(),
    lineStart: z.number().int().positive().optional(),
    lineEnd: z.number().int().positive().optional(),
  }),
  z.strictObject({
    kind: z.literal("working_diff"),
    workspaceId: z.string().optional(),
    focusPath: z.string().optional(),
    focusRequestId: z.number().optional(),
    // COMPAT(workingDiffTarget): accepted from pre-canonical tab ids; normalization removes them.
    mode: z.enum(["uncommitted", "base"]).optional(),
    baseRef: z.string().nullable().optional(),
    ignoreWhitespace: z.boolean().optional(),
  }),
  z.strictObject({ kind: z.literal("setup"), workspaceId: z.string() }),
  z.strictObject({ kind: z.literal("commit_diff"), sha: z.string() }),
  z.discriminatedUnion("context", [
    z.strictObject({
      kind: z.literal("plugin"),
      pluginId: z.string(),
      panelId: z.string(),
      context: z.literal("workspace"),
    }),
    z.strictObject({
      kind: z.literal("plugin"),
      pluginId: z.string(),
      panelId: z.string(),
      context: z.literal("agent"),
      agentId: z.string(),
    }),
  ]),
]);
const WorkspaceTabStorageSchema = z.strictObject({
  tabId: z.string(),
  target: WorkspaceTabTargetStorageSchema,
  createdAt: z.number(),
  state: z.json().optional(),
});
const SplitNodeStorageSchema: z.ZodType<SplitNode> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("pane"),
      pane: z.strictObject({
        id: z.string(),
        tabIds: z.array(z.string()),
        focusedTabId: z.string().nullable(),
        tabs: z.array(WorkspaceTabStorageSchema).optional(),
        hidden: z.boolean().optional(),
      }),
    }),
    z.strictObject({
      kind: z.literal("group"),
      group: z.strictObject({
        id: z.string(),
        direction: z.enum(["horizontal", "vertical"]),
        children: z.array(SplitNodeStorageSchema),
        sizes: z.array(z.number()),
      }),
    }),
  ]),
);
const WorkspaceLayoutStorageSchema: z.ZodType<WorkspaceLayout> = z.strictObject({
  root: SplitNodeStorageSchema,
  focusedPaneId: z.string().nullable(),
  parentTabIdByTabId: z.record(z.string(), z.string()).optional(),
});
const WorkspaceLayoutPersistedStateSchema = z.strictObject({
  layoutByWorkspace: z.record(z.string(), WorkspaceLayoutStorageSchema),
  splitSizesByWorkspace: z.record(z.string(), z.record(z.string(), z.array(z.number()))).optional(),
  explorerSidebarWidthByWorkspace: z.record(z.string(), z.number()).optional(),
  // COMPAT(explorerSidebarWidth): added in v0.6, remove after 2027-08-25.
  explorerSidebarRatioByWorkspace: z.record(z.string(), z.number()).optional(),
  // COMPAT(explorerSidebarNaming): accepted from builds that called this dock the Side panel.
  sidePanelRatioByWorkspace: z.record(z.string(), z.number()).optional(),
  // The persisted keys keep their pre-rename spelling: the schema is strict, so a
  // rename here would fail every existing blob and wipe the layout it describes.
  explorerPaneIdByWorkspace: z.record(z.string(), z.string().nullable()).optional(),
  explorerSidebarPaneIdByWorkspace: z.record(z.string(), z.string().nullable()).optional(),
  sidePaneIdByWorkspace: z.record(z.string(), z.string().nullable()).optional(),
  // COMPAT(pullRequestAutoAdd): PR detection stopped opening a tab in v0.5; accepted
  // and ignored so upgrading does not discard the layout. Remove after 2027-08-20.
  acknowledgedPullRequestByWorkspace: z.record(z.string(), z.string()).optional(),
});

const LEGACY_EXPLORER_SIDEBAR_REFERENCE_WIDTH = 1440;
const WORKSPACE_LAYOUT_PERSIST_VERSION = 4;

function convertLegacyExplorerSidebarRatios(
  ratiosByWorkspace: Record<string, number>,
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(ratiosByWorkspace).map(([workspaceKey, ratio]) => [
      workspaceKey,
      ratio * LEGACY_EXPLORER_SIDEBAR_REFERENCE_WIDTH,
    ]),
  );
}

/**
 * Keep supported chat panes through upgrades, and move the old independent explorer chat
 * into its own grid cell. Older arbitrary trees still retain all conversations and drafts.
 */
function migrateWorkspaceLayoutPersistedState(
  persistedState: unknown,
  version: number,
): z.infer<typeof WorkspaceLayoutPersistedStateSchema> {
  const result = WorkspaceLayoutPersistedStateSchema.safeParse(persistedState);
  if (!result.success) {
    return { layoutByWorkspace: {} };
  }
  if (version >= WORKSPACE_LAYOUT_PERSIST_VERSION) {
    return result.data;
  }
  return {
    ...result.data,
    layoutByWorkspace: Object.fromEntries(
      Object.entries(result.data.layoutByWorkspace).map(([workspaceKey, layout]) => [
        workspaceKey,
        normalizeWorkspaceChatLayout(stripEphemeralTabsFromLayout(layout), (target, previousHost) =>
          resolveWorkspaceTargetHost(workspaceKey, target, previousHost),
        ),
      ]),
    ),
    explorerSidebarPaneIdByWorkspace: {},
    sidePaneIdByWorkspace: {},
  };
}

function trimNonEmpty(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function createWorkspaceTabInstanceId(): string {
  const value =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `tab_${value}`;
}

function addAgentIdToWorkspaceSet(
  state: Record<string, Set<string>>,
  workspaceKey: string,
  agentId: string,
): Record<string, Set<string>> {
  const currentAgentIds = state[workspaceKey] ?? null;
  if (currentAgentIds?.has(agentId)) {
    return state;
  }

  const nextAgentIds = new Set(currentAgentIds ?? []);
  nextAgentIds.add(agentId);
  return {
    ...state,
    [workspaceKey]: nextAgentIds,
  };
}

function removeAgentIdFromWorkspaceSet(
  state: Record<string, Set<string>>,
  workspaceKey: string,
  agentId: string,
): Record<string, Set<string>> {
  const currentAgentIds = state[workspaceKey] ?? null;
  if (!currentAgentIds?.has(agentId)) {
    return state;
  }

  if (currentAgentIds.size === 1) {
    const nextState = { ...state };
    delete nextState[workspaceKey];
    return nextState;
  }

  const nextAgentIds = new Set(currentAgentIds);
  nextAgentIds.delete(agentId);
  return {
    ...state,
    [workspaceKey]: nextAgentIds,
  };
}

function getWorkspaceLayout(
  state: Record<string, WorkspaceLayout>,
  workspaceKey: string,
): WorkspaceLayout {
  return normalizeWorkspaceChatLayout(
    normalizeLayout(state[workspaceKey] ?? createWorkspaceLayoutWithExplorerSidebar()),
    (target, previousHost) => resolveWorkspaceTargetHost(workspaceKey, target, previousHost),
  );
}

/** Hidden supporting panels cannot retain keyboard focus. */
function keepWorkspaceFocusOutOfExplorerSidebar(
  layout: WorkspaceLayout,
  preferredMainPaneId?: string | null,
): WorkspaceLayout {
  if (
    layout.focusedPaneId !== EXPLORER_SIDEBAR_PANE_ID ||
    findPaneById(layout.root, EXPLORER_SIDEBAR_PANE_ID)?.hidden !== true
  )
    return layout;
  const sidePane = findPaneById(layout.root, EXPLORER_SIDEBAR_PANE_ID);
  const parentTabId = sidePane?.focusedTabId
    ? layout.parentTabIdByTabId?.[sidePane.focusedTabId]
    : null;
  const parentPane = parentTabId ? findPaneContainingTab(layout.root, parentTabId) : null;
  const panes = collectChatPanes(layout.root);
  return {
    ...layout,
    focusedPaneId:
      panes.find((pane) => pane.id === parentPane?.id)?.id ??
      panes.find((pane) => pane.id === preferredMainPaneId)?.id ??
      panes[0]?.id ??
      null,
  };
}

type ExplorerSidebarState = Pick<WorkspaceLayoutStore, "layoutByWorkspace">;

/**
 * The side panel's pane, on screen or not. Every workspace has one — the layout is born
 * with it and normalization puts it back — so this answers before the first tab exists.
 */
export function selectExplorerSidebarPaneId(
  state: ExplorerSidebarState,
  workspaceKey: string,
): string | null {
  const layout = getWorkspaceLayout(state.layoutByWorkspace, workspaceKey);
  return findPaneById(layout.root, EXPLORER_SIDEBAR_PANE_ID)?.id ?? null;
}

/** Whether the side panel is currently on screen. */
export function selectIsExplorerSidebarVisible(
  state: ExplorerSidebarState,
  workspaceKey: string,
): boolean {
  const layout = state.layoutByWorkspace[workspaceKey];
  const pane = layout ? findPaneById(layout.root, EXPLORER_SIDEBAR_PANE_ID) : null;
  return Boolean(pane && pane.hidden !== true);
}

interface TabPlacementResult {
  layout: WorkspaceLayout;
  placement: WorkspaceTabPlacement;
}

function getSplitChatPlacement(
  layout: WorkspaceLayout,
  savedTab: WorkspaceTab | undefined,
  savedPane: SplitPane | null,
): TabPlacementResult | null {
  if (
    savedPane &&
    savedTab?.target.kind === "agent" &&
    savedTab.target.view === "split" &&
    savedPane.id !== DEFAULT_PANE_ID &&
    savedPane.id !== EXPLORER_SIDEBAR_PANE_ID
  ) {
    return { layout, placement: { mode: "pane", paneId: savedPane.id } };
  }
  const empty = collectChatPanes(layout.root).find(
    (pane) =>
      pane.id !== DEFAULT_PANE_ID &&
      collectAllTabs({ kind: "pane", pane }).every((tab) => tab.target.kind === "new_tab"),
  );
  if (empty) return { layout, placement: { mode: "pane", paneId: empty.id } };
  const added = addChatPaneToLayout(layout);
  return added ? { layout: added.layout, placement: { mode: "pane", paneId: added.paneId } } : null;
}

function getOpenTabPlacement(
  state: WorkspaceLayoutStore,
  workspaceKey: string,
  target: WorkspaceTabTarget,
  placement: WorkspaceTabPlacement | undefined,
): TabPlacementResult | null {
  const layout = getWorkspaceLayout(state.layoutByWorkspace, workspaceKey);
  const savedTab =
    target.kind === "agent"
      ? collectAllTabs(layout.root).find(
          (tab) => tab.target.kind === "agent" && tab.target.agentId === target.agentId,
        )
      : undefined;
  const savedPane = savedTab ? findPaneContainingTab(layout.root, savedTab.tabId) : null;
  if (target.kind === "agent" && target.view === "split")
    return getSplitChatPlacement(layout, savedTab, savedPane);
  const host = resolveWorkspaceTargetHost(
    workspaceKey,
    target,
    savedPane?.id === EXPLORER_SIDEBAR_PANE_ID ? "explorer" : undefined,
  );
  if (host === "explorer")
    return { layout, placement: { mode: "pane", paneId: EXPLORER_SIDEBAR_PANE_ID } };
  return {
    layout,
    placement: {
      mode: "pane",
      paneId: resolveMainChatPlacement(layout, placement, savedTab, savedPane),
    },
  };
}

function resolveMainChatPlacement(
  layout: WorkspaceLayout,
  placement: WorkspaceTabPlacement | undefined,
  savedTab: WorkspaceTab | undefined,
  savedPane: SplitPane | null,
): string {
  const requestedPaneId =
    placement?.mode === "pane" || placement?.mode === "prefer" ? placement.paneId : null;
  if (
    requestedPaneId &&
    requestedPaneId !== EXPLORER_SIDEBAR_PANE_ID &&
    findPaneById(layout.root, requestedPaneId)
  )
    return requestedPaneId;
  const focusedChatId =
    layout.focusedPaneId !== EXPLORER_SIDEBAR_PANE_ID ? layout.focusedPaneId : null;
  if (savedTab?.target.kind === "agent" && savedTab.target.view === "split")
    return focusedChatId ?? DEFAULT_PANE_ID;
  if (savedPane && savedPane.id !== EXPLORER_SIDEBAR_PANE_ID) return savedPane.id;
  return focusedChatId ?? DEFAULT_PANE_ID;
}

function returnsFromSupportingViewToChat(layout: WorkspaceLayout, tabId: string): boolean {
  const pane = findPaneContainingTab(layout.root, tabId);
  if (pane?.id !== EXPLORER_SIDEBAR_PANE_ID || pane.focusedTabId !== tabId) return false;
  const parentTabId = layout.parentTabIdByTabId?.[tabId];
  return Boolean(
    parentTabId && findPaneContainingTab(layout.root, parentTabId)?.id !== EXPLORER_SIDEBAR_PANE_ID,
  );
}

function withoutFocusRestoration(
  state: WorkspaceLayoutStore,
  workspaceKey: string,
): Pick<WorkspaceLayoutStore, "focusRestorationByWorkspace"> | null {
  if (!(workspaceKey in state.focusRestorationByWorkspace)) {
    return null;
  }
  const { [workspaceKey]: _removed, ...focusRestorationByWorkspace } =
    state.focusRestorationByWorkspace;
  return { focusRestorationByWorkspace };
}

function attachParentTab(input: {
  layout: WorkspaceLayout;
  childTabId: string | null;
  parentTabId: string | null;
}): WorkspaceLayout {
  const childTabId = trimNonEmpty(input.childTabId);
  const parentTabId = trimNonEmpty(input.parentTabId);
  if (!childTabId || !parentTabId || childTabId === parentTabId) {
    return normalizeLayout(input.layout);
  }

  const openTabIds = new Set(collectAllTabs(input.layout.root).map((tab) => tab.tabId));
  if (!openTabIds.has(childTabId) || !openTabIds.has(parentTabId)) {
    return normalizeLayout(input.layout);
  }

  return normalizeLayout({
    ...input.layout,
    parentTabIdByTabId: {
      ...input.layout.parentTabIdByTabId,
      [childTabId]: parentTabId,
    },
  });
}

export function createWorkspaceLayoutStore(
  ids: WorkspaceLayoutIdSource = defaultWorkspaceLayoutIds,
) {
  return create<WorkspaceLayoutStore>()(
    persist(
      (set, get) => ({
        layoutByWorkspace: {},
        explorerSidebarWidthByWorkspace: {},
        pinnedAgentIdsByWorkspace: {},
        pendingAgentIdsByWorkspace: {},
        hiddenAgentIdsByWorkspace: {},
        focusRestorationByWorkspace: {},
        closeChatPane: (workspaceKey, paneId) => {
          const key = trimNonEmpty(workspaceKey);
          if (!key) return;
          const next = closeChatPaneInLayout(
            getWorkspaceLayout(get().layoutByWorkspace, key),
            paneId,
          );
          if (next)
            set((state) => ({ layoutByWorkspace: { ...state.layoutByWorkspace, [key]: next } }));
        },
        addChatPane: (workspaceKey) => {
          const key = trimNonEmpty(workspaceKey);
          if (!key) return null;
          const added = addChatPaneToLayout(getWorkspaceLayout(get().layoutByWorkspace, key));
          if (!added) return null;
          set((state) => ({
            layoutByWorkspace: { ...state.layoutByWorkspace, [key]: added.layout },
          }));
          usePanelStore.getState().exitFocusMode();
          return added.paneId;
        },
        openTab: (input) => {
          const normalizedWorkspaceKey = trimNonEmpty(input.workspaceKey);
          const normalizedTarget = normalizeWorkspaceTabTarget(input.target);
          if (!normalizedWorkspaceKey || !normalizedTarget) {
            return null;
          }
          const placement = getOpenTabPlacement(
            get(),
            normalizedWorkspaceKey,
            normalizedTarget,
            input.placement,
          );
          if (!placement) return null;
          let result;
          if (input.intent === "new") {
            result = createTabInLayout({
              ...placement,
              target: normalizedTarget,
              now: Date.now(),
              createTabId: createWorkspaceTabInstanceId,
              state: input.state,
            });
          } else if (input.intent === "background") {
            result = openTabInLayoutBackground({
              ...placement,
              target: normalizedTarget,
              now: Date.now(),
            });
          } else {
            result = revealTargetInLayout({
              ...placement,
              target: normalizedTarget,
              now: Date.now(),
              createTabId: createWorkspaceTabInstanceId,
            });
          }
          if (!result) {
            return null;
          }
          const openedSidePane =
            findPaneContainingTab(result.layout.root, result.tabId)?.id ===
            EXPLORER_SIDEBAR_PANE_ID;
          // Opening a supporting view retains the originating chat's keyboard target until
          // the user interacts with the dock. Background views never take focus.
          const focusedLayout = openedSidePane
            ? { ...result.layout, focusedPaneId: placement.layout.focusedPaneId }
            : result.layout;
          // A terminal, tree or browser can only live in the side panel, so an explicit open
          // has to bring the panel out. Background opens stay quiet.
          const landedInSidePanel =
            findPaneContainingTab(focusedLayout.root, result.tabId)?.id ===
            EXPLORER_SIDEBAR_PANE_ID;
          const nextLayout =
            landedInSidePanel && input.intent !== "background"
              ? (setPaneHiddenInLayout({
                  layout: focusedLayout,
                  paneId: EXPLORER_SIDEBAR_PANE_ID,
                  hidden: false,
                }) ?? focusedLayout)
              : focusedLayout;
          const shouldPinAgent = input.pin === true && normalizedTarget.kind === "agent";
          set((state) => ({
            ...withoutFocusRestoration(state, normalizedWorkspaceKey),
            hiddenAgentIdsByWorkspace:
              normalizedTarget.kind !== "agent"
                ? state.hiddenAgentIdsByWorkspace
                : removeAgentIdFromWorkspaceSet(
                    state.hiddenAgentIdsByWorkspace,
                    normalizedWorkspaceKey,
                    normalizedTarget.agentId,
                  ),
            pinnedAgentIdsByWorkspace: shouldPinAgent
              ? addAgentIdToWorkspaceSet(
                  state.pinnedAgentIdsByWorkspace,
                  normalizedWorkspaceKey,
                  normalizedTarget.agentId,
                )
              : state.pinnedAgentIdsByWorkspace,
            pendingAgentIdsByWorkspace: shouldPinAgent
              ? addAgentIdToWorkspaceSet(
                  state.pendingAgentIdsByWorkspace,
                  normalizedWorkspaceKey,
                  normalizedTarget.agentId,
                )
              : state.pendingAgentIdsByWorkspace,
            layoutByWorkspace: {
              ...state.layoutByWorkspace,
              [normalizedWorkspaceKey]: input.parentTabId
                ? attachParentTab({
                    layout: nextLayout,
                    childTabId: result.tabId,
                    parentTabId: input.parentTabId,
                  })
                : nextLayout,
            },
          }));
          // Focus mode is presentation state outside this layout. Only an explicit
          // activation may leave it; retained/background updates must stay quiet.
          if (landedInSidePanel && input.intent !== "background") {
            usePanelStore.getState().exitFocusMode();
          }
          return result.tabId;
        },
        showExplorerSidebar: (workspaceKey) => {
          const normalizedWorkspaceKey = trimNonEmpty(workspaceKey);
          if (!normalizedWorkspaceKey) {
            return null;
          }

          set((state) => {
            const currentLayout = getWorkspaceLayout(
              state.layoutByWorkspace,
              normalizedWorkspaceKey,
            );
            const revealedLayout =
              setPaneHiddenInLayout({
                layout: currentLayout,
                paneId: EXPLORER_SIDEBAR_PANE_ID,
                hidden: false,
              }) ?? currentLayout;
            return {
              layoutByWorkspace: {
                ...state.layoutByWorkspace,
                [normalizedWorkspaceKey]: keepWorkspaceFocusOutOfExplorerSidebar(
                  revealedLayout,
                  currentLayout.focusedPaneId,
                ),
              },
            };
          });
          usePanelStore.getState().exitFocusMode();
          return EXPLORER_SIDEBAR_PANE_ID;
        },
        hideExplorerSidebar: (workspaceKey) => {
          const normalizedWorkspaceKey = trimNonEmpty(workspaceKey);
          if (!normalizedWorkspaceKey) {
            return;
          }

          set((state) => {
            const layout = getWorkspaceLayout(state.layoutByWorkspace, normalizedWorkspaceKey);
            const paneId = EXPLORER_SIDEBAR_PANE_ID;
            const nextLayout = paneId
              ? setPaneHiddenInLayout({ layout, paneId, hidden: true })
              : null;
            if (!nextLayout) {
              return state;
            }

            return {
              layoutByWorkspace: {
                ...state.layoutByWorkspace,
                [normalizedWorkspaceKey]: keepWorkspaceFocusOutOfExplorerSidebar(
                  nextLayout,
                  layout.focusedPaneId,
                ),
              },
            };
          });
        },
        closeTab: (workspaceKey, tabId) => {
          const normalizedWorkspaceKey = trimNonEmpty(workspaceKey);
          const normalizedTabId = trimNonEmpty(tabId);
          if (!normalizedWorkspaceKey || !normalizedTabId) {
            return;
          }

          set((state) => {
            const layout = getWorkspaceLayout(state.layoutByWorkspace, normalizedWorkspaceKey);
            const closingPane = findPaneContainingTab(layout.root, normalizedTabId);
            // Both panes are structural: the chat keeps its shell and the side panel hides
            // rather than being removed, so closing the last tab never leaves nothing to look at.
            const preserveEmptyPaneId =
              closingPane?.id === DEFAULT_PANE_ID || closingPane?.id === EXPLORER_SIDEBAR_PANE_ID
                ? closingPane.id
                : null;
            const closedLayout = closeTabInLayout({
              layout,
              tabId: normalizedTabId,
              preserveEmptyPaneId,
            });
            const nextLayoutBeforeFocusNormalization =
              closedLayout &&
              closingPane?.id === EXPLORER_SIDEBAR_PANE_ID &&
              (closingPane.tabIds.length === 1 ||
                returnsFromSupportingViewToChat(layout, normalizedTabId))
                ? (setPaneHiddenInLayout({
                    layout: closedLayout,
                    paneId: EXPLORER_SIDEBAR_PANE_ID,
                    hidden: true,
                  }) ?? closedLayout)
                : closedLayout;
            const nextLayout = nextLayoutBeforeFocusNormalization
              ? keepWorkspaceFocusOutOfExplorerSidebar(
                  nextLayoutBeforeFocusNormalization,
                  layout.focusedPaneId,
                )
              : null;
            if (!nextLayout) {
              return state;
            }

            return {
              ...withoutFocusRestoration(state, normalizedWorkspaceKey),
              layoutByWorkspace: {
                ...state.layoutByWorkspace,
                [normalizedWorkspaceKey]: nextLayout,
              },
            };
          });
        },
        focusTab: (workspaceKey, tabId) => {
          const normalizedWorkspaceKey = trimNonEmpty(workspaceKey);
          const normalizedTabId = trimNonEmpty(tabId);
          if (!normalizedWorkspaceKey || !normalizedTabId) {
            return;
          }

          let revealedSidePanel = false;
          set((state) => {
            const layout = getWorkspaceLayout(state.layoutByWorkspace, normalizedWorkspaceKey);
            const explorerSidebarPaneId = EXPLORER_SIDEBAR_PANE_ID;
            const tabPane = findPaneContainingTab(layout.root, normalizedTabId);
            let nextLayout: WorkspaceLayout | null;
            if (tabPane?.id === explorerSidebarPaneId) {
              revealedSidePanel = true;
              const revealedLayout =
                setPaneHiddenInLayout({
                  layout,
                  paneId: explorerSidebarPaneId,
                  hidden: false,
                }) ?? layout;
              nextLayout =
                selectTabInPaneInLayout({
                  layout: revealedLayout,
                  paneId: explorerSidebarPaneId,
                  tabId: normalizedTabId,
                }) ?? revealedLayout;
            } else {
              nextLayout = focusTabInLayout({ layout, tabId: normalizedTabId });
            }
            if (!nextLayout) {
              return state;
            }

            return {
              ...withoutFocusRestoration(state, normalizedWorkspaceKey),
              layoutByWorkspace: {
                ...state.layoutByWorkspace,
                [normalizedWorkspaceKey]: nextLayout,
              },
            };
          });
          if (revealedSidePanel) usePanelStore.getState().exitFocusMode();
        },
        selectTabInPane: (workspaceKey, paneId, tabId) => {
          const normalizedWorkspaceKey = trimNonEmpty(workspaceKey);
          const normalizedPaneId = trimNonEmpty(paneId);
          const normalizedTabId = trimNonEmpty(tabId);
          if (!normalizedWorkspaceKey || !normalizedPaneId || !normalizedTabId) {
            return;
          }
          set((state) => {
            const layout = getWorkspaceLayout(state.layoutByWorkspace, normalizedWorkspaceKey);
            const nextLayout = selectTabInPaneInLayout({
              layout,
              paneId: normalizedPaneId,
              tabId: normalizedTabId,
            });
            return nextLayout
              ? {
                  layoutByWorkspace: {
                    ...state.layoutByWorkspace,
                    [normalizedWorkspaceKey]: nextLayout,
                  },
                }
              : state;
          });
        },
        replaceTab: (workspaceKey, tabId, target, tabState) => {
          const normalizedWorkspaceKey = trimNonEmpty(workspaceKey);
          const normalizedTabId = trimNonEmpty(tabId);
          const normalizedTarget = normalizeWorkspaceTabTarget(target);
          if (!normalizedWorkspaceKey || !normalizedTabId || !normalizedTarget) return null;
          const result = replaceTabTargetInLayout({
            layout: getWorkspaceLayout(get().layoutByWorkspace, normalizedWorkspaceKey),
            tabId: normalizedTabId,
            target: normalizedTarget,
            createTabId: createWorkspaceTabInstanceId,
            state: tabState,
          });
          if (!result) return null;
          set((state) => ({
            ...withoutFocusRestoration(state, normalizedWorkspaceKey),
            hiddenAgentIdsByWorkspace:
              normalizedTarget.kind !== "agent"
                ? state.hiddenAgentIdsByWorkspace
                : removeAgentIdFromWorkspaceSet(
                    state.hiddenAgentIdsByWorkspace,
                    normalizedWorkspaceKey,
                    normalizedTarget.agentId,
                  ),
            layoutByWorkspace: {
              ...state.layoutByWorkspace,
              [normalizedWorkspaceKey]: result.layout,
            },
          }));
          return result.tabId;
        },
        setTabState: (workspaceKey, tabId, tabState) => {
          const normalizedWorkspaceKey = trimNonEmpty(workspaceKey);
          const normalizedTabId = trimNonEmpty(tabId);
          if (!normalizedWorkspaceKey || !normalizedTabId) return;
          set((state) => {
            const layout = setTabStateInLayout({
              layout: getWorkspaceLayout(state.layoutByWorkspace, normalizedWorkspaceKey),
              tabId: normalizedTabId,
              state: tabState,
            });
            if (!layout) return state;
            return {
              layoutByWorkspace: {
                ...state.layoutByWorkspace,
                [normalizedWorkspaceKey]: layout,
              },
            };
          });
        },
        convertDraftToAgent: (workspaceKey, tabId, agentId) => {
          const normalizedWorkspaceKey = trimNonEmpty(workspaceKey);
          const normalizedTabId = trimNonEmpty(tabId);
          const normalizedAgentId = trimNonEmpty(agentId);
          if (!normalizedWorkspaceKey || !normalizedTabId || !normalizedAgentId) {
            return null;
          }

          const result = convertDraftToAgentInLayout({
            layout: getWorkspaceLayout(get().layoutByWorkspace, normalizedWorkspaceKey),
            tabId: normalizedTabId,
            agentId: normalizedAgentId,
          });
          if (!result) {
            return null;
          }

          set((state) => ({
            ...(result.layout.focusedPaneId !== null
              ? (withoutFocusRestoration(state, normalizedWorkspaceKey) ?? {})
              : {}),
            hiddenAgentIdsByWorkspace: removeAgentIdFromWorkspaceSet(
              state.hiddenAgentIdsByWorkspace,
              normalizedWorkspaceKey,
              normalizedAgentId,
            ),
            layoutByWorkspace: {
              ...state.layoutByWorkspace,
              [normalizedWorkspaceKey]: result.layout,
            },
          }));

          return result.tabId;
        },
        reconcileTabs: (workspaceKey, snapshot) => {
          const normalizedWorkspaceKey = trimNonEmpty(workspaceKey);
          if (!normalizedWorkspaceKey) {
            return;
          }

          set((state) => {
            const rawLayout = getWorkspaceLayout(state.layoutByWorkspace, normalizedWorkspaceKey);
            const currentLayout = keepWorkspaceFocusOutOfExplorerSidebar(
              rawLayout,
              rawLayout.focusedPaneId,
            );
            const nextState = reconcileWorkspaceTabs(
              {
                layout: currentLayout,
                pinnedAgentIds: state.pinnedAgentIdsByWorkspace[normalizedWorkspaceKey] ?? null,
                pendingAgentIds: state.pendingAgentIdsByWorkspace[normalizedWorkspaceKey] ?? null,
                hiddenAgentIds: state.hiddenAgentIdsByWorkspace[normalizedWorkspaceKey] ?? null,
              },
              snapshot,
            );
            const nextLayout = keepWorkspaceFocusOutOfExplorerSidebar(
              nextState.layout,
              currentLayout.focusedPaneId,
            );
            if (nextLayout === rawLayout) {
              return state;
            }

            return {
              layoutByWorkspace: {
                ...state.layoutByWorkspace,
                [normalizedWorkspaceKey]: nextLayout,
              },
            };
          });
        },
        resolvePendingAgent: (workspaceKey, agentId) => {
          const normalizedWorkspaceKey = trimNonEmpty(workspaceKey);
          const normalizedAgentId = trimNonEmpty(agentId);
          if (!normalizedWorkspaceKey || !normalizedAgentId) {
            return;
          }

          set((state) => {
            const pendingAgentIdsByWorkspace = removeAgentIdFromWorkspaceSet(
              state.pendingAgentIdsByWorkspace,
              normalizedWorkspaceKey,
              normalizedAgentId,
            );
            if (pendingAgentIdsByWorkspace === state.pendingAgentIdsByWorkspace) {
              return state;
            }
            return { pendingAgentIdsByWorkspace };
          });
        },
        getWorkspaceTabs: (workspaceKey) => {
          const normalizedWorkspaceKey = trimNonEmpty(workspaceKey);
          if (!normalizedWorkspaceKey) {
            return [];
          }
          return collectAllTabs(
            getWorkspaceLayout(get().layoutByWorkspace, normalizedWorkspaceKey).root,
          );
        },
        focusPane: (workspaceKey, paneId) => {
          const normalizedWorkspaceKey = trimNonEmpty(workspaceKey);
          const normalizedPaneId = trimNonEmpty(paneId);
          if (!normalizedWorkspaceKey || !normalizedPaneId) {
            return;
          }

          set((state) => {
            const layout = getWorkspaceLayout(state.layoutByWorkspace, normalizedWorkspaceKey);
            if (findPaneById(layout.root, normalizedPaneId)?.hidden === true) return state;
            const nextLayout = focusPaneInLayout({
              layout,
              paneId: normalizedPaneId,
            });
            if (!nextLayout) {
              return state;
            }

            return {
              ...withoutFocusRestoration(state, normalizedWorkspaceKey),
              layoutByWorkspace: {
                ...state.layoutByWorkspace,
                [normalizedWorkspaceKey]: nextLayout,
              },
            };
          });
        },
        unfocusPane: (workspaceKey) => {
          const normalizedWorkspaceKey = trimNonEmpty(workspaceKey);
          if (!normalizedWorkspaceKey) {
            return null;
          }

          const token = ids.createFocusRestorationToken();
          set((state) => {
            const layout = getWorkspaceLayout(state.layoutByWorkspace, normalizedWorkspaceKey);
            const currentRestoration = state.focusRestorationByWorkspace[normalizedWorkspaceKey];
            const restorePaneId = currentRestoration?.restorePaneId ?? layout.focusedPaneId;

            return {
              focusRestorationByWorkspace: {
                ...state.focusRestorationByWorkspace,
                [normalizedWorkspaceKey]: {
                  restorePaneId,
                  tokens: [...(currentRestoration?.tokens ?? []), token],
                },
              },
              layoutByWorkspace: {
                ...state.layoutByWorkspace,
                [normalizedWorkspaceKey]:
                  layout.focusedPaneId === null ? layout : { ...layout, focusedPaneId: null },
              },
            };
          });
          return token;
        },
        restorePaneFocus: (workspaceKey, token) => {
          const normalizedWorkspaceKey = trimNonEmpty(workspaceKey);
          const normalizedToken = trimNonEmpty(token);
          if (!normalizedWorkspaceKey || !normalizedToken) {
            return;
          }

          set((state) => {
            const restoration = state.focusRestorationByWorkspace[normalizedWorkspaceKey];
            if (!restoration?.tokens.includes(normalizedToken)) {
              return state;
            }

            const nextTokens = restoration.tokens.filter((entry) => entry !== normalizedToken);
            const { [normalizedWorkspaceKey]: _removed, ...remainingRestorations } =
              state.focusRestorationByWorkspace;
            const layout = getWorkspaceLayout(state.layoutByWorkspace, normalizedWorkspaceKey);

            if (layout.focusedPaneId !== null) {
              return {
                focusRestorationByWorkspace: remainingRestorations,
              };
            }

            if (nextTokens.length > 0) {
              return {
                focusRestorationByWorkspace: {
                  ...remainingRestorations,
                  [normalizedWorkspaceKey]: {
                    restorePaneId: restoration.restorePaneId,
                    tokens: nextTokens,
                  },
                },
              };
            }

            const restorePane = findPaneById(layout.root, restoration.restorePaneId);
            const restorePaneId = restorePane?.hidden === true ? null : (restorePane?.id ?? null);
            if (!restorePaneId) {
              return {
                focusRestorationByWorkspace: remainingRestorations,
              };
            }

            return {
              focusRestorationByWorkspace: remainingRestorations,
              layoutByWorkspace: {
                ...state.layoutByWorkspace,
                [normalizedWorkspaceKey]: {
                  ...layout,
                  focusedPaneId: restorePaneId,
                },
              },
            };
          });
        },
        resizeExplorerSidebar: (workspaceKey, width) => {
          const normalizedWorkspaceKey = trimNonEmpty(workspaceKey);
          if (!normalizedWorkspaceKey || !Number.isFinite(width) || width <= 0) {
            return;
          }

          set((state) => ({
            explorerSidebarWidthByWorkspace: {
              ...state.explorerSidebarWidthByWorkspace,
              [normalizedWorkspaceKey]: width,
            },
          }));
        },
        unpinAgent: (workspaceKey, agentId) => {
          const normalizedWorkspaceKey = trimNonEmpty(workspaceKey);
          const normalizedAgentId = trimNonEmpty(agentId);
          if (!normalizedWorkspaceKey || !normalizedAgentId) {
            return;
          }

          set((state) => {
            const currentPinnedAgentIds =
              state.pinnedAgentIdsByWorkspace[normalizedWorkspaceKey] ?? null;
            if (!currentPinnedAgentIds?.has(normalizedAgentId)) {
              return state;
            }

            if (currentPinnedAgentIds.size === 1) {
              const nextPinnedAgentIdsByWorkspace = {
                ...state.pinnedAgentIdsByWorkspace,
              };
              delete nextPinnedAgentIdsByWorkspace[normalizedWorkspaceKey];
              return {
                pinnedAgentIdsByWorkspace: nextPinnedAgentIdsByWorkspace,
                pendingAgentIdsByWorkspace: removeAgentIdFromWorkspaceSet(
                  state.pendingAgentIdsByWorkspace,
                  normalizedWorkspaceKey,
                  normalizedAgentId,
                ),
              };
            }

            const nextPinnedAgentIds = new Set(currentPinnedAgentIds);
            nextPinnedAgentIds.delete(normalizedAgentId);

            return {
              pinnedAgentIdsByWorkspace: {
                ...state.pinnedAgentIdsByWorkspace,
                [normalizedWorkspaceKey]: nextPinnedAgentIds,
              },
              pendingAgentIdsByWorkspace: removeAgentIdFromWorkspaceSet(
                state.pendingAgentIdsByWorkspace,
                normalizedWorkspaceKey,
                normalizedAgentId,
              ),
            };
          });
        },
        hideAgent: (workspaceKey, agentId) => {
          const normalizedWorkspaceKey = trimNonEmpty(workspaceKey);
          const normalizedAgentId = trimNonEmpty(agentId);
          if (!normalizedWorkspaceKey || !normalizedAgentId) {
            return;
          }

          set((state) => {
            const nextHiddenAgentIdsByWorkspace = addAgentIdToWorkspaceSet(
              state.hiddenAgentIdsByWorkspace,
              normalizedWorkspaceKey,
              normalizedAgentId,
            );
            if (nextHiddenAgentIdsByWorkspace === state.hiddenAgentIdsByWorkspace) {
              return state;
            }

            return {
              hiddenAgentIdsByWorkspace: nextHiddenAgentIdsByWorkspace,
            };
          });
        },
        unhideAgent: (workspaceKey, agentId) => {
          const normalizedWorkspaceKey = trimNonEmpty(workspaceKey);
          const normalizedAgentId = trimNonEmpty(agentId);
          if (!normalizedWorkspaceKey || !normalizedAgentId) {
            return;
          }

          set((state) => {
            const nextHiddenAgentIdsByWorkspace = removeAgentIdFromWorkspaceSet(
              state.hiddenAgentIdsByWorkspace,
              normalizedWorkspaceKey,
              normalizedAgentId,
            );
            if (nextHiddenAgentIdsByWorkspace === state.hiddenAgentIdsByWorkspace) {
              return state;
            }

            return {
              hiddenAgentIdsByWorkspace: nextHiddenAgentIdsByWorkspace,
            };
          });
        },
        purgeWorkspace: (workspaceKey) => {
          const normalizedWorkspaceKey = trimNonEmpty(workspaceKey);
          if (!normalizedWorkspaceKey) {
            return;
          }

          set((state) => {
            const hasAny =
              normalizedWorkspaceKey in state.layoutByWorkspace ||
              normalizedWorkspaceKey in state.explorerSidebarWidthByWorkspace ||
              normalizedWorkspaceKey in state.pinnedAgentIdsByWorkspace ||
              normalizedWorkspaceKey in state.pendingAgentIdsByWorkspace ||
              normalizedWorkspaceKey in state.hiddenAgentIdsByWorkspace ||
              normalizedWorkspaceKey in state.focusRestorationByWorkspace;
            if (!hasAny) {
              return state;
            }
            const { [normalizedWorkspaceKey]: _layout, ...layoutByWorkspace } =
              state.layoutByWorkspace;
            const {
              [normalizedWorkspaceKey]: _explorerSidebarWidth,
              ...explorerSidebarWidthByWorkspace
            } = state.explorerSidebarWidthByWorkspace;
            const { [normalizedWorkspaceKey]: _pinned, ...pinnedAgentIdsByWorkspace } =
              state.pinnedAgentIdsByWorkspace;
            const { [normalizedWorkspaceKey]: _pending, ...pendingAgentIdsByWorkspace } =
              state.pendingAgentIdsByWorkspace;
            const { [normalizedWorkspaceKey]: _hidden, ...hiddenAgentIdsByWorkspace } =
              state.hiddenAgentIdsByWorkspace;
            const { [normalizedWorkspaceKey]: _restoration, ...focusRestorationByWorkspace } =
              state.focusRestorationByWorkspace;
            return {
              layoutByWorkspace,
              explorerSidebarWidthByWorkspace,
              pinnedAgentIdsByWorkspace,
              pendingAgentIdsByWorkspace,
              hiddenAgentIdsByWorkspace,
              focusRestorationByWorkspace,
            };
          });
        },
      }),
      {
        name: "workspace-layout-state",
        version: WORKSPACE_LAYOUT_PERSIST_VERSION,
        storage: createValidatedPersistStorage(AsyncStorage, WorkspaceLayoutPersistedStateSchema),
        migrate: (persistedState, version) =>
          migrateWorkspaceLayoutPersistedState(persistedState, version),
        partialize: (state) => {
          const layoutByWorkspace: Record<string, WorkspaceLayout> = {};
          for (const key in state.layoutByWorkspace) {
            // Strip ephemeral (commit diff) tabs before persisting so they are
            // dropped on reload rather than restored pointing at a rebased SHA.
            layoutByWorkspace[key] = stripEphemeralTabsFromLayout(
              normalizeLayout(state.layoutByWorkspace[key]),
            );
          }
          return {
            layoutByWorkspace,
            explorerSidebarWidthByWorkspace: state.explorerSidebarWidthByWorkspace,
          };
        },
        merge: (persistedState, currentState) => {
          const result = WorkspaceLayoutPersistedStateSchema.safeParse(persistedState);
          if (!result.success) {
            return currentState;
          }
          const layoutByWorkspace: Record<string, WorkspaceLayout> = {};
          for (const [workspaceKey, persistedLayout] of Object.entries(
            result.data.layoutByWorkspace,
          )) {
            layoutByWorkspace[workspaceKey] = restoreEmptyPanesInLayout(
              normalizeWorkspaceChatLayout(
                stripEphemeralTabsFromLayout(persistedLayout),
                (target, previousHost) =>
                  resolveWorkspaceTargetHost(workspaceKey, target, previousHost),
              ),
            );
          }
          return {
            ...currentState,
            layoutByWorkspace,
            explorerSidebarWidthByWorkspace:
              result.data.explorerSidebarWidthByWorkspace ??
              convertLegacyExplorerSidebarRatios(
                result.data.explorerSidebarRatioByWorkspace ??
                  result.data.sidePanelRatioByWorkspace ??
                  {},
              ),
          };
        },
      },
    ),
  );
}

export const useWorkspaceLayoutStore = createWorkspaceLayoutStore();

export function useWorkspaceLayoutStoreHydrated(): boolean {
  const [hasHydrated, setHasHydrated] = useState(() =>
    useWorkspaceLayoutStore.persist.hasHydrated(),
  );

  useEffect(() => {
    if (useWorkspaceLayoutStore.persist.hasHydrated()) {
      setHasHydrated(true);
      return;
    }

    return useWorkspaceLayoutStore.persist.onFinishHydration(() => {
      setHasHydrated(true);
    });
  }, []);

  return hasHydrated;
}
