// Pixel digit faces shared by every focus display (专注画面), the zen clock,
// the desktop clock widget and the wallpaper. Glyphs are bitmaps ('#' = ink),
// drawn on whole art pixels; `cell` scales one glyph cell to n×n art pixels.
// Pure data + layout: the canvas faces (raster.mjs) and SVG both read it.
const font = (w, h, colonW, rows) => Object.freeze({ w, h, colonW, glyphs: Object.freeze(Object.fromEntries(Object.entries(rows).map(([ch, g]) => [ch, Object.freeze(g.split(' '))]))) });

// 7×11, 2-pixel strokes, chamfered corners: the flip cards, minimal and window faces.
export const BIG = font(7, 11, 2, {
  0: '.#####. ####### ##...## ##...## ##...## ##...## ##...## ##...## ##...## ####### .#####.',
  1: '..###.. .####.. ...##.. ...##.. ...##.. ...##.. ...##.. ...##.. ...##.. .###### .######',
  2: '.#####. ####### ##...## .....## ....### ..####. .###... ###.... ##..... ####### #######',
  3: '.#####. ####### ##...## .....## ..####. ..##### .....## .....## ##...## ####### .#####.',
  4: '##...## ##...## ##...## ##...## ##...## ####### .###### .....## .....## .....## .....##',
  5: '####### ####### ##..... ##..... ######. ####### .....## .....## ##...## ####### .#####.',
  6: '.#####. ####### ##..... ##..... ######. ####### ##...## ##...## ##...## ####### .#####.',
  7: '####### ####### .....## ....### ....##. ...###. ...##.. ..###.. ..##... ..##... ..##...',
  8: '.#####. ####### ##...## ##...## .#####. ####### ##...## ##...## ##...## ####### .#####.',
  9: '.#####. ####### ##...## ##...## ##...## ####### .###### .....## ##...## ####### .#####.',
  ':': '.. .. ## ## .. .. .. ## ## .. ..',
  '-': '....... ....... ....... ....... ....... .#####. .#####. ....... ....... ....... .......'
});
// 5×7, 1-pixel strokes: seconds cards, the record plate and small captions.
export const SMALL = font(5, 7, 1, {
  0: '.###. #...# #...# #...# #...# #...# .###.',
  1: '..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.',
  2: '.###. #...# ....# ...#. ..#.. .#... #####',
  3: '##### ...#. ..#.. ...#. ....# #...# .###.',
  4: '...#. ..##. .#.#. #..#. ##### ...#. ...#.',
  5: '##### #.... ####. ....# ....# #...# .###.',
  6: '..##. .#... #.... ####. #...# #...# .###.',
  7: '##### ....# ...#. ..#.. .#... .#... .#...',
  8: '.###. #...# #...# .###. #...# #...# .###.',
  9: '.###. #...# #...# .#### ....# ...#. .##..',
  ':': '. . # . # . .',
  '-': '..... ..... ..... .###. ..... ..... .....'
});
// 3×5: the tiniest readouts (thumbnails, pips).
export const TINY = font(3, 5, 1, {
  0: '### #.# #.# #.# ###', 1: '.#. ##. .#. .#. ###', 2: '### ..# ### #.. ###', 3: '### ..# ### ..# ###', 4: '#.# #.# ### ..# ..#',
  5: '### #.. ### ..# ###', 6: '### #.. ### #.# ###', 7: '### ..# .#. .#. .#.', 8: '### #.# ### #.# ###', 9: '### #.# ### ..# ###',
  ':': '. # . # .', '-': '... ... ### ... ...'
});
export const FONTS = Object.freeze({ big: BIG, small: SMALL, tiny: TINY });

export const glyph = (ch, f = BIG) => f.glyphs[ch] || null;
const advance = (ch, f, cell) => (ch === ':' ? f.colonW : f.w) * cell;
// Glyph positions (art px) for a string: unknown characters are skipped.
export function layoutText(text, f = BIG, { cell = 1, gap = cell } = {}) {
  const glyphs = [];
  let x = 0;
  for (const ch of String(text)) {
    if (!glyph(ch, f)) continue;
    if (glyphs.length) x += gap;
    glyphs.push({ ch, x, w: advance(ch, f, cell) }); x += advance(ch, f, cell);
  }
  return { width: x, height: f.h * cell, glyphs };
}
export const measure = (text, f = BIG, options) => layoutText(text, f, options).width;
// Ink cells of one glyph, in glyph cells.
export function glyphCells(ch, f = BIG) {
  const rows = glyph(ch, f), cells = [];
  rows?.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === '#') cells.push([x, y]); });
  return cells;
}
// Horizontal ink runs (art px) of a whole string: few rects, crisp edges.
export function textRuns(text, f = BIG, { cell = 1, gap = cell, x: left = 0, y: top = 0 } = {}) {
  const runs = [];
  for (const g of layoutText(text, f, { cell, gap }).glyphs) {
    glyph(g.ch, f).forEach((row, gy) => {
      let x = 0;
      while (x < row.length) {
        if (row[x] !== '#') { x++; continue; }
        let w = 1; while (row[x + w] === '#') w++;
        for (let dy = 0; dy < cell; dy++) runs.push({ x: left + g.x + x * cell, y: top + gy * cell + dy, w: w * cell });
        x += w;
      }
    });
  }
  return runs;
}
