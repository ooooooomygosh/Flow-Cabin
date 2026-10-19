'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createInputStats, dayKey } = require('../input-stats.cjs');

const temporary = () => fs.mkdtempSync(path.join(os.tmpdir(), 'album-input-stats-'));
const at = (day, hour = 12) => new Date(2026, 9, day, hour, 0, 0, 0).getTime();
const cleanup = (directory) => fs.rmSync(directory, { recursive: true, force: true });

test('daily totals split keyboard and click, include a 7-day window and a streak', () => {
  const directory = temporary();
  try {
    const stats = createInputStats({ directory });
    stats.record('keyboard', at(18)); stats.record('keyboard', at(18)); stats.record('click', at(18));
    stats.record('keyboard', at(19)); stats.record('click', at(19)); stats.record('click', at(19));
    const value = stats.snapshot(at(19, 20));
    assert.deepEqual(value.today, { keyboard: 1, click: 2, total: 3 });
    assert.deepEqual(value.total, { keyboard: 3, click: 3, total: 6 });
    assert.equal(value.week.length, 7);
    assert.equal(value.week.at(-1).key, dayKey(at(19)));
    assert.deepEqual(value.week.at(-2), { key: dayKey(at(18)), keyboard: 2, click: 1, total: 3 });
    assert.equal(value.activeDays, 2);
    assert.equal(value.streak, 2);
  } finally { cleanup(directory); }
});

test('counts persist atomically, survive reload and ignore unknown event kinds', () => {
  const directory = temporary();
  try {
    const first = createInputStats({ directory });
    for (let index = 0; index < 5; index++) first.record('keyboard', at(19));
    first.record('click', at(19));
    assert.equal(first.record('wheel', at(19)), false);
    assert.equal(first.flush(), true);
    const file = path.join(directory, 'input-stats.json');
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.deepEqual(Object.keys(saved).sort(), ['days', 'total', 'version']);
    assert.deepEqual(saved.total, { keyboard: 5, click: 1 });
    assert.equal(fs.existsSync(`${file}.tmp`), false);
    const second = createInputStats({ directory });
    assert.deepEqual(second.snapshot(at(19, 20)).total, { keyboard: 5, click: 1, total: 6 });
    assert.equal(second.flush(), false, 'a clean store does not rewrite');
    second.dispose();
  } finally { cleanup(directory); }
});

test('a damaged file starts fresh and disposal flushes pending counts', () => {
  const directory = temporary();
  try {
    const file = path.join(directory, 'input-stats.json');
    fs.writeFileSync(file, '{not json');
    const stats = createInputStats({ directory, flushDelay: 60_000 });
    assert.equal(stats.snapshot(at(19, 20)).today.total, 0);
    stats.record('click', at(19));
    stats.dispose();
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).total, { keyboard: 0, click: 1 });
  } finally { cleanup(directory); }
});

test('an empty today can still keep a streak from yesterday', () => {
  const directory = temporary();
  try {
    const stats = createInputStats({ directory });
    stats.record('keyboard', at(17));
    stats.record('click', at(18));
    const value = stats.snapshot(at(19, 9));
    assert.equal(value.today.total, 0);
    assert.equal(value.streak, 2);
  } finally { cleanup(directory); }
});
