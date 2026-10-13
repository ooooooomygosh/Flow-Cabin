# Learning tools and settings QA · 2026-10-13

Scope: a third silent cloud-browser pass on main `747b01431629dcd447e3f1a95c731f10f8ee36dc`, following PR37/PR38. Fresh Chromium contexts, synthetic collection/study records, blocked external requests and muted output. Real accounts, native fullscreen, desktop permissions, taskbar and updater acceptance are outside this browser fixture.

## Baseline findings

- Failed deck and countdown writes clear their text/date drafts despite the study provider correctly retaining the prior persisted state
- Reaching the 40-deck creation limit also clears the draft and provides no explanation
- Study error messages below the scroll body are invisible in compact main-list views
- Settings tabs lack arrow/Home/End navigation and all six are in the Tab sequence
- Screenshot inspection found performance-option labels breaking across lines at both 1440 and 960 widths, and study contents extending beyond the dock
- The first seven-case baseline passed review keyboard/failure recovery and all six settings-section/shortcut round trips. Four interaction checks failed; the card-edit case had a 30-second initial-render timeout and was not counted as a product regression. Its isolated baseline rerun confirmed the false duplicate-card message; a separate DOM check measured clientWidth 356 vs scrollWidth 373 (17 px overflow). Both reports are retained separately

## Changes

- Study create operations report true only after a real persisted change; rejected drafts stay editable and capacity limits are explicit
- A failed card append returns a distinct failure value, avoiding misleading duplicate/success messages for editor and file import
- Study errors are displayed below the dock tabs, outside the scrolling body
- Settings use a single roving tab stop, arrow/Home/End navigation and responsive vertical/horizontal orientation
- The study grid uses a shrinkable column; settings performance options retain single-line labels

## Verification

The existing focus/UI suite is extended from 12 to 21 cases. Added cases cover deck/countdown failure and reload recovery, rejected capacity limits, card edit and cancellation, local JSON import failure/duplicate behavior, review keyboard recovery, settings navigation/return, all six settings pages and dock boundaries at 1440×900, 960×600 and 640×600. Native commands remain mocks. Original failed runs are retained rather than counted as clean.

Candidate verification: 273 desktop + 131 frontend tests and production build passed; the full 21-case silent cloud run passed with exit 0, no page errors and no unexpected requests. Product and test hashes matched the tested files. An initial local aggregate check encountered an incomplete Electron dependency from the wrong pre-existing dependency directory; only this isolated worktree’s symlinks were corrected to the already-tested dependencies, then the full check passed. Independent review and exact-head CI must pass before merge. No release/tag action is part of this change.
