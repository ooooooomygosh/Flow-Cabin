import React, { useEffect, useRef, useState } from 'react';
import PixelCat from './PixelCat';
import PetLife from './PetLife';
import CatBubble from './CatBubble';
import { useCatPlacement } from './useCatPlacement';
import { useCatMotion } from './useCatMotion';
import { getPet } from './pet-catalog.mjs';
import { useCatCare, requestFeed } from '../cat/useCatCare';
import { FED_EVENT, FISH_DRAG_TYPE, FISH_DRAG_TEXT } from '../cat/cat-care.mjs';
import { catArtLayer, catArtPose } from '../cat/cat-art.mjs';
import './cat-care.css';
import { bubbleText, celebrateUntil, petPose, pokeLine, catStroll } from './pet-model.mjs';

export function useClock(interval = 1000, enabled = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (!enabled) return; setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()), interval); return () => clearInterval(timer); }, [interval, enabled]);
  return now;
}
// Shared by the room, the wallpaper and the desktop pet: tracks celebration,
// pokes and song changes, and returns the current pose and bubble.
export function useCatBehaviour({ focus = {}, playing = false, track = '', lastActivity = 0, petId = 'cat', reduceMotion = false, hidden = false }) {
  const motion = useCatMotion(reduceMotion, hidden);
  const now = useClock(500, motion.visible), [celebrate, setCelebrate] = useState(0), [poke, setPoke] = useState({ text: '', at: 0 });
  useEffect(() => { setPoke({ text: '', at: 0 }); }, [petId]);
  const fish = useRef(focus.fish), song = useRef({ track, at: 0 });
  useEffect(() => { if (fish.current !== undefined && focus.fish > fish.current) setCelebrate(celebrateUntil(Date.now())); fish.current = focus.fish; }, [focus.fish]);
  if (track !== song.current.track) song.current = { track, at: track ? Date.now() : 0 };
  const hour = new Date(now).getHours(), remaining = focus.endsAt ? Math.max(0, focus.endsAt - now) : focus.remaining || 0;
  const basePose = petPose({ playing, phase: focus.phase, paused: focus.paused, idleMs: lastActivity ? now - lastActivity : 0, hour, celebrateUntil: celebrate, now, poked: poke.at });
  const eligible = motion.visible && !motion.reduced && ['idle', 'sleep', 'walk'].includes(basePose);
  const [strollStart, setStrollStart] = useState(() => Date.now());
  const rest = useRef(90000 + Math.random() * 60000);
  useEffect(() => { setStrollStart(Date.now()); }, [eligible, petId]);
  const stroll = catStroll(now - strollStart, rest.current, eligible);
  const pose = stroll.walking ? 'walk' : basePose === 'walk' ? 'idle' : basePose;
  const bubble = bubbleText({ phase: focus.phase, paused: focus.paused, remaining, track, trackChangedAt: song.current.at, poke: poke.text, pokedAt: poke.at, now, hour });
  return { pose, bubble, now, x: stroll.x, reduced: motion.reduced, pokedAt: poke.at, poke: () => { setPoke({ text: pokeLine(Math.random, petId), at: Date.now() }); window.dispatchEvent(new Event('cabin:cat-petted')); } };
}

// Placeholder eating time; beauty's frames replace the CSS bob (docs/cat-care.md).
export const EAT_MS = 2400, FULL_MS = 1500;
export default function RoomCat({ focus, playing, track, reduceMotion, petId = 'cat', interactive = true, hidden = false }) {
  const [activity, setActivity] = useState(() => Date.now());
  useEffect(() => {
    if (!interactive || hidden) return;
    let last = 0; const mark = () => { const time = Date.now(); if (time - last > 5000) { last = time; setActivity(time); } };
    ['pointermove', 'keydown', 'wheel'].forEach((name) => window.addEventListener(name, mark, { passive: true }));
    return () => ['pointermove', 'keydown', 'wheel'].forEach((name) => window.removeEventListener(name, mark));
  }, [interactive, hidden]);
  const pet = getPet(petId), catRef = useRef(null), bubbleRef = useRef(null), pokeTimer = useRef(0);
  // Care (src/cat): eating after a feed, mood tier on data-mood, a 小鱼干 can be dropped on the cat.
  const mood = useCatCare(), [eating, setEating] = useState(false), [full, setFull] = useState(false), [dropping, setDropping] = useState(false);
  // Eat (EAT_MS), then a short contented 'full' beat: cat-rub, or a roll once 打滚 is learned.
  useEffect(() => { let timer = 0, after = 0; const on = () => { setEating(true); setFull(false); clearTimeout(timer); clearTimeout(after); timer = setTimeout(() => { setEating(false); setFull(true); after = setTimeout(() => setFull(false), FULL_MS); }, EAT_MS); }; window.addEventListener(FED_EVENT, on); return () => { clearTimeout(timer); clearTimeout(after); window.removeEventListener(FED_EVENT, on); }; }, []);
  const rolls = full && mood.actions.some((a) => a.id === 'roll');
  const fishDrag = (event) => { const types = [...(event.dataTransfer?.types || [])]; return types.includes(FISH_DRAG_TYPE) || types.includes('text/plain'); };
  const isFish = (event) => [...(event.dataTransfer?.types || [])].includes(FISH_DRAG_TYPE) || event.dataTransfer?.getData('text/plain') === FISH_DRAG_TEXT;
  const dropProps = interactive ? { onDragOver: (event) => { if (fishDrag(event)) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropping(true); } }, onDragLeave: () => setDropping(false), onDrop: (event) => { setDropping(false); if (!isFish(event)) return; event.preventDefault(); setDropping(false); requestFeed(); } } : {};
  useEffect(() => () => clearTimeout(pokeTimer.current), []);
  const cat = useCatBehaviour({ focus, playing, track, petId: pet.id, lastActivity: interactive ? activity : 0, reduceMotion, hidden });
  const artState = { tier: mood.tier, pose: cat.pose, phase: focus?.phase, eating, full, pettedRecently: Date.now() - cat.pokedAt < 4000 }, art = catArtLayer(artState);
  useCatPlacement(catRef, bubbleRef, !hidden, [cat.pose, cat.bubble, cat.x]);
  if (hidden) return null;
  const body = <><PetLife pose={cat.pose} pokedAt={cat.pokedAt} reduced={cat.reduced}><PixelCat petId={pet.id} pose={cat.pose} accessory={focus?.accessory || ''} skin={focus?.catSkin} reduceMotion={cat.reduced} style={{ transform: `translateX(${cat.x}px)` }} label={`像素${pet.species} · ${pet.name} · ${{ idle: '发呆', groove: '跟着音乐摇摆', celebrate: '庆祝', walk: '散步', sleep: '睡觉', focus: '陪你专注' }[cat.pose]}`}/></PetLife>{art ? <span className={`cat-art is-${art.kind}`} aria-hidden="true" style={{ backgroundImage: `url(${art.url})`, '--cat-art-frames': art.frames || 1, '--cat-art-ms': `${(art.frameMs || 0) * (art.frames || 1)}ms` }}/> : eating && <span className="cat-eat-fish" aria-hidden="true"/>}{(eating ? '好吃！' : cat.bubble) && <CatBubble ref={bubbleRef} text={eating ? '好吃！' : cat.bubble}/>}</>;
  return interactive
    ? <button ref={catRef} type="button" className={`room-cat${`${eating ? ' cat--eating' : ''}${full ? ` cat--full${rolls ? ' is-roll' : ''}` : ''}${playing ? ' is-playing' : ''}${dropping ? ' cat--drop-target' : ''}${mood.tier === 'happy' && focus?.phase === 'focus' ? ' cat--by-desk' : ''}`}`} data-mood={mood.tier} data-art={catArtPose(artState)} {...dropProps} aria-haspopup="dialog" aria-expanded="false" title={`点一下摸摸${pet.name} · 双击看看等级和打扮`} aria-label={`摸摸${pet.species}${pet.name}；双击打开等级和打扮`} data-pet-id={pet.id} onClick={(event) => { clearTimeout(pokeTimer.current); if (event.detail > 1) return; pokeTimer.current = setTimeout(cat.poke, event.detail === 0 ? 0 : 260); }} onDoubleClick={() => { clearTimeout(pokeTimer.current); window.dispatchEvent(new Event('cabin-open-cat')); }} onContextMenu={(event) => { event.preventDefault(); window.dispatchEvent(new Event('cabin-open-cat')); }}>{body}</button>
    : <div ref={catRef} className={`room-cat${eating ? ' cat--eating' : ''}`} data-mood={mood.tier} data-pet-id={pet.id}>{body}</div>;
}
