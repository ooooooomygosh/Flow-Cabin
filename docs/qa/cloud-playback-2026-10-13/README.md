# Silent cloud regression pass · 2026-10-13

Baseline: v1.14.4 / `73fcb8f23ed73d5473d73e4f7146c10040408734`.

## Reproduced and repaired

- The standby deck had already emitted metadata before becoming active. Switching to it reset the UI duration to zero and disabled progress. Ownership transfer now also copies duration and position.
- Seeking across tracks waited for a metadata event that had already happened. The listener could survive until the same element loaded another song. Ready media seeks immediately; pending seeks are canceled with the source owner.
- Eject, source changes, or another Next during a crossfade left the earlier outgoing deck playing. An interrupted handover now stops that old deck immediately.
- Enqueue, reorder, removal, repeat, and shuffle changes did not invalidate the buffered next recording. Prefetch now observes the committed queue's exact recording identity.
- Repeated mounting exposed a null-ref cleanup crash and failure to explicitly stop detached audio elements. Ref disposal now stops an element before discarding it.
- Asynchronous resume/restart and candidate selection now retain their deck, source, and request ownership across awaits.
- Keyboard focus could leave the modal listening corner through Shift+Tab. Tab navigation now wraps inside it and Escape still restores the opener.
- The compact queue opened below the scroll viewport, hidden behind volume controls. Opening now reveals and focuses the queue; an explicit close button returns to the wheel. Queue rows shrink safely without losing their remove controls.
- Six room scenes used a five-column layout, leaving one orphan card and unnecessary vertical space. Desktop layouts now use one six-card row.

## Verification

- `npm run check`: 273 desktop tests, 125 frontend tests, and production build passed.
- Actual cloud Chromium with generated silent 60-second PCM WAVs: the first nine playback regressions passed in two consecutive runs. Expanded natural-ended handoff and overlapping pause/mute checks are included in the fixture.
- `npm run test:playback`: standalone Playwright regression suite, now run by CI. Covers real media readiness, buffered duration/seek, stale listener reuse, natural end, crossfade interruption, queue changes, and in-flight prefetch replacement.
- Browser smoke now explicitly mutes audio, checks buffered UI progress, scene-card alignment, and keyboard focus trapping.
- UI screenshots use synthetic collections and offline service fixtures. No account credentials or copyrighted music were used.

## Scope limits

This is renderer/cloud validation, not native macOS or Windows acceptance. Real platform account playback, OS permissions, updater installation, and native desktop pet/window behavior were not exercised. No release or tag is created by this change.
