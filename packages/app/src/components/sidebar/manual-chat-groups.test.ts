import { describe, expect, it } from "vitest";
import type { AggregatedAgent } from "@/hooks/use-aggregated-agents";
import { EMPTY_CHAT_GROUPS, type SidebarChatGroupState } from "@/stores/sidebar-chat-groups-store";
import {
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
