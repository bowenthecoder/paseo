# Paseo production review — September 9, 2026

This candidate combines the pending app, daemon and subscriptions changes in the
integration worktrees. The installed application and production daemon are preserved.

## Resulting behavior

- One to four independent chat views, including a two-by-two grid. Each view retains
  its own folder, model, draft, output and focus. Supporting files, Changes and
  terminals use the separate dock. Closing a view preserves its chats and drafts;
  explicit Archive remains a separate action. Layout and focus survive reload. Explicit
  terminal opens receive keyboard focus; document previews retain the chat target.
- Subscription usage follows the configured credential home, including custom or
  swapped provider aliases. Secondary Claude profiles cannot fall back to the
  default account's keychain entry. Unknown usage and credit values remain unknown.
  Configuration is resolved after delayed probes, and completed batches revalidate
  account generations before returning previously collected usage.
  Custom aliases receive account controls when delayed discovery completes; toggling
  an account preserves its command, label and environment. Failed initial account
  discovery remains retryable with Refresh in the model picker.
- Relinking an account clears previous-account numbers in plugin, native server and
  application caches. Superseded requests cannot replace the current account's
  usage or sign-in status. Unrelated hosts retain their own state.
- Collapsed Overview output identifies failed, canceled and running tools without
  counting them as successful commands or edits. The CLI-style tool log preserves
  actual Claude and Codex command output across reload.
- An initially empty chat is named from its first accepted substantive prompt.
  Persisted title provenance protects explicit manual names from delayed generation.
  The main header follows the current chat title through rename, navigation and
  reload while retaining folder, host and checkout metadata.
- Diff scrolling preserves the performance improvement while revalidating retained
  file geometry after a live edit, so a newly visible file remains interactive.
- Native chat reload serializes replacement sessions and prevents concurrent
  timeline loading from restoring a duplicate agent during the session swap.
- Native file watching retains descendant scans and parent inventory membership.
  A batched create followed by delete retains its final deletion; an atomic
  delete-and-recreate still reports an update.

## Verification

Independent reviewers covered the pane layout, title lifecycle, account isolation,
usage cache races and the stable integration delta. Targeted tests cover layout
migrations, focus and close semantics, title generation and rename races, malformed
metrics, profile isolation, account relinking and late requests. App/server/plugin
types and changed-file lint/format checks are required before handoff.

Real browser and isolated-daemon checks passed for:

- Four separate folders and drafts, pointer focus, model changes, new-chat creation
  in an extra view, sending only the focused draft, supporting files, focus mode,
  compact return, reload and close without archive.
- Claude, Codex account 1, Codex account 2 and Grok operating simultaneously, with
  separate real replies, account labels, usage and models at 1600 and 1280 pixels.
  Each provider also replies successfully after its actual Reload chat action.
- Individual real-provider model/effort/context/usage controls; empty-chat naming;
  manual rename followed by reload and another real turn.
- Actual Claude and Codex shell commands reading only each test's own `smoke.txt`,
  displaying exact stdout in CLI tool logs, then restoring it after reload.
- Installed subscriptions CLI/tool-log toggles; failed/canceled Overview output at
  1440 and 390 pixels; keyboard sidebar actions and provider removal.
- Continuous fast diff scrolling, including wrapped and split layouts, with bounded
  canvases and React updates after the live-geometry correction.

Mock-provider tests explicitly use development fixtures. The native-provider checks
above use real provider processes. Test daemons have isolated Paseo metadata and
block the production daemon port; agent authentication files are not copied.

## Release gate and limits

The review folder's `candidate-manifest.json` and `final-validation.json` identify the
exact source, matching plugin bundles, packaged Mac app and final test results.
Earlier checkpoint CI/artifact results apply only to their recorded checkpoints.
Publishing or replacing the installed app requires the owner's subsequent direction.

Native title writeback/synchronization and physical iOS/Android device testing are
not covered. External CLI account replacement does not notify plugin caches; the
relink guarantees apply to completed plugin login flows and provider configuration
changes. The earlier 2,000-file stress run retained an approximately 68-second initial
load limitation, despite smooth bounded scrolling after load.
