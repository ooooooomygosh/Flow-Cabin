import React, { forwardRef, useMemo, useState } from 'react';
import { RecordBoxControls } from '../RecordLibrary';
import { SORTS, DEFAULT_FILTERS } from '../room/useShelf';
import { useCabinRuntime } from '../runtime/CabinRuntime';
import { Segmented } from '../ui/Roving';
import { Plus, Play, ShufflePixel, Search, Grid3X3, FolderOpen, Wand2, Album } from '../icons';
import { likedSongs, likePlayOrder, likeQueueEntries } from '../player/likes.mjs';
import { trackCover } from '../track-meta.mjs';
import { displayTitle } from '../display-title.mjs';
import { usesBrowserCollection } from '../collection-api.mjs';
import { isAndroid } from '../mobile/platform.mjs';
import { playSfx } from '../props/sfx.mjs';
import { SHELF_VIEWS, filtersShown, activeFilterCount, shelfRecords, recentSongs, shortDay } from '../listen/listen-model.mjs';
import { useLikes, Cover, usePopover, HeartIcon } from '../listen/listen-hooks';

// A ring binder lying open on the desk. The thumb-tab dividers on its edge are the three
// 3.0 views (唱片 / 我喜欢 / 最近播放); the left sheet holds the card and the tools, the right
// sheet holds what is filed. A binder standing for a 唱片盒 shows only what is in that box.
const PREFS_KEY = 'flow-cabin-shelf-view-v1';
// Only the display mode is remembered; a binder always opens on 唱片.
const readMode = () => { try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')?.mode === 'wall' ? 'wall' : 'grid'; } catch { return 'grid'; } };
const savePrefs = (value) => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(value)); } catch { /* a convenience only */ } };
const MODES = [{ id: 'grid', label: '网格' }, { id: 'wall', label: '墙' }];

// The big handwritten card at the top of the left sheet.
function TitleCard({ binder, title, line }) {
  // A 唱片盒 binder is named for its box; the three system binders are named for the divider that is open.
  const box = binder.kind === 'box', own = box && title === '唱片';
  return <div className="shelf-title-card"><span className="shelf-kicker">{box ? (own ? '唱片盒' : `唱片盒 · ${binder.label}`) : '活页夹'}</span><h2>{own ? binder.label : title}</h2><p>{line}</p></div>;
}
function PutBack({ onPutBack }) {
  return <div className="shelf-page-foot"><button type="button" className="shelf-link" onClick={onPutBack}>放回架上</button></div>;
}

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
  return <span className="shelf-pop-anchor">
    <button ref={pop.button} type="button" className={`listen-secondary listen-filter-button${active ? ' is-active' : ''}`} aria-expanded={pop.open} aria-label={active ? `筛选 · 已调整 ${active} 项` : '筛选'} onClick={pop.toggle}><Wand2 size={14}/>筛选{active > 0 && <b className="listen-badge">{active}</b>}</button>
    {pop.open && <div ref={pop.panel} className="shelf-pop paper" role="group" aria-label="排序与筛选" tabIndex={-1}>
      <div className="shelf-filter-row"><label>排序<select data-autofocus aria-label="排序方式" value={filters.sort} onChange={(event) => setFilters({ ...filters, sort: event.target.value })}>{Object.entries(SORTS).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><label>类型<select aria-label="筛选类型" value={filters.type} onChange={(event) => setFilters({ ...filters, type: event.target.value })}><option value="all">全部</option><option value="album">专辑</option><option value="song">单曲</option><option value="playlist">歌单</option></select></label></div>
      <RecordBoxControls items={items} filters={filters} setFilters={patchFilters} count={count}/>
      <div className="listen-row-actions"><button type="button" className="listen-secondary" onClick={() => setFilters({ ...DEFAULT_FILTERS })}>全部恢复</button><button type="button" className="listen-primary" onClick={() => pop.close()}>好了</button></div>
    </div>}
  </span>;
}

function RecordsPages({ binder, scopeItems, visible, filters, setFilters, openAdd, openRecord, openWall, mode, setMode, onPutBack }) {
  const { deck, commands } = useCabinRuntime(), [query, setQuery] = useState('');
  const scoped = binder.kind === 'box';
  const list = useMemo(() => shelfRecords(scopeItems, scoped ? scopeItems : visible, query), [scopeItems, visible, query, scoped]);
  const showFilters = !scoped && filtersShown(scopeItems.length), empty = !scopeItems.length;
  const playing = (item) => String(deck.deckItem?.id) === String(item.id);
  return <>
    <div className="shelf-page is-left paper">
      <TitleCard binder={binder} title="唱片" line={empty ? '还没有唱片' : `${list.length === scopeItems.length ? '' : `${list.length} / `}${scopeItems.length} 张唱片`}/>
      {!empty && <div className="shelf-tools">
        <input type="search" className="listen-search" aria-label="搜索唱片架" placeholder="搜索唱片或音乐人" value={query} onChange={(event) => setQuery(event.target.value)}/>
        <Segmented items={MODES} value={mode} onChange={setMode} label="唱片的展示方式" className="shelf-modes"/>
        {showFilters && <FilterButton items={scopeItems} filters={filters} setFilters={setFilters} count={list.length}/>}
        {mode === 'wall' && <p className="listen-note">想把这面墙存成一张图？<button type="button" className="listen-link" onClick={openWall}><Grid3X3 size={14}/>制作专辑墙海报</button></p>}
      </div>}
      <PutBack onPutBack={onPutBack}/>
    </div>
    <div className="shelf-page is-right paper">
      {empty ? (scoped ? <div className="listen-empty-shelf is-small"><p>这个唱片盒里还没有唱片。在唱片的「自定义唱片」里，可以把它放进来。</p></div> : <EmptyShelf openAdd={openAdd}/>) : <>
        {!list.length && <p className="listen-note">没有找到相符的唱片。<button type="button" className="listen-link" onClick={() => { setQuery(''); setFilters({ ...DEFAULT_FILTERS }); }}>清除筛选</button></p>}
        {mode === 'wall' ? <ul className="listen-wall" aria-label="专辑墙">{list.map((item) => <li key={item.id} data-playing={playing(item) || undefined}><button type="button" aria-label={`播放 ${item.title}`} title={`${item.title} · ${item.artist || ''}`} onClick={() => commands.load(item)}><Cover item={item}/></button></li>)}</ul>
          : <ul className="listen-grid">{list.map((item) => <li key={item.id} data-playing={playing(item) || undefined}>
            <button type="button" className="listen-grid-cover" aria-label={`播放 ${item.title}`} onClick={() => commands.load(item)}><Cover item={item}/><span className="listen-grid-play" aria-hidden="true"><Play size={14}/></span></button>
            <button type="button" className="listen-grid-title" onClick={() => openRecord(item.id)}><strong>{item.title}</strong><small>{item.artist}</small></button>
            <button type="button" className="listen-grid-queue" aria-label={`${deck.isQueued(item.id) ? '移出待播' : '加入待播'} ${item.title}`} onClick={() => deck.isQueued(item.id) ? deck.player.remove(item.id) : deck.player.enqueue(item.id)}>{deck.isQueued(item.id) ? '已在待播' : '＋待播'}</button>
          </li>)}</ul>}
      </>}
    </div>
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

function LikedPages({ binder, scopeIds, onPutBack }) {
  const { deck, notify, items } = useCabinRuntime(), [likes, toggle] = useLikes(notify);
  const songs = useMemo(() => likedSongs(likes, items).filter((song) => !scopeIds || (song.item && scopeIds.has(String(song.item.id)))), [likes, items, scopeIds]);
  const playable = songs.filter((song) => song.available).length;
  const play = (shuffle) => {
    const order = likePlayOrder(songs, { shuffle });
    if (!order.length) { notify('「我喜欢」里的歌暂时都不在唱片架上。'); return; }
    const queued = deck.replaceQueue(likeQueueEntries(order), order[0].id);
    deck.load(order[0].item, order[0].track);
    notify(`${shuffle ? '随机播放' : '正在播放'}「我喜欢」· ${order.length} 首${queued ? '' : '（待播未能更新，请检查存储空间）'}`, queued ? undefined : { tone: 'error' });
  };
  const unlike = (song) => { if (toggle(song)) notify(`已从「我喜欢」移除《${song.title}》。`, { action: { label: '撤销', run: () => toggle({ id: song.id, index: song.index, title: song.title, artist: song.artist }) } }); };
  const here = (song) => String(deck.record?.id) === String(song.id) && deck.trackIndex === song.track;
  return <>
    <div className="shelf-page is-left paper">
      <TitleCard binder={binder} title="我喜欢" line={songs.length ? `${songs.length} 首喜欢${playable < songs.length ? ` · ${songs.length - playable} 首暂不可播` : ''}` : '一首也没有'}/>
      {songs.length > 0 && <div className="shelf-tools"><span className="listen-row-actions"><button type="button" className="listen-primary" disabled={!playable} onClick={() => play(false)}><Play size={14}/>全部播放</button><button type="button" className="listen-secondary" disabled={!playable} onClick={() => play(true)}><ShufflePixel size={14}/>随机播放</button></span></div>}
      <PutBack onPutBack={onPutBack}/>
    </div>
    <div className="shelf-page is-right paper">
      {!songs.length ? <div className="listen-empty-shelf is-small"><span className="listen-empty-heart" aria-hidden="true"><HeartIcon size={24}/></span><p>还没有喜欢的歌。听到心动的那一首，点一下正在播放条上的 ♥，它就会收在这里。</p></div>
        : <ol className="listen-songs" aria-label="我喜欢的歌">{songs.map((song) => <SongRow key={song.key} song={song} current={here(song)} cover={song.item ? trackCover(song.item, song.track) : ''} meta={(song.available ? [song.artist, song.record] : [song.artist, song.reason]).filter(Boolean).join(' · ') || '心流小屋'} time={shortDay(song.at)} onPlay={() => deck.load(song.item, song.track)}
          action={<button type="button" className="listen-icon listen-like" aria-pressed="true" aria-label={`取消喜欢《${song.title}》`} title="取消喜欢" onClick={() => unlike(song)}><HeartIcon filled/></button>}/>)}</ol>}
    </div>
  </>;
}

function RecentPages({ binder, scopeIds, showRecords, onPutBack }) {
  const { deck, items } = useCabinRuntime();
  const songs = useMemo(() => recentSongs(deck.player?.listens, items).filter((song) => !scopeIds || (song.item && scopeIds.has(String(song.item.id)))), [deck.player?.listens, items, scopeIds]);
  return <>
    <div className="shelf-page is-left paper">
      <TitleCard binder={binder} title="最近播放" line={songs.length ? `${songs.length} 首，最新的在最上面` : '还没有听过的歌'}/>
      <PutBack onPutBack={onPutBack}/>
    </div>
    <div className="shelf-page is-right paper">
      {!songs.length ? <div className="listen-empty-shelf is-small"><p>还没有听过的歌。放一张唱片，听过的会按时间留在这里。</p><div className="listen-row-actions"><button type="button" className="listen-secondary" onClick={showRecords}><Album size={14}/>去唱片里挑一张</button></div></div>
        : <ol className="listen-songs" aria-label="最近播放的歌">{songs.map((song) => <SongRow key={`${song.id}:${song.index}:${song.at}`} song={{ ...song, reason: '这张唱片已不在唱片架上' }} current={String(deck.record?.id) === String(song.id) && deck.trackIndex === song.index} cover={song.item ? trackCover(song.item, song.index) : ''} meta={(song.available ? [song.artist, song.record] : [song.artist, '这张唱片已不在唱片架上']).filter(Boolean).join(' · ')} time={shortDay(song.at)} onPlay={() => deck.player?.playListen(song)}/>)}</ol>}
    </div>
  </>;
}

// The open binder. `scopeItems` is what the binder holds (everything, or one 唱片盒, see boxItems);
// the dividers keep the old names and roles: a radiogroup 「唱片架视图」 of 唱片 / 我喜欢 / 最近播放.
const Binder = forwardRef(function Binder({ binder, scopeItems, visible, filters, setFilters, openAdd, openRecord, openWall, onPutBack, id }, ref) {
  const [view, setViewState] = useState(binder.view), [mode, setModeState] = useState(readMode);
  const setView = (next) => { if (next !== view) playSfx('page-turn'); setViewState(next); };
  const setMode = (value) => { setModeState(value); savePrefs({ mode: value }); };
  const scoped = binder.kind === 'box';
  const scopeIds = useMemo(() => scoped ? new Set(scopeItems.map((item) => String(item.id))) : null, [scoped, scopeItems]);
  return <section ref={ref} id={id} className={`shelf-object shelf-open-binder is-${binder.colour.id}`} aria-label={`${binder.label}活页夹`} style={{ '--spine': binder.colour.spine, '--edge': binder.colour.edge, '--worn': binder.colour.worn }}>
    {view === 'records' && <RecordsPages binder={binder} scopeItems={scopeItems} visible={visible} filters={filters} setFilters={setFilters} openAdd={openAdd} openRecord={openRecord} openWall={openWall} mode={mode} setMode={setMode} onPutBack={onPutBack}/>}
    {view === 'liked' && <LikedPages binder={binder} scopeIds={scopeIds} onPutBack={onPutBack}/>}
    {view === 'recent' && <RecentPages binder={binder} scopeIds={scopeIds} showRecords={() => setView('records')} onPutBack={onPutBack}/>}
    <div className="shelf-rings" aria-hidden="true"><i/><i/><i/></div>
    <Segmented items={SHELF_VIEWS} value={view} onChange={setView} label="唱片架视图" className="shelf-tabs"/>
  </section>;
});
export default Binder;
