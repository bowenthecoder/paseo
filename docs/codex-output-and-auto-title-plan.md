# Codex-style output and automatic chat titles

Status: implementation plan only. Written September 9, 2026.

Owner request: “just change the output and make it so it can autorename and work like a codex cli.”

App worktree: `/Users/bowen/code/paseo-worktrees/paseo-integration`, branch `bowen/paseo-integration-20260908`. Companion plugin worktree: `/Users/bowen/code/paseo-worktrees/subscriptions-integration`. The existing [PaseoBuild integration plan](claude-workspace-ui-plan.md) owns packaging and live rollout.

## Outcome and scope

Give Paseo the quiet conversation output and dependable naming behavior of Codex CLI. Keep assistant updates readable, summarize routine tools in expandable activity rows, show actual reasoning summaries compactly, and name a conversation automatically after its first substantive prompt. The title survives reload and agrees with the native provider session where supported.

Apply the shared presentation to Codex, Claude and Grok using their available events. Codex CLI is the behavioral reference. Preserve Paseo’s existing theme, Markdown, composer, documents, subagent panel, accounts and host connections. Change output presentation and title metadata; the coding engine, tools, permissions and subscriptions keep their existing roles.

Existing folder associations remain part of acceptance: chats appear in the group associated with their recorded folder, and manual moves win. Renaming never changes a group, execution directory, Git branch or worktree. Cross-device group synchronization and new folder inference are outside this implementation.

No backend replacement, terminal scraping, new transcript database, per-command LLM summaries or continuous retitling after every prompt is needed.

## Baseline to preserve

The fork already contains native Overview grouping, expandable details, a reasoning renderer, asynchronous title generation and a guard against late generated titles overwriting manual names. Extend those seams.

The September 8 investigation found that the live local daemon loaded the original installed app bundle, while the newer chat-title trigger existed only in source. The live plugin also pointed to a separate source directory. Recheck build identities before implementation validation; the label `0.7.2` alone does not distinguish these builds. A renderer-only update cannot deliver a daemon title fix.

The evidence is in the [local investigation](/Users/bowen/Documents/ChatGPT/Tloom/outputs/paseo-cli-ux-investigation-2026-09-08.md). It describes that inspection, not a guarantee about the current runtime.

## User-visible contract

### Compact output

Use native Overview as the default for this experience. Keep one explicit Tool logs control: off shows compact native groups, on exposes the existing detailed command/output presentation. The app owns grouping; the plugin contributes compatible presentation without regrouping the same calls.

For existing profiles, migrate once to compact output when tool logs are off. Here the protected verbose choice means `toolLogs=true`. Legacy Appearance `detailed` values do not distinguish defaults from deliberate choices: this migration intentionally maps both to compact when logs are off, to apply the requested new default. Persist the migration so it never overrides subsequent user changes. Existing Appearance detail controls and the plugin control must read/write a consistent effective mode; do not leave contradictory switches.

Illustrative layout, using current typography and spacing:

```text
I’ll check where the review data reaches the page.

› Read 4 files · searched 2 locations

The template receives the data, but the gallery skips empty entries.

› Edited 1 file · ran 1 command

The gallery now handles empty entries. The focused check passed.
```

The counts and outcome text require matching event evidence; they are not canned status text.

| State                                | Presentation                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------- |
| Agent active, no more specific event | Quiet “Thinking…” status tied to the active turn                                |
| Provider reasoning summary available | Short expandable summary; full available summary in details                     |
| Known read/search/edit/test activity | Concrete action label, with counts when supported                               |
| Unknown or compound shell command    | Generic command label with exact command available on expansion                 |
| Completed routine tools              | One muted summary for the consecutive activity group                            |
| Failed or canceled call              | Visible failed/canceled state and count; no success-looking group concealing it |
| Approval or user question            | Existing actionable control remains visible outside collapsed routine output    |
| Turn complete or interrupted         | Stop active indicators immediately; retain actual final state                   |

Do not insert horizontal rules between assistant updates. Use the existing content rail and spacing owners; avoid row margins on top of list spacing. Preserve Markdown, code blocks, links, copy/fork targets, images and document opening. Use existing design tokens and compact-device touch targets.

### Grouping and labels

Group consecutive compatible tool calls within a canonical turn. Assistant messages, user messages, approvals/questions and turn boundaries remain meaningful boundaries. Use stable item/group identity so late completions update the correct row instead of appending duplicates.

Prefer provider semantics, including Codex `commandActions` and native read/search/edit descriptors. If an adapter discards useful semantics, retain a small optional presentation field while preserving the underlying command and execution detail. Do not recast a shell tool as another execution type to obtain a nicer label.

Use conservative deterministic parsing only when the provider supplies no suitable descriptor. Handle known read-only forms and common test invocations; compound commands, redirects, substitutions and ambiguous wrappers use the generic fallback. Count unique files only where concrete normalized paths are known. Keep host and working directory in path identity. A test command exiting zero supports “command succeeded”; it does not establish a numerical test-pass count.

Support expansion by click, keyboard and touch. Reuse desktop details and compact sheets. Expanded rows show original available commands, output, errors and relevant diffs. Mark truncation explicitly. Existing retention/display limits remain; this work does not reconstruct discarded output.

### Loading and streaming

Keep the existing cache, timeline reconciliation, coalescing, pagination and paced text reveal. Completed history paints immediately. Only genuinely growing live text is animated, and reduced motion is respected. Finish and interruption flush visible text promptly.

Changing output mode reprojects loaded rows as well as new events. It must not mutate persisted conversation content, subscribe to every history or rerun tools. Expanding a row preserves reading position; streaming follows the bottom only while the user is already following it. Reconnect and pagination reconstruct the same grouping without double-counting.

### Automatic titles

1. Immediately show the existing prompt-derived provisional name.
2. Prefer a supported native title when available. Otherwise run one existing Paseo title job independently of the coding turn.
3. Generated fallback names use the existing 2–6-word, 48-character contract, preserving useful project/product names. Do not truncate a persisted manual title; normal UI ellipsis remains a display concern.
4. Apply results through the existing guarded setter and `agent_update` path. Update sidebar, header and existing search metadata without navigating or changing chat identity.
5. Preserve the title on reload, reconnect, import and native resume. A manual title remains authoritative.

Cover all first-prompt entry paths: normal UI creation, empty creation followed by a first substantive prompt, MCP/CLI creation, and a resumed provisional chat. On import, read native metadata first. Avoid mass renaming old conversations: existing names with unknown provenance remain protected unless a supported source identifies them as provisional or the user requests a new name.

A substantive prompt is accepted user-authored task content, including a task expressed through an attachment. Exclude empty input, injected setup/system instructions, metadata jobs and rename-only commands. For attachment-only input, use available user text or attachment metadata; do not run another media analysis merely to name the chat.

Persist the smallest additional metadata needed to distinguish `manual`, `native`, `generated` and `provisional` names and invalidate stale jobs. Reuse current expected-title and archive guards; add a title revision if needed to cover renaming away and back to the same string. Do not build a separate title service or database.

Automatic precedence is explicit manual title, supported native title, Paseo-generated fallback, provisional snippet. Once a user renames the chat, automatic refreshes cannot overwrite it. Explicit native manual edits should synchronize where provider metadata distinguishes them; otherwise preserve the known Paseo manual title rather than guessing. Prevent notification echoes with unchanged-value/revision checks.

Sync explicit user renames through supported native APIs. Write an automatic fallback back to the provider only when its current name is still empty/provisional and its API preserves automatic-title semantics. A native rename API that always creates a custom/manual title is unsuitable for automatic fallback writeback; keep that fallback in Paseo. Never promote an echoed Paseo fallback to native/manual provenance. A later true native title may replace a Paseo fallback, but not a manual name; an existing native manual title is preserved.

Deduplicate fallback jobs by agent/session and prompt revision. When the adapter verifies native automatic naming, wait for the first completed turn and perform a bounded native metadata refresh before scheduling a fallback; do not race a second generator at prompt submission. For adapters without that verified capability, schedule fallback after the accepted first prompt and existing-name check. If a turn is interrupted or fails, perform the same bounded metadata check before fallback on an eligible provisional chat.

Cancel or discard results after archive, deletion or manual rename, and bound jobs by the existing generation timeout. Failed naming leaves a useful provisional title and concise diagnostic. Persist attempt state: allow one transient-failure retry after the next successfully completed user turn, with no further automatic retries. Resume/render alone never resets attempts. Naming failure must not fail the coding turn or create a visible extra conversation.

Use the same provider profile/session identity for native synchronization. Respect explicit metadata-provider configuration; otherwise choose the chat’s configured account for fallback generation. Do not introduce API-key billing or new provider fallback routes. Reuse a compatible existing metadata result when one is already being generated, without triggering branch/workspace naming as a side effect of chat naming.

## Implementation sequence

### 1. Establish the working baseline

- [ ] Record app/plugin heads, uncommitted changes, installed bundle identity and selected CLI/SDK versions. Preserve concurrent PaseoBuild work.
- [ ] Inspect actual saved output preferences in an isolated profile and reproduce detailed versus Overview behavior.
- [ ] Capture a small Codex CLI reference covering read/search/edit/test, reasoning, failure and final-answer states. Record version, viewport and theme; compare behavior and density against this fixed reference.
- [ ] Use the development/QA harness with isolated daemon state and unused ports. Coordinate expensive builds and provider runs with the integration owner.

Exit: reproducible baseline and exact files/builds to change; the title-serving daemon is identified.

### 2. Unify compact output selection

- [ ] Wire existing overview/detailed preferences and Tool logs to the agreed effective modes.
- [ ] Add the one-time preference migration; explicit verbose choices survive.
- [ ] Reproject loaded timelines when settings change. Remove duplicate transformer ownership only where it conflicts with native grouping.
- [ ] Verify assistant Markdown and copy/fork/document actions remain intact.

Exit: logs off gives grouped activity on existing and new chats; logs on reveals details immediately without reload.

### 3. Improve activity and reasoning rows

- [ ] Preserve provider action metadata and extend the existing overview presenter with concrete labels and truthful counts.
- [ ] Carry running/failed/canceled counts and retain visible approval/question controls.
- [ ] Separate provider reasoning summaries from tool output; reuse text reveal where the plugin path bypasses it.
- [ ] Preserve stable grouping, expansion, truncation labels, keyboard access, screen-reader state and compact-device behavior.

Exit: a mixed tool turn is readable, accurately labeled and inspectable within existing output limits.

### 4. Complete title generation and synchronization

- [ ] Add minimal optional title provenance/revision fields to the existing persisted record, conservatively handling legacy names.
- [ ] Route all first-substantive-prompt paths through the same deduplicated scheduling entry.
- [ ] Extend delayed-result guards and failure handling; isolate chat naming from workspace/branch naming.
- [ ] Codex: read existing native names and handle supported `thread/name/updated` notifications; write explicit user names through `thread/name/set`. Apply the automatic-writeback provenance rule before considering fallback synchronization. Target the existing session/profile and prevent echoes.
- [ ] Claude: use installed SDK `getSessionInfo`/`listSessions` metadata and `renameSession` where supported. Replace first-prompt-only import selection. Check native metadata after the first completed turn and relevant resume/import operations. Do not edit session JSONL or add a transcript watcher.
- [ ] Grok/other adapters: use a documented native title capability if available; otherwise persist the shared Paseo title. Do not invent provider events or claim unverified native synchronization.
- [ ] Add wire fields only if the app needs them. Follow [protocol compatibility](protocol-compatibility.md); gate new host capabilities once rather than simulating them across old RPCs.

Exit: new and provisional resumed chats acquire useful names, supported native names synchronize, and manual names survive late updates.

### 5. Verify the combined experience

Run the acceptance matrix against the integrated app and matching plugin. Separate deterministic fixtures from real-provider evidence: fixture rendering proves layout/replay, not subscription/provider behavior.

Use harmless real-provider tasks in temporary directories for Codex, Claude and Grok, including a deterministic failure and manual-rename race in isolated conversations. Run only focused test files affected; never run the full local suite. Use repository typecheck, lint and formatting scripts. Rebuild owning workspace dependencies before diagnosing stale generated declaration errors.

Exit: passing focused checks and inspected desktop/compact screenshots, with actual native-device coverage or its precise limitation recorded.

### 6. Package a review candidate

Build matched renderer, daemon and plugin artifacts through the existing integration procedure. Record source heads, CLI/SDK versions and bundle checksums. Verify the packaged daemon contains the title changes; do not infer this from the renderer or shared `0.7.2` version.

Show before/after output and naming evidence. Preserve existing chats, groups, drafts and preview artifacts. The [integration rollout gate](claude-workspace-ui-plan.md#live-source-reconciliation-and-final-build-gate) owns later installation or service restart. This request authorizes writing the plan, not publishing it or replacing the live application.

## Code map

These are implementation entry points, not a requirement to edit every file. Prefer the smallest change satisfying acceptance.

| Area                         | Existing app path                                                                                                                                                                                   |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Output selection             | `packages/app/src/hooks/use-settings/storage.ts`; settings Appearance section                                                                                                                       |
| Grouping and labels          | `packages/app/src/tool-calls/detail-level/projection.ts`, `grouping.ts`, `overview/model.ts`, `overview/view.tsx`                                                                                   |
| Layout and reveal            | `packages/app/src/agent-stream/`; `packages/app/src/hooks/use-revealed-text.ts`; [streaming contract](agent-stream-performance.md)                                                                  |
| Provider semantics           | `packages/server/src/server/agent/providers/codex/tool-call-mapper.ts`; relevant Claude/ACP mapper only when needed                                                                                 |
| Provisional names/scheduling | `packages/server/src/server/agent/create-agent-title.ts`; `packages/server/src/server/workspace-auto-name.ts`; first-prompt handlers                                                                |
| Persistence and guards       | `packages/server/src/server/agent/agent-manager.ts`; existing persisted agent schema                                                                                                                |
| Native names                 | `packages/server/src/server/agent/providers/codex-app-server-agent.ts`; `packages/server/src/server/agent/providers/claude/agent.ts`; `agent-sdk-types.ts` only if an optional capability is needed |
| Folder regression only       | `packages/app/src/components/sidebar/manual-chat-groups.ts`                                                                                                                                         |

The companion plugin is outside this app worktree. Relevant files: `cli-look.client.ts`, `cli-timeline.client.tsx` and `cli-format.ts` in `/Users/bowen/code/paseo-worktrees/subscriptions-integration`. Do not add a second plugin copy because the separate `paseorevised` repository has an integrated directory. Resolve the deployed plugin source through the integration owner.

## Acceptance matrix

| Case                                      | Required result                                                                   |
| ----------------------------------------- | --------------------------------------------------------------------------------- |
| Repeated successful reads/searches        | Stable compact group, correct counts and expansion                                |
| Compound/unknown command                  | Truthful generic label; exact command available                                   |
| Test invocation                           | No invented pass count; actual results inspectable                                |
| Failure/cancellation/approval/question    | Visible state and working controls without expansion                              |
| Missing/present reasoning summary         | Generic active status or provider summary; no invented internal thinking          |
| Completion/interruption                   | Indicator stops, visible text completes, final answer stays distinct              |
| Output toggle mid-turn                    | Loaded/future rows change once without loss or duplicates                         |
| Reload/reconnect/pagination boundary      | Same completed content, grouping and counts; no replay animation                  |
| Scrolled up/expanded details              | Stable reading anchor; no forced bottom jump                                      |
| New chat with prompt                      | Immediate provisional title; asynchronous useful replacement                      |
| Empty chat then prompt; MCP/CLI create    | Same behavior through shared lifecycle path                                       |
| Imported/resumed native title             | Supported metadata used and preserved through reopen                              |
| Explicit rename written to native session | Reopening that same native session shows the chosen user title                    |
| Native manual title already exists        | Import and fallback generation preserve it                                        |
| True native title arrives after fallback  | Native title replaces only provisional/generated values; manual title wins        |
| Fallback writeback or notification echo   | Automatic origin stays automatic; no accidental custom/manual promotion           |
| Unknown-origin legacy title               | Preserved; no bulk string-based reclassification                                  |
| Manual rename during generation           | Manual value wins, including rename-away-and-back race                            |
| Duplicate/out-of-order native update      | No echo loop, duplicate worker or stale overwrite                                 |
| Archive/delete during generation          | No title update revives/recreates the chat                                        |
| Generator unavailable                     | Main turn succeeds, useful title remains, retry bounded                           |
| Two account profiles                      | Correct native session/account targeted                                           |
| Associated folder/manual group            | Existing grouping works; title change never moves membership or execution folder  |
| Desktop/compact viewport                  | Readable rail, keyboard/touch expansion, visible errors/input and usable composer |
| Packaged candidate                        | Actual bundled daemon names chats and renderer applies output contract            |

Extend `packages/app/src/tool-calls/detail-level/projection.test.ts`, `packages/server/src/server/workspace-auto-name.test.ts`, `session.create-agent-title.test.ts` and existing provider/manager title cases where they own behavior. Add focused presenter/browser cases only for uncovered contracts. Include folder-group regression and affected streaming/reconnect cases once. Coordinate with the integration lane so passing checks are not redundantly rerun.

Capture 1440×900 desktop, current laptop size and 390×844 compact browser views. Actual phone verification is separate. Compare the same completed turn before/after reload and record a provisional-to-final title transition. Measure first visible history, first live text and scroll behavior with the existing harness; introduce no title request or whole-history fetch on the main first-render path.

## Completion and rollback

Implementation is ready when acceptance passes, the combined candidate is visually reviewed, and changed app/plugin source is recorded in the integration lane. Update this checklist and the existing integration validation record with actual commands, results and artifact paths. Planned checks are not completed tests.

Keep the previous candidate and profile backup. Returning to that build must not revert provider login state or delete conversations. New title fields are optional so older readers retain the existing title string. Preserve manual names produced during evaluation. Reverting presentation must not require a transcript rewrite.

## Source contracts

- [Codex app-server](https://learn.chatgpt.com/docs/app-server): typed activity, native name metadata and updates. Verify against the candidate CLI.
- [Codex changelog](https://learn.chatgpt.com/docs/changelog): native automatic terminal titles are the behavioral reference, not proof every frontend gets its trigger.
- [Claude SDK reference](https://code.claude.com/docs/en/agent-sdk/typescript): check session title APIs against the installed SDK.
- [Grok sessions](https://docs.x.ai/build/features/sessions): use only capabilities available through the selected integration.

No account migration or backend-selection decision is required to begin these bounded changes.
