import React, { useEffect, useId, useRef, useState } from 'react';
import { Search, Plus, Check, FolderOpen, Disc3, Loading } from './icons';
import Dialog from './Dialog';
import { Tabs, Segmented, tabPanelProps } from './ui/Roving';
import { buildSearchInput } from './music-search.mjs';
import { addItem, usesBrowserCollection } from './collection-api.mjs';
import { localAlbumItem, musicRequest, normalizeLocalLibrary } from './room-playback.mjs';
import { desktopCommand, useDesktopAppearance } from './desktop-client';
import FileImport from './player/FileImport';
import PlaylistImport from './PlaylistLibrary';
import { generatedCover } from './player/pixel-cover.mjs';

// Every way onto the shelf, in one dialog: catalog search, account playlists / links /
// files, scanned local folders and picked files, or typed by hand.
const ADD_TABS = [{ id: 'catalog', label: '曲库搜索' }, { id: 'playlists', label: '我的歌单' }, { id: 'local', label: '本地音乐' }, { id: 'manual', label: '手动填写' }];
const CATALOGS = [{ id: 'itunes', label: 'Apple 曲库' }, { id: 'qq', label: 'QQ 音乐' }], RESULT_TYPES = [{ id: 'album', label: '专辑' }, { id: 'song', label: '单曲' }, { id: 'all', label: '全部' }];
const looseTitle = (value) => String(value || '').toLowerCase().replace(/[\s\-_:：·()（）[\]【】.,'"!?]/g, '');
const readProvider = () => { try { return localStorage.getItem('album-circle-search-provider-v2') === 'qq' ? 'qq' : 'itunes'; } catch { return 'itunes'; } };

function Cover({ src, title }) {
  const [failed, setFailed] = useState(false);
  return src && !failed ? <img className="add-cover" src={src} alt={`${title} 封面`} width="72" height="72" loading="lazy" onError={() => setFailed(true)}/> : <span className="add-cover add-cover-empty" aria-hidden="true"><Disc3 size={26}/></span>;
}

function CatalogSearch({ initialQuery, onAdded, added, browserOnly = false }) {
  const [provider, setProvider] = useState(readProvider), [type, setType] = useState('album');
  const [query, setQuery] = useState(initialQuery || ''), [results, setResults] = useState([]), [status, setStatus] = useState(''), [busyId, setBusyId] = useState('');
  const request = useRef(null), input = useRef(null);
  const search = async (event, value = query) => {
    event?.preventDefault();
    if (browserOnly) { setStatus('曲库搜索需要桌面版，网页版可以手动填写唱片。'); return; }
    request.current?.abort();
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
      {/* 搜索中按钮只剩一个图标（图标是 aria-hidden 的 svg）：没有 aria-label
          的话读屏只会报「按钮」。名字跟着状态走，键盘用户才知道它在忙什么。 */}
      <button type="submit" className="pixel-button is-primary" aria-label={status === 'searching' ? '正在搜索' : '搜索'} disabled={browserOnly || status === 'searching'}>{status === 'searching' ? <Loading size={16} className="player-spin"/> : '搜索'}</button>
    </form>
    <div className="add-options">
      <Segmented label="曲库" items={CATALOGS} value={provider} onChange={(value) => { if (provider !== value) { request.current?.abort(); setResults([]); setStatus(''); setProvider(value); } try { localStorage.setItem('album-circle-search-provider-v2', value); } catch {} }}/>
      <Segmented label="类型" items={RESULT_TYPES} value={type} onChange={(value) => { if (type !== value) { request.current?.abort(); setResults([]); setStatus(''); setType(value); } }}/>
    </div>
    {browserOnly && <p className="add-hint">曲库搜索需要桌面版。网页版可以在「手动填写」添加唱片，也可以导入已有备份。</p>}
    {/* One live region for the whole search: swapping two <p role=status> in and
        out is not announced reliably, a single region whose text changes is. */}
    <p className="add-status" role="status">{status === 'searching' ? '正在翻找唱片…' : status}</p>
    {!status && !results.length && <p className="add-hint"><Disc3 size={16}/>输入歌手或专辑名，找到后点「放上唱片架」，封面和曲目一起带回小屋。</p>}
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
  const desktop = useDesktopAppearance().client, folderHint = useId();
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
    <div className="add-local-actions">
      {/* A natively disabled button is skipped by the Tab order and its `title`
          is never read out, so the reason would be lost. The button keeps its
          place in the tab order (aria-disabled), the reason is visible and
          described, and pressing it says the reason out loud. */}
      <button type="button" className="pixel-button is-primary" aria-disabled={!desktop || undefined} aria-describedby={!desktop ? folderHint : undefined} onClick={() => { if (!desktop) { setMessage('添加音乐文件夹需要心流小屋桌面版。'); return; } setMessage('请在弹出的窗口中选择文件夹…'); desktopCommand('local-music-folder'); }}><FolderOpen size={16}/>添加音乐文件夹</button>
      {desktop && <button type="button" className="pixel-button is-quiet" onClick={() => window.dispatchEvent(new CustomEvent('cabin-open-settings', { detail: { section: 'music/accounts' } }))}>管理文件夹</button>}
      {state?.albumCount > 0 && <span>{state.albumCount} 张专辑 · {state.trackCount} 首歌曲</span>}
    </div>
    {!desktop && <p className="add-intro" id={folderHint}>添加音乐文件夹需要心流小屋桌面版；在网页里可以先用下面的「导入文件」挑选专辑。</p>}
    {message && <p className="add-status" role="status">{message}</p>}
    {state?.error && <p className="add-status" role="alert">{state.error}</p>}
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
  const browserOnly = usesBrowserCollection();
  const [tab, setTab] = useState(() => browserOnly && initialTab === 'catalog' ? 'manual' : ADD_TABS.some(({ id }) => id === initialTab) ? initialTab : 'catalog'), [added, setAdded] = useState(() => new Set()), [notice, setNotice] = useState('');
  const handleAdded = (item, duplicate, candidateId) => {
    setAdded((old) => new Set([...old, candidateId || item.id]));
    setNotice(duplicate ? `《${item.title}》已经在唱片架上了。` : `《${item.title}》已放上唱片架。`);
    onAdded(item);
  };
  return <Dialog title="添加到唱片架" icon={<Plus size={20}/>} close={close} size="lg" className={`add-album-dialog is-${tab}`}>
    <Tabs className="dialog-tabs" label="添加方式" idPrefix="add-tab" items={ADD_TABS} value={tab} onChange={(id) => { setTab(id); setNotice(''); }}/>
    <div {...tabPanelProps('add-tab', tab)} className="add-album-panel">
      {/* 常驻的活区：把带提示的节点整块换进换出，读屏的播报并不可靠——同一个
          文件里的搜索状态就是这么做的（见上面 add-status 的注释）。外层这个
          div 永远在文档里，空的时候不占高度、不留边框。 */}
      <div role="status">{notice && tab !== 'playlists' && <p className="add-notice"><Check size={16}/>{notice}</p>}</div>
      {tab === 'catalog' && <CatalogSearch browserOnly={browserOnly} initialQuery={initialQuery} added={added} onAdded={handleAdded}/>}
      {tab === 'playlists' && <PlaylistImport items={items} close={close} onAdded={onAdded}/>}
      {tab === 'local' && <LocalImport items={items} onAdded={handleAdded}/>}
      {tab === 'manual' && <ManualAdd onAdded={handleAdded}/>}
    </div>
  </Dialog>;
}
