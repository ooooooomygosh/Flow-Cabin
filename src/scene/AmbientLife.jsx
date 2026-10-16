import React, { memo } from 'react';
import './ambient-life.css';

// Deterministic layout so screenshots and the wallpaper are stable.
const MOTES = Array.from({ length: 14 }, (_, i) => {
  const r = (n) => ((Math.sin((i + 1) * 12.9898 * n) * 43758.5453) % 1 + 1) % 1;
  return { left: 8 + r(1) * 84, top: 18 + r(2) * 60, delay: -r(3) * 14, duration: 10 + r(4) * 8, size: r(5) > .7 ? 2 : 1 };
});

/** Quiet room life layered over the artwork: drifting dust in the lamp light
 *  and a slow window light shaft that follows the time of day. CSS-only
 *  animation (transform/opacity, stepped), nothing runs per frame in JS. */
// The window shaft only has light (--shaft) in the snow-window cabins by day;
// elsewhere it would animate 0 → 0 forever. The unstyled span keeps the motes'
// :nth-child parity (night hides odd ones) identical either way.
export const hasLightShaft = (look, time) => ['pixel', 'warm'].includes(look) && ['morning', 'day', 'dusk'].includes(time);
function AmbientLife({ look = '', time = '' }) {
  return <div className="ambient-life" aria-hidden="true">
    <span className={hasLightShaft(look, time) ? 'ambient-shaft' : undefined}/>
    {MOTES.map((m, i) => <i key={i} className={`ambient-mote size-${m.size}`} style={{ left: `${m.left}%`, top: `${m.top}%`, animationDelay: `${m.delay}s`, animationDuration: `${m.duration}s` }}/>)}
  </div>;
}
export default memo(AmbientLife);
