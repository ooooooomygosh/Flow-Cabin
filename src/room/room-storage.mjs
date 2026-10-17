// Small JSON preferences kept on this computer (shelf filters, focus dock).
// A missing or broken value falls back field by field to the defaults.
export const readJSON = (key, fallback, storage = globalThis.localStorage) => { try { return { ...fallback, ...(JSON.parse(storage.getItem(key)) || {}) }; } catch { return fallback; } };
export const writeJSON = (key, value, storage = globalThis.localStorage) => { try { storage.setItem(key, JSON.stringify(value)); } catch {} };
