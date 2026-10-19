// 小猫: level, fish, fur and accessories, opened by tapping the cat (its 「打扮」 chip) or from
// the 统计 tab. Lives with the cat instead of inside the stats table.
import React, { useEffect, useLayoutEffect, useState } from 'react';
import Dialog from '../Dialog';
import { useFocus } from './useFocus';
import { levelInfo, UNLOCKS, unlockedIds, unlockPrice } from './focus-model.mjs';
import { useCatCare, requestFeed } from '../cat/useCatCare';
import { FISH_DRAG_TYPE, FISH_DRAG_TEXT } from '../cat/cat-care.mjs';
import { FishPixel } from '../icons';
import { catPanelPlace, createCatPanelTracker } from './cat-panel-place.mjs';
import { readSkySettings, writeSkySettings } from '../sky-clock.mjs';
import { useRecordLibrary } from '../RecordLibrary';
import { normalizePetId, getPet } from '../pet/pet-catalog.mjs';
import { desktopCommand } from '../desktop/desktop-command.mjs';
import PixelCat from '../pet/PixelCat';
import Souvenirs, { useSouvenirs } from './Souvenirs.jsx';
import useInputStats from '../desktop/useInputStats';
import '../room/benchmark-cabin.css';

// While a 小鱼干 is dragged and the cat is out on the desktop, the shell lets the pet window take
// the drop (it normally lets clicks pass through everywhere but the cat's pixels).
const petOut = () => document.documentElement.dataset.desktopClient === 'true' && Boolean(window.albumPetState?.active);
const petDrag = (active) => { if (petOut()) desktopCommand('pet-drag', { active }); };
const displayCount = (value) => Math.max(0, Number(value) || 0).toLocaleString('zh-CN');
const weekday = (key) => ['日', '一', '二', '三', '四', '五', '六'][new Date(`${key}T00:00:00`).getDay()] || '';
const INPUT_STATUS = {
  active: '跨窗口陪伴中 · 只在这台电脑按天计数',
  pending: '正在启动跨窗口陪伴',
  'needs-permission': '等待 macOS 辅助功能授权',
  off: '全局统计已关闭 · 仍会响应小屋内的键鼠',
  unavailable: '这台电脑暂不支持全局检测 · 仅响应小屋内'
};

function InputCompanion({ stats, petName }) {
  if (!stats) return null;
  const week = Array.isArray(stats.week) ? stats.week.slice(-7) : [];
  const max = Math.max(1, ...week.map((day) => Math.max(0, Number(day.total) || 0)));
  const weekTotal = week.reduce((sum, day) => sum + Math.max(0, Number(day.total) || 0), 0);
  const streak = Math.max(0, Number(stats.streak) || 0);
  const allTime = Math.max(0, Number(stats.total?.total) || 0);
  const desktop = document.documentElement.dataset.desktopClient === 'true';
  const openSettings = () => window.dispatchEvent(new CustomEvent('cabin-open-settings', { detail: { section: 'companion' } }));
  return <section className="cat-input-companion" aria-label={`${petName}的键鼠陪伴统计`}>
    <header><strong>今天一起敲</strong><small>{INPUT_STATUS[stats.status] || INPUT_STATUS.off}</small></header>
    <div className="cat-input-tiles">
      <div><span>键盘</span><strong>{displayCount(stats.today.keyboard)}</strong><small>下</small></div>
      <div><span>点击</span><strong>{displayCount(stats.today.click)}</strong><small>下</small></div>
      <div><span>连续</span><strong>{displayCount(streak)}</strong><small>天</small></div>
    </div>
    <div className="cat-input-week" role="img" aria-label={`最近 7 天共 ${weekTotal} 次键鼠活动，蓝色是键盘，琥珀色是点击`}>
      {week.map((day) => <span className="cat-input-day" key={day.key} title={`${day.key} · 键盘 ${day.keyboard} 下 · 点击 ${day.click} 下`}>
        <span className="cat-input-stack">
          <i className="is-keyboard" style={{ height: `${day.keyboard / max * 100}%` }}/>
          <i className="is-click" style={{ height: `${day.click / max * 100}%` }}/>
        </span>
        <small>{weekday(day.key)}</small>
      </span>)}
    </div>
    {week.length === 7 && <p className="cat-input-total">最近 7 天 {displayCount(weekTotal)} 次 · 累计 {displayCount(allTime)} 次</p>}
    <p className="cat-input-privacy">只记录键盘按下和点击的次数，不记录按键内容、坐标或你正在用的程序。</p>
    {stats.status !== 'active' && desktop && <button type="button" className="inline-button" onClick={openSettings}>打开「设置 › 键鼠陪伴」→</button>}
  </section>;
}

function CatPanelBody({ close, souvenirs }) {
  const focus = useFocus(), { rewards } = focus.state, library = useRecordLibrary();
  const petId = normalizePetId(library?.data.rooms[library.roomId]?.petId), cat = petId === 'cat', pet = getPet(petId);
  const level = levelInfo(rewards.xp), unlocked = unlockedIds(rewards.xp, rewards.bought), mood = useCatCare(), [confirming, setConfirming] = useState('');
  const input = useInputStats();
  const full = mood.feedsToday >= mood.dailyFeeds;
  return <Dialog size="sm" title={cat ? '小猫' : pet.name} close={close} className="cat-panel">
    <div className="cat-portrait">
      <PixelCat petId={petId} skin={focus.state.settings.catSkin} accessory={rewards.equipped.accessory || ''} pose="idle" label={`${pet.name}的当前装扮`}/>
      <div><strong>{pet.name}</strong><p>你做你的事，我在这里陪你。<br/>偶尔摸摸头，就很好。</p><small>打字或点鼠标，我会跟着敲敲。</small></div>
    </div>
    <InputCompanion stats={input} petName={pet.name}/>
    <section className="focus-rewards" aria-label="小屋奖励">
      <header><strong>Lv.{level.level} 小屋主人</strong><span><FishPixel size={12}/>{rewards.fish} 小鱼干</span></header>
      <div className="focus-xp" role="progressbar" aria-label="升级进度" aria-valuemin={0} aria-valuemax={level.need} aria-valuenow={level.into}><span style={{ width: `${level.into / level.need * 100}%` }}/></div>
      <small>再专注 {level.need - level.into} 分钟升级。每完成一轮专注获得 1 条小鱼干。</small>
      <section className="cat-care" aria-label={`${cat ? '小猫' : pet.name}的心情`}>
        <header><strong>心情 · {mood.label}</strong><small>今天喂了 {mood.feedsToday} / {mood.dailyFeeds}</small></header>
        <div className={`cat-mood-bar is-${mood.tier}`} role="meter" aria-label="心情" aria-valuemin={0} aria-valuemax={100} aria-valuenow={mood.mood} aria-valuetext={mood.label}><span style={{ width: `${mood.mood}%` }}/></div>
        <div className="cat-care-actions">
          <button type="button" className="pixel-button is-primary" disabled={!rewards.fish || full} onClick={requestFeed} title={full ? '今天已经吃饱啦' : rewards.fish ? '喂一条小鱼干，也可以把小鱼干拖到小猫身上' : '完成一轮专注就能得到一条小鱼干'}><FishPixel size={12}/>喂一条</button>
          <span className="cat-fish-chip" draggable={rewards.fish > 0 && !full} aria-hidden="true" title="把小鱼干拖到小猫身上也能喂" onDragStart={(event) => { event.dataTransfer.setData(FISH_DRAG_TYPE, '1'); event.dataTransfer.setData('text/plain', FISH_DRAG_TEXT); event.dataTransfer.effectAllowed = 'move'; petDrag(true); }} onDragEnd={() => petDrag(false)}><FishPixel size={12}/>×{rewards.fish}</span>
        </div>
        <p className="cat-care-note" role="status">{mood.message || (full ? '小猫今天已经吃饱啦，明天再喂吧～' : mood.next ? `再喂 ${mood.next.feeds - mood.totalFeeds} 条，小猫会学会「${mood.next.name}」。` : '小猫已经学会了所有小动作。')}</p>
        {mood.actions.length > 0 && <small className="cat-care-learned">学会了：{mood.actions.map((a) => a.name).join('、')}</small>}
      </section>
      <div className="focus-unlocks">
        {cat && <fieldset><legend>小猫毛色 · 夜景柔光</legend>{[['orange', '橘猫'], ['black', '黑猫']].map(([skin, name]) => <button type="button" key={skin} aria-pressed={focus.state.settings.catSkin === skin} onClick={() => focus.settings({ catSkin: skin })}>{name}</button>)}</fieldset>}
        {['accessory', 'weather'].map((kind) => <fieldset key={kind}><legend>{kind === 'accessory' ? (cat ? '小猫配饰' : '伙伴配饰') : '窗外天气'}</legend>
          {kind === 'accessory' && <button type="button" aria-pressed={!rewards.equipped.accessory} onClick={() => focus.equip('accessory', '')}>不戴</button>}
          {UNLOCKS.filter((item) => item.kind === kind).map((item) => <button type="button" key={item.id} disabled={!unlocked.has(item.id) && rewards.fish < unlockPrice(item)} aria-pressed={rewards.equipped[kind] === item.id} title={unlocked.has(item.id) ? item.name : `Lv.${item.level} 解锁，或用 ${unlockPrice(item)} 条小鱼干提前兑换`} onClick={() => {
            if (!unlocked.has(item.id)) { if (confirming !== item.id) { setConfirming(item.id); return; } setConfirming(''); focus.buyUnlock(item.id); return; }
            focus.equip(kind, item.id); if (kind === 'weather' && readSkySettings().realWeather) writeSkySettings({ realWeather: false }); }}>{kind === 'accessory' && <PixelCat className="cat-accessory-preview" petId={petId} skin={focus.state.settings.catSkin} accessory={item.id} reduceMotion aria-hidden="true"/>}{!unlocked.has(item.id) && <span className="focus-lock" aria-hidden="true"/>}{item.name}{!unlocked.has(item.id) && <small> · {confirming === item.id ? `再点一次，用 ${unlockPrice(item)} 条兑换` : `Lv.${item.level} 或 ${unlockPrice(item)} 条`}</small>}</button>)}
        </fieldset>)}
      </div>
    </section>
    <Souvenirs {...souvenirs}/>
  </Dialog>;
}
// Card sits beside the cat (right of it, else left, else above/below), clamped to the window
// and never over the cat.
function placeNearCat() {
  const root = document.documentElement, rect = document.querySelector('.room-cat')?.getBoundingClientRect();
  if (!rect || !rect.width) { root.style.removeProperty('--cat-panel-x'); root.style.removeProperty('--cat-panel-y'); root.style.removeProperty('--cat-panel-max-h'); return; }
  const node = document.querySelector('.cabin-dialog.cat-panel'), w = node?.offsetWidth || Math.min(360, innerWidth - 24), h = node?.offsetHeight || 480;
  const { x, y, maxH } = catPanelPlace(rect, { w, h: node?.scrollHeight || h }, { w: innerWidth, h: innerHeight });
  root.style.setProperty('--cat-panel-x', `${Math.round(x)}px`); root.style.setProperty('--cat-panel-y', `${Math.round(y)}px`); root.style.setProperty('--cat-panel-max-h', `${Math.floor(maxH)}px`);
}
export default function CatPanel({ open, onClose }) {
  const souvenirs = useSouvenirs();
  useLayoutEffect(() => {
    document.querySelectorAll('.room-cat').forEach((node) => node.setAttribute('aria-expanded', String(open)));
    if (!open) return undefined;
    placeNearCat();
    // The cat glides to its new spot after a resize, so follow it every frame for a while.
    const { track, stop } = createCatPanelTracker(placeNearCat);
    const onResize = () => track();
    const settle = (event) => { if (event.target.closest?.('.room-cat')) track(120); };
    track(300);
    window.addEventListener('resize', onResize); document.addEventListener('transitionend', settle, true); document.addEventListener('animationend', settle, true);
    return () => { stop(); window.removeEventListener('resize', onResize); document.removeEventListener('transitionend', settle, true); document.removeEventListener('animationend', settle, true); };
  }, [open]);
  // The panel is modal, so the room (and the cat) is inert while it is open: catch a 小鱼干
  // dropped over the cat's box here instead of on the cat itself.
  useEffect(() => {
    if (!open) return undefined;
    const overCat = (event) => { const r = document.querySelector('.room-cat')?.getBoundingClientRect(); return !!r && event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom; };
    const isFish = (event) => [...(event.dataTransfer?.types || [])].includes(FISH_DRAG_TYPE);
    const mark = (on) => document.querySelectorAll('.room-cat').forEach((node) => node.classList.toggle('cat--drop-target', on));
    const over = (event) => { if (!isFish(event)) return; const hit = overCat(event); mark(hit); if (hit) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; } };
    const drop = (event) => { mark(false); if (!isFish(event) || !overCat(event)) return; event.preventDefault(); requestFeed(); };
    const end = () => mark(false);
    document.addEventListener('dragover', over); document.addEventListener('drop', drop); document.addEventListener('dragend', end);
    return () => { mark(false); document.removeEventListener('dragover', over); document.removeEventListener('drop', drop); document.removeEventListener('dragend', end); };
  }, [open]);
  return open ? <CatPanelBody souvenirs={souvenirs} close={onClose}/> : null;
}
