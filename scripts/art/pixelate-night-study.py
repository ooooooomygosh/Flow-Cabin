"""Pixel treatment for 月夜书桌 (night-study), see docs/art-direction.md.

Usage: python3 scripts/art/pixelate-night-study.py [colours=48]
Same pipeline as pixelate-scene.py (1/4 box downscale, median-cut palette, no
dither, 4x nearest upscale). The clean plate and the 4x4 hand-pose atlas are
quantised with the scene's palette and snapped to the same 4px grid, so the
writing animation swaps whole art pixels. Hand box: art x260 y480, 136x136.
"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image

# Hi-res sources live beside this script (not shipped); outputs go to public/.
S = Path(__file__).resolve().parent / 'sources'
R = Path(__file__).resolve().parents[2] / 'public/room-scenes'
colours = int(sys.argv[1]) if len(sys.argv) > 1 else 48
src = Image.open(S / 'night-study.png').convert('RGB')
pal = src.resize((362, 272), Image.BOX).quantize(colors=colours, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
up = lambda q: q.convert('RGB').resize((1448, 1088), Image.NEAREST).crop((0, 0, 1448, 1086))
up(pal).save(R / 'night-study-pixel.png', optimize=True)
clean = Image.open(S / 'night-study-clean.png').convert('RGB').resize((362, 272), Image.BOX)
up(clean.quantize(palette=pal, dither=Image.Dither.NONE)).save(R / 'night-study-clean-pixel.png', optimize=True)

hands, cell = Image.open(S / 'night-study-hands.png').convert('RGBA'), 1254 / 4
atlas = Image.new('RGBA', (136 * 4, 136 * 4), (0, 0, 0, 0))
for i in range(16):
    cx, cy = i % 4, i // 4
    pose = hands.crop((round(cx * cell), round(cy * cell), round((cx + 1) * cell), round((cy + 1) * cell))).resize((134, 134), Image.LANCZOS)
    box = Image.new('RGBA', (136, 136), (0, 0, 0, 0)); box.paste(pose, (-1, 0))  # source box starts at art x259
    a = np.asarray(box).astype(float); alpha = a[..., 3:4] / 255
    pm = np.concatenate([a[..., :3] * alpha, a[..., 3:4]], -1).reshape(34, 4, 34, 4, 4).mean((1, 3))
    al = pm[..., 3:4] / 255; rgb = np.where(al > 0, pm[..., :3] / np.maximum(al, 1e-6), 0)
    small = Image.fromarray(rgb.clip(0, 255).astype('uint8'), 'RGB').quantize(palette=pal, dither=Image.Dither.NONE).convert('RGBA')
    small.putalpha(Image.fromarray(((al[..., 0] > .5) * 255).astype('uint8'), 'L'))  # hard 1-bit edge
    atlas.paste(small.resize((136, 136), Image.NEAREST), (cx * 136, cy * 136))
atlas.save(R / 'night-study-hands-pixel.png', optimize=True)
