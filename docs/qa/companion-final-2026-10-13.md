# Final bounded cloud pass · companion tempo and compact header

Based on merged PR39 main `cbd6638e9ac983375c86d43266c911b5635f5027`.

## Reproduced

- At 640×600 the brand wraps to two lines and the collection count ends at 63 px, outside the 56 px title bar. All nine existing buttons remained reachable; the defect is crowded/clipped text rather than missing controls.
- The generated lo-fi engine reports 71 BPM, but the companion snapshot has no `lofiBpm`. A first test incorrectly tried to click “start sound” after enabling lo-fi had already started it; that harness failure is retained separately. The corrected baseline reproduces the missing field.

## Fix

Carry a bounded, display-only `lofiBpm` through the existing snapshot whitelist to the separate pet renderer. It changes the free-phase visual beat clock, participates in deduplication, yields to real music and resets its fallback on stop. `musicPlaying`, energy and real-audio event semantics remain unchanged. This follows the generated section's target tempo, not sample-accurate phase; the engine ramps tempo over two seconds and the lo-fi polling path may add approximately 750 ms.

The compact header uses a single-line smaller pixel title, icon-only add control with accessible name and tooltip, and tighter spacing. All controls remain present. Desktop widths of 900 px or more retain their layout.

## Validation scope

- Two additional desktop regressions cover snapshot extraction, whitelist/range/source precedence, relay deduplication, tempo changes and stop/reset
- Browser tests compare the actual generated section BPM with the snapshot, sanitize it through the production whitelist, feed the real pet renderer, and inspect Web Animation duration `60000 / BPM`. Music transitions are simulated with the public playback event. Generated audio is muted by Chromium
- Compact header tests inspect line count, text/control bounds, pointer reachability and dialog/Escape/focus return at 640, 960 and 1440 widths
- Candidate verification: 275 desktop + 131 frontend tests and production build passed; full 23-case silent cloud run passed with exit 0, no page errors or unexpected requests, and matching product/script hashes. Independent exact-head CI review is required before merge; no release or tag action

## Cloud coverage inventory and stopping point

| Surface | Verified cloud scope | Remaining acceptance boundary |
| --- | --- | --- |
| Music/queue | Silent generated-WAV decoding, buffered handoff, duration/seek, crossfade interruption, queue invalidation, repeat-one/one-track repeat-all, repeated source/navigation flows | Real provider accounts, remote speakers, perceived audio quality and hardware output |
| Collection/album wall/playlists | Fixture-backed add/edit/navigation, shelves, queue, import/backup, wall controls, keyboard layers, compact screenshots | Real account/library imports and large personal collections |
| Focus/productivity | Timer pause/reload/sleep/deadline/reset, save failures, cross-window draft conflict, tasks/notes/backup recovery | Real OS wake/sleep and notification delivery |
| Learning tools | Deck/countdown creation failure and limits, card edit/review/cancel, local JSON import failure/duplicate recovery, 640–1440 dock layout | User's own study data and long-term scheduling history |
| Modes/settings | Six settings sections, keyboard/focus, twenty fullscreen/immersion cycles, hidden-tools recovery, source/error/loading/empty states | Native fullscreen/Spaces, OS window controls and desktop attachment |
| Scenes/pets/mini player | Scene/species selection, renderer previews, pet animation/keyboard behavior, mocked mini-player commands, lo-fi target-tempo propagation | Native click-through, multi-monitor placement, system taskbar/tray and global shortcuts |
| Packages/updates | Exact-head CI production build and macOS arm64/x64 + Windows x64 packaging checks | Installing/relaunching/updating on the user's Mac/Windows machine |

This pass closes the remaining reproduced, bounded cloud findings. Native/real-account acceptance remains a distinct later step; no claim of complete cross-platform certification is made. Earlier non-clean runs remain in the evidence: cat arc/readiness/navigation exceptions in round1 and test initialization/helper failures in later rounds are not counted as successful runs or assigned an unproved environment cause. Further arbitrary cosmetic changes are outside this stopping point.
