// A light Canvas2D layer of room-specific particles behind lyrics. The owner drives it:
// `step(dtMs)` once per frame, `setEnergy(0..1)` from the playback signal, `pulse()` on
// a beat. Every kind caps its particle count, so a long song never grows the layer.
const KINDS = {
  // spawn: particles per second at energy 0 → 1; make(): a fresh particle in a unit box.
  pixels: { cap: 60, spawn: [6, 22], make: r => ({ x: r(), y: 1.05, vx: (r() - .5) * .02, vy: -(.05 + r() * .08), size: 2 + Math.floor(r() * 3), life: 4 + r() * 4, square: true }) },
  embers: { cap: 70, spawn: [8, 30], make: r => ({ x: .1 + r() * .8, y: 1.02, vx: (r() - .5) * .04, vy: -(.08 + r() * .12), size: 1 + r() * 2.2, life: 3 + r() * 3, flicker: true, color: 'glow' }) },
  ink: { cap: 26, spawn: [2, 7], make: r => ({ x: r(), y: r(), vx: (r() - .5) * .01, vy: (r() - .5) * .01, size: 18 + r() * 40, life: 6 + r() * 6, blot: true, color: 'glow' }) },
  fireflies: { cap: 40, spawn: [3, 12], make: r => ({ x: r(), y: .3 + r() * .7, vx: (r() - .5) * .03, vy: (r() - .5) * .03, size: 1.5 + r() * 2, life: 5 + r() * 5, wander: true, flicker: true, color: 'accent' }) },
  foam: { cap: 50, spawn: [5, 18], make: r => ({ x: r(), y: .85 + r() * .2, vx: .02 + r() * .04, vy: -(r() * .02), size: 1.5 + r() * 3.5, life: 3 + r() * 3, ring: true }) },
  stars: { cap: 60, spawn: [4, 14], make: r => ({ x: r(), y: r() * .9, vx: 0, vy: 0, size: .8 + r() * 1.8, life: 3 + r() * 5, twinkle: true, color: 'accent' }) },
  rain: { cap: 110, spawn: [30, 80], make: r => ({ x: r() * 1.2 - .1, y: -.05, vx: -.06, vy: .9 + r() * .5, size: 10 + r() * 16, life: 1.6, streak: true }) },
  petals: { cap: 36, spawn: [2, 9], make: r => ({ x: r(), y: -.05, vx: (r() - .3) * .05, vy: .05 + r() * .06, size: 3 + r() * 4, life: 9, petal: true, spin: r() * 6, color: 'glow' }) },
  none: { cap: 0, spawn: [0, 0], make: () => null }
};
export const PARTICLE_KINDS = Object.freeze(Object.keys(KINDS));

export function createParticles(canvas, { kind = 'none', colors = {}, random = Math.random } = {}) {
  const ctx = canvas?.getContext?.('2d');
  let spec = KINDS[kind] || KINDS.none, palette = colors, energy = 0, beat = 0, debt = 0, width = 0, height = 0, dpr = 1;
  const parts = [];
  const color = p => palette[p.color] || palette.fill || '#fff';
  const api = {
    setKind(next) { spec = KINDS[next] || KINDS.none; parts.length = 0; },
    setColors(next) { palette = next || {}; },
    setEnergy(value) { energy = Math.max(0, Math.min(1, Number(value) || 0)); },
    pulse(strength = 1) { beat = Math.min(1, beat + strength); },
    resize(w, h, ratio = 1) { width = w; height = h; dpr = ratio; if (canvas) { canvas.width = Math.max(1, Math.round(w * ratio)); canvas.height = Math.max(1, Math.round(h * ratio)); } },
    get count() { return parts.length; },
    step(dt = 16) {
      const seconds = Math.min(.1, Math.max(0, dt / 1000));
      beat = Math.max(0, beat - seconds * 2.5);
      // Spawn with fractional carry so low rates still appear.
      debt += (spec.spawn[0] + (spec.spawn[1] - spec.spawn[0]) * energy) * (1 + beat) * seconds;
      while (debt >= 1) { debt -= 1; if (parts.length < spec.cap) { const p = spec.make(random); if (p) { p.age = 0; p.seed = random() * 6.28; parts.push(p); } } }
      const speed = .6 + energy * .8 + beat * .6;
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]; p.age += seconds;
        if (p.wander) { p.vx += (random() - .5) * .02 * seconds; p.vy += (random() - .5) * .02 * seconds; }
        p.x += p.vx * seconds * speed; p.y += p.vy * seconds * speed;
        if (p.spin !== undefined) p.spin += seconds * 1.5;
        if (p.age > p.life || p.y < -.2 || p.y > 1.2 || p.x < -.2 || p.x > 1.3) parts.splice(i, 1);
      }
      if (ctx && width && height) api.draw();
      return parts.length;
    },
    draw() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
      for (const p of parts) {
        const t = p.age / p.life, fade = Math.min(1, t * 4) * Math.min(1, (1 - t) * 3);
        let alpha = fade * (.45 + energy * .4 + beat * .3);
        if (p.flicker) alpha *= .6 + .4 * Math.sin(p.age * 9 + p.seed);
        if (p.twinkle) alpha *= .35 + .65 * Math.abs(Math.sin(p.age * 2.4 + p.seed));
        ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
        const x = p.x * width, y = p.y * height, c = color(p);
        ctx.fillStyle = c; ctx.strokeStyle = c;
        if (p.square) ctx.fillRect(Math.round(x), Math.round(y), p.size, p.size);
        else if (p.streak) { ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + p.vx * p.size, y + p.size); ctx.stroke(); }
        else if (p.ring) { ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, p.size, 0, 6.283); ctx.stroke(); }
        else if (p.blot) { ctx.globalAlpha *= .12; ctx.beginPath(); ctx.arc(x, y, p.size * (.6 + t * .6), 0, 6.283); ctx.fill(); }
        else if (p.petal) { ctx.save(); ctx.translate(x, y); ctx.rotate(p.spin); ctx.beginPath(); ctx.ellipse(0, 0, p.size, p.size * .5, 0, 0, 6.283); ctx.fill(); ctx.restore(); }
        else { ctx.shadowColor = c; ctx.shadowBlur = 6; ctx.beginPath(); ctx.arc(x, y, p.size, 0, 6.283); ctx.fill(); ctx.shadowBlur = 0; }
      }
      ctx.globalAlpha = 1;
    },
    clear() { parts.length = 0; if (ctx && width) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); } }
  };
  return api;
}
