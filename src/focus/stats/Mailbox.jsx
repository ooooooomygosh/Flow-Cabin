import React, { useEffect, useMemo, useState } from 'react';
import { useLetters, useAiSettings } from '../../ai/useCabinLetters.js';
import { aiReady, chatUrl, cleanUserLetter } from '../../ai/ai-model.mjs';
import { buildLetterContext, recentLetterPeriod, ambienceSnapshot } from '../../ai/letter-context.mjs';
import { readPlaybackSessions } from '../../player/playback-log.mjs';
import { readCatMood, subscribeCatMood } from './cat-mood-source.mjs';
import { hasArt, LETTER_PLACEHOLDER, sprite } from './journal-art.mjs';
import './mailbox.css';

const minuteKey = (time) => Math.floor(time / 60000);
const clock = (time) => {
  const date = new Date(time);
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};
const EVIDENCE_LABEL = { focus: '专注', listening: '真实播放', weather: '窗外', time: '时段', note: '随手记', cat: '奶糖' };
const SOURCE_LABEL = { ai: 'AI 回信', template: '小屋亲笔', user: '我写的信' };
const STATUS_LABEL = { draft: '草稿', sending: '正在读', sent: '已寄出', failed: '未寄出' };

function MailArt() {
  return <span className="fs-mail-art" aria-hidden="true"><span style={{ backgroundImage: `url(${sprite('mailbox')})` }}/></span>;
}

function JournalSprite({ name, width = 64, height = 64, className = '' }) {
  return <img className={`fs-sprite ${className}`} src={sprite(name)} alt="" width={width} height={height} draggable={false}
    onError={(event) => { const fallback = LETTER_PLACEHOLDER[name]; if (fallback && !event.currentTarget.src.endsWith(fallback)) event.currentTarget.src = fallback; }}/>;
}

function useCatMood(from, to, tick) {
  const read = () => { try { return readCatMood(globalThis.localStorage, from, to); } catch { return null; } };
  const [mood, setMood] = useState(read);
  useEffect(() => { setMood(read()); return subscribeCatMood(globalThis.window, () => setMood(read())); }, [from, to, tick]);
  return mood;
}

function Evidence({ items = [] }) {
  if (!items.length) return null;
  return <ul className="fs-mail-evidence" aria-label="这封信参考的小屋近况">
    {items.map((item, index) => <li key={`${item.kind}-${index}`} data-kind={item.kind}><span>{EVIDENCE_LABEL[item.kind] || '小屋'}</span>{item.text}</li>)}
  </ul>;
}

function LetterBody({ letter, reduced = false }) {
  return <div className={`fs-mail-paper ${letter.source === 'ai' ? 'is-ai' : ''}`}
    style={{ backgroundImage: `url(${sprite('letter-paper')}), url(${LETTER_PLACEHOLDER['letter-paper']})` }}>
    <header>
      <span>{SOURCE_LABEL[letter.source] || '小屋来信'}</span>
      <time dateTime={new Date(letter.at).toISOString()}>{clock(letter.at)}</time>
    </header>
    <div className="fs-mail-lines">{letter.lines.map((line, index) => <p key={index}>{line}</p>)}</div>
    <footer><span className="fs-mail-sign">{letter.direction === 'out' ? '我 · 写给小屋' : '小屋 · 奶糖'}</span>{!reduced && <img src={sprite('letter-seal')} alt="" width={16} height={16} draggable={false}/>}</footer>
  </div>;
}

function ThreadView({ row, reduced, sending, onRecover, onOrganize }) {
  if (!row) return <div className="fs-mail-empty-detail">
    <JournalSprite name="cat-wait" width={128} height={128}/>
    <strong>一页安静的空白</strong>
    <p>拆一封小屋的来信，或者写下今天想说的话。</p>
  </div>;
  const { letter, reply } = row, outbound = letter.direction === 'out';
  return <div className={`fs-mail-thread ${outbound ? 'is-out' : 'is-in'}`}>
    <header className="fs-mail-thread-head">
      <div><small>{outbound ? '我寄出的信' : '小屋寄来的信'}</small><h3>{row.title}</h3></div>
      <span className={`fs-mail-status is-${letter.status}`}>{outbound ? STATUS_LABEL[letter.status] || '已寄出' : '已送达'}</span>
    </header>
    <div className="fs-mail-organize" role="group" aria-label="整理这封信">
      <button type="button" className="fs-mail-quiet" aria-pressed={Boolean(letter.favorite)} onClick={() => onOrganize(letter.id, 'favorite')}>{letter.favorite ? '已收藏' : '收藏这封信'}</button>
      <button type="button" className="fs-mail-quiet" onClick={() => onOrganize(letter.id, letter.trashed ? 'restore' : 'trash')}>{letter.trashed ? '放回信箱' : '移到回收站'}</button>
    </div>
    {letter.trashed && <p className="fs-mail-pending-copy">原信和回信一起收在回收站，随时可以放回。</p>}
    <LetterBody letter={letter} reduced={reduced}/>
    <Evidence items={letter.evidence}/>
    {outbound && letter.status === 'sending' && <div className="fs-mail-pending" role="status">
      <JournalSprite name="cat-desk" width={64} height={64}/>
      <p>信已经放进信箱了。奶糖正在灯下慢慢读，回信会落在这一页。</p>
    </div>}
    {outbound && letter.status === 'failed' && <p className="fs-mail-error" role="alert">{letter.error || '这封信没有寄出，草稿仍留在抽屉里。'}</p>}
    {outbound && !reply && !sending && ['sending', 'failed'].includes(letter.status) && <button type="button" className="fs-mail-quiet" onClick={() => onRecover(letter.id)}>用本地回信接上</button>}
    {outbound && reply && <section className="fs-mail-reply" aria-label="小屋回信">
      <header><span><i className="fs-mail-envelope" style={{ backgroundImage: `url(${sprite('letter-envelope')})` }} aria-hidden="true"/>奶糖的回信</span><time>{clock(reply.at)}</time></header>
      <LetterBody letter={reply} reduced={reduced}/>
      <Evidence items={reply.evidence}/>
    </section>}
    {outbound && !reply && letter.status === 'sent' && <p className="fs-mail-pending-copy" role="status">信已寄到。回信还没有落笔，过一会儿再来看看。</p>}
  </div>;
}

function Composer({ sessions, state, now, reduced, draft, shareContext, setShareContext, includeNotes, setIncludeNotes, text, setText, sending, status, onSend, onClose }) {
  const { settings, key } = useAiSettings();
  const ready = aiReady(settings, key.stored) && key.endpoint === chatUrl(settings.baseUrl);
  const minute = minuteKey(now);
  const [ambience, setAmbience] = useState(() => ambienceSnapshot());
  useEffect(() => { const timer = setInterval(() => setAmbience(ambienceSnapshot()), 60000); return () => clearInterval(timer); }, []);
  const period = recentLetterPeriod(now);
  const mood = useCatMood(period.from, period.to, minute);
  const playback = useMemo(() => readPlaybackSessions(globalThis.localStorage), [minute]);
  const summary = useMemo(() => buildLetterContext({
    sessions, playbackSessions: playback, mood, notes: state?.notes || '',
    includeNotes, shareContext, weather: ambience, now
  }), [sessions, playback, mood, state?.notes, includeNotes, shareContext, ambience, minute]);
  const evidence = summary?.evidence || [];
  const hasNotes = Boolean(state?.notes?.trim());
  const lines = cleanUserLetter(text);
  return <div className="fs-mail-composer">
    <header className="fs-mail-composer-head">
      <div><small>写给小屋</small><h3>{draft ? '接着上次没写完的话' : '今天想和奶糖说点什么？'}</h3></div>
      <button type="button" className="fs-mail-quiet" onClick={onClose}>收进抽屉</button>
    </header>
    <label className="fs-mail-textarea-label"><span className="sr-only">写给小屋的信</span>
      <textarea value={text} onChange={(event) => setText(event.target.value)} disabled={sending}
        placeholder="不用写得完整。开心、委屈、今天做成了什么，或者只是想坐一会儿，都可以。" rows={6} maxLength={2880}/>
    </label>
    <div className="fs-mail-compose-meta"><span>随时收起，下次接着写</span><span>{text.length} / 2880 字</span></div>
    <fieldset className="fs-mail-context" disabled={sending}>
      <legend>随信附上的近况</legend>
      <label className="fs-mail-check"><input type="checkbox" checked={shareContext} onChange={(event) => { setShareContext(event.target.checked); if (!event.target.checked) setIncludeNotes(false); }}/>
        <span><strong>让奶糖了解最近的小屋</strong><small>专注与真实播放分开统计，不附待办原文。</small></span></label>
      <label className={`fs-mail-check ${!hasNotes ? 'is-disabled' : ''}`} title={hasNotes ? '默认关闭，只有勾选后才会引用' : '还没有写下随手记'}>
        <input type="checkbox" checked={includeNotes} disabled={!shareContext || !hasNotes || sending} onChange={(event) => setIncludeNotes(event.target.checked)}/>
        <span><strong>允许这次回信参考我的随手记</strong><small>{hasNotes ? 'AI 开启时会把最近一段摘录发给你配置的服务；本地回信不会外发。' : '写几句随手记之后，这里才可以使用。'}</small></span>
      </label>
      <Evidence items={evidence}/>
      {!shareContext && <p className="fs-mail-context-note">这次只寄出你亲手写下的内容。</p>}
    </fieldset>
    <div className="fs-mail-sendbar">
      <p role="status" aria-live="polite">{sending ? '正在把信放进信箱…' : status || (ready ? 'AI 已连接，回信会更贴近你的语气。' : 'AI 未连接也没关系，小屋会用自己的话回信。')}</p>
      <button type="button" className="fs-mail-send" disabled={!lines.length || sending} onClick={onSend}>{sending ? '等奶糖读完…' : '寄给小屋'}</button>
    </div>
    {sending && <div className="fs-mail-sealing" aria-hidden="true"><span/><span/><span/></div>}
  </div>;
}

// 小屋日记 › 信箱. Private correspondence only: nothing here is a social feed.
export default function Mailbox({ sessions, state, now, reduced = false }) {
  const letters = useLetters();
  const [selectedId, setSelectedId] = useState('');
  const [compose, setCompose] = useState(() => Boolean(letters.draft));
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [text, setText] = useState(() => letters.draft?.lines.join('\n') || '');
  const [shareContext, setShareContext] = useState(() => letters.draft?.shareContext !== false);
  const [includeNotes, setIncludeNotes] = useState(false);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState('');
  const [statusError, setStatusError] = useState(false);
  const [draftState, setDraftState] = useState(() => letters.draft ? '草稿已从抽屉里接上' : '');
  const allRows = [...letters.rows('all'), ...letters.rows('trash')], rows = letters.rows(filter, query), paged = letters.page(rows, page, 6);
  const selectedRow = allRows.find((row) => row.id === selectedId) || null;

  useEffect(() => { if (page > paged.totalPages) setPage(paged.totalPages); }, [page, paged.totalPages]);
  useEffect(() => {
    if (!compose && !selectedId && rows[0]) setSelectedId(rows[0].id);
  }, [compose, selectedId, rows[0]?.id]);
  useEffect(() => {
    if (!selectedRow?.unread || selectedRow.letter.trashed) return;
    letters.markRead(selectedRow.direction === 'out' ? selectedRow.reply.id : selectedRow.letter.id);
  }, [selectedRow?.id, selectedRow?.unread]);
  // Save during the input event so closing the book immediately cannot lose
  // the last keystrokes. Drafts are small and never leave local storage.
  const persistDraft = (nextText, nextShare) => {
    const result = letters.saveDraft({ text: nextText, shareContext: nextShare });
    setDraftState(result.ok ? (nextText.trim() ? '草稿已保存' : '') : result.error);
  };
  const changeText = (value) => { setText(value); persistDraft(value, shareContext); };
  const changeContext = (value) => { setShareContext(value); persistDraft(text, value); };

  const openComposer = () => {
    setCompose(true); setSelectedId(''); setStatus('');
    if (letters.draft) { setText(letters.draft.lines.join('\n')); setShareContext(letters.draft.shareContext !== false); setDraftState('草稿已从抽屉里接上'); }
  };
  const choose = (row) => { setCompose(false); setSelectedId(row.id); setStatus(''); };
  const organize = (id, action) => {
    const result = letters.organize(id, action);
    setStatusError(!result.ok);
    setStatus(result.ok ? action === 'trash' ? '已移到回收站，原信与回信都保留着。' : action === 'restore' ? '这封信已放回信箱。' : '收藏状态已保存。' : result.error);
    if (result.ok && action !== 'favorite') setSelectedId('');
  };
  const send = async () => {
    if (!cleanUserLetter(text).length || sending) return;
    setSending(true); setStatus(''); setStatusError(false);
    const period = recentLetterPeriod(Date.now());
    const mood = (() => { try { return readCatMood(globalThis.localStorage, period.from, period.to); } catch { return null; } })();
    const summary = buildLetterContext({
      sessions, playbackSessions: readPlaybackSessions(globalThis.localStorage), mood,
      notes: state?.notes || '', includeNotes, shareContext, weather: ambienceSnapshot(), now: Date.now()
    });
    const result = await letters.send({ text, summary, now: Date.now() });
    setSending(false);
    if (!result.ok) { setStatus(result.error); setStatusError(true); return; }
    setCompose(false); setText(''); setIncludeNotes(false); setDraftState('');
    setFilter('out'); setQuery(''); setSelectedId(result.outgoing.id);
    setStatus(result.notice || '信已经寄出，回信也落在这一页了。');
  };
  const canUsePaper = hasArt('paper');

  return <div className="fs-spread fs-mail-spread" role="tabpanel" aria-label="信箱">
    <section className="fs-page fs-mail-side" aria-label="信件列表">
      <header className="fs-mail-side-head">
        <div className="fs-mail-title"><MailArt/><div><h3>信箱</h3><p>{letters.unread ? `${letters.unread} 封来信还没拆` : '来信与寄出的信都收在这里'}</p></div></div>
        <button type="button" className="fs-mail-write" onClick={openComposer}>写一封信</button>
      </header>
      <label className="fs-mail-search"><span className="sr-only">搜索信件</span><input type="search" aria-label="搜索信件" placeholder="找原信或回信中的一句话" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); setSelectedId(''); }}/></label>
      <div className="fs-mail-filters" role="group" aria-label="筛选信件">
        {[['all', '全部'], ['in', '来信'], ['out', '寄出'], ['favorites', '收藏'], ['trash', '回收站']].map(([id, label]) => <button key={id} type="button" aria-pressed={filter === id} onClick={() => { setFilter(id); setPage(1); setSelectedId(''); }}>{label}</button>)}
      </div>
      {letters.draft && !compose && <button type="button" className="fs-mail-draft" onClick={openComposer}><span>未写完</span><strong>{letters.draft.lines[0]}</strong><small>继续写 ›</small></button>}
      {paged.rows.length ? <ol className="fs-mail-list">{paged.rows.map((row) => <li key={row.id}>
        <button type="button" aria-current={row.id === selectedId ? 'true' : undefined} className={`${row.id === selectedId ? 'is-selected' : ''} ${row.unread ? 'is-unread' : ''}`} onClick={() => choose(row)}>
          <span className={`fs-mail-direction is-${row.direction}`}>{row.direction === 'out' ? '寄' : '来'}</span>
          <span className="fs-mail-row-copy"><strong>{row.title}</strong><small>{row.pending ? '正在等奶糖读信…' : row.preview || '一页没有写字的信'}</small></span>
          <time dateTime={new Date(row.latestAt).toISOString()}>{clock(row.latestAt).split(' ')[0]}</time>
          {row.unread && <i className="fs-mail-unread-dot" aria-label="未读"/>}
        </button>
      </li>)}</ol> : <div className="fs-mail-list-empty"><JournalSprite name="cat-wait" width={96} height={96}/><p>{query ? '没有找到这句话。' : filter === 'trash' ? '回收站是空的。' : filter === 'favorites' ? '还没有收藏的信。' : filter === 'out' ? '还没寄出过信。' : filter === 'in' ? '小屋还没有来信。' : '信箱里空空的。'}</p><small>{filter === 'all' && !query ? '想说话的时候，随时可以写一封。' : '换个筛选或关键词看看。'}</small></div>}
      {paged.totalPages > 1 && <nav className="fs-mail-pages" aria-label="信件分页">
        <button type="button" disabled={paged.page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>‹</button>
        <span>{paged.page} / {paged.totalPages} · 第 {paged.from + 1}–{paged.to} 封</span>
        <button type="button" disabled={paged.page >= paged.totalPages} onClick={() => setPage((value) => Math.min(paged.totalPages, value + 1))}>›</button>
      </nav>}
      <p className="fs-mail-draft-state" role="status">{compose ? draftState : ''}</p>
    </section>
    <div className={`fs-spine ${canUsePaper ? 'has-art' : ''}`} aria-hidden="true"/>
    <section className={`fs-page fs-mail-main ${canUsePaper ? 'has-paper' : ''} ${reduced ? 'is-reduced' : ''}`} aria-label="信件内容">
      {status && <p className={`fs-mail-toast ${statusError ? 'is-error' : ''}`} role="status">{status}</p>}
      {compose ? <Composer sessions={sessions} state={state} now={now} reduced={reduced} draft={Boolean(letters.draft)}
        shareContext={shareContext} setShareContext={changeContext} includeNotes={includeNotes} setIncludeNotes={setIncludeNotes}
        text={text} setText={changeText} sending={sending} status={status} onSend={send} onClose={() => setCompose(false)}/>
        : <ThreadView row={selectedRow} reduced={reduced} sending={sending} onOrganize={organize} onRecover={(id) => {
          const result = letters.recover(id);
          setStatusError(!result.ok);
          setStatus(result.ok ? '小屋已接上这封回信，信的内容没有重新发送。' : result.error);
        }}/>}
    </section>
  </div>;
}
