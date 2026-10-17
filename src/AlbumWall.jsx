import { useEffect, useMemo, useRef, useState } from 'react';
import Dialog from './Dialog';
import { Segmented } from './ui/Roving';
import { ConfirmButton } from './ui/Confirm';
import { Grid3X3, Search, X, Plus, Download, Up, Down, Trash2, External, ArrowLeft } from './icons';
import RecordSleeve from './ui/RecordSleeve';
import { useDesktopAppearance } from './desktop-client';
import { wallKey, normalizeWall, orderAlbums, readWall, WALL_STORAGE_KEY } from './album-wall-model.mjs';
import { loadWallCover, paintWall, releaseWallCovers } from './album-wall-canvas.mjs';
import { downloadBlob } from './lib/download.mjs';
import { buildSearchInput } from './music-search.mjs';

// Library thumbnail: the record's generated sleeve until (or unless) its cover arrives.
function WallCover({ item }) {
  const [state, setState] = useState(item.cover ? 'loading' : 'none');
  useEffect(() => setState(item.cover ? 'loading' : 'none'), [item.cover]);
  return <span className="wall-cover">{state !== 'ready' && <RecordSleeve item={item} title={false} loading={state === 'loading'}/>}{item.cover && state !== 'failed' && <img src={item.cover} alt={`${item.title} 封面`} loading="lazy" onLoad={() => setState('ready')} onError={() => setState('failed')}/>}</span>;
}
// Empty poster: a faint sample of what the wall becomes (one lead record and four
// more, as generated sleeves), with the lamp-amber arrow toward the library.
const GHOST = ['晨光', '雨夜来信', '湖畔', 'Blue Hour', '磁带年代'];
function lightweight(item) { return { type: 'album', id: item.id || wallKey(item), title: item.title, artist: item.artist || '未知艺人', cover: item.cover || '', year: item.year || '', externalIds: item.externalIds || {} }; }
export default function AlbumWall({ items, onClose }) {
  const saved = useRef(readWall(localStorage)), appearance = useDesktopAppearance();
  useEffect(() => releaseWallCovers, []); // closing the wall frees its full-size cover bitmaps
  const [options, setOptions] = useState(saved.current.options), [selected, setSelected] = useState(saved.current.selected);
  const [source, setSource] = useState('library'), [query, setQuery] = useState(''), [provider, setProvider] = useState('qq'), [results, setResults] = useState([]), [searching, setSearching] = useState(false);
  const [notice, setNotice] = useState(''), [problem, setProblem] = useState(''), [draftError, setDraftError] = useState(false), [busy, setBusy] = useState(false), [painting, setPainting] = useState(false), [metrics, setMetrics] = useState(null);
  const canvas = useRef(null), searchRequest = useRef(null), paintRevision = useRef(0);
  const ordered = useMemo(() => orderAlbums(selected, options.sort), [selected, options.sort]);
  const selectedKeys = useMemo(() => new Map(ordered.map((item, index) => [wallKey(item), index + 1])), [ordered]);
  const library = useMemo(() => {
    const seen = new Set(); return items.filter((item) => { if (item.type !== 'album' || seen.has(wallKey(item))) return false; seen.add(wallKey(item)); return `${item.title} ${item.artist}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()); });
  }, [items, query]);
  const visible = source === 'library' ? library : results;
  useEffect(() => () => searchRequest.current?.abort(), []);
  useEffect(() => {
    try { const data = JSON.stringify({ version: 1, options, selected }); if (data.length > 512000) throw new Error(); localStorage.setItem(WALL_STORAGE_KEY, data); setDraftError(false); }
    catch { setDraftError(true); }
  }, [options, selected]);
  useEffect(() => {
    const revision = ++paintRevision.current; setPainting(true);
    const timer = setTimeout(async () => {
      try {
        const images = await Promise.all(ordered.map((item) => loadWallCover(item.cover)));
        const offscreen = document.createElement('canvas'); const result = await paintWall(offscreen, ordered, options, images, 1);
        if (revision !== paintRevision.current || !canvas.current) return;
        canvas.current.width = offscreen.width; canvas.current.height = offscreen.height; canvas.current.getContext('2d').drawImage(offscreen, 0, 0);
        setMetrics(result); setPainting(false);
      } catch (error) { if (revision === paintRevision.current) { setProblem(error.message); setPainting(false); } }
    }, 80);
    return () => { clearTimeout(timer); paintRevision.current++; };
  }, [ordered, options]);
  const update = (patch) => setOptions((current) => normalizeWall({ ...current, ...patch }));
  const toggle = (item) => {
    const key = wallKey(item);
    setSelected((current) => current.some((album) => wallKey(album) === key) ? current.filter((album) => wallKey(album) !== key) : current.length >= 100 ? (setProblem('最多选择 100 张专辑。'), current) : [...current, lightweight(item)]);
  };
  const move = (index, direction) => { setSelected((current) => { const next = [...orderAlbums(current, options.sort)], target = index + direction; if (target >= 0 && target < next.length) [next[index], next[target]] = [next[target], next[index]]; return next; }); update({ sort: 'selection' }); };
  const search = async (event) => {
    event.preventDefault(); if (source === 'library') return;
    searchRequest.current?.abort(); const controller = new AbortController(); searchRequest.current = controller;
    setNotice(''); setProblem(''); setSearching(true); setResults([]);
    try {
      const input = buildSearchInput({ query, provider, type: 'album' });
      const params = new URLSearchParams(input);
      const response = await fetch(`/api/search?${params}`, { signal: controller.signal });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || '搜索暂时不可用。');
      const albums = (data.candidates || []).filter((item) => item.type === 'album'); setResults(albums);
      if (!albums.length) setNotice('没有找到专辑，试试「歌手 + 专辑名」或 QQ 专辑链接。');
    } catch (error) { if (error.name !== 'AbortError') setProblem(error.message); }
    finally { if (searchRequest.current === controller) setSearching(false); }
  };
  const download = async () => {
    if (!ordered.length) return; setBusy(true); setProblem(''); setNotice('正在生成高清图片…');
    try {
      const images = await Promise.all(ordered.map((item) => loadWallCover(item.cover)));
      const image = document.createElement('canvas'); const result = await paintWall(image, ordered, options, images, options.scale);
      const blob = await new Promise((resolve) => image.toBlob(resolve, 'image/png')); if (!blob) throw new Error('无法生成图片，请降低下载倍率重试。');
      downloadBlob(blob, `Album-Wall-${(options.title || 'Collection').replace(/[<>:"/\\|?*\x00-\x1f]/g, '').slice(0, 60)}.png`);
      setNotice(`PNG 已生成：${result.width} × ${result.height}。${result.missing ? ` ${result.missing} 张封面未加载，图片中用生成的唱片封套代替。` : '请选择保存位置。'}`);
    } catch (error) { setNotice(''); setProblem(error.message); }
    finally { setBusy(false); }
  };
  const importFile = async (event) => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    try { if (file.size > 512000) throw new Error('工程文件过大。'); const data = JSON.parse(await file.text()); if (data.version !== 1 || !Array.isArray(data.selected)) throw new Error('请选择心流小屋导出的专辑墙工程。'); const restored = readWall({ getItem: () => JSON.stringify(data) }); setSelected(restored.selected); setOptions(restored.options); setProblem(''); setNotice('已打开专辑墙工程。'); }
    catch (error) { setProblem(error.message || '工程文件无法读取。'); }
  };
  const changeSource = (next) => { if (next === source) return; if (next === 'library') { searchRequest.current?.abort(); setSearching(false); } setSource(next); setQuery(''); };
  return <Dialog variant="full" title="专辑墙编辑器" close={onClose} className="album-wall-overlay">
    <header className="wall-header"><div><Grid3X3 size={22}/><strong>专辑墙</strong><span>把喜欢的音乐，排成一张海报。</span></div><div><span className="wall-count">{selected.length} / 100</span><button type="button" className="pixel-button is-primary" disabled={!selected.length || busy} onClick={download}><Download size={18}/>{busy ? '生成中…' : '下载 PNG'}</button><button type="button" aria-label="关闭专辑墙编辑器" onClick={onClose}><X size={22}/></button></div></header>
    <div className="wall-workspace">
      <aside className="wall-library" aria-label="专辑选择"><Segmented className="wall-source-tabs" label="专辑来源" value={source} onChange={changeSource} items={[{ id: 'library', label: '专辑库' }, { id: 'online', label: '搜索添加' }]}/>
        <form className="wall-search" onSubmit={search}><label><Search size={17}/><input aria-label="专辑墙搜索" placeholder={source === 'library' ? '筛选歌手或专辑' : '歌手、专辑或 QQ 链接'} value={query} onChange={(event) => setQuery(event.target.value)}/></label>{source === 'online' && <div><select aria-label="专辑墙搜索来源" value={provider} onChange={(event) => setProvider(event.target.value)}><option value="qq">QQ 音乐</option><option value="itunes">Apple 曲库</option></select><button type="submit" disabled={!query.trim() || searching}>{searching ? '搜索中…' : '搜索'}</button></div>}</form>
        <div className="wall-library-tools"><small>点击右上角添加，数字代表排列顺序。</small><button type="button" onClick={() => setSelected((current) => { const keys = new Set(current.map(wallKey)); return [...current, ...visible.filter((item) => !keys.has(wallKey(item))).map(lightweight)].slice(0, 100); })} disabled={!visible.length}>批量添加当前列表</button></div>
        <div className="wall-library-grid">{visible.map((item) => { const order = selectedKeys.get(wallKey(item)); return <button type="button" key={wallKey(item)} className={`wall-library-album ${order ? 'selected' : ''}`} aria-label={`${order ? '取消选择' : '添加'} ${item.artist} 的 ${item.title}`} aria-pressed={Boolean(order)} onClick={() => toggle(item)}><WallCover item={item}/><span className="wall-add-order">{order || <Plus size={16}/>}</span><strong>{item.title}</strong><small>{item.artist}</small></button>; })}</div>
        {!visible.length && <p className="wall-empty">{searching ? '正在寻找封面…' : source === 'library' ? '这里没有匹配的专辑，可用「搜索添加」寻找。' : '搜索一张专辑，把封面加入海报。'}</p>}
      </aside>
      <main className="wall-preview"><div className="wall-preview-bar"><span>海报预览</span><small>{painting ? '正在更新…' : metrics ? `${metrics.width} × ${metrics.height}${metrics.missing ? ` · ${metrics.missing} 张封面未加载` : ''}` : ''}</small></div><div className="wall-canvas-wrap"><canvas ref={canvas} aria-label="专辑墙图片预览"/>{!selected.length && <div className="wall-preview-empty"><div className="wall-ghost" aria-hidden="true" style={{ '--wall-ghost-bg': options.background }}>{GHOST.map((title) => <RecordSleeve key={title} item={{ title, artist: '专辑墙' }} title={false}/>)}</div><p><ArrowLeft size={24}/><strong>从左侧选择第一张专辑</strong></p><span>添加顺序就是你的榜单顺序。</span></div>}</div><p className="wall-notice" role="status">{notice || (draftError ? '' : '草稿自动保存在本机。下载图片和预览使用相同排版。')}</p>{draftError && <p className="wall-notice status is-error" role="alert">无法保存专辑墙草稿到本机，仍可下载图片或保存工程。</p>}{problem && <p className="wall-notice status is-error" role="alert">{problem}</p>}
        <div className="wall-selected-heading"><strong>已选择 · {selected.length}</strong><ConfirmButton className="" disabled={!selected.length} icon={<Trash2 size={16}/>} question={`清空已选的 ${selected.length} 张？`} confirmLabel="确认清空" onConfirm={() => setSelected([])}>清空</ConfirmButton></div>
        <ol className="wall-selected-list">{ordered.map((item, index) => <li key={wallKey(item)}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{item.title}</strong><small>{item.artist}</small></div><button type="button" disabled={index === 0} aria-label={`将 ${item.title} 向前移动`} onClick={() => move(index, -1)}><Up size={17}/></button><button type="button" disabled={index === selected.length - 1} aria-label={`将 ${item.title} 向后移动`} onClick={() => move(index, 1)}><Down size={17}/></button><button type="button" aria-label={`移除 ${item.title}`} onClick={() => toggle(item)}><X size={17}/></button></li>)}</ol>
      </main>
      <aside className="wall-options" aria-label="海报设置"><h2>海报设置</h2>
        <details className="wall-group" open><summary>排版</summary>
        <label>排列方法<select aria-label="排列方法" value={options.layout} onChange={(event) => update({ layout: event.target.value })}><option value="grid">等大网格</option><option value="ranked">榜单 · 前排大封面</option></select></label>
        <label>排列顺序<select aria-label="排列顺序" value={options.sort} onChange={(event) => update({ sort: event.target.value })}><option value="selection">选择顺序</option><option value="title">专辑名称</option><option value="artist">歌手名称</option><option value="year">发行年份</option></select></label>
        {[['columns','每行列数',1,12],['margin','外边距',0,160],['gap','专辑间距',0,60],['border','封面边框',0,12]].map(([key,label,min,max]) => <label key={key}>{label}<span className="wall-range"><input aria-label={label} type="range" min={min} max={max} value={options[key]} onChange={(event) => update({ [key]: Number(event.target.value) })}/><output>{options[key]}{key === 'columns' ? '' : ' px'}</output></span></label>)}
        </details>
        <details className="wall-group" open><summary>颜色</summary>
        <div className="wall-colors"><label>背景颜色<input aria-label="专辑墙背景颜色" type="color" value={options.background} onChange={(event) => update({ background: event.target.value })}/></label><label>文字颜色<input aria-label="专辑墙文字颜色" type="color" value={options.textColor} onChange={(event) => update({ textColor: event.target.value })}/></label></div>
        </details>
        <details className="wall-group"><summary>文字</summary>
        <label>标题<input aria-label="专辑墙标题" value={options.title} maxLength={120} placeholder="可留空" onChange={(event) => update({ title: event.target.value })}/></label>
        <label>作者 · 可选<input aria-label="专辑墙作者" value={options.author} maxLength={80} placeholder="你的名字" onChange={(event) => update({ author: event.target.value })}/></label>
        <label className="wall-toggle"><span>右侧显示专辑名称</span><input aria-label="右侧显示专辑名称" type="checkbox" checked={options.showNames} onChange={(event) => update({ showNames: event.target.checked })}/></label>
        <label className="wall-toggle"><span>右侧显示歌手名称</span><input aria-label="右侧显示歌手名称" type="checkbox" checked={options.showArtists} onChange={(event) => update({ showArtists: event.target.checked })}/></label>
        <label>海报字体<select aria-label="专辑墙字体" value={options.font} onChange={(event) => update({ font: event.target.value })}><option value="bundled">HarmonyOS Sans SC（内置）</option>{(appearance.fonts || []).filter((font) => font !== 'bundled').map((font) => <option key={font}>{font}</option>)}</select></label>
        </details>
        <label>下载清晰度<select aria-label="下载清晰度" value={options.scale} onChange={(event) => update({ scale: Number(event.target.value) })}><option value="1">1× · 标准</option><option value="2">2× · 高清</option><option value="3">3× · 超清</option></select></label>
        <div className="wall-project-tools"><button type="button" onClick={() => downloadBlob(new Blob([JSON.stringify({ version: 1, options, selected }, null, 2)], { type: 'application/json' }), 'Album-Wall-project.json')}><Download size={16}/>保存工程</button><label className="wall-file">打开工程<input type="file" accept=".json,application/json" aria-label="打开专辑墙工程" onChange={importFile}/></label><a href="https://topsters.org/" target="_blank" rel="noreferrer"><External size={16}/>打开 Topsters</a><small>Topsters 在浏览器里打开，本机草稿不会带过去。</small></div>
      </aside>
    </div>
  </Dialog>;
}
