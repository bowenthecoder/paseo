# Paseo final integration — 9 September 2026

**10 September 2026 update.** `/Applications/Paseo.app` is now `91980629c` (the 9 September live source plus the Enter duplicate-chat fix). The 9 September package `428478a45` is no longer installed. Source and the README from that night are on GitHub: https://github.com/bowenthecoder/paseo/blob/live-mac-backup/README.md

App `428478a45` and subscriptions plugin `c13413463` were **installed and verified live** at `/Applications/Paseo.app` on 9 September. Hashes and evidence remain in [checkpoints/428478a45](checkpoints/428478a45/); the packaged `.app` was removed from this Desktop after the GitHub backup.

All 18 CI jobs passed. The corrected package passed 190 agent-manager tests, the loader regression, real Claude two-launch naming verification, packaged smoke, lint and typechecks. Live verification confirmed all 10 active chats, 63 stored records, 47 workspaces, three groups, one nonempty draft and 53 layouts were preserved. Nine eligible legacy titles were generated successfully. Provider bindings, plugin settings, installed hashes and code signature passed verification.

Existing subagent/native-provider/stress evidence is reused only for unchanged code, as recorded in the manifest. Historical feature screenshots remain under earlier checkpoint directories.

## Chats and the sidebar

- **Your own groups come first.** Pinned at the top, then the groups you made (PaseoBuild,
  CueRetail, Tloom), then Ungrouped. No more automatic host/folder grouping. Make, rename and
  remove groups, drag chats between them, or use "Move to group". Removing a group sends its chats
  back to Ungrouped. Screenshot: `screenshots/02-current-chats-1280x820.png`.
- **Right-click a chat and press one letter.** A archives right away, P pins, U marks unread,
  R renames. Fork and delete are still in the menu. Letters never fire while you are typing.
- **Up to four chats side by side.** Right-click a chat, press O then S to open it in a split
  view. Four chats make a two-by-two grid. Each view keeps its own folder, model, effort, draft,
  output and focus. Closing a view keeps the conversation. Screenshots:
  `screenshots/06-two-chats-side-by-side-1280x820.png` and
  `evidence/packaged-stress-evidence/four-chats-1280x820.png`.
- **Short automatic titles.** A new chat is named from its first real prompt in about two to
  six words. A name you typed yourself is never overwritten, and the header follows the current
  title. On restart, eligible legacy raw-prompt names are backfilled after tools and plugins are ready.
- **Held messages.** Hold a message instead of sending it, edit or remove it, then "Send now"
  or "Send all" in order. Held messages and attachments survive a restart. A new chat reuses a
  saved draft, and the Drafts menu brings back older ones.
- **No folder needed.** Start a chat on the MacBook, Jarvis or the VPS without picking a
  repository; it starts at that machine's home folder and can browse its files.
- **Warm dark look.** Compact rows, the Claude-style palette, and a small warm glow instead of
  the busy spinner ring on active chats.

## Inside a chat

- **Quiet activity traces.** Tool calls and "Thinking…" show as small one-line traces between
  answers. No divider lines between messages.
- **Honest tool summaries.** The collapsed Overview counts failed, canceled and running tools
  without calling them successful edits or commands.
- **CLI look and Tool logs.** Tool calls, thinking, errors and todo lists can be drawn the way
  the Claude Code and Codex terminals draw them, with a Tool logs switch that also changes
  output already on screen. Real command output survives a reload.
- **Images and documents.** Local images load even when the path has `%20` in it; broken or
  missing images show a compact row with a Retry that works after reload. Markdown opens as
  Preview, Source or plain text in the right-hand panel, with zoom for images.
- **Right-hand dock.** Documents, Tasks (Claude, Codex and Grok subagents with their output and
  token counts), Changes and terminals live in a separate dock beside the chat. Opening a new
  terminal gives it keyboard focus; opening a document keeps the chat focused.
- **Fits a small Mac screen.** Chat and composer stay usable at 1280 by 820; restored windows
  are clamped to the display; panels keep their state when hidden or resized; the chat and
  sidebar scroll independently.
- **Effort choices** for Codex, Claude and Grok 4.6 in the composer. No Grok Fast mode.

## Accounts (Subscriptions page and the usage pill)

Screenshot: `screenshots/03-subscriptions-1280x820.png`.

- **One row per account:** Claude 1, Claude 2, Codex 1, Codex 2 and Grok, each with signed-in
  state, plan, live session and weekly bars, credits, reset times, Relink, Retry now and a
  "Use in Paseo" switch.
- **Usage pill on every chat** (for example "Grok · 6% wk") that opens the Accounts and models
  panel, so switching account or model is one tap from the chat. Usage next to the context meter
  shows loading, unavailable, reconnect and refresh states instead of made-up numbers.
- **Auto-switch.** New chats start on the healthiest account of the family, and a chat that
  dies on a usage limit continues on the sibling account in a new chat.
- **Settings survive toggling.** Turning an account off keeps its full configuration disabled;
  turning it on restores every matching provider, including custom aliases, unchanged. Only a
  brand-new registration gets stock settings.
- **Usage belongs to the right account.** Numbers follow the configured credential home. Claude
  2 can no longer fall back to Claude 1's keychain entry. Relinking clears the old account's
  numbers in the plugin, the daemon and the app, and a stale request cannot overwrite the new
  account's usage.

## Routines page

Screenshot: `screenshots/04-routines-1280x820.png`.

- The important scheduled jobs on all three machines (MacBook, Tloom server, Jarvis) on one
  page: purpose, engine and model, cadence, last run, and a Needs-attention block for failed or
  missed jobs. Filter by host, group or status. Run now, Log and Docs on each row. Slack or
  Telegram paging when a job misses its window or fails, with an Alerts switch.

## Under the hood

- **Huge outputs no longer break the connection.** An 87 MiB reply gets a bounded error and
  history pages stay under 8 MiB while the socket stays connected.
- **File watching is fixed.** A native change notice without a filename now rescans the whole
  folder tree, so deletions inside other folders are recovered (this was the last open Windows
  failure). A create followed by delete keeps its deletion.
- **Reloading a chat cannot duplicate it.** Native reloads are serialized per chat.
- **A second Paseo window never stops your daemon.** Quitting a review or preview window only
  stops a daemon that window itself started, and only when built-in daemon management is on.
- **Big diffs scroll fast.** Continuous scrolling through 2,000 changed files stays smooth after
  load; the first load of that extreme case still takes about 68 seconds.

## Build 2: requested follow-up changes

1. **Drag a chat into split view.** Drag any chat row from the sidebar onto the chat area. A
   small chip with the chat's name follows the pointer, the area says "Open … in split view"
   (or why it can't, like four views already open), and letting go opens it as the next view.
   Dragging into a group still works. Screenshot proof is in the drag test artifacts.
2. **Usage in the model picker.** Each account row now reads like "Claude 1 · 18% · 55% wk",
   "Codex 2 · out" or "Grok · 6% wk", so you know which one to pick. The matching plugin
   correctly maps Claude 1 to its saved account.
3. **Output that looks like the Claude Code app.** Your screenshot is the target: normal font,
   one-line summaries like "Ran 4 commands, read bb5hlxzmr.txt ›" and "Edited 4 files (1 failed),
   created a file, ran 3 commands +44 -100 ›" between the model's own sentences, no terminal
   rows. This grouped look is now the default for every model (your old "detailed" preference
   is moved over once). Finished thinking stays hidden; thinking that is still streaming shows.
   Grok's tools are named after what they did instead of "Other". The monospace terminal look is
   still there as an option on the Subscriptions page, off by default.
4. **Names that describe the job.** Naming was silently failing or stuck: chats made from the
   command line were treated as hand-named, chats from before this feature kept their raw first
   sentence forever, and there was no naming model your trimmed model lists could reach. All
   three are fixed. Old chats whose name is just their first prompt get a real name shortly
   after the new daemon starts; names you typed are never touched.
5. **Plan commands.** Type `/plan` in any chat to switch plan mode on or off (Claude Code plan
   mode, Codex's plan feature, OpenCode's plan agent). The mode control in the composer already
   had it; the command makes it one keystroke.
6. **The "plan approval could not be completed" error is fixed.** It came from Grok: when Grok
   finishes a plan it asks the app to show an approval dialog through its own protocol call, and
   Paseo didn't answer it. Now you get a real plan card with Approve plan, Request changes
   (type your feedback) and Abandon plan, and Grok leaves plan mode when you approve. Confirmed
   against the real Grok for all three answers.
7. **Reset from the app.** Right-click a chat and choose "Reset context (new chat)" (or press N),
   or type `/reset`. The old chat goes to History and a fresh one with the same provider, model
   and mode opens, so the model starts clean.
8. **The startup crash is fixed.** With three chat views open, archiving the third one's chat
   left a saved layout the app could not clean up, so it hit the error screen on every launch
   against your daemon. Build 1 had the same bug. It is fixed and covered by a test built from
   your exact saved layout.

## Final subagent follow-up

- Task tool rows link directly to the matching child transcript in the right dock.
- Grouped activity reports “Launched N subagents” with a working View link.
- Claude background shell work stays visible while waiting and settles after completion.
- Codex resumes its parent after native children finish, including configured account aliases.
  A grace period preserves native continuation; stale/repeated events cannot inject duplicate
  wakes or interrupt another turn.
- Background shell events cannot create phantom running subagent cards in completed output.
- The real fanout check requires twelve distinct completed children, all twelve readable
  transcripts, parent completion without another user message, and working card navigation.

## Final verification

| Check | Current result |
| --- | --- |
| Full GitHub CI, final production commit 428478a45, run 34424683253 | Passed: all eighteen jobs on exact 428478a45 |
| Full lint, formatting hooks and workspace types | Passed |
| Focused Claude source, app summary/projection, Codex continuation and alias regressions | Passed |
| Worktree archive/restart browser regression | Passed |
| Actual Codex twelve-child fanout, all transcripts, automatic continuation and View link | Passed |
| Actual Claude twelve-child fanout and background shell | Passed: twelve child outputs/card links, automatic continuation, no phantom running tools |
| Exact packaged renderer/preload/CLI/terminal smoke | Passed |
| Packaged stress on 94c0fd7dc (unchanged affected code): seven grouped checks, ten cycles, four views, drafts, files/images, archive, bounded 87 MiB RPC | Passed |
| Packaged native providers/four-view UI on 94c0fd7dc (unchanged provider, plugin and renderer code) | Passed: Claude/Codex 1/Grok replies, Codex 2 quota rejection, tool logs and drafts |
| Profile migration, groups, drafts and layout | Passed live: three groups, 53 layouts, one nonempty draft retained; no additional drafts pruned in the final update |
| Cold-start legacy naming regression | Passed: 190 manager tests and real packaged Claude two-launch check; automatic title, original reply and manual name verified |
| Live installation and post-restart verification | Passed on installed 428478a45: artifact/signature, new installed daemon, actual UI, chat/workspace/draft/group/layout retention, settings and nine generated legacy titles |

Final evidence is in `checkpoints/428478a45/evidence/`; the manifest records exact hashes and which unchanged-code checks reuse earlier evidence.
Earlier build reports are retained in `cutover/pre-pickup-FINAL-FEATURES.md` as historical evidence.

## Scope and limitations

Codex 2 is exhausted until 14 September at 11:29 p.m. Eastern. Final validation checks its
visible quota rejection; it does not claim a fresh successful Codex 2 reply. Earlier checkpoints
passed positive replies before the quota was exhausted. Native phones were not tested in this
round. This is an ad hoc signed ARM64 Mac app, not a notarized public distribution.

The prior installed app and profile are backed up under
`/Users/bowen/Applications/Paseo Backups/20260909-1958-pickup-before-live`.
The completed cutover waited for idle work, stopped gracefully without force, preserved plugin state and resumed the same task for successful live verification. The second update backs up94c0fd7dc under
`/Users/bowen/Applications/Paseo Backups/20260909-2120-before-title-fix`.
See `cutover-title/result.json` once activated.
