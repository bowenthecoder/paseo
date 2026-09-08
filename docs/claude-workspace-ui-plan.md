# Paseo workspace and agent UI review

Updated: 2026-09-08. Branch: `bowen/claude-workspaces-subagents-20260908`.

## Bowen's requirements and accepted corrections

- Match the supplied Claude desktop screenshots: neutral `#111111` sidebar, `#151515` main surface, `#343434` selection, warm `#c3c2b8` chat text, compact 30 px desktop chat rows. Preserve comfortable touch targets.
- Back up the old installed app before replacement. Show screenshots of the new executable with actual current workspaces and chats first. **Installation and live replacement are on hold for this review.** Earlier live publishing authorization does not override this latest instruction.
- Simplify the sidebar to Pinned, manually created groups, and Ungrouped. Start existing chats ungrouped instead of displaying automatic host/repository groups. Preserve chat history, working folders, repositories, and worktrees.
- Add New group, rename/remove group, drag chats between groups, and Move to group in the context menu. Pin/unpin chats; pinned chats appear first. Removing a group returns its chats to Ungrouped.
- Let the user choose Local or a remote machine and the actual working folder. Explicitly associated folders should put new chats in the correct user-created group; manual moves take precedence. Do not silently change an existing chat's execution directory by dragging its sidebar row.
- Right-click a chat and press its displayed letter to execute the action. **A archives immediately**, P pins/unpins, U toggles unread, R renames; include fork/delete and split-view actions. Typing in an input must not trigger these shortcuts.
- Support Open in / Split right / Split below and validate working pane navigation.
- Generate short meaningful chat titles, approximately 2–6 words, instead of long first-prompt snippets. Preserve manual renames and archived chats against delayed automatic naming.
- Codex and Claude model selectors expose supported effort options. Show real subscription usage while using the app alongside context usage, including loading, unavailable, reconnect, and refresh states.
- Grok 4.6 exposes actual effort levels. **The Fast option was explicitly withdrawn: do not add Fast mode.**
- Validate Codex, Claude, and Grok subagent support end to end: X running tasks, a task list opening on the right, viewing a child, and reported token usage. Never fabricate unavailable metrics or simulate provider support as if it were real.
- Set up Hermes, CueRetail Dashboard, and Tloom Git worktrees on this Mac and the authorized VPS. Keep operational checkouts intact.
- Run focused automated checks and Playwright end to end, inspect real rendered screenshots, address bugs, and push the finished changes from Git worktrees.

## Preserved backup and worktrees

- Installed app backup: `/Users/bowen/Applications/Paseo Backups/20260908-162435/Paseo.app`.
- Original and backup app.asar SHA-256: `67818f9ed4f246484ef5cdc82a59f7be3d3587215c1c8b1d5049a2052b390f9b`.
- Mac project worktrees: `/Users/bowen/code/paseo-worktrees/{hermes,dashboard,tloom}`.
- VPS project worktrees: `/home/codex/code/paseo-worktrees/{hermes,dashboard,tloom}` on `hostinger-support`. All six registered in Paseo; no operational service was restarted.
- Implementation worktree: `/Users/bowen/code/paseo-worktrees/paseo-ui`. Earlier changes copied from the separate checkout without removing it. Never restart the production daemon on port 6767 during this work.

## Implementation plan

- [x] Preserve installed app and checksum it; create linked implementation worktree.
- [x] Implement initial shortcuts, split view, model effort controls, live account usage, Grok effort, and guarded short auto-titles; focused initial checks passed.
- [x] Correct Claude theme against measured reference colors.
- [x] Replace automatic sidebar grouping with persistent manual groups, pinning, drag/drop, group menus, and folder association.
- [x] Verify machine/folder selection and correct new-chat group placement.
- [x] Audit and implement provider subagent activity/token reporting (provider_subagents agent).
- [x] Build running-task trigger, right task panel, child navigation and token display (subagent_ui agent).
- [x] Integrate and run focused typecheck/lint/unit checks plus Playwright on grouping, shortcuts, folder routing, split view, usage, and subagents.
- [x] Run real-provider checks for Codex, Claude, and Grok with harmless test tasks in isolated directories; record actual supported/unsupported metrics.
- [x] Package preview, inspect screenshots using actual open workspaces, and show review artifacts.
- [x] Commit and push checked source changes to a review branch; record remote URL and checks.
- [ ] Replace installed/live app only after the requested screenshot review is complete.

## Verification rules

Run targeted tests with one worker and log output; do not run the full local suite. Coordinate builds and provider E2E across agents. Protect original chat data and production daemons. All claims of success require observed results; “no bugs” is the quality objective, not a guarantee beyond tested coverage. Keep this plan updated with results and unresolved issues.

## Integration findings and checked behavior

Manual rows now represent root agent conversations, keyed by host and agent ID. Two conversations sharing a workspace remain independently pinnable, movable, renameable and archivable. Empty folders/worktrees are excluded from the chat list, while their registered projects remain selectable. Metadata uses paginated directory demand, without subscribing to every transcript. Child tasks stay in their parent's Tasks pane.

Browser checks have passed group create/rename/remove and reload persistence, drag into a group/Pinned/Ungrouped, unread/read on opening, per-chat archive while its sibling stays open, letter rename and split navigation, and compact 30 px rows. Nine grouping/projection unit checks and five explicit chat-target identity checks pass. Folder association initially lost its project ID; the group now stores that ID with its host/path and supplies it on New chat. Group removal uses unfiltered hydrated membership so hidden chats return to Ungrouped as well.

Real native subagents passed on Claude Sonnet 5, Codex B Sol and Grok 4.6: child appears running, Tasks pane opens on the right, output and reported tokens render, and child state survives reload. The final seven-case real-provider run also verified the parent final reply and context/account usage for Claude, both Codex accounts and Grok. A separate real Codex test verified short title generation. Codex child usage no longer overwrites parent usage; Grok native lifecycle and child channels are preserved through ACP replay. Grok native subagents required enabling its existing local configuration; the original is backed up at `~/.grok/config.toml.before-paseo-subagents-20260908-164637`.

Subscriptions wiring is committed and pushed at `https://github.com/bowenthecoder/paseo-subscriptions/tree/bowen/provider-usage-wiring-20260908` (commit `28a9ef6`). Typecheck and 15 focused registration checks pass. The quota follow-up is pushed as `c17cc02`; 13 focused parser/cache/pill checks and an additional real Codex B browser run passed, with the UI showing the reported Weekly label. Primary accounts reuse matching built-in provider aliases; disabling a built-in writes `enabled: false`, since removing its override would re-enable the default. Other accounts and profile settings survive the toggle round trip. Live replacement is still on hold.

## Final verification and preview artifacts

Focused checks passed; no full local test suite was run. The final commit hook checks formatting, lint and the full workspace typecheck.

| Area                  | Observed result                                                                                                                                                                                                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Manual chat groups    | All six browser scenarios passed across focused reruns: independent sibling chats, group CRUD/reload, drag/drop, pin/unpin, folder selection and creation, archive/unread, letter actions, split navigation and density.                                                          |
| Keyboard navigation   | Two browser scenarios and 85 focused unit cases passed, including selecting different chats in the same workspace and pinning while Pinned is collapsed.                                                                                                                          |
| Live provider tasks   | Claude, Codex B and Grok each created a real native child; running count, right task pane, output, numeric reported tokens, parent final reply and replay after reload passed.                                                                                                    |
| Live effort and usage | Claude, Codex A, Codex B and Grok each replied using the requested effort with account usage and context shown. Both Codex accounts passed again with label-only model overrides to exercise native metadata inheritance.                                                         |
| Short titles          | One real Codex title-generation browser case passed; targeted persistence checks protect manual renames and archived chats from delayed title generation.                                                                                                                         |
| Provider contracts    | 55 registry checks, 99 shared ACP checks, five Grok child checks, a focused Codex child-usage check, and 12 Claude/Codex effort passthrough cases passed.                                                                                                                         |
| Quota duration        | Thirty native Codex parser cases and four existing Codex quota-service cases passed. Weekly versus five-hour labels follow reported duration, never window position or reset countdown. Missing percentages remain unknown; malformed numeric metadata cannot become zero or one. |
| Compact layout        | The compact task sheet browser case passed; manual chat touch rows retain 44 px targets.                                                                                                                                                                                          |
| Packaged renderer     | Actual current chats hydrated across three hosts, no observed renderer page errors, and screenshots were inspected against the supplied reference.                                                                                                                                |

Review folder: `/Users/bowen/Desktop/Paseo Preview 20260908`. `current-chats.png` shows actual current conversations. The user-created PaseoBuild and CueRetail groups appeared during preview use and have been preserved. `Provider checks/` contains separate, clearly identifiable real-provider smoke-test screenshots; those test conversations are isolated from current production chats.

The preview uses a separate desktop profile with built-in daemon management disabled. It connects to current hosts for the existing-chat screenshots. New provider adapters were validated on isolated daemons; existing production hosts keep their running daemon versions until live rollout. In particular, the new Grok effort/child adapter and corrected quota labels require the new daemon/plugin source when deployed. The installed app and production daemon on port 6767 were not restarted or replaced.

Mac and VPS Codex model metadata were repaired with backups and safe configuration reloads. The VPS backup is `/home/codex/.paseo/config.json.before-effort-metadata-20260908-1732`. Each configured VPS model was matched to that VPS's own CLI model cache. Native Codex capability inheritance is also fixed in source so future label-only overrides retain effort controls.

## Pushed review source

App feature commit `5164b55` is pushed to `https://github.com/bowenthecoder/paseo/tree/bowen/claude-workspaces-subagents-20260908`. Its commit hook passed formatting, lint (zero warnings/errors) and the full workspace typecheck. Subscriptions is pushed through `c17cc02` on the branch linked above. Both implementation worktrees were clean after their feature commits.

The complete locally signed review candidate is `packages/desktop/release/reviewed/mac-arm64/Paseo.app` in the app worktree. Its signature verifies. The review folder includes `Open preview.command`, the checks, screenshots and a separate `manual-chat-groups-backup.json` preserving groups made during preview use. The installed app's checksum was checked again after packaging and still matches the original backup.
