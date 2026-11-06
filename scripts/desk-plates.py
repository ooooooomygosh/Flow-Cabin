#!/usr/bin/env python3
"""desk-plates.py -- the desk's pictures, taken from DEsk's own.

Flow Cabin's desk is DEsk's desk (https://github.com/fyzugx/DEsk, MIT,
(c) 2026 The DEsk authors): the walnut desk, the drawer, the clock, the post
box, the Control Panel and the bookcase, as DEsk renders them for its
in-browser try-it (desk-pages/tryit). This copies those pictures into
public/desk/ and makes the few changes Flow Cabin needs:

  - the words engraved on the brass plates (the post box's too) and printed on the clock's keys
    are taken off (the brushed brass is carried across where they were), so
    the app can engrave its own;
  - the clock's volume read-out is cleared, the app lights its own;
  - DEsk's letter is copied blank (letter-blank.webp), for the post box's
    letters;
  - the open post box is copied without DEsk's 没有信件 (view-post-box.webp),
    so the app's letters can stand in it;
  - the drawer's felt is emptied and the five things in it are cut out, so
    the drawer holds what Flow Cabin puts in it;
  - on the bookcase the binders' label cards are wiped (the card, its typed
    frame and its corners stay) and the index book's red lettering-piece and
    its count are cleared, so the app types its own record boxes and counts.

The numbers (where each thing sits on the 1440x900 desk) go to
src/desk/plates.json. Run it from the repository:

    python3 scripts/desk-plates.py [path/to/desk-pages]
"""

import json
import os
import shutil
import sys

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, '..', '..', 'fyzugx', 'desk-pages'))
TRY = os.path.join(SRC, 'tryit')
OUT = os.path.join(ROOT, 'public', 'desk')
ICONS = os.path.join(os.path.dirname(SRC), 'desk', 'themes', 'icons', 'DEsk', 'scalable')


def load(rel):
    return Image.open(os.path.join(TRY, rel)).convert('RGBA')


def save(im, name, quality=90):
    im.save(os.path.join(OUT, name), 'WEBP', quality=quality, method=6)


def carry(im, col, x0, x1, y0, y1):
    """Carry one clean column of brushed metal (or glass) across x0..x1."""
    a = np.array(im)
    a[y0:y1, x0:x1] = a[y0:y1, col:col + 1]
    return Image.fromarray(a)


def lift(im, box, k, dark=True):
    """Lift the type off a card: the paper under it, found by closing (dark ink on light paper) or
    opening (gold on cloth) with a k-pixel square, laid over the box with a 2px feathered edge."""
    x0, y0, x1, y1 = box
    pad = k + 2
    reg = im.crop((x0 - pad, y0 - pad, x1 + pad, y1 + pad))
    if dark:
        est = reg.filter(ImageFilter.MaxFilter(k)).filter(ImageFilter.MinFilter(k))
    else:
        est = reg.filter(ImageFilter.MinFilter(k)).filter(ImageFilter.MaxFilter(k))
    est = np.array(est.filter(ImageFilter.GaussianBlur(1.6))).astype(np.float32)[pad:-pad, pad:-pad]
    a = np.array(im).astype(np.float32)
    h, w = y1 - y0, x1 - x0
    m = np.ones((h, w), np.float32)
    for i in range(w):
        m[:, i] *= min(1, (i + .5) / 2, (w - i - .5) / 2)
    for j in range(h):
        m[j, :] *= min(1, (j + .5) / 2, (h - j - .5) / 2)
    a[y0:y1, x0:x1] = a[y0:y1, x0:x1] * (1 - m[..., None]) + est * m[..., None]
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


# The bookcase (view-shelf, 1440x900): the eight binders on the top board, as the quadrilaterals they
# stand in (top-left, top-right, bottom-right, bottom-left; they lean), their label cards (the paper's
# bounding box), and the index book at the end of the row with its lettering-piece and its count.
SHELF = {
    'binders': [
        [[265, 138], [371, 140], [385, 390], [287, 390]],
        [[369, 126], [475, 126], [487, 390], [390, 390]],
        [[477, 126], [585, 126], [592, 390], [495, 390]],
        [[590, 126], [697, 126], [697, 390], [600, 390]],
        [[742, 134], [845, 134], [840, 390], [746, 390]],
        [[850, 126], [960, 126], [960, 390], [847, 390]],
        [[965, 126], [1077, 127], [1070, 390], [952, 390]],
        [[1080, 126], [1190, 126], [1160, 390], [1057, 390]],
    ],
    'cards': [[278, 195, 73, 79], [387, 201, 73, 76], [499, 193, 71, 76], [611, 198, 69, 77],
              [760, 194, 68, 77], [870, 200, 70, 76], [981, 193, 72, 76], [1090, 198, 74, 77]],
    'book': [[1190, 125], [1260, 145], [1217, 390], [1160, 390]],
    'bookLabel': [1199, 199, 44, 23],
    'bookCount': [1186, 313, 37, 27],
}


def blank_shelf(im):
    im = im.convert('RGB')
    for (x, y, w, h) in SHELF['cards']:
        im = lift(im, (x + int(w * .15), y + int(h * .14), x + w - int(w * .15), y + h - int(h * .14)), 13)
    x, y, w, h = SHELF['bookLabel']
    im = lift(im, (x, y, x + w, y + h), 9, dark=False)
    # the count sits between gold rules on the cloth: each column is filled with its own navy (the
    # darker half of the cloth above and below it, where only rules and words are lighter)
    a = np.array(im).astype(np.float32)
    x, y, w, h = SHELF['bookCount']
    for col in range(x - 2, x + w + 1):
        cloth = a[250:345, col]
        lum = cloth.sum(axis=1)
        a[y:y + h, col] = cloth[lum <= np.percentile(lum, 45)].mean(axis=0)
    return Image.fromarray(a.astype(np.uint8))


def box(v, r):
    """A running mean of width 2r+1 along the last axis (edges held)."""
    p = np.pad(v, [(0, 0)] * (v.ndim - 1) + [(r, r)], mode='edge')
    c = np.cumsum(p, axis=-1)
    c = np.concatenate([np.zeros(c.shape[:-1] + (1,)), c], axis=-1)
    return (c[..., 2 * r + 1:] - c[..., :-2 * r - 1]) / (2 * r + 1)


def blank_letter(im):
    """DEsk's letter with its writing taken off: the paper, its ruling, the line under the heading and
    the turned-down corner stay; the app writes its own letters on it."""
    a = np.array(im.convert('RGBA')).astype(np.float32)
    rgb = a[:, :, :3]
    g = rgb.mean(2)
    x0, x1, y0, y1 = 22, 496, 24, 242
    reg = g[y0:y1, x0:x1]
    H, W = reg.shape
    # a row's paper: the upper part of its values (text is darker than the paper it is on)
    bgrow = np.array([[np.percentile(reg[j, max(0, i - 80):i + 81], 85) for i in range(W)] for j in range(H)])
    mask = (bgrow - reg) > 9
    m = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))
    mask = np.array(m) > 0
    xs = np.arange(W)
    smooth = np.zeros((H, W, 3), np.float32)
    for j in range(H):
        ok = ~mask[j]
        for c in range(3):
            v = np.interp(xs, xs[ok], rgb[y0 + j, x0:x1, c][ok]) if ok.any() else rgb[y0 + j, x0:x1, c]
            smooth[j, :, c] = box(v, 15)
    # the grain from the clean paper under the writing, mirrored up and down so no seam repeats
    clean = rgb[246:350, x0:x1]
    rows = [k % (2 * len(clean)) for k in range(H)]
    donor = np.stack([clean[k] if k < len(clean) else clean[2 * len(clean) - 1 - k] for k in rows])
    grain = donor - box(donor.transpose(0, 2, 1), 15).transpose(0, 2, 1)
    fill = smooth + grain
    blend = np.array(m.filter(ImageFilter.GaussianBlur(1))).astype(np.float32)[:, :, None] / 255
    rgb[y0:y1, x0:x1] = rgb[y0:y1, x0:x1] * (1 - blend) + fill * blend
    a[:, :, :3] = rgb
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


# ----- the Control Panel, made into the record player's console -----
#
# The view of the Control Panel is DEsk's picture with what DEsk prints and moves on it taken off,
# so the app can print its own words and move its own needles, knob and handles over it (src/desk/
# views/ConsoleView.jsx): the tube's phosphor, the meters' cards (legend, scale, needle, lamps), the
# legends under the levers, the faders and the key, the captions on the four push buttons, the
# volume knob's pointer and index, the faders' handles, and the words on the front plate. Where a
# thing comes off, what was behind it is put back from what is around it: the brass or the panel
# carried across, the paper diffused in with the paper's own grain, a round thing filled round its
# centre. The geometry the app draws with goes to plates.json (consoleView).

def fl(im):
    return np.array(im.convert('RGB')).astype(np.float32)


def u8(a):
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def blur(a, r):
    return fl(u8(a).filter(ImageFilter.GaussianBlur(r)))


def lum(a):
    return a[..., 0] * .299 + a[..., 1] * .587 + a[..., 2] * .114


def grow(mask, px):
    if px <= 0:
        return mask
    return np.array(Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(2 * px + 1))) > 0


def ink(a, box, dark, t=16, size=9, px=2):
    """Strokes thinner than `size` that stand out from what is around them (light on the panel, dark on brass or paper)."""
    x0, y0, x1, y1 = box
    l = Image.fromarray(np.clip(lum(a[y0:y1, x0:x1]), 0, 255).astype(np.uint8))
    if dark:   # a closing: the dark strokes filled in with the ground
        bg = l.filter(ImageFilter.MaxFilter(size)).filter(ImageFilter.MinFilter(size))
        d = np.array(bg).astype(np.float32) - np.array(l)
    else:      # an opening: the light strokes taken down to the ground
        bg = l.filter(ImageFilter.MinFilter(size)).filter(ImageFilter.MaxFilter(size))
        d = np.array(l).astype(np.float32) - np.array(bg)
    m = np.zeros(a.shape[:2], bool)
    m[y0:y1, x0:x1] = d > t
    return grow(m, px)


def fill(a, mask, grain=None, iters=220):
    """Diffuse what is around a hole into it, then lay the grain of a clean patch `grain` (dx, dy) away over it."""
    ys, xs = np.nonzero(mask)
    if not len(ys):
        return a
    pad = 14
    y0, y1 = max(0, ys.min() - pad), min(a.shape[0], ys.max() + pad + 1)
    x0, x1 = max(0, xs.min() - pad), min(a.shape[1], xs.max() + pad + 1)
    c, m = a[y0:y1, x0:x1].copy(), mask[y0:y1, x0:x1]
    known = (~m).astype(np.float32)[..., None]
    num, den = blur(c * known, 8), blur(np.repeat(known * 255, 3, axis=2), 8) / 255 + 1e-3
    c[m] = (num / den)[m]
    for _ in range(iters):
        p = np.pad(c, ((1, 1), (1, 1), (0, 0)), mode='edge')
        c[m] = ((p[:-2, 1:-1] + p[2:, 1:-1] + p[1:-1, :-2] + p[1:-1, 2:]) / 4)[m]
    if grain:
        dx, dy = grain
        src = a[y0 + dy:y1 + dy, x0 + dx:x1 + dx]
        c[m] += (src - blur(src, 2))[m]
    out = a.copy()
    soft = blur(np.repeat(m[..., None].astype(np.float32) * 255, 3, axis=2), .8) / 255
    out[y0:y1, x0:x1] = c * np.maximum(soft, m[..., None]) + a[y0:y1, x0:x1] * (1 - np.maximum(soft, m[..., None]))
    return out


def polar_fill(a, mask, cx, cy):
    """Fill a hole in something round from the same radius either side of it."""
    out = a.copy()
    h, w = mask.shape
    for y, x in zip(*np.nonzero(mask)):
        r = max(np.hypot(x - cx, y - cy), 1.0)
        th, step = np.arctan2(y - cy, x - cx), 0.7 / r
        found = []
        for sgn in (-1, 1):
            for k in range(1, 400):
                t = th + sgn * k * step
                sx, sy = int(round(cx + np.cos(t) * r)), int(round(cy + np.sin(t) * r))
                if 0 <= sx < w and 0 <= sy < h and not mask[sy, sx]:
                    found.append((k, a[sy, sx]))
                    break
        if len(found) == 2:
            (k0, v0), (k1, v1) = found
            out[y, x] = (v0 * k1 + v1 * k0) / (k0 + k1)
        elif found:
            out[y, x] = found[0][1]
    return out


def bridge(a, x0, x1, y0, y1):
    """Brass brushed across: each row runs straight from the clean column before x0 to the one at x1."""
    out = a.copy()
    left, right = a[y0:y1, x0 - 1], a[y0:y1, x1]
    for x in range(x0, x1):
        u = (x - x0 + 1) / (x1 - x0 + 1)
        out[y0:y1, x] = left * (1 - u) + right * u
    return out


def disc(shape, cx, cy, rx, ry=None):
    ry = ry or rx
    yy, xx = np.mgrid[0:shape[0], 0:shape[1]]
    return ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2 <= 1


def sprite(a, box, feather=(4, 4, 3, 3)):
    """A piece of the picture with soft edges (left, right, top, bottom), to be laid back over it."""
    x0, y0, x1, y1 = box
    part = a[y0:y1, x0:x1]
    h, w = part.shape[:2]
    al = np.ones((h, w), np.float32)
    fl_, fr, ft, fb = feather
    for i in range(w):
        al[:, i] *= min(1, (i + .5) / fl_ if fl_ else 1, (w - i - .5) / fr if fr else 1)
    for j in range(h):
        al[j, :] *= min(1, (j + .5) / ft if ft else 1, (h - j - .5) / fb if fb else 1)
    im = u8(part).convert('RGBA')
    im.putalpha(Image.fromarray((al * 255).astype(np.uint8)))
    return im


CV = {
    # the tube: the phosphor's ellipse inside the brass ring
    'crt': {'cx': 406, 'cy': 258, 'rx': 126, 'ry': 120},
    # the meters' cards: the visible window, and where DEsk's face (w x h) lies under it
    'meterL': {'win': [650, 176, 175, 109], 'face': [650, 159, 175, 125], 'pivot': [737.5, 291.5], 'len': 84, 'kind': 'battery'},
    'meterR': {'win': [957, 180, 184, 144], 'face': [955, 187, 183, 135], 'pivot': [1045, 322], 'len': 81, 'kind': 'net',
               'lamps': [[992, 257], [1102, 257]], 'lampR': 11.5},
    # the volume knob: centre, the bakelite's radius (DEsk's sx = 2 * it)
    'knob': {'cx': 748.5, 'cy': 514.5, 'rad': 57, 'skirt': 98},
    # the levers: the plate, the boss, the lamp; the lever sprites are cut at `tile` (x, y of their box)
    'levers': [
        {'plate': [295, 460, 120, 110], 'boss': [351, 515], 'lamp': [353, 459], 'lampR': 17, 'tile': [262, 486], 'on': [317, 538], 'off': [402, 538], 'legend': [356, 584], 'tint': [1.0, .62, .18]},
        {'plate': [471, 462, 114, 106], 'boss': [528, 517], 'lamp': [528, 461], 'lampR': 17, 'tile': [438, 488], 'on': [497, 538], 'off': [573, 538], 'legend': [528, 582], 'tint': [.30, .48, 1.0]},
    ],
    'leverTile': [152, 46],
    # the faders: the plate, the run of the handle's middle (value 0 .. 1), the legend under it
    'faders': [
        {'plate': [930, 421, 211, 67], 'run': [949, 1129], 'y': 426, 'legend': [1031, 501]},
        {'plate': [930, 527, 211, 68], 'run': [949, 1131], 'y': 534, 'legend': [1031, 606]},
    ],
    'handle': [28, 58],
    # the push buttons (blue alone, three under the glass), and their captions round the bottom of the ring
    'buttons': [[343, 686, 44], [545, 686, 44], [720, 686, 44], [894, 686, 44]],
    'leds': [[313, 750, 'amber'], [476, 750, 'green'], [638, 750, 'amber'], [800, 750, 'green'], [962, 750, 'amber'], [1126, 750, 'green']],
    'key': {'lock': [1040, 686, 24], 'key': [1066, 668, 88, 36], 'legend': [1036, 649]},
    'volume': [748, 624],
    'plate': [200, 795, 346, 62],
}


def console_view(view):
    a = fl(view)
    H, W = a.shape[:2]

    # the tube: everything the phosphor drew is taken off; what is left is the dark glass DEsk paints
    # before the gun comes up (0.010, 0.020, 0.014), with the room in the curve of the glass
    c = CV['crt']
    inside = disc(a.shape, c['cx'], c['cy'], c['rx'] + 4, c['ry'] + 4) & ~((a[..., 0] - a[..., 2] > 34) & (lum(a) > 40))
    inside &= disc(a.shape, c['cx'], c['cy'], c['rx'] + 8, c['ry'] + 8)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    nx, ny = (xx - c['cx']) / c['rx'], (yy - c['cy']) / c['ry']
    rr = np.sqrt(nx * nx + ny * ny)
    glass = np.stack([np.full((H, W), v, np.float32) for v in (0.010 * 255, 0.020 * 255, 0.014 * 255)], axis=2)
    gx0, gy0 = c['cx'] - c['rx'], c['cy'] - c['ry']
    tdiag = ((xx - gx0) * (2 * c['rx'] * .62) + (yy - gy0) * (2 * c['ry'] * .86)) / ((2 * c['rx'] * .62) ** 2 + (2 * c['ry'] * .86) ** 2)
    sheen = np.clip(1 - tdiag / .62, 0, 1) * .055 + np.clip(1 - tdiag / .30, 0, 1) * .03
    glass = glass + sheen[..., None] * 255
    vig = np.clip((rr - .45) / .6, 0, 1) ** 1.4 * .7
    glass = glass * (1 - vig[..., None])
    soft = blur(np.repeat(inside[..., None].astype(np.float32) * 255, 3, axis=2), 1.2) / 255
    a = glass * soft + a * (1 - soft)

    # the meters: the card cleaned to bare paper (the app prints the scale, the legend, the needle and the lamps)
    for key in ('meterL', 'meterR'):
        m = CV[key]
        x, y, w, h = m['win']
        box = (x + 2, y + 2, x + w - 2, y + h - 1)
        crop = a[box[1]:box[3], box[0]:box[2]]
        l = u8(crop)
        closed = fl(l.filter(ImageFilter.MaxFilter(13)).filter(ImageFilter.MinFilter(13)))
        diff = np.abs(crop - closed).sum(axis=2)
        mask = np.zeros((H, W), bool)
        mask[box[1]:box[3], box[0]:box[2]] = (diff > 22) | ((crop[..., 1] - crop[..., 0]) > 3)
        for lx, ly in m.get('lamps', []):
            mask |= disc(a.shape, lx, ly, m['lampR'] + 9)
        if key == 'meterR':
            mask |= disc(a.shape, m['pivot'][0], m['pivot'][1], 11)
        mask = grow(mask, 2)
        inner = np.zeros((H, W), bool)
        inner[box[1]:box[3], box[0]:box[2]] = True
        mask &= inner
        a = fill(a, mask, iters=400)
        # the paper's own grain, taken from a clean corner of it and laid over what was filled
        gx, gy = (x + 6, y + h - 26) if key == 'meterL' else (x + 6, y + 8)
        patch = a[gy:gy + 20, gx:gx + 40]
        g = patch - blur(patch, 1.5)
        ys, xs = np.nonzero(mask)
        a[ys, xs] += g[(ys - ys.min()) % 20, (xs - xs.min()) % 40] * .9

    # words printed on the panel (light on dark): the legends under the levers, faders and the key
    def wipe(box, grain):
        nonlocal a
        a = fill(a, ink(a, box, dark=False, t=14, size=9, px=2), grain=grain)
    for box, grain in [((300, 527, 334, 551), (0, -36)), ((385, 527, 420, 551), (0, -36)),   # 开 关
                       ((334, 570, 390, 598), (60, 0)),                                        # 无线
                       ((478, 525, 512, 550), (0, -34)), ((556, 525, 592, 550), (0, -34)),   # 开 关
                       ((468, 568, 594, 596), (0, 26)),                                        # BLUETOOTH
                       ((1004, 488, 1060, 514), (-90, 0)), ((1004, 594, 1060, 618), (-90, 2)),  # 台灯 屏幕
                       ((1016, 636, 1058, 662), (0, -18))]:                                   # 电源
        wipe(box, grain)

    # the second fader's plate gets the first one's scale where it said 无背光 (both have something to turn)
    # (relit by the light that falls on the second plate: the cheek's shadow lies across its right end)
    b1, b2 = a[421:439, 930:1141], a[527:545, 930:1141]
    light = (blur(b2, 10) + 1) / (blur(b1, 10) + 1)
    a[527:545, 930:1141] = b1 * light

    # the captions round the push buttons (dark on the brass rings)
    for bx, by, br in CV['buttons']:
        m = ink(a, (bx - 26, by + 12, bx + 26, by + 40), dark=True, t=14, size=9, px=1)
        m &= ~disc(a.shape, bx, by, br - 18)
        a = polar_fill(a, m, bx, by)

    # the front plate, blank (the app engraves 唱机 ↑)
    a = bridge(a, 252, 500, 806, 846)

    film = a.copy()

    # what moves: the knob's pointer and index (drawn turned by the app), the faders' handles
    k = CV['knob']
    near = disc(a.shape, k['cx'], k['cy'], k['rad'] - 2)
    cream = near & (lum(a) > 70)
    red = disc(a.shape, k['cx'], k['cy'], k['rad'] + 22) & (a[..., 0] > 110) & (a[..., 1] < 90) & (a[..., 0] - a[..., 1] > 60)
    a = polar_fill(a, grow(cream, 2), k['cx'], k['cy'])
    a = polar_fill(a, grow(red, 3), k['cx'], k['cy'])

    handle = None
    for i, f in enumerate(CV['faders']):
        px, py, pw, ph = f['plate']
        if i == 0:
            hx = int(round(f['run'][1] - CV['handle'][0] / 2))
            handle = sprite(a, (hx, f['y'], hx + CV['handle'][0], f['y'] + CV['handle'][1]), (1, 1, 1, 1))
        # the slot and the plate carried right from where the handle's shadow starts
        x0 = 1084
        a[py + 16:py + ph - 2, x0:px + pw - 7] = a[py + 16:py + ph - 2, x0 - 1:x0][:, [0] * (px + pw - 7 - x0)]
        # the scale's last two ticks, from the two before them
        # (five ticks back, so the long one at the end comes from the long one in the middle)
        a[py:py + 16, 1080:px + pw - 7] = a[py:py + 16, 1080 - 90:px + pw - 7 - 90]
        # the plate's right end, from its left end turned round
        a[py + 2:py + ph - 2, px + pw - 7:px + pw] = a[py + 2:py + ph - 2, px:px + 7][:, ::-1]

    # the first lever's lamp, unlit: the second lever's (blue, unlit) laid over it and turned amber
    l0, l1 = CV['levers']
    dx, dy = l1['lamp'][0] - l0['lamp'][0], l1['lamp'][1] - l0['lamp'][1]
    cx0, cy0 = l0['lamp']
    r = 58
    region = disc(a.shape, cx0, cy0, r) & (yy < 490)
    moved = np.zeros_like(a)
    moved[cy0 - r:cy0 + r, cx0 - r:cx0 + r] = a[cy0 - r + dy:cy0 + r + dy, cx0 - r + dx:cx0 + r + dx]
    dist = np.sqrt((xx - cx0) ** 2 + (yy - cy0) ** 2)
    wgt = np.clip((r - dist) / 14, 0, 1)[..., None] * region[..., None]
    lens = dist <= l0['lampR'] + .5
    L = lum(moved)
    amber = np.stack([L * 1.25, L * .78, L * .28], axis=2)
    moved = np.where(lens[..., None], amber, moved)
    a = moved * wgt + a * (1 - wgt)

    # the levers, as sprites cut from the two (the first is thrown on, the second off): both get either
    tw, th = CV['leverTile']
    on = sprite(film, (l0['tile'][0], l0['tile'][1], l0['tile'][0] + tw, l0['tile'][1] + th), (10, 10, 4, 4))
    off = sprite(film, (l1['tile'][0], l1['tile'][1], l1['tile'][0] + tw, l1['tile'][1] + th), (10, 10, 4, 4))
    return u8(film), u8(a), on, off, handle


def main():
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(os.path.join(OUT, 'drawer'), exist_ok=True)
    common = json.load(open(os.path.join(TRY, 'common', 'common.json')))
    zh = json.load(open(os.path.join(TRY, 'zh', 'desk.json')))

    # the room, the views and the films: as they are
    for rel, name in [('common/room.webp', 'room.webp'), ('common/clock-digits.webp', 'clock-digits.webp'),

                      ('zh/view-post.webp', 'view-post.webp'), ('zh/view-post-empty.webp', 'view-post-empty.webp'),
                      ('zh/sheets/editor-curl.webp', 'curl.webp'), ('zh/letter.webp', 'letter.webp')]:
        shutil.copyfile(os.path.join(TRY, rel), os.path.join(OUT, name))
    save(blank_shelf(load('zh/view-shelf.webp')), 'view-shelf.webp', 92)
    # the open post box with nothing in it and nothing written there (DEsk prints 没有信件 on its back
    # wall): the felt above carried down over the words, so the app can stand its letters in it
    view = np.array(load('zh/view-post-empty.webp')).astype(np.float32)
    x0, x1, y0, y1 = 650, 790, 436, 482
    patch = view[y0 - 60:y1 - 60, x0:x1].copy()
    a = np.ones((y1 - y0, x1 - x0, 1), np.float32)
    for i in range(x1 - x0):
        a[:, i] *= min(1, (i + .5) / 10, (x1 - x0 - i - .5) / 10)
    for j in range(y1 - y0):
        a[j, :] *= min(1, (j + .5) / 10, (y1 - y0 - j - .5) / 10)
    view[y0:y1, x0:x1] = view[y0:y1, x0:x1] * (1 - a) + patch * a
    save(Image.fromarray(np.clip(view, 0, 255).astype(np.uint8)), 'view-post-box.webp', 90)
    for which in ('shelf', 'console', 'post'):
        shutil.copyfile(os.path.join(TRY, 'common', f'film-{which}.webp'), os.path.join(OUT, f'film-{which}.webp'))

    # a blank sheet of DEsk's letter paper, for the app's own letters
    save(blank_letter(load('zh/letter.webp')), 'letter-blank.webp', 92)
    # the Control Panel, as the record player's console
    film, base, lever_on, lever_off, handle = console_view(load('zh/view-console.webp'))
    save(film, 'view-console.webp', 90)
    save(base, 'console-base.webp', 90)
    for im, name in ((lever_on, 'console-lever-on.webp'), (lever_off, 'console-lever-off.webp'), (handle, 'console-handle.webp')):
        im.save(os.path.join(OUT, name), 'WEBP', quality=94, method=6)

    # the clock: its face with the volume read-out cleared, its keys with the last one blank
    # (the keys are on the face too, unlit: the last one's word and the first one's lamp are taken
    # off both, so the app prints 专注 and lights the key that is chosen)
    face = carry(load('zh/clock-face.webp'), 186, 188, 334, 6, 60)
    face = carry(face, 341 + 104, 341 + 74, 341 + 103, 38, 60)
    face = carry(face, 341 + 21, 341 + 8, 341 + 20, 11, 25)
    save(face, 'clock-face.webp', 95)
    keys = carry(load('zh/clock-keys.webp'), 104, 74, 103, 38, 60)
    keys = carry(keys, 21, 8, 20, 11, 25)
    save(keys, 'clock-keys.webp', 95)

    # the plates, blank
    console = carry(load('zh/ov-console.webp'), 30, 32, 135, 31, 55)
    save(console, 'plate-console.webp', 95)
    allapps = carry(load('zh/ov-allapps.webp'), 13, 15, 101, 3, 29)
    save(allapps, 'plate-shelf.webp', 95)
    # the post box's plate, blank too: the app engraves 信箱 and how many letters wait
    save(carry(load('zh/ov-post0.webp'), 60, 64, 120, 0, 15), 'post0.webp', 95)
    shutil.copyfile(os.path.join(TRY, 'zh', 'ov-post1.webp'), os.path.join(OUT, 'post1.webp'))

    # the drawer: the felt emptied, and what lay on it cut out
    band = np.array(load('common/drawer-band.webp')).astype(np.float32)
    felt = band.copy()
    x0, x1, y0, y1 = 384, 1032, 8, 132
    # the felt's light (a smooth sweep from one clean side to the other) and its nap (the fine
    # grain of a clean patch, mirrored back and forth so no seam repeats)
    left = band[:, 300:395, :3].mean(axis=1)
    right = band[:, 1036:1131, :3].mean(axis=1)
    patch = Image.fromarray(band[:, 205:395].astype(np.uint8))
    nap = band[:, 205:395, :3] - np.array(patch.filter(ImageFilter.GaussianBlur(5))).astype(np.float32)[:, :, :3]
    period = nap.shape[1]
    for x in range(x0, x1):
        u = (x - x0) / (x1 - x0)
        light = left * (1 - u) + right * u
        k = (x - x0) % (2 * period)
        col = k if k < period else 2 * period - 1 - k
        felt[y0:y1, x, :3] = light[y0:y1] + nap[y0:y1, col]
    for x in range(x0, x0 + 14):
        w = (x - x0) / 14
        felt[y0:y1, x, :3] = band[y0:y1, x, :3] * (1 - w) + felt[y0:y1, x, :3] * w
    for x in range(x1 - 10, x1 + 10):
        w = (x - (x1 - 10)) / 20
        felt[y0:y1, x, :3] = band[y0:y1, x, :3] * w + felt[y0:y1, x, :3] * (1 - w)
    save(Image.fromarray(np.clip(felt, 0, 255).astype(np.uint8)), 'drawer-band.webp')
    smooth = np.array(Image.fromarray(np.clip(felt, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(4))).astype(np.float32)
    diff = np.abs(band[:, :, :3] - smooth[:, :, :3]).sum(axis=2)
    alpha = np.clip((diff - 34) / 36, 0, 1) * 255
    mask = Image.fromarray(alpha.astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.7))
    cut = Image.fromarray(band.astype(np.uint8))
    cut.putalpha(mask)
    things = {'compass': (544, 632), 'folder': (668, 766), 'notepad': (802, 884), 'screwdriver': (918, 1026)}
    objects = {}
    for name, (a, b) in things.items():
        part = cut.crop((a, 10, b, 130))
        box = part.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()
        part = part.crop(box)
        part.save(os.path.join(OUT, 'drawer', f'{name}.webp'), 'WEBP', quality=92, method=6)
        objects[name] = [a + box[0], 10 + box[1], box[2] - box[0], box[3] - box[1]]

    # DEsk's own drawings of things (themes/make-icons.py): photographs, a record in its sleeve
    if os.path.isdir(ICONS):
        for rel, name in [('mimetypes/image-x-generic.svg', 'photos.svg'), ('mimetypes/audio-x-generic.svg', 'record.svg'),
                          ('mimetypes/x-office-document.svg', 'document.svg'), ('places/folder-music.svg', 'folder-music.svg'),
                          ('mimetypes/package-x-generic.svg', 'carton.svg')]:
            shutil.copyfile(os.path.join(ICONS, rel), os.path.join(OUT, 'drawer', name))

    # the desk without what stands at its back edge (the wood carried down from further in -- the
    # planks run front to back, so a row from below continues them), and those things as pieces,
    # so a narrow window can set them closer together and a wide one further apart
    room = np.array(load('common/room.webp')).astype(np.float32)
    wood = room.copy()
    # (carried from below the shadows those things cast, and faded in where the desk has none)
    # The lamp is low on the right, so the desk darkens toward the back: the carried grain is
    # relit by the light continued upward from where it stops.
    def light(rows):
        return np.array(Image.fromarray(np.clip(rows, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(40))).astype(np.float32)[:, :, :3] + 1
    lit = light(room[:, :, :3])
    grain = room[176:352, :, :3] / lit[176:352]
    top, low = lit[176], lit[352]
    for y in range(0, 176):
        k = (176 - y) / 176
        wood[y, :, :3] = grain[y] * top * (top / low) ** k
    for y in range(168, 184):
        w = (y - 168) / 16
        wood[y, :, :3] = wood[y, :, :3] * (1 - w) + room[y, :, :3] * w
    save(Image.fromarray(np.clip(wood, 0, 255).astype(np.uint8)), 'desk-wood.webp')
    edge = {'console': [16, 0, 488, 80], 'clock': [500, 0, 486, 90], 'post': [1052, 0, 252, 86]}
    for name, (x, y, w, h) in edge.items():
        part = Image.fromarray(room[y:y + h, x:x + w].astype(np.uint8))
        a = np.ones((h, w), np.float32)
        f = 7.0
        for i in range(w):
            a[:, i] *= min(1, (i + .5) / f, (w - i - .5) / f)
        for j in range(h):
            a[j, :] *= min(1, (h - j - .5) / f)
        part.putalpha(Image.fromarray((a * 255).astype(np.uint8)))
        save(part, f'edge-{name}.webp', 95)
    # the post box with a letter in its slot, under the blank plate (the words and the number are the app's)
    p0, p1 = carry(load('zh/ov-post0.webp'), 60, 64, 120, 0, 15), load('zh/ov-post1.webp')
    letter = p1.copy()
    letter.paste(p0.crop((0, 0, p0.width, 40)), (0, 0))
    save(letter, 'post-letter.webp', 95)

    sheet = zh['sheets']['editor']
    plates = {
        'source': 'https://github.com/fyzugx/DEsk (MIT, (c) 2026 The DEsk authors) -- desk-pages/tryit',
        'w': zh['w'], 'h': zh['h'], 'lamp': zh['lamp'], 'trayBottom': zh['tray_bottom'], 'pullH': zh['pull_h'],
        'drawerBand': zh['drawer_band'],
        'clock': {'faceAt': zh['clock']['face_at'], 'keysAt': zh['clock']['keys_at'], 'places': common['clock']['places'], 'cellH': common['clock']['cell_h']},
        'console': zh['overlays']['console']['at'], 'post0': zh['overlays']['post0']['at'], 'post1': zh['overlays']['post1']['at'],
        'shelfPlate': zh['overlays']['allapps']['at'], 'edge': edge,
        'drawer': {'bandY': zh['drawer']['band_y'], 'bandH': zh['drawer']['band_h'], 'objects': objects},
        'postLetter': zh['post_letter'], 'letter': zh['letter']['at'],
        'films': {k: {'frames': v['frames'], 'fw': v['fw'], 'fh': v['fh'], 'steps': v['steps']} for k, v in common['films'].items()},
        'shelf': SHELF,
        'consoleView': CV,
        'curl': {k: sheet['curl'][k] for k in ('rest', 'open', 'box', 'items', 'sizes', 'hot_sizes', 'rects')},
    }
    with open(os.path.join(ROOT, 'src', 'desk', 'plates.json'), 'w') as f:
        json.dump(plates, f, separators=(',', ':'))
    print('wrote', OUT, 'and src/desk/plates.json')


if __name__ == '__main__':
    main()
