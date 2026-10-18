import {
  AI_EVENT, AI_SETTINGS_KEY, AI_KEY_KEY, LETTER_EVENT, LETTERS_KEY, aiReady, chatUrl, cleanLetter, cleanUserLetter,
  localLetterReply, readAi, readLetters, readLetterRecords, userLetterMessages, userLetterSubject,
  trySaveLetter, tryWriteLetters
} from './ai-model.mjs';
import { chat, keyState, AI_KEY_EVENT } from './ai-transport.mjs';

export const DRAFT_ID = 'draft:my-letter';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const emit = (win) => win.dispatchEvent?.(new CustomEvent(LETTER_EVENT));
const replyId = (outgoingId) => `reply:${outgoingId}`;

export function newOutgoingId(now = Date.now()) {
  return `my:${now.toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
}

export function readLetterDraft(storage) {
  return readLetters(storage).find((letter) => letter.direction === 'out' && letter.status === 'draft') || null;
}

export function saveLetterDraft(storage, value) {
  let records;
  try { records = readLetterRecords(storage); }
  catch { return { ok: false, error: '信箱无法读取，原数据没有覆盖。' }; }
  if (value?.expectedDraftId && records.some((letter) => letter.id === value.expectedDraftId && letter.purgedAt != null))
    return { ok: false, deleted: true, error: '这份草稿已随往来信永久删除，请重新写一封。' };
  const lines = cleanUserLetter(value?.text);
  if (!lines.length) {
    const cleared = clearLetterDraft(storage);
    return { ...cleared, draft: null };
  }
  const previous = readLetterDraft(storage);
  const id = previous?.id || (records.some((letter) => letter.id === DRAFT_ID && letter.purgedAt != null)
    ? `draft:${newOutgoingId()}` : DRAFT_ID);
  const draft = {
    id, direction: 'out', status: 'draft', source: 'user',
    subject: userLetterSubject(value.text), lines, at: Date.now(), read: true,
    shareContext: value?.shareContext !== false,
    ...(value?.shareContext === false ? { period: '不附小屋近况' } : {})
  };
  const result = trySaveLetter(storage, draft);
  return { ...result, draft: result.ok ? draft : null };
}

export function clearLetterDraft(storage) {
  const list = readLetters(storage);
  if (!list.some((letter) => letter.status === 'draft')) return { ok: true, list, error: '' };
  return tryWriteLetters(storage, list.filter((letter) => letter.status !== 'draft'));
}

export function replyFor(outgoingId, list = []) {
  return list.find((letter) => letter.direction === 'in' && letter.replyTo === outgoingId) || null;
}

export function threadRows(list) {
  const replies = new Map((list || []).filter((letter) => letter.direction === 'in' && letter.replyTo).map((letter) => [letter.replyTo, letter]));
  return (list || []).filter((letter) => letter.status !== 'draft' && !letter.replyTo)
    .map((letter) => ({ letter, reply: letter.direction === 'out' ? replies.get(letter.id) || null : null }));
}

// Stable mailbox rows. An outbound letter and its reply are one row; automatic
// letters are their own row. Drafts live only in the composer.
export function mailboxRows(list, filter = 'all', query = '') {
  const term = query.trim().toLocaleLowerCase();
  const rows = threadRows(list).map(({ letter, reply }) => {
    const outbound = letter.direction === 'out';
    const latestAt = Math.max(letter.at, reply?.at || 0);
    return {
      id: letter.id, letter, reply, direction: letter.direction,
      latestAt,
      title: outbound ? letter.subject || userLetterSubject(letter.lines.join('\n')) : `小屋来信${letter.period ? ` · ${letter.period}` : ''}`,
      preview: (letter.lines[0] || '').slice(0, 64),
      unread: outbound ? Boolean(reply && !reply.read) : !letter.read,
      pending: outbound && letter.status === 'sending',
      failed: outbound && letter.status === 'failed'
    };
  }).filter((row) => Boolean(row.letter.trashed) === (filter === 'trash')
    && (filter === 'in' ? row.direction === 'in' : filter === 'out' ? row.direction === 'out' : filter === 'favorites' ? row.letter.favorite : true)
    && (!term || [row.title, ...row.letter.lines, ...(row.reply?.lines || [])].join('\n').toLocaleLowerCase().includes(term)));
  return rows.sort((a, b) => b.latestAt - a.latestAt || String(b.id).localeCompare(String(a.id)));
}

export function organizeLetterThread({ storage, id, action, now = Date.now(), win = globalThis } = {}) {
  const list = readLetters(storage), root = list.find((letter) => letter.id === id && !letter.replyTo && letter.status !== 'draft');
  if (!root) return { ok: false, error: '找不到这封信，请重新打开信箱。' };
  if (!['favorite', 'trash', 'restore'].includes(action)) return { ok: false, error: '无法执行这个信件操作。' };
  const organizedAt = Math.max(now, (root.organizedAt || 0) + 1);
  const favorite = action === 'favorite' ? !root.favorite : Boolean(root.favorite);
  const trashed = action === 'trash' || (action === 'favorite' && Boolean(root.trashed));
  const result = tryWriteLetters(storage, list.map((letter) => letter.id === id || letter.replyTo === id
    ? { ...letter, favorite, trashed, organizedAt } : letter));
  if (result.ok) emit(win);
  return result;
}

export function purgeLetterThread({ storage, id, expectedOrganizedAt, now = Date.now(), win = globalThis } = {}) {
  const list = readLetters(storage), root = list.find((letter) => letter.id === id && !letter.replyTo && letter.status !== 'draft');
  if (!root?.trashed || root.organizedAt !== expectedOrganizedAt)
    return { ok: false, error: '信件状态已改变。只能永久删除仍在回收站里的往来信，请重新确认。' };
  const removed = list.filter((letter) => letter.id === id || letter.replyTo === id
    || (letter.status === 'draft' && letter.at <= root.at && letter.lines.join('\n') === root.lines.join('\n')));
  const result = tryWriteLetters(storage, [
    ...removed.map((letter) => ({ id: letter.id, purgedAt: now })),
    ...list.filter((letter) => !removed.includes(letter))
  ]);
  if (result.ok) emit(win);
  return result;
}

export function pageSlice(rows, page = 1, size = 6) {
  const all = Array.isArray(rows) ? rows : [], per = Math.max(1, Math.round(size));
  const totalPages = Math.max(1, Math.ceil(all.length / per));
  const current = Math.max(1, Math.min(totalPages, Math.round(page) || 1));
  const from = (current - 1) * per;
  return { rows: all.slice(from, from + per), page: current, totalPages, total: all.length, from, to: Math.min(all.length, from + per) };
}

// An interrupted request can be completed locally without resending private
// text or creating another copy of the user's letter.
export function recoverCabinLetter({ storage, id, win = globalThis } = {}) {
  const list = readLetters(storage);
  const outgoing = list.find((letter) => letter.id === id && letter.direction === 'out');
  if (!outgoing) return { ok: false, error: '找不到这封信。' };
  const existing = replyFor(id, list);
  if (existing) return { ok: true, outgoing, reply: existing };
  const reply = {
    id: replyId(id), direction: 'in', status: 'delivered', replyTo: id,
    subject: `回信 · ${outgoing.subject}`, lines: localLetterReply(outgoing.lines.join('\n')),
    source: 'template', at: Date.now(), read: false
  };
  if (outgoing.organizedAt != null) Object.assign(reply, {
    organizedAt: outgoing.organizedAt, favorite: outgoing.favorite, trashed: outgoing.trashed
  });
  const sent = { ...outgoing, status: 'sent' };
  const written = tryWriteLetters(storage, [sent, reply, ...list.filter((letter) => letter.id !== id
    && !(letter.status === 'draft' && letter.at <= outgoing.at
      && letter.lines.join('\n') === outgoing.lines.join('\n')))]);
  if (!written.ok) return written;
  emit(win);
  return { ok: true, outgoing: sent, reply };
}

/**
 * Save the user's letter before making any network request. The local reply is
 * always available as a fallback, so a failed endpoint cannot erase the words
 * or leave the composer stuck.
 */
export async function sendCabinLetter({
  storage, text, summary = null, now = Date.now(), draftId,
  chatImpl = chat, win = globalThis, replyDelayMs = 650
} = {}) {
  const lines = cleanUserLetter(text);
  if (!lines.length) return { ok: false, error: '写一点内容再寄出吧。', outgoing: null, reply: null };
  try {
    if (draftId && readLetterRecords(storage).some((letter) => letter.id === draftId && letter.purgedAt != null))
      return { ok: false, deleted: true, error: '这份草稿已永久删除，请重新写一封。' };
  } catch { return { ok: false, error: '信箱无法读取，信没有寄出。' }; }
  const settings = readAi(storage), key = keyState(win);
  const outgoing = {
    id: newOutgoingId(now), direction: 'out', status: 'sending', source: 'user',
    subject: userLetterSubject(text), lines, at: now, read: true,
    period: summary?.period || '', shareContext: Boolean(summary)
  };
  const saved = trySaveLetter(storage, outgoing);
  if (!saved.ok) return { ok: false, error: saved.error, outgoing: null, reply: null, fallback: false };
  const draftAtSend = readLetterDraft(storage);
  emit(win);

  const ready = aiReady(settings, key.stored) && key.endpoint === chatUrl(settings.baseUrl);
  let result = null, stale = false;
  const invalidate = () => { stale = true; };
  const storageChanged = (event) => {
    if (event.key === null || [AI_SETTINGS_KEY, AI_KEY_KEY].includes(event.key)) invalidate();
  };
  for (const event of [AI_EVENT, AI_KEY_EVENT, 'pagehide']) win.addEventListener?.(event, invalidate);
  win.addEventListener?.('storage', storageChanged);
  try {
    if (ready) {
      try { result = await chatImpl(settings, userLetterMessages(lines.join('\n'), summary, settings.tone)); }
      catch { result = null; }
    }
    if (replyDelayMs > 0) await wait(replyDelayMs);
  } finally {
    for (const event of [AI_EVENT, AI_KEY_EVENT, 'pagehide']) win.removeEventListener?.(event, invalidate);
    win.removeEventListener?.('storage', storageChanged);
  }
  if (JSON.stringify(readAi(storage)) !== JSON.stringify(settings) || keyState(win).revision !== key.revision) stale = true;
  const aiLines = !stale && result?.ok ? cleanLetter(result.text) : [];
  const replyLines = aiLines.length ? aiLines : localLetterReply(lines.join('\n'), summary);
  const reply = {
    id: replyId(outgoing.id), direction: 'in', status: 'delivered', replyTo: outgoing.id,
    cadence: 'weekly', tone: settings.tone, period: summary?.period || '刚刚',
    subject: `回信 · ${outgoing.subject}`,
    lines: replyLines, source: aiLines.length ? 'ai' : 'template', at: Date.now(), read: false,
    ...(summary?.evidence?.length ? { evidence: summary.evidence } : {})
  };
  const current = readLetters(storage);
  // A restore or deletion while waiting owns the new state; do not resurrect it.
  if (!current.some((letter) => letter.id === outgoing.id)) {
    return { ok: false, deleted: true, error: '这封信已被移除，迟到的回信没有保存。', outgoing: null, reply: null };
  }
  const latestOutgoing = current.find((letter) => letter.id === outgoing.id);
  const sent = { ...latestOutgoing, status: 'sent' };
  if (latestOutgoing.organizedAt != null) Object.assign(reply, {
    organizedAt: latestOutgoing.organizedAt, favorite: latestOutgoing.favorite, trashed: latestOutgoing.trashed
  });
  const recovered = replyFor(outgoing.id, current);
  if (recovered) return { ok: true, outgoing: { ...outgoing, status: 'sent' }, reply: recovered, fallback: true, error: '' };
  const latest = current.filter((letter) => letter.id !== outgoing.id && letter.id !== reply.id
    && !(letter.status === 'draft' && JSON.stringify(letter) === JSON.stringify(draftAtSend)));
  const written = tryWriteLetters(storage, [sent, reply, ...latest]);
  if (!written.ok) return { ok: false, error: written.error, outgoing: { ...outgoing, status: 'sending' }, reply: null, fallback: !aiLines.length };
  emit(win);
  return {
    ok: true, outgoing: sent, reply, fallback: !aiLines.length,
    notice: !ready ? 'AI 没有连接，小屋用自己的话写了回信。' : !aiLines.length ? result?.error || 'AI 暂时没有回信，小屋用自己的话写完了。' : '',
    error: ''
  };
}

export { LETTERS_KEY, readLetters };
