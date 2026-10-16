import React, { useEffect, useRef, useState } from 'react';
import { Disc3, Play, Trash2, External, Check, Sparkles } from './icons';
import { pixelCover } from './player/pixel-cover.mjs';
import './player/player.css';
import Dialog from './Dialog';
import DiscogsLink from './DiscogsLink';
import { PixelVinyl, RecordTools, useRecordLibrary, useRecordStyle } from './RecordLibrary';
import './record-card.css';
import { ShowroomArtwork } from './RoomArtwork';
import { albumKey, genresFor } from './record-library.mjs';
import { trackNames } from './room-model.mjs';
import { updateItem } from './collection-api.mjs';
import { formatDuration } from './lib/time-format.mjs';

// Turns the album's cover into a cabin-palette pixel cover (or generates one
// from the title). Preview first; the original is kept so it can come back.
function PixelCoverTool({ item, onChanged }) {
  const [preview, setPreview] = useState(null), [state, setState] = useState('');
  const save = async (patch, done) => {
    setState('saving');
    try { const result = await updateItem(item.id, patch); onChanged(result.item); setPreview(null); setState(done); } catch (error) { setState(error.message); }
  };
  const generate = async () => { setState('working'); const result = await pixelCover(item, { source: item.originalCover || item.cover }); setPreview(result); setState(''); };
  if (preview) return <div className="record-pixel-cover" aria-label="像素封面预览">
    <img src={preview.cover} alt={`${item.title} 像素封面预览`} width="256" height="256"/>
    <small>{preview.method === 'pixelated' ? '已把原封面转成小屋配色的像素画。' : preview.reason || '按专辑名生成的像素封面。'}</small>
    <span><button type="button" className="pixel-button is-primary" disabled={state === 'saving'} onClick={() => save({ cover: preview.cover, ...(item.originalCover || !item.cover || item.cover.startsWith('data:image/png') ? {} : { originalCover: item.cover }) }, '已换上像素封面。')}><Check size={15}/>用这张</button><button type="button" className="pixel-button" onClick={() => setPreview(null)}>算了</button></span>
  </div>;
  return <>
    <button type="button" className="pixel-button" disabled={state === 'working'} title="生成小屋风格的像素封面，可预览后再决定" onClick={generate}><Sparkles size={15}/>{state === 'working' ? '正在生成…' : '像素封面'}</button>
    {item.originalCover && item.originalCover !== item.cover && <button type="button" className="pixel-button is-quiet" onClick={() => save({ cover: item.originalCover, originalCover: '' }, '已恢复原封面。')}>恢复原封面</button>}
    {state && !['working', 'saving'].includes(state) && <small className="record-card-saved" role="status">{state}</small>}
  </>;
}

const duration = (ms) => ms > 0 ? formatDuration(ms) : '';
// 压片档案: a small inventory slip under the tools: this pressing's vinyl, running time
// and the boxes it lives in, with the record itself at 1x as the swatch.
function PressingSlip({ item, names, library }) {
  const style = useRecordStyle(item), key = albumKey(item);
  const total = (item.trackDetails || []).reduce((sum, track) => sum + (track?.lengthMillis > 0 ? track.lengthMillis : 0), 0);
  const boxes = library ? library.boxes.filter((box) => box.keys.includes(key)).map((box) => box.name) : [];
  const vinyl = [style.splatter && style.splashes.length ? `${style.splashes.length} 色放射泼溅` : '素色黑胶', style.opacity < 100 ? `透明度 ${style.opacity}%` : ''].filter(Boolean).join(' · ');
  return <section className="record-card-slip" aria-label="压片档案">
    <PixelVinyl item={item} className="record-card-slip-disc"/>
    <dl>
      <div><dt>黑胶</dt><dd>{vinyl}</dd></div>
      <div><dt>曲目</dt><dd>{names.length ? `${names.length} 首${total ? ` · ${formatDuration(total)}` : ''}` : '待补充'}</dd></div>
      {library && item.type === 'album' && <div><dt>唱片盒</dt><dd>{boxes.length ? boxes.join('、') : '未分组'}</dd></div>}
    </dl>
  </section>;
}
// One album: cover and vinyl, track list that plays on the deck, personal notes.
export default function RecordCard({ item, close, onChanged, onRemove }) {
  const library = useRecordLibrary(), names = trackNames(item), genres = library ? genresFor(item, library.data) : [];
  const [notes, setNotes] = useState(item.notes || ''), [saved, setSaved] = useState('saved'), [confirm, setConfirm] = useState(false);
  const timer = useRef(null), latest = useRef(notes), persisted = useRef(notes), removing = useRef(false);
  latest.current = notes;
  const saveNotes = async () => {
    clearTimeout(timer.current); if (latest.current === persisted.current) { setSaved('saved'); return; }
    setSaved('saving');
    const value = latest.current;
    try { const result = await updateItem(item.id, { notes: value }); persisted.current = value; onChanged(result.item); setSaved(latest.current === value ? 'saved' : 'dirty'); } catch { setSaved('error'); }
  };
  useEffect(() => () => { clearTimeout(timer.current); if (!removing.current && latest.current !== persisted.current) updateItem(item.id, { notes: latest.current }).then((result) => onChanged(result.item)).catch(() => {}); }, [item.id]);
  const play = (track = 0) => { window.dispatchEvent(new CustomEvent('cabin-play', { detail: { id: item.id, track } })); close(); };
  const links = [item.collectionViewUrl && ['Apple Music', item.collectionViewUrl], item.externalIds?.qqAlbumMid && ['QQ 音乐', `https://y.qq.com/n/ryqq/albumDetail/${encodeURIComponent(item.externalIds.qqAlbumMid)}`]].filter(Boolean);
  return <Dialog title="唱片卡片" icon={<Disc3 size={20}/>} close={close} size="lg" className="record-card-dialog" label={`唱片卡片：${item.title}`}>
    <div className="record-card">
      <div className="record-card-art">
        {/* The record pulled half out of its sleeve, both drawn in whole art pixels. */}
        <div className="record-card-sleeve"><PixelVinyl item={item} className="record-card-vinyl"/><ShowroomArtwork item={item} pixel className="record-card-cover"/></div>
        <div className="record-card-tools"><button type="button" className="pixel-button is-primary" onClick={() => play(0)}><Play size={16}/>放上唱机</button><RecordTools item={item}/><DiscogsLink item={item}/><PixelCoverTool item={item} onChanged={onChanged}/></div>
        <PressingSlip item={item} names={names} library={library}/>
      </div>
      <div className="record-card-copy">
        {/* Liner notes: the album's facts and side A on a paper insert. */}
        <section className="record-card-liner" aria-label="唱片资料">
        <small className="record-card-kicker">{item.type === 'song' ? '单曲' : item.type === 'playlist' ? '歌单' : '专辑'}{item.source === 'local-music' ? ' · 本地文件' : ''}</small>
        <h3>{item.title}</h3>
        <p className="record-card-artist">{item.artist}</p>
        <dl className="record-card-facts">
          {item.year && <div><dt>发行</dt><dd>{item.year}</dd></div>}
          {(item.label || item.genre) && <div><dt>{item.label ? '厂牌' : '流派'}</dt><dd>{item.label || item.genre}</dd></div>}
          {genres.length > 0 && <div><dt>标签</dt><dd>{genres.join(' · ')}</dd></div>}
          <div><dt>放上唱片架</dt><dd>{item.addedAt ? new Date(item.addedAt).toLocaleDateString('zh-CN') : '—'}</dd></div>
        </dl>
        {names.length > 0 ? <ol className="record-card-tracks" aria-label="曲目">{names.map((name, index) => <li key={index}><button type="button" onClick={() => play(index)} title="从这一首开始播放"><span>{String(index + 1).padStart(2, '0')}</span><strong>{name}</strong><small>{duration(item.trackDetails?.[index]?.lengthMillis)}</small></button></li>)}</ol> : <p className="record-card-empty">还没有曲目资料。</p>}
        </section>
        <label className="record-card-notes">我的笔记<textarea value={notes} maxLength={4000} rows={4} placeholder="第一次听的场景、最喜欢的一首、想记住的一句歌词…" onChange={(event) => { removing.current = false; setNotes(event.target.value); setSaved('dirty'); clearTimeout(timer.current); timer.current = setTimeout(saveNotes, 900); }} onBlur={saveNotes}/></label>
        <small className="record-card-saved" role="status">{{ saving: '正在保存…', error: <>保存失败。<button type="button" className="pixel-button is-quiet" onClick={saveNotes}>重试</button></>, dirty: '', saved: notes ? <><Check size={13}/>已保存在这台电脑</> : '' }[saved]}</small>
        <footer className="record-card-footer">
          {links.map(([label, url]) => <a key={label} href={url} target="_blank" rel="noreferrer"><External size={15}/>{label}</a>)}
          <span className="record-card-spacer"/>
          {confirm ? <><span>从唱片架移除这张唱片？</span><button type="button" className="pixel-button" onClick={() => setConfirm(false)}>取消</button><button type="button" className="pixel-button is-danger" onClick={() => { clearTimeout(timer.current); removing.current = true; onRemove(item); }}>确认移除</button></> : <button type="button" className="pixel-button is-quiet" onClick={() => setConfirm(true)}><Trash2 size={15}/>移除</button>}
        </footer>
      </div>
    </div>
  </Dialog>;
}
