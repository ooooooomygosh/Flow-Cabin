import React, { useEffect, useRef, useState } from 'react';
import { Application, Assets, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
// Pixi's static shader/uniform paths preserve the native shell's no-eval CSP.
import 'pixi.js/unsafe-eval';
import PixelCat from '../pet/PixelCat';
import { selectedPack, PACK_CHANGED } from '../pet/imported-pack.mjs';
import { currentBeat } from '../player/beat-clock.mjs';
import { bounds } from './layout.mjs';
import { artTheme, PET_ART_IDS, petArtSpec, roomArtSpec, roomPetPose } from './room-art.mjs';

async function manifest(url) {
  const response = await fetch(url);
  if (!response.ok) throw Error('素材清单无法加载。');
  return response.json();
}
function framedTextures(atlas, frames, trim = false) {
  let pixels, width;
  if (trim) {
    const source = atlas.source.resource, canvas = document.createElement('canvas');
    canvas.width = width = source.width; canvas.height = source.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(source, 0, 0);
    pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  }
  return Object.fromEntries(Object.entries(frames).map(([name, [x, y, w, h]]) => {
    if (trim) {
      let left = x + w, top = y + h, right = x - 1, bottom = y - 1;
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
        if (pixels[(yy * width + xx) * 4 + 3] < 64) continue;
        left = Math.min(left, xx); right = Math.max(right, xx); top = Math.min(top, yy); bottom = Math.max(bottom, yy);
      }
      if (right < left || bottom < top) throw Error('家具图集含有空白裁切。');
      [x, y, w, h] = [left, top, right - left + 1, bottom - top + 1];
    }
    return [name, new Texture({ source: atlas.source, frame: new Rectangle(x, y, w, h) })];
  }));
}
const release = textures => Object.values(textures || {}).forEach(texture => texture.destroy());

export default function RoomCanvas({ layout, petId, selected, playing = false, dim = false, focus = false, reduced = false }) {
  const host = useRef(null), application = useRef(null);
  const [failed, setFailed] = useState(false), [ready, setReady] = useState(false), [art, setArt] = useState(null), [petArt, setPetArt] = useState(null), [artError, setArtError] = useState(false);
  const [pack, setPack] = useState(() => selectedPack()), [overlayPose, setOverlayPose] = useState('idle');
  useEffect(() => { const update = () => setPack(selectedPack()); window.addEventListener(PACK_CHANGED, update); window.addEventListener('storage', update); return () => { window.removeEventListener(PACK_CHANGED, update); window.removeEventListener('storage', update); }; }, []);
  const theme = artTheme(layout.theme), id = PET_ART_IDS.includes(petId) ? petId : 'cat';
  useEffect(() => {
    const app = new Application(); let disposed = false, initialized = false;
    app.init({ width: 1200, height: 640, preference: 'webgl', antialias: false, resolution: 1, autoStart: false, backgroundAlpha: 0 }).then(() => {
      initialized = true;
      if (disposed) { app.destroy(true, { children: true }); return; }
      application.current = app; host.current.appendChild(app.canvas); app.ticker.maxFPS = 30;
      app.canvas.addEventListener('webglcontextlost', () => setFailed(true), { once: true }); setReady(true);
    }).catch(() => { if (!disposed) setFailed(true); });
    return () => { disposed = true; application.current = null; if (initialized) app.destroy(true, { children: true }); };
  }, []);
  useEffect(() => {
    let disposed = false, objects; setArtError(false);
    (async () => {
      const spec = roomArtSpec(theme, await manifest(`/room-scenes/modular/${theme}/asset-manifest.json`));
      const [shell, atlas, extras] = await Promise.all([Assets.load(spec.shell), Assets.load(spec.furniture), spec.extras ? Assets.load(spec.extras.url) : null]);
      if (disposed) return;
      shell.source.scaleMode = atlas.source.scaleMode = 'nearest';
      objects = framedTextures(atlas, spec.frames, true);
      if (extras) { extras.source.scaleMode = 'nearest'; Object.assign(objects, framedTextures(extras, spec.extras.frames, true)); }
      setArt({ theme, shell, objects });
    })().catch(() => { if (!disposed) setArtError(true); });
    return () => { disposed = true; release(objects); };
  }, [theme]);
  useEffect(() => {
    let disposed = false, poses; setPetArt(null);
    (async () => {
      const spec = petArtSpec(id, await manifest(`/pet-art/v2/${id}/manifest.json`));
      const atlas = await Assets.load(spec.atlas); if (disposed) return;
      atlas.source.scaleMode = 'nearest'; poses = framedTextures(atlas, spec.frames); setPetArt({ id, poses });
    })().catch(() => { /* The original pixel pet remains a usable fallback. */ });
    return () => { disposed = true; release(poses); };
  }, [id]);
  useEffect(() => {
    const app = application.current; if (!ready || !app || failed || art?.theme !== theme) return;
    app.stage.removeChildren().forEach(child => child.destroy({ children: true }));
    const stage = app.stage, shell = new Sprite(art.shell); shell.width = 1200; shell.height = 640; stage.addChild(shell);
    for (const item of [...layout.items].sort((a, b) => (a.y + bounds(a).h) - (b.y + bounds(b).h))) {
      const { x, y, w, h } = bounds(item), texture = art.objects[item.type];
      if (!texture) continue;
      const sprite = new Sprite(texture); sprite.anchor.set(.5, 1); sprite.scale.set(Math.min(w / texture.width, h / texture.height)); sprite.position.set(x + w / 2, y + h);
      if (item.rotation === 90) { sprite.anchor.set(.5); sprite.rotation = Math.PI / 2; sprite.scale.set(Math.min(h / texture.width, w / texture.height)); sprite.position.set(x + w / 2, y + h / 2); }
      if (['deck', 'notes', 'tea', 'lamp', 'books', 'plant', 'bed'].includes(item.type)) stage.addChild(new Graphics().ellipse(x + w / 2, y + h - 1, w * .35, 3).fill({ color: 0x160d07, alpha: .3 }));
      stage.addChild(sprite);
      if (item.id === selected) stage.addChild(new Graphics().rect(x - 3, y - 3, w + 6, h + 6).stroke({ color: 0xffdf9c, width: 2 }));
    }
    const home = layout.items.find(i => i.type === 'bed') || { x: 880, y: 536 };
    const initialPose = roomPetPose({ playing, focus, beat: currentBeat(), reduced, now: Date.now(), origin: Date.now() });
    if (host.current) host.current.dataset.petPose = initialPose;
    setOverlayPose(initialPose);
    const petTexture = petArt?.id === id ? petArt.poses[initialPose] : Texture.EMPTY;
    const pet = new Sprite(petTexture), size = Math.min(96 / petTexture.width, 96 / petTexture.height);
    pet.visible = !pack;
    pet.anchor.set(.5, 1); pet.position.set(home.x + 72, home.y + 70); pet.scale.set(size); stage.addChild(pet);
    if (dim) stage.addChild(new Graphics().rect(0, 0, 1200, 640).fill({ color: 0x111124, alpha: .35 }));
    const started = performance.now();
    const animate = () => {
      const now = Date.now(), beat = currentBeat(), elapsed = (performance.now() - started) / 1000;
      const pose = roomPetPose({ playing, focus, beat, now, origin: Date.now() - (performance.now() - started), reduced });
      if (host.current) host.current.dataset.petPose = pose;
      if (pack) setOverlayPose(previous => previous === pose ? previous : pose);
      const texture = petArt?.id === id ? petArt.poses[pose] : Texture.EMPTY;
      if (pet.texture !== texture) pet.texture = texture;
      const scale = Math.min(96 / texture.width, 96 / texture.height);
      const phase = pose === 'groove' ? Math.sin((now - beat.beatAt) / (60000 / beat.bpm) * Math.PI * 2) : 0;
      pet.y = home.y + 70 + (pose === 'groove' ? Math.round(phase * 2) : Math.round(Math.sin(elapsed * 1.4)) * .5);
      pet.rotation = phase * .025;
      pet.scale.set(scale, scale * (1 + Math.sin(elapsed * 1.5) * .006));
    };
    app.ticker.add(animate);
    const visibility = () => { if (document.hidden || reduced) { app.stop(); pet.position.y = home.y + 70; pet.scale.set(size); if (!document.hidden) app.render(); } else app.start(); };
    document.addEventListener('visibilitychange', visibility); visibility(); app.render();
    return () => { document.removeEventListener('visibilitychange', visibility); if (application.current !== app) { return; } app.stop(); app.ticker.remove(animate); app.stage.removeChildren().forEach(child => child.destroy({ children: true })); };
  }, [ready, layout, id, selected, dim, focus, playing, failed, art, petArt, theme, reduced, pack]);
  const home = layout.items.find(i => i.type === 'bed') || { x: 880, y: 536 };
  const loading = art?.theme !== theme;
  return <div ref={host} className="room2-canvas" aria-hidden="true" data-art-theme={art?.theme} data-pet-art={petArt?.id} data-art-ready={ready && !loading && !failed && !artError ? 'true' : 'false'}>
    {pack && !loading && <div className="room2-imported-pet" style={{ left: home.x + 24, top: home.y - 26 }}><PixelCat petId={petId} pose={focus ? 'focus' : overlayPose} reduceMotion={reduced}/></div>}
    {(failed || artError || loading) && <div className="room2-fallback"><span>{failed || artError ? '小屋画面暂时无法加载；布置面板中的家具列表仍可操作。' : '正在点亮小屋…'}</span></div>}
  </div>;
}
