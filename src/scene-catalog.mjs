/** Original room artwork and its interaction geometry. Keep IDs stable in saved settings.
 * `labelEn` is the canonical English scene name (docs, README, logs); `label` is the UI name. */
const pixelGeometry = { columns: [[445, 150], [606, 160], [776, 161], [946, 160]], rows: [[208, 150], [374, 152], [542, 159]] };
const warmGeometry = { columns: [[437, 156], [604, 162], [776, 164], [949, 163]], rows: [[200, 155], [371, 154], [536, 158]] };
// `art` is the shipped illustration; `view` is what the room shows. Vector scenes
// ship a pixel rendering (scripts in docs/art-direction.md) so all rooms share one style.
// Moonlit Study's hi-res sources live in scripts/art/sources (art-script input only).
// Art rows that must stay clear of toolbar/footer: shelf-top deck (art y≥102) to the bottom row.
export const DECK_BAND = Object.freeze({ top: 96, bottom: 701, left: 430, right: 1120 });
// Camera anchor (art px) kept centred while a wide window crops the art: the cabinet.
export const CAMERA_ANCHOR = Object.freeze({ x: 774, y: 448 });
// `floor` (art px): y of the painted floor where the room cat's feet rest, in front of
// the furniture near the cat's home column. Mirrored as --scene-floor in companion-room.css.
// `windows` (art px): where the live sky and weather go (src/CabinAtmosphereSky.jsx).
// box [x, y, w, h]; shape (relative to the box) rect | ellipse | arch; panes = glass rects,
// mullions = frame bars; horizon = fraction of the box where land / sea starts; sun marks the
// window the sun and moon appear in; painted: 'night' when the art shows a night view (the
// land is lifted by day instead of darkened at night); sky: false = the art keeps its own painted (moonlit) sky,
// and the weather keeps to its dark-blue night pixels (mask: 'night').
const cabinWindow = (panes) => [{ box: [188, 170, 218, 286], panes, horizon: .74, sun: true, painted: 'night' }];
const WINDOWS = {
  pixel: cabinWindow([[5, 7, 94, 102], [115, 7, 91, 102], [5, 126, 94, 157], [115, 126, 91, 157]]),
  warm: cabinWindow([[2, 3, 99, 109], [115, 3, 98, 109], [2, 124, 99, 156], [115, 124, 98, 156]]),
  'night-study': [{ box: [320, 120, 420, 344], sky: false, mask: 'night' }],
  forest: [{ box: [80, 120, 284, 480], shape: { type: 'arch', cx: 142, cy: 142, rx: 140, ry: 140 }, mullions: [[137, 0, 10, 480], [0, 216, 284, 10]], horizon: .82, sun: true }],
  seaside: [
    { box: [84, 172, 284, 284], shape: { type: 'ellipse', cx: 142, cy: 143, rx: 139, ry: 139 }, horizon: .59, sun: true },
    { box: [1184, 128, 264, 656], shape: { type: 'arch', cx: 159, cy: 170, rx: 159, ry: 170 }, mullions: [[137, 0, 12, 656], [0, 274, 264, 12]], horizon: .43 }
  ],
  starlight: [{ box: [84, 220, 292, 292], shape: { type: 'ellipse', cx: 145, cy: 145, rx: 143, ry: 143 }, mullions: [[141, 0, 8, 292], [0, 141, 292, 8]], horizon: .63, sun: true }]
};
const deepFreeze = (value) => { if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); } return value; };
const freezeGeometry = (geometry) => Object.freeze({
  columns: Object.freeze(geometry.columns.map((pair) => Object.freeze([...pair]))),
  rows: Object.freeze(geometry.rows.map((pair) => Object.freeze([...pair])))
});
const scenes = [
  { id: 'pixel', floor: 880, labelEn: 'Pixel Cabin', label: '像素小屋', description: '雪窗、木架与暖暖的壁炉', art: '/room-scenes/pixel-cabin.png', pixelArt: '/room-scenes/amber-retreat.png', skyMask: '/room-scenes/pixel-cabin.png', alt: '像素木屋，雪窗、十二格唱片架与壁炉', band: DECK_BAND, geometry: pixelGeometry, pixel: true, style: { accent: '#d8a66c', background: '#36251c' } },
  { id: 'warm', floor: 880, labelEn: 'Amber Cabin', label: '琥珀小屋', description: '泡一杯热茶，在琥珀色灯光里慢慢听歌', art: '/room-scenes/warm-cabin.png', alt: '温馨木屋，雪窗、十二格唱片架与壁炉', band: DECK_BAND, geometry: warmGeometry, pixel: true, style: { accent: '#dba668', background: '#432b1d' } },
  { id: 'night-study', floor: 1000, labelEn: 'Moonlit Study', label: '月夜书桌', description: '暖灯下写几行字，停下来转一转笔', art: '/room-scenes/night-study-pixel.png', alt: '月夜窗边戴耳机写字的女孩，右侧九格木质唱片架', band: { top: 150, bottom: 781, left: 740, right: 1410 }, geometry: { columns: [[846, 170], [1038, 170], [1230, 170]], rows: [[162, 174], [384, 174], [607, 174]] }, pixel: true, style: { accent: '#dba668', background: '#24160f' } },
  { id: 'forest', floor: 900, labelEn: 'Forest Glade', label: '林间书屋', description: '浇浇窗边的植物，转半圈花盆再读几页', art: '/room-scenes/forest-cabin.svg', pixelArt: '/room-scenes/forest-cabin-pixel.png', alt: '林间书屋，拱形森林窗、植物、十二格唱片架与绿色沙发', band: DECK_BAND, geometry: pixelGeometry, pixel: true, style: { accent: '#b7c59a', background: '#3d4e43' } },
  { id: 'seaside', floor: 900, labelEn: 'Seaside', label: '海边慢屋', description: '推开圆窗，让海风陪午后的唱片', art: '/room-scenes/seaside-cabin.svg', pixelArt: '/room-scenes/seaside-cabin-pixel.png', alt: '海边慢屋，圆形海景窗、阳台、浅木唱片架与条纹亚麻椅', band: DECK_BAND, geometry: pixelGeometry, pixel: true, style: { accent: '#bcd4c3', background: '#718b85' } },
  { id: 'starlight', floor: 900, labelEn: 'Starry Night', label: '星夜阁楼', description: '抬起望远镜，亲手连一张想象星图', art: '/room-scenes/starlight-cabin.svg', pixelArt: '/room-scenes/starlight-cabin-pixel.png', alt: '星夜阁楼，星空圆窗、望远镜、十二格唱片架与暖灯阅读椅', band: DECK_BAND, geometry: pixelGeometry, pixel: true, style: { accent: '#c1b7db', background: '#303b50' } }
];

export const ROOM_SCENES = Object.freeze(scenes.map((scene) => Object.freeze({ ...scene, view: scene.pixelArt || scene.art, geometry: freezeGeometry(scene.geometry), band: Object.freeze({ ...scene.band }), shelfFrame: Object.freeze(scene.id === 'night-study' ? { left: 800, right: 1424 } : { left: DECK_BAND.left, right: DECK_BAND.right }), style: Object.freeze(scene.style), windows: deepFreeze(WINDOWS[scene.id] || []) })));
export const ROOM_SCENE_IDS = Object.freeze(ROOM_SCENES.map(({ id }) => id));
const byId = new Map(ROOM_SCENES.map((scene) => [scene.id, scene]));
export function normalizeRoomSceneId(id) { return byId.has(id) ? id : 'pixel'; }
export function getRoomScene(id) { return byId.get(normalizeRoomSceneId(id)); }
