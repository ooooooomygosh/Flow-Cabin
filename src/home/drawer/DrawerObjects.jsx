import React from 'react';

// The things that lie on the drawer's felt, drawn flat and from above in the lamp's light (DEsk draws its
// drawer the same way, as flat objects rather than icons: https://github.com/fyzugx/DEsk, MIT,
// (c) 2026 The DEsk authors, docs/design.md 2.4.14, src/draw.c tool_*). Each is an SVG of 140 x 100;
// the shadow it throws comes from CSS (it follows the lamp), so nothing here has one.
// Decoration only: the button around it carries the name.

const Defs = ({ children }) => <defs>{children}</defs>;
const linear = (id, stops, x2 = 0, y2 = 1) => <linearGradient id={id} x1="0" y1="0" x2={x2} y2={y2}>{stops.map(([o, c], i) => <stop key={i} offset={o} stopColor={c}/>)}</linearGradient>;

// 选择小屋 · a swatch album, its colour cards fanned out of the edge
function Album() {
  const chips = [['#e8b66a', -9], ['#7f9f7a', -4], ['#6c8fa0', 1], ['#9a86b8', 6], ['#c97c6a', 11]];
  return <svg viewBox="0 0 140 100" aria-hidden="true">
    <Defs>{linear('dw-album', [[0, '#8a3a3e'], [1, '#5a2024']], 0.4, 1)}{linear('dw-chip', [[0, '#fff'], [1, '#d8cdb8']])}</Defs>
    {chips.map(([colour, turn], i) => <g key={i} transform={`rotate(${turn} 40 60) translate(${i * 3} 0)`}>
      <rect x="62" y="14" width="64" height="58" rx="2" fill="url(#dw-chip)" stroke="rgba(60,40,20,.35)" strokeWidth=".8"/>
      <rect x="66" y="18" width="56" height="38" rx="1" fill={colour}/>
      <rect x="66" y="60" width="30" height="3" fill="rgba(60,40,20,.28)"/>
    </g>)}
    <rect x="12" y="10" width="92" height="80" rx="4" fill="url(#dw-album)" stroke="rgba(30,10,10,.7)" strokeWidth="1"/>
    <rect x="12" y="10" width="14" height="80" rx="4" fill="rgba(0,0,0,.28)"/>
    {[22, 40, 58, 76].map((y) => <circle key={y} cx="19" cy={y} r="3.2" fill="#c9c9cf" stroke="rgba(0,0,0,.6)" strokeWidth=".8"/>)}
    <rect x="38" y="30" width="52" height="34" rx="1.5" fill="#efe6d3" stroke="rgba(60,40,20,.5)" strokeWidth=".8"/>
    {['#e8b66a', '#7f9f7a', '#6c8fa0', '#9a86b8'].map((c, i) => <rect key={c} x={43 + i * 11} y="36" width="9" height="9" fill={c}/>)}
    <path d="M43 54h40M43 59h26" stroke="rgba(46,35,24,.55)" strokeWidth="1.2" strokeLinecap="round"/>
    <path d="M15 12h86" stroke="rgba(255,235,210,.35)" strokeWidth="1.4"/>
  </svg>;
}

// 布置小屋 · a red steel toolbox, handle across the lid
function Toolbox() {
  return <svg viewBox="0 0 140 100" aria-hidden="true">
    <Defs>{linear('dw-tool', [[0, '#d4543b'], [0.5, '#b4412b'], [1, '#8a2b1b']])}{linear('dw-steel', [[0, '#e8e8ec'], [1, '#8d8f97']])}</Defs>
    <rect x="12" y="14" width="116" height="72" rx="6" fill="url(#dw-tool)" stroke="rgba(50,12,6,.8)" strokeWidth="1.2"/>
    <rect x="12" y="52" width="116" height="3" fill="rgba(40,10,4,.5)"/>
    <rect x="12" y="55" width="116" height="1.2" fill="rgba(255,200,180,.35)"/>
    <rect x="42" y="22" width="56" height="12" rx="6" fill="#1b1816" stroke="rgba(0,0,0,.8)" strokeWidth="1"/>
    <rect x="46" y="24" width="48" height="3" rx="1.5" fill="rgba(255,255,255,.22)"/>
    {[26, 104].map((x) => <g key={x}><rect x={x - 7} y="46" width="14" height="14" rx="2" fill="url(#dw-steel)" stroke="rgba(30,30,34,.8)" strokeWidth=".9"/><rect x={x - 4} y="50" width="8" height="3" rx="1" fill="rgba(0,0,0,.35)"/></g>)}
    {[[20, 22], [120, 22], [20, 78], [120, 78]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="2.2" fill="url(#dw-steel)" stroke="rgba(30,10,6,.7)" strokeWidth=".6"/>)}
    <path d="M15 17h110" stroke="rgba(255,220,200,.45)" strokeWidth="1.4"/>
    <path d="M70 62l4 8-4 8" fill="none" stroke="rgba(255,235,220,.22)" strokeWidth="1.2"/>
  </svg>;
}

// 备份与恢复 · a round biscuit tin
function Tin() {
  return <svg viewBox="0 0 140 100" aria-hidden="true">
    <Defs>{linear('dw-rim', [[0, '#e1e5e8'], [0.5, '#9aa1a7'], [1, '#c6ccd1']], 1, 1)}<radialGradient id="dw-lid" cx=".38" cy=".32" r=".8"><stop offset="0" stopColor="#3e76a8"/><stop offset="1" stopColor="#1f4468"/></radialGradient></Defs>
    <circle cx="70" cy="50" r="44" fill="url(#dw-rim)" stroke="rgba(30,34,40,.75)" strokeWidth="1.2"/>
    <circle cx="70" cy="50" r="38" fill="url(#dw-lid)" stroke="rgba(10,25,40,.8)" strokeWidth="1"/>
    <circle cx="70" cy="50" r="31" fill="none" stroke="#d9b45a" strokeWidth="1.6"/>
    <g fill="#f2e3b2">{Array.from({ length: 8 }, (_, i) => { const a = i * Math.PI / 4; return <ellipse key={i} cx={70 + Math.cos(a) * 15} cy={50 + Math.sin(a) * 15} rx="6" ry="3.2" transform={`rotate(${i * 45} ${70 + Math.cos(a) * 15} ${50 + Math.sin(a) * 15})`}/>; })}</g>
    <circle cx="70" cy="50" r="7" fill="#d9b45a" stroke="rgba(60,40,10,.7)" strokeWidth=".8"/>
    <path d="M40 30a38 38 0 0 1 30-12" fill="none" stroke="rgba(255,255,255,.4)" strokeWidth="2.4" strokeLinecap="round"/>
  </svg>;
}

// 全部设置 · a screwdriver lying across the felt
function Screwdriver() {
  return <svg viewBox="0 0 140 100" aria-hidden="true">
    <Defs>{linear('dw-handle', [[0, '#d9803a'], [0.5, '#b8591f'], [1, '#7c3a12']])}{linear('dw-shaft', [[0, '#f2f2f5'], [0.5, '#9a9ca4'], [1, '#6c6e76']])}</Defs>
    <g transform="rotate(-24 70 52)">
      <rect x="10" y="40" width="46" height="24" rx="11" fill="url(#dw-handle)" stroke="rgba(50,20,4,.8)" strokeWidth="1"/>
      {[22, 29, 36, 43].map((x) => <path key={x} d={`M${x} 42v20`} stroke="rgba(50,20,4,.35)" strokeWidth="1.2"/>)}
      <rect x="14" y="43" width="38" height="4" rx="2" fill="rgba(255,225,190,.35)"/>
      <rect x="54" y="45" width="10" height="14" rx="2" fill="url(#dw-shaft)" stroke="rgba(30,30,34,.7)" strokeWidth=".8"/>
      <rect x="64" y="49" width="66" height="6" fill="url(#dw-shaft)" stroke="rgba(30,30,34,.6)" strokeWidth=".7"/>
      <path d="M130 49l6 1.5v3L130 55z" fill="#8d8f97" stroke="rgba(30,30,34,.7)" strokeWidth=".7"/>
      <rect x="66" y="50" width="62" height="1.4" fill="rgba(255,255,255,.65)"/>
    </g>
  </svg>;
}

// 场景配方 · a recipe card, written in pencil
function Recipe() {
  return <svg viewBox="0 0 140 100" aria-hidden="true">
    <Defs>{linear('dw-card', [[0, '#fbf6e8'], [1, '#eadfc5']], 1, 1)}</Defs>
    <g transform="rotate(-4 70 50)">
      <rect x="14" y="14" width="112" height="72" rx="1.5" fill="url(#dw-card)" stroke="rgba(80,60,30,.45)" strokeWidth=".9"/>
      <path d="M14 30h112" stroke="#c4553f" strokeWidth="1.2"/>
      {[40, 49, 58, 67, 76].map((y) => <path key={y} d={`M18 ${y}h104`} stroke="rgba(70,110,170,.4)" strokeWidth=".8"/>)}
      <path d="M22 24c4-5 6 3 10-2s6 3 10-1 7 2 11-1" fill="none" stroke="#3a2e22" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M22 45c5-3 7 2 12-1s8 2 13-1M22 54c6-3 9 2 15-1s9 1 14-1M22 63c4-2 8 2 12-1" fill="none" stroke="rgba(58,46,34,.75)" strokeWidth="1.2" strokeLinecap="round"/>
      <circle cx="104" cy="66" r="9" fill="none" stroke="rgba(120,70,30,.28)" strokeWidth="2"/>
    </g>
  </svg>;
}

// 睡前模式 · a small night lamp, its dome glowing
function Lamp() {
  return <svg viewBox="0 0 140 100" aria-hidden="true">
    <Defs><radialGradient id="dw-glow" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="rgba(255,214,120,.55)"/><stop offset="1" stopColor="rgba(255,214,120,0)"/></radialGradient><radialGradient id="dw-dome" cx=".4" cy=".3" r=".8"><stop offset="0" stopColor="#fff2c0"/><stop offset="1" stopColor="#e8a94c"/></radialGradient>{linear('dw-base', [[0, '#8a5a34'], [1, '#4a2c16']])}</Defs>
    <circle cx="70" cy="48" r="48" fill="url(#dw-glow)"/>
    <ellipse cx="70" cy="80" rx="26" ry="9" fill="url(#dw-base)" stroke="rgba(30,15,6,.8)" strokeWidth="1"/>
    <rect x="62" y="56" width="16" height="24" fill="url(#dw-base)"/>
    <path d="M36 58a34 34 0 0 1 68 0z" fill="url(#dw-dome)" stroke="rgba(110,60,10,.7)" strokeWidth="1"/>
    <path d="M44 52a26 26 0 0 1 22-20" fill="none" stroke="rgba(255,255,255,.55)" strokeWidth="2.4" strokeLinecap="round"/>
    <path d="M70 80c14 2 30 6 44 4" fill="none" stroke="#2a2420" strokeWidth="2" strokeLinecap="round"/>
    <path d="M86 30l3-5 3 5-5-3h5z" fill="rgba(120,70,20,.5)"/>
  </svg>;
}

// 小屋明信片 · a compact camera
function Camera() {
  return <svg viewBox="0 0 140 100" aria-hidden="true">
    <Defs>{linear('dw-body', [[0, '#34312f'], [1, '#161413']])}{linear('dw-top', [[0, '#e6e7ea'], [1, '#9b9da4']])}<radialGradient id="dw-lens" cx=".38" cy=".34" r=".75"><stop offset="0" stopColor="#7aa3c4"/><stop offset=".45" stopColor="#1d3550"/><stop offset="1" stopColor="#070b12"/></radialGradient></Defs>
    <rect x="12" y="22" width="116" height="60" rx="8" fill="url(#dw-body)" stroke="rgba(0,0,0,.85)" strokeWidth="1.2"/>
    <rect x="12" y="22" width="116" height="16" rx="7" fill="url(#dw-top)" stroke="rgba(30,30,34,.7)" strokeWidth="1"/>
    <rect x="22" y="26" width="20" height="9" rx="2" fill="#1b1a1a"/>
    <rect x="26" y="28" width="12" height="4" rx="1" fill="#e7c14d"/>
    <circle cx="106" cy="30" r="5" fill="#c9332a" stroke="rgba(40,10,8,.8)" strokeWidth=".8"/>
    <circle cx="86" cy="58" r="23" fill="#0d0d0e" stroke="rgba(0,0,0,.9)" strokeWidth="1"/>
    <circle cx="86" cy="58" r="20" fill="url(#dw-top)" stroke="rgba(40,40,44,.8)" strokeWidth=".8"/>
    <circle cx="86" cy="58" r="15" fill="url(#dw-lens)" stroke="#050505" strokeWidth="1.4"/>
    <path d="M77 52a11 11 0 0 1 9-5" fill="none" stroke="rgba(255,255,255,.7)" strokeWidth="2" strokeLinecap="round"/>
    <rect x="22" y="52" width="26" height="6" rx="1.5" fill="rgba(255,255,255,.07)"/>
    <path d="M16 78h108" stroke="rgba(255,255,255,.08)" strokeWidth="1.2"/>
  </svg>;
}

// anything else: a card with a turned-down corner
function Card() {
  return <svg viewBox="0 0 140 100" aria-hidden="true">
    <Defs>{linear('dw-plain', [[0, '#fbf6e8'], [1, '#eadfc5']], 1, 1)}</Defs>
    <g transform="rotate(2 70 50)">
      <path d="M22 14h80l16 16v56H22z" fill="url(#dw-plain)" stroke="rgba(80,60,30,.45)" strokeWidth=".9"/>
      <path d="M102 14v16h16" fill="#d9ceb4" stroke="rgba(80,60,30,.4)" strokeWidth=".8"/>
      {[44, 54, 64, 74].map((y) => <path key={y} d={`M30 ${y}h80`} stroke="rgba(70,110,170,.4)" strokeWidth=".8"/>)}
    </g>
  </svg>;
}

const DRAWN = { album: Album, toolbox: Toolbox, tin: Tin, screwdriver: Screwdriver, recipe: Recipe, lamp: Lamp, camera: Camera, card: Card };
export default function DrawerObject({ kind }) {
  const Drawn = DRAWN[kind] || Card;
  return <Drawn/>;
}
