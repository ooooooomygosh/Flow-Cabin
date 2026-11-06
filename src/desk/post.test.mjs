import test from 'node:test';
import assert from 'node:assert/strict';
import {
  POST_KEY, MAX_LETTERS, NOTICE_WINDOW, normalizeLetter, normalizePost, readPost, writePost, deliver, markRead, discard, unreadCount,
  welcomeLetter, releaseLetter, noticeLetter, cabinLetters, boxLetters, letterTime,
} from './post.mjs';
import { RELEASES } from '../onboarding/releases.mjs';

const memory = () => { const m = new Map(); return { getItem: (k) => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), m }; };
const empty = () => normalizePost(null);

test('a letter is cleaned, and what is not a letter is dropped', () => {
  assert.equal(normalizeLetter(null), null);
  assert.equal(normalizeLetter({ id: 'x' }), null, 'no title and no body');
  const l = normalizeLetter({ id: 'a', title: ' 你好 ', body: 'x', kind: 'nope', at: 5, read: 1 });
  assert.deepEqual(l, { id: 'a', kind: 'notice', from: '心流小屋', title: '你好', body: 'x', at: 5, read: true });
});

test('the box stores and reads back, newest first', () => {
  const s = memory();
  let post = deliver(empty(), { id: 'old', title: 'a', at: 1 });
  post = deliver(post, { id: 'new', title: 'b', at: 2 });
  writePost(s, post);
  assert.ok(s.m.has(POST_KEY));
  assert.deepEqual(readPost(s).letters.map((l) => l.id), ['new', 'old']);
  assert.deepEqual(readPost({ getItem: () => '{bad' }), empty(), 'a broken box reads as empty');
});

test('a letter is delivered once, and one thrown away does not come back', () => {
  let post = deliver(empty(), welcomeLetter(10));
  assert.equal(deliver(post, welcomeLetter(20)), post);
  post = discard(post, 'welcome');
  assert.equal(post.letters.length, 0);
  assert.equal(deliver(post, welcomeLetter(30)), post);
});

test('reading, unread count', () => {
  let post = deliver(deliver(empty(), { id: 'a', title: 'a', at: 1 }), { id: 'b', title: 'b', at: 2 });
  assert.equal(unreadCount(post.letters), 2);
  post = markRead(post, 'a');
  assert.equal(unreadCount(post.letters), 1);
  post = markRead(post, 'a', false);
  assert.equal(unreadCount(post.letters), 2);
});

test('a full box lets the oldest read letter go first', () => {
  let post = empty();
  for (let i = 0; i < MAX_LETTERS; i++) post = deliver(post, { id: `l${i}`, title: 't', at: i + 1, read: i === 5 });
  post = deliver(post, { id: 'new', title: 't', at: 1000 });
  assert.equal(post.letters.length, MAX_LETTERS);
  assert.ok(!post.letters.some((l) => l.id === 'l5'), 'the read one left');
  assert.ok(post.letters.some((l) => l.id === 'l0'));
  post = deliver(post, { id: 'newer', title: 't', at: 1001 });
  assert.ok(!post.letters.some((l) => l.id === 'l0'), 'then the oldest');
});

test('the welcome letter is the guide\'s three steps', () => {
  const l = welcomeLetter(1);
  assert.equal(l.kind, 'welcome');
  assert.deepEqual(l.steps.map((s) => [s.id, s.label]), [['source', '选音源'], ['room', '挑伙伴'], ['test', '试听']]);
  assert.deepEqual(normalizeLetter(l).steps.length, 3);
});

test('a version\'s letter carries its notes', () => {
  const r = RELEASES[0], l = releaseLetter(r, 1);
  assert.equal(l.id, `release:${r.version}`);
  assert.equal(l.title, r.title);
  assert.equal(l.body.split('\n').length, r.items.length);
  assert.equal(releaseLetter(null), null);
  assert.match(releaseLetter({ version: '9.9.9' }).body, /没有单独的更新摘要/);
});

test('only errors and kept notices become letters, and once within the window', () => {
  const post = empty();
  assert.equal(noticeLetter(post, '已保存'), null);
  const err = noticeLetter(post, '保存失败', { tone: 'error', at: 1000 });
  assert.equal(err.kind, 'notice'); assert.equal(err.tone, 'error'); assert.equal(err.title, '出了点问题');
  const kept = noticeLetter(post, '同步好了', { keep: true, at: 1000 });
  assert.equal(kept.title, '一张便条');
  const after = deliver(post, err);
  assert.equal(noticeLetter(after, '保存失败', { tone: 'error', at: 2000 }), null);
  assert.ok(noticeLetter(after, '保存失败', { tone: 'error', at: 1000 + NOTICE_WINDOW + 1 }));
});

test('the cabin\'s letters stand in the box with the app\'s', () => {
  const cabin = [
    { id: 'c1', direction: 'in', status: 'sent', lines: ['第一行', '第二行'], at: 5, read: false, source: 'ai', period: '本周' },
    { id: 'c2', direction: 'out', status: 'sent', lines: ['我写的'], at: 6, read: true },
    { id: 'c3', direction: 'in', status: 'sent', lines: ['丢了'], at: 7, trashed: true },
  ];
  const mail = cabinLetters(cabin);
  assert.deepEqual(mail.map((l) => l.id), ['cabin:c1']);
  assert.equal(mail[0].kind, 'mail'); assert.equal(mail[0].title, '本周的信'); assert.equal(mail[0].body, '第一行\n第二行');
  const box = boxLetters(deliver(empty(), { id: 'w', title: 'w', at: 9 }), cabin);
  assert.deepEqual(box.map((l) => l.id), ['w', 'cabin:c1']);
});

test('the time on a letter', () => {
  const now = new Date(2026, 10, 6, 15, 0).getTime();
  assert.equal(letterTime(new Date(2026, 10, 6, 9, 5).getTime(), now), '09:05');
  assert.equal(letterTime(new Date(2026, 9, 30, 9, 5).getTime(), now), '10月30日');
  assert.equal(letterTime(0, now), '');
});
