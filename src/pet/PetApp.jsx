import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import PixelCat, { opaqueAt } from './PixelCat';
import { useCatBehaviour } from './RoomCat';
import PetLife from './PetLife';
import '../styles/tokens.css';
import './pet.css';
import { normalizePetId, getPet } from './pet-catalog.mjs';
import { subscribePetSnapshot } from './pet-snapshot.mjs';
import { ACTION_MS, activeInputPose, CLICK_POSE, EAT_POSE, HOP_POSE, petRequest, moodPose } from './pet-model.mjs';
import { FISH_DRAG_TYPE } from '../cat/cat-care.mjs';

// Double-click (two clicks within this many ms, no drag): the cat hops (docs/entry-map.md).
export const DOUBLE_CLICK_MS = 350;
const ACCESSORIES = Object.freeze([
  { id: '', label: '不戴', level: 0 },
  { id: 'bow', label: '领结', level: 1 },
  { id: 'headphones', label: '耳机', level: 2 },
  { id: 'scarf', label: '围巾', level: 3 },
  { id: 'beanie', label: '毛线帽', level: 4 },
  { id: 'sprout', label: '小芽', level: 3 }
]);
const MOOD = { happy: '开心', ok: '还不错', droopy: '无精打采', sleepy: '有点困' };
// How the pet asks for something now and then (pet-model petRequest), checked every few minutes.
const REQUEST_CHECK_MS = 5 * 60000, REQUEST_SHOW_MS = 8000;
const PHASE_WORD = { focus: '专注', shortBreak: '休息', longBreak: '休息' };
const COUNT = new Intl.NumberFormat('zh-CN');
const count = (value) => COUNT.format(Math.max(0, Math.round(Number(value) || 0)));
const clock = (ms) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

// The focus countdown ticks on its own: the pet window must not re-render once
// a second just to move a clock. It is the only thing in the panel that needs
// a live second, so it owns the timer instead of the whole app.
function FocusCountdown({ phase, paused, endsAt, remaining, due, over }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!phase || phase === 'idle') return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [phase, paused, endsAt]);
  if (!phase || phase === 'idle') return <>还没有开始的专注</>;
  // 到点后继续计时: count the extra time up.
  if (due) return <>{paused ? '暂停中' : '专注超时'} · +{clock(paused ? Number(over) || 0 : Math.max(0, now - Number(endsAt)))}</>;
  const left = paused ? Number(remaining) || 0 : Math.max(0, Number(endsAt) - now);
  return <>{`${paused ? `${PHASE_WORD[phase]}暂停` : phase === 'focus' ? '专注中' : '休息中'} · ${clock(left)}`}</>;
}

// The desktop pet: a transparent always-on-top window. Clicks pass through
// everywhere except the painted cat pixels and the speech bubble.
function PetApp() {
  const api = window.albumPet, [snapshot, setSnapshot] = useState(null), [inputStats, setInputStats] = useState(null), [size, setSize] = useState(192), [motion, setMotion] = useState({ mode: 'idle', facing: 1 });
  // Behaviour switches from the shell (pet.json): bubbles, a locked position, always click-through.
  const [prefs, setPrefs] = useState({ bubbles: true, locked: false, clickThrough: false });
  const petId = normalizePetId(snapshot?.petId || snapshot?.focus?.petId);
  const cat = useCatBehaviour({ petId, focus: snapshot?.focus || {}, playing: Boolean(snapshot?.playing), track: snapshot?.track || '', lastActivity: 0, reduceMotion: Boolean(snapshot?.reduceMotion), bubbles: prefs.bubbles !== false });
  // 摸摸 counts for the pet's mood in the cabin (the care host lives in the main page).
  const pet = () => { cat.poke(); api?.command('cat-pet'); };
  const packAlpha=useRef(null);
  const box = useRef(null), frame = useRef(0), hit = useRef(false), drag = useRef(null), [dragging, setDragging] = useState(false);
  // A one-shot action over the usual pose: eat (fed from the menu, a dropped 小鱼干 or the cabin) or hop.
  const [hookTypingAt, setHookTypingAt] = useState(0), [hookClickAt, setHookClickAt] = useState(0), [action, setAction] = useState(null), [note, setNote] = useState(null), lastClick = useRef(-Infinity), mounted = useRef(Date.now()), seenFeed = useRef(0);
  const [panelOpen, setPanelOpenState] = useState(false), panelOpenRef = useRef(false), clickTimer = useRef(0);
  const setPanelOpen = (value) => {
    const next = Boolean(value);
    if (panelOpenRef.current === next) return;
    panelOpenRef.current = next; setPanelOpenState(next); api?.panel?.(next);
  };
  const play = (pose) => { const at = performance.now(); setAction({ pose, at }); };
  useEffect(() => { if (!action) return undefined; const timer = setTimeout(() => setAction((now) => now === action ? null : now), ACTION_MS[action.pose] || 800); return () => clearTimeout(timer); }, [action]);
  useEffect(() => { if (!note) return undefined; const timer = setTimeout(() => setNote(null), note.ms || 2600); return () => clearTimeout(timer); }, [note]);
  useEffect(() => () => clearTimeout(clickTimer.current), []);
  const care = snapshot?.care;
  useEffect(() => {
    if (!care?.fedAt || care.fedAt === seenFeed.current) return;
    const fresh = seenFeed.current !== 0 || care.fedAt > mounted.current; seenFeed.current = care.fedAt;
    if (!fresh) return;
    if (care.ok) play(EAT_POSE); else if (care.note) setNote({ text: care.note, ms: 2600 });
  }, [care?.fedAt, care?.ok, care?.note]);
  useEffect(() => subscribePetSnapshot(api, (value) => {
    if (value.companion) setSnapshot(value.companion);
    if ('input' in value) setInputStats(value.input || null);
    if (Number.isFinite(value.size) && value.size > 0) setSize(value.size);
    if (Number.isFinite(value.typingAt)) setHookTypingAt(value.typingAt);
    if (Number.isFinite(value.clickAt)) setHookClickAt(value.clickAt);
    if (value.motion && typeof value.motion.mode === 'string') setMotion({ mode: value.motion.mode, facing: value.motion.facing < 0 ? -1 : 1 });
    if (value.prefs && typeof value.prefs === 'object') setPrefs({ bubbles: value.prefs.bubbles !== false, locked: value.prefs.locked === true, clickThrough: value.prefs.clickThrough === true });
  }), [api]);
  // Now and then the pet asks for a fish or a pat — never in 免打扰, with bubbles off or during a round.
  const careRef = useRef(null); careRef.current = { care: snapshot?.care, focus: snapshot?.focus, bubbles: prefs.bubbles };
  useEffect(() => {
    let lastAt = Date.now();
    const check = () => {
      const { care: c, focus: f, bubbles } = careRef.current || {};
      if (!bubbles) return;
      const ask = petRequest({ now: Date.now(), lastAt, tier: c?.tier || 'ok', feedsToday: Number(c?.feedsToday) || 0, fish: Number(f?.fish) || 0, quiet: Boolean(f?.quietMode), phase: f?.phase || 'idle', hour: new Date().getHours() });
      if (ask) { lastAt = Date.now(); setNote({ text: ask.text, ms: REQUEST_SHOW_MS }); }
    };
    const timer = setInterval(check, REQUEST_CHECK_MS);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => { document.documentElement.style.setProperty('--pet-size', size + 'px'); }, [size]);
  // The shell moves the window when the pet falls or strolls along the screen.
  const travelling = motion.mode === 'walk', airborne = motion.mode === 'fall';
  // 键鼠跟随: the shell hook (global, after permission) and the cabin fallback
  // share one resolver. Keyboard taps at the desk; a click taps the little mouse.
  const typingAt = Math.max(hookTypingAt, Number(snapshot?.typingAt) || 0), clickAt = Math.max(hookClickAt, Number(snapshot?.clickAt) || 0);
  const input = activeInputPose({ typingAt, clickAt, now: Date.now() });
  const until = input.until, [, setTick] = useState(0), typing = input.pose === 'typing', clicking = input.pose === CLICK_POSE;
  useEffect(() => { const left = until - Date.now(); if (left <= 0) return undefined; const timer = setTimeout(() => setTick((n) => n + 1), left + 20); return () => clearTimeout(timer); }, [until]);
  // Reduced motion still shows the action, as a held frame (PixelCat does not animate then).
  // The mood shows in the body: a droopy pet dozes between moments (pet-model moodPose).
  const acting = action ? action.pose : '', pose = acting || (travelling ? 'walk' : input.pose || moodPose(cat.pose, care?.tier, cat.now)), accessory = snapshot?.focus?.accessory || '';
  const overCat = (event) => {
    const rect = box.current?.getBoundingClientRect(); if (!rect) return false;
    const canvas=box.current?.querySelector('.pixel-cat'), bounds=canvas?.getBoundingClientRect() || rect;
    const rawX=(event.clientX-bounds.left)/bounds.width,rx=(travelling || airborne) && motion.facing<0?1-rawX:rawX,ry=(event.clientY-bounds.top)/bounds.height;
    if(packAlpha.current){if(rx<0 || ry<0 || rx>=1 || ry>=1)return false;const image=packAlpha.current;return image.data[(Math.floor(ry*image.height)*image.width+Math.floor(rx*image.width))*4+3]>0;}
    return opaqueAt(pose, frame.current, accessory, rx, ry, petId);
  };
  useEffect(() => {
    const move = (event) => {
      if (drag.current) return;
      // Only the painted pet and its open card take the pointer; the bubble lets clicks through to
      // the app underneath, and 始终鼠标穿透 lets everything through.
      const next = !prefs.clickThrough && (overCat(event) || Boolean(event.target.closest?.('.pet-panel')));
      if (next !== hit.current) { hit.current = next; api?.setHit(next); }
    };
    const leave = () => { if (hit.current && !drag.current) { hit.current = false; api?.setHit(false); } };
    document.addEventListener('pointermove', move); document.addEventListener('pointerleave', leave);
    // Init race (bini): until the first forwarded mousemove the window ignores clicks, so a pointer already
    // resting on the cat could not double-click. Ask the shell where the pointer is and hit-test once.
    if (!hit.current) Promise.resolve(api?.cursor?.()).then((p) => { if (p && Number.isFinite(p.x) && Number.isFinite(p.y) && !hit.current && overCat({ clientX: p.x, clientY: p.y })) { hit.current = true; api?.setHit(true); } }).catch(() => {});
    return () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerleave', leave); };
  }, [pose, accessory, petId, prefs.clickThrough]);
  const down = (event) => {
    if (event.button !== 0 || !overCat(event)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.screenX, y: event.screenY, moved: 0 };
  };
  const moveDrag = (event) => {
    const current = drag.current; if (!current) return;
    const dx = event.screenX - current.x, dy = event.screenY - current.y; if (!dx && !dy) return;
    current.x = event.screenX; current.y = event.screenY; current.moved += Math.abs(dx) + Math.abs(dy);
    // 锁定位置: clicks and the menu still work, the pet does not move.
    if (current.moved > 3 && !prefs.locked) { if (!dragging) setDragging(true); queueMove(dx, dy); }
  };
  // One `pet:move` IPC per frame, not per pointermove (120 Hz+ mice sent 2–4 per frame).
  const pending = useRef({ dx: 0, dy: 0, frame: 0 });
  const flushMove = () => { const p = pending.current; cancelAnimationFrame(p.frame); p.frame = 0; if (p.dx || p.dy) api?.moveBy(p.dx, p.dy); p.dx = p.dy = 0; };
  const queueMove = (dx, dy) => { const p = pending.current; p.dx += dx; p.dy += dy; if (!p.frame) p.frame = requestAnimationFrame(flushMove); };
  useEffect(() => () => cancelAnimationFrame(pending.current.frame), []);
  const up = (event) => {
    const current = drag.current; drag.current = null; setDragging(false);
    if (!current) return;
    flushMove(); // the last step lands before dragEnd settles the window
    if (current.moved > 3) { clearTimeout(clickTimer.current); clickTimer.current = 0; if (!prefs.locked) api?.dragEnd(); return; }
    if (event.type !== 'pointerup') return;
    const time = performance.now();
    if (time - lastClick.current < DOUBLE_CLICK_MS) {
      clearTimeout(clickTimer.current); clickTimer.current = 0; lastClick.current = 0; play(HOP_POSE);
    } else {
      lastClick.current = time; pet();
      // Wait out the double-click window: a second click hops opens the cabin,
      // while a single click only toggles the compact companion card.
      clearTimeout(clickTimer.current);
      clickTimer.current = setTimeout(() => { clickTimer.current = 0; setPanelOpen(!panelOpenRef.current); }, DOUBLE_CLICK_MS + 20);
    }
  };
  // A 小鱼干 dragged from the cabin's cat panel and dropped on the pet feeds it (the shell lets this
  // window take drops only while that drag lasts).
  const isFish = (event) => [...(event.dataTransfer?.types || [])].includes(FISH_DRAG_TYPE);
  const [dropping, setDropping] = useState(false);
  const dragOver = (event) => { if (!isFish(event)) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; if (!dropping) setDropping(true); };
  const dropFish = (event) => { setDropping(false); if (!isFish(event)) return; event.preventDefault(); api?.command('cat-feed'); };
  const bubble = note?.text || cat.bubble;
  const focus = snapshot?.focus || {};
  // The panel's focus button names what it does in this phase (a break is not 专注).
  const phase = focus.phase || 'idle', active = phase !== 'idle', running = active && !focus.paused;
  const focusButton = !active ? ['开始专注', 'focus-start'] : running ? [phase === 'focus' ? '暂停专注' : '暂停休息', 'focus-pause'] : [phase === 'focus' ? '继续专注' : '继续休息', 'focus-start'];
  const week = Array.isArray(inputStats?.week) ? inputStats.week.slice(-7) : [], weekPeak = Math.max(1, ...week.map((day) => Math.max(0, Number(day.total) || 0)));
  const mood = MOOD[care?.tier || 'ok'] || '还不错';
  const level = Math.max(1, Number(focus.level) || 1), fish = Math.max(0, Number(focus.fish) || 0);
  const unlockedAccessories = new Set(Array.isArray(focus.unlockedAccessories) ? focus.unlockedAccessories : []);
  const accessoryChoices = ACCESSORIES.filter((item) => !item.id || unlockedAccessories.has(item.id));
  return <div className={`pet-stage ${dropping ? 'is-drop-target' : ''} ${panelOpen ? 'has-panel' : ''}`} data-mood={care?.tier || 'ok'} data-reduce-motion={cat.reduced} data-action={acting || undefined} data-typing={typing || undefined} data-clicking={clicking || undefined} onDragOver={dragOver} onDragLeave={() => setDropping(false)} onDrop={dropFish} onContextMenu={(event) => { event.preventDefault(); api?.menu(); }}>
    {bubble && <div className="pet-bubble" role="status">{bubble}</div>}
    {panelOpen && <aside className="pet-panel" role="dialog" aria-label={`${getPet(petId).name}的陪伴面板`}>
      <header className="pet-panel-head">
        <span><i className={`pet-panel-mood is-${care?.tier || 'ok'}`} aria-hidden="true"/><strong>{getPet(petId).name}</strong><small>Lv.{level} · {mood}</small></span>
        <button type="button" aria-label="收起陪伴面板" onClick={() => setPanelOpen(false)}>×</button>
      </header>
      <div className="pet-panel-counts" aria-label="键鼠陪伴统计">
        <div><span>键盘</span><strong>{count(inputStats?.today?.keyboard)}</strong><small>今天</small></div>
        <div><span>点击</span><strong>{count(inputStats?.today?.click)}</strong><small>今天</small></div>
        <div><span>连续</span><strong>{count(inputStats?.streak)}</strong><small>天</small></div>
      </div>
      <div className="pet-panel-week" role="img" aria-label={`最近 7 天共 ${count(inputStats?.total?.total)} 次键鼠活动`}>
        {week.map((day) => <span key={day.key} title={`${day.key} · 键盘 ${count(day.keyboard)} · 点击 ${count(day.click)}`}>
          <i style={{ height: `${Math.max(2, Math.round((Number(day.keyboard) || 0) / weekPeak * 22))}px` }}/><b style={{ height: `${Math.max(0, Math.round((Number(day.click) || 0) / weekPeak * 22))}px` }}/>
        </span>)}
        {!week.length && <small>下一次敲键，这里会长出小柱子。</small>}
      </div>
      <div className="pet-panel-focus">
        <span><FocusCountdown phase={focus.phase} paused={focus.paused} endsAt={focus.endsAt} remaining={focus.remaining} due={focus.due} over={focus.over}/></span>
        <b title={`${fish} 条小鱼干`}>鱼干 {count(fish)}</b>
      </div>
      {focus.task && <p className="pet-panel-task" title={focus.task}>当前任务：{focus.task}</p>}
      <div className="pet-panel-actions">
        <button type="button" aria-label="喂一条小鱼干" disabled={fish < 1} onClick={() => api?.command('cat-feed')}>喂一条</button>
        <button type="button" aria-label={focusButton[0]} onClick={() => api?.command(focusButton[1])}>{focusButton[0]}</button>
        {active && <button type="button" aria-label="延长 5 分钟" onClick={() => api?.command('focus-extend')}>+5 分钟</button>}
        <button type="button" aria-label="开关小屋声音" onClick={() => api?.command('sound-toggle')}>小屋声音</button>
        <button type="button" aria-label="打开心流小屋" onClick={() => api?.open()}>打开小屋</button>
        <button type="button" aria-label="变成专注时钟画面" onClick={() => api?.focusDisplay()}>专注画面</button>
        <button type="button" aria-label="打开设置" onClick={() => api?.command('open-settings')}>设置</button>
      </div>
      <div className="pet-panel-accessories" role="group" aria-label="换一个配饰">
        {accessoryChoices.map((item) => <button type="button" key={item.id || 'none'} aria-label={item.id ? `戴${item.label}` : '不戴配饰'} aria-pressed={accessory === item.id} title={item.level ? `Lv.${item.level} 已解锁` : item.label} onClick={() => api?.equipAccessory(item.id)}>{item.label}</button>)}
      </div>
      <div className="pet-panel-foot">
        <span role="group" aria-label="桌宠大小">{[['S', '小'], ['M', '中'], ['L', '大']].map(([key, label]) => <button type="button" key={key} aria-label={`桌宠${label}`} aria-pressed={size === { S: 128, M: 192, L: 256 }[key]} onClick={() => api?.resize(key)}>{key}</button>)}</span>
        <small title="不记录按键内容、坐标或应用名">只记次数</small>
      </div>
    </aside>}
    <div ref={box} style={{ transform: `translateX(${dragging || travelling || airborne || panelOpen ? 0 : cat.x}px) scaleX(${travelling || airborne ? motion.facing : 1})` }} className={`pet-cat ${dragging ? 'is-dragging' : ''} ${airborne ? 'is-falling' : ''} ${motion.mode === 'land' ? 'is-landing' : ''}`} role="button" tabIndex={0} aria-expanded={panelOpen} aria-label={`摸摸${getPet(petId).species}${getPet(petId).name}，单击打开陪伴面板，双击打开小屋`} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); pet(); setPanelOpen(!panelOpenRef.current); } }} onPointerDown={down} onPointerMove={moveDrag} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up} onDoubleClick={(event) => { if (overCat(event)) api?.open(); }}>
      <PetLife pose={dragging || airborne ? 'drag' : pose} musicBeat={Boolean(snapshot?.playing) && cat.synced && !snapshot?.focus?.quietMode} pokedAt={cat.pokedAt} reduced={cat.reduced}><PixelCat petId={petId} musicBeat={Boolean(snapshot?.playing) && cat.synced && !snapshot?.focus?.quietMode} packOverride={snapshot?.petPack || null} onAlpha={image=>{packAlpha.current=image;}} pose={dragging || airborne ? 'dragged' : motion.mode === 'land' ? 'land' : pose} origin={acting ? action.at : 0} accessory={accessory} skin={snapshot?.focus?.catSkin} reduceMotion={cat.reduced} onFrame={(index) => { frame.current = index; }}/></PetLife>
    </div>
  </div>;
}
createRoot(document.getElementById('root')).render(<PetApp/>);
