# Flow Cabin 2.1 pet art

Five built-in characters retain their existing identity: `cat`, `chick`, `bunny`,
`bear`, and `fox`. New art was generated with the local ImageGen tool on
2026-10-23. The tool does not return an exact model identifier. Original generation
filenames, references and prompts are recorded in the source JSON files.

## Runtime assets

Each character directory contains:

- `avatar-256.png`: a clean, unequipped identity portrait.
- `dock-{64,128,256,512,1024}.png`: sizes exported from a new high-resolution
  character master. These are never enlarged from a legacy 32px tray bitmap.
- `menu-{idle,blink,listen,focus}.png` and `@2x.png`: dedicated simplified menu
  portraits at 18 and 36 pixels. These are colored images, not template masks.
- `atlas.png`: 2048 × 1792 transparent atlas with 256 × 256 frame cells.
- `manifest.json`: 24 canonical clips, 50 separately drawn frames, durations,
  loop flags, source rectangles, alpha bounds and accessory landmarks.

`walk` has four stride frames; the other 23 actions each have two distinct stages:
idle, observe, stretch, yawn, sleep, wake, turn, greet, petresponse, dragged, land,
read, write, type, think, listen, nod, sway, dance, eat, satisfied, celebrate,
deliver. Frame durations belong to the clip; do not substitute an enum name for
the actual frame sequence. Reduced motion can hold frame zero.

The default foot anchor is `{x: 0.5, y: 0.9375}`: feet meet at pixel 240 of the
256-pixel cell, leaving transparent safety padding. All frames of one character
use the same scale. A sleeping or crouching character consequently remains lower
than a standing one.

## Independent accessories

`accessories/manifest.json` defines headphones, scarf, beanie, bow and sprout.
Each has front, quarter and right variants. Front and right headphones, scarves
and hats were regenerated after overlay QA to avoid covering eyes, leaving a
visible neck hole, or putting a diagonal hat across a profile face.

For each frame, `accessoryAnchors` contains `orientation`, `rotationDegrees`,
`supported`, and `head`, `neck`, `crown`, `temple` targets. Every target has
normalized `x`, `y`, `width`, plus `layer` (`front` or `behind`). Use the selected
accessory's `target`, `anchor` and `widthMultiplier` to place it. Apply rotation
around that target. Draw behind layers before the pet and front layers after it.
In particular, a sleeping pet's scarf is naturally occluded by its curled body.

`coordinateSpace` explicitly distinguishes atlas pixel rectangles, local pixel
content bounds, and normalized frame anchors. The avatar and Dock have their own
`identityAnchors`; animation-frame landmarks must not be reused on the larger
identity master. The menu portraits remain purpose-drawn small-size artwork.

`equipped/{headphones,scarf,beanie,bow,sprout}/` contains cached identity variants:
`avatar-256.png`, `dock-{512,1024}.png` and the four 18/36-pixel menu states.
Each pet manifest exposes `equipped[accessory].avatar`, `.dock` and `.menu` with
paths relative to that pet's directory. Missing or unequipped choices should use
the original top-level identity paths. The unequipped images are unchanged.

Equipped Dock images composite the independently generated high-resolution pet
and accessory masters using the reviewed `identityAnchors.dock`. Equipped menu
images instead use the dedicated portrait sheet and separately reviewed
`identityAnchors.menu[state]`, preserving the character's face and expression
at the actual small size. A single framing transform is shared by the four
menu states of each equipped variant to avoid animation framing jumps. No
runtime drawing, separate state machine or additional accessory image loading
is needed for native icons.

## Rebuild and verification

Use a Python environment with Pillow:

```sh
python3 scripts/package-pet-art-v21.py
python3 scripts/package-equipped-pet-art-v21.py
python3 scripts/qa-pet-art-v21.py
```

The packaging script only isolates generated sprites, retains their alpha edges,
resamples to usage sizes, and packs atlases. It does not procedurally draw animals
or manufacture poses. Connected foreground cutouts prevent neighboring source
cells from leaving stray pixels in a frame.

`qa/validation.json` records bounds, dimensions, transparency, clip coverage and
independent-frame checks. Actual-size menu/Dock comparisons, six common-action
accessory contact sheets, and five animated 24-action previews are in `qa/`.
These asset checks do not replace the application's real macOS, Android, mobile
or desktop UI acceptance tests.

`qa/equipped-validation.json` records the 25 pet/accessory combinations, all 275
PNG files in each deployment tree, exact sizes, transparency, distinct menu
states, preservation of the base images, and byte-identical desktop copies.
`qa/equipped-menu-actual-sizes.png` and `qa/*-equipped-identity-review.png` show
the equipped menu glyphs at 18/36 pixels and the Dock artwork at 128 pixels on
light and dark backgrounds. The desktop tree carries only the 11 required
rendered files for each combination, with no generation masters or QA sheets.

Keep `sources/`, `qa/` and provenance JSON in source control, but exclude raw
masters and QA previews from production packaging. Desktop identity copies are
in `desktop/assets/pets-v21`; only the active pet's animation atlas needs to load.
