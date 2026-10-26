// 3.0 产品聚焦（docs/design/3.0-design.md）：核心是「听 · 专注 · 唱片日记」。
// 与核心循环关联较弱的功能收进「设置 › 实验室」，默认不出现在一级入口。
// 只隐藏入口，不删除数据，也不改变已保存内容。已经用过某项功能的人，第一次读取时
// 按本机证据默认保持开启，所以升级不会让他们的东西“消失”。
export const LABS_KEY = 'flow-cabin-labs-v1';
export const LABS_EVENT = 'cabin:labs-changed';

// id → { label, hint, evidence: 本机已有数据的存储键（前缀以 * 结尾） }
export const LAB_FEATURES = Object.freeze({
  study: { label: '词书学习', hint: 'FSRS 闪卡、考试倒计时与学习热力图。', evidence: ['album-circle-study-v1:local-owner'] },
  letters: { label: '小屋来信', hint: '和小屋互相写信的信箱。', evidence: ['flow-cabin-letters-v1'] },
  smartTurntable: { label: '智能唱片机', hint: '用一句话让 AI 排一张歌单（需配置 AI）。', evidence: ['flow-cabin-ai-v1'] },
  devices: { label: '设备联动', hint: '配对手机或另一台电脑，遥控与歌词副屏。', evidence: ['flow-cabin-pair*'] },
  scenes: { label: '场景配方与睡前', hint: '保存整套布置与氛围，睡前淡出。', evidence: ['flow-cabin-recipes-v1'] },
  postcard: { label: '小屋明信片', hint: '把小屋导出成一张图片。', evidence: [] }
});
export const LAB_IDS = Object.freeze(Object.keys(LAB_FEATURES));

const meaningful = (value) => typeof value === 'string' && value.length > 2 && value !== 'null';
function keys(storage) {
  const list = [];
  try { for (let i = 0; i < storage.length; i += 1) list.push(storage.key(i)); } catch {}
  return list;
}
export function hasEvidence(id, storage = globalThis.localStorage) {
  const patterns = LAB_FEATURES[id]?.evidence || [];
  if (!storage || !patterns.length) return false;
  const all = patterns.some((pattern) => pattern.endsWith('*')) ? keys(storage) : [];
  return patterns.some((pattern) => {
    if (pattern.endsWith('*')) return all.some((key) => key?.startsWith(pattern.slice(0, -1)) && meaningful(storage.getItem(key)));
    try { return meaningful(storage.getItem(pattern)); } catch { return false; }
  });
}

export function normalizeLabs(value) {
  const out = {};
  for (const id of LAB_IDS) if (typeof value?.[id] === 'boolean') out[id] = value[id];
  return out;
}
// 读取时把缺省项按本机证据补齐并写回一次，之后就是稳定的用户选择。
export function readLabs(storage = globalThis.localStorage) {
  let saved = {};
  try { saved = normalizeLabs(JSON.parse(storage?.getItem(LABS_KEY) || 'null')); } catch {}
  const missing = LAB_IDS.filter((id) => !(id in saved));
  if (!missing.length) return saved;
  const next = { ...saved };
  for (const id of missing) next[id] = hasEvidence(id, storage);
  try { storage?.setItem(LABS_KEY, JSON.stringify(next)); } catch {}
  return next;
}
export const isLabEnabled = (id, storage = globalThis.localStorage) => Boolean(readLabs(storage)[id]);
export function setLabEnabled(id, enabled, storage = globalThis.localStorage) {
  if (!LAB_FEATURES[id]) throw Error('未知的实验室功能。');
  const next = { ...readLabs(storage), [id]: Boolean(enabled) };
  try { storage?.setItem(LABS_KEY, JSON.stringify(next)); } catch {}
  try { globalThis.dispatchEvent?.(new CustomEvent(LABS_EVENT, { detail: next })); } catch {}
  return next;
}
