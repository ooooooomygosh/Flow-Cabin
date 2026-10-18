import React, { useEffect, useState } from 'react';
import { JOURNAL_KEY, JOURNAL_CHANGE, readJournalRecords } from '../journal-entries.mjs';
import { journalExcerpt, journalSelectionCurrent, LETTER_JOURNAL_LIMIT, LETTER_JOURNAL_CHARS } from '../../ai/letter-context.mjs';

export default function LetterJournalPicker({ selected, onChange, disabled }) {
  const read = () => {
    try { return { entries: readJournalRecords(globalThis.localStorage), error: '' }; }
    catch { return { entries: [], error: '手记暂时无法读取，请稍后再选择摘录。' }; }
  };
  const [data, setData] = useState(read), [query, setQuery] = useState('');
  useEffect(() => {
    const refresh = (event) => {
      if (event.type !== 'storage' || event.key === null || event.key === JOURNAL_KEY) setData(read());
    };
    window.addEventListener(JOURNAL_CHANGE, refresh); window.addEventListener('storage', refresh);
    return () => { window.removeEventListener(JOURNAL_CHANGE, refresh); window.removeEventListener('storage', refresh); };
  }, []);
  const rows = data.entries.filter((entry) => entry.deletedAt == null && entry.body.trim()
    && (!query.trim() || `${entry.body} ${entry.tags.join(' ')}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())));
  const current = journalSelectionCurrent(selected, data.entries);
  return <details className="fs-mail-journal-picker">
    <summary>选择手记摘录（仅这次） · {selected.length}/{LETTER_JOURNAL_LIMIT}</summary>
    <p>每页只附前 {LETTER_JOURNAL_CHARS} 字，最多 {LETTER_JOURNAL_LIMIT} 页。AI 开启时，只将下面勾选的摘录发给你配置的服务；本地回信不会外发。收起写信后会清除选择。</p>
    {data.error && <p role="alert">{data.error}</p>}
    {!current && <p role="alert">选中的手记已修改或放入回收站。请取消后重新选择，再寄信。</p>}
    <label>查找要附上的手记<input aria-label="查找要附上的手记" type="search" value={query} disabled={disabled} onChange={(event) => setQuery(event.target.value)}/></label>
    <div className="fs-mail-journal-choices">
      {rows.slice(0, 20).map((entry) => {
        const picked = selected.some((item) => item.id === entry.id);
        return <label key={entry.id}>
          <input type="checkbox" disabled={disabled || (!picked && selected.length >= LETTER_JOURNAL_LIMIT)} checked={picked}
            onChange={(event) => onChange(event.target.checked ? [...selected, journalExcerpt(entry)] : selected.filter((item) => item.id !== entry.id))}/>
          <span>{entry.body.trim().split('\n')[0].slice(0, 60)}</span>
        </label>;
      })}
      {!rows.length && <p>{query ? '没有找到这页手记。' : '还没有可以附上的手记。'}</p>}
      {rows.length > 20 && <small>显示最近 20 页，可用关键词查找更早的手记。</small>}
    </div>
    {selected.length > 0 && <section aria-label="本次附上的手记摘录">
      <strong>本次会附上的原文</strong>
      {selected.map((item, index) => <article key={item.id}>
        <p>{item.excerpt}</p>
        <button type="button" className="fs-mail-quiet" disabled={disabled} aria-label={`取消第 ${index + 1} 页手记摘录`} onClick={() => onChange(selected.filter((value) => value.id !== item.id))}>取消这页摘录</button>
      </article>)}
    </section>}
  </details>;
}
