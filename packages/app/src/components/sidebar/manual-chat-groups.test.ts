import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AggregatedAgent } from "@/hooks/use-aggregated-agents";
import { EMPTY_CHAT_GROUPS, type SidebarChatGroupState } from "@/stores/sidebar-chat-groups-store";
import { useSessionStore } from "@/stores/session-store";
import { createUserMessage } from "@/types/stream";
import {
  areManualChatActivitySessionsEqual,
  buildManualChatSections,
  buildManualChatEntries,
  resolveChatGroup,
  type ManualChatEntry,
} from "./manual-chat-groups";

function chat(id: string, folder = "/work/shop", serverId = "mac"): ManualChatEntry {
  return {
    agentId: id,
    workspaceKey: `${serverId}:chat:${id}`,
    serverId,
    workspaceId: id,
    projectViewKey: "repository",
    projectName: "Automatic repository name",
    projectRootPath: folder,
    workspaceDirectory: folder,
    workspaceDirectoryLabel: folder,
    projectKind: "git",
    workspaceKind: "local_checkout",
    name: id,
    title: id,
    pinnedAt: null,
    currentBranch: "main",
    statusBucket: "done",
    statusEnteredAt: null,
    archivingAt: null,
    diffStat: null,
    prHint: null,
    archiveHasUncommittedChanges: null,
    archiveUnpushedCommitCount: null,
    scripts: [],
    hasRunningScripts: false,
  };
}

describe("manual chat grouping", () => {
  const grouping: SidebarChatGroupState = {
    ...EMPTY_CHAT_GROUPS,
    groups: [
      { id: "shop", name: "Shop", folder: { serverId: "mac", path: "/work/shop/" } },
      { id: "nested", name: "Nested", folder: { serverId: "mac", path: "/work/shop/dashboard" } },
      { id: "remote", name: "VPS", folder: { serverId: "vps", path: "/work/shop" } },
    ],
  };

  it("projects individual root conversations without empty folders or child tasks", () => {
    const base: AggregatedAgent = {
      id: "one",
      serverId: "mac",
      serverLabel: "Local",
      title: "First chat",
      status: "idle",
      lastActivityAt: new Date(),
      cwd: "/work/shop",
      workspaceId: "shared",
      provider: "codex",
      createdAt: new Date(),
      labels: {},
      parentAgentId: null,
    };
    const rows = buildManualChatEntries(
      [
        base,
        { ...base, id: "two", title: "Second chat" },
        { ...base, id: "child", parentAgentId: "one" },
        { ...base, id: "archived", archivedAt: new Date() },
      ],
      new Map([
        ["mac:shared", chat("shared")],
        ["mac:empty", chat("empty")],
      ]),
    );
    expect(rows.map((row) => [row.agentId, row.workspaceId, row.title])).toEqual([
      ["one", "shared", "First chat"],
      ["two", "shared", "Second chat"],
    ]);
    expect(rows[0].workspaceKey).not.toBe(rows[1].workspaceKey);
  });

  it("starts ungrouped without manufacturing repository or host groups", () => {
    const sections = buildManualChatSections(
      [chat("one"), chat("two", "/elsewhere", "vps")],
      EMPTY_CHAT_GROUPS,
    );
    expect(sections.map((section) => section.name)).toEqual(["Pinned", "Ungrouped"]);
    expect(sections[1].rows).toHaveLength(2);
  });

  it("matches the actual machine and longest folder boundary", () => {
    expect(resolveChatGroup(chat("a"), grouping)).toBe("shop");
    expect(resolveChatGroup(chat("b", "/work/shop/dashboard/src"), grouping)).toBe("nested");
    expect(resolveChatGroup(chat("c", "/work/shopping"), grouping)).toBe("ungrouped");
    expect(resolveChatGroup(chat("d", "/work/shop", "vps"), grouping)).toBe("remote");
    expect(resolveChatGroup(chat("e", "/work/shop", "other"), grouping)).toBe("ungrouped");
  });

  it("preserves an explicit manual move or Ungrouped choice over automatic folder matching", () => {
    expect(
      resolveChatGroup(chat("a"), { ...grouping, assignments: { "mac:chat:a": "remote" } }),
    ).toBe("remote");
    expect(resolveChatGroup(chat("a"), { ...grouping, assignments: { "mac:chat:a": null } })).toBe(
      "ungrouped",
    );
    expect(
      resolveChatGroup(chat("a"), { ...grouping, assignments: { "mac:chat:a": "removed" } }),
    ).toBe("ungrouped");
  });

  it("groups an isolated worktree by its selected source repository", () => {
    const entry = {
      ...chat("worktree"),
      workspaceDirectory: "/agent-worktrees/task-42",
      projectRootPath: "/work/shop",
    };
    expect(resolveChatGroup(entry, grouping)).toBe("shop");
  });

  it("hoists pinned chats once and restores group membership when unpinned", () => {
    const entry = chat("a");
    const pinned = { ...grouping, pinned: { [entry.workspaceKey]: "2026-09-08T20:00:00Z" } };
    const sections = buildManualChatSections([entry], pinned);
    expect(sections[0].rows).toEqual([entry]);
    expect(sections.slice(1).flatMap((section) => section.rows)).toEqual([]);
    expect(buildManualChatSections([entry], grouping)[1].rows).toHaveLength(1);
  });

  it("keeps two chats in one workspace independently pinned and grouped", () => {
    const first = { ...chat("first"), workspaceId: "shared" };
    const second = { ...chat("second"), workspaceId: "shared" };
    const state = {
      ...grouping,
      pinned: { [first.workspaceKey]: "2026-09-08" },
      assignments: { [second.workspaceKey]: null },
    };
    const sections = buildManualChatSections([first, second], state);
    expect(sections[0].rows.map((row) => row.agentId)).toEqual(["first"]);
    expect(sections.at(-1)!.rows.map((row) => row.agentId)).toEqual(["second"]);
  });

  it("honors explicitly created group defaults until a chat is moved manually", () => {
    const state = { ...grouping, workspaceDefaults: { "mac:a": "remote" } };
    expect(resolveChatGroup(chat("a"), state)).toBe("remote");
    expect(resolveChatGroup(chat("a"), { ...state, assignments: { "mac:chat:a": null } })).toBe(
      "ungrouped",
    );
  });

  it("keeps moved row ordering and collapse state independent of host refresh order", () => {
    const state = {
      ...grouping,
      order: { shop: ["mac:chat:b", "mac:chat:a"] },
      collapsed: { shop: true },
    };
    const group = buildManualChatSections([chat("a"), chat("c"), chat("b")], state)[1];
    expect(group.rows.map((row) => row.workspaceId)).toEqual(["b", "a", "c"]);
    expect(group.collapsed).toBe(true);
  });
});

describe("manual chat activity", () => {
  const serverId = "manual-chat-activity";
  const agentId = "follow-up";
  const clientMessageId = "follow-up-message";
  const timestamp = new Date("2026-09-08T20:00:00.000Z");
  const agent: AggregatedAgent = {
    id: agentId,
    serverId,
    serverLabel: "Local",
    title: "Follow-up chat",
    status: "idle",
    lastActivityAt: timestamp,
    cwd: "/work/shop",
    workspaceId: "workspace",
    provider: "codex",
    createdAt: timestamp,
    labels: {},
    parentAgentId: null,
  };
  const workspaces = new Map([
    [`${serverId}:workspace`, chat("workspace", "/work/shop", serverId)],
  ]);

  beforeEach(() => useSessionStore.getState().initializeSession(serverId, null));
  afterEach(() => useSessionStore.getState().clearSession(serverId));

  function beginSubmission(id = agentId) {
    useSessionStore
      .getState()
      .beginAgentMessageSubmission(
        serverId,
        id,
        createUserMessage({ clientMessageId, text: "Keep working", timestamp }),
      );
  }

  function statuses(agents = [agent]) {
    return buildManualChatEntries(agents, workspaces, useSessionStore.getState().sessions).map(
      (row) => row.statusBucket,
    );
  }

  it.each([
    ["turn", "response", "snapshot"],
    ["response", "turn", "snapshot"],
    ["response", "snapshot", "turn"],
  ])("keeps activity through %s → %s → %s and settles with the turn", (...ordering) => {
    const store = useSessionStore.getState();
    const observed = [];
    expect(statuses()).toEqual(["done"]);
    beginSubmission();
    observed.push(statuses());
    for (const step of ordering) {
      if (step === "response") {
        store.acceptAgentMessageSubmission(serverId, agentId, clientMessageId);
      } else if (step === "turn") {
        store.applyAgentTurnLiveness(serverId, agentId, {
          type: "stream_open",
          turn: { turnId: "turn-2", startedAt: timestamp },
        });
      } else {
        store.applyAgentTurnLiveness(serverId, agentId, {
          type: "snapshot",
          activeTurn: { turnId: "turn-2", startedAt: timestamp },
        });
      }
      observed.push(statuses());
    }
    store.setAgentStreamState(serverId, agentId, {
      acknowledgedClientMessageIds: [clientMessageId],
    });
    observed.push(statuses());
    expect(observed).toEqual([["running"], ["running"], ["running"], ["running"], ["running"]]);
    store.applyAgentTurnLiveness(serverId, agentId, [
      { type: "stream_close", turnId: "turn-2" },
      { type: "snapshot", activeTurn: null },
    ]);
    expect(statuses()).toEqual(["done"]);
  });

  it("clears rejected activity without lighting another chat in the workspace", () => {
    const sibling = { ...agent, id: "sibling" };
    beginSubmission();
    expect(statuses([agent, sibling])).toEqual(["running", "done"]);
    useSessionStore.getState().rejectAgentMessageSubmission(serverId, agentId, clientMessageId);
    expect(statuses([agent, sibling])).toEqual(["done", "done"]);
  });

  it("updates the collection with the optimistic row and ignores unrelated stream changes", () => {
    const notifications: Array<{ status: string; hasOptimisticRow: boolean }> = [];
    const unsubscribe = useSessionStore.subscribe(
      (state) => state.sessions,
      (sessions) => {
        notifications.push({
          status: buildManualChatEntries([agent], workspaces, sessions)[0].statusBucket,
          hasOptimisticRow:
            sessions[serverId].agentStreamTail.get(agentId)?.[0]?.kind === "user_message",
        });
      },
      { equalityFn: areManualChatActivitySessionsEqual },
    );
    try {
      beginSubmission();
      useSessionStore.getState().setIsPlayingAudio(serverId, true);
      useSessionStore.getState().setAgentStreamState(serverId, "other-agent", {
        tail: [{ kind: "assistant_message", id: "chunk", text: "Streaming", timestamp }],
      });
      expect(notifications).toEqual([{ status: "running", hasOptimisticRow: true }]);

      useSessionStore.getState().rejectAgentMessageSubmission(serverId, agentId, clientMessageId);
      expect(notifications).toEqual([
        { status: "running", hasOptimisticRow: true },
        { status: "done", hasOptimisticRow: false },
      ]);
    } finally {
      unsubscribe();
    }
  });

  it("keeps permission and error indicators above activity and completion attention", () => {
    const agents: AggregatedAgent[] = [
      { ...agent, id: "permission", pendingPermissionCount: 1 },
      { ...agent, id: "failed", status: "error" },
      { ...agent, id: "error-attention", attentionReason: "error", requiresAttention: true },
      { ...agent, id: "finished", attentionReason: "finished", requiresAttention: true },
    ];
    for (const entry of agents) beginSubmission(entry.id);
    expect(statuses(agents)).toEqual(["needs_input", "failed", "failed", "running"]);
  });
});
