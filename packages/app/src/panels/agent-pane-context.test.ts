import { describe, expect, it, vi } from "vitest";
import type { PaneContextValue } from "@/panels/pane-context";
import { createAgentPaneContext } from "./agent-pane-context";

function createContext(overrides: Partial<PaneContextValue> = {}): PaneContextValue {
  return {
    serverId: "remote-host",
    workspaceId: "parent-worktree",
    host: "explorer",
    tabId: "agent_child",
    target: { kind: "agent", agentId: "child" },
    openTab: vi.fn(),
    closeCurrentTab: vi.fn(),
    retargetCurrentTab: vi.fn(),
    setCurrentTabState: vi.fn(),
    openFileInWorkspace: vi.fn(),
    openImportSheet: vi.fn(),
    ...overrides,
  };
}

describe("managed child pane context", () => {
  it("opens the child's relative document through the parent layout with its own absolute path", () => {
    const parent = createContext();
    const child = createAgentPaneContext(parent, {
      workspaceId: "child-worktree",
      cwd: "/srv/child-worktree",
    });
    child.openFileInWorkspace({
      location: { path: "guide.md", lineStart: 3, lineEnd: 8 },
      disposition: "side",
    });
    expect(parent.openFileInWorkspace).toHaveBeenCalledWith({
      location: { path: "/srv/child-worktree/guide.md", lineStart: 3, lineEnd: 8 },
      disposition: "side",
    });
    expect(child.serverId).toBe("remote-host");
    expect(child.workspaceId).toBe("child-worktree");
    expect(child.layoutWorkspaceId).toBe("parent-worktree");
    child.openTab({ kind: "subagents", parentAgentId: "child" });
    expect(parent.openTab).toHaveBeenCalledWith({ kind: "subagents", parentAgentId: "child" });
    expect(child.closeCurrentTab).toBe(parent.closeCurrentTab);
    expect(parent.workspaceId).toBe("parent-worktree");
  });

  it.each([
    ["/srv/child-worktree", "review %20 notes.md", "/srv/child-worktree/review %20 notes.md"],
    ["/srv/child-worktree", "../shared/notes.txt", "/srv/shared/notes.txt"],
    ["C:\\child-worktree", "docs\\guide.md", "C:/child-worktree/docs/guide.md"],
    ["/", "etc/hosts", "/etc/hosts"],
    ["/srv/child-worktree", "/other/guide.md", "/other/guide.md"],
    ["/srv/child-worktree", "~/notes.md", "~/notes.md"],
  ])("anchors %s + %s without URL-decoding a host path", (cwd, path, expectedPath) => {
    const parent = createContext();
    const child = createAgentPaneContext(parent, { workspaceId: "child-worktree", cwd });
    child.openFileInWorkspace({ location: { path }, disposition: "preferred" });
    expect(parent.openFileInWorkspace).toHaveBeenCalledWith({
      location: { path: expectedPath },
      disposition: "preferred",
    });
  });

  it("anchors a child's cwd even when it is a subdirectory of the parent's workspace", () => {
    const parent = createContext();
    const child = createAgentPaneContext(parent, {
      workspaceId: parent.workspaceId,
      cwd: "/srv/parent-worktree/packages/app",
    });
    child.openFileInWorkspace({ location: { path: "guide.md" }, disposition: "side" });
    expect(parent.openFileInWorkspace).toHaveBeenCalledWith({
      location: { path: "/srv/parent-worktree/packages/app/guide.md" },
      disposition: "side",
    });
  });

  it("anchors a split main chat to its own folder and keeps the layout workspace", () => {
    const parent = createContext({ host: "main" });
    const chat = createAgentPaneContext(parent, {
      workspaceId: "other-worktree",
      cwd: "/srv/other",
    });
    chat.openFileInWorkspace({ location: { path: "guide.md" }, disposition: "side" });
    expect(parent.openFileInWorkspace).toHaveBeenCalledWith({
      location: { path: "/srv/other/guide.md" },
      disposition: "side",
    });
    expect(chat.workspaceId).toBe("other-worktree");
    expect(chat.layoutWorkspaceId).toBe("parent-worktree");
    expect(createAgentPaneContext(parent, null)).toBe(parent);
  });

  it("keeps legacy host file requests anchored even before workspace ownership is hydrated", () => {
    const parent = createContext();
    const child = createAgentPaneContext(parent, { cwd: "/srv/child-worktree" });
    child.openFileInWorkspace({ location: { path: "guide.md" }, disposition: "side" });
    expect(parent.openFileInWorkspace).toHaveBeenCalledWith({
      location: { path: "/srv/child-worktree/guide.md" },
      disposition: "side",
    });
    expect(child.workspaceId).toBe(parent.workspaceId);
  });

  it("opens child Changes in the parent's dock with the child's worktree binding", () => {
    const parent = createContext();
    const child = createAgentPaneContext(parent, {
      workspaceId: "child-worktree",
      cwd: "/srv/child-worktree",
    });
    child.openTab({ kind: "working_diff", focusPath: "child.ts", focusRequestId: 1 });
    expect(parent.openTab).toHaveBeenCalledWith({
      kind: "working_diff",
      workspaceId: "child-worktree",
      focusPath: "child.ts",
      focusRequestId: 1,
    });
  });

  it("preserves explicit Changes bindings and shared-workspace Changes identity", () => {
    const parent = createContext();
    const child = createAgentPaneContext(parent, {
      workspaceId: parent.workspaceId,
      cwd: "/srv/parent-worktree/packages/app",
    });
    child.openTab({ kind: "working_diff" });
    child.openTab({ kind: "working_diff", workspaceId: "explicit-other-worktree" });
    expect(parent.openTab).toHaveBeenNthCalledWith(1, { kind: "working_diff" });
    expect(parent.openTab).toHaveBeenNthCalledWith(2, {
      kind: "working_diff",
      workspaceId: "explicit-other-worktree",
    });
  });

  it("anchors native subagent documents using the descriptor's cwd", () => {
    const parent = createContext({
      target: { kind: "provider_subagent", parentAgentId: "child", subagentId: "native-task" },
    });
    const native = createAgentPaneContext(parent, {
      workspaceId: "child-worktree",
      cwd: "/srv/native-task-worktree",
    });
    native.openFileInWorkspace({ location: { path: "guide.md" }, disposition: "preferred" });
    expect(parent.openFileInWorkspace).toHaveBeenCalledWith({
      location: { path: "/srv/native-task-worktree/guide.md" },
      disposition: "preferred",
    });
  });

  it("does not reinterpret an unanchored relative path in the parent folder", () => {
    const parent = createContext();
    const child = createAgentPaneContext(parent, { workspaceId: "child-worktree", cwd: "unknown" });
    child.openFileInWorkspace({ location: { path: "guide.md" }, disposition: "side" });
    expect(parent.openFileInWorkspace).not.toHaveBeenCalled();
  });
});
