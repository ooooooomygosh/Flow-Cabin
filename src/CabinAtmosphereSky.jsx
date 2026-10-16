import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { subscribeSky } from './sky-clock.mjs';
import { landTint, skyColors, skyVariables } from './sky-model.mjs';
import { timeOfDay } from './room-ambience.mjs';
import { createTimeline, effectiveWeather, layersAt, overcastOf, retarget, settled, weatherLayers } from './sky-weather.mjs';
import { CELL, bodies, paintSky, paintWeather, skyPalette, weatherFps, windowMasks } from './sky-paint.mjs';
import { createAtmosphereLoop } from './cabin-atmosphere.mjs';
import { frameClock, onBackgroundChange, onOcclusionChange } from './frame-clock.mjs';
import { onReducedMotionChange } from './motion-preference.mjs';
import { performanceLevel, onPerformanceChange } from './perf-profile.mjs';

// The room's sky: one minute clock (sky-clock.mjs) → sun-altitude colours as CSS variables on
// the scene (registered with @property, so CSS eases them) + the effective weather (real
// weather when the desktop shell reports it, else the equipped 窗景).
export function useSky(manualWeather, hour) {
  const [snapshot, setSnapshot] = useState(null), [ready, setReady] = useState(false);
  useEffect(() => subscribeSky(setSnapshot), []);
  // The first colours apply without easing (no 3 s night→day fade on every launch): the
  // transition switches on two frames after they are in place.
  useEffect(() => {
    if (!snapshot || ready) return undefined;
    let id = requestAnimationFrame(() => { id = requestAnimationFrame(() => setReady(true)); });
    return () => cancelAnimationFrame(id);
  }, [snapshot, ready]);
  const sky = useMemo(() => {
    const weather = effectiveWeather(manualWeather, snapshot?.real);
    if (!snapshot) return { weather, bucket: timeOfDay(hour ?? new Date().getHours()), vars: {}, state: null, colors: null };
    const colors = skyColors(snapshot.state, overcastOf(weatherLayers(weather)));
    return { weather, bucket: hour === undefined ? snapshot.state.bucket : timeOfDay(hour), vars: skyVariables(colors), state: snapshot.state, colors };
  }, [snapshot, manualWeather, hour]);
  return ready ? { ...sky, ready } : sky;
}

const place = ([x, y, w, h]) => ({ left: `${x / 1448 * 100}%`, top: `${y / 1086 * 100}%`, width: `${w / 1448 * 100}%`, height: `${h / 1086 * 100}%` });
// Cross-fades survive a scene switch: the timeline is module state keyed on absolute time.
let timeline = null;
const NIGHT_SKY = { altitude: -20, rising: false, azimuth: 0 };
// The art under each window, sampled once at canvas resolution (1 px per 4 art px): opaque
// pixels inside the glass are painted land / sea (they take the land tint); Moonlit Study keeps
// its painted sky and its weather falls only on the dark-blue night pixels.
function sampleArt(src, panes) {
  return new Promise((resolve) => {
    const image = new Image(); image.onerror = () => resolve();
    image.onload = () => {
      for (const { win, mask } of panes) {
        const canvas = document.createElement('canvas'); canvas.width = mask.width; canvas.height = mask.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true }); if (!ctx) continue;
        ctx.imageSmoothingEnabled = false;
        const [x, y] = win.box; ctx.drawImage(image, x, y, mask.width * CELL, mask.height * CELL, 0, 0, mask.width, mask.height);
        const data = ctx.getImageData(0, 0, mask.width, mask.height).data;
        mask.land = new Uint8Array(mask.front.length);
        for (let i = 0; i < mask.front.length; i++) {
          const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
          if (win.mask === 'night') mask.front[i] = b > r + 12 && b >= g && r + g + b < 330 ? 1 : 0;
          else mask.land[i] = mask.front[i] && data[i * 4 + 3] > 200 ? 1 : 0;
        }
      }
      resolve();
    };
    image.src = src;
  });
}
function paintLand(ctx, image, mask, hex) {
  if (!ctx || !image || !mask.land) return;
  const data = image.data, r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  for (let i = 0; i < mask.land.length; i++) { const o = i * 4; if (mask.land[i]) { data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255; } else data[o + 3] = 0; }
  ctx.putImageData(image, 0, 0);
}

// `instant`: until the sky is live (first frames after launch) a weather change applies
// without the 30 s cross-fade, so a reported real weather does not fade in on every start.
function CabinAtmosphereSky({ windows, art, weather, state, colors, instant = false, children }) {
  const root = useRef(null), backs = useRef([]), fronts = useRef([]), lands = useRef([]);
  const live = useRef({}), changed = useRef(null); live.current = { weather, state, colors };
  const [motion, setMotion] = useState('loading');
  useEffect(() => {
    const now = Date.now();
    timeline = timeline && !instant ? retarget(timeline, weather, now) : createTimeline(weather, now);
    changed.current?.();
  }, [weather.kind, weather.intensity, weather.wind]);
  useEffect(() => {
    let disposed = false, reduced = false, background = frameClock().paused, occluded = false, mode = '', rate = 0;
    const panes = windows.map((win) => ({ win, mask: windowMasks(win) }));
    const contexts = panes.map((_, i) => ({ back: backs.current[i]?.getContext('2d'), front: fronts.current[i]?.getContext('2d'), land: lands.current[i]?.getContext('2d') }));
    const images = panes.map(({ mask }, i) => ({ back: contexts[i].back?.createImageData(mask.width, mask.height), front: contexts[i].front?.createImageData(mask.width, mask.height), land: contexts[i].land?.createImageData(mask.width, mask.height) }));
    // Land tint follows the minute sky, not the frame loop.
    const tint = () => { const { state, colors } = live.current; if (!state || !colors) return; panes.forEach(({ win, mask }, i) => paintLand(contexts[i].land, images[i].land, mask, landTint(state, colors, win.painted === 'night' ? .08 : 1))); };
    const draw = () => {
      if (disposed || !timeline) return;
      const { state, colors } = live.current; if (!state || !colors) return;
      const at = Date.now(), layers = layersAt(timeline, at), seconds = reduced ? 0 : at / 1000;
      const sky = layers.starry > .5 ? { ...state, ...NIGHT_SKY, moon: { ...state.moon, altitude: 40 }, stars: 1 } : { ...state, stars: colors.stars };
      const pal = skyPalette(layers.starry > .5 ? { ...colors, top: '#0b1030', horizon: '#1a2244', light: 0 } : colors, layers);
      panes.forEach(({ win, mask }, i) => {
        const { back, front } = contexts[i], image = images[i];
        if (back && image.back) { paintSky(image.back.data, mask, { layers, pal, sky, seconds, reduced, bodies: win.sun ? bodies(sky, mask, win.horizon) : NO_BODIES }); back.putImageData(image.back, 0, 0); }
        if (front && image.front) { paintWeather(image.front.data, mask, { layers, pal, seconds, reduced }); front.putImageData(image.front, 0, 0); }
      });
      // Faster while a change cross-fades in; nothing at all once a still sky has settled.
      const need = reduced ? 0 : Math.max(weatherFps(layers, performanceLevel() === 'low'), settled(timeline, at) ? 0 : 4);
      if (need !== rate) { rate = need; queueMicrotask(update); }
    };
    const loop = createAtmosphereLoop({ draw, request: requestAnimationFrame, cancel: cancelAnimationFrame, now: () => performance.now(), fps: 12, clock: frameClock() });
    const update = () => {
      if (disposed) return;
      const next = background || occluded ? 'hidden' : reduced ? 'reduced' : rate ? 'running' : 'still';
      if (rate) loop.setFps(rate);
      if (next !== mode) { mode = next; loop.setMode(next === 'running' ? 'running' : 'hidden'); setMotion(next); if (next !== 'hidden') draw(); }
    };
    changed.current = () => { tint(); if (reduced && timeline) timeline = { ...timeline, at: Date.now() - 1e9 }; rate = -1; draw(); update(); };
    const offReduced = onReducedMotionChange((value) => { reduced = value; draw(); update(); });
    const offOcclusion = onOcclusionChange((value) => { occluded = value; update(); });
    const offBackground = onBackgroundChange((value) => { background = value; update(); });
    const offPerformance = onPerformanceChange(() => { rate = -1; draw(); });
    (art ? sampleArt(art, panes) : Promise.resolve()).then(() => { if (!disposed) { tint(); draw(); update(); } });
    return () => { disposed = true; changed.current = null; loop.dispose(); offReduced(); offOcclusion(); offBackground(); offPerformance(); };
  }, [windows, art]);
  // Minute ticks (sky colours, sun and moon) repaint the still frame too.
  useEffect(() => { changed.current?.(); }, [state, colors]);
  return <>
    {windows.map((win, i) => win.sky === false ? null : <div key={`sky-${i}`} className="cabin-sky-window" style={{ ...place(win.box), '--sky-h': win.horizon ?? .7 }} aria-hidden="true">
      <canvas ref={(node) => { backs.current[i] = node; }} className="cabin-sky-canvas" width={Math.ceil(win.box[2] / CELL)} height={Math.ceil(win.box[3] / CELL)}/>
    </div>)}
    {children}
    {windows.map((win, i) => win.sky === false ? null : <canvas key={`land-${i}`} ref={(node) => { lands.current[i] = node; }} className="cabin-land-canvas" style={place(win.box)} width={Math.ceil(win.box[2] / CELL)} height={Math.ceil(win.box[3] / CELL)} aria-hidden="true"/>)}
    <div ref={root} className="cabin-window-weather" data-motion={motion} aria-hidden="true">
      {windows.map((win, i) => <canvas key={i} ref={(node) => { fronts.current[i] = node; }} className="cabin-weather-canvas" style={place(win.box)} width={Math.ceil(win.box[2] / CELL)} height={Math.ceil(win.box[3] / CELL)}/>)}
    </div>
  </>;
}
const NO_BODIES = { sun: { visible: false }, moon: { visible: false } };
export { skyVariables };
export default memo(CabinAtmosphereSky);
