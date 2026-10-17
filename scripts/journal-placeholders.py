# Generates PLACEHOLDER 1x pixel art for the 小屋日记 slots (docs/art-direction.md
# § 小屋日记 art slots). beauty's final art replaces these files 1:1 by name.
from PIL import Image, ImageDraw
import os
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'journal')
INK, FUR, FUR2, FURL, PINK, EYE = (59,42,32,255), (224,150,82,255), (184,110,56,255), (250,214,160,255), (232,140,140,255), (40,28,20,255)
def img(w, h): return Image.new('RGBA', (w, h), (0,0,0,0))
def px(d, pts, c):
  for x, y in pts: d.point((x, y), c)
def cat(d, ox, oy, eyes='open', ear=True, flat=False):
  # head 20x16 at ox,oy with outline
  w, h = 20, (13 if flat else 16)
  d.rectangle([ox, oy+2, ox+w-1, oy+h], fill=INK); d.rectangle([ox+1, oy+3, ox+w-2, oy+h-1], fill=FUR)
  if ear:
    for ex in (ox+1, ox+w-6):
      d.polygon([(ex, oy+3), (ex+2, oy-2), (ex+5, oy+3)], fill=INK); d.polygon([(ex+1, oy+3), (ex+2, oy), (ex+4, oy+3)], fill=FUR)
      d.point((ex+2, oy+1), PINK)
  d.rectangle([ox+6, oy+h-5, ox+13, oy+h-1], fill=FURL)
  ey = oy+7 if not flat else oy+6
  if eyes == 'open': d.rectangle([ox+5, ey, ox+6, ey+2], fill=EYE); d.rectangle([ox+13, ey, ox+14, ey+2], fill=EYE)
  else: d.line([ox+4, ey+1, ox+7, ey+1], fill=EYE); d.line([ox+12, ey+1, ox+15, ey+1], fill=EYE)
  d.point((ox+9, oy+h-5), PINK); d.point((ox+10, oy+h-5), PINK)
  px(d, [(ox+3, ey+3), (ox+16, ey+3)], (240,170,150,255))
def body(d, x0, y0, x1, y1):
  d.rectangle([x0, y0, x1, y1], fill=INK); d.rectangle([x0+1, y0+1, x1-1, y1-1], fill=FUR)
  for sx in range(x0+3, x1-2, 4): d.line([sx, y0+1, sx, y0+3], fill=FUR2)
  d.rectangle([x0+3, y1-4, x1-3, y1-1], fill=FURL)
def books(d, x, y, n, w=34):
  cols = [(150,70,60,255), (80,110,140,255), (100,130,80,255), (190,150,80,255)]
  for i in range(n):
    yy = y - i*6; c = cols[i % 4]; off = (i % 2) * 2
    d.rectangle([x+off, yy, x+off+w, yy+5], fill=INK); d.rectangle([x+off+1, yy+1, x+off+w-1, yy+4], fill=c)
    d.line([x+off+1, yy+1, x+off+w-1, yy+1], fill=tuple(min(255, v+40) for v in c[:3])+(255,)); d.line([x+off+w-4, yy+1, x+off+w-4, yy+4], fill=(240,220,170,255))
def save(im, name): im.save(os.path.join(OUT, name + '.png'))

# cat-sleep-books: curled asleep on a book stack
im = img(64, 64); d = ImageDraw.Draw(im); books(d, 14, 56, 4)
body(d, 18, 30, 50, 38); cat(d, 12, 22, eyes='closed', flat=True)
d.rectangle([44, 34, 54, 37], fill=INK); d.rectangle([45, 35, 53, 36], fill=FUR2)
px(d, [(40, 16), (41, 16), (41, 17), (40, 18), (41, 18), (46, 10), (47, 10), (47, 11), (46, 12), (47, 12)], INK)  # z z
save(im, 'cat-sleep-books')
# cat-wait: sitting upright, tail curled, looking at you
im = img(64, 64); d = ImageDraw.Draw(im)
d.ellipse([18, 34, 46, 62], fill=INK); d.ellipse([19, 35, 45, 61], fill=FUR); d.rectangle([26, 46, 38, 60], fill=FURL)
d.rectangle([24, 58, 29, 61], fill=FURL); d.rectangle([35, 58, 40, 61], fill=FURL)
d.rectangle([44, 52, 54, 55], fill=INK); d.rectangle([52, 44, 55, 55], fill=INK); d.rectangle([45, 53, 53, 54], fill=FUR2); d.rectangle([53, 45, 54, 54], fill=FUR2)
cat(d, 22, 18); save(im, 'cat-wait')
# cat-desk: loaf on the desk beside a mug
im = img(64, 64); d = ImageDraw.Draw(im)
d.rectangle([0, 52, 63, 55], fill=(120,80,50,255)); d.rectangle([0, 56, 63, 63], fill=(90,58,36,255)); d.line([0, 52, 63, 52], fill=(160,110,70,255))
body(d, 14, 38, 44, 51); cat(d, 30, 26)
d.rectangle([4, 42, 11, 51], fill=INK); d.rectangle([5, 43, 10, 50], fill=(240,230,210,255)); d.rectangle([11, 44, 13, 48], fill=INK)
px(d, [(7, 39), (8, 38), (7, 37), (8, 36)], (200,200,200,255)); save(im, 'cat-desk')
# cat-rub: leaning, eyes happy, hearts
im = img(64, 64); d = ImageDraw.Draw(im)
body(d, 16, 36, 48, 58); cat(d, 34, 22, eyes='closed')
d.rectangle([10, 30, 16, 33], fill=INK); d.rectangle([12, 28, 15, 31], fill=INK)
for hx, hy in ((14, 12), (24, 6)):
  d.rectangle([hx, hy, hx+1, hy+1], fill=PINK); d.rectangle([hx+3, hy, hx+4, hy+1], fill=PINK); d.rectangle([hx, hy+2, hx+4, hy+2], fill=PINK); d.rectangle([hx+1, hy+3, hx+3, hy+3], fill=PINK); d.point((hx+2, hy+4), PINK)
save(im, 'cat-rub')
# cat-droopy: flat on the floor, ears down, a little sigh
im = img(64, 64); d = ImageDraw.Draw(im)
body(d, 22, 48, 56, 58); cat(d, 6, 44, eyes='closed', ear=False, flat=True)
d.rectangle([6, 45, 10, 47], fill=INK); d.rectangle([21, 45, 25, 47], fill=INK)
px(d, [(30, 38), (31, 37), (32, 38), (33, 37)], (150,150,170,255)); save(im, 'cat-droopy')
# cat-eat: 8 frames x 64, bowl + head bob
im = img(64*8, 64); d = ImageDraw.Draw(im)
for f in range(8):
  ox = f*64; bob = (0, 2, 4, 2, 0, 2, 4, 0)[f]
  d.rectangle([ox+30, 52, ox+52, 60], fill=INK); d.rectangle([ox+31, 53, ox+51, 59], fill=(110,150,190,255))
  fish = max(0, 3 - f//2)
  for i in range(fish): d.rectangle([ox+34+i*5, 50, ox+37+i*5, 52], fill=(170,190,210,255))
  body(d, ox+6, 40, ox+30, 58); cat(d, ox+22, 30+bob, eyes='closed' if f % 4 else 'open')
save(im, 'cat-eat')
# stickers 32x32
def sticker(name, draw):
  im = img(32, 32); d = ImageDraw.Draw(im)
  d.ellipse([1, 1, 30, 30], fill=(255,255,255,255)); d.ellipse([2, 2, 29, 29], fill=INK); d.ellipse([3, 3, 28, 28], fill=(255,240,200,255))
  draw(d); save(im, name)
def star(d):
  pts = [(16,5),(19,12),(27,12),(21,17),(23,25),(16,20),(9,25),(11,17),(5,12),(13,12)]
  d.polygon(pts, fill=(230,170,50,255), outline=INK)
sticker('sticker-best-day', star)
def flame(d):
  d.polygon([(16,5),(23,15),(23,22),(16,27),(9,22),(9,15),(13,11),(14,16)], fill=(230,110,60,255), outline=INK)
  d.polygon([(16,15),(19,20),(16,24),(13,20)], fill=(250,210,90,255))
sticker('sticker-streak', flame)
def fish(d):
  d.ellipse([6, 12, 21, 20], fill=(120,160,200,255), outline=INK); d.polygon([(21,16),(27,11),(27,21)], fill=(120,160,200,255), outline=INK); d.point((10, 15), INK)
sticker('sticker-fed', fish)
# bar units 16x6 + caps 16x4
im = img(16, 6); d = ImageDraw.Draw(im)
d.rectangle([0, 0, 15, 5], fill=INK); d.rectangle([1, 1, 14, 4], fill=(150,90,60,255)); d.line([1, 1, 14, 1], fill=(190,130,90,255)); d.line([3, 1, 3, 4], fill=(240,210,150,255)); d.line([12, 1, 12, 4], fill=(240,210,150,255)); save(im, 'bar-books')
im = img(16, 4); d = ImageDraw.Draw(im)
d.rectangle([1, 0, 14, 3], fill=INK); d.rectangle([2, 1, 13, 3], fill=(250,240,220,255)); d.line([4, 1, 11, 1], fill=(200,170,120,255)); save(im, 'bar-books-cap')
im = img(16, 6); d = ImageDraw.Draw(im)
d.rectangle([0, 0, 15, 5], fill=(30,22,18,255)); d.line([0, 2, 15, 2], fill=(70,56,48,255)); d.rectangle([6, 1, 9, 4], fill=(200,90,70,255)); save(im, 'bar-records')
im = img(16, 4); d = ImageDraw.Draw(im)
d.rectangle([0, 0, 15, 3], fill=INK); d.rectangle([1, 1, 14, 3], fill=(220,180,110,255)); d.line([1, 1, 14, 1], fill=(250,220,160,255)); save(im, 'bar-records-cap')
print('ok')
