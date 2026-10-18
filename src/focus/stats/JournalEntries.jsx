import React, { useEffect, useRef, useState } from 'react';
import {
  JOURNAL_KEY, JOURNAL_CHANGE, JOURNAL_BODY_LIMIT, readJournalRecords, findJournalEntries,
  saveJournalEntry, moveJournalEntry, restoreJournalRevision
} from '../journal-entries.mjs';
import './journal-entries.css';

const stamp = (time) => new Date(time).toLocaleString('zh-CN', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
const title = (body) => body.trim().split('\n')[0] || '还没写完的一页';
const store = () => globalThis.localStorage;
// If disk storage fails, closing the notebook must not discard the working
// copy. Keep it for this window's lifetime and warn before the page unloads.
const workingDrafts = new Map();
export function useJournalDraftWarning() {
  useEffect(() => {
    const warn = (event) => {
      if (workingDrafts.size) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
}
function read() {
  try { return { entries: readJournalRecords(store()), error: '' }; }
  catch { return { entries: [], error: '手记暂时无法读取，原有内容没有被覆盖。请检查本机存储或备份。' }; }
}

function EntryEditor({ entry, onSaved, onMove, reload }) {
  const draft = workingDrafts.get(entry.id);
  const [body, setBody] = useState(draft?.body ?? entry.body), [tags, setTags] = useState(draft?.tags ?? entry.tags.join('，'));
  const [notice, setNotice] = useState(draft ? '已接回尚未保存的修改，请重试或另存一页。' : '已保存到本机');
  const [error, setError] = useState(Boolean(draft)), [conflicted, setConflicted] = useState(false);
  const [history, setHistory] = useState(false);
  const current = useRef(draft?.base || entry), checkpoint = useRef(true);
  const save = (nextBody, nextTags) => {
    const result = saveJournalEntry({ storage: store(), id: entry.id, expectedVersion: current.current.version, body: nextBody, tags: nextTags, checkpoint: checkpoint.current });
    setError(!result.ok); setConflicted(Boolean(result.conflict));
    setNotice(result.ok ? '已保存到本机' : result.error);
    if (result.ok) {
      if (result.entry.version !== current.current.version) checkpoint.current = false;
      current.current = result.entry; onSaved(result.entry);
      workingDrafts.delete(entry.id);
    } else workingDrafts.set(entry.id, { body: nextBody, tags: nextTags, base: current.current });
    return result.ok;
  };
  const copy = () => {
    const result = saveJournalEntry({ storage: store(), body, tags });
    setError(!result.ok); setNotice(result.ok ? '已另存为新的一页' : result.error);
    if (result.ok) { workingDrafts.delete(entry.id); onSaved(result.entry, '已另存为新的一页，原来的页也保留着。'); }
  };
  const restore = (version) => {
    if (error) return;
    const result = restoreJournalRevision({ storage: store(), id: entry.id, expectedVersion: current.current.version, revision: version });
    if (result.ok) reload(result.entry);
    else { setError(true); setNotice(result.error); setConflicted(Boolean(result.conflict)); }
  };
  const trashed = entry.deletedAt != null;
  return <div className="journal-entry-editor">
    <header className="journal-entry-heading">
      <div><small>{trashed ? '回收站里的手记' : '给今天留一页'}</small><h3>{stamp(entry.createdAt)}</h3></div>
      <button type="button" className="journal-entry-quiet" disabled={error} onClick={() => onMove(current.current, !trashed)}>{trashed ? '放回日记' : '移到回收站'}</button>
    </header>
    <label className="journal-entry-body-label"><span className="sr-only">这一页的内容</span>
      <textarea autoFocus aria-label="这一页的内容" readOnly={trashed} maxLength={JOURNAL_BODY_LIMIT} value={body}
        placeholder="今天发生的小事，听到的一句歌词，或者一段还没想好的话。"
        onChange={(event) => { const value = event.target.value; setBody(value); save(value, tags); }}/>
    </label>
    <div className="journal-entry-count"><span>{body.length} / {JOURNAL_BODY_LIMIT} 字</span><span>修改于 {stamp(current.current.updatedAt)}</span></div>
    <label className="journal-entry-tags">标签
      <input aria-label="这一页的标签" value={tags} readOnly={trashed} maxLength={200} placeholder="例如：工作，音乐，心情"
        onChange={(event) => { setTags(event.target.value); save(body, event.target.value); }}/>
      <small>逗号分隔，最多 8 个标签，每个 24 字。</small>
    </label>
    <p role={error ? 'alert' : 'status'} className={`journal-entry-status ${error ? 'is-error' : ''}`}>{notice}</p>
    {error && <div className="journal-entry-actions">
      {!conflicted && <button type="button" onClick={() => save(body, tags)}>重试保存</button>}
      <button type="button" onClick={copy}>另存为新的一页</button>
    </div>}
    <div className="journal-entry-history">
      <button type="button" className="journal-entry-quiet" aria-expanded={history} onClick={() => setHistory((value) => !value)}>编辑历史 · {entry.revisions.length} 个版本</button>
      {history && <div>
        <p>保留每次打开这页编辑前的版本。恢复历史时，也会留下当前内容。</p>
        {entry.revisions.length === 0 && <p>这一页还没有旧版本。</p>}
        {[...entry.revisions].reverse().map((revision) => <details key={revision.version}>
          <summary>{stamp(revision.at)} · {title(revision.body).slice(0, 32)}</summary>
          <p className="journal-entry-old-body">{revision.body || '空白的一页'}</p>
          {!trashed && <button type="button" disabled={error} onClick={() => restore(revision.version)}>恢复这个版本</button>}
        </details>)}
      </div>}
    </div>
    <p className="journal-entry-private">这些手记只保存在本机，并随小屋备份一起搬家。不会自动附到 AI 来信中。</p>
  </div>;
}

export default function JournalEntries() {
  const [data, setData] = useState(read), [query, setQuery] = useState(''), [tag, setTag] = useState(''), [trash, setTrash] = useState(false);
  const [selectedId, setSelectedId] = useState(''), [visit, setVisit] = useState(0), [notice, setNotice] = useState('');
  useEffect(() => {
    const refresh = (event) => {
      if (event.type === 'storage' && event.key !== null && event.key !== JOURNAL_KEY) return;
      const next = read(); setData((previous) => next.error ? { ...previous, error: next.error } : next);
    };
    window.addEventListener(JOURNAL_CHANGE, refresh); window.addEventListener('storage', refresh);
    return () => { window.removeEventListener(JOURNAL_CHANGE, refresh); window.removeEventListener('storage', refresh); };
  }, []);
  const rows = findJournalEntries(data.entries, { query, tag, trash });
  const selected = data.entries.find((entry) => entry.id === selectedId);
  const tags = [...new Set(data.entries.filter((entry) => entry.deletedAt == null).flatMap((entry) => entry.tags))].sort();
  const select = (entry) => { setSelectedId(entry.id); setVisit((value) => value + 1); setNotice(''); };
  const create = () => {
    const result = saveJournalEntry({ storage: store(), body: '' });
    if (result.ok) { setTrash(false); setQuery(''); setTag(''); select(result.entry); }
    else setNotice(result.error);
  };
  const move = (entry, toTrash) => {
    const result = moveJournalEntry({ storage: store(), id: entry.id, expectedVersion: entry.version, trash: toTrash });
    if (result.ok) { setSelectedId(''); setNotice(toTrash ? '已放进回收站，随时可以找回来。' : '这一页已放回日记。'); }
    else setNotice(result.error);
  };
  return <div className="fs-spread journal-entries-spread" role="tabpanel" aria-label="手记">
    <section className="fs-page journal-entry-index" aria-label="手记列表">
      <header><div><h3>我的手记</h3><p>把日子一页一页收好。</p></div><button type="button" className="journal-entry-new" disabled={Boolean(data.error)} onClick={create}>写一页</button></header>
      <label className="journal-entry-search"><span className="sr-only">搜索手记</span><input aria-label="搜索手记" type="search" placeholder="找一句话，或一个标签" value={query} onChange={(event) => setQuery(event.target.value)}/></label>
      <div className="journal-entry-filter">
        <button type="button" aria-pressed={!trash} onClick={() => { setTrash(false); setSelectedId(''); }}>手记</button>
        <button type="button" aria-pressed={trash} onClick={() => { setTrash(true); setSelectedId(''); }}>回收站</button>
        <select aria-label="筛选手记标签" value={tag} onChange={(event) => setTag(event.target.value)}><option value="">所有标签</option>{tags.map((value) => <option key={value}>{value}</option>)}</select>
      </div>
      {data.error && <p role="alert">{data.error}</p>}
      {notice && <p role="status">{notice}</p>}
      <ol className="journal-entry-list">
        {rows.map((entry) => <li key={entry.id}><button type="button" aria-current={selectedId === entry.id ? 'true' : undefined} onClick={() => select(entry)}>
          <time>{stamp(entry.createdAt)}</time><strong>{title(entry.body)}</strong><span>{workingDrafts.has(entry.id) ? '有尚未保存的修改' : entry.tags.map((value) => `#${value}`).join(' ') || '没有标签'}</span>
        </button></li>)}
      </ol>
      {!rows.length && <p className="journal-entry-empty">{query || tag ? '没有找到这一页。试试别的词。' : trash ? '回收站是空的。' : '不需要写得完整，一两句也很好。'}</p>}
      <small>{rows.length} 页 · 所有历史都保留在本机</small>
    </section>
    <div className="fs-spine has-art" aria-hidden="true"/>
    <section className="fs-page journal-entry-main" aria-label="手记内容">
      {selected ? <EntryEditor key={`${selected.id}:${visit}`} entry={selected} onSaved={(entry, message) => { setSelectedId(entry.id); if (message) setNotice(message); }} onMove={move} reload={select}/>
        : <div className="journal-entry-welcome"><img src="/cat/cat-desk.png" width={128} height={128} alt="奶糖趴在桌边"/><h3>这里有你的一页</h3><p>记下今天，或者翻一翻从前。</p><button type="button" className="journal-entry-new" disabled={Boolean(data.error)} onClick={create}>开始写一页</button></div>}
    </section>
  </div>;
}
