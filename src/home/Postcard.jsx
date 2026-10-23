import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useCabinRuntime } from '../runtime/CabinRuntime';
import { downloadBlob } from '../lib/download.mjs';
import { THEMES } from './spatial-layout.mjs';
import { DEFAULT_INCLUDE, cleanCaption, postcardItems, postcardLines } from './postcard-model.mjs';
import { UndoLine, useUndo } from '../ui/Confirm';
import { FRAME_PHOTO_EVENT, FRAME_PHOTO_SIZE, clearFramePhoto, coverCrop, readFramePhoto, writeFramePhoto } from './frame-photo.mjs';
import './home-tools.css';

const fileName = () => `FlowCabin-${new Date().toISOString().slice(0, 10)}.png`;

// Render the actual Pixi room, then add only the text explicitly selected here.
// DOM controls and private task/note overlays are never captured incidentally.
// Every choice shows the exact words it would print; once a preview exists it
// follows the choices, so what is saved or shared is what was seen.
export default function Postcard() {
  const { sceneCapture, focus, identity, look, sky } = useCabinRuntime();
  const [include, setInclude] = useState(DEFAULT_INCLUDE);
  const [caption, setCaption] = useState('留一盏灯，给今天。'), [preview, setPreview] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const items = useMemo(() => postcardItems({ theme: THEMES.find((t) => t.id === look)?.name || '小屋', pet: identity.name, tasks: focus.state.tasks, notes: focus.state.notes, weather: { on: sky.settings.realWeather && Boolean(sky.real), city: sky.city?.name, temperature: sky.real?.temperature } }), [look, identity.name, focus.state.tasks, focus.state.notes, sky.settings.realWeather, sky.real, sky.city?.name]);
  const lines = postcardLines(items, include), text = cleanCaption(caption);
  const compose = async () => {
    const scene = await sceneCapture.render(), canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 1020;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#f0e5cf'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(scene, 0, 0);
    ctx.fillStyle = '#364532'; ctx.font = '28px sans-serif'; ctx.fillText(text, 45, 850, 1110);
    ctx.font = '18px sans-serif'; ctx.fillStyle = '#63705a';
    lines.forEach((line, i) => ctx.fillText(line, 45, 887 + i * 24, 1110));
    return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(Error('明信片生成失败。')), 'image/png'));
  };
  const render = async () => {
    setBusy(true); setError('');
    try {
      const blob = await compose();
      const url = await new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(blob); });
      setPreview({ url, blob });
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  // After the first preview, every change redraws it (debounced) instead of
  // leaving a stale card on screen.
  const shown = useRef(false); shown.current = Boolean(preview);
  const key = JSON.stringify([include, text, lines, look, identity.revision]);
  useEffect(() => { if (!shown.current) return undefined; const timer = setTimeout(render, 350); return () => clearTimeout(timer); }, [key]);
  const save = async () => { setBusy(true); setNotice(''); try { await downloadBlob(preview.blob, fileName()); setNotice('明信片已保存。'); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  const file = preview && typeof File === 'function' ? new File([preview.blob], fileName(), { type: 'image/png' }) : null;
  const canShare = Boolean(file && navigator.canShare?.({ files: [file] }));
  const share = async () => { try { await navigator.share({ files: [file], title: '小屋明信片', text }); } catch (e) { if (e?.name !== 'AbortError') setError(`没有分享出去：${e.message}`); } };
  return <section className="home-scene-tools"><p>留下当前布置和伙伴。逐项选择想带上的内容，预览确认后再保存或分享。</p>
    <label>一句话<input value={caption} maxLength={40} onChange={(e) => setCaption(e.target.value)}/></label>
    <fieldset className="home-postcard-options"><legend>图片上显示</legend>{items.map((item) => <label key={item.id} className={item.available ? '' : 'is-empty'}>
      <input type="checkbox" checked={Boolean(include[item.id]) && item.available} disabled={!item.available} onChange={(e) => setInclude((v) => ({ ...v, [item.id]: e.target.checked }))}/>
      <span className="home-postcard-choice"><span>{item.label}{item.private && <em>私人</em>}</span><small>{item.available ? item.text : '现在没有可显示的内容'}</small></span>
    </label>)}</fieldset>
    <p className="home-tools-hint">{lines.length ? `卡片上会印 ${lines.length} 行文字${include.tasks || include.note || include.place ? '，包含私人内容，分享前请再看一眼' : ''}。` : '卡片上只有房间画面和这句话。'}</p>
    {!preview ? <button className="home-primary" disabled={busy} onClick={render}>{busy ? '正在生成…' : '生成预览'}</button> : <>
      <figure className="home-postcard-figure" aria-busy={busy}><img className="home-postcard-preview" src={preview.url} alt="当前小屋明信片预览"/><figcaption>{busy ? '正在按新的选择重画…' : '预览会跟着上面的选择更新。'}</figcaption></figure>
      <div className="home-postcard-actions"><button className="home-primary" disabled={busy} onClick={save}>保存这张明信片</button>{canShare && <button disabled={busy} onClick={share}>分享…</button>}</div>
    </>}
    {notice && <p role="status">{notice}</p>}{error && <p role="alert">{error}</p>}
    <FramePicker/>
  </section>;
}

// 墙上的相框: the photo furniture shows this picture directly in the room.
async function framePhotoFrom(file) {
  if (!file.type.startsWith('image/')) throw Error('请选择一张图片。');
  if (file.size > 30 * 1024 * 1024) throw Error('图片超过 30 MB，请换一张小一点的。');
  const bitmap = await createImageBitmap(file).catch(() => { throw Error('读不出这张图片，请换一张 JPG / PNG / WebP。'); });
  const canvas = document.createElement('canvas'); canvas.width = FRAME_PHOTO_SIZE.width; canvas.height = FRAME_PHOTO_SIZE.height;
  const { sx, sy, sw, sh } = coverCrop(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d'); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height); bitmap.close?.();
  return { src: canvas.toDataURL('image/jpeg', 0.86), name: file.name, at: Date.now() };
}
function FramePicker() {
  const [photo, setPhoto] = useState(readFramePhoto), [error, setError] = useState(''), [busy, setBusy] = useState(false), [undo, offerUndo, clearUndo] = useUndo();
  useEffect(() => { const update = () => setPhoto(readFramePhoto()); window.addEventListener(FRAME_PHOTO_EVENT, update); return () => window.removeEventListener(FRAME_PHOTO_EVENT, update); }, []);
  const choose = async (event) => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    setBusy(true); setError('');
    try { writeFramePhoto(await framePhotoFrom(file)); } catch (e) { setError(e.name === 'QuotaExceededError' ? '本机空间不足，照片没有放进相框。' : e.message); } finally { setBusy(false); }
  };
  const remove = () => { const previous = photo; clearFramePhoto(); offerUndo('照片已从相框取下', () => { try { writeFramePhoto(previous); } catch (e) { setError(e.message); } }); };
  return <section className="home-frame-picker" aria-labelledby="home-frame-picker-title">
    <h4 id="home-frame-picker-title">墙上的相框</h4>
    <div className="home-frame-picker-row">
      {photo ? <img src={photo.src} alt="相框里的照片" width={FRAME_PHOTO_SIZE.width / 2} height={FRAME_PHOTO_SIZE.height / 2}/> : <span className="home-frame-empty" aria-hidden="true">空</span>}
      <div><p>{photo ? '相框里正挂着这张照片。' : '挑一张喜欢的照片，挂在墙上的相框里。'}</p>
        <span className="home-frame-actions"><label className="home-file-button">{busy ? '正在处理…' : photo ? '换一张' : '选择照片'}<input type="file" accept="image/*" disabled={busy} onChange={choose}/></label>{photo && <button type="button" onClick={remove}>取下照片</button>}</span></div>
    </div>
    <small>照片会缩小后只保存在这台设备上，不会上传，也不会印到明信片的文字里。</small>
    <UndoLine offer={undo} clear={clearUndo}/>
    {error && <p role="alert">{error}</p>}
  </section>;
}
