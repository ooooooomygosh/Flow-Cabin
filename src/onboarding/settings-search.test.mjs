import test from 'node:test';
import assert from 'node:assert/strict';
import { SETTINGS_INDEX, matchingSections, normalizeQuery, searchSettings, visibleEntries } from './settings-search.mjs';
import { HUB_SECTIONS, LEGACY_SECTIONS, hubAnchor, hubTab } from './settings-sections.mjs';
import { LAB_IDS } from '../product/features.mjs';

const SECTIONS = HUB_SECTIONS;
const labels = Object.fromEntries(SECTIONS.map((item) => [item.id, item.label]));
const ids = (query, env = {}) => searchSettings(query, { env, labels }).map((entry) => entry.id);

test('3.0 settings have six sections in order', () => {
  assert.deepEqual(SECTIONS.map((item) => item.label), ['音乐', '专注', '小屋与奶糖', '桌面', '数据', '实验室']);
});

test('old section ids still open the right new section and block', () => {
  for (const id of ['music', 'focus', 'room', 'desktop', 'data', 'labs']) { assert.equal(hubTab(id), id); assert.equal(hubAnchor(id), ''); }
  assert.equal(hubTab('music/accounts'), 'music', 'a sub-page keeps its section');
  assert.equal(hubTab('beta'), 'room'); assert.equal(hubAnchor('beta'), 'hub-home');
  assert.equal(hubTab('companion'), 'room'); assert.equal(hubAnchor('companion'), 'hub-companion');
  assert.equal(hubTab('sync'), 'labs'); assert.equal(hubAnchor('sync'), 'hub-sync');
  assert.equal(hubTab('ai'), 'labs'); assert.equal(hubAnchor('ai'), 'hub-ai');
  assert.equal(hubTab('about'), 'labs'); assert.equal(hubAnchor('about'), 'hub-about');
  assert.equal(hubTab('diagnostics'), 'data');
  assert.equal(hubTab(''), 'music'); assert.equal(hubTab('nowhere'), 'music'); assert.equal(hubTab(undefined), 'music');
  for (const [target] of Object.values(LEGACY_SECTIONS)) assert.ok(SECTIONS.some((item) => item.id === target));
});

test('every entry points at a real hub section and has a unique id', () => {
  const sections = new Set(SECTIONS.map((item) => item.id));
  assert.equal(new Set(SETTINGS_INDEX.map((entry) => entry.id)).size, SETTINGS_INDEX.length);
  for (const entry of SETTINGS_INDEX) {
    assert.ok(sections.has(entry.section.split('/')[0]), entry.id);
    assert.ok(entry.title, entry.id);
    assert.ok(!entry.when || ['desktop', 'mobile', 'native'].includes(entry.when), entry.id);
  }
  for (const id of LAB_IDS) assert.ok(SETTINGS_INDEX.some((entry) => entry.id === `lab-${id}` && entry.section === 'labs'), `lab ${id} is searchable`);
});

test('an empty query shows nothing; titles rank above keywords', () => {
  assert.deepEqual(ids(''), []);
  assert.deepEqual(ids('   '), []);
  assert.equal(ids('备份')[0], 'backup');
  assert.equal(ids('通知')[0], 'notify', 'the title match comes first');
  assert.ok(ids('通知').length >= 1);
  assert.equal(ids('快捷键')[0], 'shortcuts');
  assert.equal(ids('新功能')[0], 'whats-new');
  assert.equal(ids('明信片')[0], 'lab-postcard');
  assert.equal(ids('诊断')[0], 'diagnostics');
  assert.equal(ids('经典首页')[0], 'home');
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
  assert.ok(ids('专注').includes('timer'), 'a section label finds its rows');
  assert.ok(ids('实验室').includes('ai'), 'AI lives in 实验室');
  assert.ok(ids('小屋与奶糖').includes('typing'), '键鼠陪伴 lives in 小屋与奶糖');
  assert.ok(!ids('开机').includes('autostart'), 'the web build has no autostart row');
  assert.ok(ids('开机', { desktop: true }).includes('autostart'));
  assert.ok(!ids('账户').includes('accounts'));
  assert.ok(ids('账户', { mobile: true }).includes('accounts'), 'Android has accounts too');
  assert.ok(ids('存储', { mobile: true }).includes('storage'));
  assert.ok(!ids('存储', { desktop: true }).includes('storage'));
  assert.ok(visibleEntries({}).every((entry) => !entry.when));
});

test('matching sections keep the hub order, and old ids count toward their new section', () => {
  const results = searchSettings('配对', { labels });
  assert.deepEqual(matchingSections(results, SECTIONS).map((item) => item.id), ['labs']);
  const wide = searchSettings('音', { labels, env: { desktop: true } });
  const order = matchingSections(wide, SECTIONS).map((item) => item.id);
  assert.deepEqual(order, SECTIONS.map((item) => item.id).filter((id) => order.includes(id)));
  assert.deepEqual(matchingSections([{ section: 'ai' }, { section: 'companion' }], SECTIONS).map((item) => item.id), ['room', 'labs']);
});
