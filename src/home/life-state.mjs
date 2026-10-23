export const LIFE_KEY = 'flow-cabin-life-v1';
export const LIFE_CHANGED = 'cabin:life-changed';
export function normalizeLife(value) {
  return { version: 1, wateredDays: [...new Set((Array.isArray(value?.wateredDays) ? value.wateredDays : []).filter(v => /^\d{4}-\d{2}-\d{2}$/.test(v)))].sort().slice(-365),
    drinks: (Array.isArray(value?.drinks) ? value.drinks : []).filter(n => Number.isSafeInteger(n) && n > 0).slice(-100),
    reminder: value?.reminder === true, interval: Math.max(15, Math.min(180, Number(value?.interval) || 60)),
    resting: value?.resting === true, nextDrink: Math.max(0, Number(value?.nextDrink) || 0) };
}
export function readLife(storage = globalThis.localStorage) { try { return normalizeLife(JSON.parse(storage.getItem(LIFE_KEY))); } catch { return normalizeLife(); } }
export function writeLife(patch, storage = globalThis.localStorage) { const next = normalizeLife({ ...readLife(storage), ...patch }); storage.setItem(LIFE_KEY, JSON.stringify(next)); globalThis.dispatchEvent?.(new Event(LIFE_CHANGED)); return next; }
export const plantStage = life => Math.min(3, Math.floor(life.wateredDays.length / 5));
export function waterPlant(storage = globalThis.localStorage, now = new Date()) {
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return writeLife({ wateredDays: [...readLife(storage).wateredDays, day] }, storage);
}
