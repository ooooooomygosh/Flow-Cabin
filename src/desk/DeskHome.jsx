import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useCabinRuntime } from '../runtime/CabinRuntime';
import { useFocus } from '../focus/useFocus';
import useLabs from '../product/useLabs';
import useBackLayer from '../ui/useBackLayer';
import { playSfx } from '../props/sfx.mjs';
import { drawerEase, lookEase, readPace, PACES } from '../props/motion.mjs';
import { currentCabinPlayback, onCabinPlayback } from '../scene/playback-listener.mjs';
import { deskLayout, viewLayout, filmStep, clockFace, PLATES } from './layout.mjs';
import { EDGE, VIEWS, CLOCK_KEYS, drawerItems, drawerPlaces, deskKey, autoMode } from './desk-model.mjs';
import { deskImage, deskUrl, whenDeskImages, FIRST, VIEW_IMAGES } from './images.mjs';
import ClockFace from './ClockFace';
import { DesktopControls } from '../desktop-client';
import './desk.css';

// The home: DEsk's desk (https://github.com/fyzugx/DEsk, MIT, (c) 2026 The DEsk authors), seen from
// above. At its back edge the corner of the Control Panel (唱机), the red LED clock (专注), the post box
// (信箱) and, on the wall, the brass plate to the bookcase (唱片架); at its front the drawer. Everything
// is a picture DEsk rendered, laid where DEsk lays it (src/desk/layout.mjs), with a real button over it.
// Looking up at the bookcase, the Control Panel or the post box plays DEsk's film of that move.
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

export default function DeskHome({ reduced = false, focusOpen = false, guiding = false, unread = 0 }) {
  const { deck, commands, notify, sceneCapture } = useCabinRuntime(), focus = useFocus(), labs = useLabs();
  const homeRef = useRef(null), { width, height } = useDeskSize(homeRef), lay = useMemo(() => deskLayout(width, height), [width, height]);
  const [ready, setReady] = useState(false), [drawer, setDrawer] = useState(false), [hot, setHot] = useState('');
  const [mode, setMode] = useState(''), [keysUp, setKeysUp] = useState(false);
  const [look, setLook] = useState(null); // { which, phase: 'up' | 'there' | 'down' }
  const deskRef = useRef(null), film = useRef(null), raf = useRef(0);
  const now = useTick(true, 1000), playback = usePlaybackClock();

  // The lamp comes up as the room is made: dark until the first pictures are in (at least a moment).
  useEffect(() => {
    let alive = true; const started = performance.now();
    whenDeskImages(FIRST).then(() => { const wait = reduced ? 0 : Math.max(0, 1200 - (performance.now() - started)); setTimeout(() => alive && setReady(true), wait); });
    return () => { alive = false; };
  }, []);

  // The picture 小屋明信片 prints (sceneCapture, src/home/Postcard.jsx): the desk as DEsk lays it at 1440x900, in 1200x800.
  useEffect(() => sceneCapture?.register(async () => {
    await whenDeskImages(FIRST);
    const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 800;
    const g = canvas.getContext('2d'), at = deskLayout(PLATES.w, PLATES.h), s = 800 / PLATES.h, ox = (1200 - PLATES.w * s) / 2;
    g.fillStyle = '#2a1a10'; g.fillRect(0, 0, 1200, 800);
    const draw = (name, r) => { const image = deskImage(name); if (image) g.drawImage(image, ox + r.x * s, r.y * s, r.w * s, r.h * s); };
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
  const things = drawerItems(labs), places = drawerPlaces(things.length);
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
    playSfx(which === 'post' ? 'post-open' : 'binder-lift');
    whenDeskImages(VIEW_IMAGES[which]).then(() => setLook({ which, phase: reduced ? 'there' : 'up' }));
  }, [look, reduced]);
  const lookBack = useCallback(() => {
    if (!look || look.phase === 'down') return;
    if (look.which === 'post') playSfx('post-close');
    setLook((l) => l && ({ ...l, phase: reduced ? 'gone' : 'down' }));
  }, [look, reduced]);
  useBackLayer(Boolean(look), lookBack, 'look');
  useEffect(() => { if (look?.phase === 'gone') setLook(null); }, [look]);
  // The film: DEsk's frames of the move, mixed over the desk as it slides away, then the view itself.
  useLayoutEffect(() => {
    if (!look || (look.phase !== 'up' && look.phase !== 'down')) return undefined;
    const canvas = film.current, g = canvas?.getContext('2d'), f = PLATES.films[look.which], strip = deskImage(`film-${look.which}.webp`), view = deskImage(look.which === 'post' && !unread ? 'view-post-empty.webp' : `view-${look.which}.webp`);
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
      const act = deskKey(event.key, { look: Boolean(look), drawer });
      if (!act) return;
      event.preventDefault();
      if (act.type === 'drawer') setDrawer(act.open);
      else if (act.type === 'look') lookTo(act.which);
    };
    addEventListener('keydown', key); return () => removeEventListener('keydown', key);
  }, [look, drawer, lookTo]);

  const open = (action) => { setDrawer(false); commands.open(action); };
  const pick = (thing) => { playSfx('felt-pick'); open(thing.action); };
  const vl = viewLayout(innerWidth, innerHeight); // the views cover the whole window (.desk-look is fixed)
  const style = (r) => ({ left: r.x, top: r.y, width: r.w, height: r.h });
  const viewSrc = look && (look.which === 'post' && !unread ? 'view-post-empty.webp' : `view-${look.which}.webp`);
  const engraving = { fontSize: Math.max(12, 13 * lay.s) };

  return <section ref={homeRef} className={`desk-home ${ready ? 'is-lit' : ''} ${lay.phone ? 'is-phone' : ''} ${drawer ? 'is-drawer-out' : ''} ${reduced ? 'is-reduced' : ''}`} aria-label="书桌" data-look={look?.which || undefined} style={{ '--desk-s': lay.s }}>
    <div className="desk-wood" style={{ backgroundImage: `url(${deskUrl('desk-wood.webp')})` }} aria-hidden="true"/>
    <div className="desk-top" ref={deskRef} style={{ transform: lift ? `translateY(${-lift.toFixed(1)}px)` : undefined }} inert={look?.phase === 'there' || undefined}>
      <img className="desk-piece" src={deskUrl('edge-console.webp')} alt="" style={style(lay.console)} draggable="false"/>
      <img className="desk-piece" src={deskUrl('edge-clock.webp')} alt="" style={style(lay.clock)} draggable="false"/>
      <img className="desk-piece" src={deskUrl('edge-post.webp')} alt="" style={style(lay.post)} draggable="false"/>
      <button type="button" className="desk-plate desk-console-plate" style={{ ...style(lay.consolePlate), backgroundImage: `url(${deskUrl('plate-console.webp')})` }} aria-label="唱机 · 抬头看控制面板（C）" onClick={() => lookTo('console')}>
        <span className="desk-engraving" style={engraving}>唱机 ↑</span>
      </button>
      <div className={`desk-clock ${keysUp ? 'is-awake' : ''}`} style={style({ x: lay.clockFace.x, y: lay.clockFace.y, w: lay.clockFace.w, h: lay.clockFace.h })} onPointerEnter={() => setKeysUp(true)} onPointerLeave={() => setKeysUp(false)} onFocus={() => setKeysUp(true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setKeysUp(false); }}>
        <button type="button" className="focus-badge desk-clock-face" aria-expanded={focusOpen} aria-label={clockLabel} title="专注" onClick={() => { playSfx('key-press'); open(shown === 'music' ? 'music' : shown === 'date' ? 'tasks' : 'timer'); }}>
          <ClockFace face={ready ? face : { ...face, digits: '000000', word: 'LOAD' }} scale={lay.s}/>
        </button>
        <div className="desk-clock-keys" style={{ left: (PLATES.clock.keysAt[0] - PLATES.clock.faceAt[0]) / PLATES.clock.faceAt[2] * 100 + '%', width: PLATES.clock.keysAt[2] / PLATES.clock.faceAt[2] * 100 + '%', backgroundImage: `url(${deskUrl('clock-keys.webp')})` }} role="radiogroup" aria-label="台钟显示">
          {CLOCK_KEYS.map((k) => <button type="button" key={k.id} role="radio" aria-checked={shown === k.id} className={`desk-clock-key ${shown === k.id ? 'is-on' : ''}`} style={{ left: `${k.rect[0] / 114 * 100}%`, top: `${k.rect[1] / 66 * 100}%`, width: `${k.rect[2] / 114 * 100}%`, height: `${k.rect[3] / 66 * 100}%` }} onClick={() => { playSfx('key-press'); setMode(mode === k.id ? '' : k.id); }}>{k.id === 'focus' ? <span className="desk-key-print">专注</span> : <span className="sr-only">{k.name}</span>}</button>)}
        </div>
      </div>
      <button type="button" className="desk-post" style={{ ...style(lay.postBox), backgroundImage: `url(${deskUrl(unread ? 'post-letter.webp' : 'post0.webp')})` }} aria-label={`信箱${unread ? ` · ${unread} 封未读` : ''}（N）`} onClick={() => lookTo('post')}/>
    </div>
    <button type="button" className="desk-plate desk-shelf-plate" style={{ ...style(lay.shelfPlate), backgroundImage: `url(${deskUrl('plate-shelf.webp')})` }} aria-label="唱片架 · 抬头看书柜（A）" onClick={() => lookTo('shelf')}>
      <span className="desk-engraving" style={engraving}>唱片架 <b>↑</b></span>
    </button>
    {slide > 0.004 && <div className="desk-shade" style={{ opacity: 0.42 * slide, bottom: lift }} onClick={() => setDrawer(false)} aria-hidden="true"/>}
    <div className="desk-drawer" style={{ height: lay.drawer.h, left: lay.drawer.x, width: lay.drawer.w, transform: `translateY(${(lay.drawer.h - lift).toFixed(1)}px)`, backgroundImage: `url(${deskUrl('drawer-band.webp')})` }} inert={!drawer || undefined} aria-hidden={!drawer || undefined} role="group" aria-label="抽屉">
      {things.map((thing, i) => {
        const p = places[i], s = lay.drawer.s, natural = PLATES.drawer.objects[thing.art.replace(/\.\w+$/, '')];
        const size = natural ? { width: natural[2] * s, height: natural[3] * s } : { width: (thing.size || 96) * s, height: (thing.size || 96) * s };
        return <button type="button" key={thing.id} className={`desk-drawer-thing ${hot === thing.id ? 'is-hot' : ''}`} style={{ left: p.x * s, top: p.y * s }} aria-label={thing.name}
          onPointerEnter={() => setHot(thing.id)} onPointerLeave={() => setHot('')} onFocus={() => setHot(thing.id)} onBlur={() => setHot('')} onClick={() => pick(thing)}>
          <img src={deskUrl(`drawer/${thing.art}`)} alt="" draggable="false" style={size}/>
          <span className="desk-drawer-name" aria-hidden="true">{thing.name}</span>
        </button>;
      })}
    </div>
    <button type="button" className="desk-pull" style={{ height: lay.pull, bottom: lift }} aria-label={drawer ? '推回抽屉（D）' : '拉开抽屉（D）'} aria-expanded={drawer} onClick={() => setDrawer((v) => !v)}>
      <span className="desk-pull-handle" aria-hidden="true"/>
    </button>
    {look && <div className={`desk-look is-${look.phase}`} role="dialog" aria-modal="true" aria-label={VIEWS[look.which].name} onClick={(e) => { if (e.target === e.currentTarget || e.target.classList.contains('desk-view')) lookBack(); }}>
      <canvas ref={film} className="desk-film" aria-hidden="true"/>
      {look.phase === 'there' && <>
        <img className="desk-view" src={deskUrl(viewSrc)} alt="" draggable="false" style={{ left: vl.ox, top: vl.oy, width: PLATES.w * vl.s, height: PLATES.h * vl.s }}/>
        {VIEWS[look.which].spots.map((spot, i) => <button type="button" key={spot.id} className="desk-spot" data-autofocus={i === 0 || undefined} style={style(vl.place(spot.rect))} aria-label={spot.name} onClick={() => { playSfx('binder-lift'); commands.open(spot.action); }}/>)}
        <button type="button" className="desk-look-back" onClick={lookBack}>{VIEWS[look.which].back}</button>
      </>}
    </div>}
    {/* The window is frameless on the desktop: a grip to drag it by, full screen, minimise and close (设置 is in the drawer). */}
    <div className="desk-window" style={{ top: Math.max(lay.shelfPlate.y + lay.shelfPlate.h, lay.postBox.y + lay.postBox.h) + 6 }}><DesktopControls onError={(text) => notify?.(text, { tone: 'error' })}/></div>
    {!ready && <div className="desk-dark" aria-hidden="true"/>}
  </section>;
}
