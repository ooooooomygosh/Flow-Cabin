import React, { useEffect, useRef, useState } from 'react';
import { Application, Assets, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import { cachedPetFrame, drawPetFrame } from '../pet/pet-sprites.mjs';
import { bounds } from './layout.mjs';
import { artTheme, PET_ART_IDS, petArtSpec, roomArtSpec } from './room-art.mjs';

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
      const [shell, atlas] = await Promise.all([Assets.load(spec.shell), Assets.load(spec.furniture)]);
      if (disposed) return;
      shell.source.scaleMode = atlas.source.scaleMode = 'nearest';
      objects = framedTextures(atlas, spec.frames, true); setArt({ theme, shell, objects });
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
      const sprite = new Sprite(texture); sprite.anchor.set(.5, 1); sprite.scale.set(Math.min(w / texture.width, h / texture.height)); sprite.position.set(x + w / 2, y + h);
      if (item.rotation === 90) { sprite.anchor.set(.5); sprite.rotation = Math.PI / 2; sprite.scale.set(Math.min(h / texture.width, w / texture.height)); sprite.position.set(x + w / 2, y + h / 2); }
      if (['deck', 'notes', 'tea', 'lamp', 'books', 'plant', 'bed'].includes(item.type)) stage.addChild(new Graphics().ellipse(x + w / 2, y + h - 1, w * .35, 3).fill({ color: 0x160d07, alpha: .3 }));
      stage.addChild(sprite);
      if (item.id === selected) stage.addChild(new Graphics().rect(x - 3, y - 3, w + 6, h + 6).stroke({ color: 0xffdf9c, width: 2 }));
    }
    const home = layout.items.find(i => i.type === 'bed') || { x: 880, y: 536 };
    let originalPetTexture;
    const pose = focus ? 'focus' : playing ? 'listen' : 'idle';
    let petTexture = petArt?.id === id ? petArt.poses[pose] : null;
    if (!petTexture) {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
      drawPetFrame(canvas.getContext('2d'), cachedPetFrame(id, focus ? 'focus' : 'idle', 0, ''), id);
      originalPetTexture = petTexture = Texture.from(canvas); petTexture.source.scaleMode = 'nearest';
    }
    const pet = new Sprite(petTexture), size = Math.min(96 / petTexture.width, 96 / petTexture.height);
    pet.anchor.set(.5, 1); pet.position.set(home.x + 72, home.y + 70); pet.scale.set(size); stage.addChild(pet);
    if (dim) stage.addChild(new Graphics().rect(0, 0, 1200, 640).fill({ color: 0x111124, alpha: .35 }));
    const started = performance.now();
    const animate = () => {
      const elapsed = (performance.now() - started) / 1000;
      // Painted poses are not a generated walking animation. Keep motion subtle.
      pet.y = home.y + 70 + Math.round(Math.sin(elapsed * (playing ? 3 : 1.4))) * (playing ? 1 : .5);
      pet.scale.y = size * (1 + Math.sin(elapsed * 1.5) * .006);
    };
    app.ticker.add(animate);
    const visibility = () => { if (document.hidden || reduced) { app.stop(); pet.position.y = home.y + 70; pet.scale.set(size); if (!document.hidden) app.render(); } else app.start(); };
    document.addEventListener('visibilitychange', visibility); visibility(); app.render();
    return () => { document.removeEventListener('visibilitychange', visibility); if (application.current !== app) { originalPetTexture?.destroy(true); return; } app.stop(); app.ticker.remove(animate); app.stage.removeChildren().forEach(child => child.destroy({ children: true })); originalPetTexture?.destroy(true); };
  }, [ready, layout, id, selected, dim, focus, playing, failed, art, petArt, theme, reduced]);
  const loading = art?.theme !== theme;
  return <div ref={host} className="room2-canvas" aria-hidden="true" data-art-theme={art?.theme} data-pet-art={petArt?.id} data-art-ready={ready && !loading && !failed && !artError ? 'true' : 'false'}>
    {(failed || artError || loading) && <div className="room2-fallback">{failed || artError ? '小屋画面暂时无法加载；下方家具列表仍可操作。' : '正在点亮小屋…'}</div>}
  </div>;
}
