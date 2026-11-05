import React, { forwardRef, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useCabinRuntime } from '../runtime/CabinRuntime';
import { useRecordLibrary } from '../RecordLibrary';
import { albumKey, genresFor } from '../record-library.mjs';
import { Search, Plus } from '../icons';
import { Cover } from '../listen/listen-hooks';
import { displayTitle } from '../display-title.mjs';
import { playSfx } from '../props/sfx.mjs';
import { INITIALS, VIA_LABEL, cardCode, groupByInitial, indexOrder, initialFor, keepHighlight, moveHighlight, rankRecords } from './shelf-model.mjs';

// The A–Z index book, open on the desk: a typing line at the top of the left page, the
// records in book order (or ranked by what you typed) under it, thumb tabs down the edge,
// and the record card of whatever is highlighted on the right page. Typing is on from the
// first moment; ↑/↓ walk the list, Enter puts the record on the deck.
// The layout follows DEsk's index book (https://github.com/fyzugx/DEsk, MIT, (c) 2026 The DEsk authors).
const KIND = { album: '专辑', song: '单曲', playlist: '歌单' };
const kindOf = (item) => KIND[item?.type] || '专辑';

const IndexBook = forwardRef(function IndexBook({ items, openRecord, openAdd, onPutBack, id }, ref) {
  const { commands, deck } = useCabinRuntime(), library = useRecordLibrary();
  const [query, setQuery] = useState(''), [activeId, setActiveId] = useState(null), [placed, setPlaced] = useState(''), listId = useId(), inputRef = useRef(null), listRef = useRef(null), mounted = useRef(false);
  const searching = query.trim().length > 0;
  const tagsOf = useCallback((item) => genresFor(item, library?.data), [library?.data]);
  const entries = useMemo(() => searching ? rankRecords(items, query, { tagsOf }) : indexOrder(items).map((item) => ({ item, tier: -1, via: '' })), [items, query, searching, tagsOf]);
  const groups = useMemo(() => searching ? null : groupByInitial(items), [items, searching]);
  const active = keepHighlight(activeId, entries.map((entry) => ({ id: entry.item.id })));
  const current = active >= 0 ? entries[active] : null, item = current?.item || null;
  const optionId = (entry) => `${listId}-${String(entry.item.id).replace(/[^\w-]/g, '_')}`;
  useEffect(() => { inputRef.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    if (current) listRef.current?.querySelector(`#${CSS.escape(optionId(current))}`)?.scrollIntoView({ block: 'nearest' });
  }, [current?.item.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!placed) return undefined; const timer = setTimeout(() => setPlaced(''), 2200); return () => clearTimeout(timer); }, [placed]);
  useEffect(() => { setPlaced(''); }, [item?.id]);

  const place = (target) => { if (!target) return; commands.load(target); setPlaced(String(target.id)); };
  const move = (key) => { const next = moveHighlight(active, key, entries.length); if (next >= 0) setActiveId(entries[next].item.id); };
  const keyDown = (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); move(event.key); }
    else if (event.key === 'Enter') { if (item) { event.preventDefault(); place(item); } }
    else if (event.key === 'Escape' && query) { event.preventDefault(); event.stopPropagation(); setQuery(''); }
  };

  // The thumb tabs: a letter is lit when something in the list begins with it.
  const firstOf = useMemo(() => { const map = new Map(); for (const entry of entries) { const letter = initialFor(entry.item.title); if (!map.has(letter)) map.set(letter, entry.item.id); } return map; }, [entries]);
  const here = item ? initialFor(item.title) : '';
  const jump = (letter) => { const target = firstOf.get(letter); if (target === undefined) return; playSfx('page-turn'); setActiveId(target); inputRef.current?.focus({ preventScroll: true }); };
  const tabKeys = (event) => {
    const keys = [...event.currentTarget.querySelectorAll('button:not(:disabled)')], at = keys.indexOf(document.activeElement);
    const next = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? at + 1 : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? at - 1 : event.key === 'Home' ? 0 : event.key === 'End' ? keys.length - 1 : null;
    if (next === null || !keys.length) return;
    event.preventDefault(); keys[(next + keys.length) % keys.length].focus();
  };
  const rovingLetter = firstOf.has(here) ? here : [...firstOf.keys()][0];

  const boxNames = item && library ? library.boxes.filter((box) => box.keys.includes(albumKey(item))).map((box) => box.name) : [];
  const tags = item ? [...new Set(tagsOf(item))].slice(0, 6) : [];
  const queued = item ? deck.isQueued(item.id) : false;
  const tracks = Array.isArray(item?.tracks) ? item.tracks.length : 0;
  const row = (entry) => {
    const { item: record } = entry, on = current?.item.id === record.id, playing = String(deck.deckItem?.id) === String(record.id);
    return <li key={record.id} id={optionId(entry)} role="option" aria-selected={on} className={`shelf-entry${on ? ' is-active' : ''}${playing ? ' is-playing' : ''}`} onClick={() => { setActiveId(record.id); inputRef.current?.focus({ preventScroll: true }); }} onDoubleClick={() => place(record)}>
      <Cover item={record}/>
      <span className="shelf-entry-name"><strong>{displayTitle(record.title)}</strong><small>{record.artist}</small></span>
      <i className="shelf-leader" aria-hidden="true"/>
      <span className="shelf-entry-tag">{entry.via ? `${VIA_LABEL[entry.via]}` : kindOf(record)}</span>
    </li>;
  };
  const found = searching ? (entries.length ? `找到 ${entries.length} 条` : '没有找到') : `共 ${items.length} 张`;
  const empty = !items.length;

  return <section ref={ref} id={id} className="shelf-object shelf-open-book" aria-label="索引本">
    <div className="shelf-page is-left paper">
      <h2 className="shelf-book-title">唱片索引</h2>
      <p className="shelf-book-sub">架上每一张唱片，按首字母排好</p>
      <label className="shelf-typing"><Search size={18}/><input ref={inputRef} type="text" role="combobox" aria-label="搜索唱片架" aria-autocomplete="list" aria-expanded="true" aria-controls={listId} aria-activedescendant={current ? optionId(current) : undefined} placeholder="写下名字，或是它是什么" autoComplete="off" spellCheck="false" value={query} disabled={empty} onChange={(event) => setQuery(event.target.value)} onKeyDown={keyDown}/></label>
      <p className="shelf-found" role="status">{empty ? '索引还是空白的' : found}</p>
      <ul ref={listRef} id={listId} className="shelf-entries" role="listbox" aria-label={searching ? '搜索结果' : '唱片索引'}>
        {searching ? entries.map(row) : groups.map((group) => <React.Fragment key={group.letter}>
          <li role="presentation" className="shelf-letter-head" aria-hidden="true"><b>{group.letter}</b></li>
          {group.items.map((record) => row({ item: record, via: '' }))}
        </React.Fragment>)}
      </ul>
      <div className="shelf-page-foot"><button type="button" className="shelf-link" onClick={onPutBack}>放回架上</button></div>
    </div>
    <div className="shelf-page is-right paper">
      {item ? <article className="shelf-record-card" aria-label={`唱片卡：${item.title}`}>
        <i className="shelf-diamond is-tl" aria-hidden="true"/><i className="shelf-diamond is-tr" aria-hidden="true"/><i className="shelf-diamond is-bl" aria-hidden="true"/><i className="shelf-diamond is-br" aria-hidden="true"/>
        <p className="shelf-card-code">{kindOf(item)} · {cardCode(active, entries.length)}</p>
        <div className="shelf-card-cover"><Cover item={item}/></div>
        <h3>{displayTitle(item.title)}</h3>
        <p className="shelf-card-artist">{item.artist}</p>
        <hr className="shelf-rule"/>
        <dl className="shelf-card-facts">
          <div><dt>收录于</dt><dd>{boxNames.length ? boxNames.join('、') : '未放进唱片盒'}</dd></div>
          <div><dt>{tracks ? `${tracks} 首` : kindOf(item)}{item.year ? ` · ${item.year}` : ''}</dt><dd>{tags.length ? `也可以这样找到：${tags.join('、')}` : (current?.via ? `因为${VIA_LABEL[current.via]}匹配` : '')}</dd></div>
        </dl>
        <div className="shelf-card-actions">
          <button type="button" className="listen-primary" onClick={() => place(item)}>放到唱机</button>
          <button type="button" className="listen-secondary" aria-label={`${queued ? '移出待播' : '加入待播'} ${item.title}`} onClick={() => queued ? deck.player.remove(item.id) : deck.player.enqueue(item.id)}>{queued ? '已在待播' : '加入待播'}</button>
          <button type="button" className="listen-secondary" onClick={() => openRecord(item.id)}>唱片卡片</button>
        </div>
        <p className="shelf-card-hint" role="status">{placed === String(item.id) ? '已放到唱机' : '按回车放到唱机'}</p>
      </article> : <div className="shelf-record-card is-blank">
        <p className="shelf-card-code">{empty ? '空白' : '没有这一页'}</p>
        <p className="shelf-card-blank">{empty ? '架子还空着，索引本也还是空白的。放上第一张唱片，它就会记在这里。' : '换个字试试：名字、音乐人、标签、曲目都可以。'}</p>
        {empty && <div className="shelf-card-actions"><button type="button" className="listen-primary" onClick={() => openAdd()}><Plus size={14}/>添加到唱片架</button></div>}
      </div>}
    </div>
    <div className="shelf-rings is-book" aria-hidden="true"/>
    <nav className="shelf-letters" aria-label="按首字母翻页" onKeyDown={tabKeys}>
      {INITIALS.map((letter) => <button key={letter} type="button" className={`shelf-letter${here === letter ? ' is-here' : ''}`} disabled={!firstOf.has(letter)} tabIndex={letter === rovingLetter ? 0 : -1} aria-label={letter === '#' ? '跳到 数字与符号' : `跳到 ${letter}`} aria-current={here === letter ? 'true' : undefined} onClick={() => jump(letter)}>{letter}</button>)}
    </nav>
  </section>;
});
export default IndexBook;
