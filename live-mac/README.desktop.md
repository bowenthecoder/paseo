# Paseo live Mac notes

**Current live app is `91980629c`** at `/Applications/Paseo.app` (Paseo 0.7.2 plus the Enter duplicate-chat fix). Packaged smoke passed before install. The UI was swapped on 10 September 2026 without stopping the daemon, so existing chats stayed up.

The leftover `Paseo.app` copies on this Desktop (and older worktree packages) were deleted. The old verified source and this folder's 9 September README are on GitHub, not in a local `.app`.

## GitHub backup (old version + README)

| What | Where |
|---|---|
| Backup index and restore notes | https://github.com/bowenthecoder/paseo/blob/live-mac-backup/README.md |
| Old live source (9 Sep, before the Enter fix) | branch/tag `live-mac-428478a45` → `428478a4538a208a47eef218a1e0552603aa58a4` |
| 9 Sep README | https://github.com/bowenthecoder/paseo/blob/live-mac-backup/live-mac/README.428478a45.md |
| 9 Sep features writeup | https://github.com/bowenthecoder/paseo/blob/live-mac-backup/live-mac/FINAL-FEATURES.md |
| Enter-fix source (now live) | branch `bowen/live-enter-fix-428478a45`, tag `live-mac-enter-fix-91980629c` |
| Plugin at the 9 Sep cutover | `bowenthecoder/paseo-subscriptions` branch/tag `live-mac-c13413463` |

Old `app.asar` SHA-256: `d5d44936eafa26e9efb749432d7394e56b3d0fb9ba8d2fd3ace2f006901f1ff5`  
Live `app.asar` SHA-256: `dc35919fbb6cb0c4869b9e5c1a39c3b7a35aca613d06b8e1c1fcfd50fb31df9d`

A local binary rollback of the pre-fix app is `~/Applications/Paseo Backups/20260910-enter-fix-before/`. GitHub holds source, not the 430 MB ad-hoc `.app`.

## What this folder still is

Evidence, manifests, screenshots, and the live subscriptions plugin checkout. The plugin the daemon is actually loading is `plugin-live/22eec7d/subscriptions-source`. Do not delete that directory while it is the configured plugin path.

The 9 September live verification notes remain in [FINAL-FEATURES.md](FINAL-FEATURES.md) and [checkpoints/428478a45/checkpoint-manifest.json](checkpoints/428478a45/checkpoint-manifest.json). That checkpoint no longer contains a `Paseo.app`.
