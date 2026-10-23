# Flow Cabin 2.0 release gate

Status: NOT READY. Do not merge this integration branch or publish a 2.0 release.

This branch contains work on Android native playback, credentials, lyrics,
playback timing, pet identity, weather fields, modular room rendering and art.
Passing tests cover these implemented paths; they do not establish completion
of the approved 2.0 plan.

## Blocking scope gaps

- Secure LAN QR pairing, authenticated encrypted transport, device revocation,
  domain revisions/conflict handling, reconnect, focus handoff and pet travel.
- Five pets with the full 24-action scheduler and layered behaviors; data-only
  imported packs, import validation/preview, dsh loopback bridge and mapping UI.
  Generated pose atlases are static art, not completed animation sequences.
- Calibrated accessory anchors and runtime wearing for all pets.
- Android background cross-album/shuffle/repeat queue parity; native PCM audio
  features and background ambience; focus alarms, two widgets and icon aliases.
- Full account renewal/recovery states, location/weather settings and optional
  provider adapter; Windows shortcut and remaining OS icon behavior.
- Modular room production entry and complete furniture behaviors. The studio
  remains a development preview. Asset generation is not feature acceptance.
- Final Windows/macOS/Android packaged-client acceptance against one release
  commit, including actual media controls, credential restart and sleep/resume.
- A complete Android release pipeline and signed install/upgrade verification.

## Merge and publish conditions

1. Resolve every blocking scope gap or obtain an explicit change of scope.
2. Review the final implementation and generated asset composition on desktop
   and phone portrait/landscape; verify accessible fallbacks.
3. Run repository QA, room-studio regression, Android compilation and isolated
   device regressions after the final changes. CI must be green at that commit.
4. Build and validate all platform artifacts. Publish only the tested commit,
   with matching versions, corresponding source and bundled license notices.

No release tag, auto-merge or production publishing is authorized by a passing
subset of checks. The user's instruction requires all requested work to be
complete and verified before merge and release.
