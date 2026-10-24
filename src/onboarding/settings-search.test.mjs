import test from 'node:test';
import assert from 'node:assert/strict';
import { SETTINGS_INDEX, matchingSections, normalizeQuery, searchSettings, visibleEntries } from './settings-search.mjs';

const SECTIONS = [
  { id: 'music', label: '音源' }, { id: 'room', label: '房间与桌宠' }, { id: 'companion', label: '键鼠陪伴' }, { id: 'focus', label: '专注工具' },
  { id: 'sync', label: '同步与设备' }, { id: 'desktop', label: '显示与桌面' }, { id: 'data', label: '数据与备份' }, { id: 'ai', label: 'AI（Beta）' }, { id: 'about', label: '关于' }
];
const labels = Object.fromEntries(SECTIONS.map((item) => [item.id, item.label]));
const ids = (query, env = {}) => searchSettings(query, { env, labels }).map((entry) => entry.id);

test('every entry points at a real hub section and has a unique id', () => {
  const sections = new Set(SECTIONS.map((item) => item.id));
  assert.equal(new Set(SETTINGS_INDEX.map((entry) => entry.id)).size, SETTINGS_INDEX.length);
  for (const entry of SETTINGS_INDEX) {
    assert.ok(sections.has(entry.section.split('/')[0]), entry.id);
    assert.ok(entry.title, entry.id);
    assert.ok(!entry.when || ['desktop', 'mobile', 'native'].includes(entry.when), entry.id);
  }
});

test('an empty query shows nothing; titles rank above keywords', () => {
  assert.deepEqual(ids(''), []);
  assert.deepEqual(ids('   '), []);
  assert.equal(ids('备份')[0], 'backup');
  assert.equal(ids('通知')[0], 'notify', 'the title match comes first');
  assert.ok(ids('通知').length >= 1);
  assert.equal(ids('快捷键')[0], 'shortcuts');
  assert.equal(ids('新功能')[0], 'whats-new');
});

test('queries match keywords, ignore case and full-width forms, and require every term', () => {
  assert.ok(ids('QQ').includes('source'));
  assert.ok(ids('ＱＱ').includes('source'), 'full-width letters normalise');
  assert.ok(ids('Backup').includes('backup'));
  assert.ok(ids('qq 音乐').includes('source'), 'spaces inside a keyword still match');
  assert.deepEqual(ids('备份 天气'), [], 'all terms must match one entry');
  assert.deepEqual(ids('zzzz'), []);
  assert.equal(normalizeQuery('  Ａpple   Music '), 'apple music');
});

test('section names find their rows, and rows a build cannot show are hidden', () => {
  assert.ok(ids('专注工具').includes('timer'), 'a section label finds its rows');
  assert.ok(!ids('开机').includes('autostart'), 'the web build has no autostart row');
  assert.ok(ids('开机', { desktop: true }).includes('autostart'));
  assert.ok(!ids('账户').includes('accounts'));
  assert.ok(ids('账户', { mobile: true }).includes('accounts'), 'Android has accounts too');
  assert.ok(ids('存储', { mobile: true }).includes('storage'));
  assert.ok(!ids('存储', { desktop: true }).includes('storage'));
  assert.ok(visibleEntries({}).every((entry) => !entry.when));
});

test('matching sections keep the hub order', () => {
  const results = searchSettings('设备', { labels });
  assert.deepEqual(matchingSections(results, SECTIONS).map((item) => item.id), ['sync']);
  const wide = searchSettings('音', { labels, env: { desktop: true } });
  const order = matchingSections(wide, SECTIONS).map((item) => item.id);
  assert.deepEqual(order, SECTIONS.map((item) => item.id).filter((id) => order.includes(id)));
});
