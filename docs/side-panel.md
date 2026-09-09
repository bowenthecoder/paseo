# Side panel

A workspace is one chat. Everything that is not the conversation — a terminal, the in-app browser,
Changes, Files, Setup, a file, a diff, a pull request — renders in the single right-hand side
panel. There is no tab strip and no split tree.

## What decides where a panel lands

`packages/app/src/panels/panel-manifest.ts` is the routing table. Each panel kind declares its
`supportedHosts`: `main` is the chat pane, `explorer` is the side panel. Chats
(`agent`, `draft`, `subagents`, `provider_subagent`) are `main`-only; everything else is
`explorer`-only. Callers ask for a target and never name a host — `openTab` resolves the pane from
the manifest, so a terminal cannot end up in the chat pane and a chat cannot end up in the dock.

`explorer` keeps its pre-rename spelling because plugin panels declare that location by name and
persisted layouts carry the literal `"explorer"` pane id.

## Layout shape

`layoutByWorkspace[key]` is always `group[ pane "main", pane "explorer" ]`.
`flattenLayoutToSingleChat` in `packages/app/src/stores/workspace-layout-actions.ts` enforces it,
and runs both on the persist migration (version 3) and on every store read. A blob written by a
build that still had splits opens with its tabs redistributed by host rather than dropped.

The side panel pane is hidden rather than removed when it is empty or dismissed, so its contents
survive a close. `showExplorerSidebar` / `hideExplorerSidebar` flip that flag; an explicit
`openTab` that lands in the panel unhides it, and a background open does not.

## Shell

`WorkspaceChatLayout` renders the header, the chat pane, a resize handle and `WorkspaceSidePanel`.
The panel's width is persisted per workspace in `explorerSidebarWidthByWorkspace` and clamped
against the chat's minimum width. Its rail switches between whatever is live in the panel and
closes one view or the whole panel; nothing is created or dragged there.

Compact has one surface, so it renders whichever pane is live — the side panel while it is open,
the chat otherwise — and its switcher lists every open surface. The combined full-screen Explorer
overlay is unchanged and still owns Files and Changes on compact.

## Header

Left: the host badge, the chat title and the project row. Right: a terminal toggle, a browser
toggle, the workspace menu, and the side panel toggle. The toggles put the panel away when the
thing they open is already the thing on screen. The workspace menu carries what the tab strip's
`+` used to: a new chat, Changes, Files, the terminal profiles, and the workspace actions.

## Keyboard

`Cmd/Ctrl+E` toggles the panel. `Cmd/Ctrl+Shift+T` toggles the terminal in it. Escape closes it,
but yields to the composer (which interrupts the agent) and to a focused terminal, so it only
fires when focus is outside both.

## Test surfaces

Each mounted panel carries `workspace-panel-<tabId>`, and only the one on screen is visible — that
is how an e2e spec asks which chat it is looking at. The panel shell is `workspace-side-panel`, its
rail entries are `workspace-side-panel-view-<tabId>`, and the chat column is `workspace-chat-pane`.
