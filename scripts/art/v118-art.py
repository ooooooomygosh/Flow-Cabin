# v1.18 art: menu-bar / tray icons, cabin-letter stationery, and the v1.18 preview sheet + GIFs.
# Cat frames come from scripts/art/cat-mood.py (run it first). Run: python3 scripts/art/v118-art.py
import importlib.util, os
from PIL import Image, ImageDraw
spec = importlib.util.spec_from_file_location('catmood', os.path.join(os.path.dirname(__file__), 'cat-mood.py'))
cm = importlib.util.module_from_spec(spec); spec.loader.exec_module(cm)
G, rgba, heart, sparkle = cm.G, cm.rgba, cm.heart, cm.sparkle
TRAY = 'desktop/assets/tray'; JOURNAL = 'public/journal'

# ---------------------------------------------------------------- tray glyphs
# 16px masks, hand-placed; the 32px @2x is redrawn with ImageDraw so diagonals stay crisp.
G16 = {
 'play':  ['................','....#...........','....##..........','....###.........','....####........','....#####.......','....######......','....#######.....','....#######.....','....######......','....#####.......','....####........','....###.........','....##..........','....#...........','................'],
 'pause': ['................','................','...###....###...','...###....###...','...###....###...','...###....###...','...###....###...','...###....###...','...###....###...','...###....###...','...###....###...','...###....###...','...###....###...','...###....###...','................','................'],
 'focus': ['......####......','.......##.......','....########....','...##......##...','..##...#....##..','..#....#.....#..','.##....#.....##.','.#.....#......#.','.#.....###....#.','.#............#.','.##..........##.','..#..........#..','..##........##..','...##......##...','....########....','................'],
 'cat':   ['................','..#.........#...','..##.......##...','..###.....###...','..###########...','.#############..','.###..###..###..','.###..###..###..','.#############..','.######.######..','..###.....###...','...#########....','....#######.....','................','................','................'],
}
def mask16(name, colour=(0, 0, 0, 255)):
    im = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    for y, row in enumerate(G16[name]):
        for x, ch in enumerate(row):
            if ch == '#': im.putpixel((x, y), colour)
    return im
def mask32(name, colour=(0, 0, 0, 255)):
    im = Image.new('RGBA', (32, 32), (0, 0, 0, 0)); d = ImageDraw.Draw(im); c = colour
    if name == 'play': d.polygon([(9, 3), (9, 28), (26, 15.5)], fill=c)
    elif name == 'pause': d.rounded_rectangle([7, 5, 12, 26], 1, fill=c); d.rounded_rectangle([20, 5, 25, 26], 1, fill=c)
    elif name == 'focus':  # stopwatch with a single hand
        d.rectangle([12, 0, 19, 2], fill=c); d.rectangle([14, 2, 17, 5], fill=c)
        d.ellipse([3, 5, 28, 30], outline=c, width=3); d.rectangle([15, 10, 16, 18], fill=c); d.rectangle([15, 17, 21, 18], fill=c)
    elif name == 'cat':  # head with ears, eyes cut out
        d.polygon([(4, 2), (12, 9), (4, 13)], fill=c); d.polygon([(27, 2), (19, 9), (27, 13)], fill=c)
        d.ellipse([2, 7, 29, 27], fill=c)
        for ex in (9, 19): d.rectangle([ex, 13, ex + 3, 17], fill=(0, 0, 0, 0))
        d.polygon([(14, 20), (17, 20), (15.5, 22)], fill=(0, 0, 0, 0))
    return im
COLOUR = {'play': (127, 184, 168), 'pause': (224, 173, 105), 'focus': (181, 82, 59), 'cat': (232, 162, 90)}
def coloured(m, name):
    """Windows tray: the glyph in its accent colour with a 1px ink outline so it reads on any taskbar."""
    w = m.width; ink = (59, 42, 32, 255); out = Image.new('RGBA', m.size, (0, 0, 0, 0)); a = m.split()[3].load()
    for y in range(w):
        for x in range(w):
            if a[x, y]: out.putpixel((x, y), COLOUR[name] + (255,))
            elif any(0 <= x + dx < w and 0 <= y + dy < w and a[x + dx, y + dy] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))): out.putpixel((x, y), ink)
    return out
def write_tray():
    os.makedirs(TRAY, exist_ok=True); out = {}
    for n in G16:
        m16, m32 = mask16(n), mask32(n)
        m16.save(f'{TRAY}/trayTemplate-{n}.png'); m32.save(f'{TRAY}/trayTemplate-{n}@2x.png')
        c16, c32 = coloured(m16, n), coloured(m32, n)
        c32.save(f'{TRAY}/tray-{n}.png'); c16.save(f'{TRAY}/tray-{n}-16.png')
        c32.save(f'{TRAY}/tray-{n}.ico', sizes=[(16, 16), (32, 32)], append_images=[c16])
        out[n] = (m16, m32, c16, c32)
    return out

# ---------------------------------------------------------------- stationery
def envelope(open_=False):
    g = G(48, 32)
    g.rect(2, 6, 45, 29, 'c'); g.rect(2, 26, 45, 29, 'C')
    for i in range(12): g.put(2 + i, 29 - i // 1.4, 'C'); g.put(45 - i, 29 - i // 1.4, 'C')  # lower fold seams
    if open_:
        g.rect(7, 1, 40, 18, 'c'); g.rect(7, 1, 40, 1, 'C')      # letter peeking out
        for y in (5, 8, 11, 14): g.rect(11, y, 36 if y != 14 else 26, y, 't')
        heart(g, 31, 11, c='p', hi='c')
        g.tri([(2, 6), (45, 6), (23.5, 0)], 'C')                  # flap folded up behind
        g.rect(2, 16, 45, 29, 'c'); g.rect(2, 26, 45, 29, 'C')
        for i in range(12): g.put(2 + i, 16 + i // 1.4, 'C'); g.put(45 - i, 16 + i // 1.4, 'C')
    else:
        g.tri([(2, 6), (45, 6), (23.5, 20)], 'C'); g.tri([(4, 7), (43, 7), (23.5, 18)], 'c')
        g.ell(23.5, 19, 3.5, 3.5, 'r', shade='R', sk=.4); g.put(22, 17, 'A'); g.rect(23, 19, 24, 19, 'R')
        g.rect(36, 22, 42, 26, 'S'); g.rect(37, 23, 41, 25, 's'); g.put(39, 24, 'z')   # tiny stamp
    g.outline(); return g
def wax_seal():
    g = G(16, 16)
    for a in range(12):
        import math
        g.ell(7.5 + 5.5 * math.cos(a * math.pi / 6), 7.5 + 5.5 * math.sin(a * math.pi / 6), 1.6, 1.6, 'r')
    g.ell(7.5, 7.5, 5, 5, 'r', shade='R', lit='A', sk=.5); g.ell(7.5, 7.5, 3, 3, 'R')
    # paw print stamped into the wax
    g.ell(7.5, 9, 1.5, 1.2, 'r'); [g.put(x, 6, 'r') for x in (5, 7, 8, 10)]
    g.outline(); return g
def mailbox(flag_up):
    g = G(32, 32)
    g.rect(14, 20, 17, 31, 'n'); g.rect(16, 20, 17, 31, 'N')                         # post
    g.ell(15, 12, 11, 6, 'r', shade='R', sk=.4); g.rect(4, 12, 26, 20, 'r'); g.rect(4, 18, 26, 20, 'R')
    g.rect(4, 7, 5, 20, 'R'); g.ell(5, 14, 2, 5, 'R'); g.rect(3, 10, 5, 18, 'n'); g.rect(4, 11, 4, 17, 'm')  # door
    g.rect(10, 9, 22, 9, 'A')                                                        # highlight
    if flag_up: g.rect(25, 3, 26, 14, 'Q'); g.rect(26, 3, 30, 6, 'a'); g.rect(26, 6, 30, 6, 'b')
    else: g.rect(23, 14, 30, 15, 'Q'); g.rect(27, 15, 30, 19, 'a'); g.rect(27, 19, 30, 19, 'b')
    g.outline()
    if flag_up: sparkle(g, 29, 9) if False else None
    return g
def letter_paper():
    g = G(32, 32)
    g.rect(0, 0, 31, 31, 'c')
    for y in (7, 15, 23, 31): g.rect(0, y, 31, y, 'C')                  # ruled lines tile seamlessly
    for x, y in ((5, 3), (21, 19)): g.put(x, y, 'C'); g.put(x + 1, y + 1, 'C')  # paper fibres
    g.put(27, 11, 'A'); g.put(11, 27, 'A')
    return g
def write_stationery():
    os.makedirs(JOURNAL, exist_ok=True)
    env = [envelope(False).img(), envelope(True).img()]
    sh = Image.new('RGBA', (96, 32), (0, 0, 0, 0)); sh.paste(env[0], (0, 0)); sh.paste(env[1], (48, 0)); sh.save(f'{JOURNAL}/envelope.png', optimize=True)
    seal = wax_seal().img(); seal.save(f'{JOURNAL}/wax-seal.png', optimize=True)
    mb = [mailbox(False).img(), mailbox(True).img()]
    sh = Image.new('RGBA', (64, 32), (0, 0, 0, 0)); sh.paste(mb[0], (0, 0)); sh.paste(mb[1], (32, 0)); sh.save(f'{JOURNAL}/mailbox.png', optimize=True)
    paper = letter_paper().img(); paper.save(f'{JOURNAL}/letter-paper.png', optimize=True)
    return env, seal, mb, paper

if __name__ == '__main__':
    tray = write_tray(); env, seal, mb, paper = write_stationery()
    typing = [cm.typing_frame(i).img() for i in range(4)]; hop = [cm.hop_frame(i).img() for i in range(6)]; deliver = [cm.deliver_frame(i).img() for i in range(8)]
    Z, pad = 4, 8
    W = (pad + 8 * (64 + pad)) * Z; H = (pad + 3 * (64 + pad) + 64 + pad + 32 + pad) * Z
    bg = Image.new('RGBA', (W, H), rgba('c'))
    def put(im, x, y, z=Z): bg.alpha_composite(im.resize((im.width * z, im.height * z), Image.NEAREST), (x * Z, y * Z))
    for r, row in enumerate([typing, hop, deliver]):
        for i, f in enumerate(row): put(f, pad + i * (64 + pad), pad + r * (64 + pad))
    y = pad + 3 * (64 + pad)
    put(env[0], pad, y); put(env[1], pad + 56, y); put(seal, pad + 112, y + 8)
    put(mb[0], pad + 136, y); put(mb[1], pad + 176, y)
    tile = Image.new('RGBA', (96, 64)); [tile.paste(paper, (x, yy)) for x in (0, 32, 64) for yy in (0, 32)]; put(tile, pad + 216, y)
    # tray icons: template on light + dark menu-bar strips, Windows colour on a taskbar strip
    ty = y + 64 + pad; x = pad
    for strip, mode in (((236, 236, 236), 'light'), ((40, 40, 44), 'dark'), ((32, 52, 82), 'win')):
        bg.paste(strip + (255,), (x * Z, ty * Z, (x + 4 * 20 + 4) * Z, (ty + 24) * Z))
        for k, n in enumerate(tray):
            m16, m32, c16, c32 = tray[n]
            if mode == 'win': im = c32
            else: im = Image.new('RGBA', (32, 32)); im.paste((255, 255, 255, 255) if mode == 'dark' else (0, 0, 0, 255), mask=m32)
            bg.alpha_composite(im.resize((64, 64), Image.NEAREST), ((x + 4 + k * 20) * Z, (ty + 4) * Z))
        x += 92
    for k, n in enumerate(tray): bg.alpha_composite(tray[n][0], ((x + 4 + k * 20) * Z, (ty + 8) * Z))   # true 16px size
    os.makedirs('docs/media', exist_ok=True); bg.convert('RGB').save('docs/media/v118-art-sheet.png', optimize=True)
    def gif(frames, name, dur):
        out = []
        for f in frames:
            b = Image.new('RGBA', (64, 64), rgba('c')); b.alpha_composite(f); out.append(b.convert('RGB').resize((256, 256), Image.NEAREST))
        out[0].save(f'docs/media/{name}.gif', save_all=True, append_images=out[1:], duration=dur, loop=0, disposal=2)
    gif(typing, 'cat-typing', 110); gif(hop, 'cat-hop', [160, 120, 110, 140, 120, 500]); gif(deliver, 'cat-deliver', [180] * 5 + [260, 260, 700])
    print('ok')
