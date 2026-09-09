# Side panel

A workspace shows one primary chat. Documents, Files, Changes, terminals, the in-app browser,
Setup, pull requests, Tasks and child conversations open in the right-hand panel. Opening a child
keeps its parent visible, selected in the sidebar, and ready to resume. There is no chat tab strip
or arbitrary split tree.

## Routing and saved layouts

`packages/app/src/panels/panel-manifest.ts` declares which hosts a built-in panel supports.
`packages/app/src/workspace-tabs/target-host.ts` resolves each target in its workspace context:
root conversations and drafts use `main`; Tasks, provider-native children and managed children
opened from their parent use `explorer`. A child opened in its own workspace can be that
workspace's primary conversation. Opening its files uses the child's device and working folder,
not the parent's. Layout placement does not change agent ownership or parentage.

Plugin panels honor their declared locations. A contribution that supports the side panel opens
there; a main-only contribution remains supported. Preserve an unavailable plugin's saved
location until its contribution loads. `explorer` keeps its spelling in plugin contracts and
persisted pane IDs.

Saved layouts normalize to `group[ pane "main", pane "explorer" ]`. The version 3 migration and
subsequent store reads redistribute targets from old split layouts without dropping saved
conversations, drafts or supporting views. Normalization checks target placement even when an
old layout already has these two pane IDs; shape alone cannot validate a saved Main/Side choice.
There are no current Main/Side placement preferences.

Hiding the side panel preserves its views and drafts. Opening a supporting view reveals it;
background arrivals do not steal the primary conversation. Closing an individual view has its
own lifecycle policy; see [Agent lifecycle](./agent-lifecycle.md#views-and-archive).

## Width and navigation

The dock starts at 320 px. Its saved width clamps around a 400 px chat minimum, with a 240 px
dock minimum. The left sidebar budgets against both visible columns; resizing must not count
the dock twice or push the composer outside the window. Compact layouts show one surface at a
time and let the user return to the preserved chat. Their combined Explorer overlay still owns
Files and Changes.

The rail switches between open views and closes a view or the whole panel. A reused file preview
keeps its rail entry mounted while its filename and contents change. Full-path tooltips follow
the user's UI font. Background terminal status remains visible in the rail.

The header contains the device, chat title and folder, plus terminal/browser toggles, the workspace
menu and the panel toggle. New chat reuses an available draft instead of accumulating invisible
drafts. The desktop Drafts menu recovers saved drafts, including multiple drafts from older
layouts. Selecting one returns to the chat and preserves its text, attachments and held queue.

`Cmd/Ctrl+E` toggles the panel. `Cmd/Ctrl+Shift+T` toggles its terminal. Escape closes the panel
when focus is outside the composer and terminal; those controls retain their own Escape behavior.

## Documents and device files

Markdown links open rendered documents, source or text on the right. Local Markdown URL paths
decode once; raw filesystem and inline-code paths retain literal percent characters. Image
loading and errors use a compact row even when dimensions were remembered from an earlier load.
Retry reacquires a missing or corrupt preview. These path rules also apply to files outside the
chat's working folder.

No folder starts at the selected device's home directory. Files can navigate Parent, Home,
Device root and the working folder using that device's existing permissions. Hosts come from
the connected-device registry; grouping a chat never changes its execution directory.

## Test surfaces

Mounted content carries `workspace-panel-<tabId>`; check visibility to distinguish the current
view from retained content. The primary column is `workspace-chat-pane`, the dock is
`workspace-side-panel`, and rail entries use `workspace-side-panel-view-<id>` with selected state.
For a reused file preview, the rail's ID follows the current file target while the content's
`tabId` stays stable. Do not treat a content panel as a clickable tab or expect `aria-selected`
on it.
