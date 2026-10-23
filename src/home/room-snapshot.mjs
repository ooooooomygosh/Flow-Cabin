import { bounds, project, FURNITURE } from './spatial-layout.mjs';

// The same loaded atlas frames and spatial coordinates remain usable when the
// machine cannot create a WebGL context. No second set of scene assets is kept.
export function roomSnapshot({ art, layout, dim, pet, petPosition }) {
  const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 800;
  const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
  ctx.filter = dim ? 'brightness(.82)' : 'none';
  ctx.drawImage(art.shell.source.resource, 0, 0, 1200, 800);
  const layers = layout.items.map(item => ({ item, depth: item.u + item.v + (item.z ? 20 : 0) }));
  if (pet) layers.push({ pet, depth: petPosition.u + petPosition.v + 12 });
  layers.sort((a, b) => a.depth - b.depth);
  for (const layer of layers) {
    if (layer.pet) {
      const point = project(petPosition);
      ctx.drawImage(pet, point.x - 52, point.y - 111, 104, 104); continue;
    }
    const { item } = layer, texture = art.objects[`${item.type}:${item.facing}`] || art.objects[`${item.type}:right`];
    if (!texture) continue;
    const rect = bounds(item), point = project(item), frame = texture.frame;
    if (item.mount === 'floor') {
      ctx.fillStyle = '#1812092e'; ctx.beginPath(); ctx.ellipse(point.x, point.y - 2, FURNITURE[item.type].w * .32, 7, 0, 0, Math.PI * 2); ctx.fill();
    }
    const scale = Math.min(rect.w / frame.width, rect.h / frame.height), w = frame.width * scale, h = frame.height * scale;
    ctx.drawImage(texture.source.resource, frame.x, frame.y, frame.width, frame.height, point.x - w / 2, point.y - h, w, h);
  }
  return canvas;
}
