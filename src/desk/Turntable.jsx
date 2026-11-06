import React, { useId } from 'react';

// The record player on the desk, seen from above as everything on DEsk's desk is, lit by the same lamp
// (low on the right: highlights fall on the lower-right edges, shadows up and to the left). Drawn after
// DEsk's way of drawing a thing (themes/make-icons.py, https://github.com/fyzugx/DEsk, MIT, (c) 2026 The
// DEsk authors): gradients for the shape and its light, a fine turbulence for the grain of the wood.
//   cover    the label: the record's own cover (or nothing: a plain cream label)
//   playing  the platter turns and the arm lies in the groove
//   progress 0..1, how far the arm has travelled across the record
export default function Turntable({ cover = '', playing = false, loaded = false, progress = 0, reduced = false }) {
  const id = useId().replace(/:/g, '');
  const u = (n) => `${n}-${id}`;
  // the arm: at rest beside the platter; on the record it swings from the outer groove (16°) inwards (34°)
  const arm = loaded ? (playing ? 16 + 18 * Math.max(0, Math.min(1, progress)) : 12) : 0;
  // Three layers so the turning record is its own composited layer: the plinth (with its turbulence grain) and the
  // arm never repaint while the record turns (one SVG turning inside the grain repainted the filter every frame).
  const view = '0 0 500 390';
  return <span className={`desk-turntable ${playing ? 'is-playing' : ''} ${reduced ? 'is-still' : ''}`} aria-hidden="true">
    <svg className="desk-tt-layer" viewBox={view}>
      <defs>
        <linearGradient id={u('wood')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3a2416"/><stop offset=".55" stopColor="#5a3a22"/><stop offset="1" stopColor="#6e4a2b"/>
        </linearGradient>
        <filter id={u('grain')} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency=".006 .22" numOctaves="3" seed="7" result="n"/>
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 .1  0 0 0 0 .06  0 0 0 0 .03  0 0 0 .55 -.18"/>
          <feComposite in2="SourceGraphic" operator="in"/>
        </filter>
        <linearGradient id={u('edge')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity=".35"/><stop offset=".6" stopColor="#000" stopOpacity="0"/><stop offset="1" stopColor="#ffd9a0" stopOpacity=".28"/>
        </linearGradient>
        <radialGradient id={u('chrome')} cx=".62" cy=".66" r=".7">
          <stop offset="0" stopColor="#f2efe8"/><stop offset=".45" stopColor="#a9a59d"/><stop offset=".8" stopColor="#5e5b56"/><stop offset="1" stopColor="#d9d4ca"/>
        </radialGradient>
        <filter id={u('drop')} x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="-6" dy="-5" stdDeviation="5" floodColor="#0a0603" floodOpacity=".55"/></filter>
      </defs>
      {/* the plinth */}
      <g filter={`url(#${u('drop')})`}>
        <rect x="6" y="6" width="488" height="378" rx="12" fill={`url(#${u('wood')})`}/>
        <rect x="6" y="6" width="488" height="378" rx="12" fill={`url(#${u('wood')})`} filter={`url(#${u('grain')})`}/>
        <rect x="6" y="6" width="488" height="378" rx="12" fill={`url(#${u('edge')})`}/>
        <rect x="7.5" y="7.5" width="485" height="375" rx="11" fill="none" stroke="#ffdcae" strokeOpacity=".16"/>
      </g>
      {/* the platter: a chrome rim and a rubber mat */}
      <circle cx="190" cy="195" r="168" fill="#0b0b0c" opacity=".55" transform="translate(-4 -4)"/>
      <circle cx="190" cy="195" r="166" fill={`url(#${u('chrome')})`}/>
      <circle cx="190" cy="195" r="158" fill="#202022"/>
    </svg>
    {/* the record, turning: its own layer over the platter (centre 190,195, radius 152 of the 500 x 390 drawing) */}
    <span className="desk-tt-disc" style={{ left: `${38 / 5}%`, top: `${43 / 3.9}%`, width: `${304 / 5}%`, height: `${304 / 3.9}%` }}>
      <svg viewBox="38 43 304 304">
        <defs>
          <radialGradient id={u('grooves')} cx=".5" cy=".5" r=".0105" spreadMethod="repeat">
            <stop offset="0" stopColor="#141414"/><stop offset=".5" stopColor="#1d1d1e"/><stop offset="1" stopColor="#121213"/>
          </radialGradient>
          <clipPath id={u('label')}><circle cx="190" cy="195" r="50"/></clipPath>
        </defs>
        {loaded ? <>
          <circle cx="190" cy="195" r="152" fill={`url(#${u('grooves')})`}/>
          <circle cx="190" cy="195" r="151" fill="none" stroke="#000" strokeWidth="2"/>
          <circle cx="190" cy="195" r="58" fill="#101011"/>
          {cover ? <image href={cover} x="140" y="145" width="100" height="100" preserveAspectRatio="xMidYMid slice" clipPath={`url(#${u('label')})`}/>
            : <circle cx="190" cy="195" r="50" fill="#e9dcc0"/>}
          <circle cx="190" cy="195" r="50" fill="none" stroke="#000" strokeOpacity=".35"/>
          <path d="M190 151 a44 44 0 0 1 30 12" fill="none" stroke="#fff" strokeOpacity=".22" strokeWidth="2"/>
        </> : Array.from({ length: 14 }, (_, i) => <circle key={i} cx="190" cy="195" r={150 - i * 9} fill="none" stroke="#2c2c2f" strokeWidth="1.2"/>)}
      </svg>
    </span>
    <svg className="desk-tt-layer" viewBox={view}>
      <defs>
        <radialGradient id={u('chrome2')} cx=".62" cy=".66" r=".7">
          <stop offset="0" stopColor="#f2efe8"/><stop offset=".45" stopColor="#a9a59d"/><stop offset=".8" stopColor="#5e5b56"/><stop offset="1" stopColor="#d9d4ca"/>
        </radialGradient>
        <linearGradient id={u('sheen')} x1="0" y1="0" x2="1" y2="1">
          <stop offset=".18" stopColor="#fff" stopOpacity="0"/><stop offset=".42" stopColor="#fff" stopOpacity=".10"/><stop offset=".5" stopColor="#fff" stopOpacity=".02"/>
          <stop offset=".66" stopColor="#fff" stopOpacity="0"/><stop offset=".78" stopColor="#ffe6c0" stopOpacity=".12"/><stop offset=".9" stopColor="#fff" stopOpacity="0"/>
        </linearGradient>
        <linearGradient id={u('brush')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8d877d"/><stop offset=".5" stopColor="#e8e3d8"/><stop offset="1" stopColor="#7d776d"/>
        </linearGradient>
      </defs>
      {/* the light on the record stays where the lamp is while the record turns under it */}
      {loaded && <circle cx="190" cy="195" r="152" fill={`url(#${u('sheen')})`}/>}
      <circle cx="190" cy="195" r="5" fill={`url(#${u('chrome2')})`}/>
      {/* the arm: its pivot, its counterweight, the tube and the headshell */}
      <g className="desk-tt-arm" style={{ transform: `rotate(${arm}deg)`, transformOrigin: '420px 82px' }}>
        <rect x="412" y="20" width="16" height="34" rx="4" fill={`url(#${u('brush')})`} transform="rotate(4 420 82)"/>
        <path d="M420 82 L412 300 L400 334" fill="none" stroke="#2b2925" strokeWidth="9" strokeLinecap="round" opacity=".45" transform="translate(-5 -4)"/>
        <path d="M420 82 L412 300 L400 334" fill="none" stroke={`url(#${u('brush')})`} strokeWidth="7" strokeLinecap="round"/>
        <rect x="386" y="326" width="26" height="34" rx="3" fill="#1d1c1a" transform="rotate(22 400 334)"/>
        <rect x="389" y="328" width="20" height="10" rx="2" fill="#c8a35a" transform="rotate(22 400 334)"/>
      </g>
      <circle cx="420" cy="82" r="26" fill="#121110" opacity=".5" transform="translate(-4 -4)"/>
      <circle cx="420" cy="82" r="24" fill={`url(#${u('chrome2')})`}/>
      <circle cx="420" cy="82" r="10" fill="#2a2724"/>
      {/* the speed selector and the lamp */}
      <circle cx="448" cy="350" r="15" fill={`url(#${u('chrome2')})`}/>
      <path d="M448 350 L448 338" stroke="#2a2724" strokeWidth="3" strokeLinecap="round"/>
      <circle cx="410" cy="356" r="4.5" fill={playing ? '#5dff7a' : loaded ? '#ffb347' : '#3b2a20'}/>
    </svg>
  </span>;
}
