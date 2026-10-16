import React, { createContext, useContext, useEffect, useId, useRef, useState } from 'react';
import Dialog from './Dialog';
import { Plus, Trash2, Wand2, Library } from './icons';
import { albumKey, DEFAULT_RECORD_STYLE, genresFor, genreList, LIBRARY_PREFIX, MAX_LIBRARY_BYTES, normalizeLibrary, normalizeStyle, resolveRecordStyle, readLibrary } from './record-library.mjs';
import useCoverColour from './useCoverColour';
import { radialSplatterLayers } from './vinyl-splatter.mjs';
import PixelRecord from './ui/PixelRecord';
import RecordSleeve from './ui/RecordSleeve';
import { sleeveTone } from './player/pixel-cover.mjs';
import { liftLabel } from './scene/deck-sprite.mjs';

const LibraryContext = createContext(null);
export function RecordLibraryProvider({ userId, roomId, children, initialData, readOnly = false }) {
  const [data, setData] = useState(() => initialData ? normalizeLibrary(initialData) : readLibrary(localStorage, userId));
  const [error, setError] = useState('');
  const current = useRef(data);
  const update = (change) => {
    if (readOnly) return false;
    try {
      const candidate = change(current.current);
      if (Object.keys(candidate.styles || {}).length > 2000 || Object.keys(candidate.genres || {}).length > 2000 || Object.keys(candidate.rooms || {}).length > 100 || Object.values(candidate.rooms || {}).some((room) => (room.boxes || []).length > 64 || (room.boxes || []).some((box) => box.keys.length > 2000))) throw new Error('本机收藏上限：100 个房间、每房间 64 个唱片盒、每盒 2000 张唱片、2000 张自定义唱片。请整理后重试。');
      const next = normalizeLibrary(candidate), raw = JSON.stringify(next);
      if (raw.length > MAX_LIBRARY_BYTES) throw new Error('本机唱片设置空间已满，请减少唱片盒或标签后重试。');
      localStorage.setItem(LIBRARY_PREFIX + userId, raw);
      current.current = next; setData(next); setError(''); return true;
    } catch (cause) { setError(cause.message || '无法保存本机设置，请检查存储空间后重试。'); return false; }
  };
  useEffect(() => {
    if (readOnly) return;
    const sync = (event) => {
      if (event.key !== LIBRARY_PREFIX + userId) return;
      const next = readLibrary(localStorage, userId); current.current = next; setData(next);
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [userId]);
  return <LibraryContext.Provider value={{ data, update, error, roomId, readOnly, boxes: data.rooms[roomId]?.boxes || [] }}>{children}</LibraryContext.Provider>;
}
export function useRecordLibrary() { return useContext(LibraryContext); }

export function useRecordStyle(item, value) {
  const library = useRecordLibrary();
  const saved = value || (item && library?.data.styles[albumKey(item)]);
  const base = useCoverColour(!saved || saved.autoBase === true ? item?.cover : null);
  return resolveRecordStyle(saved, base);
}

// A single deterministic radial splatter stencil, recoloured per album.
export function VinylDisc({ item, value, className = '' }) {
  const style = useRecordStyle(item, value);
  return <span className={`custom-vinyl ${className}`} data-record-key={albumKey(item)} data-splatter={String(style.splatter)} style={{ '--vinyl-base': style.base, '--vinyl-alpha': style.opacity / 100 }} aria-hidden="true">
    {style.splatter && <svg className="vinyl-splatter" viewBox="0 0 200 200" data-template="radial-v2" data-colour-count={style.splashes.length}>
      {radialSplatterLayers(style.splashes.length).map((layer, index) => <g key={index} data-splash-colour={style.splashes[index]} fill={style.splashes[index]} stroke={style.splashes[index]}><path d={layer.paint} stroke="none"/><path d={layer.fine} fill="none" strokeWidth=".35" opacity=".84"/><path d={layer.drops} stroke="none"/><path d={layer.glints} fill="none" stroke="#fff5d3" strokeWidth=".32" opacity=".3"/></g>)}
    </svg>}
    <span className="vinyl-grooves"/><span className="vinyl-label"/><i className="vinyl-hole"/>
  </span>;
}

// The same record as a pixel object (record card, editor preview): vinyl style from the
// library, label in the cover's colour (or the generated sleeve's ink when coverless).
export function PixelVinyl({ item, value, className = '' }) {
  const style = useRecordStyle(item, value), cover = useCoverColour(item?.cover);
  const label = item && !item.cover ? sleeveTone(item) : liftLabel(cover, 100);
  return <PixelRecord className={className} base={style.base} opacity={style.opacity} splatter={style.splatter} splashes={style.splashes} label={label} seed={albumKey(item)}/>;
}

export function RecordTools({ item }) {
  const [open, setOpen] = useState(false);
  const library = useRecordLibrary();
  if (!library || library.readOnly || item.type !== 'album') return null;
  return <><button type="button" className="record-tools-button" aria-label="自定义唱片" title="自定义唱片" onClick={(event) => { event.stopPropagation(); setOpen(true); }}><Wand2 size={15}/><span>自定义唱片</span></button>{open && <RecordEditor item={item} close={() => setOpen(false)}/>}</>;
}

function RecordEditor({ item, close }) {
  const { data, update, error, boxes, roomId } = useRecordLibrary(), key = albumKey(item);
  const base = useCoverColour(item.cover);
  const [style, setStyle] = useState(() => normalizeStyle(data.styles[key] || { base, autoBase: true }));
  // Only an explicit base choice opts out of cover colour. Other fields retain
  // their edits when a late cover result arrives; reset opts back in.
  useEffect(() => { setStyle((old) => old.autoBase === true ? { ...old, base } : old); }, [base, key]);
  const [colourCount, setColourCount] = useState(style.splashes.length);
  const [fullDisc, setFullDisc] = useState(false);
  const palette = Array.from({ length: 3 }, (_, index) => style.splashes[index] || DEFAULT_RECORD_STYLE.splashes[index]);
  const previewStyle = { ...style, splashes: palette.slice(0, colourCount) };
  const [genres, setGenres] = useState(() => genresFor(item, data).join('，'));
  const [memberships, setMemberships] = useState(() => boxes.filter((box) => box.keys.includes(key)).map((box) => box.id));
  const id = useId();
  const save = (event) => {
    event.preventDefault();
    if (update((old) => ({ ...old, styles: { ...old.styles, [key]: previewStyle }, genres: { ...old.genres, [key]: genreList(genres) }, rooms: { ...old.rooms, [roomId]: { ...(old.rooms[roomId] || {}), boxes: (old.rooms[roomId]?.boxes || []).map((box) => ({ ...box, keys: memberships.includes(box.id) ? [...new Set([...box.keys, key])] : box.keys.filter((value) => value !== key) })) } } }))) close();
  };
  return <Dialog title="自定义唱片" icon={<Wand2 size={20}/>} close={close} size="lg" className="record-dialog record-editor">
    <p className="record-dialog-intro"><strong>{item.title}</strong> · {item.artist}<br/>只调整黑胶视觉，原专辑封面保持原始内容。设置保存在这台电脑。</p>
    <form onSubmit={save}>
      <div className="record-editor-grid"><div className="record-preview-column"><div className={`record-style-preview ${fullDisc ? 'is-disc-only' : ''}`} aria-label="黑胶样式预览"><PixelVinyl item={item} value={previewStyle} className="record-style-disc"/>{item.cover ? <img className="record-style-cover" src={item.cover} alt={`${item.title} 原封面`} draggable="false"/> : <RecordSleeve item={item} className="record-style-cover"/>}</div><button type="button" aria-pressed={fullDisc} onClick={() => setFullDisc(!fullDisc)}>{fullDisc ? '查看封面与黑胶' : '查看完整黑胶'}</button></div>
        <div className="record-style-fields">
          <label htmlFor={id + '-base'}>黑胶底色<input id={id + '-base'} type="color" value={style.base} onChange={(event) => setStyle({ ...style, base: event.target.value, autoBase: false })}/></label>
          <label htmlFor={id + '-alpha'}>黑胶透明度 <output>{style.opacity}%</output><input id={id + '-alpha'} type="range" min="0" max="100" value={style.opacity} onChange={(event) => setStyle({ ...style, opacity: Number(event.target.value) })}/></label>
          <label className="record-checkbox"><input type="checkbox" checked={style.splatter} onChange={(event) => setStyle({ ...style, splatter: event.target.checked })}/>启用放射状泼溅</label>
          <label htmlFor={id + '-count'}>泼溅颜色数量<select aria-label="泼溅颜色数量" id={id + '-count'} value={colourCount} disabled={!style.splatter} onChange={(event) => setColourCount(Number(event.target.value))}><option value="1">1 种颜色</option><option value="2">2 种颜色</option><option value="3">3 种颜色</option></select></label>
          {palette.slice(0, colourCount).map((colour, index) => <label key={index} htmlFor={id + '-splash-' + index}>泼溅颜色 {index + 1}<input id={id + '-splash-' + index} type="color" value={colour} disabled={!style.splatter} onChange={(event) => setStyle({ ...style, splashes: palette.map((value, position) => position === index ? event.target.value : value) })}/></label>)}
          <small className="record-mix-description">{colourCount === 1 ? '单色放射 · 保留黑胶底色' : colourCount === 2 ? '双色交织 · 主色为主，辅色点缀' : '三色交织 · 主色、辅色与一点点缀'}<br/>固定色纹自动混合，选好颜色即可套用。</small>
          <div className="record-palette-presets">{[{ name: '复古金彩', colours: ['#dba746', '#efe3c1', '#9f3d2e'] }, { name: '海盐蓝', colours: ['#45a8be', '#ede3c7', '#687bc5'] }, { name: '浆果粉', colours: ['#c8496d', '#f1c6d2', '#725499'] }].map((preset) => <button type="button" key={preset.name} aria-pressed={style.splatter && preset.colours.every((colour, index) => palette[index] === colour) && colourCount === 3} onClick={() => { setColourCount(3); setStyle({ ...style, splatter: true, splashes: preset.colours }); }}><PixelRecord base={style.base} splatter splashes={preset.colours} label={preset.colours[1]} seed={key}/>{preset.name}</button>)}</div>
          <button type="button" onClick={() => { setStyle({ ...DEFAULT_RECORD_STYLE, base, autoBase: true, splashes: [...DEFAULT_RECORD_STYLE.splashes] }); setColourCount(3); }}>恢复默认黑胶</button>
        </div>
      </div>
      <label htmlFor={id + '-genres'}>流派标签<input id={id + '-genres'} type="text" value={genres} maxLength="400" aria-describedby={id + '-genre-help'} placeholder="例如：摇滚，爵士，电子；逗号分隔" onChange={(event) => setGenres(event.target.value)}/></label><small id={id + '-genre-help'}>沿用条目已有标签，可手动修改；最多 12 个标签。</small>
      <fieldset className="record-box-membership"><legend>放入唱片盒（可多选）</legend>{boxes.length ? boxes.map((box) => <label className="record-checkbox" key={box.id}><input type="checkbox" checked={memberships.includes(box.id)} onChange={(event) => setMemberships((old) => event.target.checked ? [...old, box.id] : old.filter((value) => value !== box.id))}/>{box.name}</label>) : <p>先在「整理唱片架 › 管理唱片盒」里创建一个。</p>}</fieldset>
      {error && <p role="alert" className="record-error">{error}</p>}<footer><button type="button" onClick={close}>取消</button><button className="pixel-button is-primary" type="submit">保存唱片设置</button></footer>
    </form>
  </Dialog>;
}

export function RecordBoxControls({ items, filters, setFilters, count }) {
  const library = useRecordLibrary(), [open, setOpen] = useState(false);
  const { data, boxes, roomId } = library;
  const genres = [...new Set(items.flatMap((item) => genresFor(item, data)))].sort((a, b) => a.localeCompare(b, 'zh'));
  const decades = [...new Set(items.map((item) => Number(item.year)).filter((year) => year >= 1900 && year < 2100).map((year) => Math.floor(year / 10) * 10))].sort((a, b) => b - a);
  const change = (key, value) => setFilters({ ...filters, [key]: value });
  useEffect(() => { if (!['all', 'unfiled'].includes(filters.box) && !boxes.some((box) => box.id === filters.box)) change('box', 'all'); }, [boxes, filters.box]);
  return <div className="record-library-controls" aria-label="唱片盒与音乐筛选">
    <label>唱片盒<select aria-label="筛选唱片盒" value={filters.box} onChange={(event) => change('box', event.target.value)}><option value="all">全部唱片</option><option value="unfiled">未分组</option>{boxes.map((box) => <option key={box.id} value={box.id}>{box.name}（{items.filter((item) => box.keys.includes(albumKey(item))).length}）</option>)}</select></label>
    <button type="button" onClick={() => setOpen(true)}><Library size={16}/>管理唱片盒</button>
    <label>流派<select aria-label="筛选流派" value={filters.genre} onChange={(event) => change('genre', event.target.value)}><option value="all">全部流派</option><option value="unmarked">未标注流派</option>{[...new Set([...genres, ...(!['all', 'unmarked'].includes(filters.genre) ? [filters.genre] : [])])].map((genre) => <option key={genre}>{genre}</option>)}</select></label>
    <label>年代<select aria-label="筛选年代" value={filters.decade} onChange={(event) => change('decade', event.target.value)}><option value="all">全部年代</option><option value="unknown">年份待补充</option>{decades.map((decade) => <option key={decade} value={decade}>{decade} 年代</option>)}</select></label>
    <label>来源<select aria-label="筛选来源" value={filters.provider} onChange={(event) => change('provider', event.target.value)}><option value="all">全部来源</option><option value="qq">QQ 音乐</option><option value="itunes">Apple 曲库</option><option value="other">其他来源</option></select></label>
    <span className="record-filter-count">{count} / {items.length} 张</span><button type="button" className="record-clear-filters" onClick={() => setFilters({ box: 'all', genre: 'all', decade: 'all', provider: 'all' })}>清除音乐筛选</button>
    <small>唱片盒保存在这台电脑。流派来自已有标签或手动填写。</small>{library.error && <p role="alert" className="record-error">{library.error}</p>}
    {open && <BoxManager items={items} roomId={roomId} close={() => setOpen(false)}/>}
  </div>;
}

function BoxManager({ items, roomId, close }) {
  const { data, update, boxes, error } = useRecordLibrary();
  const [selectedId, setSelectedId] = useState(boxes[0]?.id || ''), [name, setName] = useState(''), [rename, setRename] = useState(''), [query, setQuery] = useState(''), [localError, setLocalError] = useState(''), [deleting, setDeleting] = useState(false);
  const selected = boxes.find((box) => box.id === selectedId);
  const visible = items.filter((item) => item.type === 'album' && `${item.title} ${item.artist}`.toLowerCase().includes(query.toLowerCase()));
  const mutate = (fn) => update((old) => ({ ...old, rooms: { ...old.rooms, [roomId]: { ...(old.rooms[roomId] || {}), boxes: fn(old.rooms[roomId]?.boxes || []) } } }));
  useEffect(() => { setRename(selected?.name || ''); setDeleting(false); }, [selected?.id, selected?.name]);
  const validName = (text, except = '') => {
    const value = text.trim();
    if (!value || value.length > 40) { setLocalError('唱片盒名称需要 1–40 个字符。'); return false; }
    if (boxes.some((box) => box.id !== except && box.name.toLowerCase() === value.toLowerCase())) { setLocalError('已有同名唱片盒，请换一个名称。'); return false; }
    setLocalError(''); return true;
  };
  const toggle = (key, checked) => mutate((current) => current.map((box) => box.id !== selectedId ? box : { ...box, keys: checked ? [...new Set([...box.keys, key])] : box.keys.filter((value) => value !== key) }));
  return <Dialog title="管理唱片盒" icon={<Library size={20}/>} close={close} size="lg" className="record-dialog record-box-manager">
    <p className="record-dialog-intro">唱片盒是你给唱片做的分组。一张专辑可放进多个盒子；删除盒子不会删除专辑。</p>
    <form className="record-new-box" onSubmit={(event) => { event.preventDefault(); if (!validName(name)) return; if (boxes.length >= 64) { setLocalError('每个房间最多 64 个唱片盒。'); return; } const id = crypto.randomUUID(); if (mutate((current) => [...current, { id, name: name.trim(), keys: [] }])) { setName(''); setSelectedId(id); } }}>
      <input aria-label="新唱片盒名称" placeholder="给新唱片盒命名" maxLength="40" value={name} onChange={(event) => setName(event.target.value)}/><button className="pixel-button is-primary" type="submit"><Plus size={17}/>新建唱片盒</button>
    </form>
    <div className="record-box-manager-grid"><nav aria-label="我的唱片盒">{boxes.map((box) => <button type="button" key={box.id} aria-pressed={box.id === selectedId} onClick={() => setSelectedId(box.id)}><Library size={16}/><span>{box.name}</span><small>{items.filter((item) => item.type === 'album' && box.keys.includes(albumKey(item))).length}</small></button>)}{!boxes.length && <p>还没有唱片盒，先创建一个。</p>}</nav>
      <section aria-label="唱片盒内容">{selected ? <>
        <form className="record-rename" onSubmit={(event) => { event.preventDefault(); if (validName(rename, selectedId)) mutate((current) => current.map((box) => box.id === selectedId ? { ...box, name: rename.trim() } : box)); }}><input aria-label="重命名唱片盒" maxLength="40" value={rename} onChange={(event) => setRename(event.target.value)}/><button type="submit">重命名</button></form>
        <input type="search" aria-label="筛选可加入唱片盒的专辑" placeholder="筛选歌手或专辑" value={query} onChange={(event) => setQuery(event.target.value)}/>
        <div className="record-box-batch"><button type="button" onClick={() => mutate((current) => current.map((box) => box.id === selectedId ? { ...box, keys: [...new Set([...box.keys, ...visible.map(albumKey)])] } : box))}>加入当前列表</button><button type="button" onClick={() => mutate((current) => current.map((box) => box.id === selectedId ? { ...box, keys: box.keys.filter((key) => !visible.some((item) => albumKey(item) === key)) } : box))}>移出当前列表</button></div>
        <div className="record-box-albums">{visible.map((item) => <label className="record-checkbox" key={item.id}><input type="checkbox" aria-label={`唱片盒包含 ${item.title}`} checked={selected.keys.includes(albumKey(item))} onChange={(event) => toggle(albumKey(item), event.target.checked)}/>{item.cover ? <img src={item.cover} alt="" loading="lazy"/> : <span className="record-box-sleeve"><RecordSleeve item={item} title={false}/></span>}<span><strong>{item.title}</strong><small>{item.artist}</small></span></label>)}{!visible.length && <p>没有符合条件的专辑。</p>}</div>
        {!deleting ? <button type="button" className="record-delete-box" onClick={() => setDeleting(true)}><Trash2 size={16}/>删除这个唱片盒</button> : <div className="record-delete-confirm"><span>仅删除分组，保留专辑。</span><button type="button" onClick={() => { if (mutate((current) => current.filter((box) => box.id !== selectedId))) setSelectedId(boxes.find((box) => box.id !== selectedId)?.id || ''); }}>确认删除唱片盒</button><button type="button" onClick={() => setDeleting(false)}>取消</button></div>}
      </> : <p>选择左侧唱片盒来整理专辑。</p>}</section>
    </div>{(localError || error) && <p role="alert" className="record-error">{localError || error}</p>}<footer><button type="button" className="pixel-button is-primary" onClick={close}>完成</button></footer>
  </Dialog>;
}
