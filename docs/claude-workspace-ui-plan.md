# Paseo workspace and agent UI review

Updated: 2026-09-09. Integration branch: `bowen/paseo-integration-20260908` in
`/Users/bowen/code/paseo-worktrees/paseo-integration`.

The current task combines all pending app and subscriptions changes, fixes their interactions,
and tests the resulting candidate until it is ready to publish. Bowen explicitly instructed that the candidate must not be pushed live automatically.
The installed app and preceding preview remain backed up and unchanged; the final candidate
must include the matching app, daemon and subscriptions plugin, with screenshot review before rollout. The verification table below separates the completed app checks from any remaining plugin or
rollout work.

The [Codex output and automatic-title plan](codex-output-and-auto-title-plan.md) specifies the
September 9 output/naming follow-up. Implementation is pending and uses this integration's
existing packaging and rollout gate.

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
- Keep the primary chat beside documents, Tasks and managed/provider-native children. Restore
  the earlier **Open in (O) → Open in split view (S)** chat action, as Bowen explicitly requested
  during the final audit. A second chat on the same device opens on the right with its own folder
  and draft. Repeated opening reuses that view; closing it does not archive the chat. Current view
  remains available. Generic split-below and cross-device panes are outside this layout; see
  [Side panel](./side-panel.md).
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

| Resource                             | Location or status                                                                                                     |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Latest app + preview backup          | `/Users/bowen/Applications/Paseo Backups/20260908-231515-pre-live-merge` (both app bundles, preview profile, manifest) |
| Source snapshots                     | `/Users/bowen/.paseo-backups/pre-live-merge-20260908-231515` (original and candidate app/plugin working trees)         |
| Installed app backup                 | `/Users/bowen/Applications/Paseo Backups/20260908-162435/Paseo.app`                                                    |
| Original and backup app.asar SHA-256 | `67818f9ed4f246484ef5cdc82a59f7be3d3587215c1c8b1d5049a2052b390f9b`                                                     |
| Mac project worktrees                | `/Users/bowen/code/paseo-worktrees/{hermes,dashboard,tloom}`                                                           |
| VPS project worktrees                | `/home/codex/code/paseo-worktrees/{hermes,dashboard,tloom}` on `hostinger-support`                                     |
| App integration                      | `/Users/bowen/code/paseo-worktrees/paseo-integration`                                                                  |
| Subscriptions integration            | `/Users/bowen/code/paseo-worktrees/subscriptions-integration`                                                          |
| Screenshot/review folder             | `/Users/bowen/Desktop/paseo-preview-20260908`                                                                          |

All six project worktrees were registered during the earlier feature work and rechecked at the
final integration checkpoint: each exists on its requested device, retains its dedicated branch
and has a clean working tree. Operational checkouts remain intact. The production daemon on port 6767 must not be restarted as part of testing.

Before refreshing the review executable, back up its current profile and manual groups again.
User-created groups such as PaseoBuild and CueRetail survive refreshes. The preview uses its own
profile with built-in daemon management disabled. Capture its actual window without navigating
or resizing the user's session. At Electron zoom, use raw CDP `Page.captureScreenshot` without
clipping; Playwright's CSS-scaled capture cropped the visible composer. See
[Browser capture harness](./browser-capture-harness.md).

## Live-source reconciliation and final build gate

The installed renderer predates the usage integration. Its original source checkout is release
`9400a49af670fdb5db4af58e73f8df98588dbea9` plus 47 local changes. All 47 are accounted for in the
candidate: 32 identical files, 14 evolved implementations and the workspace split menu now being restored through the retained right panel. Both original feature commits are ancestors of the integration branch.
The original subscriptions checkout has 10 local changes; all match its preserved source snapshot
and are included or superseded in the plugin integration. Live configuration still points to that
original plugin, so an updated renderer alone would not update live quota/provider behavior.

The current preview and installed app are preserved independently. The next package goes to
`packages/desktop/release/reviewed-final`, with source heads and bundle checksums recorded beside
the compiled subscriptions plugin. Do not replace `/Applications/Paseo.app`, the preceding preview,
or the running production daemons as part of readiness testing.

The final validation includes new-chat/draft recovery, streamed Markdown/diagrams, image loading
and zoom, independent chat and sidebar scroll, right-panel resize/return, terminal creation and
retention, provider effort/context/subscriptions, and subagent output/recovery. Stress checks use
bounded runs and isolated daemon state. The latest owner clarification restores two distinct chats side by side through the existing right panel. It must pass the same folder, draft, archive and reload checks as other supporting views.

## Source being combined

| Input                 | Checkpoint                                                | Meaning                                                                                                                                                               |
| --------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Original app features | `85d2c46` on `bowen/claude-workspaces-subagents-20260908` | Earlier published review source, including feature commit `5164b55`                                                                                                   |
| Preview fixes         | `a38a19c80` on `bowen/paseo-preview-fixes-20260908`       | Encoded images, quiet glow, No folder, document/small-window and History fixes                                                                                        |
| Held composer queue   | `ec7c8221e`                                               | Merged into the app integration branch at `abbb668d3`                                                                                                                 |
| Single-chat layout    | `76ed838`                                                 | Combined with fixes for routing, migration, selection, drafts and test coverage                                                                                       |
| Oversized responses   | `b7a94dae4`                                               | Held-session handoff, rebased onto `517f88b27`: byte-budget timeline pages and isolate oversized response failures; reviewed corrections are required before merging. |
| Subscriptions         | `efe9f9c`                                                 | Registration/quota, unknown-value handling, Tool logs and the latest Routines registry from `f1ed0ed`                                                                 |

The app integration combines the feature, preview, queue and single-chat inputs. A final worktree audit also found the separate oversized-response daemon fix; it is backed up and under integration review. Source worktrees owned by the other tasks
remain clean and unchanged at the checkpoints above. Review branches:
[app integration](https://github.com/bowenthecoder/paseo/tree/bowen/paseo-integration-20260908) and
[subscriptions integration](https://github.com/bowenthecoder/paseo-subscriptions/tree/bowen/paseo-integration-20260908).
The transport, restored split and combined app fixes were pushed at `ec19eaf36`; the subscriptions integration was pushed at
`efe9f9c`. Draft reviews are [app #1](https://github.com/bowenthecoder/paseo/pull/1) and
[subscriptions #1](https://github.com/bowenthecoder/paseo-subscriptions/pull/1).

The final source audit also found the pending desktop ownership fix in the separate
`/Users/bowen/code/paseorevised` checkout at `8f6e993e1`. Its six changed files and exact patch
are preserved in the source backup's `paseorevised-desktop-ownership` directory. The candidate
includes that fix: quitting a desktop profile can stop only a supervisor spawned by that
Electron process, and only when built-in daemon management is enabled. All 26 focused desktop
tests, desktop typecheck, scoped lint and formatting passed; the original source remains untouched.

## Integrated verification and release readiness

Focused checks ran with one worker and isolated test daemons. No full local test suite was run.
[QA](./qa.md) owns the evidence standard and [Testing](./testing.md) owns test conventions.

| Area                           | Observed integration result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chat organization and composer | Group CRUD/reload, pinning, drag/drop, folder association, immediate menu letters, archive/navigation races, held queue, draft recovery and compact navigation passed. Twenty-four retained workspace/worktree lifecycle cases pass, including offline-host preselection, last-workspace archive, risk confirmation, and restart/restore.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Documents and images           | Encoded/literal-percent paths, missing/corrupt/cache recovery, remembered-size loading/error rows, Preview/Source editing and saving, unsaved drafts, image refresh and unforced zoom passed. The original image hover handlers failed the same CSS check that the shared-hover fix passes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Layout and children            | Primary/side migration, parent selection, independent drafts/folders, child diff contents, overflowing rail, grandchild/reload, child slash commands, terminal activity and worktree cwd passed. Native Tasks history now retries failed loads and refreshes after reconnect without dropping cached output. Six recovery and ten selection cases plus the transport-level Retry browser case pass.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Plugin panels                  | Workspace/agent context, secondary host preservation, command collisions, compact rendering and unavailable state passed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Focused code checks            | 191 layout/child checks, additional targeted slash/file/rail/menu/archive checks, four Tasks browser component checks, the image hover component check and 12 desktop updater checks passed. Earlier overlapping runs are not added together.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Real Codex / Claude / Grok     | Eight final cases passed: three native subagent flows, four real replies with supported effort and subscription/context usage (both Codex accounts), and one short-title flow.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Subscriptions                  | Registration (15), quota (18), Tool logs (9) and Routines (289) focused checks passed. Types and real plugin bundles passed. The installed-plugin browser flow passes verbose/compact activity, both toggle directions and reload persistence with no page exceptions. Lint retains five baseline findings in usage files and eleven across the broader plugin; these fixes added none.                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| App quality                    | Full repository formatting, lint (zero warnings/errors) and full workspace typecheck passed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Packaged app                   | Electron export, desktop build, ARM64 package and local signature verification passed for the preceding preview. The latest real Electron browser harness passes viewport, inactive capture, focus continuity, native browser tools, selection and right-panel geometry; its redundant Escape was removed because menu selection already dismisses the menu. The updated renderer at `517f88b27` has since passed a real packaged startup/CLI/terminal smoke and ten isolated chat/document switch cycles, draft recovery, encoded files and UI submission. The restored split and final transport corrections still require a refreshed package. This is a locally signed preview, not a notarized public release.                                                                                                                                  |
| Actual-chat preview            | Refreshed the separate preview at 22:06 EDT. Manual groups match the backup exactly; the nonempty saved draft is retained. Migration pruned two empty draft records. Screenshots at the current display size and 1280×820 show the chat/composer with no image errors.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Source publication / CI        | Both integration branches are pushed with draft PRs. Full review CI is tracked on the app PR. Fork Actions registration was enabled. The first full run [34302543655](https://github.com/bowenthecoder/paseo/actions/runs/34302543655) was canceled after identifying obsolete sidebar selectors and two server fixture omissions. Its app tests (5,039), SDK, relay, CLI shards, Windows desktop tests and quality checks passed. The next run [34305191577](https://github.com/bowenthecoder/paseo/actions/runs/34305191577) passed 5,045 app tests, Linux and Windows server tests, SDK/relay/CLI, Windows desktop tests, quality checks, and all 34 desktop renderer cases. It reproduced the extra-Escape native harness issue, now fixed and passing locally. The current recovery fixes and remaining browser results still require final CI. |
| Installed app / live daemons   | Held for the requested screenshot review. The installed app and production daemons have not been replaced or restarted.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

The fresh profile backup is
`/Users/bowen/Desktop/paseo-preview-20260908/profile-before-integration-20260908-220615`.
`current-chats.png` and `current-chats-small-mac.png` show the actual connected chats and groups.
`preview-after-refresh.json` and `preview-small-mac.json` record dimensions, bundle identity and
preservation checks. The temporary small-window instance was closed after capture; the main
review preview remains available. Capture did not navigate or resize the user's main preview.

The separate `docs/codex-output-and-auto-title-plan.md` is preserved as requested by the Held-session handoff. It is explicitly a plan; its future extensions are not claimed as implemented behavior.

Final focused browser evidence is spread across the regression, recovery and impact batches;
red runs were followed by targeted fixes and rechecks. Key logs:

- `/tmp/paseo-integration-regression-final-browser.log`: 21 passing cases; its four failures were resolved in subsequent targeted passes.
- `/tmp/paseo-integration-recovery-final-browser.log`: documents, responsive navigation, mock native Tasks and draft migration.
- `/tmp/paseo-integration-last-five-browser.log`: complete managed-child flow, wrapped worktree cwd and failed-setup revisit.
- `/tmp/paseo-integration-zoom-web-browser.log`: image Preview/Source/refresh/zoom and plugin panel/host/compact flow, both passing.
- `/tmp/paseo-integration-zoom-baseline-browser.log`: original hover handlers fail the same normal interaction.
- `/tmp/paseo-integration-real-browser.log`: all eight real-provider cases passed; the separate installed-plugin case reproduced a switch accessibility issue that was then fixed.
- `/tmp/paseo-integration-tool-logs-final-browser.log`: the actual installed plugin passes Tool logs on/off and reload persistence after fixing startup overwriting its saved preference.
- `/tmp/paseo-subscriptions-startup-{red,unit,types,lint,bundles}.log`: the startup regression fails against the original reset and passes after preserving synchronous hydration; plugin checks and actual compilation pass.
- `/tmp/paseo-integration-management-final-browser.log`: all 24 workspace/worktree lifecycle cases pass.
- `/tmp/paseo-integration-error-recovery-browser.log`: Tasks Retry, three provider Tasks flows, compact parent-draft return, GitHub search failure/recovery, and all six assistant fork flows pass; its remaining title-menu selector was corrected separately.
- `/tmp/paseo-integration-native-browser-recheck.log`: the real Electron browser harness passes after removing an extra Escape that closed the right dock.
- `/tmp/paseo-integration-files-directory-browser.log`: all six directory/empty-project cases pass. The remaining image failure reproduced locally and its explorer test now follows the file rail after create/rename.
- `/tmp/paseo-integration-image-hover-recheck-browser.log`: complete explorer create/rename/copy/delete flow passes; the attempted capture handler exposed React Native Web filtering that event.
- `/tmp/paseo-integration-ui-recovery-browser.log`: 14 cases pass, including normal image zoom/refresh, both model-profile transitions, Settings Escape, terminal creation/PTY focus, and all five focus-mode cases. The streaming remount was corrected with stable message/row identity. The subsequent reload assertion exposed duplicated cached Markdown; retaining cached sequence coverage fixes it, and the strict final browser check passes.
- `/tmp/paseo-integration-project-navigation-browser.log`: all eight host/project-preservation, launch-memory/terminal, project-status/settings, sidebar-scroll and reconnect checks pass.
- `/tmp/paseo-model-picker-height-{red,unit}.log`: fixed picker height violated available screen space; the regression is reproduced and all eight frame-style tests pass after clamping both minimum and maximum height.
- `/tmp/paseo-subscriptions-unknown-quota-{red,unit,types,lint}.log`: 18 quota cases and types pass; unknown metrics no longer become false zeroes. The fix is in `c6551ae`; the latest Routines registry was then merged at `efe9f9c`, and both plugin bundles were compiled again.

- `/tmp/paseo-integration-changes-diagram-browser.log`: 36 of 38 cases passed, including comparison handoff, live Changes updates, file operations, resizing and scrolling. The remaining collapse hover fixture and cached diagram reload issue were resolved and passed in the final two-case recheck.
- `/tmp/paseo-restored-claude-actions-browser.log`: all 14 cases pass: independent two-folder chat splits, O→S, Current view, close/reload, immediate A, pins/groups/dragging, keyboard navigation, native Tasks retry and retained older history, and Codex/Claude/Grok/compact task views.
- `/tmp/paseo-integration-final-two-browser.log`: both final cases pass, including daemon Markdown equality, unchanged iframe identity while streaming/completing, and a rendered SVG after reload.
- `/tmp/paseo-subscriptions-latest-registry-{tests,types}.log`: all 289 registry checks and typecheck pass after merging the latest original plugin source.
- `/tmp/paseo-github-search-{before-fix,server-tests,app-tests}.log`: all-failed search reads reproduce a false empty result, then pass the correction with partial results/auth states retained.
- `/tmp/paseo-integration-final-{format-check,lint,typecheck}.log` and `/tmp/paseo-integration-post-ci-{format-check,lint,typecheck}.log`: full app quality checks.
- `/tmp/paseo-integration-{export,desktop-main-build,desktop-package,sign-verify}.log`: packaged preview checks.

Workspace lifecycle tests now explicitly choose the retained project view; ordinary chat flows keep the manual default. The migration preserves whole-workspace archive assertions separately from per-chat archive. An optimistic activity gap found during the CI repro was fixed: manual chat rows now use the same submission and turn state as the composer. Fifteen focused activity checks and all three strict consecutive-turn browser checks pass. Broader CI remains a separate release gate. Native
iOS/Android devices were not exercised in this pass; compact Chromium and macOS were.

- [x] Preserve the installed app and create the six requested project worktrees.
- [x] Combine the pending app/plugin inputs in isolated worktrees.
- [x] Complete the selected app regressions and real-provider flows.
- [x] Run full app formatting, lint and workspace types.
- [x] Package, verify, back up and capture the refreshed actual-chat preview.
- [x] Finish the installed-plugin Tool logs reload regression.
- [x] Push both integration branches and start the full CI run.
- [x] Resolve and recheck image controls, small-screen model selection, focus/terminal actions and Escape routing.
- [x] Finish the remaining diagram reload and folder hover checks.
- [x] Finish the restored chat-split and retained-task-history browser checks (14/14 pass).
- [ ] Integrate the Held-session oversized-response handoff after correcting its pagination and byte-limit issues.
- [ ] Rebuild the matching app/server/plugin candidate and rerun final artifact and bounded stress checks.
- [ ] Resolve or explicitly account for the full CI results.
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
