import React, { useEffect, useRef, useState } from 'react';
import { onCabinPlayback } from '../scene/playback-listener.mjs';
import { currentBeat, beatLength, sinceBeat } from '../player/beat-clock.mjs';
import './pet-life.css';

/**
 * Wraps a PixelCat with the "alive" layer shared by the room cat, the
 * wallpaper and the desktop pet: breathing, hover perk, poke squish + hearts,
 * drag dangle, Zzz while sleeping, focus dots, celebration sparkles and a
 * music bop: one hop per beat of the song (see src/player/beat-tracker.mjs),
 * its height following the player's energy. Energy is a CSS variable (rAF-
 * coalesced, no re-render per tick); the hop is a Web Animation whose speed
 * changes only with the tempo and whose phase is put back on the beat when it
 * drifts. (A CSS animation whose duration changes jumps to a random phase.)
 */
const LAND = { translate: '0 0', scale: '1.05 .95' }, UP = { translate: '0 calc(-2% - var(--pet-energy) * 5%)', scale: '.98 1.03' };
// Stepped like the sprites: squash on the beat, hop up halfway, come down.
const BOP = [{ ...LAND, offset: 0, easing: 'steps(1, end)' }, { translate: '0 0', scale: '1 1', offset: .15, easing: 'steps(1, end)' }, { ...UP, offset: .4, easing: 'steps(1, end)' }, { translate: '0 calc(-1% - var(--pet-energy) * 2%)', scale: '1 1', offset: .7, easing: 'steps(1, end)' }, { ...LAND, offset: 1 }];
const SHADOW = [{ scale: '1.1 1', opacity: .3, offset: 0, easing: 'steps(1, end)' }, { scale: '1 1', offset: .15, easing: 'steps(1, end)' }, { scale: '.8 1', opacity: .2, offset: .4, easing: 'steps(1, end)' }, { scale: '.9 1', offset: .7, easing: 'steps(1, end)' }, { scale: '1.1 1', opacity: .3, offset: 1 }];
export default function PetLife({ pose = 'idle', pokedAt = 0, reduced = false, children }) {
  const root = useRef(null), [burst, setBurst] = useState(0), first = useRef(true);
  useEffect(() => onCabinPlayback(({ playing, energy }) => {
    root.current?.style.setProperty('--pet-energy', String(playing ? Math.max(.15, energy) : .5));
  }), []);
  useEffect(() => {
    const host = root.current, cat = host?.querySelector(':scope > .pixel-cat');
    if (pose !== 'groove' || reduced || !cat?.animate) return;
    let hop = null, shadow = null;
    const sync = () => {
      const length = beatLength(currentBeat()), phase = sinceBeat(Date.now());
      if (!hop) { hop = cat.animate(BOP, { duration: length, iterations: Infinity }); try { shadow = host.animate(SHADOW, { duration: length, iterations: Infinity, pseudoElement: '::before' }); } catch { shadow = null; } }
      else if (Math.abs(hop.effect.getTiming().duration - length) > 2) { hop.effect.updateTiming({ duration: length }); shadow?.effect.updateTiming({ duration: length }); }
      const at = (Number(hop.currentTime) || 0) % length, drift = Math.min(Math.abs(at - phase), length - Math.abs(at - phase));
      if (drift > 12) { hop.currentTime = phase; if (shadow) shadow.currentTime = phase; }
    };
    const off = onCabinPlayback(sync), timer = setInterval(sync, 2000); // also re-checks the lo-fi / default tempo
    return () => { off(); clearInterval(timer); hop?.cancel(); shadow?.cancel(); };
  }, [pose, reduced]);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (!pokedAt) return;
    setBurst(pokedAt);
    const timer = setTimeout(() => setBurst(0), 950);
    return () => clearTimeout(timer);
  }, [pokedAt]);
  const fx = burst ? ['fx-heart', 3] : pose === 'sleep' ? ['fx-z', 3] : pose === 'focus' ? ['fx-dot', 3] : pose === 'celebrate' ? ['fx-spark', 3] : null;
  return <span ref={root} className={`pet-life ${burst ? 'is-poked' : ''}`} data-pose={pose} data-reduced={String(Boolean(reduced))}>
    {children}
    {fx && <span className="pet-fx" aria-hidden="true" key={burst || pose}>{Array.from({ length: fx[1] }, (_, i) => <i key={i} className={fx[0]}/>)}</span>}
  </span>;
}
