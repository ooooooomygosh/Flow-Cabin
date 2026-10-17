# Cat mood / feeding art for the 小屋日记 and cat panel.
# Palette: the cabin cat (src/pet/cat-sprites.mjs) + --px-* tokens (src/styles/tokens.css).
# Sprites are drawn 1x on an indexed grid, auto-outlined, saved as transparent PNG to public/cat/.
# Run: python3 scripts/art/cat-mood.py
import math, os
from PIL import Image
OUT = 'public/cat'
P = {
 'k': '#3b2a20',   # outline (--px-paper-ink)
 'f': '#e8a25a',   # fur
 'F': '#c47634',   # fur shade / stripes
 'd': '#9a5a28',   # deep shade
 'l': '#f8dcae',   # light fur (muzzle, chest)
 'L': '#fff3dc',   # fur highlight
 'p': '#ef98a4',   # pink (nose, ears, tongue)
 'e': '#2a1d16',   # eyes
 'w': '#fffaf0',   # eye glint
 'h': '#59606c',   # headphones
 'H': '#8f98a6',   # headphones highlight
 'j': '#3a3f49',   # headphones shade
 'a': '#e0ad69', 'A': '#ffd99c', 'b': '#a8743c',  # amber / --px-accent
 'r': '#b5523b', 'R': '#7f3426',                  # red
 't': '#7fb8a8', 'T': '#4f8577',                  # teal --px-accent-2
 'g': '#9ccf8c', 'G': '#5f8f55',                  # moss --px-good
 'n': '#6b4224', 'N': '#4a2c17', 'm': '#8a5a32',  # leather / wood
 'c': '#fff7e6', 'C': '#efdcb8',                  # paper
 's': '#7fa6c9', 'S': '#4f7bb5',                  # fish blue
 'z': '#ffe08a',                                  # sparkle / zzz
 'q': '#c9c2b4', 'Q': '#8d8679',                  # plate
 'v': '#1c120b',                                  # vinyl
}
NOOUT = set('zk')  # effects and outline itself don't receive an outline
def rgba(c): c = P[c]; return (int(c[1:3], 16), int(c[3:5], 16), int(c[5:7], 16), 255)

class G:
    def __init__(s, w=64, h=64): s.w, s.h = w, h; s.g = [[None] * w for _ in range(h)]
    def put(s, x, y, c):
        x, y = int(round(x)), int(round(y))
        if 0 <= x < s.w and 0 <= y < s.h: s.g[y][x] = c
    def get(s, x, y): return s.g[y][x] if 0 <= x < s.w and 0 <= y < s.h else None
    def rect(s, x0, y0, x1, y1, c):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1): s.put(x, y, c)
    def ell(s, cx, cy, rx, ry, c, shade=None, lit=None, sk=.45):
        for y in range(math.floor(cy - ry) - 1, math.ceil(cy + ry) + 2):
            for x in range(math.floor(cx - rx) - 1, math.ceil(cx + rx) + 2):
                u, v = (x - cx) / (rx + .5), (y - cy) / (ry + .5)
                if u * u + v * v <= 1:
                    col = c
                    if shade and (v * .85 + u * .35) > sk: col = shade
                    if lit and (v * .8 + u * .4) < -.7 and u * u + v * v > .55: col = lit
                    s.put(x, y, col)
    def tri(s, pts, c):
        (x0, y0), (x1, y1), (x2, y2) = pts
        for y in range(int(min(y0, y1, y2)), int(max(y0, y1, y2)) + 1):
            for x in range(int(min(x0, x1, x2)), int(max(x0, x1, x2)) + 1):
                d = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
                a = ((y1 - y2) * (x - x2) + (x2 - x1) * (y - y2)) / d
                b = ((y2 - y0) * (x - x2) + (x0 - x2) * (y - y2)) / d
                if a >= -.02 and b >= -.02 and 1 - a - b >= -.02: s.put(x, y, c)
    def line(s, x0, y0, x1, y1, c, r=0):
        n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
        for i in range(n + 1):
            t = i / n; x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
            if r: s.ell(x, y, r, r, c)
            else: s.put(x, y, c)
    def outline(s, keep=()):
        out = [row[:] for row in s.g]
        for y in range(s.h):
            for x in range(s.w):
                if s.g[y][x]: continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    v = s.get(x + dx, y + dy)
                    if v and v not in NOOUT: out[y][x] = 'k'; break
        s.g = out
    def img(s):
        im = Image.new('RGBA', (s.w, s.h), (0, 0, 0, 0))
        for y in range(s.h):
            for x in range(s.w):
                if s.g[y][x]: im.putpixel((x, y), rgba(s.g[y][x]))
        return im
    def paste(s, o, ox=0, oy=0):
        for y in range(o.h):
            for x in range(o.w):
                if o.g[y][x]: s.put(x + ox, y + oy, o.g[y][x])

# ---------------------------------------------------------------- parts
def ears(g, hx, hy, mode='up'):
    if mode == 'flat':   # droopy: ears rotated out sideways
        for sgn in (-1, 1):
            g.tri([(hx + sgn * 16, hy - 2), (hx + sgn * 6, hy - 8), (hx + sgn * 8, hy - 1)], 'f')
            g.tri([(hx + sgn * 13, hy - 2), (hx + sgn * 8, hy - 6), (hx + sgn * 9, hy - 2)], 'p')
        return
    lift = 0 if mode == 'up' else 2
    for sgn in (-1, 1):
        g.tri([(hx + sgn * 10, hy - 14 + lift), (hx + sgn * 3, hy - 6), (hx + sgn * 12, hy - 3)], 'f')
        g.tri([(hx + sgn * 9.5, hy - 11 + lift), (hx + sgn * 6, hy - 6), (hx + sgn * 10, hy - 5)], 'p')

def head(g, hx, hy, eyes='open', mouth='w', ear='up', blush=True, look=(0, 0)):
    ears(g, hx, hy, ear)
    g.ell(hx, hy, 12, 9.5, 'f', shade='F', lit='L', sk=.62)
    # cheeks fluff
    for sgn in (-1, 1): g.put(hx + sgn * 13, hy + 2, 'f'); g.put(hx + sgn * 13, hy + 3, 'F')
    # forehead stripes
    for dx in (-3, 0, 3): g.rect(hx + dx, hy - 9, hx + dx, hy - 6 + (dx == 0), 'F')
    for sgn in (-1, 1): g.rect(hx + sgn * 11 - (sgn > 0), hy - 1, hx + sgn * 11 + (sgn < 0) * 0, hy - 1, 'F')
    # muzzle
    g.ell(hx, hy + 4, 5.5, 3.2, 'l', shade='C', sk=.8)
    lx, ly = look; ey = hy + ly
    for sgn in (-1, 1):
        ex = hx + sgn * 5 + lx
        if eyes == 'open':
            g.rect(ex - 1, ey - 2, ex + 1, ey + 1, 'e'); g.put(ex - 1 + (sgn > 0), ey - 2, 'w'); g.put(ex + (sgn < 0), ey, 'w')
        elif eyes == 'big':
            g.rect(ex - 2, ey - 2, ex + 1, ey + 2, 'e'); g.rect(ex - 1, ey - 2, ex, ey - 1, 'w'); g.put(ex + 1, ey + 1, 'w')
        elif eyes == 'happy':   # ^ ^
            g.put(ex - 2, ey + 1, 'e'); g.put(ex - 1, ey, 'e'); g.put(ex, ey - 1, 'e'); g.put(ex + 1, ey, 'e'); g.put(ex + 2, ey + 1, 'e')
        elif eyes == 'closed':  # sleepy curve
            g.put(ex - 2, ey - 1, 'e'); g.rect(ex - 1, ey, ex + 1, ey, 'e'); g.put(ex + 2, ey - 1, 'e')
        elif eyes == 'half':    # content, lids down
            g.rect(ex - 2, ey - 1, ex + 2, ey - 1, 'F'); g.rect(ex - 1, ey, ex + 1, ey + 1, 'e'); g.put(ex + (sgn < 0), ey, 'w')
        elif eyes == 'droopy':  # tired, lids sagging outward
            g.rect(ex - 2, ey - 1, ex + 2, ey - 1, 'd'); g.put(ex + sgn * 2, ey - 2, 'd')
            g.rect(ex - 1, ey, ex + 1, ey + 1, 'e'); g.put(ex - sgn, ey + 1, 'w')
    if blush:
        for sgn in (-1, 1): g.rect(hx + sgn * 8 - 1, hy + 3, hx + sgn * 8, hy + 3, 'p')
    # nose
    g.rect(hx - 1, hy + 2, hx, hy + 2, 'p'); g.put(hx - .5, hy + 3, 'p')
    if mouth == 'w':
        g.put(hx - 3, hy + 4, 'k'); g.put(hx - 2, hy + 5, 'k'); g.put(hx - 1, hy + 4, 'k'); g.put(hx, hy + 4, 'k'); g.put(hx + 1, hy + 5, 'k'); g.put(hx + 2, hy + 4, 'k')
    elif mouth == 'open':
        g.rect(hx - 2, hy + 4, hx + 1, hy + 6, 'k'); g.rect(hx - 1, hy + 5, hx, hy + 6, 'p')
    elif mouth == 'chew':
        g.rect(hx - 2, hy + 4, hx + 1, hy + 5, 'k'); g.rect(hx - 1, hy + 5, hx, hy + 5, 'p')
    elif mouth == 'lick':
        g.put(hx - 2, hy + 4, 'k'); g.rect(hx - 1, hy + 4, hx + 1, hy + 4, 'k'); g.rect(hx, hy + 5, hx + 2, hy + 6, 'p'); g.put(hx + 2, hy + 5, 'k')
    elif mouth == 'flat':
        g.rect(hx - 2, hy + 5, hx + 1, hy + 5, 'k')
    elif mouth == 'sleep':
        g.put(hx - 1, hy + 5, 'k'); g.put(hx, hy + 5, 'k')

def phones(g, hx, hy, ear='up', slip=0):
    top = hy - 11 if ear != 'flat' else hy - 10
    for x in range(hx - 12, hx + 13):
        t = (x - hx) / 12.5
        y = hy - 2 - round(math.sqrt(max(0, 1 - t * t)) * 9.5) + (slip if x > hx else 0) * (abs(t))
        g.put(x, y, 'h'); g.put(x, y - 1, 'H' if abs(t) < .7 else 'h')
    for sgn in (-1, 1):
        cx = hx + sgn * 13; cy = hy + (slip if sgn > 0 else 0)
        g.ell(cx, cy, 2.5, 4, 'h', shade='j', sk=.3)
        g.put(cx - sgn, cy - 2, 'H'); g.put(cx - sgn, cy - 1, 'H')
        g.put(cx + sgn * 2, cy, 'a'); g.put(cx + sgn * 2, cy + 1, 'a')   # amber cushion ring

def tail(g, pts, r=2.2, tip=True):
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]): g.line(x0, y0, x1, y1, 'f', r)
    # stripes across the tail
    for i, (x, y) in enumerate(pts[1:-1]):
        if i % 2 == 0: g.ell(x, y, 1.2, 1.2, 'F')
    if tip: g.ell(*pts[-1], r - .4, r - .4, 'l')

def heart(g, x, y, c='r', hi='A'):
    for p in [(1,0),(2,0),(4,0),(5,0),(0,1),(1,1),(2,1),(3,1),(4,1),(5,1),(6,1),(0,2),(1,2),(2,2),(3,2),(4,2),(5,2),(6,2),(1,3),(2,3),(3,3),(4,3),(5,3),(2,4),(3,4),(4,4),(3,5)]:
        g.put(x + p[0], y + p[1], c)
    g.put(x + 1, y + 1, hi)

def sparkle(g, x, y):
    g.put(x, y, 'z'); g.put(x - 1, y, 'z'); g.put(x + 1, y, 'z'); g.put(x, y - 1, 'z'); g.put(x, y + 1, 'z')

def zz(g, x, y, big=True):
    rows = ['zzzz', '..z.', '.z..', 'zzzz'] if big else ['zzz', '.z.', 'zzz']
    for j, r in enumerate(rows):
        for i, ch in enumerate(r):
            if ch == 'z': g.put(x + i, y + j, 'z')

def fish(g, x, y, bite=0, flip=False):
    # 14x7 fish: body blue, belly light, tail fork; bite removes head-side pixels
    f = G(16, 9)
    f.ell(6, 4, 5.5, 3, 's', shade='S', sk=.4)
    f.tri([(11, 4), (15, 0), (15, 8)], 's'); f.tri([(12, 4), (15, 2), (15, 6)], 'S')
    f.rect(3, 5, 8, 5, 'c')
    f.put(3, 3, 'e'); f.put(8, 2, 'S'); f.put(9, 3, 'S'); f.put(9, 5, 'S')
    for yy in range(9):
        for xx in range(bite):
            f.g[yy][xx] = None
    if bite >= 9:  # just the bone + tail left
        f = G(16, 9); f.tri([(11, 4), (15, 0), (15, 8)], 's'); f.rect(3, 4, 11, 4, 'c')
        for xx in (5, 7, 9): f.put(xx, 3, 'c'); f.put(xx, 5, 'c')
    f.outline()
    if flip: f.g = [row[::-1] for row in f.g]
    g.paste(f, x, y)

def plate(g, cx, y):
    g.ell(cx, y, 12, 2.5, 'q', shade='Q', sk=.2); g.rect(cx - 9, y - 1, cx + 7, y - 1, 'c')

def shadow(g, cx, y, rx):
    for x in range(int(cx - rx), int(cx + rx) + 1):
        if g.get(x, y) is None: g.put(x, y, 'N')

# ---------------------------------------------------------------- bodies
def loaf(g, cx, by, w=17, h=10, paws=True):
    """Front 3/4 loaf; by = bottom y."""
    g.ell(cx, by - h, w, h, 'f', shade='F', lit='L', sk=.5)
    for i, dx in enumerate((-9, -4, 4, 9)): g.rect(cx + dx, by - h - 6, cx + dx + 1, by - h - 3 + i % 2, 'F')  # back stripes
    g.ell(cx, by - h + 2, 7, 5, 'l', shade='C', sk=.7)  # chest bib
    if paws:
        for sgn in (-1, 1):
            g.ell(cx + sgn * 6, by - 2, 3.5, 2.2, 'l', shade='C', sk=.6)
            g.put(cx + sgn * 6, by - 1, 'C'); g.put(cx + sgn * 6 - 1, by - 2, 'C')

def cat_sleep_books():
    g = G()
    # book stack (drawn on its own layer so the cat's outline sits on it)
    books = G()
    for i, (x0, x1, col, sh, band) in enumerate([(7, 57, 'n', 'N', 'a'), (10, 55, 't', 'T', 'A'), (8, 53, 'r', 'R', 'a')]):
        y0 = 55 - i * 6
        books.rect(x0, y0, x1, y0 + 5, col); books.rect(x0, y0 + 4, x1, y0 + 5, sh)
        books.rect(x1 - 3, y0 + 1, x1 - 1, y0 + 3, 'c'); books.rect(x1 - 3, y0 + 2, x1 - 1, y0 + 2, 'C')  # pages
        books.rect(x0 + 5, y0, x0 + 6, y0 + 5, band); books.rect(x0 + 11, y0, x0 + 11, y0 + 5, band)
        books.put(x0 + 1, y0, 'A' if col != 'n' else 'm')
    books.outline()
    g.paste(books)
    c = G()
    tail(c, [(46, 41), (52, 40), (55, 36), (54, 33)])
    loaf(c, 31, 43, w=19, h=10, paws=False)
    # tucked paws as a cushion of fur at front
    c.ell(25, 41, 5, 2, 'l', shade='C', sk=.5); c.ell(35, 41, 4, 2, 'l', shade='C', sk=.5)
    head(c, 24, 27, eyes='closed', mouth='sleep', ear='soft')
    phones(c, 24, 27)
    c.outline(); g.paste(c)
    zz(g, 44, 10); zz(g, 52, 4, big=False)
    return g

def cat_wait():
    g = G()
    c = G()
    tail(c, [(46, 56), (54, 57), (59, 55), (61, 51)])
    # lying flat, long body
    c.ell(34, 50, 20, 8, 'f', shade='F', lit='L', sk=.45)
    for dx in (-6, 0, 6, 12): c.rect(34 + dx, 42, 35 + dx, 45, 'F')
    # front paws stretched forward, chin resting on them
    for x0 in (14, 24): c.ell(x0, 56, 5, 2.4, 'l', shade='C', sk=.55); c.put(x0 - 3, 57, 'C'); c.put(x0 - 1, 57, 'C')
    head(c, 21, 44, eyes='big', mouth='flat', ear='up', look=(0, -1))
    phones(c, 21, 44)
    c.outline(); g.paste(c)
    shadow(g, 34, 60, 22)
    # little "?" thought dots
    for i, (x, y) in enumerate([(36, 26), (40, 22), (45, 17)]): g.ell(x, y, i * .5 + .5, i * .5 + .5, 'b')
    for x, y in [(36, 26), (40, 22), (45, 17)]: pass
    return g

def cat_desk():
    g = G()
    desk = G(); desk.rect(0, 52, 63, 63, 'm'); desk.rect(0, 52, 63, 52, 'a'); desk.rect(0, 53, 63, 53, 'b')
    for x in (9, 30, 51): desk.rect(x, 56, x + 7, 56, 'n')
    # mug
    desk.rect(48, 41, 56, 51, 'c'); desk.rect(48, 49, 56, 51, 'C'); desk.rect(49, 41, 55, 42, 'n'); desk.ell(58, 46, 2, 2.5, 'c'); desk.put(58, 46, None)
    g.paste(desk); 
    m = G(); m.rect(48, 41, 56, 51, 'c'); m.rect(48, 49, 56, 51, 'C'); m.rect(49, 41, 55, 42, 'n'); m.rect(50, 45, 54, 47, 'r'); m.outline()
    g.paste(m)
    for i in range(3): g.put(50 + i * 2, 37 - i % 2, 'c'); g.put(51 + i * 2, 35 - i % 2, 'c')  # steam
    c = G()
    tail(c, [(38, 50), (43, 51), (46, 49)])
    c.ell(28, 48, 15, 6, 'f', shade='F', lit='L', sk=.5)
    for dx in (-4, 2, 8): c.rect(28 + dx, 42, 29 + dx, 44, 'F')
    # crossed paws on the desk
    c.ell(16, 51, 6, 2.2, 'l', shade='C', sk=.6); c.ell(25, 51, 6, 2.2, 'l', shade='C', sk=.6)
    head(c, 22, 37, eyes='half', mouth='w', ear='up')
    phones(c, 22, 37)
    c.outline(); g.paste(c)
    # music note (keeping you company)
    for x, y in [(41, 18), (41, 19), (41, 20), (41, 21), (41, 22), (42, 18), (43, 19)]: g.put(x, y, 'z')
    g.rect(39, 22, 40, 23, 'z')
    return g

def cat_rub():
    g = G()
    c = G()
    # side view, body arched, tail up with a curl
    tail(c, [(44, 40), (49, 33), (51, 25), (49, 19), (45, 18)], r=2.4)
    c.ell(33, 43, 14, 8, 'f', shade='F', lit='L', sk=.45)
    for dx in (-2, 4, 10): c.rect(33 + dx, 35, 34 + dx, 38, 'F')
    # legs
    for x, h in [(22, 0), (27, 1), (38, 0), (43, 1)]:
        c.rect(x, 48, x + 3, 57 - h, 'f' if x in (22, 38) else 'F'); c.rect(x, 56 - h, x + 3, 57 - h, 'l')
    c.ell(24, 45, 5, 4, 'l', shade='C', sk=.6)
    # head tilted toward viewer, nuzzling
    head(c, 18, 32, eyes='happy', mouth='w', ear='soft')
    phones(c, 18, 32)
    c.outline(); g.paste(c)
    shadow(g, 33, 59, 16)
    heart(g, 5, 10); heart(g, 28, 6, c='p', hi='c')
    sparkle(g, 12, 21)
    return g

def cat_droopy():
    g = G()
    c = G()
    tail(c, [(48, 56), (55, 58), (60, 59)], r=2, tip=True)
    loaf(c, 32, 59, w=18, h=9)
    head(c, 30, 40, eyes='droopy', mouth='flat', ear='flat', blush=False, look=(0, 1))
    phones(c, 30, 40, ear='flat', slip=3)
    c.outline(); g.paste(c)
    # tiny grey rain cloud — sad but cozy, never scary
    cl = G(); cl.ell(48, 14, 6, 3, 'C'); cl.ell(44, 15, 4, 2.5, 'C'); cl.ell(52, 15, 4, 2.5, 'C'); cl.rect(41, 16, 55, 17, 'q'); cl.outline(); g.paste(cl)
    for x, y in [(44, 21), (48, 23), (52, 21)]: g.put(x, y, 's'); g.put(x, y + 1, 's')
    g.put(43, 41, 's'); g.put(43, 42, 's'); g.put(42, 42, 's')  # sweat drop
    return g

# ---------------------------------------------------------------- eat sheet
def eat_frame(i):
    g = G()
    # plate with fish in front
    bite = [0, 0, 0, 4, 7, 9, 9, 9][i]
    c = G()
    lean = [0, 4, 9, 8, 9, 7, 0, 0][i]
    hy = 30 + lean
    sway = [0, 0, 0, 0, 0, 0, 0, 0][i]
    tl = [(44, 52), (52, 50), (55, 44), (53, 39)] if i < 6 else [(44, 52), (51, 47), (54, 40), (51, 35), (48, 36)]
    if i == 7: tl = [(44, 52), (52, 50), (57, 45), (58, 39)]
    tail(c, tl)
    # sitting body
    c.ell(32, 47, 13, 10, 'f', shade='F', lit='L', sk=.5)
    for dx in (-7, -2, 3, 8): c.rect(32 + dx, 38, 33 + dx, 41, 'F')
    c.ell(32, 47, 6, 6, 'l', shade='C', sk=.7)
    for sgn in (-1, 1): c.ell(32 + sgn * 6, 56, 3.2, 2, 'l', shade='C', sk=.6)
    eyes = ['big', 'open', 'happy', 'happy', 'happy', 'half', 'happy', 'happy'][i]
    mouth = ['open', 'w', 'open', 'chew', 'chew', 'lick', 'lick', 'w'][i]
    head(c, 32 + sway, hy, eyes=eyes, mouth=mouth, ear='up' if i != 7 else 'soft', look=(0, 1) if i == 1 else (0, 0))
    phones(c, 32 + sway, hy)
    c.outline(); g.paste(c)
    pl = G(); plate(pl, 32, 60); pl.outline(); g.paste(pl)
    if i < 7: fish(g, 24, 52, bite=bite)
    if i == 7: g.put(29, 58, 'c'); g.put(34, 58, 'c')   # licked-clean plate
    if i == 0: sparkle(g, 14, 47); sparkle(g, 50, 47)
    if i in (3, 4): g.put(19, hy - 2, 'c'); g.put(45, hy, 'c'); g.put(18, hy, 'c')   # crumbs flying
    if i == 6: sparkle(g, 12, 16); sparkle(g, 52, 12)
    if i == 7: heart(g, 44, 6); heart(g, 12, 12, c='p', hi='c'); sparkle(g, 54, 20)
    return g

# ---------------------------------------------------------------- stickers 32x32
def die_cut(g):
    """White sticker border (2px) around everything drawn, then a 1px ink edge."""
    for _ in range(2):
        out = [row[:] for row in g.g]
        for y in range(g.h):
            for x in range(g.w):
                if g.g[y][x] is None and any(g.get(x + dx, y + dy) for dx, dy in ((1,0),(-1,0),(0,1),(0,-1))): out[y][x] = 'c'
        g.g = out
    out = [row[:] for row in g.g]
    for y in range(g.h):
        for x in range(g.w):
            if g.g[y][x] is None and any(g.get(x + dx, y + dy) for dx, dy in ((1,0),(-1,0),(0,1),(0,-1))): out[y][x] = 'C'
    g.g = out

def star(g, cx, cy, R, r, c, shade=None):
    pts = []
    for k in range(10):
        a = -math.pi / 2 + k * math.pi / 5; rr = R if k % 2 == 0 else r
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    for k in range(10): g.tri([(cx, cy), pts[k], pts[(k + 1) % 10]], c)
    if shade:
        for k in (4, 5, 6): g.tri([(cx, cy), pts[k], pts[(k + 1) % 10]], shade)

def sticker_best_day():
    g = G(32, 32)
    # ribbon tails
    g.tri([(11, 18), (7, 29), (14, 26)], 'r'); g.tri([(21, 18), (25, 29), (18, 26)], 'r')
    g.tri([(9, 26), (7, 29), (11, 28)], 'R'); g.tri([(23, 26), (25, 29), (21, 28)], 'R')
    g.ell(16, 13, 9.5, 9.5, 'a', shade='b', sk=.5); g.ell(16, 13, 7, 7, 'A')
    star(g, 16, 13.5, 6.5, 2.8, 'a', shade='b')
    g.put(14, 10, 'c')
    g.outline(); die_cut(g)
    return g

def sticker_streak():
    g = G(32, 32)
    # flame (consecutive days) with a tiny calendar tally
    g.ell(16, 19, 8, 8, 'r', shade='R', sk=.55)
    g.tri([(16, 3), (8, 17), (24, 17)], 'r'); g.tri([(22, 7), (19, 15), (25, 16)], 'r'); g.tri([(10, 8), (8, 16), (13, 15)], 'r')
    g.ell(16, 21, 5, 5.5, 'a'); g.tri([(16, 11), (12, 20), (20, 20)], 'a')
    g.ell(16, 23, 2.5, 3, 'A')
    g.put(12, 10, 'A'); g.put(11, 12, 'A')
    g.outline()
    # tally marks
    t = G(32, 32); t.rect(18, 22, 29, 29, 'c'); t.rect(18, 22, 29, 23, 'r')
    for x in (20, 22, 24, 26): t.rect(x, 25, x, 28, 'k')
    t.line(19, 28, 27, 25, 'k'); t.outline(); g.paste(t)
    die_cut(g)
    return g

def sticker_fed():
    g = G(32, 32)
    # bowl with fish + heart
    bowl = G(32, 32)
    bowl.ell(16, 21, 11, 3, 'q', shade='Q', sk=.3)
    bowl.tri([(5, 21), (27, 21), (16, 30)], 't'); bowl.rect(7, 21, 25, 26, 't'); bowl.rect(9, 27, 23, 28, 'T'); bowl.rect(7, 25, 25, 26, 'T')
    bowl.rect(13, 23, 19, 23, 'c'); bowl.put(14, 24, 'c'); bowl.put(18, 24, 'c')  # paw-ish mark
    bowl.ell(16, 20, 9, 1.5, 'Q')
    f = G(32, 32); fish(f, 7, 12)
    g.paste(f)
    bowl.outline(); g.paste(bowl)
    hh = G(32, 32); heart(hh, 21, 2); hh.outline(); g.paste(hh)
    die_cut(g)
    return g

# ---------------------------------------------------------------- bars (16 wide)
def bar_book_unit():
    g = G(16, 6)
    g.rect(0, 0, 15, 5, 'k')
    g.rect(1, 0, 14, 4, 'n'); g.rect(1, 0, 14, 0, 'm'); g.rect(12, 0, 14, 4, 'N')
    g.rect(3, 2, 10, 2, 'a'); g.put(3, 1, 'A')   # gilt band on the spine
    g.rect(1, 5, 14, 5, 'N')
    return g
def bar_book_cap():
    g = G(16, 4)
    g.rect(1, 0, 14, 0, 'k'); g.put(0, 1, 'k'); g.put(15, 1, 'k'); g.rect(0, 2, 0, 3, 'k'); g.rect(15, 2, 15, 3, 'k')
    g.rect(1, 1, 14, 3, 'c'); g.rect(1, 3, 14, 3, 'C'); g.rect(10, 1, 11, 3, 'r')  # pages + bookmark ribbon
    g.put(1, 1, 'C'); g.put(14, 1, 'C')
    return g
def bar_record_unit():
    g = G(16, 6)
    g.rect(0, 0, 15, 5, 'k')
    g.rect(1, 0, 14, 4, 'v'); g.rect(1, 1, 14, 1, 'Q'); g.put(3, 3, 'Q')   # groove shine
    g.rect(6, 2, 9, 3, 'a'); g.put(6, 2, 'A')  # label edge
    g.rect(1, 5, 14, 5, 'k')
    return g
def bar_record_cap():
    g = G(16, 4)
    g.rect(1, 0, 14, 0, 'k'); g.put(0, 1, 'k'); g.put(15, 1, 'k'); g.rect(0, 2, 0, 3, 'k'); g.rect(15, 2, 15, 3, 'k')
    g.rect(1, 1, 14, 3, 't'); g.rect(1, 3, 14, 3, 'T'); g.rect(4, 1, 11, 1, 'A'); g.rect(6, 2, 9, 2, 'c')  # sleeve top with title tag
    return g


# ---------------------------------------------------------------- todo page empty state 64x64
def pencil(g, x0, y, x1):
    """Horizontal pencil from x0 (tip) to x1 (eraser), 3px thick, centred on y."""
    g.rect(x0 + 4, y - 1, x1 - 4, y + 1, 'a'); g.rect(x0 + 4, y + 1, x1 - 4, y + 1, 'b'); g.rect(x0 + 4, y - 1, x1 - 4, y - 1, 'A')
    g.tri([(x0, y), (x0 + 4, y - 1), (x0 + 4, y + 1)], 'l'); g.put(x0, y, 'e'); g.put(x0 + 1, y, 'e')
    g.rect(x1 - 4, y - 1, x1 - 3, y + 1, 'Q'); g.put(x1 - 4, y - 1, 'q')
    g.rect(x1 - 2, y - 1, x1, y + 1, 'p'); g.rect(x1 - 2, y + 1, x1, y + 1, 'r')

def todo_empty():
    g = G()
    # blank notepad, spiral binding on top, faint empty rules and an unticked box
    pad = G()
    pad.rect(6, 31, 59, 61, 'C')            # back sheets peeking out
    pad.rect(4, 29, 57, 59, 'c'); pad.rect(4, 58, 57, 59, 'C')
    for y in (47, 52, 56): pad.rect(13, y, 53, y, 'C')
    pad.rect(10, 31, 10, 57, 'p')
    pad.outline(); g.paste(pad)
    for x in range(8, 56, 6):
        g.put(x, 28, 'H'); g.put(x, 29, 'h'); g.put(x + 1, 27, 'H'); g.put(x + 1, 30, 'j'); g.put(x + 2, 28, 'h'); g.put(x + 2, 29, 'j')
    g.rect(14, 50, 17, 50, 'Q'); g.rect(14, 53, 17, 53, 'Q'); g.rect(14, 50, 14, 53, 'Q'); g.rect(17, 50, 17, 53, 'Q')
    c = G()
    tail(c, [(47, 41), (52, 42), (55, 39), (56, 35)])
    c.ell(36, 38, 14, 5.5, 'f', shade='F', lit='L', sk=.45)
    for dx in (-3, 3, 8): c.rect(36 + dx, 32, 37 + dx, 34, 'F')
    for x0 in (14, 23): c.ell(x0, 42, 4, 2, 'l', shade='C', sk=.55); c.put(x0 - 2, 43, 'C'); c.put(x0, 43, 'C')
    head(c, 19, 29, eyes='happy', mouth='flat', ear='up')
    phones(c, 19, 29)
    c.outline(); g.paste(c)
    # pencil held crosswise in the mouth, tip poking out left, eraser right
    pc = G(); pencil(pc, 7, 34, 30); pc.outline(); g.paste(pc)
    sparkle(g, 47, 14); g.put(41, 20, 'z'); sparkle(g, 54, 23)
    return g

# ---------------------------------------------------------------- stickers 16x16 (narrow screens, sit on top of a bar)
def die_cut_sm(g):
    """1px paper border + 1px soft edge; the icon itself carries its own ink outline."""
    for col in ('c', 'C'):
        out = [row[:] for row in g.g]
        for y in range(g.h):
            for x in range(g.w):
                if g.g[y][x] is None and any(g.get(x + dx, y + dy) for dx, dy in ((1,0),(-1,0),(0,1),(0,-1))): out[y][x] = col
        g.g = out

def sticker_best_day_sm():
    g = G(16, 16)
    g.rect(5, 10, 6, 12, 'r'); g.rect(9, 10, 10, 12, 'r'); g.put(5, 12, 'R'); g.put(10, 12, 'R')
    g.ell(7.5, 6.5, 4.4, 4.4, 'b')
    for j, row in enumerate(['...X...', '..XXX..', 'XXXXXXX', '.XXXXX.', '..XXX..', '.XX.XX.']):
        for i, ch in enumerate(row):
            if ch == 'X': g.put(4 + i, 3 + j, 'A')
    g.put(7, 4, 'c')
    g.outline(); die_cut_sm(g)
    return g

def sticker_streak_sm():
    g = G(16, 16)
    g.ell(8, 9, 3.6, 3.4, 'r', shade='R', sk=.6); g.tri([(8, 2), (4.5, 8), (11.5, 8)], 'r'); g.put(11, 5, 'r'); g.put(11, 6, 'r')
    g.ell(8, 9.6, 1.8, 2.2, 'a'); g.put(8, 7, 'a'); g.put(8, 10, 'A')
    g.outline(); die_cut_sm(g)
    return g

def sticker_fed_sm():
    g = G(16, 16)
    f = G(16, 16)
    f.ell(6.5, 5, 2.8, 1.8, 's', shade='S', sk=.4); f.tri([(9, 5), (11.5, 3), (11.5, 7)], 's'); f.put(5, 4, 'e'); f.rect(5, 6, 7, 6, 'c')
    f.rect(3, 8, 12, 8, 'q'); f.rect(3, 9, 12, 10, 't'); f.rect(4, 11, 11, 11, 'T'); f.put(5, 9, 'c'); f.put(10, 9, 'p')
    f.outline(); g.paste(f)
    die_cut_sm(g)
    return g


# ---------------------------------------------------------------- music (mirrors the room cat's groove/listen in src/pet/cat-sprites.mjs)
def note8(g, x, y):
    for yy in range(y, y + 7): g.put(x + 3, yy, 'z')
    g.put(x + 4, y, 'z'); g.put(x + 5, y + 1, 'z'); g.put(x + 6, y + 2, 'z')
    g.rect(x, y + 6, x + 2, y + 8, 'z')

GROOVE = [  # head dx/dy, eyes, tail swing, note position: left, centre dip, right, centre dip
    dict(hdx=-3, hdy=0, eyes='happy', swing=-6, note=(4, 8)),
    dict(hdx=0, hdy=2, eyes='half', swing=0, note=(7, 4)),
    dict(hdx=3, hdy=0, eyes='happy', swing=6, note=(50, 6)),
    dict(hdx=0, hdy=2, eyes='half', swing=0, note=(47, 2)),
]
def sit_cat(hdx=0, hdy=0, eyes='half', swing=0, mouth='w', tail_up=0):
    g = G(); c = G()
    s = swing
    tail(c, [(44, 56), (50, 53), (53 + s * .3, 47 - tail_up), (54 + s * .7, 41 - tail_up), (52 + s, 36 - tail_up)])
    loaf(c, 32, 60, w=15, h=12)
    head(c, 32 + hdx, 33 + hdy, eyes=eyes, mouth=mouth, ear='up')
    phones(c, 32 + hdx, 33 + hdy)
    c.outline(); g.paste(c)
    shadow(g, 32, 61, 17)
    return g
def groove_frame(i):
    f = GROOVE[i]; g = sit_cat(f['hdx'], f['hdy'], f['eyes'], f['swing']); note8(g, *f['note']); return g
def cat_listen():
    g = sit_cat(0, 2, eyes='closed', mouth='w', tail_up=2)
    note8(g, 48, 4); return g

def save(g, name):
    os.makedirs(OUT, exist_ok=True); im = g.img(); im.save(f'{OUT}/{name}.png', optimize=True); return im

if __name__ == '__main__':
    poses = {n: save(f(), n) for n, f in [('cat-sleep-books', cat_sleep_books), ('cat-wait', cat_wait), ('cat-desk', cat_desk), ('cat-rub', cat_rub), ('cat-droopy', cat_droopy)]}
    frames = [eat_frame(i).img() for i in range(8)]
    sheet = Image.new('RGBA', (64 * 8, 64), (0, 0, 0, 0))
    for i, f in enumerate(frames): sheet.paste(f, (64 * i, 0))
    sheet.save(f'{OUT}/cat-eat.png', optimize=True)
    groove = [groove_frame(i).img() for i in range(4)]
    gs = Image.new('RGBA', (64 * 4, 64), (0, 0, 0, 0))
    for i, f in enumerate(groove): gs.paste(f, (64 * i, 0))
    gs.save(f'{OUT}/cat-groove.png', optimize=True)
    listen = save(cat_listen(), 'cat-listen')
    stick = {n: save(f(), n) for n, f in [('sticker-best-day', sticker_best_day), ('sticker-streak', sticker_streak), ('sticker-fed', sticker_fed)]}
    todo = save(todo_empty(), 'todo-empty')
    stick_sm = {n: save(f(), n) for n, f in [('sticker-best-day-sm', sticker_best_day_sm), ('sticker-streak-sm', sticker_streak_sm), ('sticker-fed-sm', sticker_fed_sm)]}
    bars = {n: save(f(), n) for n, f in [('bar-book', bar_book_unit), ('bar-book-cap', bar_book_cap), ('bar-record', bar_record_unit), ('bar-record-cap', bar_record_cap)]}

    # ---- 4x preview sheet on journal paper
    Z = 4; pad = 8
    W = (64 * 5 + pad * 6) * Z; H = (pad * 8 + 64 * 5 + 32 + 48) * Z
    bg = Image.new('RGBA', (W, H), rgba('c'))
    def put(im, x, y): bg.alpha_composite(im.resize((im.width * Z, im.height * Z), Image.NEAREST), (x * Z, y * Z))
    for i, n in enumerate(poses): put(poses[n], pad + i * (64 + pad), pad)
    for i, f in enumerate(frames): put(f, pad + (i % 4) * (64 + pad) + (i // 4) * 0, pad * 2 + 64 + (i // 4) * (64 + pad))
    for i, n in enumerate(stick): put(stick[n], pad + i * (32 + pad), pad * 4 + 192)
    # bars: stacks of differing height, books and records
    x0 = pad + 3 * (32 + pad) - 6
    for j, (u, cap) in enumerate([('bar-book', 'bar-book-cap'), ('bar-record', 'bar-record-cap')]):
        for k, n in enumerate([3, 6, 2, 8, 5, 4, 7] if j == 0 else [2, 5, 7, 3, 6, 8, 4]):
            bx = x0 + (j * 7 + k) * 17 + j * 6; base = pad * 5 + 192 + 32 + 48
            for m in range(n): put(bars[u], bx, base - 6 * (m + 1))
            put(bars[cap], bx, base - 6 * n - 4)
    # row 4: todo empty state + 16px stickers (1x-scale true size beside the 4x copy) atop bars
    ry = pad * 6 + 192 + 32 + 48
    put(todo, pad, ry)
    for i, n in enumerate(stick_sm):
        bx = pad + 64 + pad + i * 40; nb = [4, 6, 3][i]; put(stick_sm[n], bx, ry + 60 - 6 * nb - 4 - 14)
        for m in range(nb): put(bars['bar-book'], bx, ry + 60 - 6 * (m + 1))
        put(bars['bar-book-cap'], bx, ry + 60 - 6 * nb - 4)
        bg.alpha_composite(stick_sm[n], ((bx + 20) * Z, (ry + 48) * Z))   # true 1x size
    # row 5: groove loop + listen
    gy = ry + 64 + pad
    for i, f in enumerate(groove + [listen]): put(f, pad + i * (64 + pad), gy)
    os.makedirs('docs/media', exist_ok=True); bg.convert('RGB').save('docs/media/cat-mood-sheet.png', optimize=True)
    # ---- eat-cycle GIF (4x, 120ms/frame, longer hold on the satisfied end)
    gif = []
    for f in frames:
        b = Image.new('RGBA', (64, 64), rgba('c')); b.alpha_composite(f); gif.append(b.convert('RGB').resize((256, 256), Image.NEAREST))
    gif[0].save('docs/media/cat-eat.gif', save_all=True, append_images=gif[1:], duration=[120] * 7 + [600], loop=0, disposal=2)
    gif = []
    for f in groove:
        b = Image.new('RGBA', (64, 64), rgba('c')); b.alpha_composite(f); gif.append(b.convert('RGB').resize((256, 256), Image.NEAREST))
    gif[0].save('docs/media/cat-groove.gif', save_all=True, append_images=gif[1:], duration=250, loop=0, disposal=2)  # 2 frames/beat at 120 BPM
    print('ok')
