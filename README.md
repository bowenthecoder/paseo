# Live Mac Paseo backup

This branch is documentation only. The runnable source of each live Mac build is on its own branch.

| What | GitHub | SHA |
|---|---|---|
| Old live app (9 Sep 2026, before the Enter duplicate-chat fix) | branch `bowen/live-mac-428478a45`, tag `live-mac-428478a45` | `428478a4538a208a47eef218a1e0552603aa58a4` |
| Enter-fix app (now live, 10 Sep 2026) | branch `bowen/live-enter-fix-428478a45`, tag `live-mac-enter-fix-91980629c` | `91980629c14355743636f46528251d8b3dd4b9ee` |
| Subscriptions plugin at the 9 Sep live cutover | `bowenthecoder/paseo-subscriptions` branch `bowen/live-mac-c13413463` | `c13413463be826b4afeb0927b00817180a871754` |

The packaged `.app` is not stored on GitHub (about 430 MB, ad-hoc signed). Restore source from the branches above. A local binary rollback of the pre-fix app is `~/Applications/Paseo Backups/20260910-enter-fix-before/`.

Leftover `Paseo.app` copies on the Mac Desktop and older worktree packages were deleted on 10 September 2026 after this backup was pushed.

## Current live (91980629c)

- Version: Paseo 0.7.2 plus the Enter duplicate-chat fix
- Path: `/Applications/Paseo.app`
- Source: `91980629c14355743636f46528251d8b3dd4b9ee`
- `app.asar` SHA-256: `dc35919fbb6cb0c4869b9e5c1a39c3b7a35aca613d06b8e1c1fcfd50fb31df9d`
- Installed 10 September 2026 by swapping the UI only. The desktop-managed daemon on `127.0.0.1:6767` was left running (supervisor pid 67175).
- Desktop notes after that swap: [live-mac/README.desktop.md](live-mac/README.desktop.md)

Pressing Enter on a new draft previously could open two chats. The live renderer now converts the draft tab in place (`convertDraftToAgent`), treats a `"sent"` pending create as still pending so reconcile cannot open a second tab, and uses a submit lock so a double Enter cannot start two creates.

## Old live package (428478a45)

- Version: Paseo 0.7.2
- Installed at the 9 Sep cutover as `/Applications/Paseo.app`
- `app.asar` SHA-256: `d5d44936eafa26e9efb749432d7394e56b3d0fb9ba8d2fd3ace2f006901f1ff5`
- CI: 18/18 on that commit, https://github.com/bowenthecoder/paseo/actions/runs/34424683253
- Notes from that night: [live-mac/README.428478a45.md](live-mac/README.428478a45.md)
- Features: [live-mac/FINAL-FEATURES.md](live-mac/FINAL-FEATURES.md)
- Manifest: [live-mac/checkpoint-manifest.json](live-mac/checkpoint-manifest.json)

## Restore the old app source

```bash
git fetch bowen
git checkout live-mac-428478a45
```

Then build with the same local unsigned Mac command used for the live package:

```bash
PATH=/usr/sbin:$PATH CSC_IDENTITY_AUTO_DISCOVERY=false PASEO_DESKTOP_SMOKE=1 \
  npm run build:desktop -- --mac --arm64 --dir \
  -c.mac.hardenedRuntime=false -c.mac.notarize=false --publish never
```

Plugin:

```bash
git -C ~/code/paseo-subscriptions fetch github
git -C ~/code/paseo-subscriptions checkout bowen/live-mac-c13413463
```
