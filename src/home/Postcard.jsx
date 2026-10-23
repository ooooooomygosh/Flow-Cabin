import React, { useEffect, useState } from 'react';
import { useCabinRuntime } from '../runtime/CabinRuntime';
import { downloadBlob } from '../lib/download.mjs';
import { THEMES } from './spatial-layout.mjs';

// Render the actual Pixi room, then add only the text explicitly selected here.
// DOM controls and private task/note overlays are never captured incidentally.
export default function Postcard() {
  const { sceneCapture, focus, identity, look, sky } = useCabinRuntime();
  const [include, setInclude] = useState({ achievement: true, tasks: false, note: false, place: false });
  const [caption, setCaption] = useState('留一盏灯，给今天。'), [preview, setPreview] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { setPreview(''); }, [include, caption, look, identity.revision]);
  const compose = async () => {
    const scene = await sceneCapture.render(), canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 1020;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#f0e5cf'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(scene, 0, 0);
    ctx.fillStyle = '#364532'; ctx.font = '28px sans-serif'; ctx.fillText(caption.slice(0, 40), 45, 850, 1110);
    ctx.font = '18px sans-serif'; ctx.fillStyle = '#63705a';
    const theme = THEMES.find(t => t.id === look)?.name || '小屋';
    const lines = [`${theme} · ${identity.name} · ${new Date().toLocaleDateString('zh-CN')}`];
    if (include.achievement) lines.push(`已完成 ${focus.state.tasks.filter(t => t.done).length} 项小事`);
    if (include.tasks) lines.push('今日任务：' + focus.state.tasks.slice(0, 3).map(t => `${t.done ? '✓ ' : ''}${t.text}`).join(' · '));
    if (include.note && focus.state.notes) lines.push(focus.state.notes.replace(/\s+/g, ' ').slice(0, 100));
    if (include.place) lines.push(sky.settings.realWeather && sky.real ? `${sky.city?.name || '附近'} · ${Math.round(sky.real.temperature)}°` : '尚未设置实际天气');
    lines.slice(0, 5).forEach((line, i) => ctx.fillText(line, 45, 887 + i * 24, 1110));
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(Error('明信片生成失败。')), 'image/png'));
  };
  const make = async download => {
    setBusy(true); setError('');
    try { const blob = await compose(); const data = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(blob); }); setPreview(data); if (download) await downloadBlob(blob, `FlowCabin-${new Date().toISOString().slice(0, 10)}.png`); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return <section className="home-scene-tools"><p>留下当前布置和伙伴。选择想带上的内容，预览后保存为图片。</p><label>一句话<input value={caption} maxLength={40} onChange={e => setCaption(e.target.value)}/></label><fieldset className="home-postcard-options"><legend>图片上显示</legend>{[['achievement','完成数量'],['tasks','任务文字'],['note','随手记摘录'],['place','地区和天气']].map(([id,label]) => <label key={id}><input type="checkbox" checked={include[id]} onChange={e => setInclude(v => ({ ...v, [id]:e.target.checked }))}/>{label}</label>)}</fieldset><button className="home-primary" disabled={busy} onClick={() => make(false)}>生成预览</button>{preview && <><img className="home-postcard-preview" src={preview} alt="当前小屋明信片预览"/><button className="home-primary" disabled={busy} onClick={async () => { setBusy(true);try { const r = await fetch(preview); await downloadBlob(await r.blob(), `FlowCabin-${new Date().toISOString().slice(0,10)}.png`); } catch(error) { setError(error.message); } finally { setBusy(false); } }}>保存这张明信片</button></>}{error && <p role="alert">{error}</p>}</section>;
}
