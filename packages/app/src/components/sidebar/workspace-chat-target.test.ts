import { describe, expect, it } from "vitest";
import type { Agent } from "@/stores/session-store";
import { resolveWorkspaceActionAgent, resolveWorkspaceOpenTarget } from "./workspace-chat-target";

function chat(id: string, workspaceId = "shared-folder", archivedAt?: Date): Agent {
  return { id, workspaceId, archivedAt, parentAgentId: null } as Agent;
}

describe("sidebar individual chat targets", () => {
  const first = chat("first");
  const second = chat("second");
  const agents = new Map([
    [first.id, first],
    [second.id, second],
  ]);

  it("acts on the clicked chat while a different chat in the same workspace is focused", () => {
    expect(
      resolveWorkspaceActionAgent({
        agents,
        workspaceId: "shared-folder",
        agentId: "second",
        focusedTarget: { kind: "agent", agentId: "first" },
      }),
    ).toBe(second);
  });

  it("never falls back to a focused or sole sibling when the explicit chat is gone", () => {
    expect(
      resolveWorkspaceActionAgent({
        agents: new Map([[first.id, first]]),
        workspaceId: "shared-folder",
        agentId: "missing",
        focusedTarget: { kind: "agent", agentId: "first" },
      }),
    ).toBeNull();
  });

  it("rejects archived chats and chats from another workspace", () => {
    const archived = chat("archived", "shared-folder", new Date());
    const other = chat("other", "other-folder");
    const entries = new Map([
      [archived.id, archived],
      [other.id, other],
    ]);
    for (const agentId of [archived.id, other.id]) {
      expect(
        resolveWorkspaceActionAgent({
          agents: entries,
          workspaceId: "shared-folder",
          agentId,
        }),
      ).toBeNull();
    }
  });

  it("keeps ambiguous legacy workspace actions unavailable", () => {
    expect(resolveWorkspaceActionAgent({ agents, workspaceId: "shared-folder" })).toBeNull();
  });

  it("opens the requested chat in a split even if another agent is the first existing tab", () => {
    expect(
      resolveWorkspaceOpenTarget({
        agentId: "second",
        tabs: [
          {
            tabId: "first-tab",
            createdAt: 1,
            target: { kind: "agent", agentId: "first" },
          },
        ],
        draftId: () => {
          throw new Error("An explicit agent never creates a draft");
        },
      }),
    ).toEqual({ kind: "agent", agentId: "second" });
  });
});
