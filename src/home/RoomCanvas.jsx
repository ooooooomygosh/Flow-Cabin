import React, { useEffect, useRef, useState } from 'react';
import { Application, Assets, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import 'pixi.js/unsafe-eval';
import { FURNITURE, bounds, project, petPath } from './spatial-layout.mjs';
import { currentBeat } from '../player/beat-clock.mjs';
import { useCabinRuntime } from '../runtime/CabinRuntime';
import PixelCat from '../pet/PixelCat';
import { createLivingPet, bindPetLife } from '../pet/living-pet.mjs';
import { useInputPresence } from '../pet/useInputPresence';
import { useLife } from './useLife';
import { useCatMotion } from '../pet/useCatMotion';
import { loadPetArt, loadPetAccessories, artFrame, artBeatFrame, MUSIC_ART_ACTIONS, drawPetArt } from '../pet/pet-art-v21.mjs';
import { roomSnapshot } from './room-snapshot.mjs';

const json = async url => { const r = await fetch(url); if (!r.ok) throw Error('小屋素材尚未加载完成。'); return r.json(); };
const leases = new Map();
async function lease(url) {
  let entry = leases.get(url);
  if (!entry) { entry = { refs: 0, used: Date.now(), promise: Assets.load(url) }; leases.set(url, entry); }
  entry.refs++; entry.used = Date.now();
  try { return await entry.promise; } catch (error) { entry.refs--; leases.delete(url); throw error; }
}
function release(url) {
  const entry = leases.get(url); if (entry) entry.refs = Math.max(0, entry.refs - 1);
  const unused = [...leases].filter(([, e]) => !e.refs).sort((a, b) => a[1].used - b[1].used);
  while (unused.length > 4) { const [key, value] = unused.shift(); leases.delete(key); value.promise.then(() => { if (!leases.has(key)) return Assets.unload(key); }).catch(() => {}); }
}

export default function RoomCanvas({ layout, selected, reduced, dim, active = true, onPetPosition }) {
  const { deck, focus, identity, sceneCapture } = useCabinRuntime();
  const motion = useCatMotion(reduced, !active), life = useLife(), input = useInputPresence(active);
  const living = useRef(createLivingPet()), importedHost = useRef(null);
  useEffect(() => bindPetLife(living.current), []);
  const host = useRef(null), fallbackHost = useRef(null), application = useRef(null), live = useRef(null), petPosition = useRef({ u: 640, v: 600 });
  const [importedPose,setImportedPose]=useState('idle');
  const [ready, setReady] = useState(false), [error, setError] = useState(''), [art, setArt] = useState(null), [petArt, setPetArt] = useState(null);
  const [rendererError, setRendererError] = useState(false);
  const playing = deck.audible, concentrating = focus.state.timer.phase === 'focus' && !focus.state.timer.paused;
  live.current = { playing, concentrating, identity, onPetPosition, life, input, quiet:focus.state.settings.quietMode };
  useEffect(() => {
    const app = new Application(); let disposed = false, initialized = false;
    app.init({ width: 1200, height: 800, preference: 'webgl', antialias: false, resolution: Math.min(2, devicePixelRatio || 1), backgroundAlpha: 0, autoStart: false }).then(() => {
      initialized = true; if (disposed) { app.destroy(true, { children: true }); return; }
      application.current = app; host.current.prepend(app.canvas); app.ticker.maxFPS = innerWidth < 700 ? 30 : 60; setReady(true);
    }).catch(() => !disposed && setRendererError(true));
    return () => { disposed = true; application.current = null; if (initialized) app.destroy(true, { children: true }); };
  }, []);
  useEffect(() => {
    let disposed = false; const owned = [], textures = [];
    const load = async url => { if (disposed) throw Error('disposed'); owned.push(url); const texture = await lease(url); if (disposed) throw Error('disposed'); return texture; };
    setError('');
    (async () => {
      const base = `/room-scenes/v21/furniture/${layout.theme}/`;
      const manifest = await json(base + 'manifest.json');
      const shell = await load(`/room-scenes/v21/${layout.theme}/shell.png`);
      const files = [...new Set(Object.values(manifest.frames).map(f => f.file))];
      const atlases = Object.fromEntries(await Promise.all(files.map(async file => [file, await load(base + file)])));
      if (disposed) return;
      const objects = {};
      for (const frame of Object.values(manifest.frames)) {
        if (!FURNITURE[frame.type] || !Array.isArray(frame.frame) || frame.frame.length !== 4) continue;
        const atlas = atlases[frame.file], [x, y, w, h] = frame.frame;
        if (![x, y, w, h].every(Number.isFinite) || x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > atlas.width || y + h > atlas.height) throw Error('家具裁切数据异常。');
        atlas.source.scaleMode = 'nearest';
        const texture = new Texture({ source: atlas.source, frame: new Rectangle(x, y, w, h) }); textures.push(texture);
        const facing = ['sw', 'nw', 'left'].includes(frame.facing) ? 'left' : 'right';
        objects[`${frame.type}:${facing}`] = texture;
      }
      shell.source.scaleMode = 'nearest'; setArt({ theme: layout.theme, shell, objects });
    })().catch(e => { if (!disposed) setError(e.message); });
    return () => { disposed = true; textures.forEach(t => t.destroy()); owned.forEach(release); };
  }, [layout.theme]);
  useEffect(() => {
    let disposed=false;
    Promise.all([loadPetArt(identity.builtinId), loadPetAccessories().catch(() => null)]).then(([body,gear]) => { if (!disposed) setPetArt({ id:identity.builtinId, body, gear }); }).catch(() => {});
    return () => { disposed=true; };
  }, [identity.builtinId]);
  useEffect(() => {
    if (art?.theme !== layout.theme || error) return;
    const snapshot = (includeImported = true) => {
      let pet = includeImported ? host.current.querySelector('.home-imported-pet canvas') : null;
      if (!identity.pack && petArt?.id === identity.builtinId) {
        pet = document.createElement('canvas'); pet.width = pet.height = 256;
        drawPetArt(pet.getContext('2d'), petArt.body, artFrame(petArt.body.manifest, importedPose, 0, true), identity.accessory, petArt.gear);
      }
      return roomSnapshot({ art, layout, dim, pet, petPosition: petPosition.current });
    };
    if (rendererError && fallbackHost.current) fallbackHost.current.replaceChildren(snapshot(false));
    return sceneCapture.register(() => {
      const app = application.current;
      if (!app || rendererError) return snapshot();
      app.render();
      const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 800;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#263529'; ctx.fillRect(0, 0, 1200, 800);
      ctx.drawImage(app.canvas, 0, 0, 1200, 800);
      const imported = host.current.querySelector('.home-imported-pet canvas');
      if (imported) { const p = project(petPosition.current); ctx.drawImage(imported, p.x - 43, p.y - 87, 87, 87); }
      return canvas;
    });
  }, [ready, art, layout, dim, error, rendererError, sceneCapture, petArt, identity.builtinId, identity.accessory, identity.pack, importedPose]);
  useEffect(() => {
    const app = application.current; if (!ready || !app || art?.theme !== layout.theme) return;
    app.stop(); app.stage.removeChildren().forEach(child => child.destroy({ children: true }));
    const shell = new Sprite(art.shell); shell.width = 1200; shell.height = 800; shell.tint = dim ? 0xc7ccd9 : 0xffffff; app.stage.addChild(shell);
    const objects = new Container(); objects.sortableChildren = true; app.stage.addChild(objects);
    for (const item of layout.items) {
      const rect = bounds(item), point = project(item), spec = FURNITURE[item.type];
      const texture = art.objects[`${item.type}:${item.facing}`] || art.objects[`${item.type}:right`];
      if (!texture) continue;
      const group = new Container(); group.zIndex = item.u + item.v + (item.z ? 20 : 0);
      if (item.mount === 'floor') group.addChild(new Graphics().ellipse(point.x, point.y - 2, spec.w * .32, 7).fill({ color: 0x181209, alpha: .18 }));
      const sprite = new Sprite(texture); sprite.anchor.set(.5, 1); sprite.scale.set(Math.min(rect.w / texture.width, rect.h / texture.height)); sprite.position.set(point.x, point.y); sprite.tint = dim ? 0xcbd0dc : 0xffffff; group.addChild(sprite);
      if (item.id === selected) group.addChild(new Graphics().roundRect(rect.x - 4, rect.y - 4, rect.w + 8, rect.h + 8, 8).stroke({ color: 0xffe8b9, width: 1.5, alpha: .8 }));
      objects.addChild(group);
    }
    const petCanvas = document.createElement('canvas'); petCanvas.width = petCanvas.height = 256;
    const petContext = petCanvas.getContext('2d'), petTexture = Texture.from(petCanvas); petTexture.source.scaleMode = 'nearest';
    const pet = new Sprite(petTexture); pet.anchor.set(.5, 1); pet.visible = !identity.pack; objects.addChild(pet);
    let path = [], previousTarget = '', travel = 0, lastOverlay = 0, lastFrame = '', facing = 'right';  const started = Date.now();
    const animate = ticker => {
      const state = live.current, now = Date.now();
      const home = layout.items.find(i => i.type === 'bed') || { u: 640, v: 620 };
      const destination = (state.life.resting ? home : state.concentrating ? layout.items.find(i => i.type === 'desk') : state.playing ? layout.items.find(i => i.type === 'deck') : home) || home;
      const target = destination === home ? home : { u: Math.min(740, destination.u + 130), v: Math.min(740, destination.v + 110) };
      const targetKey = `${target.u}:${target.v}`;
      if (targetKey !== previousTarget) { path = petPath(layout, petPosition.current, target); previousTarget = targetKey; travel = 0; }
      if (reduced && path.length) { petPosition.current = path.at(-1); path = []; }
      if (path.length) {
        const next = path[0], pos = petPosition.current, distance = Math.hypot(next.u - pos.u, next.v - pos.v), amount = Math.min(distance, Math.min(ticker?.deltaMS || 16, 50) * .06);
        if (distance <= amount) { petPosition.current = next; path.shift(); } else petPosition.current = { u: pos.u + (next.u - pos.u) / distance * amount, v: pos.v + (next.v - pos.v) / distance * amount };
        if(distance>0) { const dx=(next.u-pos.u)-(next.v-pos.v);if(dx)facing=dx<0?'left':'right'; }
        travel += amount;
      }
      const beat = currentBeat();
      const behaviour = living.current.resolve({ now, focus:state.concentrating, resting:state.life.resting, playing:state.playing, synced:beat.known && beat.detected, reduced, walking:!!path.length, facing, input:state.input.active ? state.input.type : '', quiet:state.quiet });
      const pose = behaviour.pose;
      if(state.identity.pack) setImportedPose(previous=>previous===pose?previous:pose);
      if (petArt?.id === state.identity.builtinId) {
        const sample = (!reduced && !state.quiet && state.playing && MUSIC_ART_ACTIONS.includes(pose) ? artBeatFrame(petArt.body.manifest, now, beat) : null) || artFrame(petArt.body.manifest, pose, behaviour.elapsed, reduced);
        const frameKey = `${sample.key}:${state.identity.accessory}`;
        if (lastFrame !== frameKey) { drawPetArt(petContext, petArt.body, sample, state.identity.accessory, petArt.gear); petTexture.source.update(); lastFrame = frameKey; }
      }
      const pulse = behaviour.music ? Math.max(0, Math.cos((now - beat.beatAt) * Math.PI * 2 / (60000 / beat.bpm))) * .012 : 0;
      pet.scale.set((facing==='left'?-104:104) / 256, 104 / 256 * (1 - pulse));
      const point = project(petPosition.current);
      if (importedHost.current) { importedHost.current.style.left = `${point.x - 43}px`; importedHost.current.style.top = `${point.y - 87}px`; }
      pet.position.set(point.x, point.y - 7 - (path.length && !reduced ? Math.abs(Math.sin(travel / 8)) * 2 : 0)); pet.zIndex = petPosition.current.u + petPosition.current.v + 12;
      if (now - lastOverlay > 120) { state.onPetPosition?.({ ...point, pose, walking: !!path.length }); lastOverlay = now; }
    };
    app.ticker.add(animate);
    const visibility = () => { if (!motion.visible || reduced) { app.stop(); if (motion.visible) { animate(); app.render(); } } else app.start(); };
    document.addEventListener('visibilitychange', visibility); visibility(); animate(); app.render();
    return () => { document.removeEventListener('visibilitychange', visibility); if (application.current === app) { app.stop(); app.ticker.remove(animate); petTexture.destroy(true); app.stage.removeChildren().forEach(child => child.destroy({ children: true })); } };
  }, [ready, art, layout, selected, reduced, dim, petArt, identity.pack, motion.visible, reduced && playing, reduced && concentrating, reduced && life.resting]);
  return <div ref={host} className="home-canvas" aria-hidden="true" data-art-ready={(ready || rendererError) && art?.theme === layout.theme && !error} data-art-theme={art?.theme} data-renderer={rendererError ? 'canvas2d' : 'webgl'}>
    {rendererError && <div ref={fallbackHost} className="home-static-scene"/>}
    {identity.pack && <div ref={importedHost} className="home-imported-pet" style={{ left: project(petPosition.current).x - 43, top: project(petPosition.current).y - 87 }}><PixelCat petId={identity.builtinId} accessory={identity.accessory} pose={importedPose} reduceMotion={reduced}/></div>}
    {error && <span className="home-scene-error">{error}</span>}
  </div>;
}
