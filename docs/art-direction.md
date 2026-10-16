# Art direction · 心流小屋 pixel style

Reference mood: cozy lo-fi pixel room (in the spirit of *Chill Pulse 心流小筑*) —
warm wood and amber lamplight, soft night-blue windows, slow ambient motion,
nothing glossy or rounded. Owner of this document: art direction (beauty).

## Rules

| Area | Rule |
|---|---|
| Palette | Only the tokens in `src/styles/tokens.css` (`--px-*`). JS/canvas: `src/styles/tokens.ts`. |
| Type | Pixel display face `--px-font-cn` (Fusion Pixel 12px) / `--px-font-en` (Silkscreen) for chrome, titles, buttons; snap to **12 px or 24 px**. Long prose uses `--px-font-body`. |
| Shape | No radii. Panels use the 9-slice notched frame `border-image: var(--px-frame-img) 2 / 6px`; buttons get a 2 px bevel + hard shadow (`--px-shadow-*`). |
| Motion | `steps()` easing (`--px-ease`), durations `--px-dur-fast/med/slow`. Animate `translate/scale/opacity` only. Every animation has a reduced-motion fallback (`prefers-reduced-motion` and `html[data-desktop-reduce-motion=true]`). |
| Images | Pixel art always `image-rendering: pixelated` (`.px-crisp`). Covers are box-filtered to 64×64 then upscaled. |
| Scenes | All six rooms are pixel art — Pixel Cabin 像素小屋 (default), Amber Cabin 琥珀小屋, Moonlit Study 月夜书桌, Forest Glade 林间书屋, Seaside 海边慢屋, Starry Night 星夜阁楼 (`labelEn` in `scene-catalog.mjs`). Vector sources stay in `public/room-scenes/*.svg`; the room shows `*-cabin-pixel.png` (`scene.view`), made with `scripts/art/pixelate-scene.py`. |

## Live layers on top of the art

- **Turntable** — `src/scene/SceneDeck.jsx` + `deck-sprite.mjs`: a 56×22-cell sprite (1 cell = 4 art px) sitting on the shelf top, per-scene position in `scene-deck.css`. Record seats in 4 frames, sheen orbits in 8, tonearm swings in 4, LED + notes while playing, halo follows `cabin:playback` energy. The painted turntable was removed from the pixel/amber art so there is only one deck. Wood is graded per scene (`DECK_PALETTES`: walnut for Pixel/Amber, own-shelf tones for Forest/Seaside/Starry Night) through `--deck-N` CSS variables. The room cat stands on each scene's painted `floor` line (`scene-catalog.mjs`, art px) at 32 cells × 4 art px × k, snapped to a whole multiple of 32 CSS px; records without a cover get a generated 32×32 cabin-palette sleeve.
- **Console** — `src/scene/room-console.css`: compact framed panel bottom-left; audio sliders stay pinned when the 待播 queue is open.
- **Ambient** — `src/scene/AmbientLife.jsx`: dust motes + window light beam (time-of-day aware). Snow / fire / daylight remain in `CabinAtmosphere`.
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
