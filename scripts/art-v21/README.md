# Flow Cabin 2.1 furniture artwork

The runtime package is `public/room-scenes/v21/furniture/{theme}`. Its eight themes are `pixel`, `warm`, `night-study`, `forest`, `seaside`, `starlight`, `rain-train`, and `greenhouse`.

Each theme contains four transparent lossless WebP atlases, a JSON manifest, and two standalone WebP sprites for the plant and tea panels. There are 32 types, 64 manifest keys and 60 distinct drawings per theme. The sun, moon, cloud and rain symbols are direction invariant and share their two facing keys. All other objects have two ImageGen drawings. They are not bitmap mirrors or quarter-turn rotations.

## Runtime schema

Read `manifest.json`, load the unique `frames[*].file` atlases, then crop the integer `[x, y, width, height]` in each `frame`. `logical` provides a display-fit box, `surface` is `floor`, `table` or `wall`, and `anchor` is `[0.5, 1]` by default. Preserve the crop aspect ratio when fitting it. Empty space around the crop is excluded from its display measurements.

`sprite` is optional. Only `plant-se` and `tea-se` expose standalone files:

```text
/room-scenes/v21/furniture/{theme}/sprites/plant-se.webp
/room-scenes/v21/furniture/{theme}/sprites/tea-se.webp
```

The historic facing IDs describe screen orientation, not compass directions:

| Key | Geometry |
| --- | --- |
| `se` | Long front edge rises toward screen-right; object faces lower-left. |
| `nw` | Long front edge falls toward screen-right; object faces lower-right. |

Weather symbols have `facing: "neutral"`, `supportedFacings`, and an `aliasOf` on the second key. All drawings use upper-left illumination. The room world is 1200 × 800; assets are compatible with the fixed oblique camera and should be uniformly fitted rather than stretched.

The desk has `supportAnchor` and `supportPolygon`; the deck/player have `turntableDisc`; clock, calendar, weather, task board, photo and timer provide blank display geometry. These coordinates are normalized to the trimmed frame. They are visually sampled from the pixel reference, with matching approximate geometry across theme variants. They are hints for fitting actual runtime content and must be checked in the composed room. The two independently drawn facings may have small construction or material-detail differences.

## Source record and QA

`furniture-provenance.json` records all ImageGen prompts, source basenames, source SHA-256 hashes, dimensions and any repaired-frame overrides. The source PNGs, prompts, packing inputs and individual sprite PNGs are archived outside `public` under the task's `outputs/art-v21-furniture/sources`. The original ImageGen output files are also left in place. QA reports and light/dark contact sheets are in `outputs/art-v21-furniture/qa`.

The production WebP encoding is lossless and uses `cwebp -lossless -exact`. Every output is decoded with `dwebp` and compared to its packed PNG, including alpha and RGB data under transparent pixels. Runtime sprites are deduplicated into atlases; archived PNG sprites remain available for source inspection and repacking. Repaired rug and facing sprites are mechanically fitted with nearest-neighbor sampling before packing; their generated originals, extraction rectangles and transformations are recorded separately.

`verify-furniture-assets.mjs` verifies all 512 logical entries, all 480 physical drawings, file existence, frame bounds, equality against archived PNG sprites, the two standalone crops per theme, visible alpha margins, aliases and normalized interaction geometry. It can render eight HTML contact sheets using an available Playwright package and Chromium executable. This checks the art package; application layout, accessibility, camera behavior and actual device rendering are validated by the application workflow.

## Utilities

```sh
node scripts/art-v21/pack-furniture-atlas.mjs /path/to/source-main.json
node scripts/art-v21/optimize-furniture-assets.mjs /path/to/archive
node scripts/art-v21/verify-furniture-assets.mjs /path/to/archive
```

The packer runs on a source workspace containing generated PNGs and source configurations. Do not run it directly on the optimized production directory: the source material has deliberately been moved out of the application bundle. The optimizer archives its PNG inputs before replacing runtime files and refuses to overwrite an existing archive. A rebuild from the initial source sheets must also apply the recorded `frameOverrides`; the reviewed archived atlas PNGs already include those repairs. Their original ImageGen sheets, extraction inputs and per-frame contexts are under `orientation-sources` and `repairs` beside the source archive.

To produce contact-sheet screenshots, pass the absolute Playwright `index.mjs` as the verifier's second argument. `FURNITURE_QA_BROWSER_EXECUTABLE` may point to an installed Chrome/Chromium executable when Playwright has no bundled browser.

`replace-furniture-frame.mjs` installs a newly generated replacement into the existing atlas cell, archives the prior sprite, records the prompt/source override, and repeats exact WebP roundtrip verification. It does not paint or invent artwork.
