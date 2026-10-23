import { FURNITURE } from './layout.mjs';

export const ART_THEMES = Object.freeze(['pixel', 'warm', 'night-study', 'forest', 'seaside', 'starlight', 'rain-train', 'greenhouse']);
export const PET_ART_IDS = Object.freeze(['cat', 'chick', 'bunny', 'bear', 'fox']);
export const artTheme = id => ART_THEMES.includes(id) ? id : 'warm';

export function checkedFrame(frame, width, height) {
  if (!Array.isArray(frame) || frame.length !== 4 || !frame.every(Number.isInteger)) throw Error('素材裁切数据无效。');
  const [x, y, w, h] = frame;
  if (x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > width || y + h > height) throw Error('素材裁切超出图集边界。');
  return frame;
}

export function roomArtSpec(theme, manifest) {
  if (!ART_THEMES.includes(theme) || manifest?.version !== 1 || manifest.theme !== theme) throw Error('房间素材与主题不匹配。');
  const base = `/room-scenes/modular/${theme}/`, { shell, furniture } = manifest.assets || {};
  if (shell?.file !== 'shell.png' || furniture?.file !== 'furniture.png') throw Error('房间素材路径无效。');
  const [width, height] = furniture.size || [furniture.width, furniture.height];
  if (![width, height].every(n => Number.isInteger(n) && n > 0 && n <= 8192)) throw Error('图集尺寸无效。');
  const frames = Object.fromEntries(Object.keys(FURNITURE).filter(name => FURNITURE[name].atlas !== 'extras').map(name => [name, checkedFrame(furniture.frames?.[name], width, height)]));
  const extras = manifest.assets.extras;
  let extra = null;
  if (extras) {
    if (extras.file !== 'extras.png') throw Error('扩展家具路径无效。');
    const size = extras.size || [extras.width, extras.height];
    if (!size.every(n => Number.isInteger(n) && n > 0 && n <= 8192)) throw Error('扩展图集尺寸无效。');
    const extraFrames = Object.fromEntries(Object.keys(FURNITURE).filter(name => FURNITURE[name].atlas === 'extras').map(name => [name, checkedFrame(extras.frames?.[name] || extras.frames?.[({ cover: 'sleeve', timer: 'pomodoro' })[name]], ...size)]));
    extra = { url: base + extras.file, frames: extraFrames, size };
  }
  return { theme, shell: base + shell.file, furniture: base + furniture.file, frames, furnitureSize: [width, height], extras: extra };
}

export function petArtSpec(petId, manifest) {
  if (!PET_ART_IDS.includes(petId) || manifest?.version !== 1 || manifest.petId !== petId || manifest.atlas !== 'atlas.png') throw Error('宠物素材数据无效。');
  const frames = Object.fromEntries(['idle', 'listen', 'groove', 'focus'].map(pose => {
    const f = manifest.frames?.[pose]?.frame;
    return [pose, checkedFrame(f && [f.x, f.y, f.w, f.h], manifest.width, manifest.height)];
  }));
  return { atlas: `/pet-art/v2/${petId}/atlas.png`, frames };
}

export function roomPetPose({ playing = false, focus = false, beat, now = Date.now(), origin = 0, reduced = false } = {}) {
  if (focus) return 'focus';
  if (!playing || reduced) return 'idle';
  if (beat?.detected === true && Number.isFinite(beat.beatAt) && beat.beatAt > 0 && beat.bpm >= 40 && beat.bpm <= 220) return 'groove';
  return ((now - origin) % 12000 + 12000) % 12000 < 1500 ? 'listen' : 'idle';
}
