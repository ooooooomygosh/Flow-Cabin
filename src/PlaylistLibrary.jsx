import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Play, ShufflePixel, Plus, Check, Heart, Search, Loading, Link, DocumentArrow, ArrowLeft, Music2, ListBullet } from './icons';
import { addItem, updateItem } from './collection-api.mjs';
import { musicRequest } from './room-playback.mjs';
import { desktopCommand, useDesktopAppearance } from './desktop-client';
import { generatedCover } from './player/pixel-cover.mjs';
import { parsePlaylistFile } from './playlist-files.mjs';
import { PLAYLIST_SOURCES, playlistItem, playlistKey, playlistRefreshPatch, mergePlaylistPage, PLAYLIST_TRACK_LIMIT, filterTracks, formatDuration, totalDuration } from './playlist-model.mjs';
import './playlist-library.css';

// 「添加到唱片架 › 我的歌单」: account playlists from 网易云 / QQ 音乐 / Apple Music,
// public share links and exported files. A playlist is a sleeve on the shelf: put
// it on the turntable, shuffle it, or queue it after the current record.
const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || navigator.userAgent || '');
const TABS = [
  { id: 'netease', label: '网易云音乐', hint: '我的歌单 · 收藏' },
  { id: 'qq', label: 'QQ 音乐', hint: '自建 · 收藏 · 我喜欢' },
  { id: 'apple', label: 'Apple Music', hint: isMac ? '音乐 App · 公开链接' : '公开链接 · 导出文件' },
  { id: 'import', label: '链接与文件', hint: '粘贴分享链接 · .xml .m3u .txt' }
];
const KIND_LABEL = { liked: '我喜欢', created: '我创建的', collect: '我收藏的' };

function Sleeve({ src, title, size = 'md', spinning = false }) {
  const [failed, setFailed] = useState(false);
  const fallback = useMemo(() => generatedCover({ title, artist: 'playlist' }), [title]);
  return <span className={`playlist-sleeve is-${size} ${spinning ? 'is-spinning' : ''}`} aria-hidden="true">
    <span className="playlist-sleeve-disc"><span className="playlist-sleeve-label" style={{ backgroundImage: `url("${!failed && src ? src : fallback}")` }}/></span>
    <img className="playlist-sleeve-cover" src={!failed && src ? src : fallback} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)}/>
  </span>;
}

function PlaylistGrid({ playlists, open, busyId }) {
  const groups = ['liked', 'created', 'collect'].map((kind) => [kind, playlists.filter((entry) => entry.kind === kind)]).filter(([, list]) => list.length);
  return <div className="playlist-groups">{groups.map(([kind, list]) => <section key={kind} aria-label={KIND_LABEL[kind]}>
    <h3>{kind === 'liked' && <Heart size={15}/>}{KIND_LABEL[kind]}<small>{list.length}</small></h3>
    <ul className={`playlist-grid ${kind === 'liked' ? 'is-featured' : ''}`}>{list.map((entry) => <li key={entry.id}>
      <button type="button" className="playlist-card" aria-label={`打开歌单 ${entry.name}`} aria-busy={busyId === entry.id} onClick={() => open(entry)}>
        <Sleeve src={entry.cover} title={entry.name} size={kind === 'liked' ? 'lg' : 'md'}/>
        <span className="playlist-card-copy"><strong title={entry.name}>{entry.name}</strong><small>{entry.trackCount ? `${entry.trackCount} 首` : '歌单'}{entry.creator ? ` · ${entry.creator}` : ''}</small></span>
        {kind === 'liked' && <span className="playlist-card-cta" aria-hidden="true"><b>打开歌单 →</b></span>}
        {busyId === entry.id && <Loading size={18} className="player-spin playlist-card-busy"/>}
      </button>
    </li>)}</ul>
  </section>)}</div>;
}

function TrackRow({ track, index, play }) {
  return <li className="playlist-track" onDoubleClick={() => play(index)}>
    <span className="playlist-track-index"><b>{String(index + 1).padStart(2, '0')}</b><button type="button" aria-label={`从第 ${index + 1} 首《${track.title}》开始播放`} onClick={() => play(index)}><Play size={13}/></button></span>
    {track.cover ? <img className="playlist-track-cover" src={track.cover} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer"/> : <span className="playlist-track-cover is-empty" aria-hidden="true"><Music2 size={13}/></span>}
    <span className="playlist-track-copy"><strong title={track.title}>{track.title}</strong><small title={track.artist}>{track.artist || '歌手未知'}</small></span>
    <span className="playlist-track-album" title={track.album}>{track.album}</span>
    <span className="playlist-track-time">{track.duration ? formatDuration(track.duration) : ''}</span>
  </li>;
}

function PlaylistDetail({ detail, provider, back, act, busy, saved, loadMore, loadingMore, cancelMore }) {
  const [query, setQuery] = useState(''), [viewPage, setViewPage] = useState(0);
  useEffect(() => setViewPage(0), [query, detail.playlist.id]);
  const { playlist, tracks } = detail, rows = filterTracks(tracks, query), source = PLAYLIST_SOURCES[provider] || PLAYLIST_SOURCES.file;
  const pages = Math.max(1, Math.ceil(rows.length / 100)), activePage = Math.min(viewPage, pages - 1), visibleRows = rows.slice(activePage * 100, (activePage + 1) * 100);
  return <div className="playlist-detail">
    <button type="button" className="playlist-back" onClick={back}><ArrowLeft size={15}/>全部歌单</button>
    <header className="playlist-hero">
      <Sleeve src={playlist.cover} title={playlist.name} size="xl"/>
      <div className="playlist-hero-copy">
        <small className={`playlist-badge is-${source.tone}`}>{source.label}</small>
        <h3 title={playlist.name}>{playlist.name}</h3>
        <p className="playlist-curator">{playlist.creator || '我的音乐收藏'}</p><div className="playlist-facts"><span><b>{tracks.length}</b> 首曲目</span>{totalDuration(tracks) && <span>{totalDuration(tracks)}</span>}<span>{saved ? '已在唱片架' : '尚未收藏'}</span></div>{detail.truncated && <p>已读取 {tracks.length} / {playlist.trackCount || detail.page?.total || '未知'} 首；保存和播放只包含已读取部分。</p>}
        {playlist.description && <p className="playlist-description" title={playlist.description}>{playlist.description}</p>}
        <div className="playlist-actions">
          <button type="button" className="pixel-button is-primary" disabled={busy || loadingMore || !tracks.length} onClick={() => act('play', 0)}><Play size={16}/>放上唱机</button>
          <button type="button" className="pixel-button" disabled={busy || loadingMore || tracks.length < 2} onClick={() => act('shuffle')}><ShufflePixel/>随机播放</button>
          <button type="button" className="pixel-button" disabled={busy || loadingMore || !tracks.length} onClick={() => act('queue')}><ListBullet size={16}/>加入待播</button>
          <button type="button" className="pixel-button is-quiet" disabled={busy || loadingMore || !tracks.length} onClick={() => act('save')}>{saved ? <><Check size={16}/>已在唱片架 · 同步</> : <><Plus size={16}/>放上唱片架</>}</button>
        </div>
      </div>
    </header>
    {(detail.page?.nextOffset != null || detail.page?.missingPages?.length > 0 || detail.truncated) && <div className="playlist-read-progress" role="status">
      {!loadingMore && detail.page?.missingPages?.length > 0 && <><span>平台暂未返回 {detail.page.missingPages.reduce((n, page) => n + page.ids.length, 0)} 首，原因尚未确认；可手动重试。</span><button type="button" className="pixel-button" disabled={busy} onClick={() => loadMore(detail.page.missingPages[0].offset)}>重试未返回曲目</button></>}
      {loadingMore ? <><span>正在读取曲目，已读取 {tracks.length} 首…</span><button type="button" className="pixel-button" onClick={cancelMore}>取消读取</button></>
        : detail.page?.nextOffset != null ? <><span>下一批最多 500 首 · 单个歌单最多 {PLAYLIST_TRACK_LIMIT} 首</span><button type="button" className="pixel-button" disabled={busy} onClick={() => loadMore()}>继续读取下一批</button></>
        : detail.page?.missingPages?.length ? null : <span>{detail.limitReason || (tracks.length >= PLAYLIST_TRACK_LIMIT ? `已达到 ${PLAYLIST_TRACK_LIMIT} 首上限，请拆分导出文件后导入剩余歌曲。` : '平台没有返回全部歌曲，可能受访问权限或接口返回范围限制；可尝试导出歌单文件。')}</span>}
    </div>}
    {tracks.length > 0 && <label className="playlist-filter"><Search size={15}/><input type="search" aria-label="在歌单中查找" placeholder="在歌单中查找歌名、歌手或专辑" value={query} onChange={(event) => setQuery(event.target.value)}/>{query && <small>{rows.length} / {tracks.length}</small>}</label>}
    {rows.length > 0 && <div className="playlist-track-heading" aria-hidden="true"><span>#</span><span/><span>歌曲 / 歌手</span><span>专辑</span><span>时长</span></div>}
    {rows.length ? <ol className="playlist-tracks" aria-label={`${playlist.name} 曲目`}>{visibleRows.map(({ track, index }) => <TrackRow key={`${index}-${track.title}`} track={track} index={index} play={(at) => act('play', at)}/>)}</ol>
      : <p className="playlist-empty">{tracks.length ? '没有找到匹配的歌曲。' : '这个歌单还没有歌曲。'}</p>}
    {pages > 1 && <nav className="playlist-page-nav" aria-label="歌单曲目分页"><button type="button" className="pixel-button" disabled={activePage === 0} onClick={() => setViewPage(activePage - 1)}>上一页曲目</button><span>第 {activePage + 1} / {pages} 页 · 每页 100 首</span><button type="button" className="pixel-button" disabled={activePage === pages - 1} onClick={() => setViewPage(activePage + 1)}>下一页曲目</button></nav>}
    <p className="playlist-footnote">播放时先试平台原始曲目，再按歌名、歌手和版本匹配 QQ 音乐 / 网易云；不会用现场版或翻唱顶替。播放权限取决于平台账号、版权与地区。</p>
  </div>;
}

function SignIn({ provider, desktop, busy, signIn }) {
  const name = PLAYLIST_SOURCES[provider].label;
  return <div className="playlist-signin">
    <span className="playlist-signin-art" aria-hidden="true"><Sleeve title={name} size="lg"/></span>
    <h3>登录{name}，读取你的歌单</h3>
    <p>登录在{name}官方页面完成，凭据只加密保存在这台电脑上。登录后，这里会出现「我喜欢」、自建和收藏的歌单。</p>
    <button type="button" className="pixel-button is-primary" disabled={!desktop || busy} onClick={signIn}>{busy ? <><Loading size={16} className="player-spin"/>等待登录…</> : `登录${name}`}</button>
    {!desktop && <small>平台登录需要在心流小屋桌面版中进行。</small>}
    <small>不想登录？在「链接与文件」里粘贴公开歌单的分享链接也可以。</small>
  </div>;
}

function LinkAndFile({ openDetail, busy, setBusy, setError, compact = false, apple = false }) {
  const [link, setLink] = useState(''), [imported, setImported] = useState(null), file = useRef(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const chooseFileList = (list, name) => openDetail({ playlist: { id: `file:${list.id}`, name: list.name, creator: name.replace(/\.[^.]+$/, ''), trackCount: list.trackCount || list.tracks.length }, tracks: list.tracks, truncated: list.truncated }, 'file');
  const submit = async (event) => {
    event.preventDefault(); if (!link.trim() || busy) return;
    setBusy(true); setError('');
    try { const detail = await musicRequest('/playlist/link', { url: link.trim() }); if (mounted.current) { openDetail(detail, detail.provider); setLink(''); } }
    catch (error) { if (mounted.current) setError(error.message); } finally { if (mounted.current) setBusy(false); }
  };
  const readFile = async (picked) => {
    if (!picked || busy) return; setError('');
    if (picked.size > 12 * 1024 * 1024) { setError('文件太大了：歌单文件应小于 12 MB。'); return; }
    try {
      const lists = parsePlaylistFile(await picked.text(), picked.name);
      if (!mounted.current) return;
      if (lists.length === 1) chooseFileList(lists[0], picked.name);
      else setImported({ lists, name: picked.name });
    } catch (error) { setError(error.message); }
    finally { if (file.current) file.current.value = ''; }
  };
  return <div className={`playlist-import ${compact ? 'is-compact' : ''}`}>
    <form className="playlist-link" onSubmit={submit}>
      <Link size={16}/><input type="url" inputMode="url" aria-label="歌单分享链接" placeholder={apple ? 'https://music.apple.com/…/playlist/…' : '粘贴网易云 / QQ 音乐 / Apple Music 歌单链接'} value={link} onChange={(event) => setLink(event.target.value)}/>
      <button type="submit" className="pixel-button is-primary" disabled={busy || !link.trim()}>{busy ? <Loading size={16} className="player-spin"/> : '读取歌单'}</button>
    </form>
    <button type="button" className="playlist-drop" onClick={() => file.current?.click()} onDragOver={(event) => { event.preventDefault(); event.currentTarget.classList.add('is-over'); }} onDragLeave={(event) => event.currentTarget.classList.remove('is-over')} onDrop={(event) => { event.preventDefault(); event.currentTarget.classList.remove('is-over'); readFile(event.dataTransfer.files?.[0]); }}>
      <DocumentArrow size={22}/><strong>导入歌单文件</strong><small>{apple ? '「音乐」App › 文件 › 资料库 › 导出播放列表… 存成 .xml' : 'Apple Music / iTunes 导出的 .xml、播放器的 .m3u / .m3u8，或每行「歌名 - 歌手」的 .txt'}</small>
    </button>
    {imported && <section className="playlist-file-choices" aria-label="文件中的歌单"><h3>选择要导入的歌单</h3><p>{imported.name} · {imported.lists.length} 个歌单</p><ul>{imported.lists.map((list, index) => <li key={`${list.id}-${index}`}><button type="button" className="pixel-button" onClick={() => chooseFileList(list, imported.name)}><Music2 size={16}/><strong>{list.name}</strong><small>{list.trackCount || list.tracks.length} 首{list.truncated ? ' · 导入前 5000 首' : ''}</small></button></li>)}</ul></section>}
    <input ref={file} type="file" hidden accept=".xml,.m3u,.m3u8,.txt,.csv,text/plain,application/xml" onChange={(event) => readFile(event.target.files?.[0])}/>
  </div>;
}

export default function PlaylistImport({ items, close, onAdded }) {
  const desktop = useDesktopAppearance().client;
  const [tab, setTab] = useState(() => { try { const stored = localStorage.getItem('album-circle-playlist-tab-v1'); return TABS.some(t => t.id === stored) ? stored : 'netease'; } catch { return 'netease'; } });
  const [config, setConfig] = useState(null), [lists, setLists] = useState({}), [detail, setDetail] = useState(null), [busy, setBusy] = useState(false), [busyId, setBusyId] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState(''), [signing, setSigning] = useState('');
  // List loads and detail loads have separate generations: refreshing the list must not orphan an open request.
  const listGen = useRef(0), detailGen = useRef(0), moreRequest = useRef(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const cancelMore = () => { detailGen.current++; moreRequest.current?.abort(); moreRequest.current = null; setLoadingMore(false); };
  const loadMore = async (offset = detail?.page?.nextOffset) => {
    if (moreRequest.current || offset == null) return;
    const controller = new AbortController(), current = detailGen.current, base = detail; moreRequest.current = controller; setLoadingMore(true); setError(''); setNotice('');
    try {
      const next = await musicRequest(`/playlist?provider=${encodeURIComponent(base.provider)}&id=${encodeURIComponent(base.playlist.id)}&offset=${offset}&revision=${encodeURIComponent(base.revision)}`, undefined, controller.signal);
      if (current === detailGen.current && !controller.signal.aborted) {
        const merged = mergePlaylistPage(base, { ...next, provider: base.provider }); setDetail(merged);
        if (merged.tracks.length === base.tracks.length) setNotice('本次仍未返回缺少的曲目；已读取内容保留，可稍后手动重试。');
      }
    } catch (cause) { if (current === detailGen.current && !controller.signal.aborted) setError(cause.message); }
    finally { if (moreRequest.current === controller) { moreRequest.current = null; setLoadingMore(false); } }
  };
  const [accountEpoch, setAccountEpoch] = useState(0);
  useEffect(() => () => { listGen.current++; detailGen.current++; moreRequest.current?.abort(); }, []);
  const choose = (next) => { if (next === tab) return; cancelMore(); setTab(next); setDetail(null); setError(''); setNotice(''); setBusyId(''); try { localStorage.setItem('album-circle-playlist-tab-v1', next); } catch {} };
  const listProvider = tab === 'apple' ? 'apple-local' : tab;
  const loggedIn = tab === 'netease' ? config?.neteaseLoggedIn : tab === 'qq' ? config?.qqLoggedIn : false;
  const refreshConfig = async () => { try { setConfig(await musicRequest('/config')); } catch (cause) { setConfig({}); setError(cause.message); } };
  const loadList = async (provider, force = false) => {
    if (!force && lists[provider]?.playlists) return;
    const current = ++listGen.current;
    setLists((old) => ({ ...old, [provider]: { ...old[provider], loading: true, error: '' } }));
    try { const result = await musicRequest('/playlists?provider=' + provider); if (current === listGen.current) setLists((old) => ({ ...old, [provider]: { ...result, loading: false } })); }
    catch (cause) { if (current === listGen.current) setLists((old) => ({ ...old, [provider]: { playlists: null, loading: false, error: cause.message } })); }
  };
  useEffect(() => { refreshConfig(); }, []);
  useEffect(() => {
    const receive = (event) => { cancelMore(); setSigning(''); setDetail(null); setBusyId(''); setLists({}); if (event.detail?.error) setError(event.detail.error); refreshConfig().then(() => setAccountEpoch(value => value + 1)); };
    window.addEventListener('album-music-account', receive); return () => window.removeEventListener('album-music-account', receive);
  }, []);
  useEffect(() => { if ((tab === 'netease' || tab === 'qq') && loggedIn) loadList(tab); }, [tab, loggedIn, accountEpoch]);
  const openDetail = (value, provider) => { cancelMore(); setDetail({ ...value, provider }); setBusyId(''); setNotice(''); setError(''); };
  const openPlaylist = async (entry) => {
    if (busyId) return; const current = detailGen.current; setBusyId(entry.id); setError('');
    try { const value = await musicRequest(`/playlist?provider=${listProvider}&id=${encodeURIComponent(entry.id)}`); if (current === detailGen.current) openDetail(value, listProvider); }
    catch (cause) { if (current === detailGen.current) setError(cause.message); } finally { setBusyId((value) => value === entry.id ? '' : value); }
  };
  const savedItem = detail && items.find((item) => item.externalIds?.playlist === playlistKey(detail.provider, detail.playlist.id));
  // Saving is idempotent: an existing sleeve is refreshed with the latest track list.
  const save = async () => {
    const value = playlistItem(detail, detail.provider);
    if (!value.cover) value.cover = generatedCover(value);
    const result = await addItem(value);
    let item = result.item;
    const patch = playlistRefreshPatch(item, value, { incomplete: detail.truncated });
    if (result.duplicate && Object.keys(patch).length) item = (await updateItem(item.id, patch)).item;
    onAdded(item);
    return { item, refreshed: result.duplicate };
  };
  const act = async (action, index = 0) => {
    if (busy || loadingMore) return; const current = detailGen.current; setBusy(true); setError(''); setNotice('');
    try {
      const { item, refreshed } = await save(); if (current !== detailGen.current) return;
      if (action === 'save') { setNotice(refreshed ? `《${item.title}》已同步为最新的 ${item.tracks.length} 首。` : `《${item.title}》已放上唱片架，可以像专辑一样双击放盘。`); return; }
      if (action === 'queue') { const request = { id: item.id, item, accepted: false }; window.dispatchEvent(new CustomEvent('cabin-enqueue', { detail: request })); if (!request.accepted) throw new Error('未能加入待播，请检查队列容量和本地存储后重试。'); setNotice(`《${item.title}》已加入待播，当前唱片放完后接着放。`); return; }
      window.dispatchEvent(new CustomEvent('cabin-play', { detail: { id: item.id, item, track: action === 'shuffle' ? Math.floor(Math.random() * item.tracks.length) : index, shuffle: action === 'shuffle' } }));
      close();
    } catch (cause) { if (current === detailGen.current) setError(cause.message); } finally { setBusy(false); }
  };
  const state = lists[listProvider];
  const signIn = (provider) => { setSigning(provider); setError(''); desktopCommand('music-login', { provider }); };
  return <div className="playlist-shell">
      <nav className="playlist-rail" role="tablist" aria-label="歌单来源">{TABS.map((entry) => {
        const connected = (entry.id === 'netease' ? config?.neteaseLoggedIn : entry.id === 'qq' ? config?.qqLoggedIn : false) && lists[entry.id]?.loggedIn !== false;
        return <button type="button" role="tab" disabled={busy} key={entry.id} aria-selected={tab === entry.id} className={`playlist-rail-tab is-${entry.id}`} onClick={() => choose(entry.id)}>
          <span className="playlist-rail-glyph" aria-hidden="true">{entry.id === 'import' ? <Link size={16}/> : entry.id === 'apple' ? <Music2 size={16}/> : <b>{entry.id === 'qq' ? 'QQ' : '云'}</b>}</span>
          <span><strong>{entry.label}</strong><small>{connected ? '已登录' : entry.hint}</small></span>{connected && <i className="playlist-rail-dot" aria-label="已登录"/>}
        </button>;
      })}</nav>
      <section className="playlist-main" aria-live="polite">
        {error && <p className="playlist-error" role="alert">{error}</p>}
        {!detail && state?.warning && <p className="playlist-error" role="alert">{state.warning}<button type="button" className="pixel-button" disabled={state.loading} onClick={() => loadList(listProvider, true)}>重试未读取的歌单</button></p>}
        {notice && <p className="playlist-notice" role="status"><Check size={15}/>{notice}</p>}
        {detail ? <PlaylistDetail detail={detail} provider={detail.provider} back={() => { cancelMore(); setDetail(null); setNotice(''); }} act={act} busy={busy} saved={Boolean(savedItem)} loadMore={loadMore} loadingMore={loadingMore} cancelMore={cancelMore}/>
          : tab === 'import' ? <><header className="playlist-main-head"><h3>从链接或文件导入</h3><p>公开歌单不需要登录：在平台里点「分享 › 复制链接」，粘贴到这里。</p></header><LinkAndFile key={tab} openDetail={openDetail} busy={busy} setBusy={setBusy} setError={setError}/></>
          : tab === 'apple' ? <>
            <header className="playlist-main-head"><h3>Apple Music</h3><p className="playlist-capability">当前支持歌单资料导入；尚未接入官方 MusicKit 登录与订阅播放。</p><p>{isMac ? '读取这台 Mac「音乐」App 里的歌单（登录 Apple Music 后的资料库），或粘贴公开歌单链接。' : '粘贴公开歌单链接，或导入 iTunes / Apple Music 导出的歌单文件。'}播放时按歌名与歌手匹配可播放的同版本。</p></header>
            {isMac && desktop && (state?.playlists ? <><div className="playlist-toolbar"><span>{state.playlists.length} 个歌单 · 音乐 App</span><button type="button" className="pixel-button is-quiet" onClick={() => loadList('apple-local', true)}><Loading size={14}/>刷新</button></div><PlaylistGrid playlists={state.playlists} open={openPlaylist} busyId={busyId}/></>
              : <button type="button" className="playlist-music-app" disabled={state?.loading} onClick={() => loadList('apple-local', true)}>{state?.loading ? <Loading size={22} className="player-spin"/> : <Music2 size={22}/>}<strong>{state?.loading ? '正在读取「音乐」App…' : '读取「音乐」App 歌单'}</strong><small>第一次读取时，macOS 会询问是否允许心流小屋控制「音乐」。</small></button>)}
            {state?.error && <p className="playlist-error" role="alert">{state.error}</p>}
            <LinkAndFile key={tab} openDetail={openDetail} busy={busy} setBusy={setBusy} setError={setError} compact apple/>
          </>
          : !config ? <p className="playlist-loading"><Loading size={18} className="player-spin"/>正在检查登录状态…</p>
          : (!loggedIn || state?.loggedIn === false) ? <SignIn provider={tab} desktop={desktop} busy={signing === tab} signIn={() => signIn(tab)}/>
          : state?.loading && !state.playlists ? <ul className="playlist-grid is-skeleton" aria-label="正在读取歌单">{Array.from({ length: 8 }, (_, index) => <li key={index}><span className="playlist-card"><span className="playlist-sleeve is-md"/><span className="playlist-card-copy"><strong>&nbsp;</strong><small>&nbsp;</small></span></span></li>)}</ul>
          : state?.error ? <div className="playlist-signin"><h3>歌单暂时读不出来</h3><p>{state.error}</p><button type="button" className="pixel-button is-primary" onClick={() => loadList(tab, true)}>重试</button><button type="button" className="pixel-button is-quiet" onClick={() => signIn(tab)}>重新登录</button></div>
          : state?.playlists?.length ? <><div className="playlist-toolbar"><span>{state.user ? `${state.user} · ` : ''}{state.playlists.length} 个歌单</span><button type="button" className="pixel-button is-quiet" onClick={() => loadList(tab, true)}><Loading size={14}/>刷新</button></div><PlaylistGrid playlists={state.playlists} open={openPlaylist} busyId={busyId}/></>
          : state?.playlists ? <div className="playlist-signin"><h3>{state.warning ? '部分歌单未能读取' : '还没有歌单'}</h3><p>{state.warning ? '请重试，暂时无法确认完整歌单列表。' : `在${PLAYLIST_SOURCES[tab].label}里创建或收藏歌单后，点刷新。`}</p><button type="button" className="pixel-button" onClick={() => loadList(tab, true)}>刷新</button></div>
          : null}
      </section>
  </div>;
}
