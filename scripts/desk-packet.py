#!/usr/bin/env python3
"""desk-packet.py -- the blank paper packet a sheet folds into (public/desk/packet.webp).

The packet is DEsk's (https://github.com/fyzugx/DEsk, MIT, (c) 2026 The DEsk authors): the folded
Mousepad sheet its try-it lays on the desk (desk-pages/tryit/zh/sheets/editor-packet.webp). The app's
icon and name printed on it are taken off -- the plain paper beside them is carried across, mirrored
so its fibre does not repeat -- and the app prints its own title on it.

    python3 -I scripts/desk-packet.py [path/to/desk-pages]
"""
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, '..', '..', 'fyzugx', 'desk-pages'))


def main():
    im = Image.open(os.path.join(SRC, 'tryit', 'zh', 'sheets', 'editor-packet.webp')).convert('RGBA')
    a = np.array(im).astype(np.float32)
    # the printed part: the icon and the name under it
    x0, x1, y0, y1 = 44, 148, 14, 124
    src = a[y0:y1, 8:44].copy()  # plain paper left of it
    fill = np.zeros((y1 - y0, x1 - x0, 4), np.float32)
    k = 0
    while k < x1 - x0:
        part = src if (k // src.shape[1]) % 2 == 0 else src[:, ::-1]
        n = min(part.shape[1], x1 - x0 - k)
        fill[:, k:k + n] = part[:, :n]
        k += n
    # a soft seam: blend the carried paper into what was there over a few pixels at the edges
    mask = np.ones((y1 - y0, x1 - x0), np.float32)
    ramp = 6
    for i in range(ramp):
        f = (i + 1) / (ramp + 1)
        mask[:, i] *= f
        mask[:, -1 - i] *= f
        mask[i, :] *= f
        mask[-1 - i, :] *= f
    region = a[y0:y1, x0:x1]
    a[y0:y1, x0:x1] = region * (1 - mask[..., None]) + fill * mask[..., None]
    a[..., 3] = np.array(im)[..., 3]
    out = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGBA')
    out.save(os.path.join(ROOT, 'public', 'desk', 'packet.webp'), 'WEBP', quality=92, method=6)
    print('packet.webp', out.size)


if __name__ == '__main__':
    main()
