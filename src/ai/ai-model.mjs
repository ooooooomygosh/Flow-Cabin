// AI（Beta）: optional, off by default. The user brings any OpenAI-compatible endpoint
// (base URL + key + model). Pure helpers only (no DOM, no network) — tested in ai.test.mjs.
// The key never goes into logs, letters or prompts; in the desktop app it lives in the
// shell (Electron safeStorage), in the web build only in this browser's localStorage.
import { startOfDay, startOfWeek, dayKey, addDays } from '../lib/local-calendar.mjs';

export const AI_SETTINGS_KEY = 'flow-cabin-ai-v1', AI_KEY_KEY = 'flow-cabin-ai-key-v1', LETTERS_KEY = 'flow-cabin-letters-v1';
export const AI_EVENT = 'cabin:ai-settings', LETTER_EVENT = 'cabin:letter';
export const TONES = Object.freeze([
  { id: 'warm', label: '温柔', hint: '像老朋友一样温暖' },
  { id: 'playful', label: '俏皮', hint: '小猫口吻，轻松好玩' },
  { id: 'calm', label: '平静鼓励', hint: '安静、克制、给一点力量' }
]);
export const CADENCES = Object.freeze([{ id: 'daily', label: '每天' }, { id: 'weekly', label: '每周' }]);
export const DEFAULT_AI = Object.freeze({ v: 1, enabled: false, baseUrl: '', model: '', cadence: 'weekly', tone: 'warm', shareNotes: false });
export const TIMEOUT_MS = 30000;
// Inbox records stay small. There is deliberately no silent count cap: a full
// browser store surfaces as a save error in the composer instead of dropping
// the oldest memories.
export const MAX_LETTER_LINES = 12, MAX_LETTER_LINE = 240;

const pick = (v, list, fallback) => list.some((x) => x.id === v) ? v : fallback;
export function normalizeAi(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return { v: 1, enabled: r.enabled === true, baseUrl: typeof r.baseUrl === 'string' ? r.baseUrl.trim().slice(0, 300) : '',
    model: typeof r.model === 'string' ? r.model.trim().slice(0, 120) : '', cadence: pick(r.cadence, CADENCES, 'weekly'), tone: pick(r.tone, TONES, 'warm'),
    shareNotes: r.shareNotes === true };
}
export function readAi(storage) { try { return normalizeAi(JSON.parse(storage?.getItem?.(AI_SETTINGS_KEY) || 'null')); } catch { return normalizeAi(null); } }
export function writeAi(storage, value) { const v = normalizeAi(value); storage?.setItem?.(AI_SETTINGS_KEY, JSON.stringify(v)); return v; }

// "https://api.deepseek.com" / ".../v1" / ".../v1/chat/completions" → the chat/completions URL.
export function chatUrl(baseUrl) {
  let url; try { url = new URL(String(baseUrl || '').trim()); } catch { return null; }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!(url.protocol === 'https:' || (url.protocol === 'http:' && loopback)) || url.username || url.password || url.search || url.hash) return null;
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
  if (cadence === 'daily') { const to = startOfDay(now), from = addDays(to, -1); return { id: `d:${dayKey(from)}`, from, to, label: '昨天' }; }
  const thisWeek = startOfWeek(now), from = addDays(thisWeek, -7);
  return { id: `w:${dayKey(from)}`, from, to: thisWeek, label: '上周' };
}

export function summarizeListening(sessions, period) {
  const rows = (sessions || []).filter((s) => s && s.start >= period.from && s.start < period.to && finite(s.durationMs) && s.durationMs > 0);
  if (!rows.length) return null;
  const albums = new Map(), tracks = new Map();
  for (const row of rows) {
    const album = row.album?.title ? `${row.album.title}\u0000${row.album.artist || ''}` : '';
    const track = row.track?.title ? `${row.track.title}\u0000${row.track.artist || ''}` : '';
    if (album) albums.set(album, (albums.get(album) || 0) + row.durationMs);
    if (track) tracks.set(track, (tracks.get(track) || 0) + row.durationMs);
  }
  const top = (map, type) => {
    const [key, ms] = [...map.entries()].sort((a, b) => b[1] - a[1])[0] || [];
    if (!key) return null;
    const [title, artist] = key.split('\u0000');
    return { [type]: { title: title.slice(0, 60), artist: artist.slice(0, 40) }, minutes: Math.round(ms / 60000) };
  };
  return {
    minutes: Math.round(rows.reduce((n, row) => n + row.durationMs, 0) / 60000),
    sessions: rows.length, activeDays: new Set(rows.map((row) => dayKey(row.start))).size,
    topAlbum: top(albums, 'album')?.album || null, topTrack: top(tracks, 'track')?.track || null
  };
}

const WEATHER_LABELS = { snow: '雪', clear: '晴', rain: '雨', starry: '星空', cloudy: '多云', fog: '雾', storm: '雷雨' };
const TIME_LABELS = { morning: '清晨', day: '白天', dusk: '傍晚', night: '夜里' };

export function letterEvidence(summary) {
  const out = [];
  if (summary.focusMinutes > 0) out.push({ kind: 'focus', text: `专注 ${summary.focusMinutes} 分钟${summary.completedSessions ? ` · 完成 ${summary.completedSessions} 轮` : ''}` });
  if (summary.listening?.minutes > 0) {
    const work = summary.listening.topAlbum?.title || summary.listening.topTrack?.title;
    out.push({ kind: 'listening', text: `实际播放 ${summary.listening.minutes} 分钟${work ? ` · 最常放《${work}》` : ''}` });
  }
  if (summary.cat?.feeds > 0) out.push({ kind: 'cat', text: `喂了奶糖 ${summary.cat.feeds} 次` });
  if (summary.weather?.kind) out.push({ kind: 'weather', text: `写信时窗外 · ${summary.weather.bucket ? `${TIME_LABELS[summary.weather.bucket] || summary.weather.bucket} · ` : ''}${WEATHER_LABELS[summary.weather.kind] || summary.weather.kind}` });
  if (summary.note?.chars > 0) out.push({ kind: 'note', text: `参考了随手记 · ${summary.note.chars} 字（仅本次）` });
  return out.slice(0, 8);
}

// Summary stats only — never raw task text, timestamps or an unauthorised note.
// Extra fields are optional so old callers and tests keep the v1 summary shape.
export function letterSummary(sessions, period, mood = null, extra = {}) {
  const inP = (sessions || []).filter((s) => s.start >= period.from && s.start < period.to);
  const minutes = Math.round(inP.reduce((n, s) => n + (s.durationMs || 0), 0) / 60000);
  const albums = new Map();
  for (const s of inP) if (s.album?.title) { const k = s.album.key || s.album.title; const a = albums.get(k) || { title: s.album.title, artist: s.album.artist || '', minutes: 0 }; a.minutes += (s.durationMs || 0) / 60000; albums.set(k, a); }
  // Album metadata is a snapshot from focus records, not playback telemetry.
  const topAlbums = [...albums.values()].sort((a, b) => b.minutes - a.minutes).slice(0, 3).map((a) => ({ title: a.title.slice(0, 60), artist: a.artist.slice(0, 40) }));
  const days = new Set(inP.map((s) => dayKey(s.start))).size;
  const summary = { period: period.label, focusMinutes: minutes, sessions: inP.length, completedSessions: inP.filter((s) => s.completed).length, activeDays: days, topAlbums, albumContext: '专注时放在唱机上的唱片',
    cat: mood ? { tier: mood.tier || null, mood: mood.mood ?? null, feeds: mood.feeds || 0 } : null };
  const listening = summarizeListening(extra.playbackSessions, period);
  if (listening) summary.listening = listening;
  if (extra.weather?.kind) summary.weather = { kind: extra.weather.kind, bucket: extra.weather.bucket || '', source: extra.weather.source === 'real' ? 'real' : 'manual' };
  if (extra.includeNotes && typeof extra.notes === 'string' && extra.notes.trim()) {
    const note = extra.notes.replace(/\s+/g, ' ').trim();
    summary.note = { chars: note.length, excerpt: note.slice(0, 300) };
  }
  summary.evidence = letterEvidence(summary);
  return summary;
}

const textLines = (value) => (Array.isArray(value) ? value : String(value || '').split(/\r?\n/))
  .map((line) => typeof line === 'string' ? line.replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, MAX_LETTER_LINE) : '')
  .filter(Boolean).slice(0, MAX_LETTER_LINES);
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const optionalText = (value, max) => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : '';
const directionOf = (value) => value === 'out' ? 'out' : 'in';
const statusOf = (direction, value) => direction === 'out' && ['draft', 'sending', 'sent', 'failed'].includes(value) ? value : 'delivered';

export function normalizeEvidence(value) {
  if (!Array.isArray(value)) return [];
  const kinds = new Set(['focus', 'listening', 'weather', 'time', 'note', 'cat']);
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || !kinds.has(item.kind) || typeof item.text !== 'string') return [];
    const text = item.text.replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, 120);
    return text ? [{ kind: item.kind, text }] : [];
  }).slice(0, 8);
}

// One record format for old AI letters, user letters, drafts and replies.
// `direction: in` is 小屋 → 我, `out` is 我 → 小屋.
export function normalizeLetter(value) {
  if (!value || typeof value !== 'object' || typeof value.id !== 'string' || !value.id || !finite(value.at)) return null;
  const direction = directionOf(value.direction);
  const lines = direction === 'out' ? cleanUserLetter(Array.isArray(value.lines) ? value.lines.join('\n') : value.lines) : textLines(value.lines);
  if (!lines.length) return null;
  const status = statusOf(direction, value.status), source = direction === 'out' || value.source === 'user' ? 'user' : value.source === 'ai' ? 'ai' : 'template';
  const evidence = normalizeEvidence(value.evidence);
  const read = direction === 'out' ? true : value.read === true;
  return {
    id: value.id.slice(0, 100), direction, status,
    cadence: value.cadence === 'daily' ? 'daily' : 'weekly',
    tone: pick(value.tone, TONES, 'warm'),
    ...(optionalText(value.period, 40) ? { period: optionalText(value.period, 40) } : {}),
    ...(optionalText(value.subject, 80) ? { subject: optionalText(value.subject, 80) } : {}),
    lines, source, at: value.at, read,
    ...(finite(value.organizedAt) ? { organizedAt: value.organizedAt, favorite: value.favorite === true, trashed: value.trashed === true } : {}),
    ...(direction === 'out' ? { shareContext: value.shareContext !== false && value.period !== '不附小屋近况' } : {}),
    ...(finite(value.readAt) ? { readAt: value.readAt } : {}),
    ...(optionalText(value.replyTo, 100) ? { replyTo: optionalText(value.replyTo, 100) } : {}),
    ...(evidence.length ? { evidence } : {}),
    ...(optionalText(value.error, 160) ? { error: optionalText(value.error, 160) } : {})
  };
}

const TONE_PROMPT = { warm: '语气温柔、像老朋友。', playful: '用小猫的口吻，俏皮、轻松，可以有一点点拟声词。', calm: '语气平静克制，给一点安静的鼓励，不说教。' };
export function letterMessages(summary, tone) {
  return [
    { role: 'system', content: `你是「心流小屋」里的小猫，每${summary.period === '昨天' ? '天' : '周'}给主人写一封简短的中文信。${TONE_PROMPT[tone] || TONE_PROMPT.warm}只根据给你的数据写，不编造没有的事实；专注少或为零时不要责备。focusMinutes 是专注时间，listening.minutes 才是实际播放时间，两者不能相加或互相冒充；topAlbums 仅表示“专注时放在唱机上的唱片”，不得说成听歌记录。只有 summary.note.excerpt 存在时才可以引用随手记，且不要逐字大段复述。weather 只描述写信时的窗外，不能写成整周天气。120–220 字，3–5 段短句，不要标题，不要署名，不要 Markdown。` },
    { role: 'user', content: `这是${summary.period}的小屋统计（JSON）：\n${JSON.stringify(summary)}` }
  ];
}
export function cleanLetter(text) {
  return String(text || '').replace(/```[\s\S]*?```/g, '').replace(/^#+\s*/gm, '').replace(/\*\*/g, '').split(/\n+/).map((l) => l.trim()).filter(Boolean).slice(0, 8).map((l) => l.slice(0, 200));
}

export function cleanUserLetter(text) {
  return String(text || '').replace(/\r\n?/g, '\n').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').trim()
    .slice(0, MAX_LETTER_LINES * MAX_LETTER_LINE)
    .split(/\n+/).map((line) => line.trim()).filter(Boolean);
}

const emailSubject = (lines) => {
  const first = (lines[0] || '').replace(/[。！？!?].*$/, '').trim();
  return (first || '一封没有标题的信').slice(0, 28);
};

// A warm, non-fabricated reply when AI is off or the endpoint fails. It
// repeats only what the user wrote and the facts explicitly attached here.
export function localLetterReply(text, summary = null) {
  const lines = cleanUserLetter(text), first = (lines[0] || '').replace(/\s+/g, ' ').trim().slice(0, 54);
  const out = [`我把你的信读完了。${first ? `你说的「${first}${first.length >= 54 ? '…' : ''}」，我记住了。` : '这一页我先替你好好收着。'}`];
  const focus = summary?.focusMinutes > 0 ? `这段时间你在小屋里专注了 ${summary.focusMinutes} 分钟` : '';
  const listen = summary?.listening?.minutes > 0 ? `${focus ? '也' : '这段时间你'}听了 ${summary.listening.minutes} 分钟音乐` : '';
  if (focus || listen) out.push(`${focus}${focus && listen ? '，' : ''}${listen}。你为自己留出的这些时间，都收在小屋里了。`);
  if (summary?.weather?.kind) out.push(`写这封信的时候，窗外是${WEATHER_LABELS[summary.weather.kind] || summary.weather.kind}。小屋替你留着这一刻。`);
  if (summary?.cat?.feeds > 0) out.push(`这段时间你给奶糖喂了 ${summary.cat.feeds} 次。谢谢你还记得它的小碗。`);
  if (summary?.note?.chars > 0 || summary?.journal?.length) out.push('你主动附在信里的那些摘录，也一起收好了。想说的话，可以慢慢说。');
  out.push('如果今天还有一点力气，就只做眼前最小的一件事；如果没有，也可以先歇一会儿。');
  out.push('你的位置和桌边那盏灯，都还在。');
  return out.slice(0, 5);
}

export function userLetterSubject(text) { return emailSubject(cleanUserLetter(text)); }

export function userLetterMessages(text, summary, tone) {
  return [
    { role: 'system', content: `你是「心流小屋」里的小猫，正在给主人回信。${TONE_PROMPT[tone] || TONE_PROMPT.warm}先把主人信里真正说过的内容放在心上，再只在相关时参考附带的小屋数据。不要编造主人没有说过的事，不要把专注时长说成听歌时长，不要诊断情绪，不要说教，也不要假装自己是人类。回信 100–220 字，2–4 段短句，不要标题、署名或 Markdown。` },
    { role: 'user', content: `主人写来的信：\n${text}\n\n${summary ? `这封信允许参考的小屋近况（JSON）：\n${JSON.stringify(summary)}` : '主人这次没有附上小屋近况。'}` }
  ];
}

// The always-available hand-written letter. It only says what the summary can
// prove and is also the fallback when a configured AI endpoint is unavailable.
export function templateLetter(summary = null) {
  const s = summary && typeof summary === 'object' ? summary : {};
  const out = [];
  if (s.focusMinutes > 0) {
    out.push(`这一段时间，你在小屋里专注了 ${s.focusMinutes} 分钟${s.completedSessions ? `，完成 ${s.completedSessions} 轮` : ''}。`);
  }
  if (s.listening?.minutes > 0) {
    const top = s.listening.topAlbum?.title || s.listening.topTrack?.title;
    out.push(`唱机真的转了 ${s.listening.minutes} 分钟${top ? `，最常放的是《${top}》` : ''}。`);
  }
  if (s.topAlbums?.[0] && s.focusMinutes > 0) out.push(`专注的时候，唱机上放着《${s.topAlbums[0].title}》。`);
  if (s.cat?.feeds > 0) out.push(`这段时间，你给奶糖喂了 ${s.cat.feeds} 次小鱼干。谢谢你记得这只小猫。`);
  if (s.weather?.kind) out.push(`写信的时候，窗外是${WEATHER_LABELS[s.weather.kind] || s.weather.kind}${s.weather.bucket ? `，已经是${TIME_LABELS[s.weather.bucket] || s.weather.bucket}了` : ''}。`);
  if (s.note?.chars > 0) out.push('你写下的那些话，我也认真读过了。它们只留在这次回信里。');
  if (!s.focusMinutes && !s.listening?.minutes) out.push('这一页没写满也没关系。你可以从下一件小事开始，或者安静坐一会儿。');
  out.push('不用把所有事都做完。回来坐一会儿，灯和唱片都还在这里。');
  return out.slice(0, 6);
}

// Saved letters and drafts. Newest first. Old records default to an incoming,
// delivered letter, so every existing v1/v2/v3 backup still opens.
export function readLetters(storage) {
  try {
    const list = JSON.parse(storage?.getItem?.(LETTERS_KEY) || '[]');
    if (!Array.isArray(list)) return [];
    return list.map(normalizeLetter).filter(Boolean).sort((a, b) => b.at - a.at || String(b.id).localeCompare(String(a.id)));
  } catch { return []; }
}
const sortedLetters = (list) => list.sort((a, b) => b.at - a.at || String(b.id).localeCompare(String(a.id)));
export function tryWriteLetters(storage, letters) {
  const list = sortedLetters((Array.isArray(letters) ? letters : []).map(normalizeLetter).filter(Boolean));
  try {
    if (!storage?.setItem) throw new Error('storage unavailable');
    storage.setItem(LETTERS_KEY, JSON.stringify(list));
    return { ok: true, list, error: '' };
  } catch {
    return { ok: false, list: readLetters(storage), error: '信箱空间不足，刚才的修改没有保存。请先导出备份或清理空间。' };
  }
}
export function saveLetter(storage, letter) {
  const value = normalizeLetter(letter);
  if (!value) return readLetters(storage);
  const list = sortedLetters([value, ...readLetters(storage).filter((l) => l.id !== value.id)]);
  try { storage?.setItem?.(LETTERS_KEY, JSON.stringify(list)); } catch { /* the composer reports the failed write */ }
  return list;
}
export function trySaveLetter(storage, letter) {
  const value = normalizeLetter(letter);
  if (!value) return { ok: false, list: readLetters(storage), error: '这封信还没有可以保存的内容。' };
  const list = sortedLetters([value, ...readLetters(storage).filter((l) => l.id !== value.id)]);
  const result = tryWriteLetters(storage, list);
  return result.ok ? result : { ...result, error: '信箱空间不足，草稿还在这里，请先导出备份或清理空间。' };
}
export function markRead(storage, id) {
  const list = readLetters(storage).map((l) => l.id === id && l.direction === 'in' ? { ...l, read: true, readAt: Date.now() } : l);
  try { storage?.setItem?.(LETTERS_KEY, JSON.stringify(list)); } catch { /* leave the sealed letter intact */ }
  return list;
}
export function updateLetter(storage, id, patch) {
  const current = readLetters(storage).find((l) => l.id === id);
  return current ? saveLetter(storage, { ...current, ...patch, id }) : readLetters(storage);
}
export function tryUpdateLetter(storage, id, patch) {
  const current = readLetters(storage).find((l) => l.id === id);
  if (!current) return { ok: false, list: readLetters(storage), error: '找不到这封信，可能已在另一个窗口被删除。' };
  return trySaveLetter(storage, { ...current, ...patch, id });
}
export function removeLetter(storage, id) {
  const list = readLetters(storage).filter((l) => l.id !== id);
  try { storage?.setItem?.(LETTERS_KEY, JSON.stringify(list)); } catch { /* keep the previous list */ }
  return list;
}
export const unreadCount = (list) => list.filter((l) => l.direction === 'in' && l.status !== 'draft' && !l.read && !l.trashed).length;
// Generate once per period: skip when an AI letter exists, or a failed try was under an hour ago.
export const TRY_KEY = 'flow-cabin-letter-try-v1';
export function needsLetter(list, period, lastTry, now, retryMs = 3600000) {
  if (list.some((l) => l.id === period.id && l.direction === 'in' && l.status !== 'draft')) return false;
  return !(lastTry && lastTry.id === period.id && now - lastTry.at < retryMs);
}
