import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAi, chatUrl, aiReady, chatText, explainError, redact, letterPeriod, letterSummary, letterMessages, cleanLetter, saveLetter, readLetters, markRead, unreadCount, needsLetter, readAi, writeAi, LETTERS_KEY, AI_KEY_KEY } from './ai-model.mjs';
import { chat } from './ai-transport.mjs';

const mem = () => { const m = new Map(); return { getItem: (k) => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };
const KEY = 'sk-unit-SECRET-abcdef123456';

test('settings default off and normalise', () => {
  assert.deepEqual(normalizeAi(null), { v: 1, enabled: false, baseUrl: '', model: '', cadence: 'weekly', tone: 'warm' });
  assert.equal(normalizeAi({ tone: 'evil', cadence: 'hourly' }).tone, 'warm');
  const s = mem(); writeAi(s, { enabled: true, baseUrl: ' https://api.deepseek.com ', model: 'deepseek-chat', tone: 'playful', cadence: 'daily' });
  assert.deepEqual(readAi(s), { v: 1, enabled: true, baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', cadence: 'daily', tone: 'playful' });
  assert.ok(!s.m.get('flow-cabin-ai-v1').includes('sk-'));
});

test('chatUrl accepts base, /v1 and full URLs', () => {
  assert.equal(chatUrl('https://api.deepseek.com'), 'https://api.deepseek.com/chat/completions');
  assert.equal(chatUrl('https://api.deepseek.com/v1/'), 'https://api.deepseek.com/v1/chat/completions');
  assert.equal(chatUrl('http://localhost:11434/v1/chat/completions'), 'http://localhost:11434/v1/chat/completions');
  assert.equal(chatUrl('ftp://x'), null); assert.equal(chatUrl('nope'), null);
  assert.equal(aiReady({ enabled: true, baseUrl: 'https://a.b', model: 'm' }, true), true);
  assert.equal(aiReady({ enabled: false, baseUrl: 'https://a.b', model: 'm' }, true), false);
});

test('responses, errors and redaction', () => {
  assert.equal(chatText({ choices: [{ message: { content: ' 好 ' } }] }), '好');
  assert.equal(chatText({}), null);
  assert.match(explainError({ status: 401 }), /API Key/);
  assert.match(explainError({ kind: 'network' }), /CORS/);
  assert.match(explainError({ kind: 'timeout' }), /超时/);
  assert.ok(!redact(`bad key ${KEY}`, KEY).includes(KEY));
  assert.ok(!redact('Bearer abcdefghijkl1234').includes('abcdefghijkl1234'));
});

test('periods: daily = yesterday, weekly = last Monday-started week', () => {
  const now = new Date(2026, 9, 18, 17, 0).getTime(); // Sunday
  const d = letterPeriod(now, 'daily'); assert.equal(d.id, 'd:2026-10-17');
  const w = letterPeriod(now, 'weekly'); assert.equal(w.id, 'w:2026-10-05'); assert.equal(new Date(w.to).getDate(), 12);
});

test('summary carries stats only — no task text, notes or timestamps', () => {
  const period = { from: 0, to: 1e12, label: '上周' };
  const sessions = [
    { start: 1000, durationMs: 25 * 60000, completed: true, taskText: '秘密待办', album: { key: 'a', title: '专辑A', artist: '甲' } },
    { start: 2000, durationMs: 50 * 60000, completed: true, album: { key: 'b', title: '专辑B' } },
    { start: 3000, durationMs: 10 * 60000, completed: false }
  ];
  const s = letterSummary(sessions, period, { tier: 'happy', mood: 82, feeds: 3 });
  assert.equal(s.focusMinutes, 85); assert.equal(s.sessions, 3); assert.equal(s.completedSessions, 2);
  assert.deepEqual(s.topAlbums.map((a) => a.title), ['专辑B', '专辑A']);
  assert.deepEqual(s.cat, { tier: 'happy', mood: 82, feeds: 3 });
  const text = JSON.stringify(letterMessages(s, 'calm'));
  assert.ok(!text.includes('秘密待办')); assert.ok(!/"start"|1000/.test(text));
  assert.match(text, /平静/);
});

test('letters: save, unread flag, once per period, retry after an hour', () => {
  const s = mem(), p = { id: 'w:2026-10-05' };
  assert.equal(needsLetter([], p, null, 0), true);
  assert.equal(needsLetter([], p, { id: p.id, at: 0 }, 1000), false);
  assert.equal(needsLetter([], p, { id: p.id, at: 0 }, 3600001), true);
  saveLetter(s, { id: p.id, lines: ['a'], read: false });
  assert.equal(unreadCount(readLetters(s)), 1);
  assert.equal(needsLetter(readLetters(s), p, null, 0), false);
  markRead(s, p.id); assert.equal(unreadCount(readLetters(s)), 0);
  s.setItem(LETTERS_KEY, 'garbage'); assert.deepEqual(readLetters(s), []);
  assert.deepEqual(cleanLetter('# 标题\n\n**你好**\n```x```\n第二行'), ['标题', '你好', '第二行']);
});

test('web transport: mocked endpoint, auth header, errors, timeout', async () => {
  const win = { localStorage: mem(), document: { documentElement: { dataset: {} } }, addEventListener() {}, removeEventListener() {} };
  win.localStorage.setItem(AI_KEY_KEY, KEY);
  const settings = { baseUrl: 'https://api.mock/v1', model: 'm' };
  let seen;
  const ok = await chat(settings, [{ role: 'user', content: 'hi' }], { win, fetchImpl: async (u, o) => { seen = { u, o }; return { ok: true, json: async () => ({ choices: [{ message: { content: '好' } }] }) }; } });
  assert.deepEqual(ok, { ok: true, text: '好' });
  assert.equal(seen.u, 'https://api.mock/v1/chat/completions'); assert.equal(seen.o.headers.Authorization, `Bearer ${KEY}`);
  const bad = await chat(settings, [], { win, fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ error: { message: `wrong ${KEY}` } }) }) });
  assert.equal(bad.ok, false); assert.ok(!bad.error.includes(KEY));
  const cors = await chat(settings, [], { win, fetchImpl: async () => { throw new TypeError('Failed to fetch'); } });
  assert.match(cors.error, /CORS/);
  const slow = await chat(settings, [], { win, timeoutMs: 20, fetchImpl: (_u, o) => new Promise((_, rej) => o.signal.addEventListener('abort', () => rej(Object.assign(new Error('x'), { name: 'AbortError' })))) });
  assert.match(slow.error, /超时/);
});

test('desktop transport goes through the shell command and result event', async () => {
  const listeners = new Set(), cmds = [];
  const win = { document: { documentElement: { dataset: { desktopClient: 'true' } } }, addEventListener: (_n, f) => listeners.add(f), removeEventListener: (_n, f) => listeners.delete(f) };
  const command = (name, params) => { cmds.push([name, params]); setTimeout(() => { for (const f of [...listeners]) f({ detail: { id: params.id, ok: true, text: '好' } }); }, 5); };
  const r = await chat({ baseUrl: 'https://api.mock', model: 'm' }, [{ role: 'user', content: 'hi' }], { win, command });
  assert.deepEqual(r, { ok: true, text: '好' });
  assert.equal(cmds[0][0], 'ai-chat'); assert.ok(!('key' in cmds[0][1]));
  assert.equal(cmds[0][1].url, 'https://api.mock/chat/completions');
});
