# Agent lifecycle

How an agent is created, runs, becomes a subagent, gets archived, and disappears from the UI. The model spans the daemon (lifecycle, archive) and the client (conversation views and Tasks). See [Side panel](./side-panel.md) for placement and saved-layout migration.

## States

```
initializing → idle → running → idle (or error → closed)
                 ↑        │
                 └────────┘  (agent completes a turn, awaits next prompt)
```

Each live agent in `AgentManager` carries a `lastStatus` of `initializing`, `idle`, `running`, or `error`. `closed` is the persisted, resumable state for an agent record that has no live provider runtime. State transitions persist to disk and stream to subscribed clients via WebSocket.

## Runtime residency

An unarchived agent may be `closed` without being deleted or archived. Closing releases its provider
processes and subscriptions while retaining its Paseo identity, persistence handle, timeline,
workspace, labels, title, usage, attention, timestamps, and parent relationship. Opening or prompting
the agent runs through `ensureAgentLoaded()`, which resumes the durable provider session under the
same Paseo agent ID. Provider history is not appended again when the canonical timeline is already
primed.

Idle agents remain resident indefinitely. Runtime closure happens only through an explicit lifecycle
action such as archive, replacement, reload, workspace teardown, or daemon shutdown.

A provider runtime can still die on its own — crash, OOM kill, host suspend. Work the agent parked
inside that process dies with it: Claude Code's background Bash shells, `Monitor` watches, and
workflows all live in the CLI process, and the completion notification that would have woken the
agent never arrives. A runtime that dies mid-turn is reported by whatever is draining its stream, but
between turns nothing is watching, so the agent sits at `idle` looking healthy while its background
work is gone. Report that exit as a turn failure so the agent lands in `error` with a timeline entry.
Only the Claude provider does this today; the others still report a death only when a turn happens to
be in flight.

### Cancellation

Provider interruption is idempotent at the `AgentSession` boundary. It resolves when the prior
foreground turn can no longer run, including when the provider reports that it is already idle. It
rejects only when the provider may still own the turn. Provider adapters translate native errors
into that contract; lifecycle callers do not interpret provider-specific errors.

After an acknowledged interrupt, the manager settles the captured run even when no terminal event
arrives or the run was still waiting for its provider turn id. The captured run token prevents an
older cancellation from settling a newer turn. If interruption is rejected or times out, the agent
keeps its active foreground turn and replacement, reload, rewind, and Stop report the failure.
Accepting new work after an ambiguous interruption would create a split-brain session.

## Relationships

Agents can launch other agents via the agent-scoped `create_agent` MCP tool. Agent-scoped creation is always asynchronous and always stamps `paseo.parent-agent-id`, pointing back at the caller. Omit `workspaceId` to use the caller's workspace, or pass an existing workspace ID returned by `create_workspace`. Placement never changes parentage.

- **Subagents** — exist as part of the creating agent's work, appear in that agent's subagent track, and are archived with it.
- **Detached agents** — stand on their own after an explicit detach transition, do not appear in the former parent's subagent track, and are not archived with it.

Parent archive detaches a subagent instead of archiving it when either condition holds:

- The child belongs to another workspace.
- The child has an open conversation view on a client.

All other children archive with the parent. After the workspace layout hydrates, the client marks
every managed subagent present in its layout with `paseo.open-agent-tab.<client-id>=true` through
the generic agent metadata update. The persisted label keeps its historical spelling. This
includes background and restored views; navigation does not own the marker. Closing a child view
sets that client's label to `false`; hiding the whole panel preserves the view. Any `true` client
label keeps the child protected. Detach clears the parent and every open-tab label. The surviving
child becomes a root agent immediately, so closing its remaining conversation view archives it.

Runtime ownership is resolved from explicit workspace ID and caller context, never from `cwd`. Workspace creation is a separate operation with `local | worktree` isolation; agent creation only selects an existing workspace.

Users can also detach an existing subagent from the subagents track. Detach is deliberately a manual lifecycle gesture, not an agent-facing MCP tool. It removes the parent and open-tab lifecycle labels: it does not stop, archive, move, or restart the agent. The agent keeps its current `cwd` and `workspaceId`, leaves the former parent's track, and behaves like a root agent for view close, workspace activity, and future parent archive.

`notifyOnFinish` defaults to `true` for agent-scoped creation and background prompt follow-ups because most delegated work needs to report back to the creating agent. Set it to `false` only for truly fire-and-forget agents or prompts.
Permission requests are notification checkpoints, not the end of that subscription. The caller is notified again after a permission response when the child finishes, errors, or requests another permission.
The permission notification includes the normalized request plus the child and request IDs, so the caller can inspect it and respond without fetching agent status.
A watched child that closes before its finish event also notifies the caller so delegated work cannot disappear silently during archive or workspace teardown.

## Provider-managed child agents

Some providers can create their own child sessions inside one provider runtime. OMP's task tool reports these with `child_session` events; `AgentManager` imports the live provider handle, stamps `paseo.parent-agent-id`, and surfaces the result as a normal subagent in the parent's subagents track.

The provider still owns the underlying runtime. Paseo keeps an agent record so the child can be opened, tracked, archived, and cascaded with the parent, but prompts and history hydration route through the provider adapter for that native child handle.

## Archive

Archive is a **soft delete**: the agent record stays on disk with `archivedAt` set, the runtime is closed, and the agent disappears from active lists. Archive is **global** — it lives on the server and propagates to every connected client.

Archive sets `archivedAt`, invokes the provider's native archive hook, and cascades to managed
children.

`create_agent_request` can opt an agent into `autoArchive`. In that mode the daemon archives the agent after the first terminal turn event (`turn_completed`, `turn_failed`, or `turn_canceled`). When the agent owns an isolated workspace, auto-archive archives that workspace too; the managed worktree is removed when its final workspace reference is gone.

Archiving runs through `AgentManager.archiveAgent` (`packages/server/src/server/agent/agent-manager.ts`):

1. Snapshot the current session into the registry
2. Set `archivedAt` and normalize `lastStatus` away from `running`/`initializing`
3. Notify subscribers
4. Close the runtime (kills the process if still running)
5. **Resolve children** — detach cross-workspace and open-tab children; cascade-archive the rest recursively

Cascade is what keeps subagent fleets from outliving their orchestrator.

Workspace archive is a separate lifecycle. Archiving or removing a worktree can close a surviving
agent record without setting the agent's `archivedAt`, while its `workspaceId` still points at the
archived workspace. History navigation must not infer workspace lifecycle from `agent.archivedAt`
or mutate either lifecycle. The workspace route asks the daemon for authoritative recovery state;
only the route's explicit Unarchive or Restore action changes the archived workspace.

History navigation preserves the selected agent as an explicit recovery target. If both that agent
and its workspace are archived, the workspace recovery action restores the workspace and unarchives
the selected agent as one user action. Other archived agents in the restored workspace remain
recoverable from History. Opening one retains its conversation view and renders the archived-agent callout. Authoritative
timeline catch-up may load provider history with a runtime-only `history` resume purpose, which must
leave both Paseo's `archivedAt` and the provider's native archive state unchanged. **Unarchive** remains
the only transition back to an interactive runtime: it runs the provider's native unarchive hook
(including Codex `thread/unarchive`) before the normal agent resume and timeline hydration flow. A
provider session can be archived outside Paseo while its Paseo agent remains active. Interactive
resume repairs that drift through the provider's native unarchive hook; history resume does not.

Provider session connection owns every process it spawns until the session is registered with
`AgentManager`. If initialization, persisted-session resume, or initial history hydration fails,
`connect()` must dispose that process before rethrowing; the manager cannot clean up a session it never
received.

## Views and archive

| Concept           | Scope      | Trigger                   |
| ----------------- | ---------- | ------------------------- |
| Conversation view | Per-client | Open or close a surface   |
| Archive           | Global     | Explicit lifecycle action |

Closing a root conversation through the close command archives it; a confirmation protects a
running agent. Right-clicking its sidebar row and pressing **A** is an explicit archive action.
It closes that conversation immediately and selects a surviving chat or the empty chat screen.
Do this layout cleanup before awaiting the archive request: a later chat selection or History
reopen belongs to the user and must survive the request's completion.

Closing a managed child's view only dismisses that view. The app clears this client's open-tab
label first; another client's open view remains protected. The child remains in its parent's
Tasks list and can be reopened. Hiding the whole right panel preserves its views and labels.
A later parent archive cascades to the child when no other protection applies.

A child's persistent home is the parent's Tasks list. Same-workspace children are not opened
automatically. Cross-workspace children are also available in their own workspace so it does not
appear empty, while retaining their parent relationship. Opening either through the parent's
Tasks list keeps the parent chat visible and selected. See [Side panel](./side-panel.md) for
host and folder routing.

An archived conversation explicitly opened from History survives directory removals caused by
active-list filtering. The client asks for authoritative existence before treating an ambiguous
removal as deletion. A confirmed deletion clears the detail and its view; reconnect failures or
stale responses must not remove a newer selection or restore a deleted conversation.

## Workspace activity

Agent lifecycle status stays literal: a parent agent is `idle` when its own turn is idle, even if a child is running.

Workspace status is an aggregate activity signal computed **per `workspaceId`**. Ownership is never derived from `cwd` — many workspaces may share one directory, and same-`cwd` siblings do not clump under one status. Root agents and cross-workspace subagents contribute their normal state bucket to their own workspace. Same-workspace descendants contribute `running` to the nearest ancestor in that workspace; their non-running attention, permission, and error states stay in the parent's subagents track. This makes a cross-workspace subagent behave like a detached agent for workspace visibility and status without removing its parent relationship.

Running provider-native subagents contribute `running` to the workspace owned by their parent agent. Their completed, failed, and canceled states stay in the parent's subagents track.

## The subagents track

The track is a pill at the foot of an agent's pane (`packages/app/src/subagents/track.tsx`). It reports the number of running tasks and preserves separate counts for failed or waiting children. On desktop, it opens the Tasks panel in the side panel, keeping the chat visible. Compact screens use a sheet; wide native screens retain the popover. It floats over the transcript; `packages/app/src/panels/agent-tracks.tsx` owns placement, and the pill frame is shared with the task list in `packages/app/src/composer/tracks.tsx`.

The rows combine two kinds of children:

- **Paseo subagents** are full managed agents. Their membership rule (`packages/app/src/subagents/select.ts`) is:

```
parentAgentId === thisAgent.id  AND  !archivedAt
```

- **Provider subagents** are child executions owned by Claude, Codex, Grok, or OpenCode. They are not inserted into `AgentManager` as managed agents. Providers emit a separate descriptor and timeline stream through `agent.provider_subagents.*`; the client keeps that state outside the normal agent store and merges only the presentation rows into the track. A shell command Claude moved to the background is not a subagent, but the chat is waiting on it, so it takes a row (subtitle "background command") and a count in the pill until it settles; its outcome card in the transcript is the durable record (`providers/claude/subagents/live-source.ts`). Codex children never wake their parent on their own, so the daemon sends an idle Codex parent one `<paseo-system>` prompt naming the children that settled after it went idle (`AgentManager.wakeIdleCodexParent`).

On desktop, clicking either kind opens its view on the right while the parent stays visible and
selected in the sidebar. The Tasks list remains available in the panel rail. A managed child has
an interactive composer and retains its own draft, device and working folder. A provider-native
child is read-only, with no composer, archive, detach, rewind or fork actions. Both use
`AgentStreamView` for message, reasoning and tool rendering. Hiding the Tasks panel changes only
this client's layout; it does not archive the parent or children.

Provider timelines use the same structural timeline item format but deliberately have a separate lifecycle and transport. A provider thread/session identifier is not a Paseo agent identifier, and closing its view is always layout-only.

Provider descriptors may include one compact subtitle. The provider owns its contents and formatting; clients display it without interpreting provider-specific model, thinking, or usage fields. The Tasks panel and child view allow this metadata to wrap so reported token counts remain readable. Managed child rows show the provider’s reported context token count, explicitly labeled as context. Unknown usage stays absent, and the app does not invent a cumulative total across providers with different token accounting.

### Grok provider subagents: ACP child channels

Grok Build announces child lifecycle through `_x.ai/session_notification` and streams child content
on separate ACP session IDs. Retain provider events during history replay as well as live turns;
filtering every notification to the root session loses the child transcript.
`providers/grok-subagents.ts` owns that projection. Token subtitles use Grok's reported context
tokens. Codex uses its native cumulative child token total. Neither substitutes the parent's usage
for an unknown child.

An explicit Grok `[subagents.models]`, roles, or personas table also creates the parent
`[subagents]` table. Grok treats an omitted `enabled` in that table as false. Set
`enabled = true` under `[subagents]` when configuring native children, even though a completely
absent subagents configuration enables them by default.

### Claude provider subagents: the task protocol

Claude Code announces subagent lifecycle on the SDK stream (`task_started` / `task_updated` / `task_notification` / `task_progress`), and Paseo reads those announcements rather than reconstructing them from sidechain frames. The live source (`subagents/live-source.ts`) and the replay source (`subagents/replay-source.ts`) both translate into one observation vocabulary (`subagents/observation.ts`), so a fact is derived once for both paths instead of once per path. Gotchas that are not obvious from the SDK types:

- **Not every announced task belongs in the track.** Task subagents announce as `local_agent` and workflows as `local_workflow`; a backgrounded shell announces as `local_bash` with the same `tool_use_id` shape, and ambient housekeeping sets `skip_transcript`. The Claude provider normalizes a workflow to a generic provider-subagent descriptor titled `Workflow`, using Claude's summary as its description and timeline opener. Shared storage, protocol, and UI do not distinguish it from another provider subagent.
- **A task that was never declared gets no descriptor, by any route.** Filtered tasks still emit `task_notification`s carrying a `tool_use_id`, and still emit frames carrying `parent_tool_use_id`. Attributing either produces a descriptor with no identity and a defaulted `running` status — a nameless row that never finishes. Status, presentation updates, and sidechain frames all route through the declaration table.
- **Task ids are session-scoped, not turn-scoped.** Cancelling a turn must not clear the routing table: a backgrounded child settles after the interrupt and needs its descriptor to still exist. Cancellation instead terminalizes the declared children that were running in the foreground, and a later `task_notification` is free to correct that guess. Backgrounded children are identified by `task_updated.patch.is_backgrounded`.
- **A resumed task can be announced again with a new `tool_use_id`.** The first Task tool id remains the canonical descriptor and later ids are routing aliases for the same session-scoped task. The resumed prompt is added to that child timeline.
- **Effort is only reachable through hooks.** It appears nowhere on the message stream at any depth, and the level Paseo requests is not necessarily the level that runs — a model that does not support it is silently downgraded. A hook firing inside a subagent reports the active post-downgrade level next to its `agent_id`, which is the same id `task_started` calls `task_id`.
- **Backgrounded subagents emit no frames carrying `parent_tool_use_id` at all.** Everything keyed off that field sees nothing for one; they are visible only because the task protocol announces them.
- **On replay, `<session>/subagents/` holds every descendant, not just this session's children.** `agent-<id>.meta.json` carries `spawnDepth`: `1` is a direct child, `2+` was spawned by another subagent and its `toolUseId` names a Task call made inside its parent's session, which nothing in this transcript can resolve. Replaying those adds rows the live stream never showed, each with no Task card and no recoverable outcome, so they render as running forever. One recorded session showed 10 subagents live and would have replayed 22.
- **Replay `totalTokens` is a context-size reading, not cumulative spend.** Claude Code finalizes a subagent by summing the _last_ assistant message's usage block and shipping that as `usage.total_tokens`. Summing per-entry usage instead multiplies the cached prefix by the turn count and reports a number several times larger than the live path.

Archived Paseo subagents disappear from the track, by design. To remove one from the track without dismissing its view, use the **archive button** on the row — it opens a confirm dialog and archives the subagent on confirm. Provider-owned rows have no individual Paseo lifecycle controls.

The **Archive finished** row at the foot of the panel covers every finished row. It archives idle or errored managed Paseo subagents one at a time, and hides completed, failed, or canceled provider-owned rows in the current app session. Native sessions and timelines are untouched. Running and initializing children remain in the track. If a hidden provider child starts running again, the app brings it back to the track.

To keep the agent alive but remove it from the parent's track, use **detach**. The daemon clears the relationship lifecycle labels, emits the normal agent update, and every client reclassifies the agent from subagent to root/sibling from that updated snapshot.

## Limitations

### Subagent accumulation under long-lived parents

A parent that spawns many subagents will see the panel's list grow; the pill only counts them. Managed Paseo subagents can be archived individually or with **Archive finished**. That action hides finished provider-owned rows locally; this presentation state resets when the app restarts.

### Cross-client view dismissal

Closing a child view on one client leaves other clients' layouts intact. Archive remains the
global action for cross-client cleanup.

## Storage

```
$PASEO_HOME/agents/{cwd-with-dashes}/{agent-id}.json
```

`{cwd-with-dashes}` is derived from the agent's filesystem `cwd`. It is not the workspace id; agent storage stays cwd-keyed while workspace identity is the opaque workspace id.

Each agent is a single JSON file. Fields relevant to this doc:

| Field                                        | Type          | Meaning                                                                            |
| -------------------------------------------- | ------------- | ---------------------------------------------------------------------------------- |
| `id`                                         | `string`      | Stable identifier                                                                  |
| `archivedAt`                                 | `string?`     | Soft-delete timestamp (ISO 8601)                                                   |
| `labels["paseo.parent-agent-id"]`            | `string?`     | Parent agent ID, set automatically for agent-scoped creation and removed by detach |
| `labels["paseo.open-agent-tab.<client-id>"]` | `string?`     | `"true"` protects an open view on that client; detach clears every matching label  |
| `lastStatus`                                 | `AgentStatus` | `initializing` / `idle` / `running` / `error` / `closed`                           |

See [`docs/data-model.md`](./data-model.md) for the full agent record.
