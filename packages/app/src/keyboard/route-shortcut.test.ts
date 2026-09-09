import { describe, expect, it, vi } from "vitest";
import { resolveKeyboardShortcut } from "./keyboard-shortcuts";
import {
  dispatchKeyboardShortcutAction,
  routeKeyboardShortcut,
  type ShortcutAction,
  type ShortcutRoutingContext,
} from "./route-shortcut";

const ESCAPE_EVENT = {
  key: "Escape",
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
};

describe("dispatchKeyboardShortcutAction — Escape priority", () => {
  const closeAction = { id: "workspace.sidePanel.close", scope: "workspace" } as const;

  it("closes an open side panel without also interrupting the agent", () => {
    const dispatcher = { dispatch: vi.fn().mockReturnValue(true) };
    expect(dispatchKeyboardShortcutAction(closeAction, dispatcher, ESCAPE_EVENT)).toBe(true);
    expect(dispatcher.dispatch.mock.calls).toEqual([[closeAction]]);
  });

  it("interrupts the agent when the default Escape action has no open panel to close", () => {
    const resolved = resolveKeyboardShortcut({
      event: { ...ESCAPE_EVENT, code: "Escape", repeat: false },
      context: { isMac: false, isDesktop: false, focusScope: "other", commandCenterOpen: false },
      chordState: { candidateIndices: [], step: 0, timeoutId: null },
      onChordReset: () => undefined,
    });
    expect(resolved.match).not.toBeNull();
    const routed = routeKeyboardShortcut(resolved.match!, makeCtx());
    expect(routed.kind).toBe("dispatch");
    if (routed.kind !== "dispatch") throw new Error("Escape did not resolve to a dispatch");
    const dispatcher = { dispatch: vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true) };
    expect(dispatchKeyboardShortcutAction(routed.action, dispatcher, ESCAPE_EVENT)).toBe(true);
    expect(dispatcher.dispatch.mock.calls).toEqual([
      [closeAction],
      [{ id: "agent.interrupt", scope: "global" }],
    ]);
  });

  it("leaves Escape unhandled when neither a panel nor an interrupt accepts it", () => {
    const dispatcher = { dispatch: vi.fn().mockReturnValue(false) };
    expect(dispatchKeyboardShortcutAction(closeAction, dispatcher, ESCAPE_EVENT)).toBe(false);
    expect(dispatcher.dispatch).toHaveBeenCalledTimes(2);
  });

  it.each([
    { ...ESCAPE_EVENT, key: "w" },
    { ...ESCAPE_EVENT, altKey: true },
    { ...ESCAPE_EVENT, ctrlKey: true },
    { ...ESCAPE_EVENT, metaKey: true },
    { ...ESCAPE_EVENT, shiftKey: true },
    null,
  ])("does not interrupt for a rebound or non-keyboard close command (%j)", (event) => {
    const dispatcher = { dispatch: vi.fn().mockReturnValue(false) };
    expect(dispatchKeyboardShortcutAction(closeAction, dispatcher, event)).toBe(false);
    expect(dispatcher.dispatch.mock.calls).toEqual([[closeAction]]);
  });

  it("does not fall through from an unrelated action", () => {
    const action = { id: "message-input.focus", scope: "message-input" } as const;
    const dispatcher = { dispatch: vi.fn().mockReturnValue(false) };
    expect(dispatchKeyboardShortcutAction(action, dispatcher, ESCAPE_EVENT)).toBe(false);
    expect(dispatcher.dispatch.mock.calls).toEqual([[action]]);
  });
});

const SIDEBAR_TARGETS = [
  { serverId: "srv", workspaceId: "ws-1" },
  { serverId: "srv", workspaceId: "ws-2" },
  { serverId: "srv", workspaceId: "ws-3" },
  { serverId: "srv", workspaceId: "ws-4" },
  { serverId: "srv", workspaceId: "ws-5" },
] as const;

function makeCtx(overrides: Partial<ShortcutRoutingContext> = {}): ShortcutRoutingContext {
  return {
    pathname: "/h/srv/workspace/ws-2",
    isMobile: false,
    sidebarShortcutTargets: SIDEBAR_TARGETS,
    navigationActiveWorkspace: null,
    commandCenterOpen: false,
    shortcutsDialogOpen: false,
    ...overrides,
  };
}

describe("routeKeyboardShortcut — dispatch passthroughs", () => {
  it.each([
    ["agent.interrupt", { id: "agent.interrupt", scope: "global" }],
    ["workspace.tab.target.agent", { id: "workspace.tab.target.agent", scope: "workspace" }],
    ["workspace.tab.target.browser", { id: "workspace.tab.target.browser", scope: "workspace" }],
    ["workspace.tab.target.changes", { id: "workspace.tab.target.changes", scope: "workspace" }],
    ["workspace.tab.target.files", { id: "workspace.tab.target.files", scope: "workspace" }],
    ["workspace.new", { id: "workspace.new", scope: "sidebar" }],
    ["workspace.project.pick", { id: "workspace.project.pick", scope: "workspace" }],
    ["workspace.archive", { id: "workspace.archive", scope: "sidebar" }],
    ["workspace.pin", { id: "workspace.pin", scope: "sidebar" }],
    ["worktree.new", { id: "worktree.new", scope: "sidebar" }],
    ["workspace.terminal.new", { id: "workspace.terminal.new", scope: "workspace" }],
    ["workspace.sidePanel.close", { id: "workspace.sidePanel.close", scope: "workspace" }],
    ["workspace.tab.close.current", { id: "workspace.tab.close-current", scope: "workspace" }],
    ["sidebar.toggle.right", { id: "sidebar.toggle.right", scope: "sidebar" }],
    ["view.toggle.focus", { id: "workspace.focus.toggle", scope: "workspace" }],
  ])("%s → dispatch %j", (action, expected) => {
    expect(routeKeyboardShortcut({ action, payload: null }, makeCtx())).toEqual({
      kind: "dispatch",
      action: expected,
    });
  });

  it("closes desktop settings when Escape routes through agent interrupt", () => {
    expect(
      routeKeyboardShortcut(
        { action: "agent.interrupt", payload: null },
        makeCtx({ pathname: "/settings/general" }),
      ),
    ).toEqual<ShortcutAction>({ kind: "navigate-last-workspace" });
  });

  it.each([
    { isMac: false, isDesktop: false },
    { isMac: true, isDesktop: true },
  ])("closes settings using the actual default Escape binding (%j)", (platform) => {
    const resolved = resolveKeyboardShortcut({
      event: {
        key: "Escape",
        code: "Escape",
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        repeat: false,
      },
      context: { ...platform, focusScope: "other", commandCenterOpen: false },
      chordState: { candidateIndices: [], step: 0, timeoutId: null },
      onChordReset: () => undefined,
    });

    expect(resolved.match).not.toBeNull();
    expect(
      routeKeyboardShortcut(resolved.match!, makeCtx({ pathname: "/settings/general" })),
    ).toEqual<ShortcutAction>({ kind: "navigate-last-workspace" });
  });

  it("keeps agent interrupt behavior on compact settings layouts", () => {
    expect(
      routeKeyboardShortcut(
        { action: "agent.interrupt", payload: null },
        makeCtx({ pathname: "/settings/general", isMobile: true }),
      ),
    ).toEqual<ShortcutAction>({
      kind: "dispatch",
      action: { id: "agent.interrupt", scope: "global" },
    });
  });
});

describe("routeKeyboardShortcut — workspace.navigate.index", () => {
  it("opens the numbered chat when several targets share a workspace", () => {
    const chatTargets = ["first", "second"].map((agentId) => ({
      serverId: "srv",
      workspaceId: "shared-folder",
      agentId,
    }));
    expect(
      routeKeyboardShortcut(
        { action: "workspace.navigate.index", payload: { index: 2 } },
        makeCtx({ sidebarShortcutTargets: chatTargets }),
      ),
    ).toEqual<ShortcutAction>({
      kind: "navigate-workspace",
      serverId: "srv",
      workspaceId: "shared-folder",
      agentId: "second",
    });
  });

  it("navigates to the sidebar target at index-1", () => {
    expect(
      routeKeyboardShortcut(
        { action: "workspace.navigate.index", payload: { index: 4 } },
        makeCtx(),
      ),
    ).toEqual<ShortcutAction>({
      kind: "navigate-workspace",
      serverId: "srv",
      workspaceId: "ws-4",
    });
  });

  it("returns none when the target index is out of range", () => {
    expect(
      routeKeyboardShortcut(
        { action: "workspace.navigate.index", payload: { index: 99 } },
        makeCtx(),
      ),
    ).toEqual<ShortcutAction>({ kind: "none" });
  });

  it("returns none when the index payload is missing", () => {
    expect(
      routeKeyboardShortcut({ action: "workspace.navigate.index", payload: null }, makeCtx()),
    ).toEqual<ShortcutAction>({ kind: "none" });
  });

  it("returns none when there are no sidebar targets", () => {
    expect(
      routeKeyboardShortcut(
        { action: "workspace.navigate.index", payload: { index: 1 } },
        makeCtx({ sidebarShortcutTargets: [] }),
      ),
    ).toEqual<ShortcutAction>({ kind: "none" });
  });
});

describe("routeKeyboardShortcut — workspace.navigate.relative", () => {
  const STATUS_VISUAL_TARGETS = [
    { serverId: "srv", workspaceId: "needs-input" },
    { serverId: "srv", workspaceId: "running-new" },
    { serverId: "srv", workspaceId: "running-old" },
    { serverId: "srv", workspaceId: "done" },
  ] as const;

  it("uses the selected chat to choose the next chat in the same workspace", () => {
    const chatTargets = ["first", "second", "third"].map((agentId) => ({
      serverId: "srv",
      workspaceId: "shared-folder",
      agentId,
    }));
    expect(
      routeKeyboardShortcut(
        { action: "workspace.navigate.relative", payload: { delta: 1 } },
        makeCtx({
          pathname: "/h/srv/workspace/shared-folder",
          sidebarShortcutTargets: chatTargets,
          navigationActiveWorkspace: chatTargets[1],
        }),
      ),
    ).toEqual<ShortcutAction>({
      kind: "navigate-workspace",
      serverId: "srv",
      workspaceId: "shared-folder",
      agentId: "third",
    });
  });

  it("uses the retained navigation workspace selection over a stale pathname", () => {
    expect(
      routeKeyboardShortcut(
        { action: "workspace.navigate.relative", payload: { delta: 1 } },
        makeCtx({
          pathname: "/h/srv/workspace/ws-2",
          navigationActiveWorkspace: { serverId: "srv", workspaceId: "ws-4" },
        }),
      ),
    ).toEqual<ShortcutAction>({
      kind: "navigate-workspace",
      serverId: "srv",
      workspaceId: "ws-5",
    });
  });

  it("moves from status row 2 to row 3 using status visual target order", () => {
    expect(
      routeKeyboardShortcut(
        { action: "workspace.navigate.relative", payload: { delta: 1 } },
        makeCtx({
          pathname: "/h/srv/workspace/ui-expose-archive-worktrees-on-merge",
          sidebarShortcutTargets: STATUS_VISUAL_TARGETS,
          navigationActiveWorkspace: { serverId: "srv", workspaceId: "running-new" },
        }),
      ),
    ).toEqual<ShortcutAction>({
      kind: "navigate-workspace",
      serverId: "srv",
      workspaceId: "running-old",
    });
  });

  it("moves backward from status row 2 to row 1 using status visual target order", () => {
    expect(
      routeKeyboardShortcut(
        { action: "workspace.navigate.relative", payload: { delta: -1 } },
        makeCtx({
          pathname: "/h/srv/workspace/ui-expose-archive-worktrees-on-merge",
          sidebarShortcutTargets: STATUS_VISUAL_TARGETS,
          navigationActiveWorkspace: { serverId: "srv", workspaceId: "running-new" },
        }),
      ),
    ).toEqual<ShortcutAction>({
      kind: "navigate-workspace",
      serverId: "srv",
      workspaceId: "needs-input",
    });
  });

  it("moves backward from status row 3 to row 2 using status visual target order", () => {
    expect(
      routeKeyboardShortcut(
        { action: "workspace.navigate.relative", payload: { delta: -1 } },
        makeCtx({
          pathname: "/h/srv/workspace/running-old",
          sidebarShortcutTargets: STATUS_VISUAL_TARGETS,
          navigationActiveWorkspace: { serverId: "srv", workspaceId: "running-old" },
        }),
      ),
    ).toEqual<ShortcutAction>({
      kind: "navigate-workspace",
      serverId: "srv",
      workspaceId: "running-new",
    });
  });

  it("falls back to the pathname workspace when no retained selection exists", () => {
    expect(
      routeKeyboardShortcut(
        { action: "workspace.navigate.relative", payload: { delta: -1 } },
        makeCtx({ pathname: "/h/srv/workspace/ws-3", navigationActiveWorkspace: null }),
      ),
    ).toEqual<ShortcutAction>({
      kind: "navigate-workspace",
      serverId: "srv",
      workspaceId: "ws-2",
    });
  });

  it("wraps from the last target forward to the first", () => {
    expect(
      routeKeyboardShortcut(
        { action: "workspace.navigate.relative", payload: { delta: 1 } },
        makeCtx({ navigationActiveWorkspace: { serverId: "srv", workspaceId: "ws-5" } }),
      ),
    ).toEqual<ShortcutAction>({
      kind: "navigate-workspace",
      serverId: "srv",
      workspaceId: "ws-1",
    });
  });

  it("returns none when there are no sidebar targets", () => {
    expect(
      routeKeyboardShortcut(
        { action: "workspace.navigate.relative", payload: { delta: 1 } },
        makeCtx({ sidebarShortcutTargets: [] }),
      ),
    ).toEqual<ShortcutAction>({ kind: "none" });
  });

  it("returns none when the delta payload is missing", () => {
    expect(
      routeKeyboardShortcut({ action: "workspace.navigate.relative", payload: null }, makeCtx()),
    ).toEqual<ShortcutAction>({ kind: "none" });
  });

  it("falls back to the first target when the current workspace is not in the sidebar", () => {
    expect(
      routeKeyboardShortcut(
        { action: "workspace.navigate.relative", payload: { delta: 1 } },
        makeCtx({
          pathname: "/settings/general",
          navigationActiveWorkspace: { serverId: "other", workspaceId: "ws-x" },
        }),
      ),
    ).toEqual<ShortcutAction>({
      kind: "navigate-workspace",
      serverId: "srv",
      workspaceId: "ws-1",
    });
  });
});

describe("routeKeyboardShortcut — message-input.action", () => {
  it.each([
    ["focus", "message-input.focus"],
    ["send", "message-input.send"],
    ["dictation-toggle", "message-input.dictation-toggle"],
    ["dictation-cancel", "message-input.dictation-cancel"],
    ["dictation-confirm", "message-input.dictation-confirm"],
    ["voice-toggle", "message-input.voice-toggle"],
    ["voice-mute-toggle", "message-input.voice-mute-toggle"],
    ["mode-cycle", "message-input.mode-cycle"],
  ] as const)("kind=%s → dispatch %s", (kind, id) => {
    expect(
      routeKeyboardShortcut({ action: "message-input.action", payload: { kind } }, makeCtx()),
    ).toEqual<ShortcutAction>({
      kind: "dispatch",
      action: { id, scope: "message-input" },
    });
  });

  it("returns none when kind is missing", () => {
    expect(
      routeKeyboardShortcut({ action: "message-input.action", payload: null }, makeCtx()),
    ).toEqual<ShortcutAction>({ kind: "none" });
  });
});

describe("routeKeyboardShortcut — settings.toggle", () => {
  it("pushes to the settings root when not currently in settings", () => {
    expect(
      routeKeyboardShortcut(
        { action: "settings.toggle", payload: null },
        makeCtx({ pathname: "/h/srv/workspace/ws-2" }),
      ),
    ).toEqual<ShortcutAction>({ kind: "router-push", route: "/settings" });
  });

  it("navigates to the last workspace when leaving settings on desktop", () => {
    expect(
      routeKeyboardShortcut(
        { action: "settings.toggle", payload: null },
        makeCtx({
          pathname: "/settings/general",
          isMobile: false,
        }),
      ),
    ).toEqual<ShortcutAction>({ kind: "navigate-last-workspace" });
  });

  it("falls back to router.back() on mobile", () => {
    expect(
      routeKeyboardShortcut(
        { action: "settings.toggle", payload: null },
        makeCtx({
          pathname: "/settings/general",
          isMobile: true,
        }),
      ),
    ).toEqual<ShortcutAction>({ kind: "router-back" });
  });
});

describe("routeKeyboardShortcut — callbacks and pickers", () => {
  it.each([
    ["sidebar.toggle.left", "toggle-agent-list"],
    ["sidebar.toggle.both", "toggle-both-sidebars"],
    ["theme.cycle", "cycle-theme"],
  ] as const)("%s → callback %s", (action, name) => {
    expect(routeKeyboardShortcut({ action, payload: null }, makeCtx())).toEqual<ShortcutAction>({
      kind: "callback",
      name,
    });
  });

  it("agent.new → open-project-picker", () => {
    expect(
      routeKeyboardShortcut({ action: "agent.new", payload: null }, makeCtx()),
    ).toEqual<ShortcutAction>({ kind: "open-project-picker" });
  });
});

describe("routeKeyboardShortcut — toggle dialogs", () => {
  it("opens the command center scoped to files from a workspace", () => {
    expect(
      routeKeyboardShortcut({ action: "command-center.files", payload: null }, makeCtx()),
    ).toEqual<ShortcutAction>({ kind: "command-center-toggle", nextOpen: true, scope: "files" });
  });

  it("leaves the file-search shortcut to the project-picker host outside a workspace", () => {
    expect(
      routeKeyboardShortcut(
        { action: "command-center.files", payload: null },
        makeCtx({ pathname: "/settings" }),
      ),
    ).toEqual<ShortcutAction>({
      kind: "dispatch",
      action: { id: "workspace.project.pick", scope: "workspace" },
    });
  });

  it("opens the command center when closed", () => {
    expect(
      routeKeyboardShortcut(
        { action: "command-center.toggle", payload: null },
        makeCtx({ commandCenterOpen: false }),
      ),
    ).toEqual<ShortcutAction>({ kind: "command-center-toggle", nextOpen: true });
  });

  it("closes the command center when open", () => {
    expect(
      routeKeyboardShortcut(
        { action: "command-center.toggle", payload: null },
        makeCtx({ commandCenterOpen: true }),
      ),
    ).toEqual<ShortcutAction>({ kind: "command-center-toggle", nextOpen: false });
  });

  it("toggles the shortcuts dialog", () => {
    expect(
      routeKeyboardShortcut(
        { action: "shortcuts.dialog.toggle", payload: null },
        makeCtx({ shortcutsDialogOpen: false }),
      ),
    ).toEqual<ShortcutAction>({ kind: "shortcuts-dialog-toggle", nextOpen: true });

    expect(
      routeKeyboardShortcut(
        { action: "shortcuts.dialog.toggle", payload: null },
        makeCtx({ shortcutsDialogOpen: true }),
      ),
    ).toEqual<ShortcutAction>({ kind: "shortcuts-dialog-toggle", nextOpen: false });
  });
});

describe("routeKeyboardShortcut — unknown actions", () => {
  it("returns none for unknown action ids", () => {
    expect(
      routeKeyboardShortcut({ action: "totally.made.up", payload: null }, makeCtx()),
    ).toEqual<ShortcutAction>({ kind: "none" });
  });
});
