import React, { useMemo, useState } from 'react';
import { RecordBoxControls } from '../RecordLibrary';
import { SORTS, DEFAULT_FILTERS } from '../room/useShelf';
import { useCabinRuntime } from '../runtime/CabinRuntime';

export default function RoomLibrary({ visible, filters, setFilters, openAdd, openRecord, openWall }) {
  const { deck, commands, items } = useCabinRuntime(), [query, setQuery] = useState('');
  const list = useMemo(() => visible.filter(item => `${item.title} ${item.artist}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [visible, query]);
  return <section className="home-library" aria-label="唱片库">
    <div className="home-library-actions"><button type="button" className="home-primary" onClick={() => openAdd()}>添加到唱片架</button><button type="button" onClick={openWall}>专辑墙</button><button type="button" onClick={() => commands.open('music-settings')}>音源与账号</button></div>
    <input type="search" aria-label="搜索唱片库" placeholder="搜索唱片、歌曲或音乐人" value={query} onChange={e => setQuery(e.target.value)}/>
    <div className="home-library-filters"><label>排序<select aria-label="排序方式" value={filters.sort} onChange={e => setFilters({ ...filters, sort: e.target.value })}>{Object.entries(SORTS).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><label>类型<select aria-label="筛选类型" value={filters.type} onChange={e => setFilters({ ...filters, type: e.target.value })}><option value="all">全部</option><option value="album">专辑</option><option value="song">单曲</option><option value="playlist">歌单</option></select></label></div>
    <RecordBoxControls items={items} filters={filters} setFilters={patch => setFilters(old => ({ ...old, ...(typeof patch === 'function' ? patch(old) : patch) }))} count={list.length}/>
    {!list.length && <p>{items.length ? '没有找到相符的唱片。' : '把喜欢的音乐放进来，随时回来听。'}{items.length > 0 && <button type="button" onClick={() => { setQuery(''); setFilters({ ...DEFAULT_FILTERS }); }}>清除筛选</button>}</p>}
    <ul className="home-record-grid">{list.map(item => <li key={item.id} data-playing={deck.deckItem?.id === item.id}>
      <button type="button" className="home-record-cover" aria-label={`播放 ${item.title}`} onClick={() => commands.load(item)}>{item.cover ? <img src={item.cover} loading="lazy" alt=""/> : <span aria-hidden="true">♫</span>}<span className="home-record-play">播放</span></button>
      <button type="button" className="home-record-title" onClick={() => openRecord(item.id)}><strong>{item.title}</strong><small>{item.artist}</small></button>
      <button type="button" className="home-record-queue" aria-label={`${deck.isQueued(item.id) ? '移出待播' : '加入待播'} ${item.title}`} onClick={() => deck.isQueued(item.id) ? deck.player.remove(item.id) : deck.player.enqueue(item.id)}>{deck.isQueued(item.id) ? '已在待播' : '＋待播'}</button>
    </li>)}</ul>
  </section>;
}
