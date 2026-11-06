import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useCabinRuntime } from '../runtime/CabinRuntime';
import { useFocus } from '../focus/useFocus';
import useLabs from '../product/useLabs';
import useBackLayer from '../ui/useBackLayer';
import { playSfx } from '../props/sfx.mjs';
import { drawerEase, lookEase, readPace, PACES } from '../props/motion.mjs';
import { currentCabinPlayback, onCabinPlayback } from '../scene/playback-listener.mjs';
import { deskLayout, viewLayout, filmStep, clockFace, PLATES, letterLayout, putAwayFrames, slotPoint, boxCards, PUT_AWAY } from './layout.mjs';
import { EDGE, VIEWS, CLOCK_KEYS, drawerItems, drawerPlaces, deskKey, autoMode } from './desk-model.mjs';
import { deskImage, deskUrl, whenDeskImages, FIRST, VIEW_IMAGES } from './images.mjs';
import ClockFace from './ClockFace';
import RecordDesk from './RecordDesk';
import ShelfView from './ShelfView';
import usePost, { announceDeskLit } from './usePost';
import { BoxCard, LyingLetter } from './PostLetters';
import { listPackets, onPackets, unfoldPacket } from './packets.mjs';
import { slotXY } from './sheet-corner.mjs';
import { DRAWER, PET_WINDOW } from './desk-model.mjs';
import useDeskLamp from './useDeskLamp';
import { VIEW_BODY } from './views';
import { consoleLayout } from './views/console-model.mjs';
import { DesktopControls } from '../desktop-client';
import './desk.css';

// The home: DEsk's desk (https://github.com/fyzugx/DEsk, MIT, (c) 2026 The DEsk authors), seen from
// above. At its back edge the corner of the Control Panel (唱机), the red LED clock (专注), the post box
// (信箱) and, on the wall, the brass plate to the bookcase (唱片架); at its front the drawer. Everything
// is a picture DEsk rendered, laid where DEsk lays it (src/desk/layout.mjs), with a real button over it.
// Looking up at the bookcase, the Control Panel or the post box plays DEsk's film of that move.
// The post box holds the app's letters (src/desk/post.mjs): a letter in the slot while one is unread;
// in the box they stand one behind the other, and the one in front, taken out, lies on the desk.
// The Control Panel is the record player's console (views/ConsoleView.jsx); commands.open('music') and the
// `cabin:desk-look` event ({ which }) look up at it from anywhere.
const LOOK_DUR = { shelf: 0.80, console: 0.84, post: 0.86 };
const typing = (target) => target?.closest?.('input,textarea,select,[contenteditable="true"],[contenteditable=""],[role=slider]');
const pace = () => PACES[readPace()] || 1;

// The desk's own box: the window, less the system bars on Android (desk.css insets it by the safe areas).
function useDeskSize(ref) {
  const [size, setSize] = useState(() => ({ width: innerWidth, height: innerHeight }));
  useLayoutEffect(() => {
    const node = ref.current;
    const update = () => setSize((old) => { const width = node?.clientWidth || innerWidth, height = node?.clientHeight || innerHeight; return old.width === width && old.height === height ? old : { width, height }; });
    update(); addEventListener('resize', update);
    const observer = typeof ResizeObserver === 'function' && node ? new ResizeObserver(update) : null; observer?.observe(node);
    return () => { removeEventListener('resize', update); observer?.disconnect(); };
  }, []);
  return size;
}

// A tick of `ms` while `on`.
function useTick(on, ms) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { if (!on) return undefined; const id = setInterval(() => { if (!document.hidden) setNow(Date.now()); }, ms); return () => clearInterval(id); }, [on, ms]);
  return now;
}

function usePlaybackClock() {
  const [p, setP] = useState(() => currentCabinPlayback());
  useEffect(() => onCabinPlayback((next) => setP({ ...next })), []);
  return p;
}

// The post box from in front: letters standing in it, or DEsk's 没有信件.
const postView = (which, count) => which === 'post' ? (count ? 'view-post-box.webp' : 'view-post-empty.webp') : `view-${which}.webp`;

export default function DeskHome({ reduced = false, focusOpen = false, shelf = null }) {
  const { deck, commands, identity, notify, sceneCapture } = useCabinRuntime(), focus = useFocus(), labs = useLabs();
  const petPhoto = identity?.builtinId ? `/pet-art/v21/${identity.builtinId}/avatar-256.png` : '';
  const homeRef = useRef(null), { width, height } = useDeskSize(homeRef), lay = useMemo(() => deskLayout(width, height), [width, height]);
  const [ready, setReady] = useState(false), [drawer, setDrawer] = useState(false), [hot, setHot] = useState('');
  const [mode, setMode] = useState(''), [keysUp, setKeysUp] = useState(false);
  const [look, setLook] = useState(null); // { which, phase: 'up' | 'there' | 'down' }
  const deskRef = useRef(null), film = useRef(null), raf = useRef(0);
  const now = useTick(true, 1000), playback = usePlaybackClock(), lamp = useDeskLamp();
  const post = usePost(), letters = post.letters, unread = post.unread;
  const [front, setFront] = useState(0), [lying, setLying] = useState(null), taking = useRef(null), lyingRef = useRef(null);
  const [packets, setPackets] = useState(listPackets);
  useEffect(() => onPackets((list) => setPackets([...list])), []);

  // The lamp comes up as the room is made: dark until the first pictures are in (at least a moment).
  useEffect(() => {
    let alive = true; const started = performance.now();
    whenDeskImages(FIRST).then(() => { const wait = reduced ? 0 : Math.max(0, 1200 - (performance.now() - started)); setTimeout(() => alive && setReady(true), wait); });
    return () => { alive = false; };
  }, []);
  useEffect(() => { if (ready) announceDeskLit(); }, [ready]);
  // A letter through the slot: DEsk's brass flap and the paper dropping in.
  const seen = useRef(unread);
  useEffect(() => { if (unread > seen.current && ready) playSfx('letter-arrive'); seen.current = unread; }, [unread, ready]);

  // The picture 小屋明信片 prints (sceneCapture, src/home/Postcard.jsx): the desk as DEsk lays it at 1440x900, in 1200x800.
  useEffect(() => sceneCapture?.register(async () => {
    await whenDeskImages(FIRST);
    const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 800;
    const g = canvas.getContext('2d'), at = deskLayout(PLATES.w, PLATES.h), s = 800 / PLATES.h, ox = (1200 - PLATES.w * s) / 2;
    g.fillStyle = '#2a1a10'; g.fillRect(0, 0, 1200, 800);
    const draw = (name, r) => { const image = r && deskImage(name); if (image) g.drawImage(image, ox + r.x * s, r.y * s, r.w * s, r.h * s); };
    draw('desk-wood.webp', { x: 0, y: 0, w: PLATES.w, h: PLATES.h });
    draw('edge-console.webp', at.console); draw('edge-clock.webp', at.clock); draw('edge-post.webp', at.post);
    draw('plate-console.webp', at.consolePlate); draw('plate-shelf.webp', at.shelfPlate); draw(unread ? 'post-letter.webp' : 'post0.webp', at.postBox);
    return canvas;
  }), [sceneCapture, unread]);

  // ----- the clock -----
  const timer = focus?.state.timer, playing = Boolean(deck.audible);
  const shown = mode || autoMode({ focusPhase: timer?.phase, playing });
  const face = clockFace(shown, {
    now: new Date(now),
    focus: timer && { phase: timer.phase, paused: Boolean(timer.paused), remaining: focus.remaining, rounds: focus.state.stats?.todayRounds ?? 0, progress: timer.duration ? 1 - focus.remaining / timer.duration : null },
    music: { playing, position: playback.position || 0, track: (deck.shownTrackIndex ?? 0) + 1, progress: playback.duration ? (playback.position || 0) / playback.duration : null },
  });
  const clockLabel = shown === 'focus' && timer?.phase !== 'idle'
    ? `专注 · ${timer?.phase === 'focus' ? '专注中' : '休息中'}${timer?.paused ? '（暂停）' : ''} · 还剩 ${face.digits.slice(0, 2)}:${face.digits.slice(2, 4)} · 打开专注`
    : `专注 · 现在 ${String(new Date(now).getHours()).padStart(2, '0')}:${String(new Date(now).getMinutes()).padStart(2, '0')} · 开始一段专注`;

  // ----- the drawer -----
  const things = drawerItems(labs), places = drawerPlaces(things.length, lay.drawer.span);
  const [slide, setSlide] = useState(0); // 0 shut .. 1 out, on DEsk's drawer spring
  const slideRef = useRef(0);
  useEffect(() => {
    const from = slideRef.current, to = drawer ? 1 : 0;
    if (from === to) return undefined;
    playSfx(drawer ? 'drawer-out' : 'drawer-in');
    if (reduced) { slideRef.current = to; setSlide(to); return undefined; }
    const dur = 0.54 * Math.max(Math.abs(to - from), 0.28) * pace() * 1000, start = performance.now();
    let id = 0;
    const step = () => {
      const u = Math.min(1, (performance.now() - start) / dur), t = from + (to - from) * drawerEase(u);
      slideRef.current = t; setSlide(t);
      if (u < 1) id = requestAnimationFrame(step); else { slideRef.current = to; setSlide(to); playSfx(drawer ? 'drawer-stop-out' : 'drawer-stop-in'); }
    };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [drawer]);
  useBackLayer(drawer && !look, () => setDrawer(false), 'drawer');
  const lift = lay.drawer.h * Math.max(-0.06, Math.min(1.06, slide));

  // ----- looking up, and back down -----
  const lookTo = useCallback((which) => {
    if (look) return;
    setDrawer(false);
    if (lying) return;
    playSfx(which === 'post' ? 'post-open' : 'binder-lift');
    if (which === 'post') setFront(0);
    whenDeskImages(VIEW_IMAGES[which]).then(() => setLook({ which, phase: reduced ? 'there' : 'up' }));
  }, [look, reduced, lying]);
  const lookBack = useCallback(() => {
    if (!look || look.phase === 'down') return;
    if (look.which === 'post') playSfx('post-close');
    setLook((l) => l && ({ ...l, phase: reduced ? 'gone' : 'down' }));
  }, [look, reduced]);
  useBackLayer(Boolean(look), lookBack, 'look');
  // Asked from elsewhere (放一张唱片, 打开唱片架…): look up at the bookcase, or straight across to it.
  useEffect(() => {
    const ask = (event) => {
      const which = typeof event.detail === 'string' ? event.detail : event.detail?.which;
      if (!VIEWS[which]) return;
      if (!look || look.phase === 'gone') lookTo(which);
      else if (look.which !== which) whenDeskImages(VIEW_IMAGES[which]).then(() => setLook({ which, phase: 'there' }));
    };
    addEventListener('desk:look', ask); addEventListener('cabin:desk-look', ask);
    return () => { removeEventListener('desk:look', ask); removeEventListener('cabin:desk-look', ask); };
  }, [look, lookTo]);
  useEffect(() => {
    if (look?.phase !== 'gone') return;
    setLook(null);
    // taken out of the box: back down at the desk, and it lies there (DEsk: lookTo(null, lay the letter))
    if (taking.current) { setLying(taking.current); taking.current = null; }
  }, [look]);
  // The hand goes where the eye went: onto the first thing in the view, and back to what was pressed.
  const lookRef = useRef(null), lookedFrom = useRef(null);
  useEffect(() => {
    if (look?.phase === 'up' || (look?.phase === 'there' && !lookedFrom.current)) lookedFrom.current = document.activeElement;
    if (look?.phase === 'there') lookRef.current?.querySelector('[data-autofocus]')?.focus({ preventScroll: true });
    if (!look && lookedFrom.current) { const back = lookedFrom.current; lookedFrom.current = null; if (back.isConnected && back !== document.body) back.focus?.({ preventScroll: true }); }
  }, [look?.phase, look?.which]); // eslint-disable-line react-hooks/exhaustive-deps
  // The film: DEsk's frames of the move, mixed over the desk as it slides away, then the view itself.
  useLayoutEffect(() => {
    if (!look || (look.phase !== 'up' && look.phase !== 'down')) return undefined;
    const canvas = film.current, g = canvas?.getContext('2d'), f = PLATES.films[look.which], strip = deskImage(`film-${look.which}.webp`), view = deskImage(postView(look.which, letters.length));
    if (!g || !strip) { setLook((l) => l && ({ ...l, phase: l.phase === 'up' ? 'there' : 'gone' })); return undefined; }
    const dpr = Math.min(2, devicePixelRatio || 1), vl = viewLayout(innerWidth, innerHeight);
    canvas.width = Math.round(innerWidth * dpr); canvas.height = Math.round(innerHeight * dpr);
    const dur = LOOK_DUR[look.which] * pace() * 1000, start = performance.now(), up = look.phase === 'up';
    const frame = () => {
      const u = Math.min(1, (performance.now() - start) / dur), e = lookEase(u), t = up ? e : 1 - e;
      const s = filmStep(f, t);
      if (deskRef.current) deskRef.current.style.transform = `translate(${(s.ddx * vl.s).toFixed(1)}px, ${(s.ddy * vl.s).toFixed(1)}px)`;
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, canvas.width, canvas.height);
      g.setTransform(vl.s * dpr, 0, 0, vl.s * dpr, vl.ox * dpr, vl.oy * dpr);
      g.globalAlpha = s.in;
      g.drawImage(strip, 0, s.f * f.fh, f.fw, f.fh, s.a[0], s.a[1], s.a[2], s.a[3]);
      if (s.f + 1 < f.frames) { g.globalAlpha = s.in * s.mix; g.drawImage(strip, 0, (s.f + 1) * f.fh, f.fw, f.fh, s.b[0], s.b[1], s.b[2], s.b[3]); }
      if (view && s.over > 0) { g.globalAlpha = s.over; g.drawImage(view, s.dx, s.dy); }
      g.globalAlpha = 1;
      if (u < 1) raf.current = requestAnimationFrame(frame);
      else {
        if (deskRef.current) deskRef.current.style.transform = '';
        setLook((l) => l && ({ ...l, phase: up ? 'there' : 'gone' }));
      }
    };
    raf.current = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf.current); if (deskRef.current) deskRef.current.style.transform = ''; };
  }, [look?.which, look?.phase]);

  // ----- keys: A the bookcase, C the Control Panel, N the post box, D the drawer, Esc back -----
  useEffect(() => {
    const key = (event) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
      if (event.key === 'Escape') return; // the back stack has it
      if (document.querySelector('dialog[open]') || typing(event.target)) return;
      if (look?.which === 'post' && look.phase === 'there' && letters.length) {
        const turn = { ArrowUp: 1, PageUp: 1, ArrowDown: -1, PageDown: -1 }[event.key];
        if (turn) { event.preventDefault(); flip(turn); return; }
      }
      const act = deskKey(event.key, { look: Boolean(look) || Boolean(lying), drawer });
      if (!act) return;
      event.preventDefault();
      if (act.type === 'drawer') setDrawer(act.open);
      else if (act.type === 'look') lookTo(act.which);
    };
    addEventListener('keydown', key); return () => removeEventListener('keydown', key);
  }, [look, drawer, lookTo, lying, letters.length, front]);

  const open = (action) => { setDrawer(false); commands.open(action); };

  // ----- the letters -----
  const top = Math.min(front, Math.max(0, letters.length - 1));
  function flip(delta) {
    const next = Math.max(0, Math.min(letters.length - 1, top + delta));
    if (next === top) return;
    playSfx('letter-flick'); setFront(next);
    requestAnimationFrame(() => document.querySelector('.desk-look .post-card.is-front')?.focus({ preventScroll: true }));
  }
  const take = (letter) => { playSfx('letter-take'); post.setRead(letter, true); taking.current = letter.id; lookBack(); };
  const lyingLetter = lying && letters.find((l) => l.id === lying);
  useEffect(() => { if (lying && !lyingLetter) setLying(null); }, [lying, lyingLetter]);
  const letterRect = letterLayout(width, height);
  const putAway = useCallback(() => {
    const node = lyingRef.current;
    if (!node || node.dataset.away) return;
    node.dataset.away = '1';
    playSfx('paper-swing');
    const done = () => { setLying(null); requestAnimationFrame(() => document.querySelector('.desk-post')?.focus({ preventScroll: true })); };
    if (reduced || !node.animate) { done(); return; }
    const box = node.getBoundingClientRect(), rect = { x: box.left, y: box.top, w: box.width, h: box.height };
    const anim = node.animate(putAwayFrames(rect, slotPoint(lay)), { duration: PUT_AWAY * pace() * 1000, fill: 'forwards' });
    anim.onfinish = done; anim.oncancel = done;
  }, [lay, reduced]);
  useBackLayer(Boolean(lyingLetter), putAway, 'letter');
  const letterStep = (step) => { playSfx('paper-press'); window.dispatchEvent(new CustomEvent('cabin:onboarding-step', { detail: { step: step.id } })); };
  const letterAction = (action) => {
    playSfx('paper-press');
    if (action.id === 'settings') window.dispatchEvent(new CustomEvent('cabin-open-settings', { detail: { section: action.arg || 'music' } }));
    else if (action.id === 'mail') commands.open('mail');
  };
  const pick = (thing) => { playSfx('felt-pick'); open(thing.action); };
  const vl = viewLayout(innerWidth, innerHeight); // the views cover the whole window (.desk-look is fixed)
  // A window narrower than the picture (a phone) slides along it: the view is a strip that scrolls
  // sideways, opening on its middle, as the film ended. Wider windows place it as DEsk does.
  const pan = PLATES.w * vl.s > innerWidth + 1;
  const place = (r) => { const p = vl.place(r); return pan ? { ...p, x: p.x - vl.ox } : p; };
  const panRef = useCallback((node) => { if (node && pan) node.scrollLeft = -vl.ox; }, [pan, look?.which]); // eslint-disable-line react-hooks/exhaustive-deps
  const style = (r) => ({ left: r.x, top: r.y, width: r.w, height: r.h });
  const viewSrc = look && postView(look.which, letters.length);
  const engraving = { fontSize: Math.max(12, 13 * lay.s) };

  const shelfPlate = (
    <button type="button" className={`desk-plate desk-shelf-plate ${lay.phone ? 'is-brass' : ''}`} style={{ ...style(lay.shelfPlate), backgroundImage: `url(${deskUrl('plate-shelf.webp')})` }} aria-label="唱片架 · 抬头看书柜（A）" onClick={() => lookTo('shelf')}>
      <span className="desk-engraving" style={engraving}>唱片架 <b>↑</b></span>
    </button>
  );
  const Body = look && VIEW_BODY[look.which];
  return <section ref={homeRef} className={`desk-home ${ready ? 'is-lit' : ''} ${lay.phone ? 'is-phone' : ''} ${drawer ? 'is-drawer-out' : ''} ${reduced ? 'is-reduced' : ''}`} aria-label="书桌" data-look={look?.which || undefined} style={{ '--desk-s': lay.s, '--desk-lamp': lamp.brightness }}>
    <div className="desk-wood" style={{ backgroundImage: `url(${deskUrl('desk-wood.webp')})` }} aria-hidden="true"/>
    <div className="desk-top" ref={deskRef} style={{ transform: lift ? `translateY(${-lift.toFixed(1)}px)` : undefined }} inert={look?.phase === 'there' || undefined}>
      <RecordDesk lay={lay} shelf={shelf} reduced={reduced} hidden={Boolean(look) || drawer}/>
      {lay.console && <img className="desk-piece" src={deskUrl('edge-console.webp')} alt="" style={style(lay.console)} draggable="false"/>}
      <img className="desk-piece" src={deskUrl('edge-clock.webp')} alt="" style={style(lay.clock)} draggable="false"/>
      {lay.post && <img className="desk-piece" src={deskUrl('edge-post.webp')} alt="" style={style(lay.post)} draggable="false"/>}
      <button type="button" className={`desk-plate desk-console-plate ${lay.phone ? 'is-brass' : ''}`} style={{ ...style(lay.consolePlate), backgroundImage: `url(${deskUrl(lay.phone ? 'plate-shelf.webp' : 'plate-console.webp')})` }} aria-label="唱机 · 抬头看控制面板（C）" onClick={() => lookTo('console')}>
        <span className="desk-engraving" style={engraving}>唱机 <b>↑</b></span>
      </button>
      {lay.phone && shelfPlate}
      <div className={`desk-clock ${keysUp ? 'is-awake' : ''}`} style={style({ x: lay.clockFace.x, y: lay.clockFace.y, w: lay.clockFace.w, h: lay.clockFace.h })} onPointerEnter={() => setKeysUp(true)} onPointerLeave={() => setKeysUp(false)} onFocus={() => setKeysUp(true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setKeysUp(false); }}>
        <button type="button" className={`focus-badge desk-clock-face${timer && timer.phase !== 'idle' ? ` is-running phase-${timer.phase}${timer.paused ? ' is-paused' : ''}` : ''}`} aria-expanded={focusOpen} aria-label={clockLabel} title="专注" onClick={() => { playSfx('key-press'); open(shown === 'music' ? 'music' : shown === 'date' ? 'tasks' : 'timer'); }}>
          <ClockFace face={ready ? face : { ...face, digits: '000000', word: 'LOAD' }} scale={lay.s}/>
        </button>
        <div className="desk-clock-keys" style={{ left: (PLATES.clock.keysAt[0] - PLATES.clock.faceAt[0]) / PLATES.clock.faceAt[2] * 100 + '%', width: PLATES.clock.keysAt[2] / PLATES.clock.faceAt[2] * 100 + '%', backgroundImage: `url(${deskUrl('clock-keys.webp')})` }} role="radiogroup" aria-label="台钟显示">
          {CLOCK_KEYS.map((k) => <button type="button" key={k.id} role="radio" aria-checked={shown === k.id} className={`desk-clock-key ${shown === k.id ? 'is-on' : ''} ${k.id === 'music' && playing ? 'is-playing' : ''}`} style={{ left: `${k.rect[0] / 114 * 100}%`, top: `${k.rect[1] / 66 * 100}%`, width: `${k.rect[2] / 114 * 100}%`, height: `${k.rect[3] / 66 * 100}%` }} onClick={() => { playSfx('key-press'); setMode(mode === k.id ? '' : k.id); }}>{k.id === 'focus' ? <span className="desk-key-print">专注</span> : <span className="sr-only">{k.id === 'music' && playing ? '音乐 · 正在播放' : k.name}</span>}</button>)}
        </div>
      </div>
      {packets.map((packet, k) => {
        const r = slotXY(k, { width, height, s: lay.phone ? 0.7 : lay.s }), thing = DRAWER.find((t) => t.action === packet.action);
        return <button type="button" key={packet.id} className="desk-packet" style={{ ...style(r), backgroundImage: `url(${deskUrl('packet.webp')})` }} aria-label={`打开折起的「${packet.title}」`}
          onClick={() => { const p = unfoldPacket(packet.id); if (p) { playSfx('paper-unfold'); commands.open(p.action); } }}>
          {thing && <img src={deskUrl(`drawer/${thing.art}`)} alt="" draggable="false"/>}
          <span className="desk-packet-name" style={{ fontSize: Math.max(12, 15 * (lay.phone ? 0.7 : lay.s)) }}>{packet.title}</span>
        </button>;
      })}
      {lay.postBox
        ? <button type="button" className="desk-post" style={{ ...style(lay.postBox), backgroundImage: `url(${deskUrl(unread ? 'post-letter.webp' : 'post0.webp')})` }} aria-label={`信箱${unread ? ` · ${unread} 封未读` : letters.length ? ` · ${letters.length} 封信` : ''}（N）`} onClick={() => lookTo('post')}>
        <span className="desk-engraving desk-post-engraving" style={{ ...engraving, height: 15 * lay.postBox.w / PLATES.post1[2] }}>信箱{unread > 0 && <i>{unread}</i>} <b>↑</b></span>
      </button>
        : <button type="button" className="desk-plate is-brass" style={{ ...style(lay.postPlate), backgroundImage: `url(${deskUrl('plate-shelf.webp')})` }} aria-label={`信箱${unread ? ` · ${unread} 封未读` : ''}（N）`} onClick={() => lookTo('post')}>
          <span className="desk-engraving" style={engraving}>信箱{unread ? ` ${unread}` : ''} <b>↑</b></span>
        </button>}
      {lyingLetter && <div className="post-letter-lying" ref={lyingRef} key={lyingLetter.id}>
        <LyingLetter letter={lyingLetter} rect={letterRect} now={now} phone={lay.phone} onAway={putAway} onStep={letterStep} onAction={letterAction}
          onDiscard={() => { playSfx('paper-crumple'); post.remove(lyingLetter); setLying(null); }} onUnread={() => { post.setRead(lyingLetter, false); putAway(); }}/>
      </div>}
    </div>
    {!lay.phone && shelfPlate}
    {slide > 0.004 && <div className="desk-shade" style={{ opacity: 0.42 * slide, bottom: lift }} onClick={() => setDrawer(false)} aria-hidden="true"/>}
    <div className="desk-drawer" style={{ height: lay.drawer.h, left: lay.drawer.x, width: lay.drawer.w, transform: `translateY(${(lay.drawer.h - lift).toFixed(1)}px)`, backgroundImage: `url(${deskUrl('drawer-band.webp')})` }} inert={!drawer || undefined} aria-hidden={!drawer || undefined} role="group" aria-label="抽屉">
      {things.map((thing, i) => {
        const p = places[i], s = lay.drawer.s, natural = PLATES.drawer.objects[thing.art.replace(/\.\w+$/, '')];
        const size = natural ? { width: natural[2] * s, height: natural[3] * s } : { width: (thing.size || 96) * s, height: (thing.size || 96) * s };
        return <button type="button" key={thing.id} className={`desk-drawer-thing ${hot === thing.id ? 'is-hot' : ''}`} style={{ left: p.x * s, top: p.y * s }} aria-label={thing.name}
          onPointerEnter={() => setHot(thing.id)} onPointerLeave={() => setHot('')} onFocus={() => setHot(thing.id)} onBlur={() => setHot('')} onClick={() => pick(thing)}>
          <img src={deskUrl(`drawer/${thing.art}`)} alt="" draggable="false" style={size}/>
          {thing.id === 'pet' && petPhoto && <span className="desk-pet-photo" style={{ left: `${PET_WINDOW.x / 2.56}%`, top: `${PET_WINDOW.y / 2.56}%`, width: `${PET_WINDOW.w / 2.56}%`, height: `${PET_WINDOW.h / 2.56}%`, transform: `rotate(${PET_WINDOW.angle}deg)`, transformOrigin: "50% 61.9%" }} aria-hidden="true"><img src={petPhoto} alt="" draggable="false"/></span>}
          <span className="desk-drawer-name" aria-hidden="true">{thing.name}</span>
        </button>;
      })}
    </div>
    <button type="button" className="desk-pull" style={{ height: lay.pull, bottom: lift }} aria-label={drawer ? '推回抽屉（D）' : '拉开抽屉（D）'} aria-expanded={drawer} onClick={() => setDrawer((v) => !v)}>
      <span className="desk-pull-handle" aria-hidden="true"/>
    </button>
    {look && <div ref={lookRef} className={`desk-look is-${look.phase}`} role="dialog" aria-modal="true" aria-label={VIEWS[look.which].name} onClick={(e) => { if (e.target === e.currentTarget || e.target.classList.contains('desk-view') || e.target.classList.contains('desk-pan-strip')) lookBack(); }}>
      <canvas ref={film} className="desk-film" aria-hidden="true"/>
      {look.phase === 'there' && Body && <Body back={lookBack} layout={consoleLayout(innerWidth, innerHeight)} reduced={reduced}/>}
      {look.phase === 'there' && !Body && <>
        <div className={`desk-pan ${pan ? 'is-panning' : ''}`} ref={panRef}>
          <div className="desk-pan-strip" style={{ width: pan ? PLATES.w * vl.s : '100%' }}>
            <img className="desk-view" src={deskUrl(viewSrc)} alt="" draggable="false" style={{ left: pan ? 0 : vl.ox, top: vl.oy, width: PLATES.w * vl.s, height: PLATES.h * vl.s }}/>
            {look.which === 'shelf' && <ShelfView place={place} s={vl.s} shelf={shelf} lookBack={lookBack}/>}
            {look.which === 'post' && letters.length > 0 && <div className="post-box-letters" onWheel={(e) => { if (Math.abs(e.deltaY) > 4) flip(e.deltaY > 0 ? 1 : -1); }}>
          {boxCards(letters.length, top).reverse().map((card) => {
            const letter = letters[card.index], at = place([card.x, card.y, card.w, card.h]);
            return <BoxCard key={letter.id} letter={letter} card={card} place={at} scale={vl.s * card.k} now={now} front={card.depth === 0}
              onClick={() => card.depth === 0 ? take(letter) : (playSfx('letter-flick'), setFront(card.index))}/>;
          })}
          <div className="post-box-turn" role="group" aria-label="翻信">
            <button type="button" onClick={() => flip(-1)} disabled={top === 0} aria-label="较新的一封（↓）">较新</button>
            <span aria-live="polite">第 {top + 1} / {letters.length} 封{unread ? ` · ${unread} 封未读` : ''}</span>
            <button type="button" onClick={() => flip(1)} disabled={top >= letters.length - 1} aria-label="较早的一封（↑）">较早</button>
          </div>
        </div>}
            {VIEWS[look.which].spots.map((spot, i) => <button type="button" key={spot.id} className="desk-spot" data-autofocus={(look.which !== 'shelf' && i === 0) || undefined} style={style(place(spot.rect))} aria-label={spot.name} onClick={() => { playSfx('binder-lift'); commands.open(spot.action); }}/>)}
          </div>
        </div>
        {look.which !== 'shelf' && <button type="button" className="desk-look-back" onClick={lookBack}>{VIEWS[look.which].back}</button>}
      </>}
    </div>}
    {/* The window is frameless on the desktop: a grip to drag it by, full screen, minimise and close (设置 is in the drawer). */}
    <div className="desk-window" style={{ top: Math.max(...[lay.shelfPlate, lay.postBox || lay.postPlate].filter(Boolean).map((r) => r.y + r.h)) + 6 }}><DesktopControls onError={(text) => notify?.(text, { tone: 'error' })}/></div>
    {!ready && <div className="desk-dark" aria-hidden="true"/>}
  </section>;
}
