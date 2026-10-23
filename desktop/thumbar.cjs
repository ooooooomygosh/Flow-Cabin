'use strict';
// Windows taskbar thumbnail buttons (上一首 / 播放·暂停 / 下一首) under the cabin's
// preview. The glyphs are 16 × 16 pixel bitmaps drawn here, so no image files ship.
// Pure parts (glyph bitmaps, button model) are tested; Electron objects are injected.
const GLYPHS = Object.freeze({
  previous: ['................', '................', '................', '...XX......XX...', '...XX....XXXX...', '...XX..XXXXXX...', '...XXXXXXXXXX...', '...XXXXXXXXXX...', '...XXXXXXXXXX...', '...XXXXXXXXXX...', '...XX..XXXXXX...', '...XX....XXXX...', '...XX......XX...', '................', '................', '................'],
  play: ['................', '................', '................', '....XX..........', '....XXXX........', '....XXXXXX......', '....XXXXXXXX....', '....XXXXXXXXXX..', '....XXXXXXXXXX..', '....XXXXXXXX....', '....XXXXXX......', '....XXXX........', '....XX..........', '................', '................', '................'],
  pause: ['................', '................', '................', '....XXX..XXX....', '....XXX..XXX....', '....XXX..XXX....', '....XXX..XXX....', '....XXX..XXX....', '....XXX..XXX....', '....XXX..XXX....', '....XXX..XXX....', '....XXX..XXX....', '....XXX..XXX....', '................', '................', '................'],
  next: ['................', '................', '................', '...XX......XX...', '...XXXX....XX...', '...XXXXXX..XX...', '...XXXXXXXXXX...', '...XXXXXXXXXX...', '...XXXXXXXXXX...', '...XXXXXXXXXX...', '...XXXXXX..XX...', '...XXXX....XX...', '...XX......XX...', '................', '................', '................']
});
// A 16 × 16 BGRA bitmap: cream glyph with a one-pixel dark outline (readable on light and dark taskbars).
function glyphBitmap(rows, { ink = [0xf3, 0xe7, 0xc8], edge = [0x1a, 0x10, 0x0a] } = {}) {
  const size = 16, buffer = Buffer.alloc(size * size * 4);
  const on = (x, y) => rows[y]?.[x] === 'X';
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const offset = (y * size + x) * 4, near = !on(x, y) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => on(x + dx, y + dy));
    const colour = on(x, y) ? ink : near ? edge : null;
    if (!colour) continue;
    buffer[offset] = colour[2]; buffer[offset + 1] = colour[1]; buffer[offset + 2] = colour[0]; buffer[offset + 3] = 255;
  }
  return buffer;
}
// The button list for a state: { playing, active }. `active` false greys them out.
function thumbarButtons({ playing = false, active = false } = {}) {
  const flags = active ? [] : ['disabled'];
  return [
    { id: 'previous', tooltip: '上一首', flags },
    { id: playing ? 'pause' : 'play', action: 'toggle', tooltip: playing ? '暂停' : '播放', flags },
    { id: 'next', tooltip: '下一首', flags }
  ].map((button) => ({ ...button, action: button.action || button.id }));
}
function createThumbar({ getWindow, nativeImage, player, platform = process.platform }) {
  const icons = new Map(), icon = (id) => { if (!icons.has(id)) icons.set(id, nativeImage.createFromBitmap(glyphBitmap(GLYPHS[id]), { width: 16, height: 16, scaleFactor: 1 })); return icons.get(id); };
  let key = '';
  return {
    update(state = {}) {
      if (platform !== 'win32') return false;
      const win = getWindow(); if (!win || win.isDestroyed()) return false;
      const next = `${Boolean(state.playing)}|${Boolean(state.active)}|${win.id}`;
      if (next === key) return false;
      key = next;
      try { return win.setThumbarButtons(thumbarButtons(state).map((button) => ({ tooltip: button.tooltip, icon: icon(button.id), flags: button.flags, click: () => player(button.action) }))); } catch { key = ''; return false; }
    },
    reset() { key = ''; }
  };
}
module.exports = { createThumbar, thumbarButtons, glyphBitmap, GLYPHS };
