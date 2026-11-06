// How letters stand in the red post box and are flipped through, like the old Safari tabs.
// Ported from DEsk (https://github.com/fyzugx/DEsk, MIT, (c) 2026 The DEsk authors), docs/design.md 2.4.13
// and post.c / wm.c: the flip position `pos` follows a spring (W = 24, zeta = 0.72, the binder's),
// letter i sits at t = i - pos; behind the front (t > 0) a letter leans back 0.22 rad per step, the
// front one stands almost straight (0.04), and one that has been flipped (t < 0) falls forward to
// 1.30 rad and lies on the open door. Letters further than 1.6 in front or 4.6 behind are not drawn;
// the edge fades over 0.6. Pure functions: the DOM is touched in PostBox.jsx only.

export const POST = Object.freeze({
  W: 24, Z: 0.72,            // the flip spring (natural frequency in rad/s, damping ratio)
  STEP: 0.22, REST: 0.04,    // lean per step behind the front, lean of the front letter (rad)
  FALL: 1.30,                // rad a flipped letter falls forward
  FRONT: 1.6, BEHIND: 4.6, EDGE: 0.6, // how far in front / behind letters are drawn, and the fade at each end
  DIM: 0.075                 // each step further back is 7.5% darker
});

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// One frame of the flip spring (semi-implicit Euler in small steps, so a long frame cannot blow up).
export function stepSpring({ pos, vel }, target, dt, { W, Z } = POST) {
  let p = pos, v = vel, left = Math.min(Math.max(dt, 0), 0.1);
  while (left > 1e-9) {
    const h = Math.min(left, 1 / 240);
    v += (W * W * (target - p) - 2 * Z * W * v) * h;
    p += v * h;
    left -= h;
  }
  return { pos: p, vel: v };
}
export const settled = ({ pos, vel }, target) => Math.abs(target - pos) < 0.002 && Math.abs(vel) < 0.002;

// Where letter number `index` is when the flip position is `pos`.
//   lean:   radians, + leans the top away from you, - falls it forward onto the door
//   depth:  steps behind the front (0 at the front and for flipped letters)
//   dim:    0..1 how much darker than the front letter
//   opacity, fallen (true once it has been flipped over), z (stacking order: front on top)
export function poseAt(index, pos, cfg = POST) {
  const t = index - pos;
  const depth = Math.max(0, t);
  const fall = clamp(-t, 0, 1);
  const lean = t >= 0 ? cfg.REST + cfg.STEP * t : -cfg.FALL * fall + cfg.REST * (1 - fall);
  const opacity = clamp(Math.min((t + cfg.FRONT + cfg.EDGE) / cfg.EDGE, (cfg.BEHIND + cfg.EDGE - t) / cfg.EDGE), 0, 1);
  return { t, lean, depth, dim: clamp(cfg.DIM * depth, 0, 0.5), opacity, fallen: t < -0.5, z: 1000 - Math.round(t * 100) };
}

// Which index the spring should head for: the selected letter, else the front one; always inside the box.
export const flipTarget = (selectedIndex, count) => count > 0 ? clamp(Math.round(selectedIndex < 0 ? 0 : selectedIndex), 0, count - 1) : 0;

// A wheel notch (or an arrow key) turns one letter.
export const flipBy = (target, delta, count) => count > 0 ? clamp(target + Math.sign(delta), 0, count - 1) : 0;

// The words behind a letter's turned-down corner, as DEsk lists them (Read / Mark read / Discard, at most
// three): reading is always there, marking only while unread, and a discarded letter gets 放回 instead.
export function earActions(row) {
  const trashed = Boolean(row?.letter?.trashed);
  if (trashed) return [{ id: 'open', label: '阅读' }, { id: 'restore', label: '放回' }];
  return [{ id: 'open', label: '阅读' }, ...(row?.unread ? [{ id: 'read', label: '标为已读' }] : []), { id: 'trash', label: '丢掉' }];
}
