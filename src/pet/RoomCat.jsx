import React, { useEffect, useRef, useState } from 'react';
import PixelCat from './PixelCat';
import PetLife from './PetLife';
import CatBubble from './CatBubble';
import { useCatPlacement } from './useCatPlacement';
import { useCatMotion } from './useCatMotion';
import { getPet } from './pet-catalog.mjs';
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
  return { pose, bubble, now, x: stroll.x, reduced: motion.reduced, pokedAt: poke.at, poke: () => setPoke({ text: pokeLine(Math.random, petId), at: Date.now() }) };
}

export default function RoomCat({ focus, playing, track, reduceMotion, petId = 'cat', interactive = true, hidden = false }) {
  const [activity, setActivity] = useState(() => Date.now());
  useEffect(() => {
    if (!interactive || hidden) return;
    let last = 0; const mark = () => { const time = Date.now(); if (time - last > 5000) { last = time; setActivity(time); } };
    ['pointermove', 'keydown', 'wheel'].forEach((name) => window.addEventListener(name, mark, { passive: true }));
    return () => ['pointermove', 'keydown', 'wheel'].forEach((name) => window.removeEventListener(name, mark));
  }, [interactive, hidden]);
  const pet = getPet(petId), catRef = useRef(null), bubbleRef = useRef(null);
  const cat = useCatBehaviour({ focus, playing, track, petId: pet.id, lastActivity: interactive ? activity : 0, reduceMotion, hidden });
  useCatPlacement(catRef, bubbleRef, !hidden, [cat.pose, cat.bubble, cat.x]);
  if (hidden) return null;
  const body = <><PetLife pose={cat.pose} pokedAt={cat.pokedAt} reduced={cat.reduced}><PixelCat petId={pet.id} pose={cat.pose} accessory={focus?.accessory || ''} skin={focus?.catSkin} reduceMotion={cat.reduced} style={{ transform: `translateX(${cat.x}px)` }} label={`像素${pet.species} · ${pet.name} · ${{ idle: '发呆', groove: '跟着音乐摇摆', celebrate: '庆祝', walk: '散步', sleep: '睡觉', focus: '陪你专注' }[cat.pose]}`}/></PetLife>{cat.bubble && <CatBubble ref={bubbleRef} text={cat.bubble}/>}</>;
  return interactive
    ? <button ref={catRef} type="button" className="room-cat" title={`点一下，摸摸${pet.name}`} aria-label={`摸摸${pet.species}${pet.name}`} data-pet-id={pet.id} onClick={cat.poke}>{body}</button>
    : <div ref={catRef} className="room-cat" data-pet-id={pet.id}>{body}</div>;
}
