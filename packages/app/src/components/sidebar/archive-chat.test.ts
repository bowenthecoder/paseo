import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  },
}));

import { findPaneById, useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { archiveSidebarChat } from "./archive-chat";

const SERVER_ID = "archive-host";
const WORKSPACE_ID = "archive-workspace";
const WORKSPACE_KEY = `${SERVER_ID}:${WORKSPACE_ID}`;

function openChat(agentId: string) {
  return useWorkspaceLayoutStore.getState().openTab({
    workspaceKey: WORKSPACE_KEY,
    target: { kind: "agent", agentId },
    intent: "reveal",
    pin: true,
  });
}

function focusedChatTab() {
  const layout = useWorkspaceLayoutStore.getState().layoutByWorkspace[WORKSPACE_KEY];
  return findPaneById(layout.root, "main")?.focusedTabId;
}

function pendingArchive() {
  let complete = () => {};
  const pending = new Promise<void>((resolve) => {
    complete = resolve;
  });
  const archiveAgent = vi.fn(() => pending);
  const operation = archiveSidebarChat({
    serverId: SERVER_ID,
    workspaceId: WORKSPACE_ID,
    agentId: "archived-chat",
    archiveAgent,
  });
  return { complete, operation, archiveAgent };
}

describe("sidebar chat archive", () => {
  beforeEach(async () => {
    await useWorkspaceLayoutStore.persist.rehydrate();
    useWorkspaceLayoutStore.setState({
      layoutByWorkspace: {},
      pinnedAgentIdsByWorkspace: {},
      pendingAgentIdsByWorkspace: {},
      hiddenAgentIdsByWorkspace: {},
      focusRestorationByWorkspace: {},
    });
  });

  it("closes a pinned current chat and selects its surviving chat before the RPC settles", async () => {
    const survivingTab = openChat("surviving-chat");
    openChat("archived-chat");

    const archive = pendingArchive();

    expect(focusedChatTab()).toBe(survivingTab);
    expect(
      findPaneById(useWorkspaceLayoutStore.getState().layoutByWorkspace[WORKSPACE_KEY].root, "main")
        ?.tabIds,
    ).toEqual([survivingTab]);
    expect(useWorkspaceLayoutStore.getState().pinnedAgentIdsByWorkspace[WORKSPACE_KEY]).toEqual(
      new Set(["surviving-chat"]),
    );
    expect(archive.archiveAgent).toHaveBeenCalledExactlyOnceWith({
      serverId: SERVER_ID,
      agentId: "archived-chat",
    });

    archive.complete();
    await archive.operation;
    expect(focusedChatTab()).toBe(survivingTab);
  });

  it("keeps an explicit History reopen when the original archive finishes later", async () => {
    openChat("surviving-chat");
    openChat("archived-chat");
    const archive = pendingArchive();

    const reopenedTab = openChat("archived-chat");
    archive.complete();
    await archive.operation;

    expect(focusedChatTab()).toBe(reopenedTab);
    expect(useWorkspaceLayoutStore.getState().pinnedAgentIdsByWorkspace[WORKSPACE_KEY]).toEqual(
      new Set(["surviving-chat", "archived-chat"]),
    );
    expect(
      useWorkspaceLayoutStore.getState().hiddenAgentIdsByWorkspace[WORKSPACE_KEY],
    ).toBeUndefined();
  });

  it("closes the archived chat's splits across this device while preserving other hosts and later reopens", async () => {
    const store = useWorkspaceLayoutStore.getState();
    const otherFolder = `${SERVER_ID}:other-folder`;
    const otherHost = "another-host:other-folder";
    openChat("archived-chat");
    for (const key of [otherFolder, otherHost]) {
      store.openTab({
        workspaceKey: key,
        target: { kind: "agent", agentId: "primary-chat" },
        intent: "reveal",
      });
      store.openTab({
        workspaceKey: key,
        target: { kind: "agent", agentId: "archived-chat", view: "split" },
        intent: "reveal",
        pin: true,
      });
    }
    const archive = pendingArchive();
    const hasArchivedChat = (key: string) =>
      useWorkspaceLayoutStore
        .getState()
        .getWorkspaceTabs(key)
        .some((tab) => tab.target.kind === "agent" && tab.target.agentId === "archived-chat");
    expect(hasArchivedChat(WORKSPACE_KEY)).toBe(false);
    expect(hasArchivedChat(otherFolder)).toBe(false);
    expect(hasArchivedChat(otherHost)).toBe(true);
    const reopened = store.openTab({
      workspaceKey: otherFolder,
      target: { kind: "agent", agentId: "archived-chat", view: "split" },
      intent: "reveal",
      pin: true,
    });
    archive.complete();
    await archive.operation;
    expect(hasArchivedChat(otherFolder)).toBe(true);
    expect(
      findPaneById(
        useWorkspaceLayoutStore.getState().layoutByWorkspace[otherFolder].root,
        "explorer",
      )?.focusedTabId,
    ).toBe(reopened);
  });

  it("leaves a newer chat selection alone after the archive completes", async () => {
    openChat("archived-chat");
    const archive = pendingArchive();
    const newerTab = openChat("newer-chat");

    archive.complete();
    await archive.operation;

    expect(focusedChatTab()).toBe(newerTab);
  });

  it("archives an inactive chat without changing the selected chat or side panel", async () => {
    openChat("archived-chat");
    const selectedTab = openChat("selected-chat");
    const store = useWorkspaceLayoutStore.getState();
    const fileTab = store.openTab({
      workspaceKey: WORKSPACE_KEY,
      target: { kind: "files" },
      intent: "reveal",
    });
    const before = findPaneById(
      useWorkspaceLayoutStore.getState().layoutByWorkspace[WORKSPACE_KEY].root,
      "explorer",
    );

    const archive = pendingArchive();
    archive.complete();
    await archive.operation;

    const after = useWorkspaceLayoutStore.getState().layoutByWorkspace[WORKSPACE_KEY];
    expect(focusedChatTab()).toBe(selectedTab);
    expect(findPaneById(after.root, "explorer")).toEqual(before);
    expect(findPaneById(after.root, "explorer")?.focusedTabId).toBe(fileTab);
  });

  it("keeps the empty chat shell after archiving its final chat", async () => {
    openChat("archived-chat");
    const archive = pendingArchive();
    archive.complete();
    await archive.operation;

    const pane = findPaneById(
      useWorkspaceLayoutStore.getState().layoutByWorkspace[WORKSPACE_KEY].root,
      "main",
    );
    const selectedTab = useWorkspaceLayoutStore
      .getState()
      .getWorkspaceTabs(WORKSPACE_KEY)
      .find((tab) => tab.tabId === pane?.focusedTabId);
    expect(pane?.tabIds).toHaveLength(1);
    expect(selectedTab?.target).toEqual({ kind: "new_tab" });
  });

  it("reports an archive failure without overriding a newer chat and permits reopening", async () => {
    openChat("archived-chat");
    const failure = new Error("Archive connection lost");
    let rejectArchive = (_error: Error) => {};
    const pending = new Promise<void>((_resolve, reject) => {
      rejectArchive = reject;
    });
    const operation = archiveSidebarChat({
      serverId: SERVER_ID,
      workspaceId: WORKSPACE_ID,
      agentId: "archived-chat",
      archiveAgent: () => pending,
    });
    const rejection = expect(operation).rejects.toBe(failure);
    const newerTab = openChat("newer-chat");

    rejectArchive(failure);
    await rejection;

    expect(focusedChatTab()).toBe(newerTab);
    const reopenedTab = openChat("archived-chat");
    expect(focusedChatTab()).toBe(reopenedTab);
  });
});
