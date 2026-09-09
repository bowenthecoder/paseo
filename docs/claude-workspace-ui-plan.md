# Paseo workspace and agent UI review

Updated: 2026-09-08. Integration branch: `bowen/paseo-integration-20260908` in
`/Users/bowen/code/paseo-worktrees/paseo-integration`.

The current task combines all pending app and subscriptions changes, fixes their interactions,
and tests the resulting candidate until it is ready to publish. The installed app remains backed
up and unchanged while Bowen's requested screenshot review is outstanding. The verification table below separates the completed app checks from any remaining plugin or
rollout work.

## Bowen's requirements and current direction

- Match the supplied Claude screenshots: `#111111` sidebar, `#151515` main surface,
  `#343434` selection, warm `#c3c2b8` chat text and compact 30 px desktop rows. Preserve
  44 px touch targets. Show the actual app with current chats, rather than a mockup.
- Back up the installed app before replacement. Preserve existing conversations, current manual
  groups, drafts, repositories and worktrees throughout preview refreshes.
- Put Pinned first, manual groups next and Ungrouped below. Remove automatic host/repository
  grouping from the default chat view. Chats sharing a workspace remain independently pinnable,
  movable, renameable and archivable. Empty registered folders remain available in the folder
  selector without becoming chat rows.
- Support New group, rename/remove group, drag/drop and Move to group. Removing a group returns
  all of its chats to Ungrouped, including chats hidden by filters. Preserve groups the user has
  since created manually; do not reset them again.
- Choose a connected device and working folder. Folder association places a new chat in the
  corresponding manual group; manual moves take precedence. Dragging a chat never changes its
  execution directory.
- Allow **No folder** on the selected MacBook, Jarvis or VPS. Start at that device's home and
  browse its global file tree with its existing permissions. Discover device names from the
  registry; do not hardcode workspaces or hosts.
- Right-click a chat and press its displayed letter. **A archives immediately**, P pins/unpins,
  U toggles unread and R renames. Keep fork and delete actions. Menu letters must not execute
  while typing in an input, and archive completion must preserve newer navigation.
- Use one primary chat with documents, Tasks and managed/provider-native children on the right.
  This integration replaces the earlier generic Split right/Split below and Main/Side preference
  implementation. Keep the parent visible and selected while inspecting a child; keep every
  child's own folder and draft. The layout contract is in [Side panel](./side-panel.md).
- Generate short meaningful titles, roughly 2–6 words. Preserve manual renames and archived
  conversations against delayed automatic naming.
- Show supported effort choices for Codex, Claude and Grok 4.6. **No Grok Fast mode**: Bowen
  withdrew it. Show real subscription usage alongside context while working, including loading,
  unavailable, reconnect and refresh states.
- Show X running tasks, a right-hand task list, child details and reported tokens for Codex,
  Claude and Grok. Keep provider-native metrics distinct from managed-child context. Do not
  fabricate unavailable totals or present synthetic provider checks as real ones.
- Fix encoded local image paths such as `Paseo%20Preview%2020260908/current-chats.png`.
  Decode Markdown URLs once while preserving raw paths and literal percent filenames. Keep
  loading/errors to a compact 32 px row, including images with remembered dimensions. Retry must
  recover missing files, corrupt images and missing stored previews after remount and reload.
- Replace the busy sidebar ring with a small warm glow. Preserve reduced-motion behavior and
  stop activity animation when the chat completes or is inactive.
- Keep the chat and composer usable on smaller Mac displays. Clamp restored windows to the
  display, budget both sidebars around the chat, and preserve state when a panel is hidden or
  the window resizes. Support rendered Markdown, source and text in the right panel.
- Merge the held-message queue: explicit hold, edit/remove, Send now and ordered Send all, with
  held messages and attachments surviving restart. New chat reuses available drafts; the Drafts
  menu makes older saved drafts reachable after the tab-strip migration.
- Merge the subscriptions Tool logs toggle alongside usage, provider registration and Routines
  changes. Tool logs defaults off; changing it must also affect already-rendered tool output.
- Keep Hermes, CueRetail Dashboard and Tloom worktrees on this Mac and the authorized VPS.
  Work in isolated checkouts, run focused end-to-end checks, inspect screenshots and push the
  completed app and plugin changes. Readiness requires observed results, not a promise of no bugs.

## Backups and worktrees

| Resource                             | Location or status                                                                 |
| ------------------------------------ | ---------------------------------------------------------------------------------- |
| Installed app backup                 | `/Users/bowen/Applications/Paseo Backups/20260908-162435/Paseo.app`                |
| Original and backup app.asar SHA-256 | `67818f9ed4f246484ef5cdc82a59f7be3d3587215c1c8b1d5049a2052b390f9b`                 |
| Mac project worktrees                | `/Users/bowen/code/paseo-worktrees/{hermes,dashboard,tloom}`                       |
| VPS project worktrees                | `/home/codex/code/paseo-worktrees/{hermes,dashboard,tloom}` on `hostinger-support` |
| App integration                      | `/Users/bowen/code/paseo-worktrees/paseo-integration`                              |
| Subscriptions integration            | `/Users/bowen/code/paseo-worktrees/subscriptions-integration`                      |
| Screenshot/review folder             | `/Users/bowen/Desktop/paseo-preview-20260908`                                      |

All six project worktrees were registered during the earlier feature work. Operational checkouts
remain intact. The production daemon on port 6767 must not be restarted as part of testing.

Before refreshing the review executable, back up its current profile and manual groups again.
User-created groups such as PaseoBuild and CueRetail survive refreshes. The preview uses its own
profile with built-in daemon management disabled. Capture its actual window without navigating
or resizing the user's session. At Electron zoom, use raw CDP `Page.captureScreenshot` without
clipping; Playwright's CSS-scaled capture cropped the visible composer. See
[Browser capture harness](./browser-capture-harness.md).

## Source being combined

| Input                 | Checkpoint                                                | Meaning                                                                                        |
| --------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Original app features | `85d2c46` on `bowen/claude-workspaces-subagents-20260908` | Earlier published review source, including feature commit `5164b55`                            |
| Preview fixes         | `a38a19c80` on `bowen/paseo-preview-fixes-20260908`       | Encoded images, quiet glow, No folder, document/small-window and History fixes                 |
| Held composer queue   | `ec7c8221e`                                               | Merged into the app integration branch at `abbb668d3`                                          |
| Single-chat layout    | `76ed838`                                                 | Combined with fixes for routing, migration, selection, drafts and test coverage                |
| Subscriptions         | `c48c514`                                                 | Combined registration/quota, Routines and Tool logs changes in the plugin integration worktree |

The app integration combines all three app inputs. Source worktrees owned by the other tasks
remain clean and unchanged at the checkpoints above. Review branches:
[app integration](https://github.com/bowenthecoder/paseo/tree/bowen/paseo-integration-20260908) and
[subscriptions integration](https://github.com/bowenthecoder/paseo-subscriptions/tree/bowen/paseo-integration-20260908).
The final branch heads and push status are recorded with the local review evidence.

## Integrated verification and release readiness

Focused checks ran with one worker and isolated test daemons. No full local test suite was run.
[QA](./qa.md) owns the evidence standard and [Testing](./testing.md) owns test conventions.

| Area                           | Observed integration result                                                                                                                                                                                                                                                                           |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chat organization and composer | Group CRUD/reload, pinning, drag/drop, folder association, immediate menu letters, archive/navigation races, held queue, draft recovery and compact navigation passed.                                                                                                                                |
| Documents and images           | Encoded/literal-percent paths, missing/corrupt/cache recovery, remembered-size loading/error rows, Preview/Source editing and saving, unsaved drafts, image refresh and unforced zoom passed. The original image hover handlers failed the same CSS check that the shared-hover fix passes.           |
| Layout and children            | Primary/side migration, parent selection, independent drafts/folders, child diff contents, overflowing rail, grandchild/reload, child slash commands, terminal activity and worktree cwd passed.                                                                                                      |
| Plugin panels                  | Workspace/agent context, secondary host preservation, command collisions, compact rendering and unavailable state passed.                                                                                                                                                                             |
| Focused code checks            | 191 layout/child checks, additional targeted slash/file/rail/menu/archive checks, four Tasks browser component checks, the image hover component check and 12 desktop updater checks passed. Earlier overlapping runs are not added together.                                                         |
| Real Codex / Claude / Grok     | Eight final cases passed: three native subagent flows, four real replies with supported effort and subscription/context usage (both Codex accounts), and one short-title flow.                                                                                                                        |
| Subscriptions                  | Registration (15), quota (13), Tool logs unit checks (5) and Routines (289) passed. Types and bundles passed. Eleven lint findings match the existing baseline. The integrated browser check found missing switch checked-state attributes and a Tool logs reload race; final recovery check pending. |
| App quality                    | Full repository formatting, lint (zero warnings/errors) and full workspace typecheck passed.                                                                                                                                                                                                          |
| Packaged app                   | Electron export, desktop build, ARM64 package and local signature verification passed. This is a locally signed preview, not a notarized public release.                                                                                                                                              |
| Actual-chat preview            | Refreshed the separate preview at 22:06 EDT. Manual groups match the backup exactly; the nonempty saved draft is retained. Migration pruned two empty draft records. Screenshots at the current display size and 1280×820 show the chat/composer with no image errors.                                |
| Source publication / CI        | Final integration commit, branch push and CI handoff are being completed.                                                                                                                                                                                                                             |
| Installed app / live daemons   | Held for the requested screenshot review. The installed app and production daemons have not been replaced or restarted.                                                                                                                                                                               |

The fresh profile backup is
`/Users/bowen/Desktop/paseo-preview-20260908/profile-before-integration-20260908-220615`.
`current-chats.png` and `current-chats-small-mac.png` show the actual connected chats and groups.
`preview-after-refresh.json` and `preview-small-mac.json` record dimensions, bundle identity and
preservation checks. The temporary small-window instance was closed after capture; the main
review preview remains available. Capture did not navigate or resize the user's main preview.

Final focused browser evidence is spread across the regression, recovery and impact batches;
red runs were followed by targeted fixes and rechecks. Key logs:

- `/tmp/paseo-integration-regression-final-browser.log`: 21 passing cases; its four failures were resolved in subsequent targeted passes.
- `/tmp/paseo-integration-recovery-final-browser.log`: documents, responsive navigation, mock native Tasks and draft migration.
- `/tmp/paseo-integration-last-five-browser.log`: complete managed-child flow, wrapped worktree cwd and failed-setup revisit.
- `/tmp/paseo-integration-zoom-web-browser.log`: image Preview/Source/refresh/zoom and plugin panel/host/compact flow, both passing.
- `/tmp/paseo-integration-zoom-baseline-browser.log`: original hover handlers fail the same normal interaction.
- `/tmp/paseo-integration-real-browser.log`: all eight real-provider cases passed; the separate installed-plugin Tool logs case exposed the remaining plugin issue.
- `/tmp/paseo-integration-final-{format-check,lint,typecheck}.log`: full app quality checks.
- `/tmp/paseo-integration-{export,desktop-main-build,desktop-package,sign-verify}.log`: packaged preview checks.

Older automatic-workspace sidebar helpers remain in other legacy browser suites. The focused
results above do not claim those suites passed. Broader CI is a separate release gate. Native
iOS/Android devices were not exercised in this pass; compact Chromium and macOS were.

- [x] Preserve the installed app and create the six requested project worktrees.
- [x] Combine the pending app/plugin inputs in isolated worktrees.
- [x] Complete the selected app regressions and real-provider flows.
- [x] Run full app formatting, lint and workspace types.
- [x] Package, verify, back up and capture the refreshed actual-chat preview.
- [ ] Finish the installed-plugin Tool logs reload regression.
- [ ] Push both integration branches and record CI status.
- [ ] Complete screenshot review before installed-app and live daemon/plugin rollout.

## Earlier baseline evidence

These results preceded the single-chat/queue/plugin merge. Some exercised the retired tab,
Split right/Split below and Main/Side controls and must be adapted before validating this candidate.

| Baseline                     | Observed coverage                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Original chat UI             | Six focused group/action browser scenarios covered independent sibling chats, group CRUD/reload, drag/drop, pin/unpin, folder association, archive/unread, letters, density and the then-current split navigation. Two keyboard scenarios and 85 focused keyboard unit checks passed.                                                             |
| Original real providers      | Claude Sonnet 5, Codex B Sol and Grok 4.6 created native children; running counts, right task views, output, reported tokens, parent replies and reload passed. Claude, Codex A, Codex B and Grok replied with requested effort and displayed context/account usage. A real Codex short-title case and native metadata-inheritance checks passed. |
| Provider contracts           | 55 registry, 99 shared ACP, 5 Grok child, a focused Codex child-usage check and 12 Claude/Codex effort passthrough checks passed. Thirty Codex quota parser cases and four quota-service cases passed.                                                                                                                                            |
| Preview fixes at `a38a19c80` | Sixteen distinct focused Playwright scenarios covered encoded/missing/corrupt image recovery, No folder across devices, manual folder grouping, quiet activity, documents/global files, small-screen layout and History/remote deletion.                                                                                                          |
| Preview image/history units  | Fourteen final cache/hook checks covered stored preview loss and stale failures; thirty replica checks covered removal, reconnect, authoritative deletion and stale replies. The commit hook passed formatting, lint and the full workspace typecheck.                                                                                            |
| Queue input                  | The queue branch recorded five persistence/hold E2E cases and four browser component cases before the layout merge.                                                                                                                                                                                                                               |
| Packaged baseline            | The local preview signature verified, current chats hydrated across three hosts, and the installed app checksum still matched the backup. `current-chats-full-window.png` in the review folder captures the actual preview without the zoom-related crop.                                                                                         |

Follow-up evidence logs: `/tmp/paseo-followup-browser-core.log`,
`/tmp/paseo-followup-verified-browser.log`, `/tmp/paseo-followup-image-and-history-final.log`,
`/tmp/paseo-history-focus-fixed.log`, and `/tmp/paseo-preview-fixes-checkpoint.log`.
The image-and-history log includes a History failure that was subsequently fixed and passed in
its separate final log. Queue evidence is in `/tmp/paseo-e2e-hold-persist.log` and
`/tmp/paseo-browser-queue.log`.

Native provider changes were tested on isolated daemons. Current production hosts retain their
running versions until rollout; the Grok effort/child adapter and corrected quota labels require
the corresponding new daemon/plugin source. Local Grok configuration was backed up at
`~/.grok/config.toml.before-paseo-subagents-20260908-164637`. Mac and VPS Codex metadata repairs
used backups and safe configuration reloads; the VPS backup is
`/home/codex/.paseo/config.json.before-effort-metadata-20260908-1732`.
