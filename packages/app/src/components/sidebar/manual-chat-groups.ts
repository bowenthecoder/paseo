import type { AggregatedAgent } from "@/hooks/use-aggregated-agents";
import { selectAgentTurnPresentation, type SessionState } from "@/stores/session-store";
import {
  aggregateSidebarStateBuckets,
  deriveSidebarStateBucket,
} from "@/utils/sidebar-agent-state";
import { isWorkspaceRootAgent } from "@/subagents/workspace-root-policy";
import type { SidebarWorkspaceEntry } from "@/hooks/use-sidebar-workspaces-list";
import {
  PINNED_CHAT_GROUP,
  UNGROUPED_CHATS,
  type SidebarChatGroupState,
  type ChatGroupFolder,
} from "@/stores/sidebar-chat-groups-store";

export interface ManualChatEntry extends SidebarWorkspaceEntry {
  agentId: string;
}

export function areManualChatActivitySessionsEqual(
  previous: Readonly<Record<string, SessionState>>,
  next: Readonly<Record<string, SessionState>>,
): boolean {
  if (previous === next) return true;
  const serverIds = Object.keys(next);
  if (Object.keys(previous).length !== serverIds.length) return false;
  return serverIds.every(
    (serverId) =>
      previous[serverId]?.agentTurnLiveness === next[serverId].agentTurnLiveness &&
      previous[serverId]?.messageSubmissions === next[serverId].messageSubmissions,
  );
}

export function buildManualChatEntries(
  agents: readonly AggregatedAgent[],
  workspaces: ReadonlyMap<string, SidebarWorkspaceEntry>,
  sessions: Readonly<Record<string, SessionState>> = {},
): ManualChatEntry[] {
  const agentsById = new Map(agents.map((agent) => [`${agent.serverId}:${agent.id}`, agent]));
  return agents.flatMap((agent) => {
    if (
      agent.archivedAt ||
      !isWorkspaceRootAgent(agent, agentsById.get(`${agent.serverId}:${agent.parentAgentId}`))
    )
      return [];
    const workspace = workspaces.get(`${agent.serverId}:${agent.workspaceId}`);
    if (!workspace) return [];
    const authoritativeBucket = deriveSidebarStateBucket(agent);
    const turnActive = selectAgentTurnPresentation(sessions[agent.serverId], agent.id).isActive;
    const statusBucket = turnActive
      ? aggregateSidebarStateBuckets([authoritativeBucket, "running"])
      : authoritativeBucket;
    return [
      {
        ...workspace,
        agentId: agent.id,
        workspaceKey: `${agent.serverId}:chat:${agent.id}`,
        name: agent.title ?? "Untitled chat",
        title: agent.title,
        workspaceDirectory: agent.cwd,
        workspaceDirectoryLabel: agent.cwd,
        pinnedAt: null,
        statusBucket,
        statusEnteredAt: agent.lastActivityAt,
      },
    ];
  });
}

export interface ManualChatSection {
  id: string;
  name: string;
  folder: ChatGroupFolder | null;
  rows: ManualChatEntry[];
  collapsed: boolean;
}

function normalizeFolder(path: string): string {
  return path.replaceAll("\\", "/").replace(/\/+$/, "") || "/";
}

export function resolveChatGroup(
  workspace: Pick<
    SidebarWorkspaceEntry,
    "workspaceKey" | "workspaceId" | "serverId" | "workspaceDirectory" | "projectRootPath"
  >,
  state: SidebarChatGroupState,
): string {
  if (Object.hasOwn(state.assignments, workspace.workspaceKey)) {
    const id = state.assignments[workspace.workspaceKey];
    return state.groups.some((group) => group.id === id) ? id! : UNGROUPED_CHATS;
  }
  const defaultGroup = state.workspaceDefaults[`${workspace.serverId}:${workspace.workspaceId}`];
  if (state.groups.some((group) => group.id === defaultGroup)) return defaultGroup;
  const paths = [workspace.workspaceDirectory, workspace.projectRootPath]
    .filter((path): path is string => Boolean(path))
    .map(normalizeFolder);
  // Only folders a person explicitly associates with a group can group a chat automatically.
  const matching = state.groups
    .filter(({ folder }) => {
      if (!folder || folder.serverId !== workspace.serverId) return false;
      const root = normalizeFolder(folder.path);
      return paths.some(
        (path) => path === root || path.startsWith(root === "/" ? root : `${root}/`),
      );
    })
    .sort((a, b) => b.folder!.path.length - a.folder!.path.length);
  return matching[0]?.id ?? UNGROUPED_CHATS;
}

export function buildManualChatSections(
  workspaces: readonly ManualChatEntry[],
  state: SidebarChatGroupState,
): ManualChatSection[] {
  const sections: ManualChatSection[] = [
    {
      id: PINNED_CHAT_GROUP,
      name: "Pinned",
      folder: null,
      rows: [],
      collapsed: Boolean(state.collapsed[PINNED_CHAT_GROUP]),
    },
    ...state.groups.map((group) => ({
      ...group,
      rows: [] as ManualChatEntry[],
      collapsed: Boolean(state.collapsed[group.id]),
    })),
    {
      id: UNGROUPED_CHATS,
      name: "Ungrouped",
      folder: null,
      rows: [],
      collapsed: Boolean(state.collapsed[UNGROUPED_CHATS]),
    },
  ];
  const byId = new Map(sections.map((section) => [section.id, section]));
  for (const workspace of workspaces) {
    const id = state.pinned[workspace.workspaceKey]
      ? PINNED_CHAT_GROUP
      : resolveChatGroup(workspace, state);
    byId.get(id)!.rows.push(workspace);
  }
  for (const section of sections) {
    const ordering = new Map((state.order[section.id] ?? []).map((key, index) => [key, index]));
    section.rows.sort((a, b) => {
      if (ordering.has(a.workspaceKey) || ordering.has(b.workspaceKey)) {
        return (
          (ordering.get(a.workspaceKey) ?? Infinity) - (ordering.get(b.workspaceKey) ?? Infinity)
        );
      }
      if (section.id === PINNED_CHAT_GROUP)
        return (state.pinned[b.workspaceKey] ?? "").localeCompare(
          state.pinned[a.workspaceKey] ?? "",
        );
      return (b.statusEnteredAt?.getTime() ?? 0) - (a.statusEnteredAt?.getTime() ?? 0);
    });
  }
  return sections;
}
