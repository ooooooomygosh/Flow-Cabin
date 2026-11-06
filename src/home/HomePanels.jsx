import React, { lazy, Suspense, useEffect } from 'react';
import Dialog from '../Dialog';
import { useCabinRuntime } from '../runtime/CabinRuntime';
import SkySettings from '../SkySettings';
import ConsolePanel from '../console/ConsolePanel';
import { SceneRecipes, SleepPanel, Diagnostics } from './SceneTools';
import RecordShelf from '../listen/RecordShelf';
import useLabs from '../product/useLabs';
import Postcard from './Postcard';
import RoomPickers from '../RoomPickers';
import { readLife, writeLife } from './life-state.mjs';
import { showNotice } from '../focus/focus-notice.mjs';
const LyricsStage = lazy(() => import('../lyrics/LyricsStage'));

export function HomeLyrics({ close }) {
  return <Suspense fallback={<Dialog title="歌词" close={close}><p>正在打开歌词册…</p></Dialog>}><LyricsStage close={close}/></Suspense>;
}
export function LifeReminder() {
  const { notify } = useCabinRuntime();
  // In front: a toast. In the background (window hidden, minimised or behind another app): a system
  // notification, so the reminder still reaches the user (focus-notice showNotice).
  useEffect(() => { const id = setInterval(() => { const value = readLife(); if (value.reminder && value.nextDrink > 0 && Date.now() >= value.nextDrink) { try { writeLife({ nextDrink: Date.now() + value.interval * 60000 }); if (document.hidden || !document.hasFocus()) showNotice({ title: '喝口水吧', body: '茶还温着，起来喝口水、舒展一下。', tag: 'cabin-water', actions: [] }); notify('茶还温着，起来喝口水吧。'); } catch {} } }, 30000); return () => clearInterval(id); }, [notify]);
  return null;
}
export default function HomePanels({ tool, close, filters, setFilters, visible, recordStyle, openAdd, openRecord, openWall, openSmart, onRoomChange }) {
  const { items, look, identity } = useCabinRuntime(), labs = useLabs();
  // 唱机旁 is the full console close-up (src/console/ConsolePanel.jsx), which draws its own dialog.
  if (tool === 'music') return <ConsolePanel close={close} openSmart={labs.smartTurntable ? openSmart : null}/>;
  const title = ({ postcard: '小屋明信片', recipes: '场景配方', sleep: '睡前模式', diagnostics: '功能诊断', library: '唱片架', weather: '窗外与天气', companions: '选择伙伴' })[tool];
  if (!title) return null;
  // The record shelf is a bookcase close-up that draws its own full-window dialog (src/listen/RecordShelf.jsx).
  if (tool === 'library') return <RecordShelf close={close} visible={visible} filters={filters} setFilters={setFilters} openAdd={openAdd} openRecord={openRecord} openWall={openWall} openSmart={openSmart}/>;
  return <Dialog title={title} close={close} className={`home-tool home-${tool}-dialog`} size="lg">
    {tool === 'postcard' && <Postcard/>}{tool === 'recipes' && <SceneRecipes/>}
    {tool === 'sleep' && <SleepPanel/>}
    {tool === 'diagnostics' && <Diagnostics/>}
    {tool === 'weather' && <SkySettings/>}
    {tool === 'companions' && <RoomPickers petsOnly look={look} petId={identity.builtinId} onChange={onRoomChange}/>}
  </Dialog>;
}
