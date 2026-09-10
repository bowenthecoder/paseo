# Paseo live build — 9 September 2026

**Paseo 428478a45 is installed and verified live at `/Applications/Paseo.app`**, with subscriptions plugin `c13413463`. Installation completed at 9:40 p.m. Eastern; live verification completed at 9:42 p.m. Eastern. The exact package is preserved in [checkpoints/428478a45](checkpoints/428478a45/).

All eighteen CI jobs passed on the exact source commit. Packaged smoke, 190 agent-manager tests, the loader regression, and a real Claude two-launch naming check passed. The unchanged renderer, provider and plugin code retains the earlier real subagent, native-provider and stress-test evidence, explicitly recorded in the manifest.

The actual installed desktop was inspected. All 10 active chats, 63 stored agent records, 47 workspaces, three manual groups, one nonempty draft and 53 layouts survived. Provider bindings and subscription settings were retained. Nine eligible legacy chat names were generated successfully after restart. Installed hashes and code signature match the checkpoint.

- [Release features and verification](FINAL-FEATURES.md)
- [Exact artifact and live verification manifest](checkpoints/428478a45/checkpoint-manifest.json)
- [Successful full CI](https://github.com/bowenthecoder/paseo/actions/runs/34424683253)
- [Live verification and screenshot](checkpoints/428478a45/evidence/live-verification/)
- [Cutover result](cutover-title/result.json)

The original app/profile backup remains at `/Users/bowen/Applications/Paseo Backups/20260909-1958-pickup-before-live`; the second update's rollback backup is `/Users/bowen/Applications/Paseo Backups/20260909-2120-before-title-fix`. Other previews and native provider authentication were preserved.

Codex 2 remains quota-limited until 14 September at 11:29 p.m. Eastern; its visible quota rejection was verified. This is a locally signed ARM64 Mac build, not a notarized public release. Native phone devices were not tested in this round.
