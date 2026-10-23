import { packFrame } from './imported-pack.mjs';

// Use the mandatory PNG fallback for a stable system/widget avatar, even when
// the room uses transparent video. The selected mirror and baseline still apply.
export async function importedAvatar(pack) {
  const image = new Image(); image.crossOrigin = 'anonymous';
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { image.onload = image.onerror = null; reject(Error('伙伴头像加载超时')); }, 10000);
    image.onload = () => { clearTimeout(timer); resolve(); };
    image.onerror = () => { clearTimeout(timer); reject(Error('伙伴头像无法读取')); };
    image.src = `/desktop-pets/packs/${pack.id}/atlas.png`;
  });
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d'), frame = packFrame(pack, 'idle', 0, true);
  context.imageSmoothingEnabled = false;
  if (pack.mirror) { context.translate(256, 0); context.scale(-1, 1); }
  context.drawImage(image, frame.x, frame.y, frame.width, frame.height, 0, -(pack.baseline || 0) * 256, 256, 256);
  return canvas.toDataURL('image/png').split(',')[1];
}
