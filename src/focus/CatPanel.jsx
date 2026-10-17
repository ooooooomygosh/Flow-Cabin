// 小猫: level, fish, fur and accessories, opened by tapping the cat (its 「打扮」 chip) or from
// the 统计 tab. Lives with the cat instead of inside the stats table.
import React, { useEffect, useState } from 'react';
import Dialog from '../Dialog';
import { useFocus } from './useFocus';
import { levelInfo, UNLOCKS, unlockedIds } from './focus-model.mjs';
import { FishPixel } from '../icons';
import { catPanelPlace, createCatPanelTracker } from './cat-panel-place.mjs';
import { readSkySettings, writeSkySettings } from '../sky-clock.mjs';
import { useRecordLibrary } from '../RecordLibrary';
import { normalizePetId, getPet } from '../pet/pet-catalog.mjs';

export const CAT_PANEL_EVENT = 'cabin-open-cat';
function CatPanelBody({ close }) {
  const focus = useFocus(), { rewards } = focus.state, library = useRecordLibrary();
  const petId = normalizePetId(library?.data.rooms[library.roomId]?.petId), cat = petId === 'cat', pet = getPet(petId);
  const level = levelInfo(rewards.xp), unlocked = unlockedIds(rewards.xp);
  return <Dialog size="sm" title={cat ? '小猫' : pet.name} close={close} className="cat-panel">
    <section className="focus-rewards" aria-label="小屋奖励">
      <header><strong>Lv.{level.level} 小屋主人</strong><span><FishPixel size={12}/>{rewards.fish} 小鱼干</span></header>
      <div className="focus-xp" role="progressbar" aria-label="升级进度" aria-valuemin={0} aria-valuemax={level.need} aria-valuenow={level.into}><span style={{ width: `${level.into / level.need * 100}%` }}/></div>
      <small>再专注 {level.need - level.into} 分钟升级。每完成一轮专注获得 1 条小鱼干。</small>
      <div className="focus-unlocks">
        {cat && <fieldset><legend>小猫毛色 · 夜景柔光</legend>{[['orange', '橘猫'], ['black', '黑猫']].map(([skin, name]) => <button type="button" key={skin} aria-pressed={focus.state.settings.catSkin === skin} onClick={() => focus.settings({ catSkin: skin })}>{name}</button>)}</fieldset>}
        {['accessory', 'weather'].map((kind) => <fieldset key={kind}><legend>{kind === 'accessory' ? (cat ? '小猫配饰' : '伙伴配饰') : '窗外天气'}</legend>
          {kind === 'accessory' && <button type="button" aria-pressed={!rewards.equipped.accessory} onClick={() => focus.equip('accessory', '')}>不戴</button>}
          {UNLOCKS.filter((item) => item.kind === kind).map((item) => <button type="button" key={item.id} disabled={!unlocked.has(item.id)} aria-pressed={rewards.equipped[kind] === item.id} title={unlocked.has(item.id) ? item.name : `Lv.${item.level} 解锁`} onClick={() => { focus.equip(kind, item.id); if (kind === 'weather' && readSkySettings().realWeather) writeSkySettings({ realWeather: false }); }}>{!unlocked.has(item.id) && <span className="focus-lock" aria-hidden="true"/>}{item.name}{!unlocked.has(item.id) && <small> · Lv.{item.level}</small>}</button>)}
        </fieldset>)}
      </div>
    </section>
  </Dialog>;
}
// Card sits beside the cat (right of it, else left, else above/below), clamped to the window
// and never over the cat.
function placeNearCat() {
  const root = document.documentElement, rect = document.querySelector('.room-cat')?.getBoundingClientRect();
  if (!rect || !rect.width) { root.style.removeProperty('--cat-panel-x'); root.style.removeProperty('--cat-panel-y'); return; }
  const node = document.querySelector('.cabin-dialog.cat-panel'), w = node?.offsetWidth || Math.min(360, innerWidth - 24), h = node?.offsetHeight || 480;
  const { x, y } = catPanelPlace(rect, { w, h }, { w: innerWidth, h: innerHeight });
  root.style.setProperty('--cat-panel-x', `${Math.round(x)}px`); root.style.setProperty('--cat-panel-y', `${Math.round(y)}px`);
}
export default function CatPanel() {
  const [open, setOpen] = useState(false);
  useEffect(() => { const show = () => { placeNearCat(); setOpen(true); }; window.addEventListener(CAT_PANEL_EVENT, show); return () => window.removeEventListener(CAT_PANEL_EVENT, show); }, []);
  useEffect(() => {
    document.querySelectorAll('.room-cat').forEach((node) => node.setAttribute('aria-expanded', String(open)));
    if (!open) return undefined;
    // The cat glides to its new spot after a resize, so follow it every frame for a while.
    const { track, stop } = createCatPanelTracker(placeNearCat);
    const onResize = () => track();
    const settle = (event) => { if (event.target.closest?.('.room-cat')) track(120); };
    track(300);
    window.addEventListener('resize', onResize); document.addEventListener('transitionend', settle, true); document.addEventListener('animationend', settle, true);
    return () => { stop(); window.removeEventListener('resize', onResize); document.removeEventListener('transitionend', settle, true); document.removeEventListener('animationend', settle, true); };
  }, [open]);
  return open ? <CatPanelBody close={() => setOpen(false)}/> : null;
}
