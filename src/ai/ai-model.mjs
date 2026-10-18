// AI（Beta）: optional, off by default. The user brings any OpenAI-compatible endpoint
// (base URL + key + model). Pure helpers only (no DOM, no network) — tested in ai.test.mjs.
// The key never goes into logs, letters or prompts; in the desktop app it lives in the
// shell (Electron safeStorage), in the web build only in this browser's localStorage.
import { formatMinutes, startOfDay, startOfWeek, dayKey } from '../focus/stats/stats-model.mjs';

export const AI_SETTINGS_KEY = 'flow-cabin-ai-v1', AI_KEY_KEY = 'flow-cabin-ai-key-v1', LETTERS_KEY = 'flow-cabin-letters-v1';
export const AI_EVENT = 'cabin:ai-settings', LETTER_EVENT = 'cabin:letter';
export const TONES = Object.freeze([
  { id: 'warm', label: '温柔', hint: '像老朋友一样温暖' },
  { id: 'playful', label: '俏皮', hint: '小猫口吻，轻松好玩' },
  { id: 'calm', label: '平静鼓励', hint: '安静、克制、给一点力量' }
]);
export const CADENCES = Object.freeze([{ id: 'daily', label: '每天' }, { id: 'weekly', label: '每周' }]);
export const DEFAULT_AI = Object.freeze({ v: 1, enabled: false, baseUrl: '', model: '', cadence: 'weekly', tone: 'warm' });
export const TIMEOUT_MS = 30000, MAX_LETTERS = 60;
const DAY = 86400000;

const pick = (v, list, fallback) => list.some((x) => x.id === v) ? v : fallback;
export function normalizeAi(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return { v: 1, enabled: r.enabled === true, baseUrl: typeof r.baseUrl === 'string' ? r.baseUrl.trim().slice(0, 300) : '',
    model: typeof r.model === 'string' ? r.model.trim().slice(0, 120) : '', cadence: pick(r.cadence, CADENCES, 'weekly'), tone: pick(r.tone, TONES, 'warm') };
}
export function readAi(storage) { try { return normalizeAi(JSON.parse(storage?.getItem?.(AI_SETTINGS_KEY) || 'null')); } catch { return normalizeAi(null); } }
export function writeAi(storage, value) { const v = normalizeAi(value); storage?.setItem?.(AI_SETTINGS_KEY, JSON.stringify(v)); return v; }

// "https://api.deepseek.com" / ".../v1" / ".../v1/chat/completions" → the chat/completions URL.
export function chatUrl(baseUrl) {
  let url; try { url = new URL(String(baseUrl || '').trim()); } catch { return null; }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) return null;
  let p = url.pathname.replace(/\/+$/, '');
  if (!/\/chat\/completions$/.test(p)) p += '/chat/completions';
  url.pathname = p; url.hash = '';
  return url.href;
}
export const aiReady = (s, hasKey) => Boolean(s.enabled && chatUrl(s.baseUrl) && s.model && hasKey);

export function chatBody(model, messages, maxTokens = 600) {
  return { model, messages, temperature: 0.8, max_tokens: maxTokens, stream: false };
}
export const TEST_MESSAGES = Object.freeze([{ role: 'user', content: '回复「好」一个字。' }]);
export function chatText(json) {
  const text = json?.choices?.[0]?.message?.content;
  return typeof text === 'string' && text.trim() ? text.trim() : null;
}
// Human, key-free error text for 测试连接 and letter failures.
export function explainError({ status = 0, body = null, kind = '' } = {}) {
  const msg = typeof body?.error?.message === 'string' ? body.error.message.slice(0, 160) : '';
  if (kind === 'timeout') return '连接超时：服务器 30 秒内没有回应。';
  if (kind === 'config') return '请先填好接口地址、API Key 和模型名。';
  if (kind === 'network') return '连不上这个地址。网页版需要接口允许跨域（CORS），可以改用桌面版，或换一个支持 CORS 的地址。';
  if (kind === 'format') return '服务器有回应，但不是 OpenAI 格式的 chat/completions 结果。请检查接口地址。';
  if (status === 401 || status === 403) return `API Key 无效或没有权限（${status}）。${msg}`;
  if (status === 404) return `找不到这个接口或模型（404）。请检查接口地址和模型名。${msg}`;
  if (status === 429) return `请求太频繁或余额不足（429）。${msg}`;
  if (status >= 500) return `服务器出错了（${status}），稍后再试。${msg}`;
  return `请求失败${status ? `（${status}）` : ''}。${msg}`;
}
// Strip anything that looks like a key from free text before it is shown or stored.
export const redact = (text, key = '') => String(text || '').split(key && key.length > 6 ? key : '\u0000').join('••••').replace(/\b(sk|Bearer)[-_ ][A-Za-z0-9_\-]{8,}/g, '$1-••••');

// Letter periods: one letter per day or per Monday-started week.
export function letterPeriod(now, cadence) {
  if (cadence === 'daily') { const from = startOfDay(now) - DAY; return { id: `d:${dayKey(from)}`, from, to: from + DAY, label: '昨天' }; }
  const thisWeek = startOfWeek(now), from = startOfWeek(thisWeek - DAY);
  return { id: `w:${dayKey(from)}`, from, to: thisWeek, label: '上周' };
}

// Summary stats only — never raw history, task text or timestamps.
export function letterSummary(sessions, period, mood = null) {
  const inP = (sessions || []).filter((s) => s.start >= period.from && s.start < period.to);
  const minutes = Math.round(inP.reduce((n, s) => n + (s.durationMs || 0), 0) / 60000);
  const albums = new Map();
  for (const s of inP) if (s.album?.title) { const k = s.album.key || s.album.title; const a = albums.get(k) || { title: s.album.title, artist: s.album.artist || '', minutes: 0 }; a.minutes += (s.durationMs || 0) / 60000; albums.set(k, a); }
  const topAlbums = [...albums.values()].sort((a, b) => b.minutes - a.minutes).slice(0, 3).map((a) => ({ title: a.title.slice(0, 60), artist: a.artist.slice(0, 40), minutes: Math.round(a.minutes) }));
  const days = new Set(inP.map((s) => dayKey(s.start))).size;
  return { period: period.label, focusMinutes: minutes, sessions: inP.length, completedSessions: inP.filter((s) => s.completed).length, activeDays: days, topAlbums,
    cat: mood ? { tier: mood.tier || null, mood: mood.mood ?? null, feeds: mood.feeds || 0 } : null };
}

const TONE_PROMPT = { warm: '语气温柔、像老朋友。', playful: '用小猫的口吻，俏皮、轻松，可以有一点点拟声词。', calm: '语气平静克制，给一点安静的鼓励，不说教。' };
export function letterMessages(summary, tone) {
  return [
    { role: 'system', content: `你是「心流小屋」里的小猫，每${summary.period === '昨天' ? '天' : '周'}给主人写一封简短的中文信。${TONE_PROMPT[tone] || TONE_PROMPT.warm}只根据给你的统计写，不编造没有的数据；专注少或为零时不要责备。120–220 字，3–5 段短句，不要标题，不要署名，不要 Markdown。` },
    { role: 'user', content: `这是${summary.period}的小屋统计（JSON）：\n${JSON.stringify(summary)}` }
  ];
}
export function cleanLetter(text) {
  return String(text || '').replace(/```[\s\S]*?```/g, '').replace(/^#+\s*/gm, '').replace(/\*\*/g, '').split(/\n+/).map((l) => l.trim()).filter(Boolean).slice(0, 8).map((l) => l.slice(0, 200));
}

// Saved letters: [{ id, cadence, tone, lines, source: 'ai'|'template', at, read }], newest first.
export function readLetters(storage) {
  try { const list = JSON.parse(storage?.getItem?.(LETTERS_KEY) || '[]'); return Array.isArray(list) ? list.filter((l) => l && typeof l.id === 'string' && Array.isArray(l.lines)) : []; } catch { return []; }
}
export function saveLetter(storage, letter) {
  const list = [letter, ...readLetters(storage).filter((l) => l.id !== letter.id)].slice(0, MAX_LETTERS);
  storage?.setItem?.(LETTERS_KEY, JSON.stringify(list)); return list;
}
export function markRead(storage, id) {
  const list = readLetters(storage).map((l) => l.id === id ? { ...l, read: true } : l);
  storage?.setItem?.(LETTERS_KEY, JSON.stringify(list)); return list;
}
export const unreadCount = (list) => list.filter((l) => !l.read).length;
// Generate once per period: skip when an AI letter exists, or a failed try was under an hour ago.
export const TRY_KEY = 'flow-cabin-letter-try-v1';
export function needsLetter(list, period, lastTry, now, retryMs = 3600000) {
  if (list.some((l) => l.id === period.id)) return false;
  return !(lastTry && lastTry.id === period.id && now - lastTry.at < retryMs);
}
