"""Picker thumbnails for the scene cards (settings and onboarding).

Usage: python3 scripts/art/scene-thumbs.py
Each scene's room art (1448x1086, 4x4 art pixels) is box-downscaled by 4 to
362x272, one image pixel per art pixel, so a card loads ~1/20 of the scene's
bytes. Writes public/room-scenes/thumbs/<scene id>.png.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2] / 'public' / 'room-scenes'
SCENES = {'pixel': 'pixel-cabin.png', 'warm': 'warm-cabin.png', 'night-study': 'night-study-pixel.png', 'forest': 'forest-cabin-pixel.png', 'seaside': 'seaside-cabin-pixel.png', 'starlight': 'starlight-cabin-pixel.png'}
(ROOT / 'thumbs').mkdir(exist_ok=True)
for scene, name in SCENES.items():
    im = Image.open(ROOT / name).convert('RGB').resize((362, 272), Image.BOX)
    im.quantize(colors=96, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(ROOT / 'thumbs' / f'{scene}.png', optimize=True)
