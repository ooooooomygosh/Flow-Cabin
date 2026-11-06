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
    the drawer holds what Flow Cabin puts in it.

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


def main():
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(os.path.join(OUT, 'drawer'), exist_ok=True)
    common = json.load(open(os.path.join(TRY, 'common', 'common.json')))
    zh = json.load(open(os.path.join(TRY, 'zh', 'desk.json')))

    # the room, the views and the films: as they are
    for rel, name in [('common/room.webp', 'room.webp'), ('common/clock-digits.webp', 'clock-digits.webp'),
                      ('zh/view-shelf.webp', 'view-shelf.webp'), ('zh/view-console.webp', 'view-console.webp'),
                      ('zh/view-post.webp', 'view-post.webp'), ('zh/view-post-empty.webp', 'view-post-empty.webp'),
                      ('zh/sheets/editor-curl.webp', 'curl.webp'), ('zh/letter.webp', 'letter.webp')]:
        shutil.copyfile(os.path.join(TRY, rel), os.path.join(OUT, name))
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
        'curl': {k: sheet['curl'][k] for k in ('rest', 'open', 'box', 'items', 'sizes', 'hot_sizes', 'rects')},
    }
    with open(os.path.join(ROOT, 'src', 'desk', 'plates.json'), 'w') as f:
        json.dump(plates, f, separators=(',', ':'))
    print('wrote', OUT, 'and src/desk/plates.json')


if __name__ == '__main__':
    main()
