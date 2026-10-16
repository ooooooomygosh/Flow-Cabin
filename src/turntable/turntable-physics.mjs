// Geometry and physics of the close-up turntable. A real deck does not start or
// stop instantly: the platter spins up in about half a second and coasts down
// for longer; the tonearm lifts, swings, then lowers onto the groove, and the
// needle drifts inwards as the side plays. Pure and time-stepped so it is
// testable; the canvas only reads the state.
//
// The deck is drawn in 3/4 view: an undistorted top plane (circles stay
// circles, hit-testing stays simple) above a visible front face. All numbers
// are art pixels on the 288 × 196 canvas.
const rect = (x, y, w, h) => Object.freeze({ x, y, w, h });
export const GEOMETRY = Object.freeze({
  width: 288, height: 196,
  plinth: rect(8, 6, 264, 156),     // walnut top plane
  plate: rect(14, 12, 252, 144),    // dark deck plate inside the walnut frame
  front: rect(8, 162, 264, 18),     // front face: start/stop, strobe lamp, 33 / 45, nameplate, LED
  feet: Object.freeze([rect(18, 180, 20, 4), rect(242, 180, 20, 4)]),
  center: Object.freeze([90, 82]),
  platterRadius: 62, platterSide: 3, recordRadius: 57, labelRadius: 19,
  outerGroove: 54, innerGroove: 24,
  pivot: Object.freeze([212, 34]), armLength: 112, armRest: Object.freeze([207, 128]),
  // Hit areas (x, y, w, h) — the canvas paints its controls from the same rects.
  controls: Object.freeze({
    start: rect(17, 165, 32, 12),
    speed33: rect(72, 165, 18, 12),
    speed45: rect(92, 165, 18, 12),
    cue: rect(236, 66, 16, 30)
  })
});
export const RPM = Object.freeze({ 33: 100 / 3, 45: 45 });
// The label is pre-rendered at this many angles; the deck draws one frame per
// step, so its frame rate follows the platter: 17.8 fps at 33⅓, 24 fps at 45.
export const LABEL_FRAMES = 32;
export const labelFps = (speed) => (RPM[speed] || RPM[33]) / 60 * LABEL_FRAMES;
// Spin-up 0.6 s, coast 2.5 s; the cue lifts in ~3 frames, swings with an
// ease-in-out over 600 ms and lowers over 200 ms.
export const MOTION = Object.freeze({ spinUp: .6, coast: 2.5, lift: .15, swing: .6, lower: .2, touch: .07 });
const TAU = Math.PI * 2;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export const easeInOutCubic = (t) => t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
const inside = (r, [x, y], pad = 0) => x >= r.x - pad && x < r.x + r.w + pad && y >= r.y - pad && y < r.y + r.h + pad;

// Arm angle (radians, canvas coordinates) that puts the stylus on radius r.
export function grooveAngle(radius, geometry = GEOMETRY) {
  const [px, py] = geometry.pivot, [cx, cy] = geometry.center, L = geometry.armLength;
  const dx = px - cx, dy = py - cy, d = Math.hypot(dx, dy);
  const k = (radius * radius - d * d - L * L) / (2 * L);
  const phi = Math.atan2(dy, dx), spread = Math.acos(clamp(k / d, -1, 1));
  // Two solutions; the arm reaches the record from the pivot's lower-left.
  return phi + spread;
}
export function stylusPoint(angle, geometry = GEOMETRY) {
  return [geometry.pivot[0] + Math.cos(angle) * geometry.armLength, geometry.pivot[1] + Math.sin(angle) * geometry.armLength];
}
// At rest the arm lies in its clip along the plinth's right side, clear of the platter.
export const REST_ANGLE = Math.atan2(GEOMETRY.armRest[1] - GEOMETRY.pivot[1], GEOMETRY.armRest[0] - GEOMETRY.pivot[0]);
export const progressAngle = (progress, geometry = GEOMETRY) => grooveAngle(geometry.outerGroove - clamp(progress, 0, 1) * (geometry.outerGroove - geometry.innerGroove), geometry);
// Pointer → progress along the side (for dragging the arm to seek).
export function progressFromPoint([x, y], geometry = GEOMETRY) {
  const [cx, cy] = geometry.center, r = Math.hypot(x - cx, y - cy);
  return clamp((geometry.outerGroove - r) / (geometry.outerGroove - geometry.innerGroove), 0, 1);
}
// Is the point on the tonearm tube (between the pivot and the headshell)?
export function nearArm([x, y], angle, geometry = GEOMETRY) {
  const [ax, ay] = geometry.pivot, [bx, by] = stylusPoint(angle, geometry);
  const t = clamp(((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2), 0, 1.04);
  return Math.hypot(x - (ax + (bx - ax) * t), y - (ay + (by - ay) * t)) < 6 && t > .3;
}
// Which part of the deck a pointer is over: 'arm' | 'speed33' | 'speed45' | 'start' | 'record' | ''.
export function hitZone(point, { arm = REST_ANGLE, record = true } = {}, geometry = GEOMETRY) {
  const { controls, center: [cx, cy] } = geometry;
  if (record && nearArm(point, arm, geometry)) return 'arm';
  if (inside(controls.speed33, point, 1)) return 'speed33';
  if (inside(controls.speed45, point, 1)) return 'speed45';
  if (inside(controls.start, point, 1) || inside(controls.cue, point, 1)) return 'start';
  if (record && Math.hypot(point[0] - cx, point[1] - cy) < geometry.recordRadius) return 'record';
  return '';
}
// Time on the side → radius: track gaps are drawn where one song ends.
export function sideProgress(durations, trackIndex, position = 0) {
  const lengths = durations.map((value) => Math.max(0, Number(value) || 0));
  const known = lengths.every((value) => value > 0) && lengths.length > 0;
  const list = known ? lengths : lengths.map(() => 1);
  const total = list.reduce((sum, value) => sum + value, 0) || 1;
  const before = list.slice(0, trackIndex).reduce((sum, value) => sum + value, 0);
  const current = list[trackIndex] || 0;
  const within = known ? clamp(position * 1000, 0, current) : clamp(position / 240, 0, 1) * current;
  return { progress: clamp((before + within) / total, 0, 1), gaps: list.slice(0, -1).map((_, index) => list.slice(0, index + 1).reduce((sum, value) => sum + value, 0) / total) };
}
// Progress → which track and how far into it, for seeking by needle.
export function seekTarget(durations, progress) {
  const lengths = durations.map((value) => Math.max(0, Number(value) || 0));
  const known = lengths.length > 0 && lengths.every((value) => value > 0);
  const list = known ? lengths : lengths.map(() => 1);
  const total = list.reduce((sum, value) => sum + value, 0);
  if (!total) return { trackIndex: 0, seconds: 0 };
  let at = clamp(progress, 0, .9999) * total;
  for (let index = 0; index < list.length; index++) {
    if (at < list[index]) return { trackIndex: index, seconds: known ? at / 1000 : 0 };
    at -= list[index];
  }
  return { trackIndex: list.length - 1, seconds: 0 };
}
// Which pre-rendered label frame shows at platter angle `angle`.
export const labelFrame = (angle) => ((Math.floor(((angle % TAU) + TAU) % TAU / TAU * LABEL_FRAMES)) % LABEL_FRAMES + LABEL_FRAMES) % LABEL_FRAMES;

// Below this the arm follows the groove while lowered; above it, it cues (lift, swing, lower).
const CUE_DISTANCE = .02;
export function createDeckPhysics({ speed = 33 } = {}) {
  // strobe: perceived drift of the platter's strobe dots (still at the locked speed).
  const state = { angle: 0, omega: 0, arm: REST_ANGLE, lift: 1, speed, cue: 'rest', strobe: 0, touch: 0, swing: null };
  return {
    state,
    setSpeed(value) { state.speed = RPM[value] ? value : 33; },
    // motor: platter driven; armTarget: where the arm should be (null = rest); lowered: needle down.
    step(dt, { motor = false, armTarget = null, lowered = false, dragging = false } = {}) {
      const step = clamp(dt, 0, .1), nominal = RPM[state.speed] / 60 * TAU;
      // Motor torque is roughly constant (linear ramp); friction coasts the platter down.
      const goal = motor ? nominal : 0;
      if (state.omega < goal) state.omega = Math.min(goal, state.omega + nominal / MOTION.spinUp * step);
      else state.omega = Math.max(goal, state.omega - RPM[33] / 60 * TAU / (motor ? MOTION.spinUp : MOTION.coast) * step);
      state.angle = (state.angle + state.omega * step) % TAU;
      if (state.omega > 0) state.strobe = (state.strobe + (state.omega - nominal) * step) % TAU;
      const target = armTarget ?? REST_ANGLE;
      state.touch = Math.max(0, state.touch - step);
      const wasDown = state.lift <= 0;
      if (dragging) {
        state.swing = null; state.arm = target;
        state.lift = Math.min(1, state.lift + step / MOTION.lift);
      } else {
        if (!state.swing && Math.abs(target - state.arm) > CUE_DISTANCE) state.swing = { from: state.arm, t: 0 };
        if (state.swing) {
          // Lift first; swing only once clear of the record; then lower.
          if (state.lift < 1) state.lift = Math.min(1, state.lift + step / MOTION.lift);
          else {
            state.swing.t = Math.min(1, state.swing.t + step / MOTION.swing);
            state.arm = state.swing.from + (target - state.swing.from) * easeInOutCubic(state.swing.t);
            if (state.swing.t >= 1) { state.arm = target; state.swing = null; }
          }
        } else {
          // While lowered, the groove carries the arm in small steps.
          state.arm += clamp(target - state.arm, -.25 * step, .25 * step);
          const wantLift = lowered ? 0 : 1;
          state.lift = wantLift > state.lift ? Math.min(1, state.lift + step / MOTION.lift) : Math.max(0, state.lift - step / MOTION.lower);
        }
      }
      // Touch-down: the headshell dips a pixel for a frame.
      if (!wasDown && state.lift <= 0) state.touch = MOTION.touch;
      state.cue = state.lift > .95 ? (Math.abs(state.arm - REST_ANGLE) < .01 ? 'rest' : 'lifted') : state.lift < .05 ? 'playing' : 'moving';
      return state;
    }
  };
}
