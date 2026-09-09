import { describe, expect, it } from "vitest";
import { describeChatDrop, isChatDragPayload, useChatDragStore } from "./chat-drag-store";

describe("chat drag store", () => {
  it("recognises only complete chat payloads", () => {
    expect(
      isChatDragPayload({
        kind: "chat",
        workspaceKey: "srv:wks",
        serverId: "srv",
        workspaceId: "wks",
        agentId: "agent",
        title: "Fix sidebar",
      }),
    ).toBe(true);
    expect(isChatDragPayload({ kind: "chat", workspaceKey: "srv:wks" })).toBe(false);
    expect(isChatDragPayload({ groupId: "pinned" })).toBe(false);
    expect(isChatDragPayload(null)).toBe(false);
  });

  it("names the split action or repeats the refusal reason", () => {
    expect(
      describeChatDrop({
        title: "Fix sidebar",
        availability: { available: true, workspaceKey: "srv:wks", parentTabId: "tab" },
      }),
    ).toEqual({ enabled: true, label: 'Open "Fix sidebar" in split view' });
    expect(
      describeChatDrop({
        title: "  ",
        availability: { available: true, workspaceKey: "srv:wks", parentTabId: "tab" },
      }),
    ).toEqual({ enabled: true, label: "Open in split view" });
    expect(
      describeChatDrop({
        title: "Fix sidebar",
        availability: {
          available: false,
          reason: "Four chat views are already open. Close a view first.",
        },
      }),
    ).toEqual({
      enabled: false,
      label: "Four chat views are already open. Close a view first.",
    });
  });

  it("tracks the active drag", () => {
    const payload = {
      kind: "chat" as const,
      workspaceKey: "srv:wks",
      serverId: "srv",
      workspaceId: "wks",
      agentId: "agent",
      title: "Fix sidebar",
    };
    useChatDragStore.getState().setActiveDrag(payload);
    expect(useChatDragStore.getState().activeDrag).toEqual(payload);
    useChatDragStore.getState().setActiveDrag(null);
    expect(useChatDragStore.getState().activeDrag).toBeNull();
  });
});
