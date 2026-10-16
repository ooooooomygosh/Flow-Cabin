// Scene palettes for the focus faces. Every face reads only these ramps
// (dark → light), so a face drawn in 琥珀小屋 is walnut and brass, and the same
// face in 星夜阁楼 is navy lacquer and silver. Wood ramps follow the scene deck
// (scene/deck-sprite.mjs DECK_PALETTES); one light, from the top-left.
const AMBER = {
  outline: '#0d0805',
  wood: ['#2f1a0d', '#4a2a16', '#6b3f22', '#8a5530', '#a8693b'],
  metal: ['#7a5228', '#a8743c', '#d4a46b', '#ffd99c'],
  paper: ['#a88a62', '#cdb48c', '#e9d6b4', '#f6e8cc', '#fff7e6'],
  ink: ['#2f1a0d', '#5a3a20'],
  glow: ['#a8743c', '#e0ad69', '#ffd99c'],
  rest: ['#4f7a45', '#9ccf8c', '#d5f2c8'],
  night: ['#120b06', '#1c120b', '#2a1a10', '#3a2416'],
  cream: '#ffe9cb',
  cloth: ['#6e2f22', '#9c4a34', '#c46d4e'],
  pot: ['#7a3b22', '#a8573a', '#cf7a52'],
  leaf: ['#2f4a24', '#4f7a35', '#7fa64f', '#b5d27a'],
  bloom: ['#c46d4e', '#ffb08f'],
  bead: 'brass', beads: ['#a8743c', '#d4a46b', '#ffd99c'], beadOff: ['#24160d', '#3a2416'],
  vinyl: ['#0f0c0b', '#1f1916', '#3a302a', '#6a5a4c'],
  horizon: 'pines', snow: true
};
const scene = (over) => Object.freeze({ ...AMBER, ...over });
export const FACE_PALETTES = Object.freeze({
  warm: scene({}),
  pixel: scene({ glow: ['#a8743c', '#d8a66c', '#ffd99c'] }),
  'night-study': scene({
    wood: ['#1e130c', '#33210f', '#4b3019', '#6a4426', '#86562f'], glow: ['#a8743c', '#dba668', '#ffe2a8'],
    night: ['#0b0806', '#140e0a', '#21160f', '#2f2015'], cloth: ['#24304a', '#34466a', '#4d6390'],
    bead: 'amber', beads: ['#a8743c', '#dba668', '#ffe2a8'], horizon: 'roofs', snow: false
  }),
  forest: scene({
    wood: ['#3b3020', '#5a4a32', '#6e5c3f', '#7d6a48', '#94805a'], metal: ['#6b5a2c', '#9a8442', '#c9b26a', '#ece0a4'],
    paper: ['#9a9c78', '#bfc19a', '#dcdcb8', '#ecebd0', '#f7f6e6'], ink: ['#22301f', '#3f5236'],
    glow: ['#7d8f5c', '#b7c59a', '#e2ecc4'], night: ['#0e130e', '#141a14', '#1f2a21', '#2e3b2f'], cream: '#eef2dc',
    cloth: ['#4a5a2e', '#6b7d3f', '#8fa258'], bead: 'leaf', beads: ['#4f7a35', '#7fa64f', '#b5d27a'], beadOff: ['#1a231a', '#2a352a'],
    bloom: ['#e0ad69', '#ffe2a8'], horizon: 'forest', snow: false
  }),
  seaside: scene({
    wood: ['#735f45', '#9c8462', '#b09774', '#bca684', '#cfbc98'], metal: ['#6f7f7c', '#9fb0ab', '#cfdcd6', '#f4faf6'],
    paper: ['#a9b5ab', '#cfd8cf', '#e6ece4', '#f3f6f0', '#ffffff'], ink: ['#24363b', '#3f5458'],
    glow: ['#7f9e93', '#bcd4c3', '#e6f2ea'], night: ['#121b1d', '#1b2628', '#26363a', '#36494c'], cream: '#f1f6f0',
    cloth: ['#5d7f8a', '#86a9b2', '#b6d0d4'], bead: 'shell', beads: ['#b98a7a', '#e8c4b0', '#fff1e4'], beadOff: ['#2b3a3b', '#3c4f50'],
    bloom: ['#e8a48c', '#fff1e4'], horizon: 'sea', snow: false
  }),
  starlight: scene({
    wood: ['#262c3d', '#3d4660', '#55607e', '#6b7596', '#8a93b0'], metal: ['#5b5f78', '#7d8199', '#b9bfd6', '#eef0ff'],
    paper: ['#9e98b8', '#c9c4dc', '#e1ddef', '#efecf8', '#fbfaff'], ink: ['#1c2038', '#353b5c'],
    glow: ['#8a7fb0', '#c1b7db', '#ece6ff'], night: ['#0b0d16', '#11141f', '#1a1f2e', '#262c3d'], cream: '#ece9ff',
    cloth: ['#3a2f5c', '#54457f', '#7462a6'], bead: 'star', beads: ['#8a7fb0', '#c1b7db', '#f4f0ff'], beadOff: ['#171b29', '#232a3c'],
    bloom: ['#c1b7db', '#f4f0ff'], horizon: 'roofs', snow: false
  })
});
export const facePalette = (look) => FACE_PALETTES[look] || FACE_PALETTES.pixel;
// Breaks swap the accent ramp for moss.
export const phaseGlow = (pal, phase) => phase === 'shortBreak' || phase === 'longBreak' ? pal.rest : pal.glow;
