# Side panel

A workspace shows one primary chat. Documents, Files, Changes, terminals, the in-app browser,
Setup, pull requests, Tasks and child conversations open in the right-hand panel. Opening a child
keeps its parent visible, selected in the sidebar, and ready to resume. To compare independent
chats, right-click a chat and choose **Open in → Open in split view**, or press **O**, then **S**
while the menu is open. The current chat stays on the left. There is no chat tab strip or arbitrary
split tree.

## What decides where a panel lands

`packages/app/src/panels/panel-manifest.ts` declares which hosts a built-in panel supports.
`packages/app/src/workspace-tabs/target-host.ts` resolves each target in its workspace context:
root conversations and drafts default to `main`; explicit chat splits, Tasks, provider-native
children and managed children opened from their parent use `explorer`. A child opened in its own workspace can be that
workspace's primary conversation. Opening its files uses the child's device and working folder,
not the parent's. Layout placement does not change agent ownership or parentage.

Independent split chats keep their own folder, input draft and queued messages across reloads.
Closing a split view leaves its chat active; **Archive (A)** archives that chat and closes its
open views. **Current view** opens the selected chat normally. Chat splits are side by side on
wide layouts and require both chats to be on the same device. Splitting below and mixing devices
within one workspace are not supported; narrow layouts explain that a wider window is needed.

Plugin panels honor their declared locations. A contribution that supports the side panel opens
there; a main-only contribution remains supported. Preserve an unavailable plugin's saved
location until its contribution loads. `explorer` keeps its spelling in plugin contracts and
persisted pane IDs.

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
