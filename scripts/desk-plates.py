#!/usr/bin/env python3
"""desk-plates.py -- the desk's pictures, taken from DEsk's own.

Flow Cabin's desk is DEsk's desk (https://github.com/fyzugx/DEsk, MIT,
(c) 2026 The DEsk authors): the walnut desk, the drawer, the clock, the post
box, the Control Panel and the bookcase, as DEsk renders them for its
in-browser try-it (desk-pages/tryit). This copies those pictures into
public/desk/ and makes the few changes Flow Cabin needs:

  - the words engraved on the brass plates and printed on the clock's keys
    are taken off (the brushed brass is carried across where they were), so
    the app can engrave its own;
  - the clock's volume read-out is cleared, the app lights its own;
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


def main():
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(os.path.join(OUT, 'drawer'), exist_ok=True)
    common = json.load(open(os.path.join(TRY, 'common', 'common.json')))
    zh = json.load(open(os.path.join(TRY, 'zh', 'desk.json')))

    # the room, the views and the films: as they are
    for rel, name in [('common/room.webp', 'room.webp'), ('common/clock-digits.webp', 'clock-digits.webp'),
                      ('zh/view-console.webp', 'view-console.webp'),
                      ('zh/view-post.webp', 'view-post.webp'), ('zh/view-post-empty.webp', 'view-post-empty.webp'),
                      ('zh/sheets/editor-curl.webp', 'curl.webp'), ('zh/letter.webp', 'letter.webp')]:
        shutil.copyfile(os.path.join(TRY, rel), os.path.join(OUT, name))
    save(blank_shelf(load('zh/view-shelf.webp')), 'view-shelf.webp', 92)
    for which in ('shelf', 'console', 'post'):
        shutil.copyfile(os.path.join(TRY, 'common', f'film-{which}.webp'), os.path.join(OUT, f'film-{which}.webp'))

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
    shutil.copyfile(os.path.join(TRY, 'zh', 'ov-post0.webp'), os.path.join(OUT, 'post0.webp'))
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
    # the post box with a letter in its slot, under the plain plate (the number is the app's to show)
    p0, p1 = load('zh/ov-post0.webp'), load('zh/ov-post1.webp')
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
        'curl': {k: sheet['curl'][k] for k in ('rest', 'open', 'box', 'items', 'sizes', 'hot_sizes', 'rects')},
    }
    with open(os.path.join(ROOT, 'src', 'desk', 'plates.json'), 'w') as f:
        json.dump(plates, f, separators=(',', ':'))
    print('wrote', OUT, 'and src/desk/plates.json')


if __name__ == '__main__':
    main()
