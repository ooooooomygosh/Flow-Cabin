import React, { useMemo, useState } from 'react';
import { RecordBoxControls } from '../RecordLibrary';
import { SORTS, DEFAULT_FILTERS } from '../room/useShelf';
import { useCabinRuntime } from '../runtime/CabinRuntime';
import { Segmented } from '../ui/Roving';
import { Plus, Play, ShufflePixel, Search, Sparkles, Grid3X3, FolderOpen, Wand2, Album } from '../icons';
import { likedSongs, likePlayOrder, likeQueueEntries } from '../player/likes.mjs';
import { trackCover } from '../track-meta.mjs';
import { displayTitle } from '../display-title.mjs';
import { usesBrowserCollection } from '../collection-api.mjs';
import { isAndroid } from '../mobile/platform.mjs';
import useLabs from '../product/useLabs';
import { SHELF_VIEWS, filtersShown, activeFilterCount, shelfRecords, recentSongs, shortDay } from './listen-model.mjs';
import { useLikes, Cover, usePopover, HeartIcon } from './listen-hooks';
import './listen.css';

// 唱片架 (docs/design/3.0-design.md §6.2): the listening home. Three views — 唱片 (the
// covers are the hero; 网格 ↔ 墙), 我喜欢 (the hearts) and 最近播放. Sorting, 唱片盒 and
// the music filters sit behind one 「筛选」 button, shown from 12 records on.
const PREFS_KEY = 'flow-cabin-shelf-view-v1';
// Only the display mode is remembered; the shelf always opens on 唱片.
const readMode = () => { try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')?.mode === 'wall' ? 'wall' : 'grid'; } catch { return 'grid'; } };
const savePrefs = (value) => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(value)); } catch { /* a convenience only */ } };
const MODES = [{ id: 'grid', label: '网格' }, { id: 'wall', label: '墙' }];

function EmptyShelf({ openAdd }) {
  const web = usesBrowserCollection() && !isAndroid();
  return <div className="listen-empty-shelf">
    <span className="listen-empty-art" aria-hidden="true"><i/><i/><i/></span>
    <p>架子还空着。放上第一张唱片，小屋就有了声音。</p>
    <div className="listen-row-actions">{web ? <button type="button" className="listen-primary" onClick={() => openAdd('', 'manual')}><Plus size={16}/>手动添加</button> : <button type="button" className="listen-primary" onClick={() => openAdd('', 'catalog')}><Search size={16}/>搜索添加</button>}<button type="button" className="listen-secondary" onClick={() => openAdd('', 'local')}><FolderOpen size={16}/>导入本地音乐</button></div>
  </div>;
}

function FilterButton({ items, filters, setFilters, count }) {
  const pop = usePopover(), active = activeFilterCount(filters) + (filters.sort !== DEFAULT_FILTERS.sort ? 1 : 0);
  const patchFilters = (patch) => setFilters((old) => ({ ...old, ...(typeof patch === 'function' ? patch(old) : patch) }));
  return <span className="listen-pop-anchor">
    <button ref={pop.button} type="button" className={`listen-secondary listen-filter-button${active ? ' is-active' : ''}`} aria-expanded={pop.open} aria-label={active ? `筛选 · 已调整 ${active} 项` : '筛选'} onClick={pop.toggle}><Wand2 size={14}/>筛选{active > 0 && <b className="listen-badge">{active}</b>}</button>
    {pop.open && <div ref={pop.panel} className="listen-pop listen-filters" role="group" aria-label="排序与筛选" tabIndex={-1}>
      <div className="listen-filter-row"><label>排序<select data-autofocus aria-label="排序方式" value={filters.sort} onChange={(event) => setFilters({ ...filters, sort: event.target.value })}>{Object.entries(SORTS).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><label>类型<select aria-label="筛选类型" value={filters.type} onChange={(event) => setFilters({ ...filters, type: event.target.value })}><option value="all">全部</option><option value="album">专辑</option><option value="song">单曲</option><option value="playlist">歌单</option></select></label></div>
      <RecordBoxControls items={items} filters={filters} setFilters={patchFilters} count={count}/>
      <div className="listen-row-actions"><button type="button" className="listen-secondary" onClick={() => setFilters({ ...DEFAULT_FILTERS })}>全部恢复</button><button type="button" className="listen-primary" onClick={() => pop.close()}>好了</button></div>
    </div>}
  </span>;
}

function RecordsView({ items, visible, filters, setFilters, openAdd, openRecord, openWall, mode, setMode }) {
  const { deck, commands } = useCabinRuntime(), [query, setQuery] = useState('');
  const list = useMemo(() => shelfRecords(items, visible, query), [items, visible, query]);
  const showFilters = filtersShown(items.length);
  if (!items.length) return <EmptyShelf openAdd={openAdd}/>;
  const playing = (item) => String(deck.deckItem?.id) === String(item.id);
  return <>
    <div className="listen-toolbar">
      <input type="search" className="listen-search" aria-label="搜索唱片架" placeholder="搜索唱片或音乐人" value={query} onChange={(event) => setQuery(event.target.value)}/>
      <Segmented items={MODES} value={mode} onChange={setMode} label="唱片的展示方式" className="listen-segmented is-small"/>
      {showFilters && <FilterButton items={items} filters={filters} setFilters={setFilters} count={list.length}/>}
    </div>
    {!list.length && <p className="listen-note">没有找到相符的唱片。<button type="button" className="listen-link" onClick={() => { setQuery(''); setFilters({ ...DEFAULT_FILTERS }); }}>清除筛选</button></p>}
    {mode === 'wall' ? <>
      <ul className="listen-wall" aria-label="专辑墙">{list.map((item) => <li key={item.id} data-playing={playing(item) || undefined}><button type="button" aria-label={`播放 ${item.title}`} title={`${item.title} · ${item.artist || ''}`} onClick={() => commands.load(item)}><Cover item={item}/></button></li>)}</ul>
      <p className="listen-note">想把这面墙存成一张图？<button type="button" className="listen-link" onClick={openWall}><Grid3X3 size={14}/>制作专辑墙海报</button></p>
    </> : <ul className="listen-grid">{list.map((item) => <li key={item.id} data-playing={playing(item) || undefined}>
      <button type="button" className="listen-grid-cover" aria-label={`播放 ${item.title}`} onClick={() => commands.load(item)}><Cover item={item}/><span className="listen-grid-play" aria-hidden="true"><Play size={14}/></span></button>
      <button type="button" className="listen-grid-title" onClick={() => openRecord(item.id)}><strong>{item.title}</strong><small>{item.artist}</small></button>
      <button type="button" className="listen-grid-queue" aria-label={`${deck.isQueued(item.id) ? '移出待播' : '加入待播'} ${item.title}`} onClick={() => deck.isQueued(item.id) ? deck.player.remove(item.id) : deck.player.enqueue(item.id)}>{deck.isQueued(item.id) ? '已在待播' : '＋待播'}</button>
    </li>)}</ul>}
  </>;
}

function SongRow({ song, cover, meta, time, current, onPlay, action }) {
  return <li className={`${song.available ? '' : 'is-unavailable'}${current ? ' is-current' : ''}`}>
    <button type="button" className="listen-song" disabled={!song.available} aria-label={song.available ? `播放《${song.title}》` : `《${song.title}》· ${song.reason || '已不在唱片架上'}`} title={song.available ? `${song.title} · ${meta}` : song.reason} onClick={onPlay}>
      <Cover item={song.item || { title: song.record || song.title, artist: song.artist }} src={cover}/>
      <span className="listen-song-text"><strong>{displayTitle(song.title)}</strong><small>{meta}</small></span>
      <time>{time}</time>
    </button>
    {action}
  </li>;
}

function LikedView({ items }) {
  const { deck, notify } = useCabinRuntime(), [likes, toggle] = useLikes(notify);
  const songs = useMemo(() => likedSongs(likes, items), [likes, items]);
  const playable = songs.filter((song) => song.available).length;
  const play = (shuffle) => {
    const order = likePlayOrder(songs, { shuffle });
    if (!order.length) { notify('「我喜欢」里的歌暂时都不在唱片架上。'); return; }
    const queued = deck.replaceQueue(likeQueueEntries(order), order[0].id);
    deck.load(order[0].item, order[0].track);
    notify(`${shuffle ? '随机播放' : '正在播放'}「我喜欢」· ${order.length} 首${queued ? '' : '（待播未能更新，请检查存储空间）'}`, queued ? undefined : { tone: 'error' });
  };
  const unlike = (song) => { if (toggle(song)) notify(`已从「我喜欢」移除《${song.title}》。`, { action: { label: '撤销', run: () => toggle({ id: song.id, index: song.index, title: song.title, artist: song.artist }) } }); };
  if (!songs.length) return <div className="listen-empty-shelf is-small"><span className="listen-empty-heart" aria-hidden="true"><HeartIcon size={24}/></span><p>还没有喜欢的歌。听到心动的那一首，点一下正在播放条上的 ♥，它就会收在这里。</p></div>;
  const here = (song) => String(deck.record?.id) === String(song.id) && deck.trackIndex === song.track;
  return <>
    <div className="listen-toolbar"><span className="listen-count">{songs.length} 首喜欢{playable < songs.length ? ` · ${songs.length - playable} 首暂不可播` : ''}</span><span className="listen-row-actions"><button type="button" className="listen-primary" disabled={!playable} onClick={() => play(false)}><Play size={14}/>全部播放</button><button type="button" className="listen-secondary" disabled={!playable} onClick={() => play(true)}><ShufflePixel size={14}/>随机播放</button></span></div>
    <ol className="listen-songs" aria-label="我喜欢的歌">{songs.map((song) => <SongRow key={song.key} song={song} current={here(song)} cover={song.item ? trackCover(song.item, song.track) : ''} meta={(song.available ? [song.artist, song.record] : [song.artist, song.reason]).filter(Boolean).join(' · ') || '心流小屋'} time={shortDay(song.at)} onPlay={() => deck.load(song.item, song.track)}
      action={<button type="button" className="listen-icon listen-like" aria-pressed="true" aria-label={`取消喜欢《${song.title}》`} title="取消喜欢" onClick={() => unlike(song)}><HeartIcon filled/></button>}/>)}</ol>
  </>;
}

function RecentView({ items, showRecords }) {
  const { deck } = useCabinRuntime(), songs = useMemo(() => recentSongs(deck.player?.listens, items), [deck.player?.listens, items]);
  if (!songs.length) return <div className="listen-empty-shelf is-small"><p>还没有听过的歌。放一张唱片，听过的会按时间留在这里。</p><div className="listen-row-actions"><button type="button" className="listen-secondary" onClick={showRecords}><Album size={14}/>去唱片里挑一张</button></div></div>;
  return <ol className="listen-songs" aria-label="最近播放的歌">{songs.map((song) => <SongRow key={`${song.id}:${song.index}:${song.at}`} song={{ ...song, reason: '这张唱片已不在唱片架上' }} current={String(deck.record?.id) === String(song.id) && deck.trackIndex === song.index} cover={song.item ? trackCover(song.item, song.index) : ''} meta={(song.available ? [song.artist, song.record] : [song.artist, '这张唱片已不在唱片架上']).filter(Boolean).join(' · ')} time={shortDay(song.at)} onPlay={() => deck.player?.playListen(song)}/>)}</ol>;
}

export default function RecordShelf({ visible, filters, setFilters, openAdd, openRecord, openWall, openSmart }) {
  const { items, commands } = useCabinRuntime(), labs = useLabs();
  const [view, setView] = useState('records'), [mode, setModeState] = useState(readMode);
  const setMode = (value) => { setModeState(value); savePrefs({ mode: value }); };
  return <section className="listen-shelf" aria-label="唱片架">
    <div className="listen-shelf-top">
      <Segmented items={SHELF_VIEWS} value={view} onChange={setView} label="唱片架视图" className="listen-segmented"/>
      <span className="listen-row-actions">
        {labs.smartTurntable && openSmart && <button type="button" className="listen-secondary" onClick={openSmart}><Sparkles size={14}/>让小屋挑一张</button>}
        <button type="button" className="listen-secondary" onClick={() => commands.open('music-settings')}>音源与账号</button>
        {items.length > 0 && <button type="button" className="listen-primary" onClick={() => openAdd()}><Plus size={14}/>添加到唱片架</button>}
      </span>
    </div>
    {view === 'records' && <RecordsView items={items} visible={visible} filters={filters} setFilters={setFilters} openAdd={openAdd} openRecord={openRecord} openWall={openWall} mode={mode} setMode={setMode}/>}
    {view === 'liked' && <LikedView items={items}/>}
    {view === 'recent' && <RecentView items={items} showRecords={() => setView('records')}/>}
  </section>;
}
