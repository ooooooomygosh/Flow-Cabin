"""Texture and light pass for the vector rooms (driven by scripts/art/paint-scenes.mjs).

Usage: python3 scripts/art/paint-scene.py <scene id> <render dir> <out.png>
The render dir holds base.png (the room, 1448x1086) and key-<material>.png renders where that
material's fill is #ff00ff. Everything happens at the art-pixel resolution, 362x272:
  * materials: painted boards on the walls, planks on the floor, a woven rug, grained
    cabinet wood; per-board tone and sparse grain so no surface is a flat fill;
  * one warm light (the room's lamp) in five dithered steps (Bayer 4x4, no alpha ramps),
    with hue-shifted ramps: lit pixels warm toward amber, shadow toward blue-violet;
  * a 1 px rim on objects facing the lamp and a dark contact edge on the far side;
  * quantised to ~56 colours, scaled 4x nearest-neighbour. The window sky is transparent.
Only this repo's own SVG art is used.
"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image

W, H, S = 362, 272, 4
BAYER = (np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) + .5) / 16
# Per room: lamp (art px), light radius, wall board style, window glass boxes kept unlit (art px).
ROOMS = {
    'forest': {'lamp': (1165, 500), 'radius': 360, 'ambient': .8, 'boards': ('v', 9), 'warm': (255, 196, 128), 'cool': (40, 66, 92), 'glass': [('arch', 222, 262, 141, 141, 600)]},
    'seaside': {'lamp': (138, 96), 'pool': 1200, 'radius': 520, 'ambient': .9, 'boards': ('h', 7), 'warm': (255, 206, 150), 'cool': (92, 120, 150), 'glass': [('ellipse', 226, 315, 140, 140, 0), ('arch', 1343, 300, 160, 172, 782)]},
    'starlight': {'lamp': (1173, 500), 'radius': 330, 'ambient': .74, 'boards': ('v', 10), 'warm': (255, 192, 120), 'cool': (34, 40, 86), 'glass': [('ellipse', 229, 365, 144, 144, 0)]},
}
POSTS = [(425, 438), (595, 605), (766, 776), (937, 947), (1114, 1131)]  # cabinet uprights (art x)


def small(path):
    return np.asarray(Image.open(path).convert('RGB').resize((W, H), Image.BOX), dtype=np.float32)


def key(path):
    k = small(path)
    return ((k[..., 0] + k[..., 2]) / 2 - k[..., 1]) > 128


def hashed(*arrays, seed=0.0):
    v = seed
    for i, a in enumerate(arrays):
        v = v + np.asarray(a, dtype=np.float64) * (12.9898 + i * 78.233)
    return np.modf(np.abs(np.sin(v) * 43758.5453))[0]


def noise1(x, seed):
    """Smooth 1-D value noise (for grain that wanders instead of repeating)."""
    i = np.floor(x)
    f = x - i
    a, b = hashed(i, seed=seed), hashed(i + 1, seed=seed)
    return a + (b - a) * f * f * (3 - 2 * f)


def main(scene, folder, out):
    room = ROOMS[scene]
    folder = Path(folder)
    img = small(folder / 'base.png')
    masks = {p.stem[4:]: key(p) for p in folder.glob('key-*.png')}
    sky = masks.pop('sky')
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    ax, ay = xx * S + 2, yy * S + 2  # art coordinates of each pixel centre
    glass = np.zeros((H, W), bool)
    for kind, cx, cy, rx, ry, bottom in room['glass']:  # same shapes as the live window masks
        inside = ((ax - cx) / rx) ** 2 + ((ay - cy) / ry) ** 2 <= 1
        glass |= inside | ((kind == 'arch') & (ay >= cy) & (ay < bottom) & (np.abs(ax - cx) <= rx))
    wall, floor, rug, wood = (masks.get(n, np.zeros((H, W), bool)) for n in ('wall', 'floor', 'rug', 'wood'))
    ceiling = masks.get('ceiling', np.zeros((H, W), bool))
    shade = np.ones((H, W), np.float32)  # multiplicative material tone

    # Wall boards: per-board tone, 1 px seams, a lip highlight under shiplap, wandering grain.
    axis, size = room['boards']
    along, across = (yy, xx) if axis == 'v' else (xx, yy)
    board = np.floor(across / size)
    pos = across - board * size
    tone = 1 + (hashed(board, seed=3) - .5) * .07
    seam = pos == 0
    lip = (pos == 1) & (axis == 'h')
    length = 112 if axis == 'h' else 1e9  # shiplap boards end in staggered butt joints
    piece = np.floor((along + hashed(board, seed=7) * length) / length)
    joint = (np.mod(along + hashed(board, seed=7) * length, length) < 1) & (axis == 'h')
    tone = 1 + (hashed(board, piece, seed=3) - .5) * .06
    grain = (noise1(along * .3 + board * 17.3, 5) > .86) & (pos > 1)
    knot = (hashed(board, np.floor(along / 5), seed=9) > .993) & (pos > 2) & (pos < size - 2)
    wall_t = tone * np.where(seam | joint, .88 if axis == 'h' else .85, 1) * np.where(lip, 1.06, 1) * np.where(grain, .96, 1) * np.where(knot, .9, 1)
    shade = np.where(wall, wall_t, shade)
    shade = np.where(ceiling, 1 + (hashed(np.floor((xx + yy * .5) / 8), seed=21) - .5) * .06, shade) * np.where(ceiling & (np.mod(np.floor(xx + yy * .48), 8) == 0), .9, 1)

    # Floor planks: follow the drawing's perspective (lines from x0 at y=787 to 720+(x0-720)*1.8 at 1086).
    t = np.clip((ay - 787) / 299, 0, 1)
    x0 = 720 + (ax - 720) / (1 + .8 * t)
    plank = np.floor(x0 / 60)
    rows = np.searchsorted(np.array([787, 839, 918, 1028]), ay)
    ftone = 1 + (hashed(plank, rows, seed=11) - .5) * .1
    fpos = x0 / 60 - plank
    fseam = (fpos < .9 / (6 + 10 * t)) | np.isin(np.round(ay / S), np.round(np.array([839, 918, 1028]) / S))
    fend = (np.abs(ay - (787 + (rows + hashed(plank, seed=13)) * 70)) < 2) & (hashed(plank, rows, seed=17) > .55)
    fgrain = noise1(ay * .25 + plank * 31.7, 19) > .82
    shade = np.where(floor, ftone * np.where(fseam | fend, .86, 1) * np.where(fgrain, .95, 1), shade)

    # Rug: a tight weave and a woven border two pixels in.
    inner = rug.copy()
    for _ in range(2):
        inner = inner & np.roll(inner, 1, 0) & np.roll(inner, -1, 0) & np.roll(inner, 1, 1) & np.roll(inner, -1, 1)
    border = rug & ~inner
    deep = inner & ~(inner & np.roll(inner, 1, 0) & np.roll(inner, -1, 0) & np.roll(inner, 1, 1) & np.roll(inner, -1, 1))
    weave = np.where(np.mod(xx + yy, 2) == 0, 1.035, .975) * np.where(np.mod(np.floor(yy / 3), 2) == 0, 1, .985)
    shade = np.where(rug, weave * np.where(border, .86, 1) * np.where(deep, 1.08, 1), shade)

    # Cabinet wood: grain along each member (vertical on uprights, horizontal elsewhere).
    post = np.zeros((H, W), bool)
    for x0p, x1p in POSTS:
        post |= (ax >= x0p) & (ax < x1p) & (ay > 199) & (ay < 709)
    g_along = np.where(post, ay, ax) / S
    g_across = np.where(post, ax, ay) / S
    wave = noise1(g_along * .18 + g_across * 3.1, 23)
    wgrain = np.where(wave > .78, .9, np.where(wave < .12, 1.06, 1))
    shade = np.where(wood, wgrain * (1 + (hashed(np.floor(g_across / 3), seed=29) - .5) * .05), shade)

    # Sparse speckle grain on every painted surface (never on the glass).
    speck = hashed(xx, yy, seed=31)
    shade *= np.where(~glass & ~sky & (speck > .988), 1.04, np.where(~glass & ~sky & (speck < .008), .96, 1))
    img = img * shade[..., None]

    # One warm light: five dithered steps, warm ramp toward the lamp and cool ramp away from it.
    lx, ly = room['lamp']
    d = np.hypot(ax - lx, (ay - ly) * 1.15)
    energy = 1 / (1 + (d / room['radius']) ** 2)
    # The same lamp pools on the floor below it: a flattened ellipse in floor perspective.
    fy = room.get('pool', 880)
    pool = 1 / (1 + ((ax - lx) / (room['radius'] * 1.3)) ** 2 + ((ay - fy) / (room['radius'] * .32)) ** 2)
    energy = np.where(floor | rug, np.maximum(energy, pool * .95), energy)
    # Flat bands with a narrow ordered-dither seam between them (pixel-art ramps, not noise).
    level = np.floor(energy * 5)
    frac = energy * 5 - level
    band = .3
    up = BAYER[(yy % 4).astype(int), (xx % 4).astype(int)] < np.clip((frac - (1 - band)) / band, 0, 1)
    steps = np.clip(level + up, 0, 5) / 5
    lit = np.where(glass | sky, .5, steps)
    warm, cool = np.array(room['warm'], np.float32), np.array(room['cool'], np.float32)
    a = room['ambient']
    gain = a + (1.16 - a) * lit
    img = img * gain[..., None]
    img = img + (warm - img) * (np.clip(lit - .5, 0, 1) * .22)[..., None]
    img = img + (cool - img) * (np.clip(.45 - lit, 0, 1) * .26)[..., None]

    # Rim: objects (not wall/floor/rug/sky/glass) get a lit 1 px edge toward the lamp, dark away.
    objects = ~(wall | floor | rug | ceiling | sky | glass)
    to_lamp = np.stack([np.sign(lx - ax), np.sign(ly - ay)])
    rim = np.zeros((H, W), np.float32)
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        nb = np.roll(np.roll(objects | wood, -dy, 0), -dx, 1)
        edge = (objects | wood) & ~nb
        facing = (dx * to_lamp[0] + dy * to_lamp[1]) > 0
        rim += np.where(edge & facing & (dy <= 0), 1, 0) - np.where(edge & ~facing & (dy >= 0), 1, 0)
    rim = np.clip(rim, -1, 1)
    img = np.where((rim > 0)[..., None], img * 1.1 + (warm - img) * .1, img)
    img = np.where((rim < 0)[..., None], img * .82 + cool * .04, img)

    img = np.clip(img, 0, 255).astype(np.uint8)
    # Quantise the room (not the transparent sky) to one shared palette, no error diffusion.
    solid = Image.fromarray(np.where(sky[..., None], np.array([0, 0, 0], np.uint8), img))
    q = np.asarray(solid.quantize(colors=56, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB'))
    alpha = np.where(sky, 0, 255).astype(np.uint8)
    rgba = Image.fromarray(np.dstack([q, alpha]), 'RGBA')
    rgba.resize((W * S, H * S), Image.NEAREST).crop((0, 0, 1448, 1086)).save(out, optimize=True)
    print(f'{scene}: {len(np.unique(q.reshape(-1, 3), axis=0))} colours, sky {sky.mean():.1%} -> {out}')


if __name__ == '__main__':
    main(*sys.argv[1:4])
