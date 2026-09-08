/**
 * @vitest-environment jsdom
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useActiveWorkspaceSelection } from "@/stores/navigation-active-workspace-store";
import { useWorkspaceFields } from "@/stores/session-store-hooks";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { useActiveSidebarShortcutTarget } from "./use-active-sidebar-shortcut-target";

vi.mock("@/stores/navigation-active-workspace-store", () => ({
  useActiveWorkspaceSelection: vi.fn(() => null),
}));
vi.mock("@/stores/session-store-hooks", () => ({
  useWorkspaceFields: vi.fn(() => null),
}));

describe("useActiveSidebarShortcutTarget", () => {
  beforeEach(() => {
    vi.mocked(useActiveWorkspaceSelection).mockReturnValue(null);
    vi.mocked(useWorkspaceFields).mockReturnValue(null);
    useWorkspaceLayoutStore.setState({ layoutByWorkspace: {} });
  });
  afterEach(cleanup);

  it("has no chat target on startup or settings routes without a workspace", () => {
    const { result } = renderHook(useActiveSidebarShortcutTarget);
    expect(result.current).toBeNull();
  });

  it("keeps the workspace target while its layout has not loaded", () => {
    vi.mocked(useActiveWorkspaceSelection).mockReturnValue({
      serverId: "srv",
      workspaceId: "shared-folder",
    });
    const { result } = renderHook(useActiveSidebarShortcutTarget);
    expect(result.current).toEqual({ serverId: "srv", workspaceId: "shared-folder" });
  });

  it("tracks focused chats in the same workspace without a route change", () => {
    vi.mocked(useActiveWorkspaceSelection).mockReturnValue({
      serverId: "srv",
      workspaceId: "shared-folder",
    });
    const workspaceKey = "srv:shared-folder";
    const firstTabId = useWorkspaceLayoutStore.getState().openTab({
      workspaceKey,
      target: { kind: "agent", agentId: "first-chat" },
      intent: "reveal",
    });
    const secondTabId = useWorkspaceLayoutStore.getState().openTab({
      workspaceKey,
      target: { kind: "agent", agentId: "second-chat" },
      intent: "background",
    });
    expect(firstTabId).toBeTruthy();
    expect(secondTabId).toBeTruthy();
    const { result } = renderHook(useActiveSidebarShortcutTarget);
    expect(result.current).toEqual({
      serverId: "srv",
      workspaceId: "shared-folder",
      agentId: "first-chat",
    });

    act(() => useWorkspaceLayoutStore.getState().focusTab(workspaceKey, secondTabId!));
    expect(result.current).toEqual({
      serverId: "srv",
      workspaceId: "shared-folder",
      agentId: "second-chat",
    });
  });

  it("uses the resolved workspace identity and clears the chat for non-chat tabs", () => {
    vi.mocked(useActiveWorkspaceSelection).mockReturnValue({
      serverId: "srv",
      workspaceId: "route-alias",
    });
    vi.mocked(useWorkspaceFields).mockReturnValue("shared-folder");
    const workspaceKey = "srv:shared-folder";
    useWorkspaceLayoutStore.getState().openTab({
      workspaceKey,
      target: { kind: "agent", agentId: "first-chat" },
      intent: "reveal",
    });
    const { result } = renderHook(useActiveSidebarShortcutTarget);
    expect(result.current?.agentId).toBe("first-chat");

    act(() => {
      useWorkspaceLayoutStore.getState().openTab({
        workspaceKey,
        target: { kind: "draft", draftId: "new-chat" },
        intent: "reveal",
      });
    });
    expect(result.current).toEqual({ serverId: "srv", workspaceId: "shared-folder" });
  });
});
