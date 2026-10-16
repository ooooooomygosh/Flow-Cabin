"""Opens the window sky of the two raster cabins (Pixel Cabin, Amber Cabin) so the live sky shows.

Usage: python3 scripts/art/cabin-window-sky.py
The room art keeps every pixel except the window: that region is copied from the clean plate
(<id>-cabin-clean.png, the window without painted snow) and its night-sky pixels become
transparent. Sky pixels are chosen by colour inside the glass panes, then a 3x3 majority pass
drops single keyed pixels inside the trees and fills pin-holes in the sky. Re-running is safe:
the clean plates are never modified, and the source window is always the clean one.
"""
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2] / 'public' / 'room-scenes'
BOX = (188, 170, 218, 286)  # window box and panes (art px), as scene-catalog `windows`
PANES = {
    'pixel': [(5, 7, 94, 102), (115, 7, 91, 102), (5, 126, 94, 157), (115, 126, 91, 157)],
    'warm': [(2, 3, 99, 109), (115, 3, 98, 109), (2, 124, 99, 156), (115, 124, 98, 156)],
}


def sky_pixels(scene, rgb):
    r, g, b = (rgb[..., i].astype(int) for i in range(3))
    if scene == 'pixel':  # navy night: red near zero, blue well above green
        return (r < 30) & (g >= 17) & (b >= 47) & (b < 120) & (b > g * 1.8)
    # Amber Cabin's two flat smoky sky tones; the trees reuse them in specks, which the
    # opening below removes (anything thinner than ~5 px is tree, not sky).
    return ((r == 24) & (g == 22) & (b == 22)) | ((r == 39) & (g == 34) & (b == 33))


def opening(mask, steps):
    def shift_all(m, op):
        p = np.pad(m, 1, constant_values=op is np.logical_and)
        out = p[1:-1, 1:-1].copy()
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            out = op(out, p[1 + dy:p.shape[0] - 1 + dy, 1 + dx:p.shape[1] - 1 + dx])
        return out
    for _ in range(steps):
        mask = shift_all(mask, np.logical_and)
    for _ in range(steps):
        mask = shift_all(mask, np.logical_or)
    return mask


def reachable_from_top(mask, panes):
    """Keeps only sky connected to the top edge of its pane (holes inside trees stay tree)."""
    seed = np.zeros_like(mask)
    for px, py, pw, ph in panes:
        seed[py:py + 14, px:px + pw] = mask[py:py + 14, px:px + pw]
    while True:
        p = np.pad(seed, 1)
        grown = (seed | p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]) & mask
        if (grown == seed).all():
            return seed
        seed = grown


def majority(mask):
    padded = np.pad(mask.astype(int), 1)
    total = sum(padded[1 + dy:1 + dy + mask.shape[0], 1 + dx:1 + dx + mask.shape[1]] for dy in (-1, 0, 1) for dx in (-1, 0, 1))
    return total >= 5


def main():
    x, y, w, h = BOX
    for scene, panes in PANES.items():
        art_path = ROOT / f'{scene}-cabin.png'
        art = np.asarray(Image.open(art_path).convert('RGBA')).copy()
        art[..., 3] = 255
        clean = np.asarray(Image.open(ROOT / f'{scene}-cabin-clean.png').convert('RGB'))
        window = clean[y:y + h, x:x + w]
        glass = np.zeros((h, w), bool)
        for px, py, pw, ph in panes:
            glass[py:py + ph, px:px + pw] = True
        key = sky_pixels(scene, window) & glass
        key = reachable_from_top((opening(key, 3) if scene == 'warm' else majority(key)) & glass, panes)
        art[y:y + h, x:x + w, :3] = window
        art[y:y + h, x:x + w, 3] = np.where(key, 0, 255)
        Image.fromarray(art, 'RGBA').save(art_path, optimize=True)
        print(f'{scene}: {key.sum()} sky pixels opened ({key.sum() / glass.sum():.0%} of the glass)')


if __name__ == '__main__':
    main()
