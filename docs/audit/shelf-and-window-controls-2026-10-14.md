# Shelf clarity and single window controls — 2026-10-14

Base: `a8504a70cd5ca30b6be7c696bbb499e0fd13ba76` (v1.14.5). No version or dependency change.

## Changes

- Size-aware, DPR-aware cover sampling replaces fixed 64-pixel thumbnails. Grains remain visible; source resolution caps detail. Existing 300×300 catalog photos were compared at identical viewport/cell sizes, alongside synthetic fine lettering.
- Square, thin sleeves sit inside the existing cabinet recess with side clearance, contact shadows and a small foreground lip. Room light no longer washes across the covers. All six scene styles retain their colors and full-cell interaction targets.
- One icon-only settings entry opens the complete hub. Display/font settings remain under Desktop → Display and fonts. Closing native appearance settings restores the content renderer's keyboard focus.
- One true-fullscreen control replaces the duplicate maximize square. Minimize and Close remain. Browser and desktop use confirmed state through the same client; an exit request arriving during browser entry is preserved. Immersive mode exposes a recovery control only while the header is hidden.

## Reproduce

Run `npm ci`, `npm --prefix desktop ci`, then:

- `npm run check`
- `npm --prefix desktop run build:music`
- `npm run test:browser`
- `npm run test:playback`
- `npm run test:focus-ui`
- `npm run test:shelf-ui`

The shelf suite uses isolated, muted Chromium contexts and local fixtures. It rejects unexpected network requests. `SHELF_OUTPUT`, `SHELF_FILTER`, and `BROWSER_EXECUTABLE` select output, test cases and a local browser. CI uses Playwright's installed Chromium. For visual baseline observation, copy the script into a detached worktree at the pinned base and set `SHELF_BASELINE=1`; this intentionally skips new geometry assertions and is not a passing regression result.

## Verified cloud results

| Suite | Result |
| --- | --- |
| Desktop unit tests | 277/277 |
| Frontend/model unit tests | 136/136 |
| Production build | Passed |
| Full browser smoke | 94/94 |
| Silent playback regressions | 14/14 |
| Focus/study/companion regressions | 23/23 |
| Shelf/window-control regressions | 11/11 |
| Isolated real Linux Electron probe | 3/3 |

Browser reports had no page errors or unexpected requests. The six scenes were captured at 1440×900, 960×600 and 640×600. Checks cover full-cell clicks, true keyboard focus, Enter selection, double-click and drag loading, fallback/recovery, DPR2 resizing, one settings/fullscreen entry, native bridge confirmation, browser denial/retry, and six real browser fullscreen cycles alternating button and Escape exits.

The separate Linux Electron probe used a fresh disposable profile and the locally built application. It verified actual focused WebContents after appearance-settings completion, Escape delivered to that focused renderer, restored settings-trigger focus, and real BrowserWindow fullscreen entry/exit. The content URL remains the application's HTTPS origin but its bundled assets are served by the desktop protocol handler. This is not an installed macOS/Windows acceptance run.

## Retained qualifications

- One preliminary browser run timed out on Escape; no root cause was established. A diagnostic rerun and the final six-cycle test passed after reading confirmed fullscreen state at event time. Do not describe every exploratory run as green.
- An initial component probe used the wrong dynamic-import shape and failed before exercising the component; the corrected probe covers image-failure recovery. An initial baseline settings selector was also corrected to accessible names before confirming the duplicate.
- The first desktop unit run could not populate Electron's default cache in this cloud environment. The official package installer was rerun with a workspace-local cache; the complete subsequent check passed. No system security settings changed.
- The original photo fixtures are 300×300; finer sampling cannot recover absent source detail. Artwork remains owned by its rights holders and is only used in existing local QA fixtures.
- Native macOS/Windows window animation, installed updater behavior and real music accounts remain untested. Browser Escape is browser-controlled and does not guarantee Electron's layered Escape behavior.
- The separately identified 5,000-card import-capacity boundary is deferred and is not part of this visual change.
