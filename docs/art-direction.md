# Art direction · 心流小屋

Owner of this document: art direction (beauty).

**3.0 direction — 高级温馨 (premium, warm, quiet).** The painted v2.1 rooms and the
pixel sprites (cat, turntable, sky, weather) stay the hero and keep their pipeline
below. The UI chrome around them steps back: warm walnut glass, one amber accent,
soft corners and shadows, a readable sans face. The 2.x rule "pixel everything,
nothing glossy or rounded" is **superseded for chrome** (see the end of this
section); it still describes the classic room's scene pieces and the sprite art.
Spec: [`docs/design/3.0-design.md` §7](design/3.0-design.md).

## 3.0 UI chrome (current)

| Area | Rule |
|---|---|
| Hierarchy | One hero per screen: home = the room, 唱片架 = covers, 专注 = the time, 日记 = the records. Everything else drops contrast (`--ui-text-2/3`, hairlines, low-alpha glass). |
| Tokens | New chrome reads the semantic `--ui-*` tokens in `src/styles/tokens.css` only; `--px-*` stay as the palette underneath and for scene art. Feature files use a fallback while streams merge: `var(--ui-surface, var(--px-surface))`. `css-lint.test.mjs` fails on an unknown `--ui-*` name. |
| Panels | Dialogs, drawers, bars, chips: `--ui-surface` (walnut glass, α .88) + `backdrop-filter: blur(var(--ui-blur))` + 1px `--ui-line` + `--ui-shadow` / `--ui-shadow-lg`. Corners `--ui-radius-lg` 12px (panels, cards), `--ui-radius` 8px (buttons, fields), `--ui-radius-pill` (chips, segmented, switchers), `--ui-radius-sm` 4px (key caps, thumbnails). No 9-slice frames, bevels or hard offset shadows on chrome. Padding 20/24px; list rows ≥ 44px. |
| Colour | Amber `--ui-accent` is the only accent: primary buttons, the open tab's rule, selected washes (`--ui-accent-soft`), slider knobs, focus ring. `--ui-good` / `--ui-danger` only for state. Text `--ui-text` / `--ui-text-2` / `--ui-text-3`. |
| Buttons | `.pixel-button` (name kept for compatibility) is a ghost with a `--ui-line-strong` hairline; `.is-primary` amber with `--ui-accent-text`; `.is-quiet` text only; `.is-danger` danger ink + hairline. Hover = `--ui-surface-hover` wash, press = `scale(.98)`. The face reads `--btn-bg`, `--btn-bg-hover`, `--btn-ink`, `--btn-line`: set those from a feature file to tune one button without fighting the skin layer. Icon buttons (close, window controls): 36px, 8px corners, `--ui-text-2` → `--ui-text`. |
| Fields | `--ui-field` well, 1px `--ui-line-strong`, 8px corners, amber edge on hover/focus, placeholder `--ui-text-3`, a smooth chevron on selects. Checkbox/radio take `accent-color`. Sliders: 4px pill track, 14px amber knob. |
| Tabs / segmented | `.dialog-tabs`: quiet labels over a hairline, the open tab gets a 2px amber rule. `.segmented`: one pill, the chosen option is `--ui-accent-soft` with an amber hairline. |
| Toasts, chips, tooltips | Toast = raised glass note (`--ui-surface-raised`), 12px corners, centred; errors add a 3px `--ui-danger` rule. Furniture / zone / corner labels and the hint pill are glass chips (`--ui-radius-pill`). Furniture labels are hidden until hover/focus; a hotspot the shell keeps on gets `data-hotspot` on `.home-furniture` and rests at low contrast. |
| Type | `--ui-font` (the user's font from 设置 › 显示与字体; HarmonyOS Sans when installed, else the system CJK face — the bundled HarmonyOS files load only when 「内置」 is picked, 8 MB a weight). Scale `--ui-fs-xs…3xl` = 12/13/15/18/24/32/48px; line height `--ui-lh` 1.5 body / `--ui-lh-tight` 1.2 titles. Titles use the same family at 300–500 (`--ui-font-display`), never bold. |
| Pixel face | `--ui-font-digits` (= `--px-font-en`, 8px grid) only for timer digits and small decorative labels (badges, kickers on the classic record card). Never on buttons, tabs, dialog titles, toasts or body copy; `css-lint.test.mjs` checks the chrome sheets. |
| Motion | `--ui-dur` 240ms / `--ui-dur-slow` 320ms on `--ui-ease` `cubic-bezier(.2,.8,.2,1)`. Move only `transform` / `opacity` (colour washes may fade). Every entrance has a reduced-motion fallback: the `guards` layer kills animation and transition under `prefers-reduced-motion` and `html[data-desktop-reduce-motion=true]`; the home also honours `.is-reduced`. |
| Glass & performance | 流畅模式 (`html[data-perf=low]`) and `prefers-reduced-transparency` drop every `backdrop-filter` in one rule (`perf-low.css`, `guards`) and make the surfaces near-opaque, so text keeps its contrast without the blur. `backdrop-filter` is only ever `blur(var(--ui-blur))` (lint). |
| Contrast | Body text ≥ 4.5:1 on `--ui-surface` composited over the darkest (#000) and the lightest (#fff) room, and on a raised card / hover wash on top (numbers in `tokens.css`, enforced by `css-lint.test.mjs`): `--ui-text` 15.5 / 10.7, `--ui-text-2` 10.4 / 7.2, `--ui-text-3` 8.3 / 5.7, lowest pair 4.65 (`--ui-danger` on the hover wash over white). |
| Classic home | `data-interface="classic"` keeps its pixel scene pieces — the toolbar HUD frames, shelf filters, the selection card and empty-shelf card, turntable copy, the cat's paper bubble — in the pixel face on its 12px grid. Shared chrome there (title bar, dialogs, buttons, fields, toasts) is 3.0. |

Cascade: `guards → reset (tokens, fonts) → features (component files, app.css)
→ skin (styles/pixel-ui.css: the shared faces) → overrides (home.css, 流畅模式)`.
Layout lives in feature files; the skin sets faces only.

### Superseded: 2.x pixel chrome rules

Kept for the classic room's scene pieces and the sprite art; **not** for new chrome.

| Area | 2.x rule | 3.0 status |
|---|---|---|
| Palette | Only the tokens in `src/styles/tokens.css` (`--px-*`). JS/canvas: `src/styles/tokens.ts`. | Palette stays; chrome reads `--ui-*`. |
| Type | Pixel display face `--px-font-cn` (Fusion Pixel 12px) / `--px-font-en` (Silkscreen) for chrome, titles, buttons; snap to **12 px or 24 px**. Long prose uses `--px-font-body`. | Superseded for chrome; scene pieces and timer digits only. |
| Shape | No radii. Panels use the 9-slice notched frame `border-image: var(--px-frame-img) 2 / 6px`; buttons get a 2 px bevel + hard shadow (`--px-shadow-*`). | Superseded for chrome; classic scene pieces only. |
| Motion | `steps()` easing (`--px-ease`), durations `--px-dur-fast/med/slow`. Animate `translate/scale/opacity` only. Every animation has a reduced-motion fallback. | Sprites and scene props still move in frames; chrome eases (`--ui-ease`). |

## Scene art rules (current)

| Area | Rule |
|---|---|
| Images | Pixel art always `image-rendering: pixelated` (`.px-crisp`). Room covers are centre-cropped and box-filtered to 64×64 then upscaled, preserving the album’s own colours. Original files remain intact for exports and future edits; generated coverless sleeves keep their hand-drawn 32×32 grid. |
| Scenes | All six rooms are pixel art — Pixel Cabin 像素小屋 (default), Amber Cabin 琥珀小屋, Moonlit Study 月夜书桌, Forest Glade 林间书屋, Seaside 海边慢屋, Starry Night 星夜阁楼 (`labelEn` in `scene-catalog.mjs`). Vector sources stay in `public/room-scenes/*.svg`; the room shows `*-cabin-pixel.png` (`scene.view`), made with `scripts/art/pixelate-scene.py`; Forest / Seaside / Starry Night are repainted by `scripts/art/paint-scenes.mjs` + `paint-scene.py` (wood grain, boards, planks, rug weave, sparse grain, one warm lamp in five dithered steps with hue-shifted ramps and a 1 px rim, 56 colours, 4× nearest). Every window's sky is transparent in the art: the live sky shows through it. |
| v2.1 home | The painted isometric rooms and corner close-ups (`public/room-scenes/v21/`) are the 3.0 reference look; chrome over them uses the glass above and never covers more than it must. |

## Live layers on top of the art

The benchmark Pixel Cabin now uses `public/room-scenes/amber-retreat.png`,
generated for this project with the existing shelf/window geometry as its
constraint. `pixel-cabin.png` remains its alpha mask, preserving the live sky.
The reading lamp, window and hearth have matching interactive regions in
`src/room/CabinDetails.jsx`; short windows expose the lamp switch below the
title bar because the compact player covers the painted lamp. The transparent
toolbar area passes pointer events through to the room.

Room and desktop cats share `PixelCat` and `cat-sprites.mjs`. Every pose keeps
the selected coat and accessory; keyboard/pointer activity, feeding and music
resolve to one pose instead of stacking unrelated images. The sage bow is a
starter accessory; the sprout hat joins the existing earned wardrobe.

- **Turntable** — `src/scene/SceneDeck.jsx` + `deck-sprite.mjs`: a 56×22-cell sprite (1 cell = 4 art px) sitting on the shelf top, per-scene position in `scene-deck.css`. Record seats in 4 frames, sheen orbits in 8, tonearm swings in 4, LED + notes while playing, halo follows `cabin:playback` energy. The painted turntable was removed from the pixel/amber art so there is only one deck. Wood is graded per scene (`DECK_PALETTES`: walnut for Pixel/Amber, own-shelf tones for Forest/Seaside/Starry Night) through `--deck-N` CSS variables. The room cat stands on each scene's painted `floor` line (`scene-catalog.mjs`, art px) at 32 cells × 4 art px × k, snapped to a whole multiple of 32 CSS px; records without a cover get a generated 32×32 cabin-palette sleeve.
- **Console** — `src/scene/room-console.css`: compact framed panel bottom-left; audio sliders stay pinned when the 待播 queue is open.
- **Sky** — `src/CabinAtmosphereSky.jsx` for every scene's `windows` (`scene-catalog.mjs`, art px): a minute clock (`sky-clock.mjs`) takes the sun's altitude from vendored SunCalc for the chosen city (`sky-cities.mjs`, default from the time zone; 固定作息 = a fixed 6:30–18:30 curve) and picks colours from separate morning / evening keyframe sets in sun-altitude space (`sky-model.mjs`). They land as `--sky-*` variables registered with `@property`, eased by CSS in `steps(6)`; the bucket strings (`morning/day/dusk/night`) stay for older selectors. Behind the art: a hard-banded gradient plus a pixel canvas (stars, moon with its real phase, sun, clouds, distant fog, contained lightning). Over painted land / sea in the glass: a once-a-minute soft-light tint. Room: `.cabin-daylight` (glow) and `.cabin-nightshade` (multiply, with a hole around the scene's lamp).
- **Weather** — `sky-weather.mjs`: `{kind, intensity, wind}` → layers (clouds, fog, rain, snow, storm, starry) cross-fading over 30 s from absolute time. `sky-paint.mjs` writes 1 canvas px = 4 art px with Bayer coverage, clipped to each window's glass (mullions excluded): rain streaks, snow, fog banks, beads on the glass when it rains. Frame budget on the shared frame clock: rain / snow / storm 12 fps (8 on 流畅), drifting cloud / fog / twinkle 2 fps (1), clear sky 0 (the loop stops); hidden, occluded or reduced motion stop it (reduced shows a still frame, no lightning). Real weather is opt-in and desktop-only (`desktop/weather.cjs`, Open-Meteo).
- **Ambient** — `src/scene/AmbientLife.jsx`: dust motes + window light beam (strength follows `--sky-light`). Fire / hearth light remain in `CabinAtmosphere` (Pixel / Amber).
- **Companion** — `src/pet/PetLife.jsx`: breathing, hover perk, poke squish + hearts, drag dangle, Zzz, focus dots, sparkles, music bop scaled by `--pet-energy`.

## Events consumed

`cabin:playback` (see `docs/events.md`) through `src/scene/playback-listener.mjs`: listeners are coalesced to one call per animation frame and only write CSS variables (`--deck-energy`, `--pet-energy`), so visuals never re-render React at 15 Hz. Without the event everything idles.

## Asset sources & licences

| Asset | Source | Licence |
|---|---|---|
| Fusion Pixel 12px (subset) | github.com/TakWolf/fusion-pixel-font v2026.09.25 | SIL OFL 1.1 (`public/fonts/pixel/`) |
| Silkscreen (subset) | github.com/google/fonts `ofl/silkscreen` | SIL OFL 1.1 |
| Turntable, notes, hearts, Zzz, sparkles, frames | drawn in code in this repo | project licence |
| Scene pixel renders | derived from the repo's own scene art | project licence |
| Sky, weather, moon, repainted Forest / Seaside / Starry Night | drawn in code in this repo (`src/sky-paint.mjs`, `scripts/art/paint-scene.py`) | project licence |
| SunCalc (sun / moon position, moon phase) | github.com/mourner/suncalc @21449f3, vendored as `src/sky-suncalc.mjs` | BSD-2-Clause (`public/licenses/suncalc-LICENSE.txt`) |
| Weather data (desktop, opt-in) | open-meteo.com forecast API, fetched in the Electron main process | data CC BY 4.0, attributed in 设置 › 房间与桌宠 |
| Cloud puff layout idea | Skycons (darkskyapp/skycons) | CC0 — idea only, no code |
| Focus faces (专注画面), pixel digits | drawn in code in this repo (`src/focus/faces/`, `src/focus/pixel-digits.mjs`) | project licence |
| Flip-card maths (squash + darken) | ported from github.com/alexanderk23/gluqlo `render_digits()` (font not used) | ISC-style, notice in `public/licenses/gluqlo-LICENSE.txt` |

## Moonlit Study 月夜书桌 (night-study)

The illustrated desk scene from PR #8 follows the same pipeline:
`python3 scripts/art/pixelate-night-study.py` reads the hi-res sources in `scripts/art/sources/` (not shipped) and writes `night-study-pixel.png`
(48 colours, 4px grid), plus a clean plate and the 4×4 hand-pose atlas quantised
with the *same* palette and snapped to the grid (hand box art x260 y480, 136×136),
so the writing / pen-spin poses swap whole art pixels. The pose timeline in
`StudyWriting.jsx` is already frame-stepped; reduced motion holds pose 0.
Shadows are hard offsets. The scene has no free surface outside the UI safe
areas, so the console is the only turntable here (the scene deck is hidden).
The flagship Pixel Cabin (`pixel`) is the default room; Moonlit Study stays selectable.

## Fitting short windows

`roomGeometry` keeps each scene's `band` (art rows: shelf-top deck → bottom row;
Moonlit Study: shelf only) between the toolbar and the now-playing footer. When a
window is too short (1280×720, 1366×768) the art scales down instead of letting
the toolbar cover the deck; side gutters show the same scene dimmed. On Moonlit
Study the shelf paging sits on the wall left of the cabinet (canvas-relative via
`--scene-x/y/k`), so it never covers a record. browser-smoke checks all scenes at
1280×720, 1280×800, 1366×768, 1440×900 and 1920×1080.

## 小屋日记 art slots

The journal overlay ships with a tokens-only baseline. All of its visuals are variables in `src/focus/stats/journal-art.css` (scoped to `.cabin-journal`); image slots are also listed in `src/focus/stats/journal-art.mjs` (`JOURNAL_ART`), which sets the CSS variable and a `has-art` class when a URL is given. Drop PNGs (pixel art, 4× nearest, `image-rendering: pixelated`) into `public/journal/` and set the slot.

| slot | CSS variable(s) | baseline |
| --- | --- | --- |
| cover frame | `--journal-frame`, `--journal-frame-img` (9-slice, `--journal-frame-slice`, `--journal-frame-w`) | `--px-border` edge, hard shadow |
| paper | `--journal-paper`, `--journal-paper-img`, `--journal-rule`, `--journal-paper-ink`, `--journal-paper-faint` | `--px-paper` with 24 px ruled lines |
| spine | `--journal-spine`, `--journal-spine-img`, `--journal-stitch` | `--px-accent-lo` gutter with dashed stitches |
| bookmark tabs | `--journal-tab`, `--journal-tab-active`, `--journal-tab-img` (+ `-ink`) | ribbons with a notched tail (clip-path) |
| charts | `--journal-ink`, `--journal-ink-hi`, `--journal-stamp-0…4` | ink bars, stamp heatmap cells |
| weekly card | `--journal-card`, `--journal-card-paper-img` (slot `cardPaper`, defaults to `paper`), `--journal-card-img` (slot `card`), `--journal-card-tape` / `--journal-card-tape-img` (slot `cardTape`), `--journal-card-doodle` (slot `doodle`, 48×48) | taped paper card; doodle hidden until set |
| page turn | `--journal-turn` | `steps(4)` scaleX turn; off under reduced motion |

### Notebook sprites (cat, stickers, stacked bars)

Final art by beauty lives in `public/cat/` (#55, preview `docs/media/cat-mood-sheet.png`); the journal reads it through `JOURNAL_SPRITES` in `src/focus/stats/journal-art.mjs`. All are **transparent PNGs drawn at 1×** and shown at an integer scale with `image-rendering: pixelated` (nearest-neighbour). Replace a file by name to update it.

| slot | file | size (1×) | where it shows |
| --- | --- | --- | --- |
| cat poses | `cat-sleep-books`, `cat-wait`, `cat-desk`, `cat-rub`, `cat-droopy` | 64×64 each | 周报 card (2×, 128 px; 96 px under 1100 px wide), empty states, 待办 note, mood doodle (1×). Pose comes from `catPose()` in `journal-layout.mjs`: ≥300 min → sleep-books, ≥60 → desk, mood happy → rub, mood low and a quiet week → droopy, else wait. |
| eating | `cat-eat.png` | 64×64 per frame, 6–8 frames in one horizontal strip, 120 ms/frame | Reserved for the feeding animation (pet logic). |
| music groove | `cat-groove.png` | 64×64 per frame, 4 frames in one horizontal strip (head left, centre dip, head right, centre dip; tail swings with the head) | Panel cat while music plays with a detected beat; advance 2 frames per beat from `beat-clock`. Mirrors the room cat's `groove` pose in `src/pet/cat-sprites.mjs`. |
| music listen | `cat-listen.png` | 64×64 | Panel cat still pose (eyes closed, small note) when the beat is missing or `estimated`. Mirrors the room cat's `listen` pose (`LISTEN_POSE`). |
| typing | `cat-typing.png` | 64×64 per frame, 4 frames (left paw down, up, right paw down, up) behind a small keyboard on a desk edge | Cat while you type; ~110 ms/frame or one frame per key burst. Room / desktop pet: `TYPING_POSE` / `TYPING_FRAMES` in `src/pet/cat-sprites.mjs`. |
| double-click hop | `cat-hop.png` | 64×64 per frame, 6 frames (crouch, "!" surprise, lift, peak, land, settle with sparkles) | Plays once on double-click, then back to the current pose. Code sprite: `HOP_POSE` / `HOP_FRAMES`. |
| letter delivery | `cat-deliver.png` | 64×64 per frame, 8 frames (walks in from the right with an envelope in its mouth ×4, stops, drops it, proud ×2) | Plays once when a cabin letter arrives; hold the last frame. Code sprite: `DELIVER_POSE` / `DELIVER_FRAMES`. |
| desktop-pet eat | (code sprite) | 32×32, 6 frames, mirrors `cat-eat.png` | Desktop pet eating a 小鱼干 after a drop or right-click feed: `EAT_POSE` / `EAT_FRAMES`. |
| empty 待办 | `todo-empty` | 64×64 | 待办 right page (2×) when fewer than 3 to-dos are done, with 「慢慢来，写下第一件事吧」; falls back to `cat-wait` until the file exists. |
| small stickers | `sticker-best-day-sm`, `sticker-streak-sm`, `sticker-fed-sm` | 16×16 | Narrow pages (≤1100 px wide or ≤760 px tall): the best-day sticker sits on the bar's top unit instead of beside the minute label. Falls back to the 32×32 sticker drawn at 16 px. |
| stickers | `sticker-best-day`, `sticker-streak`, `sticker-fed` | 32×32 | best-day bar (once per chart), 概览 streak (≥2 days), mood doodle when fed this week. |
| bar units | `bar-book` + `bar-book-cap`, `bar-record` + `bar-record-cap` | 16×6 unit + 16×4 cap | Bars are stacks of units, 2× (32×12 per unit, 32×8 cap), max 10 units per chart (`barUnits()`), mini card 1× and 5 units. 周报 uses books, 概览 uses records. |

The weekly stamp (`card` slot) is a **single element** `.fs-stamp`; it must never be a background of `.fs-card` (backgrounds tile by default, which is how six stamps ended up over the chart). `focus-stats.test.mjs` checks this.

The PNG export (`week-card.mjs`, 600×840) mirrors the 周报 spread: tape and stamp once, cat pose ≤128, stacked book bars with minute labels and the best-day sticker, 小屋来信, a polaroid of the most-played cover and the mood line (only when mood data exists).

### Weekly card PNG export

`week-card.mjs` draws the exported card on a canvas with `imageSmoothingEnabled = false` and integer scales only. It reads the same slots (`CARD_EXPORT_SLOTS`, same-origin URLs only so the canvas stays exportable):

| slot | file (suggested) | how it is drawn | export size |
| --- | --- | --- | --- |
| `paper` / `cardPaper` | `paper.png` / `card-paper.png` | seamless tile, repeated 1:1 over the card; `cardPaper` overrides, otherwise the page `paper` is used | any tile size, already 4× |
| `card` | `card.png` | **transparent** stamp + postmark corner, drawn **once** top-right, never tiled | largest integer scale ≤ 96×96 px |
| `cardTape` (optional) | `card-tape.png` | once, top centre | largest integer scale ≤ 128×32 px |
| `doodle` | `doodle.png` | stands in for the cat pose when the pose sprite fails to load | largest integer scale ≤ 128×128 px |

With a paper tile the export switches to `CARD_PAPER_PALETTE` (dark ink on paper); with every slot empty it keeps the dark `CARD_PALETTE` baseline (a mirror of the `--px-*` tokens).

## v1.18 slots (tray icons, cabin letters)

Generated by `python3 scripts/art/v118-art.py` (after `scripts/art/cat-mood.py`). Preview: `docs/media/v118-art-sheet.png` (4×), GIFs `docs/media/cat-typing.gif`, `cat-hop.gif`, `cat-deliver.gif`.

| Slot | File | Size | Use |
| --- | --- | --- | --- |
| macOS menu bar | `desktop/assets/tray/trayTemplate-{play,pause,focus,cat}.png` + `@2x` | 16×16 / 32×32, black + alpha | Template images (`setTemplateImage(true)`); macOS tints them for light / dark bars. play = music playing, pause = paused, focus = Pomodoro running, cat = idle. |
| Windows / Linux tray | `desktop/assets/tray/tray-{play,pause,focus,cat}.png` (32), `-16.png`, `.ico` (16+32) | 16 / 32, coloured with ink outline | Same states as the macOS set. |
| envelope | `public/journal/envelope.png` | 48×32 per frame, 2 frames: closed (wax seal + stamp), open (letter peeking out) | Cabin-letter list item / opening animation. |
| wax seal | `public/journal/wax-seal.png` | 16×16 | Unread badge / letter footer. |
| mailbox | `public/journal/mailbox.png` | 32×32 per frame, 2 frames: flag down, flag up | Flag up = new letter waiting. |
| letter paper | `public/journal/letter-paper.png` | 32×32, tiles seamlessly | Background for the letter body (`background: url(...) repeat`, `image-rendering: pixelated`). |

### 小屋来信 placeholders (AI Beta)

The journal's letter spot (`LetterSpot` in `CabinJournal.jsx`) reads the v1.18 letter slots above through `JOURNAL_SPRITES` (`letter-envelope`, `letter-seal`, `mailbox`, `letter-paper`, `cat-deliver`). Same-size placeholders live in `public/letters/` (`envelope.png` 96×32, `wax-seal.png` 16×16, `mailbox.png` 64×32, `letter-paper.png` 32×32, `cat-deliver.png` 512×64) and are swapped in by `<img onError>` only when a final file is missing, so the build works before #59 lands. Use: mailbox frame 1 (flag up) while a letter is unread — on the journal letter header and the 统计 tab's 信箱 entry; sealed envelope (frame 0) + wax seal until 「拆开看看」, with `cat-deliver` played once (8 × 140 ms, holds the last frame; reduced motion shows the last frame only); the open envelope (frame 1) and `letter-paper` tile behind an opened AI letter.

## Scene warmth and typography

Cool sea and night windows remain part of each room’s identity. The turntable plinth stays warm wood; brass and small cool rim highlights connect it to the room without becoming its brightest object. Seaside and Starry Night use darker wood ramps in `DECK_PALETTES`, mirrored by the existing CSS variables.

Prose uses `--ui-font` (see 3.0 UI chrome); Fusion Pixel remains the display face of the classic room's scene pieces and the timer digits. Original HarmonyOS files stay intact and available when explicitly selected. The bundled font licence prohibits modifications, so the default loading fix does not subset or alter those files.

Paper’s small secondary text uses `--px-paper-dim`; bevel colours are decorative. The semantic text/background contrast pairs are checked in `src/css-lint.test.mjs`.
