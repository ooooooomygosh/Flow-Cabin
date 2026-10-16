import React, { useEffect, useRef, useState } from 'react';
import { Search, Plus, Check, FolderOpen, Disc3, Loading } from './icons';
import Dialog from './Dialog';
import { buildSearchInput } from './music-search.mjs';
import { addItem } from './collection-api.mjs';
import { localAlbumItem, musicRequest, normalizeLocalLibrary } from './room-playback.mjs';
import { desktopCommand, useDesktopAppearance } from './desktop-client';
import FileImport from './player/FileImport';
import PlaylistImport from './PlaylistLibrary';
import { generatedCover } from './player/pixel-cover.mjs';

// Every way onto the shelf, in one dialog: catalog search, account playlists / links /
// files, scanned local folders and picked files, or typed by hand.
export const ADD_TABS = [['catalog', '曲库搜索'], ['playlists', '我的歌单'], ['local', '本地音乐'], ['manual', '手动填写']];
const looseTitle = (value) => String(value || '').toLowerCase().replace(/[\s\-_:：·()（）[\]【】.,'"!?]/g, '');
const readProvider = () => { try { return localStorage.getItem('album-circle-search-provider-v2') === 'qq' ? 'qq' : 'itunes'; } catch { return 'itunes'; } };

function Cover({ src, title }) {
  const [failed, setFailed] = useState(false);
  return src && !failed ? <img className="add-cover" src={src} alt={`${title} 封面`} width="72" height="72" loading="lazy" onError={() => setFailed(true)}/> : <span className="add-cover add-cover-empty" aria-hidden="true"><Disc3 size={26}/></span>;
}

function CatalogSearch({ initialQuery, onAdded, added }) {
  const [provider, setProvider] = useState(readProvider), [type, setType] = useState('album');
  const [query, setQuery] = useState(initialQuery || ''), [results, setResults] = useState([]), [status, setStatus] = useState(''), [busyId, setBusyId] = useState('');
  const request = useRef(null), input = useRef(null);
  const search = async (event, value = query) => {
    event?.preventDefault(); request.current?.abort();
    let params; try { params = buildSearchInput({ query: value, provider, type }); } catch (error) { setStatus(error.message); return; }
    const controller = new AbortController(); request.current = controller;
    setStatus('searching'); setResults([]);
    try {
      const response = await fetch('/api/search?' + new URLSearchParams(params), { signal: controller.signal });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || '搜索失败，请稍后重试。');
      if (controller.signal.aborted || request.current !== controller) return;
      setResults(data.candidates || []); setStatus(data.candidates?.length ? (Array.isArray(data.warnings) ? data.warnings.join('；') : '') : '没有找到，换个关键词或切换曲库试试。');
    } catch (error) { if (error.name !== 'AbortError' && request.current === controller) setStatus(error.message.includes('timed out') ? '曲库响应超时，请稍后重试。' : error.message); }
  };
  useEffect(() => { input.current?.focus(); if (initialQuery) search(null, initialQuery); return () => request.current?.abort(); }, []);
  const choose = async (candidate) => {
    setBusyId(candidate.id);
    try { const result = await addItem(candidate); onAdded(result.item, result.duplicate, candidate.id); }
    catch (error) { setStatus(error.message); }
    finally { setBusyId(''); }
  };
  return <div className="add-panel">
    <form className="add-search" onSubmit={search} role="search">
      <Search size={18}/><input ref={input} type="search" name="cabin-album-search" aria-label="搜索专辑、歌手或粘贴 QQ 音乐专辑链接" placeholder="歌手 · 专辑 · 歌曲，或粘贴 QQ 音乐专辑链接" value={query} onChange={(event) => setQuery(event.target.value)}/>
      <button type="submit" className="pixel-button is-primary" disabled={status === 'searching'}>{status === 'searching' ? <Loading size={16}/> : '搜索'}</button>
    </form>
    <div className="add-options">
      <div className="segmented" role="radiogroup" aria-label="曲库">{[['itunes', 'Apple 曲库'], ['qq', 'QQ 音乐']].map(([value, label]) => <button type="button" role="radio" key={value} aria-checked={provider === value} onClick={() => { if (provider !== value) { request.current?.abort(); setResults([]); setStatus(''); setProvider(value); } try { localStorage.setItem('album-circle-search-provider-v2', value); } catch {} }}>{label}</button>)}</div>
      <div className="segmented" role="radiogroup" aria-label="类型">{[['album', '专辑'], ['song', '单曲'], ['all', '全部']].map(([value, label]) => <button type="button" role="radio" key={value} aria-checked={type === value} onClick={() => { if (type !== value) { request.current?.abort(); setResults([]); setStatus(''); setType(value); } }}>{label}</button>)}</div>
    </div>
    {status && status !== 'searching' && <p className="add-status" role="status">{status}</p>}
    {status === 'searching' && <p className="add-status" role="status">正在翻找唱片…</p>}
    <ul className="add-results" aria-label="搜索结果">{results.map((candidate) => {
      const done = added.has(candidate.id);
      return <li key={candidate.id}><Cover src={candidate.cover} title={candidate.title}/>
        <span className="add-result-copy"><strong title={candidate.title}>{candidate.title}</strong><small>{candidate.artist}{candidate.year && candidate.year !== 'unknown' ? ` · ${candidate.year}` : ''}{candidate.tracks?.length ? ` · ${candidate.tracks.length} 首` : ''} · {candidate.type === 'song' ? '单曲' : '专辑'}</small><small className="add-source">{candidate.platforms?.[0] || candidate.source}{candidate.type === 'album' && candidate.metadataCompleteness?.trackCountMatches === false ? ' · 曲目待补全，可先收藏' : ''}</small></span>
        <button type="button" className={`pixel-button ${done ? '' : 'is-primary'}`} disabled={done || busyId === candidate.id} onClick={() => choose(candidate)}>{done ? <><Check size={15}/>已在架上</> : busyId === candidate.id ? '放上中…' : <><Plus size={15}/>放上唱片架</>}</button>
      </li>;
    })}</ul>
  </div>;
}

// Scanned local folders: catalog artwork is preferred because it also suits the album wall.
function LocalImport({ items, onAdded }) {
  const desktop = useDesktopAppearance().client;
  const [state, setState] = useState(null), [busy, setBusy] = useState(''), [message, setMessage] = useState('');
  const load = async () => { try { setState(normalizeLocalLibrary(await musicRequest('/local/albums'))); } catch (error) { setState({ error: error.message, albums: [] }); } };
  useEffect(() => {
    load();
    const receive = (event) => { if (event.detail?.scanning) setMessage('正在扫描音乐文件…'); if (event.detail?.ok) { setMessage(''); load(); } if (event.detail?.error) setMessage(event.detail.error); };
    window.addEventListener('album-local-music', receive); return () => window.removeEventListener('album-local-music', receive);
  }, []);
  const existing = new Set(items.map((item) => item.externalIds?.localAlbum).filter(Boolean));
  const importAlbum = async (album) => {
    setBusy(album.id); setMessage('');
    try {
      const item = localAlbumItem(album);
      try {
        const found = await (await fetch('/api/search?type=album&term=' + encodeURIComponent(`${album.artist} ${album.title}`))).json();
        const match = (found.candidates || []).find((candidate) => candidate.type === 'album' && looseTitle(candidate.title).includes(looseTitle(album.title)) && /^https:/.test(candidate.cover || ''));
        if (match) { item.cover = match.cover; if (match.year && !item.year) item.year = match.year; }
      } catch { /* Offline: keep the embedded artwork. */ }
      if (!item.cover) item.cover = generatedCover(item); // no art anywhere: a cabin pixel cover
      const result = await addItem(item); onAdded(result.item, result.duplicate);
    } catch (error) { setMessage(error.message); }
    finally { setBusy(''); }
  };
  return <div className="add-panel">
    <p className="add-intro">扫描过的音乐文件夹按标签整理成专辑；音乐留在原位置播放，唱机音源选「本地音乐」。文件夹在「设置 › 音源 › 账户与文件夹」里管理。</p>
    <div className="add-local-actions"><button type="button" className="pixel-button is-primary" disabled={!desktop} title={desktop ? '' : '需要在心流小屋桌面版中使用'} onClick={() => { setMessage('请在弹出的窗口中选择文件夹…'); desktopCommand('local-music-folder'); }}><FolderOpen size={16}/>添加音乐文件夹</button>{desktop && <button type="button" className="pixel-button is-quiet" onClick={() => window.dispatchEvent(new CustomEvent('cabin-open-settings', { detail: { section: 'music/accounts' } }))}>管理文件夹</button>}{state?.albumCount > 0 && <span>{state.albumCount} 张专辑 · {state.trackCount} 首歌曲</span>}</div>
    {message && <p className="add-status" role="status">{message}</p>}
    {state?.error && <p className="add-status">{state.error}</p>}
    <ul className="add-results" aria-label="本地专辑">{(state?.albums || []).slice(0, 300).map((album) => {
      const done = existing.has(album.id);
      return <li key={album.id}><Cover src={album.cover} title={album.title}/><span className="add-result-copy"><strong>{album.title}</strong><small>{album.artist} · {album.tracks.length} 首{album.year ? ' · ' + album.year : ''}</small></span>
        <button type="button" className={`pixel-button ${done ? '' : 'is-primary'}`} disabled={done || busy === album.id} onClick={() => importAlbum(album)}>{done ? <><Check size={15}/>已在架上</> : busy === album.id ? '放上中…' : <><Plus size={15}/>放上唱片架</>}</button></li>;
    })}</ul>
    <FileImport items={items} onAdded={onAdded} desktop={desktop}/>
  </div>;
}

function ManualAdd({ onAdded }) {
  const [form, setForm] = useState({ title: '', artist: '', year: '', cover: '', tracks: '' }), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const field = (key) => ({ value: form[key], onChange: (event) => setForm({ ...form, [key]: event.target.value }) });
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      const result = await addItem({ type: 'album', title: form.title, artist: form.artist, year: form.year, cover: form.cover.trim() || generatedCover({ title: form.title, artist: form.artist }), tracks: form.tracks.split('\n').map((value) => value.trim()).filter(Boolean), source: 'manual' });
      onAdded(result.item, result.duplicate); setForm({ title: '', artist: '', year: '', cover: '', tracks: '' });
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  };
  return <form className="add-panel add-manual" onSubmit={submit}>
    <p className="add-intro">找不到的专辑、自己的录音或磁带，都可以手动放上唱片架，离线也能用。</p>
    <div className="add-manual-grid">
      <label>专辑名<input aria-label="专辑名" required maxLength={160} {...field('title')}/></label>
      <label>歌手<input aria-label="歌手" required maxLength={160} {...field('artist')}/></label>
      <label>发行年份<input aria-label="发行年份" inputMode="numeric" maxLength={4} {...field('year')}/></label>
      <label>封面图片链接 · 留空自动生成像素封面<input aria-label="封面图片链接" type="url" placeholder="https://" {...field('cover')}/></label>
    </div>
    <label>曲目 · 每行一首<textarea aria-label="曲目" rows={5} {...field('tracks')}/></label>
    {message && <p className="add-status" role="alert">{message}</p>}
    <button type="submit" className="pixel-button is-primary" disabled={busy}><Plus size={16}/>放上唱片架</button>
  </form>;
}

export default function AddAlbum({ items, close, initialQuery = '', initialTab = 'catalog', onAdded }) {
  const [tab, setTab] = useState(() => ADD_TABS.some(([id]) => id === initialTab) ? initialTab : 'catalog'), [added, setAdded] = useState(() => new Set()), [notice, setNotice] = useState('');
  const handleAdded = (item, duplicate, candidateId) => {
    setAdded((old) => new Set([...old, candidateId || item.id]));
    setNotice(duplicate ? `《${item.title}》已经在唱片架上了。` : `《${item.title}》已放上唱片架。`);
    onAdded(item);
  };
  const navigate = (event) => {
    const index = ADD_TABS.findIndex(([id]) => id === tab), step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    const next = step ? (index + step + ADD_TABS.length) % ADD_TABS.length : event.key === 'Home' ? 0 : event.key === 'End' ? ADD_TABS.length - 1 : -1;
    if (next < 0) return; event.preventDefault(); setTab(ADD_TABS[next][0]); document.getElementById(`add-tab-${ADD_TABS[next][0]}`)?.focus();
  };
  return <Dialog title="添加到唱片架" icon={<Plus size={20}/>} close={close} size="lg" className={`add-album-dialog is-${tab}`}>
    <nav className="dialog-tabs" role="tablist" aria-label="添加方式">{ADD_TABS.map(([id, label]) => <button type="button" role="tab" key={id} id={`add-tab-${id}`} aria-selected={tab === id} aria-controls="add-panel" tabIndex={tab === id ? 0 : -1} onKeyDown={navigate} onClick={() => { setTab(id); setNotice(''); }}>{label}</button>)}</nav>
    <div id="add-panel" role="tabpanel" aria-labelledby={`add-tab-${tab}`} className="add-album-panel">
      {notice && tab !== 'playlists' && <p className="add-notice" role="status"><Check size={16}/>{notice}</p>}
      {tab === 'catalog' && <CatalogSearch initialQuery={initialQuery} added={added} onAdded={handleAdded}/>}
      {tab === 'playlists' && <PlaylistImport items={items} close={close} onAdded={onAdded}/>}
      {tab === 'local' && <LocalImport items={items} onAdded={handleAdded}/>}
      {tab === 'manual' && <ManualAdd onAdded={handleAdded}/>}
    </div>
  </Dialog>;
}
