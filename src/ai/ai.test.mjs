import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAi, chatUrl, chatBody, isDeepseekEndpoint, aiReady, aiConnectionReady, aiProvider, providerById, inferAiProvider, applyAiProvider,
  AI_PROVIDERS, chatText, explainError, redact, letterPeriod, letterSummary, TEST_MESSAGES,
  letterMessages, cleanLetter, cleanUserLetter, saveLetter, trySaveLetter, readLetters, markRead,
  unreadCount, needsLetter, readAi, writeAi, LETTERS_KEY, AI_KEY_KEY, normalizeLetter,
  localLetterReply, templateLetter, summarizeListening, userLetterSubject, tryWriteLetters
} from './ai-model.mjs';
import { mailboxRows, pageSlice, readLetterDraft, saveLetterDraft, sendCabinLetter, clearLetterDraft, recoverCabinLetter, organizeLetterThread, DRAFT_ID } from './letter-reply.mjs';
import { buildLetterContext, hasLetterFacts, recentLetterPeriod, journalExcerpt, journalSelectionCurrent, inputCompanionSnapshot } from './letter-context.mjs';
import { chat } from './ai-transport.mjs';

const mem = () => { const m = new Map(); return { getItem: (k) => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };
const KEY = 'sk-unit-SECRET-abcdef123456';

test('selected journal excerpts are bounded, explicit, and invalidated by edits or removal', () => {
  const entry = { id: 'private-id', version: 'v1', createdAt: 1000, body: '选中的记忆'.repeat(100), tags: ['不发送的标签'] };
  const selected = journalExcerpt(entry);
  assert.equal(selected.excerpt.length, 240);
  assert.equal(journalExcerpt({ ...entry, deletedAt: 2000 }), null);
  assert.equal(journalSelectionCurrent([selected], [entry]), true);
  assert.equal(journalSelectionCurrent([selected], [{ ...entry, version: 'v2' }]), false);
  assert.equal(journalSelectionCurrent([selected], [{ ...entry, deletedAt: 2000 }]), false);
  assert.equal(journalSelectionCurrent([selected], []), false);
  assert.equal(buildLetterContext({ shareContext: false, selectedJournal: [selected] }), null);
  assert.equal(buildLetterContext({}).journal, undefined);
  const summary = buildLetterContext({ selectedJournal: [selected] });
  assert.deepEqual(summary.journal, [{ excerpt: selected.excerpt }]);
  assert.equal(JSON.stringify(summary).includes('private-id'), false);
  assert.equal(JSON.stringify(summary).includes('不发送的标签'), false);
  assert.equal(buildLetterContext({ selectedJournal: Array(4).fill(selected) }).journal.length, 3);
});

test('mailbox searches reply text and keeps favorite/trash operations on the whole thread', async () => {
  const storage = mem(), win = new EventTarget();
  win.localStorage = storage; win.sessionStorage = mem();
  const sent = await sendCabinLetter({ storage, text: '今天写完了一页。', win, replyDelayMs: 0 });
  const id = sent.outgoing.id;
  assert.equal(mailboxRows(readLetters(storage), 'all', sent.reply.lines.at(-1)).length, 1);
  assert.equal(organizeLetterThread({ storage, id, action: 'favorite', now: 10, win }).ok, true);
  assert.equal(mailboxRows(readLetters(storage), 'favorites').length, 1);
  assert.equal(organizeLetterThread({ storage, id, action: 'trash', now: 10, win }).ok, true);
  assert.equal(mailboxRows(readLetters(storage)).length, 0);
  assert.equal(mailboxRows(readLetters(storage), 'trash').length, 1);
  assert.equal(unreadCount(readLetters(storage)), 0);
  assert.ok(readLetters(storage).every((letter) => letter.trashed && letter.favorite && letter.organizedAt === 11));
  organizeLetterThread({ storage, id, action: 'restore', now: 10, win });
  assert.equal(mailboxRows(readLetters(storage), 'favorites').length, 1);
  const before = storage.getItem(LETTERS_KEY);
  const blocked = { getItem: storage.getItem, setItem() { throw new Error('quota'); } };
  assert.equal(organizeLetterThread({ storage: blocked, id, action: 'trash', win }).ok, false);
  assert.equal(storage.getItem(LETTERS_KEY), before);
});

test('a delayed reply respects organization performed while the request is pending', async () => {
  const storage = mem(), win = new EventTarget();
  win.localStorage = storage; win.sessionStorage = mem();
  const pending = sendCabinLetter({ storage, text: '稍后再读。', win, replyDelayMs: 20 });
  const outgoing = readLetters(storage).find((letter) => letter.direction === 'out');
  organizeLetterThread({ storage, id: outgoing.id, action: 'trash', win });
  assert.equal((await pending).ok, true);
  assert.equal(mailboxRows(readLetters(storage)).length, 0);
  assert.ok(readLetters(storage).every((letter) => letter.trashed));
  assert.equal(unreadCount(readLetters(storage)), 0);
});

test('settings default off and normalise', () => {
  assert.deepEqual(normalizeAi(null), { v: 1, provider: 'deepseek', enabled: false, baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-flash', cadence: 'weekly', tone: 'warm', shareNotes: false });
  assert.equal(normalizeAi({ tone: 'evil', cadence: 'hourly' }).tone, 'warm');
  const s = mem(); writeAi(s, { enabled: true, baseUrl: ' https://api.deepseek.com ', model: 'deepseek-chat', tone: 'playful', cadence: 'daily', shareNotes: 1 });
  assert.deepEqual(readAi(s), { v: 1, provider: 'deepseek', enabled: true, baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash', cadence: 'daily', tone: 'playful', shareNotes: false });
  assert.ok(!s.m.get('flow-cabin-ai-v1').includes('sk-'));
});

test('provider templates are fixed, infer legacy endpoints, and keep local providers keyless', () => {
  assert.deepEqual(AI_PROVIDERS.map((provider) => provider.id), ['deepseek', 'openai', 'openrouter', 'ollama', 'lmstudio', 'codex', 'custom']);
  assert.equal(providerById('deepseek').model, 'deepseek-flash');
  assert.equal(providerById('deepseek').thinking, 'disabled');
  assert.equal(inferAiProvider('https://api.deepseek.com/v1', 'anything'), 'deepseek');
  assert.equal(inferAiProvider('http://127.0.0.1:11434/v1', 'qwen3:8b'), 'ollama');
  assert.equal(inferAiProvider('https://example.com/v1', 'm'), 'custom');
  const reasoner = mem();
  writeAi(reasoner, { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-reasoner' });
  assert.equal(readAi(reasoner).model, 'deepseek-flash');
  const ollama = applyAiProvider({ cadence: 'daily', tone: 'calm' }, 'ollama');
  assert.equal(ollama.provider, 'ollama');
  assert.equal(ollama.baseUrl, 'http://127.0.0.1:11434/v1');
  assert.equal(providerById(ollama.provider).requiresKey, false);
  assert.equal(aiReady({ ...ollama, enabled: true }, false), true);
  assert.equal(aiConnectionReady({ ...ollama, enabled: true }, { stored: false, endpoint: '' }), true);
  const codex = applyAiProvider({ cadence: 'daily' }, 'codex');
  assert.deepEqual([codex.provider, codex.baseUrl, codex.model], ['codex', '', '']);
  assert.equal(aiReady({ ...codex, enabled: true }, false), false);
  assert.equal(aiReady({ ...codex, enabled: true }, false, { desktop: true }), true);
  assert.equal(aiConnectionReady({ ...codex, enabled: true }, null, { desktop: true }), true);
  assert.equal(aiConnectionReady({ ...codex, enabled: true }, null), false);
});

test('chatUrl accepts base, /v1 and full URLs', () => {
  assert.equal(chatUrl('https://api.deepseek.com'), 'https://api.deepseek.com/chat/completions');
  assert.equal(chatUrl('https://api.deepseek.com/v1/'), 'https://api.deepseek.com/v1/chat/completions');
  assert.equal(chatUrl('http://localhost:11434/v1/chat/completions'), 'http://localhost:11434/v1/chat/completions');
  assert.equal(chatUrl('ftp://x'), null); assert.equal(chatUrl('nope'), null);
  assert.equal(isDeepseekEndpoint('https://api.deepseek.com/v1/chat/completions'), true);
  assert.equal(isDeepseekEndpoint('https://api.deepseek.com.evil.test/v1'), false);
  assert.equal(isDeepseekEndpoint('https://example.com/api.deepseek.com'), false);
  assert.equal(aiReady({ enabled: true, baseUrl: 'https://a.b', model: 'm' }, true), true);
  assert.equal(aiReady({ enabled: false, baseUrl: 'https://a.b', model: 'm' }, true), false);
});

test('responses, errors and redaction', () => {
  assert.equal(chatText({ choices: [{ message: { content: ' 好 ' } }] }), '好');
  assert.equal(chatText({}), null);
  assert.match(explainError({ status: 401 }), /API Key/);
  assert.match(explainError({ kind: 'network' }), /CORS/);
  assert.match(explainError({ kind: 'timeout' }), /超时/);
  assert.match(explainError({ kind: 'empty' }), /思考模式/);
  assert.ok(!redact(`bad key ${KEY}`, KEY).includes(KEY));
  assert.ok(!redact('Bearer abcdefghijkl1234').includes('abcdefghijkl1234'));
});

test('chat bodies carry only supported thinking and effort controls', () => {
  const plain = chatBody('deepseek-flash', TEST_MESSAGES, 1200);
  assert.equal('thinking' in plain, false);
  const disabled = chatBody('deepseek-flash', TEST_MESSAGES, 1200, { thinking: 'disabled', reasoningEffort: 'low' });
  assert.deepEqual(disabled.thinking, { type: 'disabled' });
  assert.equal(disabled.reasoning_effort, 'low');
  const invalid = chatBody('deepseek-flash', TEST_MESSAGES, 1200, { thinking: 'auto', reasoningEffort: 'ultra' });
  assert.equal('thinking' in invalid, false);
  assert.equal('reasoning_effort' in invalid, false);
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
  assert.equal(s.albumContext, '专注时放在唱机上的唱片');
  assert(s.topAlbums.every((album) => !('minutes' in album)), 'focus duration must not imply album playback duration');
  assert.deepEqual(s.cat, { tier: 'happy', mood: 82, feeds: 3 });
  const text = JSON.stringify(letterMessages(s, 'calm'));
  assert.ok(!text.includes('秘密待办')); assert.ok(!/"start"|1000/.test(text));
  assert.match(text, /平静/);
  assert.match(text, /两者不能相加或互相冒充/);
  assert.match(text, /不得说成听歌记录/);
});

test('letters: save, unread flag, once per period, retry after an hour', () => {
  const s = mem(), p = { id: 'w:2026-10-05' };
  assert.equal(needsLetter([], p, null, 0), true);
  assert.equal(needsLetter([], p, { id: p.id, at: 0 }, 1000), false);
  assert.equal(needsLetter([], p, { id: p.id, at: 0 }, 3600001), true);
  saveLetter(s, { id: p.id, lines: ['a'], at: 1, read: false });
  assert.equal(unreadCount(readLetters(s)), 1);
  assert.equal(readLetters(s)[0].direction, 'in');
  assert.equal(needsLetter(readLetters(s), p, null, 0), false);
  markRead(s, p.id); assert.equal(unreadCount(readLetters(s)), 0);
  s.setItem(LETTERS_KEY, 'garbage'); assert.deepEqual(readLetters(s), []);
  assert.deepEqual(cleanLetter('# 标题\n\n**你好**\n```x```\n第二行'), ['标题', '你好', '第二行']);
});

test('real listening, focus and evidence stay separate', () => {
  const period = { from: 0, to: 1e12, label: '最近 7 天' };
  const playback = [
    { start: 1000, durationMs: 20 * 60000, album: { title: '真实转过的唱片', artist: '甲' }, track: { title: '第一首', artist: '甲' } },
    { start: 2000, durationMs: 15 * 60000, album: { title: '真实转过的唱片', artist: '甲' }, track: { title: '第二首', artist: '甲' } },
    { start: 3000, durationMs: 5 * 60000, album: { title: '另一张', artist: '乙' }, track: { title: '第三首', artist: '乙' } }
  ];
  const listen = summarizeListening(playback, period);
  assert.deepEqual(listen.topAlbum, { title: '真实转过的唱片', artist: '甲' });
  assert.equal(listen.minutes, 40); assert.equal(listen.sessions, 3); assert.equal(listen.activeDays, 1);
  const sessions = [{ start: 1000, durationMs: 50 * 60000, completed: true, album: { title: '放在唱机上的唱片' } }];
  const base = letterSummary(sessions, period, { tier: 'happy', feeds: 2 }, { playbackSessions: playback, weather: { kind: 'rain', bucket: 'night' } });
  assert.equal(base.focusMinutes, 50); assert.equal(base.listening.minutes, 40);
  assert.ok(base.evidence.some((item) => item.text.includes('专注 50 分钟')));
  assert.ok(base.evidence.some((item) => item.text.includes('实际播放 40 分钟')));
  assert.ok(base.evidence.some((item) => item.text.includes('夜里 · 雨')));
  assert.ok(!('note' in base));
  const withNote = letterSummary(sessions, period, null, { includeNotes: true, notes: '今天有点累，但还是写完了一页。' });
  assert.equal(withNote.note.chars, 15);
  assert.ok(withNote.evidence.some((item) => item.kind === 'note'));
  const hidden = JSON.stringify(letterMessages(letterSummary(sessions, period, null, { includeNotes: false, notes: '不要发送这句' }), 'warm'));
  assert.ok(!hidden.includes('不要发送这句'));
  assert.ok(JSON.stringify(letterMessages(withNote, 'warm')).includes('今天有点累'));
});

test('input companionship reaches new letters as aggregate evidence only', () => {
  const period = { from: 0, to: 1e12, label: '最近 7 天' };
  const summary = letterSummary([], period, null, { input: { keyboard: 1240, click: 86, streak: 4, secret: '不要发送' } });
  assert.deepEqual(summary.input, { keyboard: 1240, click: 86, streak: 4 });
  assert.ok(summary.evidence.some((item) => item.kind === 'input' && item.text.includes('键盘 1,240')));
  const prompt = JSON.stringify(letterMessages(summary, 'warm'));
  assert.match(prompt, /input/);
  assert.match(prompt, /keyboard/);
  assert.match(prompt, /不能推断主人输入了什么/);
  assert.ok(!prompt.includes('不要发送'));
  const template = templateLetter(summary).join('\n');
  assert.match(template, /今天你敲了 1,240 次键盘、点了 86 次鼠标，奶糖都在旁边/);
  const saved = normalizeLetter({ id: 'input-evidence', lines: ['今天的信。'], at: 1, evidence: summary.evidence });
  assert.ok(saved.evidence.some((item) => item.kind === 'input'));
  const quiet = letterSummary([], period, null, { input: { keyboard: 0, click: 0, streak: 4 } });
  assert.equal(quiet.input, undefined);
  assert.doesNotMatch(templateLetter(quiet).join('\n'), /敲了|点了/);
});

test('letters read today counts from the shell snapshot and drop every other field', () => {
  const win = { albumInputStats: {
    status: 'active', streak: 5,
    today: { keyboard: 12, click: 3, total: 15, lastKey: 'a', app: 'private-app' },
    webhook: 'https://example.invalid/leak'
  } };
  assert.deepEqual(inputCompanionSnapshot(win), { keyboard: 12, click: 3, streak: 5 });
  assert.equal(inputCompanionSnapshot({ albumInputStats: { today: { keyboard: 0, click: 0 }, streak: 5 } }), null);
  assert.equal(inputCompanionSnapshot(null), null);
});

test('user letters normalize, cap and derive a stable subject', () => {
  const lines = cleanUserLetter('  第一行。后面不要 \r\n\r\n第二行  ');
  assert.deepEqual(lines, ['第一行。后面不要', '第二行']);
  assert.equal(userLetterSubject('今天终于把那一章写完了。还想再走一段。'), '今天终于把那一章写完了');
  const out = normalizeLetter({ id: 'my:1', direction: 'out', status: 'draft', source: 'user', subject: '给小屋', lines: ['a'], at: 12, read: false });
  assert.equal(out.status, 'draft'); assert.equal(out.source, 'user'); assert.equal(out.read, true);
  const legacy = normalizeLetter({ id: 'w:1', cadence: 'weekly', tone: 'warm', lines: ['旧信'], at: 1, read: false });
  assert.equal(legacy.direction, 'in'); assert.equal(legacy.status, 'delivered');
  const tooMany = normalizeLetter({ id: 'x', lines: Array.from({ length: 20 }, (_, i) => `第 ${i} 行`), at: 1 });
  assert.equal(tooMany.lines.length, 12);
});

test('local letter templates are warm but never invent listening or notes', () => {
  const quiet = templateLetter({ focusMinutes: 0, listening: null, cat: null, weather: null }).join('\n');
  assert.match(quiet, /安静/); assert.doesNotMatch(quiet, /听了|播放|随手记/);
  const facts = templateLetter({
    focusMinutes: 75, completedSessions: 3, listening: { minutes: 21, topAlbum: { title: '雨夜' } },
    topAlbums: [{ title: '专注唱片' }], cat: { feeds: 2 }, weather: { kind: 'snow', bucket: 'night' },
    note: { chars: 9 }
  }).join('\n');
  assert.match(facts, /专注了 75 分钟/); assert.match(facts, /真的转了 21 分钟/);
  assert.match(facts, /喂了 2 次/); assert.match(facts, /只留在这次回信里/);
  const reply = localLetterReply('今天有点乱。', { focusMinutes: 25, listening: { minutes: 8 }, weather: { kind: 'clear' } }).join('\n');
  assert.match(reply, /这段时间你在小屋里专注了 25 分钟/); assert.match(reply, /听了 8 分钟/);
  assert.doesNotMatch(reply, /这周你在小屋里专注/);
});

test('manual letter context uses the last seven days and opts notes in explicitly', () => {
  const now = new Date(2026, 9, 19, 12).getTime(), period = recentLetterPeriod(now, 7);
  assert.equal(period.label, '最近 7 天'); assert.ok(period.from < now && period.to === now);
  const sessions = [{ start: now - 60000, durationMs: 25 * 60000, completed: true }];
  const playbackSessions = [{ start: now - 120000, durationMs: 10 * 60000, album: { title: '真实听过的唱片' }, track: { title: '歌' } }];
  const summary = buildLetterContext({ sessions, playbackSessions, notes: '一段只能自己知道的随手记', includeNotes: true, weather: { kind: 'rain', bucket: 'night' }, now });
  assert.equal(summary.focusMinutes, 25); assert.equal(summary.listening.minutes, 10);
  assert.equal(summary.note.excerpt, '一段只能自己知道的随手记');
  assert.equal(buildLetterContext({ sessions, shareContext: false, now }), null);
  assert.equal(hasLetterFacts(letterSummary([], period, null, { weather: { kind: 'snow' } })), false);
  assert.equal(hasLetterFacts(summary), true);
});

test('drafts autosave, reload and clear; write failures are explicit', () => {
  const s = mem();
  const saved = saveLetterDraft(s, { text: '第一行\n第二行', shareContext: true });
  assert.equal(saved.ok, true); assert.equal(saved.draft.id, DRAFT_ID);
  assert.equal(readLetterDraft(s).lines[1], '第二行');
  assert.equal(readLetterDraft(s).status, 'draft');
  assert.equal(saveLetterDraft(s, { text: '' }).ok, true);
  assert.equal(readLetterDraft(s), null);
  const bad = { getItem: s.getItem, setItem: () => { throw new Error('quota'); } };
  const failure = trySaveLetter(bad, { id: 'x', lines: ['x'], at: 1 });
  assert.equal(failure.ok, false); assert.match(failure.error, /没有保存/);
  assert.equal(tryWriteLetters(bad, []).ok, false);
  assert.equal(clearLetterDraft(s).ok, true);
});

test('sending saves the original first and always leaves a grounded reply', async () => {
  const s = mem(), win = new EventTarget(); win.localStorage = s; win.sessionStorage = mem();
  const summary = letterSummary([{ start: 1, durationMs: 25 * 60000, completed: true }], { from: 0, to: 2e12, label: '最近 7 天' }, null, {
    playbackSessions: [{ start: 2, durationMs: 5 * 60000, album: { title: '真播放' }, track: { title: '曲' } }],
    weather: { kind: 'snow', bucket: 'night' }
  });
  const local = await sendCabinLetter({ storage: s, win, text: '今天写得不多，但我想和你说一声。', summary, now: 1000, replyDelayMs: 0 });
  assert.equal(local.ok, true); assert.equal(local.fallback, true);
  assert.equal(local.outgoing.status, 'sent'); assert.equal(local.outgoing.direction, 'out');
  assert.equal(local.reply.replyTo, local.outgoing.id); assert.equal(local.reply.direction, 'in');
  assert.ok(local.reply.evidence.some((item) => item.kind === 'listening'));
  assert.equal(readLetters(s).length, 2);

  writeAi(s, { enabled: true, baseUrl: 'https://api.mock/v1', model: 'm', tone: 'calm' });
  s.setItem(AI_KEY_KEY, JSON.stringify({ v: 2, key: KEY, endpoint: chatUrl('https://api.mock/v1'), revision: 1 }));
  const ai = await sendCabinLetter({ storage: s, win, text: '这是第二封。', summary, now: 2000, replyDelayMs: 0,
    chatImpl: async () => ({ ok: true, text: '我读到了。\n灯还亮着。' }) });
  assert.equal(ai.ok, true); assert.equal(ai.reply.source, 'ai'); assert.equal(ai.fallback, false);

  const fallback = await sendCabinLetter({ storage: s, win, text: 'AI 坏掉也不要丢信。', summary, now: 3000, replyDelayMs: 0,
    chatImpl: async () => ({ ok: false, error: 'mock down' }) });
  assert.equal(fallback.ok, true); assert.equal(fallback.reply.source, 'template');
  assert.match(fallback.notice, /mock down|小屋用自己的话/);
  assert.equal(readLetters(s).filter((letter) => letter.direction === 'out').length, 3);
});

test('a failed first write keeps the draft and reports why sending stopped', async () => {
  const map = new Map(), win = new EventTarget();
  let fail = false;
  const s = { getItem: (key) => map.has(key) ? map.get(key) : null, setItem: (key, value) => { if (fail) throw new Error('quota'); map.set(key, String(value)); }, removeItem: (key) => map.delete(key) };
  win.localStorage = s; win.sessionStorage = mem();
  assert.equal(saveLetterDraft(s, { text: '别丢掉这一封。' }).ok, true);
  fail = true;
  const result = await sendCabinLetter({ storage: s, win, text: '别丢掉这一封。', now: 1, replyDelayMs: 0 });
  assert.equal(result.ok, false); assert.match(result.error, /没有保存/);
  fail = false;
  assert.equal(readLetterDraft(s).lines[0], '别丢掉这一封。');
});

test('user prose survives long paragraphs, many lines, and repeated draft reloads', () => {
  const s = mem();
  for (const text of ['字'.repeat(2880), Array.from({ length: 30 }, (_, i) => `第 ${i} 行`).join('\n')]) {
    for (let round = 0; round < 3; round++) {
      assert.equal(saveLetterDraft(s, { text, shareContext: false }).ok, true);
      const draft = readLetterDraft(s);
      assert.equal(draft.lines.join('\n'), text);
      assert.equal(draft.shareContext, false);
      assert.deepEqual(normalizeLetter(draft), draft);
    }
  }
});

test('failed reply storage retains draft and interruption can recover without duplicating the send', async () => {
  const s = mem(), win = new EventTarget(); win.localStorage = s; win.sessionStorage = mem();
  saveLetterDraft(s, { text: '留住这封信', shareContext: false });
  writeAi(s, { enabled: true, baseUrl: 'https://api.mock/v1', model: 'm' });
  s.setItem(AI_KEY_KEY, JSON.stringify({ v: 2, key: KEY, endpoint: chatUrl('https://api.mock/v1'), revision: 1 }));
  const originalSet = s.setItem;
  const result = await sendCabinLetter({ storage: s, win, text: '留住这封信', replyDelayMs: 0,
    chatImpl: async () => { s.setItem = () => { throw new Error('quota'); }; return { ok: true, text: '收到' }; } });
  assert.equal(result.ok, false);
  assert.equal(readLetterDraft(s).lines[0], '留住这封信');
  s.setItem = originalSet;
  const recovered = recoverCabinLetter({ storage: s, win, id: result.outgoing.id });
  assert.equal(recovered.ok, true);
  assert.equal(recovered.reply.source, 'template');
  assert.equal(readLetterDraft(s), null, 'recovery removes the already-sent draft');
  assert.equal(recoverCabinLetter({ storage: s, win, id: result.outgoing.id }).reply.id, recovered.reply.id);
  assert.equal(readLetters(s).filter((l) => l.replyTo === result.outgoing.id).length, 1);
});

test('outbound replies discard stale AI results and preserve a newer draft', async () => {
  const s = mem(), win = new EventTarget(); win.localStorage = s; win.sessionStorage = mem();
  writeAi(s, { enabled: true, baseUrl: 'https://api.mock/v1', model: 'm' });
  s.setItem(AI_KEY_KEY, JSON.stringify({ v: 2, key: KEY, endpoint: chatUrl('https://api.mock/v1'), revision: 1 }));
  saveLetterDraft(s, { text: '第一封' });
  const result = await sendCabinLetter({ storage: s, win, text: '第一封', replyDelayMs: 0, chatImpl: async () => {
    win.dispatchEvent(new Event('cabin:ai-settings'));
    saveLetterDraft(s, { text: '第二封草稿', shareContext: false });
    return { ok: true, text: '不能接纳的旧回复' };
  } });
  assert.equal(result.ok, true); assert.equal(result.reply.source, 'template');
  assert.ok(!result.reply.lines.join('').includes('不能接纳'));
  assert.equal(readLetterDraft(s).lines[0], '第二封草稿');
});

test('automatic delivery falls back locally even when a transport throws', async () => {
  const { deliverLetter } = await import('./letter-delivery.mjs');
  const s = mem(), win = new EventTarget(); win.localStorage = s; win.sessionStorage = mem();
  writeAi(s, { enabled: true, baseUrl: 'https://api.mock/v1', model: 'm' });
  s.setItem(AI_KEY_KEY, JSON.stringify({ v: 2, key: KEY, endpoint: chatUrl('https://api.mock/v1'), revision: 1 }));
  const result = await deliverLetter({ win, force: true, sessions: [], chatImpl: async () => { throw new Error('offline'); } });
  assert.equal(result.source, 'template');
  assert.equal(readLetters(s).length, 1);
});

test('mailbox groups replies, filters directions and paginates stably', () => {
  const s = mem(), now = 1_700_000_000_000;
  for (let i = 0; i < 13; i++) saveLetter(s, { id: `in-${i}`, direction: 'in', status: 'delivered', lines: [`来信 ${i}`], at: now - i, read: i > 3 });
  saveLetter(s, { id: 'out-1', direction: 'out', status: 'sent', subject: '我寄出的', lines: ['寄出内容'], at: now + 5, read: true });
  saveLetter(s, { id: 'reply-1', direction: 'in', status: 'delivered', replyTo: 'out-1', lines: ['回信内容'], at: now + 6, read: false });
  const rows = mailboxRows(readLetters(s));
  assert.equal(rows[0].id, 'out-1'); assert.equal(rows[0].reply.id, 'reply-1'); assert.equal(rows[0].unread, true);
  assert.equal(rows.filter((row) => row.direction === 'out').length, 1);
  assert.equal(mailboxRows(readLetters(s), 'in').length, 13);
  assert.equal(mailboxRows(readLetters(s), 'out').length, 1);
  const first = pageSlice(rows, 1, 6), last = pageSlice(rows, 3, 6);
  assert.equal(first.rows.length, 6); assert.equal(first.totalPages, 3); assert.equal(last.rows.length, 2);
  assert.equal(pageSlice(rows, 99, 6).page, 3);
});

test('web transport: mocked endpoint, auth header, errors, timeout', async () => {
  const win = { localStorage: mem(), sessionStorage: mem(), document: { documentElement: { dataset: {} } }, addEventListener() {}, removeEventListener() {} };
  win.localStorage.setItem(AI_KEY_KEY, JSON.stringify({ v: 2, key: KEY, endpoint: 'https://api.mock/v1/chat/completions', revision: 1 }));
  const settings = { baseUrl: 'https://api.mock/v1', model: 'm' };
  let seen;
  const ok = await chat(settings, [{ role: 'user', content: 'hi' }], { win, fetchImpl: async (u, o) => { seen = { u, o }; return { ok: true, json: async () => ({ choices: [{ message: { content: '好' } }] }) }; } });
  assert.deepEqual(ok, { ok: true, text: '好' });
  assert.equal(seen.u, 'https://api.mock/v1/chat/completions'); assert.equal(seen.o.headers.Authorization, `Bearer ${KEY}`);
  assert.equal('thinking' in JSON.parse(seen.o.body), false);
  const bad = await chat(settings, [], { win, fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ error: { message: `wrong ${KEY}` } }) }) });
  assert.equal(bad.ok, false); assert.ok(!bad.error.includes(KEY));
  const cors = await chat(settings, [], { win, fetchImpl: async () => { throw new TypeError('Failed to fetch'); } });
  assert.match(cors.error, /CORS/);
  const slow = await chat(settings, [], { win, timeoutMs: 20, fetchImpl: (_u, o) => new Promise((_, rej) => o.signal.addEventListener('abort', () => rej(Object.assign(new Error('x'), { name: 'AbortError' })))) });
  assert.match(slow.error, /超时/);
});

test('keyless local templates send no Authorization header', async () => {
  const win = { localStorage: mem(), sessionStorage: mem(), document: { documentElement: { dataset: {} } }, addEventListener() {}, removeEventListener() {} };
  let seen;
  const result = await chat({ provider: 'ollama', baseUrl: 'http://127.0.0.1:11434/v1', model: 'qwen3:8b' }, [{ role: 'user', content: 'hi' }], {
    win,
    fetchImpl: async (_url, options) => {
      seen = options;
      return { ok: true, json: async () => ({ choices: [{ message: { content: 'local' } }] }) };
    }
  });
  assert.equal(result.ok, true);
  assert.equal('Authorization' in seen.headers, false);
});

test('official DeepSeek uses deepseek-flash with thinking disabled and reports empty content precisely', async () => {
  const win = { localStorage: mem(), sessionStorage: mem(), document: { documentElement: { dataset: {} } }, addEventListener() {}, removeEventListener() {} };
  const endpoint = 'https://api.deepseek.com/v1/chat/completions';
  win.localStorage.setItem(AI_KEY_KEY, JSON.stringify({ v: 2, key: KEY, endpoint, revision: 1 }));
  const settings = { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-flash' };
  let seen;
  const ok = await chat(settings, [{ role: 'user', content: '排一张学习歌单' }], {
    win,
    json: true,
    maxTokens: 1200,
    fetchImpl: async (_url, options) => {
      seen = JSON.parse(options.body);
      return { ok: true, json: async () => ({ choices: [{ message: { content: '{"tracks":[]}' } }] }) };
    }
  });
  assert.equal(ok.ok, true);
  assert.equal(seen.model, 'deepseek-flash');
  assert.deepEqual(seen.thinking, { type: 'disabled' });
  assert.deepEqual(seen.response_format, { type: 'json_object' });

  const empty = await chat(settings, [{ role: 'user', content: '排一张学习歌单' }], {
    win,
    json: true,
    fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '', reasoning_content: '思考已占满输出' } }] }) })
  });
  assert.equal(empty.ok, false);
  assert.match(empty.error, /思考模式/);
});

test('structured chat requests ask for JSON mode and retry without it for older endpoints', async () => {
  const win = { localStorage: mem(), sessionStorage: mem(), document: { documentElement: { dataset: {} } }, addEventListener() {}, removeEventListener() {} };
  win.localStorage.setItem(AI_KEY_KEY, JSON.stringify({ v: 2, key: KEY, endpoint: 'https://api.mock/v1/chat/completions', revision: 1 }));
  const settings = { baseUrl: 'https://api.mock/v1', model: 'm' };
  const bodies = [];
  const ok = await chat(settings, [{ role: 'user', content: 'hi' }], {
    win,
    json: true,
    temperature: 0.2,
    fetchImpl: async (_url, options) => {
      bodies.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }] }) };
    }
  });
  assert.equal(ok.ok, true);
  assert.deepEqual(bodies[0].response_format, { type: 'json_object' });
  assert.equal(bodies[0].temperature, 0.2);

  let calls = 0;
  const retry = await chat(settings, [{ role: 'user', content: 'hi' }], {
    win,
    json: true,
    fetchImpl: async (_url, options) => {
      calls++;
      const body = JSON.parse(options.body);
      if (calls === 1) return { ok: false, status: 400, json: async () => ({ error: { message: 'response_format unsupported' } }) };
      assert.equal('response_format' in body, false);
      return { ok: true, json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }] }) };
    }
  });
  assert.equal(retry.ok, true);
  assert.equal(calls, 2);
});

test('desktop transport goes through the shell command and result event', async () => {
  const listeners = new Set(), cmds = [];
  const win = { document: { documentElement: { dataset: { desktopClient: 'true' } } }, addEventListener: (_n, f) => listeners.add(f), removeEventListener: (_n, f) => listeners.delete(f) };
  const command = (name, params) => { cmds.push([name, params]); setTimeout(() => { for (const f of [...listeners]) f({ detail: { id: params.id, ok: true, text: '好' } }); }, 5); };
  const r = await chat({ baseUrl: 'https://api.mock', model: 'm' }, [{ role: 'user', content: 'hi' }], { win, command });
  assert.deepEqual(r, { ok: true, text: '好' });
  assert.equal(cmds[0][0], 'ai-chat'); assert.ok(!('key' in cmds[0][1]));
  assert.equal(cmds[0][1].url, 'https://api.mock/chat/completions');
  assert.equal('thinking' in JSON.parse(cmds[0][1].body), false);
});

test('desktop transport disables thinking for the official DeepSeek endpoint', async () => {
  const listeners = new Set(), cmds = [];
  const win = { document: { documentElement: { dataset: { desktopClient: 'true' } } }, addEventListener: (_n, f) => listeners.add(f), removeEventListener: (_n, f) => listeners.delete(f) };
  const command = (name, params) => {
    cmds.push([name, params]);
    setTimeout(() => { for (const f of [...listeners]) f({ detail: { id: params.id, ok: true, text: '好' } }); }, 5);
  };
  const result = await chat({ baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-flash' }, [], { win, command });
  assert.deepEqual(result, { ok: true, text: '好' });
  assert.deepEqual(JSON.parse(cmds[0][1].body).thinking, { type: 'disabled' });
});

test('desktop transport routes the Codex CLI template without a key', async () => {
  const listeners = new Set(), cmds = [];
  const win = { document: { documentElement: { dataset: { desktopClient: 'true' } } }, addEventListener: (_n, f) => listeners.add(f), removeEventListener: (_n, f) => listeners.delete(f) };
  const command = (name, params) => {
    cmds.push([name, params]);
    setTimeout(() => { for (const f of [...listeners]) f({ detail: { id: params.id, ok: true, text: '本地回答' } }); }, 5);
  };
  const result = await chat({ provider: 'codex', baseUrl: '', model: '' }, [{ role: 'user', content: 'hi' }], { win, command });
  assert.deepEqual(result, { ok: true, text: '本地回答' });
  assert.equal(cmds[0][0], 'ai-chat-cli');
  assert.equal(cmds[0][1].url, undefined);
  assert.match(cmds[0][1].body, /hi/);
});

test('aborting a chat cancels the desktop task and resolves a cancelled result', async () => {
  const listeners = new Set(), cmds = [];
  const win = { document: { documentElement: { dataset: { desktopClient: 'true' } } }, addEventListener: (_n, f) => listeners.add(f), removeEventListener: (_n, f) => listeners.delete(f) };
  const command = (name, params) => {
    cmds.push([name, params]);
    if (name === 'ai-chat-cli') setTimeout(() => controller.abort(), 5);
  };
  const controller = new AbortController();
  const result = await chat({ provider: 'codex', baseUrl: '', model: '' }, [{ role: 'user', content: 'hi' }], {
    win, command, signal: controller.signal
  });
  assert.equal(result.ok, false);
  assert.equal(result.kind, 'cli-cancelled');
  assert.deepEqual(cmds.map(([name]) => name), ['ai-chat-cli', 'ai-cancel']);
  assert.equal(cmds[1][1].id, cmds[0][1].id);
});

test('aborting a web request uses the fetch signal and reports cancellation', async () => {
  const win = { localStorage: mem(), sessionStorage: mem(), document: { documentElement: { dataset: {} } }, addEventListener() {}, removeEventListener() {} };
  win.localStorage.setItem(AI_KEY_KEY, JSON.stringify({ v: 2, key: KEY, endpoint: 'https://api.mock/v1/chat/completions', revision: 1 }));
  const controller = new AbortController();
  const pending = chat({ baseUrl: 'https://api.mock/v1', model: 'm' }, [], {
    win,
    signal: controller.signal,
    fetchImpl: (_url, options) => new Promise((_, reject) => {
      options.signal.addEventListener('abort', () => reject(Object.assign(new Error('cancelled'), { name: 'AbortError' })));
    })
  });
  setTimeout(() => controller.abort(), 5);
  const result = await pending;
  assert.equal(result.ok, false);
  assert.equal(result.kind, 'cancelled');
  assert.match(result.error, /取消/);
});


test('letters discard late replies after settings/key changes, including off then on', async () => {
  const { deliverLetter } = await import('./letter-delivery.mjs');
  const { saveKey } = await import('./ai-transport.mjs');
  const win = new EventTarget(); win.localStorage = mem(); win.sessionStorage = mem();
  const settings = { enabled: true, baseUrl: 'https://api.mock/v1', model: 'm' };
  writeAi(win.localStorage, settings); saveKey(KEY, { win });
  let finish;
  const pending = deliverLetter({ win, sessions: [], force: true, chatImpl: () => new Promise((resolve) => { finish = resolve; }) });
  win.dispatchEvent(new Event('cabin:ai-settings'));
  finish({ ok: true, text: 'late reply' });
  assert.equal(await pending, null);
  assert.equal(readLetters(win.localStorage).length, 0);
  const letter = await deliverLetter({ win, sessions: [], force: true, chatImpl: async () => ({ ok: true, text: 'Welcome home.' }) });
  assert.equal(letter.lines[0], 'Welcome home.');
  assert.equal(readLetters(win.localStorage).length, 1);
});

test('web credential cannot follow an edited endpoint or a redirect', async () => {
  const { saveKey, keyState } = await import('./ai-transport.mjs');
  const win = new EventTarget(); win.localStorage = mem(); win.sessionStorage = mem();
  saveKey(KEY, { win, baseUrl: 'https://api.mock/v1' });
  let calls = 0;
  const bad = await chat({ baseUrl: 'https://other.mock/v1', model: 'm' }, [], { win, fetchImpl: async () => { calls++; } });
  assert.equal(bad.ok, false); assert.equal(calls, 0);
  assert.equal(keyState(win).endpoint, 'https://api.mock/v1/chat/completions');
  assert.equal(chatUrl('http://remote.mock/v1'), null);
  assert.equal(chatUrl('https://api.mock/v1?token=secret'), null);
});

test('cross-tab activity keeps letters; only credential/settings changes or clear invalidate them', async () => {
  const { deliverLetter } = await import('./letter-delivery.mjs');
  const { saveKey } = await import('./ai-transport.mjs');
  for (const [key, expected] of [
    ['flow-cabin-playback-sessions-v1', true],
    ['album-circle-sound-v1', true],
    ['flow-cabin-ai-v1', false],
    ['flow-cabin-ai-key-v1', false],
    [null, false]
  ]) {
    const win = new EventTarget(); win.localStorage = mem(); win.sessionStorage = mem();
    writeAi(win.localStorage, { enabled: true, baseUrl: 'https://api.mock/v1', model: 'm' });
    saveKey(KEY, { win });
    let finish;
    const pending = deliverLetter({ win, sessions: [], force: true, chatImpl: () => new Promise(resolve => { finish = resolve; }) });
    const event = new Event('storage');
    Object.defineProperties(event, { key: { value: key }, storageArea: { value: win.localStorage } });
    win.dispatchEvent(event);
    finish({ ok: true, text: 'A quiet moment at home.' });
    assert.equal(Boolean(await pending), expected, `storage key: ${key}`);
    assert.equal(readLetters(win.localStorage).length, expected ? 1 : 0);
  }
});

test('purging a thread removes all replies atomically and blocks stale saves and late delivery', async () => {
  const { purgeLetterThread } = await import('./letter-reply.mjs');
  const { readLetterRecords } = await import('./ai-model.mjs');
  const storage = mem(), win = new EventTarget(); win.localStorage = storage; win.sessionStorage = mem();
  saveLetterDraft(storage, { text: 'private-outgoing' });
  const pending = sendCabinLetter({ storage, win, text: 'private-outgoing', now: Date.now() + 1, replyDelayMs: 20 });
  const outgoing = readLetters(storage).find((letter) => letter.status === 'sending');
  assert.equal(purgeLetterThread({ storage, id: outgoing.id, win }).ok, false);
  saveLetter(storage, { id: 'extra-reply', at: 1, lines: ['private-extra'], replyTo: outgoing.id });
  organizeLetterThread({ storage, id: outgoing.id, action: 'trash', win });
  const trash = readLetters(storage).find((letter) => letter.id === outgoing.id);
  const old = storage.getItem(LETTERS_KEY), stale = readLetters(storage);
  const bad = { getItem: storage.getItem, setItem() { throw new Error('quota'); } };
  assert.equal(purgeLetterThread({ storage: bad, id: outgoing.id, expectedOrganizedAt: trash.organizedAt, win }).ok, false);
  assert.equal(storage.getItem(LETTERS_KEY), old);
  assert.equal(purgeLetterThread({ storage, id: outgoing.id, expectedOrganizedAt: trash.organizedAt - 1, win }).ok, false);
  assert.equal(purgeLetterThread({ storage, id: outgoing.id, expectedOrganizedAt: trash.organizedAt, now: 100, win }).ok, true);
  assert.equal((await pending).deleted, true);
  assert.equal(recoverCabinLetter({ storage, id: outgoing.id, win }).ok, false);
  assert.deepEqual(readLetters(storage), []);
  assert.equal(readLetterDraft(storage), null);
  assert.equal(trySaveLetter(storage, outgoing).deleted, true);
  assert.equal(trySaveLetter(storage, { id: 'late-reply', at: 999, lines: ['private-late'], replyTo: outgoing.id }).deleted, true);
  assert.equal(tryWriteLetters(storage, stale).ok, true);
  markRead(storage, 'extra-reply');
  assert.equal(readLetters(storage).length, 0);
  assert.equal(readLetterRecords(storage).length, 3);
  assert.ok(!storage.getItem(LETTERS_KEY).includes('private'));
  saveLetter(storage, { id: 'unrelated', at: 1000, lines: ['new'] });
  assert.equal(readLetterRecords(storage).filter((letter) => letter.purgedAt != null).length, 3);
  assert.equal(saveLetterDraft(storage, { text: 'private-outgoing', expectedDraftId: DRAFT_ID }).deleted, true);
  assert.equal((await sendCabinLetter({ storage, win, text: 'private-outgoing', draftId: DRAFT_ID, replyDelayMs: 0 })).deleted, true);
  const fresh = saveLetterDraft(storage, { text: 'fresh draft' });
  assert.equal(fresh.ok, true); assert.notEqual(fresh.draft.id, DRAFT_ID);
  assert.equal(saveLetterDraft(storage, { text: 'fresh edited', expectedDraftId: fresh.draft.id }).draft.id, fresh.draft.id);
  assert.equal(clearLetterDraft(storage).ok, true); assert.equal(readLetterDraft(storage), null);
});

test('purged automatic letters do not regenerate or dispatch another AI request', async () => {
  const { deliverLetter } = await import('./letter-delivery.mjs');
  const { purgeLetterThread } = await import('./letter-reply.mjs');
  const win = new EventTarget(); win.localStorage = mem(); win.sessionStorage = mem();
  const now = Date.now(), id = letterPeriod(now, 'weekly').id;
  saveLetter(win.localStorage, { id, lines: ['old'], at: now });
  organizeLetterThread({ storage: win.localStorage, id, action: 'trash', win });
  const root = readLetters(win.localStorage)[0];
  assert.equal(purgeLetterThread({ storage: win.localStorage, id, expectedOrganizedAt: root.organizedAt, win }).ok, true);
  let calls = 0;
  assert.equal(await deliverLetter({ win, now, force: true, sessions: [], chatImpl: async () => { calls++; } }), null);
  assert.equal(calls, 0); assert.equal(readLetters(win.localStorage).length, 0);
});

test('corrupt letter stores refuse writes instead of clearing unknown existing data', () => {
  const storage = mem(); storage.setItem(LETTERS_KEY, '{broken');
  assert.equal(trySaveLetter(storage, { id: 'new', lines: ['new'], at: 1 }).ok, false);
  assert.equal(tryWriteLetters(storage, []).ok, false);
  assert.equal(storage.getItem(LETTERS_KEY), '{broken');
});

test('web keys migrate out of persistent storage and stay within the current tab session', async () => {
  const { saveKey, keyState } = await import('./ai-transport.mjs');
  const persistent = mem(), session = mem(), win = { localStorage: persistent, sessionStorage: session };
  persistent.setItem(AI_KEY_KEY, JSON.stringify({ v: 2, key: KEY, endpoint: chatUrl('https://api.mock/v1'), revision: 'legacy' }));
  assert.equal(keyState(win).stored, true);
  assert.equal(persistent.getItem(AI_KEY_KEY), null);
  assert.ok(session.getItem(AI_KEY_KEY));
  const otherTab = { localStorage: persistent, sessionStorage: mem() };
  assert.equal(keyState(otherTab).stored, false);
  assert.equal(saveKey('', { win, baseUrl: 'https://api.mock/v1' }), true);
  assert.equal(keyState(win).stored, false);
  assert.equal(session.getItem(AI_KEY_KEY), null);
  assert.equal(saveKey(KEY, { win, baseUrl: 'https://api.mock/v1' }), true);
  assert.equal(persistent.getItem(AI_KEY_KEY), null);
  assert.equal(keyState({ localStorage: persistent, sessionStorage: mem() }).stored, false);
});
