# Flow Cabin 2.0 release gate

Updated: 2026-10-23. Status: core scope implemented; final release-candidate
validation and artifact checks determine merge and publication readiness.

The earlier blanket NOT READY assessment and its missing-feature list are
superseded by the implementation below. The user has authorized merge and
release once the changes are complete and checks pass. This document records
what 2.0 ships, what has been verified and the limits that must accompany the
release; passing an earlier subset is not evidence that a later commit passed.
The public feature description and known boundaries are in
[the 2.0 release notes](../desktop/RELEASE-NOTES.md#200).

## Implemented release scope

- **Living rooms:** a production entry at Settings → Room and companion → enter
  the living room, with an immersive full-room view, eight themes, independent
  furniture textures, inventory, dragging, keyboard placement, undo/redo and
  layout import/export. Desktop and Android share the room experience. The
  `room-studio` name remains in regression commands; this is no longer only a
  development-only preview.
- **Companions:** five built-in pets, a 24-action scheduler, cooldowns and quiet
  behavior, accessory placement, shared room/desktop artwork and transparent
  hit testing. Data-only PNG atlas packs support JSON/ZIP import, validation,
  preview, action mapping, mirroring and baseline calibration. The optional
  dsh-pet bridge connects to an already-running local application and requires
  explicit action mapping; third-party animation assets are not bundled.
- **Lyrics and playback timing:** platform track IDs take priority; public
  matching checks title, artist, album and reliable duration. Local lyric
  overrides, supported line/word formats, offsets and immersive rendering use
  the actual playback timeline. Word effects require supplied word timestamps.
- **Account recovery:** encrypted credentials survive restart; saved, verified,
  offline, expired and storage-error states are distinguished. Transient network
  failures preserve login data, and stale responses after account changes
  cannot replace the current account or its playback state.
- **Private LAN transfer:** explicit IPv4 private-network pairing with HTTPS
  certificate fingerprint pinning, 120-second single-use tokens, HMAC and replay
  protection. QR scanning has a manual-address fallback. Paired devices can be
  revoked; supported notes, layouts and focus records use revisions, conflict
  copies and deletion markers. Platform music credentials are excluded, and
  receiving is disabled by default after restart.
- **Android native features:** Media3 background queues and lock-screen controls,
  shuffle/repeat and cross-album playback for resolvable tracks, native ambience
  mixing and measured PCM energy, focus alarms, record/focus widgets and five
  launcher aliases. Camera video permission is requested when scanning is
  explicitly invoked. The signed release APK build/install path is implemented.
- **Weather and system identity:** city search or manual location, coordinates
  and timezone, measured temperature/feels-like/humidity, and selected-pet tray,
  Dock and window identity. Open-Meteo is the current weather provider.

## Validation evidence and its limits

Repository checks include unit tests, production web and music-adapter builds,
static-web and journey regressions, the complete browser suite, playback/lyrics,
focus, beat response, shelf, AI, journal, memory, study, themes, living rooms,
device settings and souvenirs. Targeted tests additionally cover LAN pairing,
revocation/conflicts, pet-pack validation, dsh bridge behavior and Android native
storage/playback/system integration.

The current evidence includes a passing 399-test desktop run, the eight-theme
living-room regression with actual furniture and imported atlas pixels, and a
successful signed Android release build. Earlier full browser/QA evidence and
isolated regressions informed the fixes; they must not be substituted for the
final 2.0 run after the last implementation or dependency change. The final
`npm run qa` run and platform artifact checks remain the release decision record.

Browser regressions use isolated profiles and controlled services. Android
emulator/instrumentation checks exercise native paths, but neither proves all
real phones, vendor background policies, live music-account entitlements or
all Windows/macOS native behavior. Real-device and Windows/macOS manual checks
are limited, particularly media control permissions, global input, multi-screen
wallpaper behavior, sleep/resume and same-path upgrades. Report only the checks
actually performed against the release candidate.

## Documented non-blocking boundaries

- No mDNS/automatic discovery, cloud synchronization or continuously connected
  cross-device session. LAN transfer requires explicit pairing; continuous
  music remote control, a lyric companion screen, focus-ownership handoff and
  pet travel are not part of the implemented 2.0 behavior.
- Imported animation packs use bounded PNG atlases; transparent WebM packs are
  unsupported. Generated pose atlases are not a claim of fully hand-drawn
  frame-by-frame animation. Custom packs and dsh imports primarily target the
  desktop client.
- Android background preloading requires stable platform IDs or persistent file
  URIs. Missing IDs stop safely and defer discovery to the foreground. Native
  ambience is synthesized and does not reproduce web Tone output sample for
  sample. Notifications and inexact focus alarms remain subject to permissions
  and operating-system power management.
- QWeather is not implemented. Weather requests require connectivity and a
  configured location.
- macOS uses the existing stable self-signing identity without Apple
  notarization; Windows has no trusted-publisher signature. Android releases
  use a separate long-term signing identity and cannot overwrite an older APK
  signed with a different key.

These limits belong in the release notes and installation guidance. They must
not be presented as completed features, nor treated as newly discovered gaps
in features that are now implemented.

## Final merge and publication checks

1. Freeze the release candidate and run `npm run qa` sequentially, plus any
   targeted checks needed for changes outside that command. Avoid concurrent
   source edits or Android report generation while Vite browser suites run;
   those can trigger HMR or reload fixtures. Any failed assertion or uncaught
   JavaScript error must be resolved before proceeding.
2. Confirm the production living-room entry, portrait/landscape layouts,
   imported-art fallbacks and accessibility against the candidate. Retain
   honest platform-specific coverage notes for native behaviors.
3. Build the declared Windows, macOS and Android artifacts from the same
   candidate with matching versions and CI checks. Verify the produced files,
   signatures/identity, Android alignment and available install/upgrade checks;
   a build result alone is not an all-device acceptance claim.
4. Publish only the reviewed, tested commit. Include corresponding source,
   bundled third-party notices and the 2.0 known boundaries, including AMLL's
   AGPL-3.0-only and PixiJS/Motion MIT notices. Merge/tag/release may proceed
   under the user's existing authorization when these checks pass; no separate
   permission round is required merely because the earlier gate was stale.
