# Draws the 小屋日记 pixel art from the --px-* palette (src/styles/tokens.css).
# Each sprite is drawn on an art-pixel grid and saved 4x nearest-scaled to public/journal/.
from PIL import Image
import random
S = 4
C = dict(ink='#3b2a20', paper='#fff7e6', paper2='#f6e8cc', paper3='#efdcb8', rule='#ead2a6',
         leather='#6b4224', leather_hi='#8a5a32', leather_lo='#4a2c17', shadow='#0d0805',
         amber='#e0ad69', amber_hi='#ffd99c', amber_lo='#a8743c', brass='#c9964f',
         orange='#d9853b', orange_lo='#a85f26', pink='#e89a8a', red='#b5523b', red_lo='#7f3426')
def img(w, h, rows=None, fill=None):
    im = Image.new('RGBA', (w, h), C[fill] if fill else (0, 0, 0, 0))
    if rows:
        key = {'.': None, 'k': 'ink', 'L': 'leather', 'H': 'leather_hi', 'D': 'leather_lo', 'b': 'brass', 'a': 'amber', 'A': 'amber_hi',
               'o': 'orange', 'O': 'orange_lo', 'p': 'pink', 'w': 'paper', 'r': 'red', 'R': 'red_lo', 's': 'shadow', 'g': 'paper3'}
        for y, row in enumerate(rows):
            for x, ch in enumerate(row):
                if key.get(ch): im.putpixel((x, y), Image.new('RGBA', (1, 1), C[key[ch]]).getpixel((0, 0)))
    return im
def save(im, name): im.resize((im.width * S, im.height * S), Image.NEAREST).save(f'public/journal/{name}.png', optimize=True)

# Cover frame: 12x12, 4-px corners (9-slice), leather with a brass corner cap and stitching.
frame = img(12, 12, [
 'sDDDDDDDDDDs',
 'DbbHHHHHHbbD',
 'DbAHLLLLHAbD',
 'DHHLaLLaLHHD',
 'DHLaLLLLaLHD',
 'DHLLLLLLLLHD',
 'DHLLLLLLLLHD',
 'DHLaLLLLaLHD',
 'DHHLaLLaLHHD',
 'DbAHLLLLHAbD',
 'DbbHHHHHHbbD',
 'sDDDDDDDDDDs'])
save(frame, 'frame')

# Paper: 32x32 tile, warm cream with sparse aged flecks (seeded, tiles seamlessly).
random.seed(7); paper = img(32, 32, fill='paper')
for _ in range(46):
    x, y = random.randrange(32), random.randrange(32)
    paper.putpixel((x, y), Image.new('RGBA', (1, 1), C[random.choice(['paper2', 'paper2', 'paper3'])]).getpixel((0, 0)))
save(paper, 'paper')

# Spine: 8x6 repeat-y strip, shaded gutter with a cross stitch every 6 px.
spine = img(8, 6, [
 'DLHaaHLD',
 'DLHAAHLD',
 'DLHaaHLD',
 'DLHLLHLD',
 'DLHLLHLD',
 'DLHLLHLD'])
save(spine, 'spine')

# Ribbon: 10x24 bookmark with a notched tail.
rib = ['ORRRRRRRRO'] + ['ROrrrrrrOR'] * 18 + ['ROrrrrrrOR', 'Rrrr..rrrR', 'Rrr....rrR', 'Rr......rR', 'R........R']
rib = [r.replace('O', 'R') if i else r for i, r in enumerate(rib)]
save(img(10, 24, rib), 'ribbon')

# Postcard: 64x40, cream with a stamp box, postmark rings and address lines.
card = img(64, 40, fill='paper')
px = lambda x, y, c: card.putpixel((x, y), Image.new('RGBA', (1, 1), C[c]).getpixel((0, 0)))
for x in range(64): px(x, 0, 'paper3'); px(x, 39, 'paper3')
for y in range(40): px(0, y, 'paper3'); px(63, y, 'paper3')
for x in range(50, 60):
    for y in range(4, 16): px(x, y, 'amber_hi' if 51 <= x <= 58 and 5 <= y <= 14 else 'red')
for x in range(52, 58):
    for y in range(7, 12): px(x, y, 'amber')
for x in range(36, 60, 2): px(x, 26, 'rule'); px(x, 31, 'rule')
for a in range(0, 360, 20):
    import math
    px(int(46 + 5 * math.cos(math.radians(a))), int(12 + 5 * math.sin(math.radians(a))), 'amber_lo')
save(card, 'card')

# Cat doodle: 12x12 orange cat with headphones, ink outline.
doodle = img(12, 12, [
 '.k........k.',
 'kok......kok',
 'kook....kook',
 'koookkkkoook',
 'kooooooooook',
 'kokwkoookwok',
 'kokkkoookkok',
 'koooopppooo.',
 '.kooookooook',
 '.koOOooOOok.',
 '..koooooook.',
 '...kkkkkkk..'])
save(doodle, 'doodle')
print('ok')
