import React, { useEffect, useRef, useState } from 'react';
import PixelCat from './PixelCat';
import PetLife from './PetLife';
import CatBubble from './CatBubble';
import { useCatPlacement } from './useCatPlacement';
import { useCatMotion } from './useCatMotion';
import { getPet } from './pet-catalog.mjs';
import { useCatCare, requestFeed } from '../cat/useCatCare';
import { FED_EVENT, FISH_DRAG_TYPE, FISH_DRAG_TEXT } from '../cat/cat-care.mjs';
import { roomPetPose } from './pet-presence.mjs';
import { useInputPresence } from './useInputPresence';
import { beatSynced } from '../cat/beat-sync.mjs';
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
  const synced = beatSynced({ playing });
  const basePose = petPose({ synced, playing, phase: focus.phase, paused: focus.paused, idleMs: lastActivity ? now - lastActivity : 0, hour, celebrateUntil: celebrate, now, poked: poke.at });
  const eligible = motion.visible && !motion.reduced && ['idle', 'sleep', 'walk'].includes(basePose);
  const [strollStart, setStrollStart] = useState(() => Date.now());
  const rest = useRef(90000 + Math.random() * 60000);
  useEffect(() => { setStrollStart(Date.now()); }, [eligible, petId]);
  const stroll = catStroll(now - strollStart, rest.current, eligible);
  const pose = stroll.walking ? 'walk' : basePose === 'walk' ? 'idle' : basePose;
  const bubble = bubbleText({ phase: focus.phase, paused: focus.paused, remaining, track, trackChangedAt: song.current.at, poke: poke.text, pokedAt: poke.at, now, hour });
  return { pose, synced, bubble, now, x: stroll.x, reduced: motion.reduced, pokedAt: poke.at, poke: () => { setPoke({ text: pokeLine(Math.random, petId), at: Date.now() }); window.dispatchEvent(new Event('cabin:cat-petted')); } };
}

export const EAT_MS = 2400, FULL_MS = 1500;
export default function RoomCat({ focus, playing, track, reduceMotion, petId = 'cat', interactive = true, hidden = false }) {
  const pet = getPet(petId), catRef = useRef(null), bubbleRef = useRef(null), pokeTimer = useRef(0);
  const input = useInputPresence(interactive && !hidden);
  const mood = useCatCare(), [fedAt, setFedAt] = useState(0), [dropping, setDropping] = useState(false);
  const cat = useCatBehaviour({ focus, playing, track, petId: pet.id, lastActivity: input.at, reduceMotion, hidden });
  const elapsed = cat.now - fedAt, eating = fedAt > 0 && elapsed < EAT_MS, full = fedAt > 0 && elapsed >= EAT_MS && elapsed < EAT_MS + FULL_MS;
  const actionOrigin = useRef(0);
  useEffect(() => {
    const feed = () => { actionOrigin.current = performance.now(); setFedAt(Date.now()); };
    window.addEventListener(FED_EVENT, feed);
    return () => window.removeEventListener(FED_EVENT, feed);
  }, []);
  useEffect(() => () => clearTimeout(pokeTimer.current), []);
  const pose = roomPetPose({ base: cat.pose, eating, full, input: input.active, inputType: input.type, petId: pet.id });
  const music = playing ? (cat.synced ? 'beat' : 'free') : '';
  const fishDrag = (event) => [...(event.dataTransfer?.types || [])].includes(FISH_DRAG_TYPE);
  const dropProps = interactive ? {
    onDragOver: (event) => { if (fishDrag(event)) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropping(true); } },
    onDragLeave: () => setDropping(false),
    onDrop: (event) => { setDropping(false); if (!fishDrag(event) && event.dataTransfer?.getData('text/plain') !== FISH_DRAG_TEXT) return; event.preventDefault(); requestFeed(); }
  } : {};
  useCatPlacement(catRef, bubbleRef, !hidden, [pose, cat.bubble, cat.x]);
  if (hidden) return null;
  const labels = { idle: '等你回来', groove: '跟着音乐摇摆', celebrate: '开心地庆祝', walk: '轻轻散步', sleep: '蜷着打盹', focus: '陪你读书', listen: '闭眼听歌', typing: '陪你敲敲键盘', click: '陪你点点鼠标', eat: '认真吃小鱼干' };
  const bubble = eating ? '慢慢吃，今天也辛苦啦。' : full ? '吃饱啦，再陪你一会儿。' : cat.bubble;
  const body = <><PetLife pose={pose} pokedAt={cat.pokedAt} reduced={cat.reduced}><PixelCat petId={pet.id} pose={pose} accessory={focus?.accessory || ''} skin={focus?.catSkin} reduceMotion={cat.reduced} origin={eating ? actionOrigin.current : 0} style={{ transform: `translateX(${cat.x}px)` }} label={`像素${pet.species} · ${pet.name} · ${labels[pose] || labels.idle}`}/></PetLife>{bubble && <CatBubble ref={bubbleRef} text={bubble}/>}</>;
  const props = { ref: catRef, className: `room-cat${eating ? ' cat--eating' : ''}${dropping ? ' cat--drop-target' : ''}`, 'data-mood': mood.tier, 'data-pet-id': pet.id, 'data-music': music || undefined, 'data-pose': pose, 'data-art': `sprite-${pet.id}`, 'data-typing': input.active && input.type === 'keyboard' || undefined, 'data-clicking': input.active && input.type === 'click' || undefined };
  return interactive ? <button {...props} type="button" {...dropProps} aria-haspopup="dialog" aria-expanded="false" title={`点一下摸摸${pet.name} · 双击看看等级和打扮`} aria-label={`摸摸${pet.species}${pet.name}；双击打开等级和打扮`} onClick={(event) => { clearTimeout(pokeTimer.current); if (event.detail > 1) return; pokeTimer.current = setTimeout(cat.poke, event.detail === 0 ? 0 : 260); }} onDoubleClick={() => { clearTimeout(pokeTimer.current); window.dispatchEvent(new Event('cabin-open-cat')); }} onContextMenu={(event) => { event.preventDefault(); window.dispatchEvent(new Event('cabin-open-cat')); }}>{body}</button> : <div {...props}>{body}</div>;
}
