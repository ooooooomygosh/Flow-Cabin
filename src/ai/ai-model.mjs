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
// One fixed template per provider. Endpoints and recommended models live here
// so users never have to assemble an OpenAI-compatible URL by hand.
export const AI_PROVIDERS = Object.freeze([
  {
    id: 'deepseek', label: 'DeepSeek', mode: 'http', requiresKey: true,
    baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-flash', thinking: 'disabled',
    hint: '官方 deepseek-flash；连接测试、来信和智能唱片机都默认关闭思考模式。'
  },
  {
    id: 'openai', label: 'OpenAI', mode: 'http', requiresKey: true,
    baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini',
    hint: 'OpenAI 官方 chat/completions 接口。'
  },
  {
    id: 'openrouter', label: 'OpenRouter', mode: 'http', requiresKey: true,
    baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4.1-mini',
    hint: '一个 Key 使用多家模型；模型名可以改成 OpenRouter 目录里的任意可用模型。'
  },
  {
    id: 'ollama', label: 'Ollama', mode: 'http', requiresKey: false,
    baseUrl: 'http://127.0.0.1:11434/v1', model: 'qwen3:8b',
    hint: '本机 Ollama 的 OpenAI 兼容接口，不需要 API Key；网页版需服务允许 CORS。'
  },
  {
    id: 'lmstudio', label: 'LM Studio', mode: 'http', requiresKey: false,
    baseUrl: 'http://127.0.0.1:1234/v1', model: 'local-model',
    hint: 'LM Studio 本地服务，不需要 API Key；请把模型名改成当前已加载的模型。'
  },
  {
    id: 'codex', label: '本机 Codex CLI', mode: 'codex', requiresKey: false,
    baseUrl: '', model: '',
    hint: '调用终端里已登录的 codex exec，只读取最后一条回答，不保留思考过程。'
  },
  {
    id: 'custom', label: '自定义', mode: 'http', requiresKey: true,
    baseUrl: '', model: '',
    hint: '其他 OpenAI 兼容接口。地址、模型与 Key 都由你自己填写；仅用于你信任的服务。'
  }
]);
export const DEFAULT_AI_PROVIDER = 'deepseek';
const defaultProvider = () => AI_PROVIDERS[0];
export const DEFAULT_AI = Object.freeze({
  v: 1, provider: DEFAULT_AI_PROVIDER, enabled: false,
  baseUrl: defaultProvider().baseUrl, model: defaultProvider().model,
  cadence: 'weekly', tone: 'warm', shareNotes: false
});
export const TIMEOUT_MS = 30000;
// Inbox records stay small. There is deliberately no silent count cap: a full
// browser store surfaces as a save error in the composer instead of dropping
// the oldest memories.
export const MAX_LETTER_LINES = 12, MAX_LETTER_LINE = 240;

const pick = (v, list, fallback) => list.some((x) => x.id === v) ? v : fallback;
export const providerById = (id) => AI_PROVIDERS.find((provider) => provider.id === id) || defaultProvider();
export function inferAiProvider(baseUrl = '', model = '') {
  let hostname = '', port = '';
  try { const url = new URL(String(baseUrl || '').trim()); hostname = url.hostname; port = url.port; } catch { /* custom */ }
  if (hostname === 'api.deepseek.com') return 'deepseek';
  if (hostname === 'api.openai.com') return 'openai';
  if (hostname === 'openrouter.ai') return 'openrouter';
  if (['localhost', '127.0.0.1', '[::1]'].includes(hostname) && (port === '11434' || String(model).startsWith('ollama/'))) return 'ollama';
  if (['localhost', '127.0.0.1', '[::1]'].includes(hostname) && port === '1234') return 'lmstudio';
  return 'custom';
}
export function applyAiProvider(value, id) {
  const provider = providerById(id);
  return normalizeAi({
    ...value, provider: provider.id,
    baseUrl: provider.mode === 'codex' ? '' : provider.baseUrl || value?.baseUrl || '',
    model: provider.mode === 'codex' ? '' : provider.model || value?.model || ''
  });
}
export function normalizeAi(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const savedProvider = AI_PROVIDERS.some((provider) => provider.id === r.provider)
    ? r.provider
    : (!r.baseUrl && !r.model ? DEFAULT_AI_PROVIDER : inferAiProvider(r.baseUrl, r.model));
  const provider = providerById(savedProvider);
  const codex = provider.mode === 'codex';
  const hasBaseUrl = typeof r.baseUrl === 'string' && Boolean(r.baseUrl.trim());
  const hasModel = typeof r.model === 'string' && Boolean(r.model.trim());
  const legacyDeepseekModel = provider.id === 'deepseek'
    && ['deepseek-chat', 'deepseek-reasoner'].includes(String(r.model || '').trim());
  return { v: 1, provider: provider.id, enabled: r.enabled === true,
    baseUrl: codex ? '' : hasBaseUrl ? r.baseUrl.trim().slice(0, 300) : provider.baseUrl,
    model: codex ? '' : legacyDeepseekModel || !hasModel ? provider.model : r.model.trim().slice(0, 120),
    cadence: pick(r.cadence, CADENCES, 'weekly'), tone: pick(r.tone, TONES, 'warm'),
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
export function isDeepseekEndpoint(value) {
  try { return new URL(String(value || '')).hostname === 'api.deepseek.com'; } catch { return false; }
}
export const aiProvider = (s) => providerById(s?.provider || inferAiProvider(s?.baseUrl, s?.model));
export const aiReady = (s, hasKey, { desktop = false } = {}) => {
  const provider = aiProvider(s);
  if (!s?.enabled) return false;
  if (provider.mode === 'codex') return desktop;
  return Boolean(chatUrl(s.baseUrl) && s.model && (!provider.requiresKey || hasKey));
};
export const aiConnectionReady = (s, key, { desktop = false } = {}) => {
  const provider = aiProvider(s);
  if (!s?.enabled) return false;
  if (provider.mode === 'codex') return desktop;
  const endpoint = chatUrl(s.baseUrl);
  if (!endpoint || !s.model) return false;
  return !provider.requiresKey || Boolean(key?.stored && key.endpoint === endpoint);
};

export function chatBody(model, messages, maxTokens = 600, options = {}) {
  const body = {
    model,
    messages,
    temperature: Number.isFinite(options.temperature) ? options.temperature : 0.8,
    max_tokens: maxTokens,
    stream: false
  };
  // OpenAI-compatible endpoints that support JSON mode get an extra guard.
  // The transport retries without this field for older compatible endpoints.
  if (options.json === true) body.response_format = { type: 'json_object' };
  // DeepSeek Flash enables thinking by default. Thinking tokens share the
  // output budget and can leave content empty, especially for JSON responses.
  if (options.thinking === 'disabled' || options.thinking === 'enabled') body.thinking = { type: options.thinking };
  if (['none', 'low', 'high', 'max'].includes(options.reasoningEffort)) body.reasoning_effort = options.reasoningEffort;
  return body;
}
export const TEST_MESSAGES = Object.freeze([{ role: 'user', content: '回复「好」一个字。' }]);
export function chatText(json) {
  const text = json?.choices?.[0]?.message?.content;
  return typeof text === 'string' && text.trim() ? text.trim() : null;
}
// Human, key-free error text for 测试连接 and letter failures.
export function explainError({ status = 0, body = null, kind = '' } = {}) {
  const msg = typeof body?.error?.message === 'string' ? body.error.message.slice(0, 160) : '';
  if (kind === 'timeout') return '连接超时：服务器没有及时回应，请稍后重试。';
  if (kind === 'cancelled') return '请求已取消。';
  if (kind === 'config') return '请先选好模板、模型和必要凭据，再试一次。';
  if (kind === 'network') return '连不上这个地址。网页版需要接口允许跨域（CORS），可以改用桌面版，或换一个支持 CORS 的地址。';
  if (kind === 'format') return '服务器有回应，但不是 OpenAI 格式的 chat/completions 结果。请检查接口地址。';
  if (kind === 'empty') return '模型返回了空内容。这个模型可能默认开启思考模式，思考 token 占满了输出上限；请关闭思考模式或调大 max_tokens。';
  if (kind === 'desktop') return '本机 Codex CLI 只能在心流小屋桌面版里使用。';
  if (kind === 'cli-missing') return '找不到本机的 Codex CLI。请先在终端安装并登录 codex，再重新打开小屋。';
  if (kind === 'cli-timeout') return '本机 Codex 超时了，没有返回最终回答。请稍后重试，或在终端检查 codex 是否正常。';
  if (kind === 'cli-cancelled') return '本机 Codex 请求已取消。';
  if (kind === 'cli-empty') return '本机 Codex 完成了，但没有写出最终回答。';
  if (kind === 'cli-failed') return '本机 Codex 没有完成这次请求。请确认终端里的 codex 已登录，再试一次。';
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
const inputCount = (value) => Number.isFinite(Number(value)) ? Math.max(0, Math.min(1e9, Math.round(Number(value)))) : 0;
const displayCount = (value) => inputCount(value).toLocaleString('zh-CN');

// The companion only ever exposes aggregate counts. Keep the letter contract
// intentionally narrow so a malformed or newer store cannot leak raw events.
export function normalizeLetterInput(value) {
  if (!value || typeof value !== 'object') return null;
  const keyboard = inputCount(value.keyboard), click = inputCount(value.click);
  if (!keyboard && !click) return null;
  return { keyboard, click, streak: Math.max(0, Math.min(36500, inputCount(value.streak))) };
}

export function letterEvidence(summary) {
  const out = [];
  if (summary.focusMinutes > 0) out.push({ kind: 'focus', text: `专注 ${summary.focusMinutes} 分钟${summary.completedSessions ? ` · 完成 ${summary.completedSessions} 轮` : ''}` });
  if (summary.listening?.minutes > 0) {
    const work = summary.listening.topAlbum?.title || summary.listening.topTrack?.title;
    out.push({ kind: 'listening', text: `实际播放 ${summary.listening.minutes} 分钟${work ? ` · 最常放《${work}》` : ''}` });
  }
  if (summary.cat?.feeds > 0) out.push({ kind: 'cat', text: `喂了奶糖 ${summary.cat.feeds} 次` });
  if (summary.input?.keyboard > 0 || summary.input?.click > 0) {
    const parts = [];
    if (summary.input.keyboard > 0) parts.push(`键盘 ${displayCount(summary.input.keyboard)} 次`);
    if (summary.input.click > 0) parts.push(`点击 ${displayCount(summary.input.click)} 次`);
    out.push({ kind: 'input', text: `今天的陪伴 · ${parts.join(' · ')}${summary.input.streak > 1 ? ` · 连续 ${summary.input.streak} 天` : ''}` });
  }
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
  const input = normalizeLetterInput(extra.input);
  if (input) summary.input = input;
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
  const kinds = new Set(['focus', 'listening', 'weather', 'time', 'note', 'cat', 'input']);
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
    { role: 'system', content: `你是「心流小屋」里的小猫，每${summary.period === '昨天' ? '天' : '周'}给主人写一封简短的中文信。${TONE_PROMPT[tone] || TONE_PROMPT.warm}只根据给你的数据写，不编造没有的事实；专注少或为零时不要责备。focusMinutes 是专注时间，listening.minutes 才是实际播放时间，两者不能相加或互相冒充；topAlbums 仅表示“专注时放在唱机上的唱片”，不得说成听歌记录。input 是今天本机键鼠陪伴的汇总次数，只能写成“陪着你/敲了多少次”这类陪伴事实，不能推断主人输入了什么、用了哪个应用或由此判断情绪。只有 summary.note.excerpt 存在时才可以引用随手记，且不要逐字大段复述。weather 只描述写信时的窗外，不能写成整周天气。120–220 字，3–5 段短句，不要标题，不要署名，不要 Markdown。` },
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
    { role: 'system', content: `你是「心流小屋」里的小猫，正在给主人回信。${TONE_PROMPT[tone] || TONE_PROMPT.warm}先把主人信里真正说过的内容放在心上，再只在相关时参考附带的小屋数据。input 只是今天本机键鼠陪伴的汇总次数，不能推断输入内容、应用或情绪。不要编造主人没有说过的事，不要把专注时长说成听歌时长，不要诊断情绪，不要说教，也不要假装自己是人类。回信 100–220 字，2–4 段短句，不要标题、署名或 Markdown。` },
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
  if (s.input?.keyboard > 0 || s.input?.click > 0) {
    const parts = [];
    if (s.input.keyboard > 0) parts.push(`敲了 ${displayCount(s.input.keyboard)} 次键盘`);
    if (s.input.click > 0) parts.push(`点了 ${displayCount(s.input.click)} 次鼠标`);
    out.push(`今天你${parts.join('、')}，奶糖都在旁边。`);
  }
  if (s.weather?.kind) out.push(`写信的时候，窗外是${WEATHER_LABELS[s.weather.kind] || s.weather.kind}${s.weather.bucket ? `，已经是${TIME_LABELS[s.weather.bucket] || s.weather.bucket}了` : ''}。`);
  if (s.note?.chars > 0) out.push('你写下的那些话，我也认真读过了。它们只留在这次回信里。');
  if (!s.focusMinutes && !s.listening?.minutes) out.push('这一页没写满也没关系。你可以从下一件小事开始，或者安静坐一会儿。');
  out.push('不用把所有事都做完。回来坐一会儿，灯和唱片都还在这里。');
  return out.slice(0, 6);
}

// Saved letters and drafts. Newest first. Old records default to an incoming,
// delivered letter, so every existing v1/v2/v3 backup still opens.
export function normalizeStoredLetter(value) {
  if (value?.purgedAt != null) return typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 100
    && finite(value.purgedAt) && value.purgedAt >= 0 && value.purgedAt <= 8640000000000000
    ? { id: value.id, purgedAt: value.purgedAt } : null;
  return normalizeLetter(value);
}
export function readLetterRecords(storage) {
  const list = JSON.parse(storage?.getItem?.(LETTERS_KEY) || '[]');
  if (!Array.isArray(list)) throw new Error('信箱格式异常');
  const records = list.map(normalizeStoredLetter);
  if (records.some((value) => !value)) throw new Error('信箱格式异常');
  return records;
}
export function mergeLetterDeletions(records) {
  const removed = new Map();
  for (const item of records) if (item.purgedAt != null) removed.set(item.id, { id: item.id, purgedAt: Math.max(item.purgedAt, removed.get(item.id)?.purgedAt ?? 0) });
  return [...removed.values(), ...records.filter((item) => item.purgedAt == null && !removed.has(item.id) && !removed.has(item.replyTo))];
}
export function readLetters(storage) {
  try { return sortedLetters(mergeLetterDeletions(readLetterRecords(storage)).filter((item) => item.purgedAt == null)); }
  catch { return []; }
}
const sortedLetters = (list) => list.sort((a, b) => (b.purgedAt ?? b.at) - (a.purgedAt ?? a.at) || String(b.id).localeCompare(String(a.id)));
export function tryWriteLetters(storage, letters) {
  try {
    if (!storage?.setItem || !Array.isArray(letters)) throw new Error('storage unavailable');
    const records = letters.map(normalizeStoredLetter);
    if (records.some((value) => !value)) throw new Error('invalid letter');
    // Preserve deletion markers even when a stale caller supplies its old list.
    const list = sortedLetters(mergeLetterDeletions([...readLetterRecords(storage).filter((item) => item.purgedAt != null), ...records]));
    storage.setItem(LETTERS_KEY, JSON.stringify(list));
    return { ok: true, list: list.filter((item) => item.purgedAt == null), error: '' };
  } catch {
    return { ok: false, list: readLetters(storage), error: '信箱修改没有保存，原数据保留。请检查本机存储或备份后重试。' };
  }
}
export function saveLetter(storage, letter) {
  return trySaveLetter(storage, letter).list;
}
export function trySaveLetter(storage, letter) {
  const value = normalizeLetter(letter);
  if (!value) return { ok: false, list: readLetters(storage), error: '这封信还没有可以保存的内容。' };
  try {
    if (readLetterRecords(storage).some((item) => item.purgedAt != null && (item.id === value.id || item.id === value.replyTo)))
      return { ok: false, deleted: true, list: readLetters(storage), error: '这封信已永久删除，不再接收旧窗口的内容或迟到回信。' };
  } catch { return { ok: false, list: [], error: '信箱无法读取，原数据没有覆盖。' }; }
  return tryWriteLetters(storage, [value, ...readLetters(storage).filter((item) => item.id !== value.id)]);
}
export function markRead(storage, id) {
  const list = readLetters(storage).map((l) => l.id === id && l.direction === 'in' ? { ...l, read: true, readAt: Date.now() } : l);
  return tryWriteLetters(storage, list).list;
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
  return tryWriteLetters(storage, list).list;
}
export const unreadCount = (list) => list.filter((l) => l.direction === 'in' && l.status !== 'draft' && !l.read && !l.trashed).length;
// Generate once per period: skip when an AI letter exists, or a failed try was under an hour ago.
export const TRY_KEY = 'flow-cabin-letter-try-v1';
export function needsLetter(list, period, lastTry, now, retryMs = 3600000) {
  if (list.some((l) => l.id === period.id && l.direction === 'in' && l.status !== 'draft')) return false;
  return !(lastTry && lastTry.id === period.id && now - lastTry.at < retryMs);
}
