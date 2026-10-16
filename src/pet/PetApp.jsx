import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import PixelCat, { opaqueAt } from './PixelCat';
import { useCatBehaviour } from './RoomCat';
import PetLife from './PetLife';
import '../styles/tokens.css';
import './pet.css';
import { normalizePetId, getPet } from './pet-catalog.mjs';
import { subscribePetSnapshot } from './pet-snapshot.mjs';

// The desktop pet: a transparent always-on-top window. Clicks pass through
// everywhere except the painted cat pixels and the speech bubble.
function PetApp() {
  const api = window.albumPet, [snapshot, setSnapshot] = useState(null), [size, setSize] = useState(192), [motion, setMotion] = useState({ mode: 'idle', facing: 1 });
  const petId = normalizePetId(snapshot?.petId || snapshot?.focus?.petId);
  const cat = useCatBehaviour({ petId, focus: snapshot?.focus || {}, playing: Boolean(snapshot?.playing), track: snapshot?.track || '', lastActivity: 0, reduceMotion: Boolean(snapshot?.reduceMotion) });
  const box = useRef(null), frame = useRef(0), hit = useRef(false), drag = useRef(null), [dragging, setDragging] = useState(false);
  useEffect(() => subscribePetSnapshot(api, (value) => {
    if (value.companion) setSnapshot(value.companion);
    if (Number.isFinite(value.size) && value.size > 0) setSize(value.size);
    if (value.motion && typeof value.motion.mode === 'string') setMotion({ mode: value.motion.mode, facing: value.motion.facing < 0 ? -1 : 1 });
  }), [api]);
  useEffect(() => { document.documentElement.style.setProperty('--pet-size', size + 'px'); }, [size]);
  // The shell moves the window when the pet falls or strolls along the screen.
  const travelling = motion.mode === 'walk', airborne = motion.mode === 'fall';
  const pose = travelling ? 'walk' : cat.pose, accessory = snapshot?.focus?.accessory || '';
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
    if (current.moved > 3) api?.dragEnd(); else if (event.type === 'pointerup') cat.poke();
  };
  return <div className="pet-stage" data-reduce-motion={cat.reduced} onContextMenu={(event) => { event.preventDefault(); api?.menu(); }}>
    {cat.bubble && <div className="pet-bubble" role="status" onClick={() => api?.open()}>{cat.bubble}</div>}
    <div ref={box} style={{ transform: `translateX(${dragging || travelling || airborne ? 0 : cat.x}px) scaleX(${travelling || airborne ? motion.facing : 1})` }} className={`pet-cat ${dragging ? 'is-dragging' : ''} ${airborne ? 'is-falling' : ''} ${motion.mode === 'land' ? 'is-landing' : ''}`} role="button" tabIndex={0} aria-label={`摸摸${getPet(petId).species}${getPet(petId).name}，双击打开小屋`} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); cat.poke(); } }} onPointerDown={down} onPointerMove={moveDrag} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up} onDoubleClick={(event) => { if (overCat(event)) api?.open(); }}>
      <PetLife pose={dragging || airborne ? 'drag' : pose} pokedAt={cat.pokedAt} reduced={cat.reduced}><PixelCat petId={petId} pose={pose} accessory={accessory} skin={snapshot?.focus?.catSkin} reduceMotion={cat.reduced} onFrame={(index) => { frame.current = index; }}/></PetLife>
    </div>
  </div>;
}
createRoot(document.getElementById('root')).render(<PetApp/>);
