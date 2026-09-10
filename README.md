# Live Mac Paseo backup

This branch is documentation only. The runnable source of each live Mac build is on its own branch.

| What | GitHub | SHA |
|---|---|---|
| Old live app (9 Sep 2026, before the Enter duplicate-chat fix) | branch `bowen/live-mac-428478a45`, tag `live-mac-428478a45` | `428478a4538a208a47eef218a1e0552603aa58a4` |
| Enter-fix app (10 Sep 2026) | branch `bowen/live-enter-fix-428478a45`, tag `live-mac-enter-fix-91980629c` | `91980629c14355743636f46528251d8b3dd4b9ee` |
| Subscriptions plugin at the 9 Sep live cutover | `bowenthecoder/paseo-subscriptions` branch `bowen/live-mac-c13413463` | `c13413463be826b4afeb0927b00817180a871754` |

The packaged `.app` is not stored on GitHub (about 430 MB, ad-hoc signed). Restore source from the branches above; a local binary rollback lives in `~/Applications/Paseo Backups/`.

## Old live package (428478a45)

- Version: Paseo 0.7.2
- Installed at the 9 Sep cutover as `/Applications/Paseo.app`
- `app.asar` SHA-256: `d5d44936eafa26e9efb749432d7394e56b3d0fb9ba8d2fd3ace2f006901f1ff5`
- CI: 18/18 on that commit, https://github.com/bowenthecoder/paseo/actions/runs/34424683253
- Notes from that night: [live-mac/README.428478a45.md](live-mac/README.428478a45.md)
- Features: [live-mac/FINAL-FEATURES.md](live-mac/FINAL-FEATURES.md)
- Manifest: [live-mac/checkpoint-manifest.json](live-mac/checkpoint-manifest.json)

Known bug in that build: pressing Enter on a new draft could open two chats. Fixed in `91980629c`.

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
