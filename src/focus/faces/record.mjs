// 唱片计时: a round of focus is one side of a record. The tonearm sets down on
// the lead-in when the round starts and tracks inward to the run-out groove as
// it ends; a break is side B (moss label). The time sits on the brass plate.
// The record never rotates: the grooves are symmetric, the sheen is the lamp's.
// In the whole-window display the deck's cover sits on the label (RecordNowPlaying) and the arm follows the music.
import { SMALL, layoutText } from '../pixel-digits.mjs';
import { createRaster, fill, px, disc, line, text, mix } from '../raster.mjs';
import { panel, stud, led } from './kit.mjs';
import { phaseGlow } from '../face-palette.mjs';

const W = 108, H = 76, CX = 37, CY = 36, R = 31, LABEL = 10;
const PIVOT = [90, 15], ARM = 54, REST = [100, 44];
export const size = () => ({ w: W, h: H });
// Where the stylus sits: radius 28 (lead-in) → 13 (run-out), on the arm's circle.
export function stylus(progress) {
  const rr = 28 - Math.max(0, Math.min(1, progress)) * 15, [px0, py0] = PIVOT, dx = CX - px0, dy = CY - py0, d = Math.hypot(dx, dy);
  const a = (ARM * ARM - rr * rr + d * d) / (2 * d), h = Math.sqrt(Math.max(0, ARM * ARM - a * a));
  const mx = px0 + a * dx / d, my = py0 + a * dy / d;
  return [Math.round(mx + h * dy / d), Math.round(my - h * dx / d)];
}
export function paint(model, pal) {
  const r = createRaster(W, H), glow = phaseGlow(pal, model.phase), sideB = model.phase === 'shortBreak' || model.phase === 'longBreak';
  panel(r, 0, 0, W, H - 2, pal, { seed: 11 });
  for (const fx of [6, W - 14]) { fill(r, fx, H - 3, 8, 3, pal.outline); fill(r, fx + 1, H - 3, 6, 2, pal.wood[0]); }
  // platter: alloy rim with a lit upper-left edge, then the record
  disc(r, CX, CY, R + 1, R + 1, pal.outline);
  disc(r, CX, CY, R, R, pal.metal[1], (x, y) => { const l = -((x - CX) + (y - CY)); px(r, x, y, l > 18 ? pal.metal[3] : l > -12 ? pal.metal[2] : pal.metal[1]); return false; });
  disc(r, CX, CY, R - 2, R - 2, pal.vinyl[0], (x, y) => {
    const d = Math.hypot(x - CX, y - CY), ring = Math.round(d), ang = Math.atan2(y - CY, x - CX);
    // the lamp's sheen: two opposite sectors of brighter grooves
    const s = Math.abs(Math.sin(ang + Math.PI / 4)), sheen = s < .16 && ring > LABEL + 3 && ring < R - 4, inner = s < .07;
    const groove = ring % 2 === 0 && ring > LABEL + 1 && ring < R - 3;
    px(r, x, y, ring >= R - 3 ? (ring === R - 3 ? pal.vinyl[2] : pal.vinyl[1]) : sheen ? (groove ? (inner ? pal.vinyl[3] : pal.vinyl[2]) : pal.vinyl[1]) : groove ? pal.vinyl[1] : pal.vinyl[0]);
    return false;
  });
  // label: side A in the scene accent, side B moss; a rim and two printed lines
  const label = sideB ? pal.rest : pal.glow;
  disc(r, CX, CY, LABEL, LABEL, label[0]);
  disc(r, CX, CY, LABEL - 1, LABEL - 1, label[1], (x, y) => { if (-(x - CX) - (y - CY) > 9) { px(r, x, y, label[2]); return false; } return true; });
  fill(r, CX - 5, CY - 5, 10, 1, label[2]); fill(r, CX - 3, CY + 4, 6, 1, label[0]); fill(r, CX - 4, CY + 6, 8, 1, label[0]);
  fill(r, CX - 1, CY - 1, 2, 2, pal.outline); px(r, CX - 1, CY - 1, pal.metal[3]);
  // tonearm: pivot, counterweight, a 3-tone 2-px arm and the headshell
  // With the deck's music (whole-window display) the arm follows the music: down while it plays.
  const timing = model.mode === 'timer' && model.phase !== 'idle', down = model.music ? Boolean(model.music.playing) : timing, tip = down ? stylus(timing ? (model.progress ?? 0) : .35) : REST;
  stud(r, REST[0] - 2, REST[1] + 2, 4, 3, pal.metal);                              // arm rest post
  fill(r, PIVOT[0] + 3, PIVOT[1] - 9, 7, 6, pal.outline); fill(r, PIVOT[0] + 4, PIVOT[1] - 8, 5, 4, pal.metal[1]); fill(r, PIVOT[0] + 4, PIVOT[1] - 8, 5, 1, pal.metal[3]);
  line(r, PIVOT[0] + 5, PIVOT[1] - 4, PIVOT[0], PIVOT[1], pal.outline, 3);
  disc(r, PIVOT[0], PIVOT[1], 6, 6, pal.outline); disc(r, PIVOT[0], PIVOT[1], 5, 5, pal.metal[1], (x, y) => { if (-(x - PIVOT[0]) - (y - PIVOT[1]) > 3) { px(r, x, y, pal.metal[3]); return false; } return true; });
  disc(r, PIVOT[0], PIVOT[1], 2, 2, pal.metal[0]);
  line(r, PIVOT[0], PIVOT[1], tip[0], tip[1], pal.outline, 4);
  line(r, PIVOT[0], PIVOT[1], tip[0], tip[1], pal.metal[2], 2);
  line(r, PIVOT[0] - 1, PIVOT[1], tip[0] - 1, tip[1], pal.metal[3], 1);
  fill(r, tip[0] - 3, tip[1] - 2, 6, 5, pal.outline); fill(r, tip[0] - 2, tip[1] - 1, 4, 3, pal.metal[1]); fill(r, tip[0] - 2, tip[1] - 1, 4, 1, pal.metal[3]);
  // the time plate
  const value = model.groups.join(':') + (model.small ? ':' + model.small : ''), L = layoutText(value, SMALL), pw = Math.max(32, L.width + 8), x0 = W - 6 - pw, y0 = H - 21;
  fill(r, x0, y0, pw, 14, pal.outline); fill(r, x0 + 1, y0 + 1, pw - 2, 12, pal.night[0]);
  fill(r, x0 + 1, y0 + 12, pw - 2, 1, pal.night[2]);
  text(r, value, SMALL, x0 + Math.floor((pw - L.width) / 2), y0 + 4, model.paused ? glow[0] : glow[2]);
  led(r, 6, H - 12, glow, model.running, pal);
  fill(r, 12, H - 12, 6, 2, pal.night[0]); px(r, 12, H - 12, mix(pal.night[0], pal.metal[2], .5));
  return r;
}
export const face = { id: 'record', size, paint, steps: 60 };
