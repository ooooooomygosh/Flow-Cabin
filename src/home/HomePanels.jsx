import React, { lazy, Suspense, useEffect, useState } from 'react';
import Dialog from '../Dialog';
import { useCabinRuntime } from '../runtime/CabinRuntime';
import SkySettings from '../SkySettings';
import RoomTurntable from '../RoomTurntable';
import { SceneRecipes, SleepPanel, Diagnostics } from './SceneTools';
import RoomLibrary from './RoomLibrary';
import Postcard from './Postcard';
import HomeCalendar from './HomeCalendar';
import RoomPickers from '../RoomPickers';
import { readLife, writeLife, waterPlant, plantStage, LIFE_CHANGED, LIFE_KEY } from './life-state.mjs';
const LyricsStage = lazy(() => import('../lyrics/LyricsStage'));

export function HomeLyrics({ close }) {
  return <Suspense fallback={<Dialog title="歌词" close={close}><p>正在打开歌词册…</p></Dialog>}><LyricsStage close={close}/></Suspense>;
}
export function LifePanel({ type }) {
  const { focus, look } = useCabinRuntime(), [life, setLife] = useState(readLife), [notice, setNotice] = useState('');
  useEffect(() => { const update = e => { if (!e.key || e.key === LIFE_KEY) setLife(readLife()); }; window.addEventListener(LIFE_CHANGED, update); window.addEventListener('storage', update); return () => { window.removeEventListener(LIFE_CHANGED, update); window.removeEventListener('storage', update); }; }, []);
  const act = fn => { try { setLife(fn()); setNotice('已记下来。'); } catch { setNotice('尚未保存，请检查本机存储空间。'); } };
  // The interval field keeps its own draft while typing: an empty or half-typed value is never saved.
  const [draft, setDraft] = useState(null);
  const saveInterval = (text, final) => { const minutes = Math.round(Number(text)); if (text.trim() === '' || !Number.isFinite(minutes)) { if (final) setDraft(null); return; } if (!final && (minutes < 15 || minutes > 180)) return; const interval = Math.max(15, Math.min(180, minutes)); if (final) setDraft(null); if (interval !== life.interval) act(() => writeLife({ interval, nextDrink: Date.now() + interval * 60000 })); };
  if (type === 'plant') return <section className="home-life-panel"><img src={`/room-scenes/v21/furniture/${look}/sprites/plant-se.webp`} alt="窗边的绿植"/><h3>{['小小的新芽', '长出新叶', '枝叶舒展', '郁郁葱葱'][plantStage(life)]}</h3><p>你照顾它的 {life.wateredDays.length} 天，都留在这里。离开一段时间也没关系。</p><button type="button" className="home-primary" onClick={() => act(() => waterPlant())}>浇一点水</button>{notice && <p role="status">{notice}</p>}</section>;
  if (type === 'rest') return <section className="home-life-panel"><h3>在窗边歇一会儿</h3><p>放下手边的事，和伙伴一起慢慢呼吸。</p><button type="button" className="home-primary" onClick={() => act(() => writeLife({ resting: !life.resting }))}>{life.resting ? '休息好了' : '让伙伴回窝休息'}</button><button type="button" disabled={focus.state.timer.phase !== 'idle'} onClick={() => focus.start('shortBreak')}>开始短休息计时</button>{notice && <p role="status">{notice}</p>}</section>;
  return <section className="home-life-panel"><img src={`/room-scenes/v21/furniture/${look}/sprites/tea-se.webp`} alt="一杯温茶"/><h3>喝口水，舒展一下</h3><p>{life.drinks.length ? `最近一次：${new Date(life.drinks.at(-1)).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}` : '给自己倒一杯喜欢的茶。'}</p><button type="button" className="home-primary" onClick={() => act(() => writeLife({ drinks: [...life.drinks, Date.now()], nextDrink: Date.now() + life.interval * 60000 }))}>喝了一杯</button><label><input type="checkbox" checked={life.reminder} onChange={e => act(() => writeLife({ reminder: e.target.checked, nextDrink: Date.now() + life.interval * 60000 }))}/>在小屋里提醒喝水</label>{life.reminder && <label>间隔（分钟）<input type="number" min="15" max="180" inputMode="numeric" value={draft ?? life.interval} onChange={e => { setDraft(e.target.value); saveInterval(e.target.value, false); }} onBlur={e => saveInterval(e.target.value, true)} onKeyDown={e => { if (e.key === 'Enter') saveInterval(e.currentTarget.value, true); }}/></label>}{notice && <p role="status">{notice}</p>}</section>;
}
export function LifeReminder() {
  const { notify } = useCabinRuntime();
  useEffect(() => { const id = setInterval(() => { const value = readLife(); if (!document.hidden && value.reminder && value.nextDrink > 0 && Date.now() >= value.nextDrink) { try { writeLife({ nextDrink: Date.now() + value.interval * 60000 }); notify('茶还温着，起来喝口水吧。'); } catch {} } }, 30000); return () => clearInterval(id); }, [notify]);
  return null;
}
export default function HomePanels({ tool, close, filters, setFilters, visible, recordStyle, openAdd, openRecord, openWall, openSmart, onRoomChange }) {
  const { deck, commands, items, look, identity } = useCabinRuntime();
  const title = ({ calendar: '挂历与日程', postcard: '小屋明信片', recipes: '场景配方', sleep: '睡前模式', diagnostics: '功能诊断', library: '唱片库', music: '唱机旁', weather: '窗外与天气', plant: '窗边的植物', tea: '茶歇', rest: '休息角', companions: '选择伙伴' })[tool];
  if (!title) return null;
  return <Dialog title={title} close={close} className={`home-tool home-${tool}-dialog`} size="lg">
    {tool === 'library' && <RoomLibrary visible={visible} filters={filters} setFilters={setFilters} openAdd={openAdd} openRecord={openRecord} openWall={openWall}/>}
    {tool === 'music' && <><RoomTurntable ownsAudio={false} physicalDeck={false} item={deck.deckItem} spinning={deck.effectiveSpin} system={deck.system} trackIndex={deck.shownTrackIndex} style={recordStyle} items={items} load={deck.load} toggle={deck.toggleVisual} track={deck.setTrackIndex} eject={deck.eject} provider={deck.provider} setProvider={deck.chooseProvider} playback={deck.playback} player={deck.player}/><div className="home-panel-links"><button type="button" onClick={() => commands.open('library')}>选择唱片</button><button type="button" disabled={!deck.deckItem} onClick={() => commands.open('lyrics')}>歌词册</button><button type="button" onClick={openSmart}>智能唱片机</button></div></>}
    {tool === 'calendar' && <HomeCalendar/>}
    {tool === 'postcard' && <Postcard/>}{tool === 'recipes' && <SceneRecipes/>}
    {tool === 'sleep' && <SleepPanel/>}
    {tool === 'diagnostics' && <Diagnostics/>}
    {tool === 'weather' && <SkySettings/>}
    {['plant', 'tea', 'rest'].includes(tool) && <LifePanel type={tool}/>}
    {tool === 'companions' && <RoomPickers petsOnly look={look} petId={identity.builtinId} onChange={onRoomChange}/>}
  </Dialog>;
}
