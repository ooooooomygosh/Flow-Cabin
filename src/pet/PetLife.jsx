import React, { useEffect, useRef, useState } from 'react';
import { onCabinPlayback, quantiseEnergy } from '../scene/playback-listener.mjs';
import { currentBeat, beatLength, sinceBeat } from '../player/beat-clock.mjs';
import { onBackgroundChange } from '../frame-clock.mjs';
import { HOP_ART_PIXELS, hopArtPixels, hopDownArtPixels } from './pet-motion.mjs';
import './pet-life.css';
export { HOP_ART_PIXELS, hopArtPixels, hopDownArtPixels };

/**
 * Wraps a PixelCat with the "alive" layer shared by the room cat, the
 * wallpaper and the desktop pet: breathing, hover perk, poke squish + hearts,
 * drag dangle, Zzz while sleeping, focus dots, celebration sparkles and a
 * music bop: one hop per beat of the song (see src/player/beat-tracker.mjs),
 * its height following the player's energy.
 *
 * Energy is a CSS variable, never React state (no re-render per tick). It
 * arrives at ~15 Hz, so it is quantised to eighths and written only when the
 * level changes — the same model as --deck-energy (scene/playback-listener.mjs).
 * The hop height is counted in art pixels (--pet-hop): the cat's sprite is
 * 32 art px wide, so one art pixel is 100%/32 of the element and the hop
 * lands on the art grid at every size (a fraction would blur the sprite).
 *
 * The hop is a Web Animation whose speed changes only with the tempo and whose
 * phase is put back on the beat when it drifts. (A CSS animation whose duration
 * changes jumps to a random phase.)
 */
// The bop is scaled by the player's energy (docs/art-direction.md): --pet-energy
// (0..1, quantised to eighths) says how hard the cat squashes, and --pet-hop
// (that same energy mapped onto whole art pixels) says how high it jumps. The
// squash is a ratio, so it may be fractional; the jump may not.
const squash = (k) => `calc(1 + var(--pet-energy, .5) * ${k}) calc(1 - var(--pet-energy, .5) * ${k})`;
const LAND = { translate: '0 0', scale: squash(.05) }, UP = { translate: '0 calc(-100% / 32 * var(--pet-hop, 0))', scale: 'calc(1 - var(--pet-energy, .5) * .02) calc(1 + var(--pet-energy, .5) * .03)' };
// Stepped like the sprites: squash on the beat, hop up halfway, come down.
const BOP = [{ ...LAND, offset: 0, easing: 'steps(1, end)' }, { translate: '0 0', scale: '1 1', offset: .15, easing: 'steps(1, end)' }, { ...UP, offset: .4, easing: 'steps(1, end)' }, { translate: '0 calc(-100% / 32 * var(--pet-hop-down, 0))', scale: '1 1', offset: .7, easing: 'steps(1, end)' }, { ...LAND, offset: 1 }];
const SHADOW = [{ scale: '1.1 1', opacity: .3, offset: 0, easing: 'steps(1, end)' }, { scale: '1 1', offset: .15, easing: 'steps(1, end)' }, { scale: '.8 1', opacity: .2, offset: .4, easing: 'steps(1, end)' }, { scale: '.9 1', offset: .7, easing: 'steps(1, end)' }, { scale: '1.1 1', opacity: .3, offset: 1 }];
// The hop is a whole number of art pixels (the sprite is 32 art px wide), so
// the sprite never shifts by a fraction of a pixel and never resamples.
// (hopArtPixels / hopDownArtPixels live in pet-motion.mjs so they can be tested.)
// Writes --pet-hop only when it changes: a style write per tick would undo
// the point of quantising the energy.
const writeHop = (node, energy) => {
  if (!node) return;
  const hop = hopArtPixels(energy), down = hopDownArtPixels(hop);
  if (node.style.getPropertyValue('--pet-hop') !== String(hop)) node.style.setProperty('--pet-hop', String(hop));
  if (node.style.getPropertyValue('--pet-hop-down') !== String(down)) node.style.setProperty('--pet-hop-down', String(down));
};
export default function PetLife({ pose = 'idle', pokedAt = 0, reduced = false, children }) {
  const root = useRef(null), [burst, setBurst] = useState(0), first = useRef(true);
  const level = useRef(null);
  useEffect(() => {
    // ~15 Hz in, eight levels out: the hop is stepped, and the style is only
    // touched when the level really changes.
    return onCabinPlayback((detail) => {
      const next = detail.playing ? Math.max(.125, quantiseEnergy(detail, 8)) : 0;
      if (next === level.current) return;
      level.current = next;
      root.current?.style.setProperty('--pet-energy', String(next));
      writeHop(root.current, next);
    });
  }, []);
  useEffect(() => {
    const host = root.current, cat = host?.querySelector(':scope > .pixel-cat');
    if (pose !== 'groove' || reduced || !cat?.animate) return;
    let hop = null, shadow = null, timer = null, background = false;
    const stop = () => { hop?.cancel(); shadow?.cancel(); hop = null; shadow = null; };
    const sync = () => {
      if (background) return;
      const length = beatLength(currentBeat()), phase = sinceBeat(Date.now());
      if (!hop) { hop = cat.animate(BOP, { duration: length, iterations: Infinity }); try { shadow = host.animate(SHADOW, { duration: length, iterations: Infinity, pseudoElement: '::before' }); } catch { shadow = null; } }
      else if (Math.abs(hop.effect.getTiming().duration - length) > 2) { hop.effect.updateTiming({ duration: length }); shadow?.effect.updateTiming({ duration: length }); }
      const at = (Number(hop.currentTime) || 0) % length, drift = Math.min(Math.abs(at - phase), length - Math.abs(at - phase));
      if (drift > 12) { hop.currentTime = phase; if (shadow) shadow.currentTime = phase; }
    };
    const off = onCabinPlayback(sync);
    const startTimer = () => { if (timer == null) timer = setInterval(sync, 2000); }; // also re-checks the lo-fi / default tempo
    startTimer();
    // The hop is a Web Animation, so the CSS kill switch (animation-play-state)
    // cannot reach it: a minimized cabin would keep the cat bouncing. The
    // shared clock knows when the app is in the background — stop there.
    // The 2s re-sync timer has to stop as well: left running, it revives the
    // hop two seconds later and the cat keeps bouncing in the background.
    const offBackground = onBackgroundChange((value) => {
      background = value;
      if (background) { clearInterval(timer); timer = null; stop(); }
      else { startTimer(); sync(); }
    });
    return () => { off(); offBackground(); clearInterval(timer); timer = null; stop(); };
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
