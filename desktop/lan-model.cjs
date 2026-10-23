'use strict';
const crypto = require('node:crypto');
const baseDomains = ['notes', 'layouts', 'focus'], extendedDomains = ['companion', 'recipes', 'favorites'];
const domainsFor = version => version === 2 ? [...baseDomains,...extendedDomains] : baseDomains;
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function validateSnapshot(value) {
  if (!value || ![1,2].includes(value.version)) throw new Error('Unsupported sync format');
  const out = { version: value.version };
  for (const domain of domainsFor(value.version)) {
    if (!Array.isArray(value[domain]) || value[domain].length > 5000) throw new Error('Invalid sync records');
    const seen = new Set();
    out[domain] = value[domain].map(record => {
      if (!record || typeof record.id !== 'string' || !record.id || record.id.length > 200 || seen.has(record.id)
        || !Number.isSafeInteger(record.rev) || record.rev < 1 || typeof record.device !== 'string' || record.device.length > 100
        || !Number.isFinite(record.at) || typeof record.deleted !== 'boolean'
        || (!record.deleted && (!record.value || typeof record.value !== 'object' || Array.isArray(record.value)))) throw new Error('Invalid sync record');
      seen.add(record.id);
      // Copy only protocol fields. Cookies, settings and credentials have no protocol slot.
      return { id: record.id, rev: record.rev, device: record.device, at: record.at, deleted: record.deleted, ...(record.deleted ? {} : { value: record.value }), ...(typeof record.base === 'string' ? { base: record.base.slice(0, 64) } : {}) };
    });
  }
  return out;
}
function mergeSnapshots(a, b) {
  a = validateSnapshot(a); b = validateSnapshot(b);
  const result = { version: Math.max(a.version,b.version) };
  for (const domain of domainsFor(result.version)) {
    const map = new Map((a[domain] || []).map(r => [r.id, r]));
    for (const next of b[domain] || []) {
      const old = map.get(next.id);
      if (!old || digest(old) === digest(next)) { map.set(next.id, next); continue; }
      // Focus session IDs are immutable and idempotent. Deterministic ties converge.
      const rank = r => `${String(r.rev).padStart(16, '0')}:${r.device}:${digest(r)}`;
      let winner = rank(old) >= rank(next) ? old : next, loser = winner === old ? next : old;
      if (old.deleted || next.deleted) winner = old.deleted ? old : next;
      if (['notes','layouts','recipes'].includes(domain) && !old.deleted && !next.deleted && digest(old.value) !== digest(next.value)
        && next.base !== digest(old) && old.base !== digest(next)) {
        const copyId = `${next.id.slice(0, 170)}~conflict-${digest(loser).slice(0, 16)}`;
        map.set(copyId, { ...loser, id: copyId });
      }
      map.set(next.id, winner);
    }
    result[domain] = [...map.values()].sort((x, y) => x.id.localeCompare(y.id));
    if (result[domain].length > 5000) throw new Error('Sync capacity exceeded');
  }
  return result;
}
module.exports = { validateSnapshot, mergeSnapshots, digest, emptySnapshot: () => ({ version: 1, notes: [], layouts: [], focus: [] }) };
