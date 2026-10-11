// Original scene-specific animation. Coordinates are in the unchanged 1448×1086 artwork.
export const ATMOSPHERE = {
  warm: { window: { x: 188, y: 170, width: 218, height: 286 }, panes: [[2, 3, 99, 109], [115, 3, 98, 109], [2, 124, 99, 156], [115, 124, 98, 156]], fire: { x: 1354, y: 538, width: 94, height: 180 }, opening: [[8, 8], [94, 24], [94, 171], [8, 155]] },
  pixel: { window: { x: 188, y: 170, width: 218, height: 286 }, panes: [[5, 7, 94, 102], [115, 7, 91, 102], [5, 126, 94, 157], [115, 126, 91, 157]], fire: { x: 1354, y: 538, width: 94, height: 192 }, opening: [[9, 13], [94, 18], [94, 188], [9, 172]] }
};
const fract = (value) => value - Math.floor(value);
const hash = (index) => fract(Math.sin(index * 127.1 + 311.7) * 43758.5453);
// Continuous value noise: no per-frame random jumps and no fixed repeating flicker cycle.
export function gentleNoise(time, seed = 1) {
  const cell = Math.floor(time), part = fract(time), weight = part * part * (3 - 2 * part);
  return hash(cell + seed * 101) * (1 - weight) + hash(cell + 1 + seed * 101) * weight;
}
export function atmosphereFrame(seconds, look = 'warm', weather = 'snow') {
  const geometry = ATMOSPHERE[look] || ATMOSPHERE.warm, { width, height } = geometry.window;
  const snow = weather === 'snow' ? Array.from({ length: 64 }, (_, i) => {
    const depth = hash(i + 9), speed = 9 + depth * 21;
    return { x: fract(hash(i + 21) + Math.sin(seconds * .21 + i) * .035 + seconds * (.003 + depth * .002)) * width,
      y: (hash(i + 61) * height + seconds * speed) % height, radius: .6 + depth * 1.25, alpha: .28 + depth * .48 };
  }) : [];
  const heat = gentleNoise(seconds * .23, 87) * .7 + gentleNoise(seconds * .51, 92) * .3;
  return { snow, light: .065 + heat * .045, surfaces: surfaceLighting(seconds, look) };
}
// A single bounded loop for both canvases and the composited light. Hidden windows
// retain their last frame; reduced motion draws a steady representative frame.
// `fps` caps the paint rate: pixel scenes move in 4 px steps, so 12 fps reads the same as 24.
export function createAtmosphereLoop({ draw, request, cancel, now, fps = 24 }) {
  let interval = 1000 / fps;
  let handle = null, disposed = false, mode = '', elapsed = 0, previous = 0, lastPaint = -Infinity;
  function tick(timestamp) {
    handle = null; if (disposed || mode !== 'running') return;
    elapsed += Math.min(100, Math.max(0, timestamp - previous)); previous = timestamp;
    if (timestamp - lastPaint >= interval - 1) { draw(elapsed / 1000); lastPaint = timestamp; }
    handle = request(tick);
  }
  return {
    setMode(next) {
      if (disposed || next === mode) return;
      if (handle !== null) cancel(handle); handle = null; mode = next;
      if (next === 'reduced') draw(0);
      if (next === 'running') { previous = now(); lastPaint = -Infinity; handle = request(tick); }
    },
    setFps(value) { interval = 1000 / Math.max(1, Math.min(60, Number(value) || 24)); },
    dispose() { disposed = true; if (handle !== null) cancel(handle); handle = null; }
  };
}

// Hand-authored 2.5D surface samples for this fixed camera. These are not inferred
// scene normals or ray-traced shadows: masks supply occlusion, normals supply incidence.
export const FIRE_LIGHT_SOURCE = { warm: [1409, 661, -30], pixel: [1409, 674, -30] };
// Visibility encodes conservative occlusion by the left jamb and raised hearth.
// Front-facing masonry, shelf wood and an assumed glass glint are not exposed.
export const MATERIAL_SURFACES = {
  stone: { position: [1325, 655, 0], normal: [1, 0, -.15], albedo: .72, roughness: .95, specular: .02, visibility: .8 },
  hearth: { position: [1375, 774, 65], normal: [0, -1, 0], albedo: .72, roughness: .95, specular: .02, visibility: .75 },
  floor: { position: [1220, 888, 150], normal: [0, -1, 0], albedo: .75, roughness: .8, specular: .025, visibility: .9, exposure: 6.5 },
  rug: { position: [1140, 988, 270], normal: [0, -1, 0], albedo: .3, roughness: 1, specular: 0, visibility: .85, exposure: 3.2 },
  wood: { position: [1118, 609, 0], normal: [0, 0, 1], albedo: .42, roughness: .78, specular: .025, visibility: 0 },
  metal: { position: [1358, 655, 0], normal: [1, 0, -.15], albedo: .18, roughness: .24, specular: .4, visibility: .7 },
  glass: { position: [1364, 584, 0], normal: [0, 0, 1], albedo: .035, roughness: .12, specular: .8, visibility: 0 }
};
const unit = (v) => { const length = Math.hypot(...v) || 1; return v.map((x) => x / length); };
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
export function materialResponse(surface, source, energy) {
  const delta = source.map((value, i) => value - surface.position[i]), distance = Math.hypot(...delta);
  const normal = unit(surface.normal), light = unit(delta), incidence = Math.max(0, dot(normal, light));
  if (!incidence) return 0;
  const view = unit([724 - surface.position[0], 543 - surface.position[1], 1600 - surface.position[2]]);
  const half = unit(light.map((value, i) => value + view[i]));
  const specular = Math.pow(Math.max(0, dot(normal, half)), 8 + (1 - surface.roughness) * 72) * surface.specular;
  return Math.min(.18, energy * (surface.visibility ?? 1) * (surface.exposure ?? 1) / (1 + (distance / 240) ** 2) * (surface.albedo * incidence + specular));
}
export function surfaceLighting(seconds, look = 'warm') {
  const heat = gentleNoise(seconds * .23, 87) * .7 + gentleNoise(seconds * .51, 92) * .3;
  const origin = FIRE_LIGHT_SOURCE[look] || FIRE_LIGHT_SOURCE.warm;
  const source = [origin[0] + (gentleNoise(seconds * .31, 21) - .5) * 4, origin[1] + (gentleNoise(seconds * .27, 62) - .5) * 6, origin[2]];
  return Object.fromEntries(Object.entries(MATERIAL_SURFACES).map(([name, surface]) => [name, materialResponse(surface, source, .12 + heat * .065)]));
}
