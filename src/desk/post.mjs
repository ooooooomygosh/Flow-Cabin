// The post box's letters: what stands in the red box on the desk (DEsk's post box, src/post.c, from
// https://github.com/fyzugx/DEsk, MIT, (c) 2026 The DEsk authors). DEsk files every notification as a
// letter -- who it is from, what it is about, what it says, when it came -- and keeps them in the box
// until they are read or thrown away. Here the letters are the app's own: the welcome on a first run,
// one per new version, the notices that matter, and (with 实验室 › 小屋来信) the cabin's letters.
// Pure functions over plain data; the storage and the window event live in usePost.js.

export const POST_KEY = 'flow-cabin-post-v1';
export const POST_EVENT = 'cabin:post';
export const MAX_LETTERS = 50;
export const KINDS = Object.freeze(['welcome', 'release', 'notice', 'mail']);
export const APP_NAME = '心流小屋';
// A notice said twice within this long is one letter.
export const NOTICE_WINDOW = 10 * 60000;

const text = (value, max) => String(value ?? '').replace(/\r\n?/g, '\n').trim().slice(0, max);
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;

// One letter, cleaned; null when it is not one.
export function normalizeLetter(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = text(raw.id, 80), title = text(raw.title, 120), body = text(raw.body, 2000);
  if (!id || (!title && !body)) return null;
  const kind = KINDS.includes(raw.kind) ? raw.kind : 'notice';
  const letter = { id, kind, from: text(raw.from, 40) || APP_NAME, title, body, at: finite(raw.at, 0), read: Boolean(raw.read) };
  if (raw.tone === 'error') letter.tone = 'error';
  if (Array.isArray(raw.steps)) letter.steps = raw.steps.filter((s) => s && typeof s.id === 'string').slice(0, 4).map((s) => ({ id: text(s.id, 24), label: text(s.label, 24), hint: text(s.hint, 80) }));
  if (Array.isArray(raw.actions)) letter.actions = raw.actions.filter((a) => a && typeof a.id === 'string').slice(0, 3).map((a) => ({ id: text(a.id, 40), label: text(a.label, 24), ...(a.arg ? { arg: text(a.arg, 80) } : {}) }));
  if (raw.source === 'cabin') letter.source = 'cabin';
  return letter;
}

// Newest first; the same id once.
export function sortLetters(list) {
  const seen = new Set();
  return list.filter((l) => l && !seen.has(l.id) && seen.add(l.id)).sort((a, b) => b.at - a.at);
}

// The box as stored: { letters, gone } -- `gone` remembers the ids thrown away, so a letter the app
// would send again (the welcome, a version's letter) does not come back.
export function normalizePost(raw) {
  const letters = Array.isArray(raw?.letters) ? raw.letters.map(normalizeLetter).filter(Boolean) : [];
  const gone = Array.isArray(raw?.gone) ? raw.gone.filter((id) => typeof id === 'string').slice(-100) : [];
  return { letters: sortLetters(letters).slice(0, MAX_LETTERS), gone };
}

export function readPost(storage) {
  try { return normalizePost(JSON.parse(storage?.getItem?.(POST_KEY) || 'null')); } catch { return normalizePost(null); }
}
export function writePost(storage, post) {
  const value = normalizePost(post);
  storage?.setItem?.(POST_KEY, JSON.stringify(value));
  return value;
}

// A letter into the box. One already there, or thrown away, is not delivered twice. When the box is
// full the oldest read letter leaves first, then the oldest of all.
export function deliver(post, raw) {
  const letter = normalizeLetter(raw);
  if (!letter || post.gone.includes(letter.id) || post.letters.some((l) => l.id === letter.id)) return post;
  const letters = sortLetters([letter, ...post.letters]);
  while (letters.length > MAX_LETTERS) {
    let i = -1;
    for (let k = letters.length - 1; k >= 0; k--) if (letters[k].read) { i = k; break; }
    letters.splice(i >= 0 ? i : letters.length - 1, 1);
  }
  return { ...post, letters };
}
export const markRead = (post, id, read = true) => ({ ...post, letters: post.letters.map((l) => l.id === id ? { ...l, read } : l) });
export const discard = (post, id) => post.letters.some((l) => l.id === id) ? { letters: post.letters.filter((l) => l.id !== id), gone: [...post.gone, id].slice(-100) } : post;
export const unreadCount = (letters) => letters.filter((l) => !l.read).length;

// ---- the letters the app writes ----

// The first run: the guide's three steps, as a letter. Each step opens the guide at that step.
export const WELCOME_ID = 'welcome';
export function welcomeLetter(at = Date.now()) {
  return {
    id: WELCOME_ID, kind: 'welcome', from: APP_NAME, at, read: false,
    title: '欢迎来到心流小屋',
    body: '这张书桌上的东西都能用：抬头是唱片架和唱机，台钟管专注，抽屉里是日记和设置。先花一分钟准备三件事，每一件都能跳过，以后在「设置」里随时改。',
    steps: [
      { id: 'source', label: '选音源', hint: '本地音乐、QQ 音乐或网易云' },
      { id: 'room', label: '挑伙伴', hint: '一个房间，一只陪你的伙伴' },
      { id: 'test', label: '试听', hint: '放一段声音，确认听得到' },
    ],
    actions: [{ id: 'settings', label: '打开设置', arg: 'music' }],
  };
}

// A version's letter: the notes of that release, the first time it runs.
export function releaseLetter(release, at = Date.now()) {
  if (!release?.version) return null;
  const items = Array.isArray(release.items) ? release.items : [];
  return {
    id: `release:${release.version}`, kind: 'release', from: `${APP_NAME} v${release.version}`, at, read: false,
    title: release.title || `小屋已经更新到 v${release.version}`,
    body: items.length ? items.map((item) => `· ${item}`).join('\n') : '这个版本没有单独的更新摘要，你的收藏、设置和记录都保持原样。',
    actions: [{ id: 'settings', label: '版本历史', arg: 'about' }],
  };
}

// A notice that matters (an error, or one sent with { keep: true }) is kept as a letter too; the toast
// still shows. The same words twice within NOTICE_WINDOW are one letter.
export function noticeLetter(post, message, { tone = '', keep = false, from = '', title = '', at = Date.now() } = {}) {
  const body = text(message, 600);
  if (!body || (tone !== 'error' && !keep)) return null;
  const same = post.letters.find((l) => l.kind === 'notice' && l.body === body && at - l.at < NOTICE_WINDOW);
  if (same) return null;
  return { id: `notice:${at.toString(36)}:${hash(body)}`, kind: 'notice', from: from || APP_NAME, at, read: false, tone: tone === 'error' ? 'error' : '', title: title || (tone === 'error' ? '出了点问题' : '一张便条'), body };
}
function hash(value) {
  let h = 2166136261;
  for (const ch of value) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return (h >>> 0).toString(36);
}

// The cabin's letters (实验室 › 小屋来信, src/ai): the ones that came in, as letters in the box. They
// stay the journal's: read here marks them read there, and 回信 opens the journal's letters.
export function cabinLetters(list = []) {
  return list.filter((l) => l && l.direction === 'in' && l.status !== 'draft' && !l.trashed && Array.isArray(l.lines)).map((l) => {
    const lines = l.lines.map((line) => String(line || '').trim()).filter(Boolean);
    return {
      id: `cabin:${l.id}`, kind: 'mail', source: 'cabin', from: l.source === 'ai' ? '小屋 · AI 回信' : '小屋 · 奶糖',
      title: (l.subject || (l.period ? `${l.period}的信` : '小屋来信')).slice(0, 40), body: lines.join('\n'),
      at: finite(l.at, 0), read: Boolean(l.read), actions: [{ id: 'mail', label: '回信' }],
    };
  });
}

// Everything in the box, newest first.
export const boxLetters = (post, cabin = []) => sortLetters([...post.letters, ...cabinLetters(cabin)]).slice(0, MAX_LETTERS + 20);

// The time on a letter: HH:MM today, else M月D日.
export function letterTime(at, now = Date.now()) {
  const d = new Date(at), n = new Date(now);
  if (!at) return '';
  if (d.toDateString() === n.toDateString()) return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}
