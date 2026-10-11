import React, { useEffect, useId, useRef } from 'react';
import { ATMOSPHERE, atmosphereFrame, createAtmosphereLoop } from './cabin-atmosphere.mjs';
import './cabin-atmosphere.css';
import { createFirePainter } from './cabin-fire.mjs';
import { performanceLevel, onPerformanceChange } from './perf-profile.mjs';

const placement = ({ x, y, width, height }) => ({ left: `${x / 1448 * 100}%`, top: `${y / 1086 * 100}%`, width: `${width / 1448 * 100}%`, height: `${height / 1086 * 100}%` });
function prepare(canvas, box, pixel) {
  const ratio = pixel ? .25 : Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.ceil(box.width * ratio); canvas.height = Math.ceil(box.height * ratio);
  const ctx = canvas.getContext('2d'); if (!ctx) return null; ctx.imageSmoothingEnabled = !pixel; ctx.scale(canvas.width / box.width, canvas.height / box.height);
  return ctx;
}
// The clean background behind snow / fire is cut out of the 1448×1086 artwork
// once, at canvas resolution, instead of being resampled from it every frame.
function crop(clean, box, ctx) {
  const canvas = document.createElement('canvas'); canvas.width = ctx.canvas.width; canvas.height = ctx.canvas.height;
  const c = canvas.getContext('2d'); c.imageSmoothingEnabled = ctx.imageSmoothingEnabled; c.drawImage(clean, box.x, box.y, box.width, box.height, 0, 0, canvas.width, canvas.height);
  return canvas;
}
function paintSnow(ctx, geometry, flakes, pixel, backdrop) {
  const { width, height } = geometry.window; ctx.clearRect(0, 0, width, height); ctx.save(); ctx.beginPath();
  for (const pane of geometry.panes) ctx.rect(...pane); ctx.clip();
  ctx.drawImage(backdrop, 0, 0, width, height);
  for (const flake of flakes) {
    ctx.fillStyle = `rgba(226,239,255,${flake.alpha})`;
    if (pixel) ctx.fillRect(Math.round(flake.x / 4) * 4, Math.round(flake.y / 4) * 4, 4, 4);
    else { ctx.beginPath(); ctx.arc(flake.x, flake.y, flake.radius, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();
}
function paintFire(ctx, geometry, seconds, backdrop, renderFire) {
  const { width, height } = geometry.fire; ctx.clearRect(0, 0, width, height); ctx.save(); ctx.beginPath();
  geometry.opening.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.clip();
  ctx.drawImage(backdrop, 0, 0, width, height);
  renderFire(ctx, width, height, seconds);
  ctx.restore();
}
export default function CabinAtmosphere({ look, weather }) {
  const gradient = useId().replace(/:/g, '');
  const root = useRef(null), snow = useRef(null), fire = useRef(null), light = useRef(null);
  const geometry = ATMOSPHERE[look] || ATMOSPHERE.warm;
  useEffect(() => {
    const element = root.current, pixel = look === 'pixel' || look === 'warm'; // every room is pixel art now
    const snowContext = prepare(snow.current, geometry.window, pixel), fireContext = prepare(fire.current, geometry.fire, pixel);
    if (!snowContext || !fireContext) { element.dataset.motion = 'unavailable'; return; }
    const renderFire = createFirePainter(pixel);
    if (!renderFire) { element.dataset.motion = 'unavailable'; return; }
    const surfaces = [...light.current.querySelectorAll('[data-surface]')];
    const clean = new Image(); let ready = false, disposed = false, windowBackdrop = null, fireBackdrop = null, lastLight = 0;
    const shown = new Map();
    const draw = (seconds) => {
      if (!ready || disposed) return;
      const frame = atmosphereFrame(seconds, look, weather);
      paintSnow(snowContext, geometry, frame.snow, pixel, windowBackdrop); paintFire(fireContext, geometry, seconds, fireBackdrop, renderFire);
      // Firelight on the floor and hearth changes slowly; restyling these large
      // SVG shapes repaints half the room, so only visible changes are applied.
      if (seconds - lastLight < .16 && seconds > 0) return;
      lastLight = seconds;
      for (const surface of surfaces) {
        const value = Math.round(frame.surfaces[surface.dataset.surface] * 400) / 400;
        if (shown.get(surface) !== value) { shown.set(surface, value); surface.style.opacity = value; }
      }
    };
    draw(0);
    const rate = () => pixel ? (performanceLevel() === 'low' ? 8 : 12) : (performanceLevel() === 'low' ? 12 : 24);
    const loop = createAtmosphereLoop({ draw, request: requestAnimationFrame, cancel: cancelAnimationFrame, now: () => performance.now(), fps: rate() });
    const offPerformance = onPerformanceChange(() => loop.setFps(rate()));
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let focused = document.hasFocus();
    const update = (event) => {
      if (event?.type === 'blur') focused = false;
      if (event?.type === 'focus') focused = true;
      const reduced = media.matches || document.documentElement.dataset.desktopReduceMotion === 'true';
      if (!ready) return;
      // Main view keeps audio/timers unthrottled in Electron, so Page Visibility
      // can remain visible after minimize. Focus/blur is the renderer-only
      // fallback; an unfocusable wallpaper must keep animating independently.
      const background = document.hidden || (!window.albumWallpaper && !focused);
      const mode = background ? 'hidden' : reduced ? 'reduced' : 'running';
      element.dataset.motion = mode; loop.setMode(mode);
    };
    const observer = new MutationObserver(update); observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-desktop-reduce-motion'] });
    media.addEventListener('change', update); document.addEventListener('visibilitychange', update); window.addEventListener('focus', update); window.addEventListener('blur', update);
    element.dataset.motion = 'loading';
    clean.onload = () => { if (disposed) return; windowBackdrop = crop(clean, geometry.window, snowContext); fireBackdrop = crop(clean, geometry.fire, fireContext); ready = true; draw(0); update(); };
    clean.onerror = () => { if (!disposed) element.dataset.motion = 'unavailable'; };
    clean.src = `/room-scenes/${look}-cabin-clean.png`;
    return () => { disposed = true; clean.onload = clean.onerror = null; loop.dispose(); offPerformance(); observer.disconnect(); media.removeEventListener('change', update); document.removeEventListener('visibilitychange', update); window.removeEventListener('focus', update); window.removeEventListener('blur', update); };
  }, [look, weather, geometry]);
  return <div ref={root} className={`cabin-atmosphere atmosphere-${look}`} aria-hidden="true">
    {/* Edited illumination is sampled only on bare floor; all other original
        pixels (including furniture, rug, window and fire) remain untouched. */}
    <svg className="cabin-floor-base" viewBox="0 0 1448 1086" preserveAspectRatio="none">
      <defs>
        <path id={`${gradient}-floor-shape`} d="M278 776H428V779H1143L1179 833L1448 918V1086H1428L1318 938H287L282 908Z"/>
        <clipPath id={`${gradient}-floor-base`}><use href={`#${gradient}-floor-shape`}/></clipPath>
        <filter id={`${gradient}-floor-feather`}><feGaussianBlur stdDeviation={look === 'pixel' ? 1 : 3}/></filter>
        <mask id={`${gradient}-floor-mask`}><use href={`#${gradient}-floor-shape`} fill="white" filter={`url(#${gradient}-floor-feather)`}/></mask>
      </defs>
      <image href={`/room-scenes/${look}-cabin-floor.png`} width="1448" height="1086" clipPath={`url(#${gradient}-floor-base)`} mask={`url(#${gradient}-floor-mask)`}/>
    </svg>
    <canvas ref={snow} className="cabin-window-snow" style={placement(geometry.window)}/>
    <canvas ref={fire} className="cabin-hearth-fire" style={placement(geometry.fire)}/>
    <svg ref={light} className="cabin-hearth-light" viewBox="0 0 1448 1086" preserveAspectRatio="none">
      <defs>
        {/* One scene-coordinate light origin; never object-bounding-box centres. */}
        <radialGradient id={`${gradient}-near`} gradientUnits="userSpaceOnUse" cx="1409" cy={look === 'pixel' ? 674 : 661} r="240"><stop stopColor="#ffd69b"/><stop offset=".45" stopColor="#ffb56b" stopOpacity=".65"/><stop offset="1" stopColor="#ffb56b" stopOpacity="0"/></radialGradient>
        <radialGradient id={`${gradient}-floor`} gradientUnits="userSpaceOnUse" cx="1210" cy="868" r="470" gradientTransform="translate(1210 868) rotate(-12) scale(1 .55) translate(-1210 -868)"><stop stopColor="#ffcf91"/><stop offset=".25" stopColor="#ffc17a" stopOpacity=".82"/><stop offset=".65" stopColor="#ffb065" stopOpacity=".28"/><stop offset="1" stopColor="#ffb065" stopOpacity="0"/></radialGradient>
      </defs>
      {/* Only the inward-facing narrow reveal, not the front pillar or mantel. */}
      <path data-surface="stone" d="M1311 548L1330 543V744L1310 739Z" fill={`url(#${gradient}-near)`}/>
      {/* Top of the hearth receives downward light; its vertical fascia stays dark. */}
      <path data-surface="hearth" d={look === 'pixel' ? 'M1330 753L1448 784V808L1244 772Z' : 'M1330 743L1448 775V799L1244 764Z'} fill={`url(#${gradient}-near)`}/>
      {/* Opening projects forward/down-left in this camera. The near boundary
          follows the hearth foot; no light is painted across its fascia. */}
      <path data-surface="floor" d="M760 844L1140 827L1180 850L1448 936V1086H1428L1318 938H760Z" fill={`url(#${gradient}-floor)`}/>
      <path data-surface="rug" d="M875 941L1318 938L1428 1086H875Z" fill={`url(#${gradient}-floor)`}/>

      <path data-surface="metal" d={look === 'pixel' ? 'M1356 551V722L1448 747' : 'M1356 545V691L1448 716'} fill="none" stroke={`url(#${gradient}-near)`} strokeWidth="1.5"/>
    </svg>
  </div>;
}
