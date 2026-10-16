"""Picker thumbnails for the scene cards (settings and onboarding).

Usage: python3 scripts/art/scene-thumbs.py
Each scene's room art (1448x1086, 4x4 art pixels) is box-downscaled by 4 to
362x272, one image pixel per art pixel, so a card loads ~1/20 of the scene's
bytes. Writes public/room-scenes/thumbs/<scene id>.png.
The windows are transparent (the live sky shows through them in the app), so
each thumbnail gets a fixed sky behind its glass: hard bands from top to
horizon (no smooth ramps) plus a few stars on the night ones.
"""
from pathlib import Path
import math
from PIL import Image, ImageColor

ROOT = Path(__file__).resolve().parents[2] / 'public' / 'room-scenes'
SCENES = {'pixel': 'pixel-cabin.png', 'warm': 'warm-cabin.png', 'night-study': 'night-study-pixel.png', 'forest': 'forest-cabin-pixel.png', 'seaside': 'seaside-cabin-pixel.png', 'starlight': 'starlight-cabin-pixel.png'}
# (top, horizon, stars) per scene: the two hearth cabins and the starlight room at night.
NIGHT, DAY = ('#0b1030', '#2a3466', True), ('#6aa4e4', '#d4e6ee', False)
SKIES = {'pixel': NIGHT, 'warm': NIGHT, 'night-study': NIGHT, 'forest': DAY, 'seaside': DAY, 'starlight': NIGHT}

def sky(size, top, horizon, stars):
    w, h = size; a, b = ImageColor.getrgb(top), ImageColor.getrgb(horizon); im = Image.new('RGB', size)
    px = im.load()
    for y in range(h):
        t = min(5, int(y / h * 1.6 * 6)) / 5
        c = tuple(round(a[k] + (b[k] - a[k]) * t) for k in range(3))
        for x in range(w): px[x, y] = c
    if stars:
        for i in range(260):
            x, y = int(abs(math.sin(i * 12.9898) * 43758.5453) % 1 * w) // 4 * 4, int(abs(math.sin(i * 78.233) * 43758.5453) % 1 * h * .6) // 4 * 4
            for dx in range(4):
                for dy in range(4): px[x + dx, y + dy] = (232, 236, 255) if i % 3 else (200, 206, 240)
    return im

(ROOT / 'thumbs').mkdir(exist_ok=True)
for scene, name in SCENES.items():
    art = Image.open(ROOT / name).convert('RGBA'); back = sky(art.size, *SKIES[scene]); back.paste(art, (0, 0), art)
    im = back.resize((362, 272), Image.BOX)
    im.quantize(colors=96, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(ROOT / 'thumbs' / f'{scene}.png', optimize=True)
