import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import PixelCat, { opaqueAt } from './PixelCat';
import { useCatBehaviour } from './RoomCat';
import PetLife from './PetLife';
import '../styles/tokens.css';
import './pet.css';
import { normalizePetId, getPet } from './pet-catalog.mjs';
import { subscribePetSnapshot } from './pet-snapshot.mjs';
import { ACTION_MS, EAT_POSE, HOP_POSE } from './pet-model.mjs';
import { FISH_DRAG_TYPE } from '../cat/cat-care.mjs';

// Double-click (two clicks within this many ms, no drag): the cat hops (docs/entry-map.md).
export const DOUBLE_CLICK_MS = 350;

// The desktop pet: a transparent always-on-top window. Clicks pass through
// everywhere except the painted cat pixels and the speech bubble.
function PetApp() {
  const api = window.albumPet, [snapshot, setSnapshot] = useState(null), [size, setSize] = useState(192), [motion, setMotion] = useState({ mode: 'idle', facing: 1 });
  const petId = normalizePetId(snapshot?.petId || snapshot?.focus?.petId);
  const cat = useCatBehaviour({ petId, focus: snapshot?.focus || {}, playing: Boolean(snapshot?.playing), track: snapshot?.track || '', lastActivity: 0, reduceMotion: Boolean(snapshot?.reduceMotion) });
  const box = useRef(null), frame = useRef(0), hit = useRef(false), drag = useRef(null), [dragging, setDragging] = useState(false);
  // A one-shot action over the usual pose: eat (fed from the menu, a dropped 小鱼干 or the cabin) or hop.
  const [action, setAction] = useState(null), [note, setNote] = useState(''), lastClick = useRef(-Infinity), mounted = useRef(Date.now()), seenFeed = useRef(0);
  const play = (pose) => { const at = performance.now(); setAction({ pose, at }); };
  useEffect(() => { if (!action) return undefined; const timer = setTimeout(() => setAction((now) => now === action ? null : now), ACTION_MS[action.pose] || 800); return () => clearTimeout(timer); }, [action]);
  useEffect(() => { if (!note) return undefined; const timer = setTimeout(() => setNote(''), 2600); return () => clearTimeout(timer); }, [note]);
  const care = snapshot?.care;
  useEffect(() => {
    if (!care?.fedAt || care.fedAt === seenFeed.current) return;
    const fresh = seenFeed.current !== 0 || care.fedAt > mounted.current; seenFeed.current = care.fedAt;
    if (!fresh) return;
    if (care.ok) play(EAT_POSE); else if (care.note) setNote(care.note);
  }, [care?.fedAt, care?.ok, care?.note]);
  useEffect(() => subscribePetSnapshot(api, (value) => {
    if (value.companion) setSnapshot(value.companion);
    if (Number.isFinite(value.size) && value.size > 0) setSize(value.size);
    if (value.motion && typeof value.motion.mode === 'string') setMotion({ mode: value.motion.mode, facing: value.motion.facing < 0 ? -1 : 1 });
  }), [api]);
  useEffect(() => { document.documentElement.style.setProperty('--pet-size', size + 'px'); }, [size]);
  // The shell moves the window when the pet falls or strolls along the screen.
  const travelling = motion.mode === 'walk', airborne = motion.mode === 'fall';
  // Reduced motion still shows the action, as a held frame (PixelCat does not animate then).
  const acting = action ? action.pose : '', pose = acting || (travelling ? 'walk' : cat.pose), accessory = snapshot?.focus?.accessory || '';
  const overCat = (event) => {
    const rect = box.current?.getBoundingClientRect(); if (!rect) return false;
    return opaqueAt(pose, frame.current, accessory, (event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height, petId);
  };
  useEffect(() => {
    const move = (event) => {
      if (drag.current) return;
      const next = overCat(event) || Boolean(event.target.closest?.('.pet-bubble'));
      if (next !== hit.current) { hit.current = next; api?.setHit(next); }
    };
    const leave = () => { if (hit.current && !drag.current) { hit.current = false; api?.setHit(false); } };
    document.addEventListener('pointermove', move); document.addEventListener('pointerleave', leave);
    // Init race (bini): until the first forwarded mousemove the window ignores clicks, so a pointer already
    // resting on the cat could not double-click. Ask the shell where the pointer is and hit-test once.
    if (!hit.current) Promise.resolve(api?.cursor?.()).then((p) => { if (p && Number.isFinite(p.x) && Number.isFinite(p.y) && !hit.current && overCat({ clientX: p.x, clientY: p.y })) { hit.current = true; api?.setHit(true); } }).catch(() => {});
    return () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerleave', leave); };
  }, [pose, accessory, petId]);
  const down = (event) => {
    if (event.button !== 0 || !overCat(event)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.screenX, y: event.screenY, moved: 0 };
  };
  const moveDrag = (event) => {
    const current = drag.current; if (!current) return;
    const dx = event.screenX - current.x, dy = event.screenY - current.y; if (!dx && !dy) return;
    current.x = event.screenX; current.y = event.screenY; current.moved += Math.abs(dx) + Math.abs(dy);
    if (current.moved > 3) { if (!dragging) setDragging(true); queueMove(dx, dy); }
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
    if (current.moved > 3) { api?.dragEnd(); return; }
    if (event.type !== 'pointerup') return;
    const time = performance.now();
    if (time - lastClick.current < DOUBLE_CLICK_MS) { lastClick.current = 0; play(HOP_POSE); } else { lastClick.current = time; cat.poke(); }
  };
  // A 小鱼干 dragged from the cabin's cat panel and dropped on the pet feeds it (the shell lets this
  // window take drops only while that drag lasts).
  const isFish = (event) => [...(event.dataTransfer?.types || [])].includes(FISH_DRAG_TYPE);
  const [dropping, setDropping] = useState(false);
  const dragOver = (event) => { if (!isFish(event)) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; if (!dropping) setDropping(true); };
  const dropFish = (event) => { setDropping(false); if (!isFish(event)) return; event.preventDefault(); api?.command('cat-feed'); };
  const bubble = note || cat.bubble;
  return <div className={`pet-stage ${dropping ? 'is-drop-target' : ''}`} data-reduce-motion={cat.reduced} data-action={acting || undefined} onDragOver={dragOver} onDragLeave={() => setDropping(false)} onDrop={dropFish} onContextMenu={(event) => { event.preventDefault(); api?.menu(); }}>
    {bubble && <div className="pet-bubble" role="status" onClick={() => api?.open()}>{bubble}</div>}
    <div ref={box} style={{ transform: `translateX(${dragging || travelling || airborne ? 0 : cat.x}px) scaleX(${travelling || airborne ? motion.facing : 1})` }} className={`pet-cat ${dragging ? 'is-dragging' : ''} ${airborne ? 'is-falling' : ''} ${motion.mode === 'land' ? 'is-landing' : ''}`} role="button" tabIndex={0} aria-label={`摸摸${getPet(petId).species}${getPet(petId).name}，双击打开小屋`} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); cat.poke(); } }} onPointerDown={down} onPointerMove={moveDrag} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up} onDoubleClick={(event) => { if (overCat(event)) api?.open(); }}>
      <PetLife pose={dragging || airborne ? 'drag' : pose} pokedAt={cat.pokedAt} reduced={cat.reduced}><PixelCat petId={petId} pose={pose} origin={acting ? action.at : 0} accessory={accessory} skin={snapshot?.focus?.catSkin} reduceMotion={cat.reduced} onFrame={(index) => { frame.current = index; }}/></PetLife>
    </div>
  </div>;
}
createRoot(document.getElementById('root')).render(<PetApp/>);
