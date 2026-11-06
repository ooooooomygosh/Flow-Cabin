#!/usr/bin/env python3
"""desk-drawer-art.py -- the things in the desk's drawer that DEsk does not have, drawn as DEsk draws its own.

The recipe and its helpers are ported from DEsk's themes/make-icons.py (https://github.com/fyzugx/DEsk,
MIT, (c) 2026 The DEsk authors): a thing's shape and light are gradients, and over them SVG filters --
the grain of leather, card and paper (feTurbulence), the light catching an edge (feSpecularLighting on
the blurred outline), what is pressed in (an inner shadow), and the shadow it lays on what it lies on.
What changed: the light is DEsk's desk lamp, low on the right of the desk (its tryit lamp at 1080,737
on the 1440x900 desk), not the icon theme's light from above -- edges catch it on their lower right and
shadows fall up and to the left, as they do for the notepad, the compass, the folder and the screwdriver
cut from DEsk's own drawer. Six things, 256 units square each, written to public/desk/drawer/:

    diary.svg      唱片日记  a leather notebook, a record blind-stamped on it, an elastic band, a ribbon
    companion.svg  伙伴      a stack of instant photographs; the top one is left for the companion
                             (the app lays the pet's own picture into it: PET_WINDOW below)
    cardbox.svg    词书      a card-index box with word cards standing in it
    postcard.svg   明信片    a postcard, stamped and postmarked
    nightlamp.svg  睡前模式  a small night lamp seen from above, its shade lit from inside
    recipe.svg     场景配方  a recipe card with a tab, a record and a few lines on it, a paper clip

    python3 -I scripts/desk-drawer-art.py
"""

import math
import os
import random

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'desk', 'drawer')

# Where the light comes from on the desk: DEsk's lamp is low on the right, a little in front.
LIGHT_AZIMUTH = 40      # feDistantLight azimuth: from the lower right
SHADOW = (-4.0, -3.2)   # the shadow a thing 4 units up lays, away from the lamp


def rgbf(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


class Icon:
    """One SVG, 256 units square: its gradients, clips and filters numbered within it (make-icons.py)."""

    def __init__(self):
        self.defs, self.body, self.n, self.made = [], [], 0, {}

    def _id(self, p):
        self.n += 1
        return f'{p}{self.n}'

    @staticmethod
    def _stops(stops):
        out = []
        for st in stops:
            op = st[2] if len(st) > 2 else 1
            out.append(f'<stop offset="{st[0]:g}" stop-color="{st[1]}"' + (f' stop-opacity="{op:g}"' if op != 1 else '') + '/>')
        return ''.join(out)

    def lin(self, stops, x1=0, y1=0, x2=0, y2=1, user=False):
        i = self._id('l')
        u = ' gradientUnits="userSpaceOnUse"' if user else ''
        self.defs.append(f'<linearGradient id="{i}" x1="{x1:g}" y1="{y1:g}" x2="{x2:g}" y2="{y2:g}"{u}>{self._stops(stops)}</linearGradient>')
        return f'url(#{i})'

    def rad(self, stops, cx=0.5, cy=0.5, r=0.5, fx=None, fy=None, user=False):
        i = self._id('r')
        u = ' gradientUnits="userSpaceOnUse"' if user else ''
        f = f' fx="{fx:g}" fy="{fy:g}"' if fx is not None else ''
        self.defs.append(f'<radialGradient id="{i}" cx="{cx:g}" cy="{cy:g}" r="{r:g}"{f}{u}>{self._stops(stops)}</radialGradient>')
        return f'url(#{i})'

    def clip(self, shapes):
        i = self._id('c')
        self.defs.append(f'<clipPath id="{i}">{shapes}</clipPath>')
        return f'url(#{i})'

    def filt(self, key, body, region='x="-6%" y="-6%" width="112%" height="112%"'):
        if key not in self.made:
            i = self._id('f')
            self.defs.append(f'<filter id="{i}" {region} color-interpolation-filters="sRGB">{body}</filter>')
            self.made[key] = f'url(#{i})'
        return self.made[key]

    def add(self, s):
        self.body.append(s)

    def svg(self, size=128):
        return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 256 256">'
                f'<!-- Drawn after DEsk (https://github.com/fyzugx/DEsk, MIT, (c) 2026 The DEsk authors), scripts/desk-drawer-art.py -->'
                f'<defs>{"".join(self.defs)}</defs>{"".join(self.body)}</svg>\n')


def g(inner, filt=None, tf=None, op=None, clip=None):
    a = ''
    if filt:
        a += f' filter="{filt}"'
    if tf:
        a += f' transform="{tf}"'
    if op is not None:
        a += f' opacity="{op:g}"'
    if clip:
        a += f' clip-path="{clip}"'
    return f'<g{a}>{inner}</g>'


# ---- what makes a drawing a thing (make-icons.py) ----------------------------

def grain(ic, amt=0.05, freq='0.8', octaves=2, seed=1, dark='#3a2812', light=0.7):
    r, gg, b = rgbf(dark)
    k = 4.0 * amt
    kl = k * light
    body = (f'<feTurbulence type="fractalNoise" baseFrequency="{freq}" numOctaves="{octaves}" seed="{seed}" result="n"/>'
            f'<feColorMatrix in="n" type="matrix" values="0 0 0 0 {r:.3f} 0 0 0 0 {gg:.3f} 0 0 0 0 {b:.3f} {k:.3f} 0 0 0 {-0.5 * k:.3f}" result="d"/>'
            f'<feColorMatrix in="n" type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 {-kl:.3f} 0 0 0 {0.5 * kl:.3f}" result="l"/>'
            '<feMerge result="m"><feMergeNode in="d"/><feMergeNode in="l"/></feMerge>'
            '<feComposite in="m" in2="SourceAlpha" operator="in" result="t"/>'
            '<feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="t"/></feMerge>')
    return ic.filt(('grain', amt, freq, octaves, seed, dark, light), body)


def edge_light(ic, blur=3.0, depth=3.0, shine=0.9, exp=26, elev=40, k=0.6):
    """the light along an edge that faces the lamp: the outline, blurred, lit as a surface"""
    body = (f'<feGaussianBlur in="SourceAlpha" stdDeviation="{blur:g}" result="b"/>'
            f'<feSpecularLighting in="b" surfaceScale="{depth:g}" specularConstant="{shine:g}" specularExponent="{exp:g}" lighting-color="#fff2d8" result="s">'
            f'<feDistantLight azimuth="{LIGHT_AZIMUTH}" elevation="{elev:g}"/></feSpecularLighting>'
            '<feComposite in="s" in2="SourceAlpha" operator="in" result="si"/>'
            f'<feComposite in="SourceGraphic" in2="si" operator="arithmetic" k1="0" k2="1" k3="{k:g}" k4="0"/>')
    return ic.filt(('bevel', blur, depth, shine, exp, elev, k), body)


def pressed(ic, dy=2.0, blur=1.6, col='#000', op=0.5):
    body = ('<feComponentTransfer in="SourceAlpha" result="inv"><feFuncA type="table" tableValues="1 0"/></feComponentTransfer>'
            f'<feGaussianBlur in="inv" stdDeviation="{blur:g}"/>'
            f'<feOffset dx="{-dy * 0.6:g}" dy="{-dy * 0.6:g}" result="o"/>'
            f'<feFlood flood-color="{col}" flood-opacity="{op:g}"/>'
            '<feComposite in2="o" operator="in"/>'
            '<feComposite in2="SourceAlpha" operator="in" result="is"/>'
            '<feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="is"/></feMerge>')
    return ic.filt(('inner', dy, blur, col, op), body)


def dropped(ic, lift=1.0, blur=4.0, op=0.38):
    """the soft shadow a thing lays on what is under it, away from the lamp"""
    dx, dy = SHADOW[0] * lift, SHADOW[1] * lift
    body = (f'<feGaussianBlur in="SourceAlpha" stdDeviation="{blur:g}"/>'
            f'<feOffset dx="{dx:g}" dy="{dy:g}" result="o"/>'
            f'<feFlood flood-color="#120a03" flood-opacity="{op:g}"/>'
            '<feComposite in2="o" operator="in" result="s"/>'
            '<feMerge><feMergeNode in="s"/><feMergeNode in="SourceGraphic"/></feMerge>')
    return ic.filt(('drop', lift, blur, op), body, 'filterUnits="userSpaceOnUse" x="-24" y="-24" width="304" height="304"')


def contact(ic, cx, cy, rx, ry, op=0.32):
    """the dark right under a thing, where it meets the felt"""
    return (f'<ellipse cx="{cx:g}" cy="{cy:g}" rx="{rx:g}" ry="{ry:g}" fill="'
            f'{ic.rad([(0, "#0c0702", op), (0.6, "#0c0702", op * 0.42), (1, "#0c0702", 0)])}"/>')


def place(ic, inner, cx, cy, rx, ry, op=0.3, drop=(1.0, 4.0, 0.4)):
    """a thing set down: its contact shadow (nudged up-left, away from the lamp), then it, with its own shadow"""
    ic.add(contact(ic, cx + SHADOW[0] * 1.2, cy + SHADOW[1] * 1.2, rx, ry, op))
    ic.add(g(inner, dropped(ic, *drop)))


def typed(x0, x1, y0, rows, gap=11.0, h=4.4, col='#6a6457', seed=1, last_short=True, op=1.0):
    rnd = random.Random(seed)
    parts = []
    for i in range(rows):
        y = y0 + i * gap
        end = x1 - rnd.uniform(0, 6)
        if last_short and i == rows - 1:
            end = x0 + (x1 - x0) * rnd.uniform(0.35, 0.6)
        x = x0
        while x < end - 4:
            w = min(rnd.uniform(7, 24), end - x)
            parts.append(f'<rect x="{x:.1f}" y="{y - h / 2:.1f}" width="{w:.1f}" height="{h:g}" rx="{h / 2:g}"/>')
            x += w + rnd.uniform(4, 6)
    return f'<g fill="{col}" opacity="{op:g}">{"".join(parts)}</g>'


BRASS = [(0, '#8a6420'), (0.25, '#d8b257'), (0.45, '#a77b2a'), (0.75, '#e6c166'), (1, '#fff0bf')]
PAPER = [(0, '#efe8d8'), (1, '#fffdf7')]   # darker away from the lamp (top-left), lighter toward it


# ---- 唱片日记: a leather notebook ------------------------------------------------

def diary(ic):
    x, y, w, h, r = 50, 30, 150, 196, 9
    # the pages' edge, showing along the right and the bottom under the cover
    pages = (f'<rect x="{x + 6}" y="{y + 6}" width="{w}" height="{h}" rx="5" fill="{ic.lin([(0, "#e6dcc3"), (1, "#f8f1df")], 0, 0, 1, 1)}" stroke="#a89670" stroke-width="1"/>'
             + ''.join(f'<path d="M{x + w + 1 + k * 1.2:.1f},{y + 16} V{y + h - 4}" stroke="#b8a780" stroke-width=".6" opacity=".7"/>' for k in range(4))
             + ''.join(f'<path d="M{x + 14},{y + h + 1 + k * 1.2:.1f} H{x + w - 4}" stroke="#b8a780" stroke-width=".6" opacity=".7"/>' for k in range(4)))
    leather = ic.lin([(0, '#3e1d0e'), (0.55, '#5c2e16'), (1, '#7a4122')], 0, 0, 1, 1)
    cover = f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{leather}"/>'
    # the spine, rounder and darker, on the left
    cover += f'<rect x="{x}" y="{y}" width="20" height="{h}" rx="{r}" fill="{ic.lin([(0, "#1f0c04", .55), (1, "#1f0c04", 0)], 0, 0, 1, 0)}"/>'
    cover += f'<path d="M{x + 20},{y + 4} V{y + h - 4}" stroke="#2a1206" stroke-width="1.6" opacity=".7"/><path d="M{x + 21.6},{y + 4} V{y + h - 4}" stroke="#9a5a32" stroke-width=".8" opacity=".5"/>'
    # stitching around the edge
    cover += (f'<rect x="{x + 27}" y="{y + 7}" width="{w - 34}" height="{h - 14}" rx="5" fill="none" stroke="#d9b07a" '
              'stroke-width="1.3" stroke-dasharray="4 3" opacity=".75"/>')
    cover = g(g(cover, grain(ic, 0.11, '0.95', 3, 11, '#120500', 0.45)), edge_light(ic, 3.2, 2.6, 0.75, 22, 34, 0.45))
    # a record, blind-stamped into the cover
    cx, cy = x + 24 + (w - 24) / 2, y + 86
    stamp = (f'<circle cx="{cx}" cy="{cy}" r="34" fill="#4a230f"/>'
             + ''.join(f'<circle cx="{cx}" cy="{cy}" r="{rr}" fill="none" stroke="#2b1206" stroke-width="1"/>' for rr in (30, 25, 20))
             + f'<circle cx="{cx}" cy="{cy}" r="11" fill="#5b2c14"/><circle cx="{cx}" cy="{cy}" r="2.6" fill="#1c0a03"/>')
    lip = (f'<circle cx="{cx + 1.2}" cy="{cy + 1.4}" r="34.6" fill="none" stroke="#a8683c" stroke-width="1.2" opacity=".6"/>')
    cover += lip + g(stamp, pressed(ic, 2.2, 1.6, '#000', 0.7))
    # 日记 in gold foil under it, worn
    cover += f'<g fill="{ic.lin(BRASS, 0, 0, 1, 1)}" opacity=".85"><rect x="{cx - 26}" y="{cy + 50}" width="52" height="4.2" rx="1.2"/><rect x="{cx - 17}" y="{cy + 60}" width="34" height="2.6" rx="1"/></g>'
    # the elastic band, round the cover top to bottom
    bx = x + w - 30
    band = (f'<rect x="{bx}" y="{y - 3}" width="9" height="{h + 6}" rx="2" fill="{ic.lin([(0, "#140805"), (0.5, "#2f1a12"), (1, "#4b2c1f")], 0, 0, 1, 0)}"/>'
            f'<path d="M{bx + 6.6},{y - 2} V{y + h + 2}" stroke="#7d5640" stroke-width=".8" opacity=".6"/>')
    # a ribbon falling out at the foot
    ribbon = (f'<path d="M{x + 98},{y + h - 4} C{x + 100},{y + h + 10} {x + 92},{y + h + 16} {x + 96},{y + h + 26} L{x + 104},{y + h + 22} C{x + 101},{y + h + 14} {x + 107},{y + h + 8} {x + 105},{y + h - 4} Z" '
              f'fill="{ic.lin([(0, "#7c1f1a"), (1, "#b8372b")], 0, 0, 1, 1)}"/>')
    place(ic, pages + ribbon + g(cover + band), 128, 138, 96, 108, 0.24, (1.1, 4.5, 0.42))


# ---- 伙伴: a stack of instant photographs ----------------------------------------

# The companion's photo: where the picture window of the top photograph is, in the SVG's 256 units,
# and its turn -- the app lays the pet there (src/desk/desk-model.mjs PET_WINDOW).
TOP = {'x': 58, 'y': 34, 'w': 140, 'h': 168, 'angle': -6}
PET_WINDOW = {'x': TOP['x'] + 11, 'y': TOP['y'] + 11, 'w': TOP['w'] - 22, 'h': TOP['h'] - 50, 'angle': TOP['angle']}


def photo(ic, x, y, w, h, angle, seed, scene=None):
    frame = (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="2" fill="{ic.lin([(0, "#e8e3d6"), (1, "#fbfaf5")], 0, 0, 1, 1)}" stroke="#c9c1ae" stroke-width="1.2"/>')
    frame = g(frame, grain(ic, 0.045, '0.9', 2, seed, '#4a3a20'))
    px, py, pw, ph = x + 11, y + 11, w - 22, h - 50
    s = scene(px, py, pw, ph) if scene else ''
    s += (f'<rect x="{px}" y="{py}" width="{pw}" height="{ph}" fill="none" stroke="#000" stroke-width="1" opacity=".22"/>')
    # a few words written on the white below, in pencil
    s += typed(x + 18, x + w - 30, y + h - 26, 1, 8, 3.2, '#8a8170', seed, True, 0.7)
    return g(g(frame + s, dropped(ic, 0.6, 2.5, 0.3)), tf=f'rotate({angle:g} {x + w / 2:g} {y + h / 2:g})')


def faded(ic, tint):
    def scene(px, py, pw, ph):
        sky = ic.lin([(0, tint[0]), (1, tint[1])])
        return (f'<rect x="{px}" y="{py}" width="{pw}" height="{ph}" fill="{sky}"/>'
                f'<path d="M{px},{py + ph * .72} Q{px + pw * .35},{py + ph * .55} {px + pw * .6},{py + ph * .68} T{px + pw},{py + ph * .62} V{py + ph} H{px} Z" fill="{tint[2]}" opacity=".85"/>'
                f'<circle cx="{px + pw * .72}" cy="{py + ph * .28}" r="{pw * .09}" fill="#fff5d8" opacity=".7"/>')
    return scene


def room(ic):
    """the top photo's own ground: a warm, soft-focus room behind whoever sits for it"""
    def scene(px, py, pw, ph):
        return (f'<rect x="{px}" y="{py}" width="{pw}" height="{ph}" fill="{ic.rad([(0, "#f3d9a8"), (0.7, "#c79a62"), (1, "#8a5f37")], 0.6, 0.4, 0.8)}"/>'
                f'<rect x="{px}" y="{py + ph * .74}" width="{pw}" height="{ph * .26}" fill="{ic.lin([(0, "#7a4f2c"), (1, "#5d3a20")])}" opacity=".75"/>'
                f'<rect x="{px}" y="{py}" width="{pw}" height="{ph}" fill="{ic.lin([(0, "#fff", .32), (.45, "#fff", .05), (.5, "#fff", 0)], 0, 0, 1, 1)}"/>')
    return scene


def photos(ic):
    under = photo(ic, 40, 46, 140, 168, 9, 31, faded(ic, ('#9fc3cf', '#e3d6b6', '#7c8f5a')))
    mid = photo(ic, 66, 40, 140, 168, 3, 32, faded(ic, ('#e7b27e', '#f5dcb5', '#9a6a3c')))
    top = photo(ic, TOP['x'], TOP['y'], TOP['w'], TOP['h'], TOP['angle'], 33, room(ic))
    place(ic, under + mid + top, 128, 134, 100, 104, 0.22, (0.8, 3.5, 0.32))


# ---- 词书: a card-index box --------------------------------------------------

def cardbox(ic):
    x, y, w, h = 40, 58, 176, 150
    wood = ic.lin([(0, '#6b3f1e'), (0.5, '#8a5630'), (1, '#a86d3e')], 0, 0, 1, 1)
    box = f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="7" fill="{wood}"/>'
    box = g(g(box, grain(ic, 0.09, '0.06 0.9', 3, 51, '#2a1406', 0.5)), edge_light(ic, 3, 3, 0.8, 22, 36, 0.5))
    # the well inside, where the cards stand
    inner = f'<rect x="{x + 10}" y="{y + 10}" width="{w - 20}" height="{h - 20}" rx="3" fill="#3a2010"/>'
    inner = g(inner, pressed(ic, 3, 2.4, '#000', 0.7))
    cards = ''
    rnd = random.Random(5)
    tabs = ['#e9c46a', '#9ec1d6', '#e59a8c', '#a6c98e']
    for i in range(9):
        cy = y + 18 + i * 13.5
        lean = rnd.uniform(-1.4, 1.4)
        cards += (f'<g transform="rotate({lean:.2f} {x + w / 2} {cy})"><rect x="{x + 15}" y="{cy}" width="{w - 30}" height="12" rx="1.5" '
                  f'fill="{ic.lin([(0, "#e9e1cc"), (1, "#fbf7ec")], 0, 0, 1, 1)}" stroke="#b9ab88" stroke-width=".8"/>'
                  f'<path d="M{x + 15},{cy + 12} H{x + w - 15}" stroke="#2a1406" stroke-width="1.4" opacity=".35"/>')
        if i % 3 == 1:
            tx = x + 24 + (i * 37) % (w - 70)
            cards += f'<rect x="{tx}" y="{cy - 6}" width="26" height="8" rx="1.5" fill="{tabs[i % 4]}" stroke="#7a6a4a" stroke-width=".6"/>'
        cards += '</g>'
    # the brass label holder on the front edge, a card in it with 词 on it
    lx, ly = x + w / 2 - 26, y + h - 9
    label = (f'<rect x="{lx}" y="{ly - 4}" width="52" height="16" rx="2" fill="{ic.lin(BRASS, 0, 0, 1, 1)}"/>'
             f'<rect x="{lx + 4}" y="{ly - 1}" width="44" height="10" fill="#f6efdc"/>'
             f'<text x="{lx + 26}" y="{ly + 7.6}" text-anchor="middle" font-family="Songti SC, Noto Serif CJK SC, serif" font-size="9" font-weight="700" fill="#3b2a18">词 书</text>')
    place(ic, g(box + inner + cards + label), 128, 136, 100, 86, 0.28, (1.0, 4.0, 0.42))


# ---- 明信片: a postcard -------------------------------------------------------

def postcard(ic):
    x, y, w, h, a = 26, 62, 204, 136, -5
    card = f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="2.5" fill="{ic.lin([(0, "#e9dfc6"), (1, "#fbf5e6")], 0, 0, 1, 1)}" stroke="#bfae86" stroke-width="1.2"/>'
    card = g(card, grain(ic, 0.05, '0.85', 2, 61, '#4a3a20'))
    mid = x + w * 0.56
    s = f'<path d="M{mid},{y + 16} V{y + h - 16}" stroke="#a89a7a" stroke-width="1"/>'
    s += typed(x + 14, mid - 12, y + 30, 5, 13, 3.6, '#4b5a7a', 61, True, 0.8)      # the writing, in blue-black
    for k in range(3):
        s += f'<path d="M{mid + 12},{y + 72 + k * 18} H{x + w - 14}" stroke="#a89a7a" stroke-width="1"/>'
    s += typed(mid + 14, x + w - 22, y + 66, 3, 18, 3.4, '#4b5a7a', 62, True, 0.75)
    # the stamp: perforated, a little landscape, and the postmark over it
    sx, sy, sw, sh = x + w - 50, y + 12, 36, 42
    perf = ''.join(f'<circle cx="{sx + i * 4:.1f}" cy="{sy}" r="1.4"/><circle cx="{sx + i * 4:.1f}" cy="{sy + sh}" r="1.4"/>' for i in range(10))
    perf += ''.join(f'<circle cx="{sx}" cy="{sy + j * 4.2:.1f}" r="1.4"/><circle cx="{sx + sw}" cy="{sy + j * 4.2:.1f}" r="1.4"/>' for j in range(11))
    stamp = (f'<g clip-path="{ic.clip(f"<rect x=\"{sx}\" y=\"{sy}\" width=\"{sw}\" height=\"{sh}\"/>")}">'
             f'<rect x="{sx}" y="{sy}" width="{sw}" height="{sh}" fill="#f4ead4"/>'
             f'<rect x="{sx + 4}" y="{sy + 4}" width="{sw - 8}" height="{sh - 8}" fill="{ic.lin([(0, "#e98b5a"), (1, "#f6cf8a")])}"/>'
             f'<path d="M{sx + 4},{sy + sh - 12} L{sx + 14},{sy + 18} L{sx + 22},{sy + 26} L{sx + 32},{sy + 14} V{sy + sh - 4} H{sx + 4} Z" fill="#2f6f73"/>'
             f'</g><g fill="#efe5cc">{perf}</g>')
    mark = ''.join(f'<path d="M{sx - 34},{sy + 18 + k * 6} q6,-3 12,0 t12,0 t12,0 t12,0" fill="none" stroke="#3b3b4a" stroke-width="1.3" opacity=".55"/>' for k in range(4))
    mark += f'<circle cx="{sx - 6}" cy="{sy + 27}" r="15" fill="none" stroke="#3b3b4a" stroke-width="1.4" opacity=".55"/>'
    s += g(stamp, dropped(ic, 0.2, 0.8, 0.25)) + mark
    inner = g(card + s, tf=f'rotate({a} {x + w / 2} {y + h / 2})')
    place(ic, inner, 128, 132, 108, 72, 0.22, (0.5, 3.0, 0.36))


# ---- 睡前模式: a little night lamp, from above -------------------------------------

def nightlamp(ic):
    cx, cy = 126, 130
    base = (f'<circle cx="{cx}" cy="{cy}" r="74" fill="{ic.lin(BRASS, 0, 0, 1, 1)}"/>'
            f'<circle cx="{cx}" cy="{cy}" r="66" fill="none" stroke="#6e4f1a" stroke-width="1.2" opacity=".6"/>')
    base = g(g(base, grain(ic, 0.05, '0.02 0.9', 2, 71, '#3a2508', 0.6)), edge_light(ic, 3, 3, 0.9, 28, 36, 0.6))
    # the shade: cream linen, glowing from the bulb under it
    shade = (f'<circle cx="{cx}" cy="{cy}" r="58" fill="{ic.rad([(0, "#fff7d6"), (0.45, "#ffe3a3"), (0.85, "#e8b867"), (1, "#c28a3e")], 0.56, 0.58, 0.6)}"/>'
             + ''.join(f'<path d="M{cx + 58 * math.cos(math.radians(t)):.1f},{cy + 58 * math.sin(math.radians(t)):.1f} L{cx + 20 * math.cos(math.radians(t)):.1f},{cy + 20 * math.sin(math.radians(t)):.1f}" stroke="#c8954a" stroke-width=".8" opacity=".35"/>' for t in range(0, 360, 30)))
    shade = g(shade, grain(ic, 0.06, '1.1', 2, 72, '#7a4a10', 0.4))
    # the open top of the shade, and the bulb in it
    top = (f'<circle cx="{cx}" cy="{cy}" r="20" fill="{ic.rad([(0, "#fffef6"), (0.5, "#fff3c4"), (1, "#f2c66f")])}" stroke="#b07a2e" stroke-width="1.2"/>'
           f'<circle cx="{cx - 4}" cy="{cy - 4}" r="6" fill="#fff" opacity=".85"/>')
    # a little brass switch on a lead, and a crescent moon cut in the shade
    moon = f'<path d="M{cx + 30},{cy - 30} a14,14 0 1 0 12,22 a11,11 0 1 1 -12,-22 Z" fill="#a8742c" opacity=".55"/>'
    lead = (f'<path d="M{cx + 70},{cy + 26} C{cx + 92},{cy + 40} {cx + 96},{cy + 66} {cx + 84},{cy + 90}" fill="none" stroke="#2a1d14" stroke-width="3" stroke-linecap="round"/>'
            f'<rect x="{cx + 74}" y="{cy + 86}" width="20" height="12" rx="4" fill="{ic.lin(BRASS, 0, 0, 1, 1)}" stroke="#5a3d12" stroke-width="1"/>')
    # the glow it casts round itself on the felt
    glow = f'<circle cx="{cx}" cy="{cy}" r="110" fill="{ic.rad([(0, "#ffd88a", .38), (0.55, "#ffcc70", .12), (1, "#ffcc70", 0)])}"/>'
    ic.add(glow)
    place(ic, lead + base + shade + moon + top, cx, cy, 84, 84, 0.3, (1.3, 4.5, 0.45))


# ---- 场景配方: a recipe card -- what to put on, how long, how loud --------------------------

def recipe(ic):
    x, y, w, h, a = 40, 58, 176, 132, 4
    tab = f'<path d="M{x + 18},{y} v-16 a4,4 0 0 1 4,-4 h52 a4,4 0 0 1 4,4 v16 Z" fill="{ic.lin([(0, "#d9b98a"), (1, "#ecd3a6")])}" stroke="#a88a5a" stroke-width="1"/>'
    card = f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="2.5" fill="{ic.lin([(0, "#efe6cf"), (1, "#fbf6e8")], 0, 0, 1, 1)}" stroke="#bfae86" stroke-width="1.2"/>'
    card = g(tab + card, grain(ic, 0.05, '0.85', 2, 81, '#4a3a20'))
    # the ruled lines of an index card: one red rule under the head, blue below
    rules = f'<path d="M{x + 8},{y + 30} H{x + w - 8}" stroke="#c0574a" stroke-width="1" opacity=".7"/>'
    rules += ''.join(f'<path d="M{x + 8},{y + 48 + k * 17} H{x + w - 8}" stroke="#8fa3bf" stroke-width=".8" opacity=".6"/>' for k in range(5))
    # a little record printed in the corner, and the writing
    rec = (f'<circle cx="{x + 30}" cy="{y + 70}" r="17" fill="#262321"/>'
           + ''.join(f'<circle cx="{x + 30}" cy="{y + 70}" r="{r}" fill="none" stroke="#3b3734" stroke-width=".7"/>' for r in (14, 11, 8.5))
           + f'<circle cx="{x + 30}" cy="{y + 70}" r="6" fill="#d9774e"/><circle cx="{x + 30}" cy="{y + 70}" r="1.4" fill="#262321"/>')
    words = typed(x + 12, x + w - 50, y + 14, 1, 13, 4.2, '#3b3b4a', 81, False, 0.85)
    words += typed(x + 56, x + w - 14, y + 58, 3, 17, 3.6, '#3b4a6a', 82, True, 0.8)
    words += typed(x + 12, x + w - 30, y + 109, 1, 17, 3.6, '#3b4a6a', 83, True, 0.8)
    # a paper clip over the top edge, catching the lamp
    clip = (f'<path d="M{x + w - 34},{y + 30} V{y - 10} a7,7 0 0 1 14,0 V{y + 38} a10,10 0 0 1 -20,0 V{y - 2}" fill="none" stroke="{ic.lin([(0, "#8f8a80"), (0.5, "#eeeae0"), (1, "#7d786e")], 0, 0, 1, 0)}" stroke-width="2.6" stroke-linecap="round"/>')
    inner = g(card + rules + rec + words + g(clip, dropped(ic, 0.3, 0.9, 0.35)), tf=f'rotate({a} {x + w / 2} {y + h / 2})')
    place(ic, inner, 128, 128, 96, 76, 0.22, (0.5, 3.0, 0.36))


THINGS = {'diary': diary, 'companion': photos, 'cardbox': cardbox, 'postcard': postcard, 'nightlamp': nightlamp, 'recipe': recipe}


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, draw in THINGS.items():
        ic = Icon()
        draw(ic)
        with open(os.path.join(OUT, name + '.svg'), 'w', encoding='utf-8') as f:
            f.write(ic.svg())
    print('wrote', ', '.join(THINGS), 'to', OUT, '| pet window', PET_WINDOW)


if __name__ == '__main__':
    main()
