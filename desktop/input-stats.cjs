'use strict';
// Local-only daily input counts. The hook never reads a key, button, coordinate,
// window title or target application; this store only increments two counters.
// Keeping the day total (rather than individual events) makes the file small and
// means there is no activity timeline to reconstruct.
const fs = require('node:fs');
const path = require('node:path');

const VERSION = 1;
const KEEP_DAYS = 400;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TYPES = Object.freeze(['keyboard', 'click']);

const count = (value) => Number.isFinite(Number(value)) ? Math.max(0, Math.min(1e9, Math.round(Number(value)))) : 0;
const pad = (value) => String(value).padStart(2, '0');
const dayKey = (at = Date.now()) => {
  const date = new Date(at);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
const empty = () => ({ keyboard: 0, click: 0 });
const totalOf = (value = {}) => count(value.keyboard) + count(value.click);
const addDays = (date, amount) => {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
};
const startOfDay = (at) => {
  const date = new Date(at);
  date.setHours(0, 0, 0, 0);
  return date;
};

function cleanDays(value) {
  const days = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return days;
  for (const [key, entry] of Object.entries(value)) {
    if (!DAY.test(key) || !entry || typeof entry !== 'object') continue;
    const keyboard = count(entry.keyboard), click = count(entry.click);
    if (keyboard || click) days[key] = { keyboard, click };
  }
  return days;
}

function cleanTotal(value, days) {
  if (value && typeof value === 'object') {
    const keyboard = count(value.keyboard), click = count(value.click);
    if (keyboard || click) return { keyboard, click };
  }
  return Object.values(days).reduce((sum, entry) => ({ keyboard: sum.keyboard + entry.keyboard, click: sum.click + entry.click }), empty());
}

function trim(days, reference) {
  const cutoff = dayKey(startOfDay(reference).getTime() - (KEEP_DAYS - 1) * 86400000);
  for (const key of Object.keys(days)) if (key < cutoff) delete days[key];
}

function snapshotOf(days, total, reference) {
  const today = days[dayKey(reference)] || empty();
  const week = [];
  for (let offset = -6; offset <= 0; offset++) {
    const key = dayKey(addDays(startOfDay(reference), offset).getTime()), entry = days[key] || empty();
    week.push({ key, keyboard: entry.keyboard, click: entry.click, total: totalOf(entry) });
  }
  let cursor = startOfDay(reference), streak = 0;
  if (!totalOf(days[dayKey(cursor.getTime())] || empty())) cursor = addDays(cursor, -1);
  while (totalOf(days[dayKey(cursor.getTime())] || empty()) > 0) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return {
    today: { keyboard: today.keyboard, click: today.click, total: totalOf(today) },
    total: { keyboard: total.keyboard, click: total.click, total: totalOf(total) },
    week,
    activeDays: Object.values(days).filter((entry) => totalOf(entry) > 0).length,
    streak
  };
}

function createInputStats({
  directory,
  now = Date.now,
  flushDelay = 1200,
  readFile = fs.readFileSync,
  writeFile = fs.writeFileSync,
  renameFile = fs.renameSync,
  mkdir = fs.mkdirSync,
  setTimer = setTimeout,
  clearTimer = clearTimeout
}) {
  const file = path.join(directory, 'input-stats.json');
  let days = {}, total = empty(), timer = null, dirty = false, disposed = false;

  try {
    const parsed = JSON.parse(readFile(file, 'utf8'));
    if (parsed?.version === VERSION) {
      days = cleanDays(parsed.days);
      total = cleanTotal(parsed.total, days);
    }
  } catch {
    // A missing or damaged file starts a fresh local count.
  }

  function persist() {
    if (!dirty || disposed) return false;
    clearTimer(timer);
    timer = null;
    try {
      mkdir(directory, { recursive: true });
      const body = JSON.stringify({ version: VERSION, days, total });
      const temporary = `${file}.tmp`;
      writeFile(temporary, body);
      renameFile(temporary, file);
      dirty = false;
      return true;
    } catch {
      // Keep the in-memory counts and try again on the next event / quit.
      return false;
    }
  }

  function schedule() {
    if (timer || disposed) return;
    timer = setTimer(persist, flushDelay);
  }

  return {
    record(type, at = now()) {
      if (!TYPES.includes(type) || disposed) return false;
      const key = dayKey(at), entry = days[key] || (days[key] = empty());
      entry[type] = count(entry[type]) + 1;
      total[type] = count(total[type]) + 1;
      trim(days, at);
      dirty = true;
      schedule();
      return true;
    },
    snapshot(reference = now()) { return snapshotOf(days, total, reference); },
    flush: persist,
    dispose() {
      persist();
      disposed = true;
      clearTimer(timer);
      timer = null;
    }
  };
}

module.exports = { createInputStats, dayKey, VERSION, KEEP_DAYS, TYPES };
