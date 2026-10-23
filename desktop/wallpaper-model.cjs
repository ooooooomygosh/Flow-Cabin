'use strict';
const { cleanPetPack }=require('./pet-pack-metadata.cjs');
const string = (value, max = 300) => typeof value === 'string' ? value.slice(0, max).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '') : '';
function safeCover(value) {
  try { const url = new URL(value); if (url.protocol !== 'https:' || url.username || url.password || url.port) return ''; return url.href.length <= 4000 ? url.href : ''; } catch { return ''; }
}
function item(value) {
  if (!value || typeof value !== 'object' || !string(value.id)) return null;
  return { id: string(value.id), title: string(value.title), artist: string(value.artist), type: value.type === 'song' ? 'song' : 'album', cover: safeCover(value.cover), tracks: Array.isArray(value.tracks) ? value.tracks.slice(0, 500).map((track) => string(typeof track === 'string' ? track : track?.title)).filter(Boolean) : [] };
}
const PETS = ['cat', 'chick', 'bunny', 'bear', 'fox'], LOOKS = ['warm', 'pixel', 'forest', 'seaside', 'starlight', 'night-study', 'rain-train', 'greenhouse'];
const petId = (value) => PETS.includes(value) ? value : 'cat';
const PHASES = ['idle', 'focus', 'shortBreak', 'longBreak'], WEATHERS = ['snow', 'clear', 'rain', 'starry'], ACCESSORIES = ['', 'headphones', 'scarf', 'beanie', 'bow', 'sprout'];
// Mirrors of renderer catalogs (main never loads ../src); test/catalog-contract.test.cjs keeps them equal.
const DECK_PROVIDERS = ['visual', 'auto', 'qq', 'netease', 'local', 'appleMusic', 'ma', 'system'];
const FACES = ['flip', 'ring', 'record', 'minimal', 'window', 'growth'], SHOWS = ['auto', 'clock', 'timer'];
const bounded = (value, max) => Number.isFinite(value) ? Math.max(0, Math.min(max, Math.round(value))) : 0;
// Focus state shown by the wallpaper and the desktop pet: no task history.
function cleanFocus(value) {
  if (!value || typeof value !== 'object') return null;
  const phase = PHASES.includes(value.phase) ? value.phase : 'idle';
  return { phase, paused: value.paused === true, remaining: bounded(value.remaining, 4 * 3600000), endsAt: bounded(value.endsAt, 9e15),
    // 2.2: 免打扰, overtime (到点后继续计时) and when the round started (pet bubble moments).
    quietMode: value.quietMode === true, due: phase === 'focus' && value.due === true, over: bounded(value.over, 3 * 3600000), startedAt: bounded(value.startedAt, 9e15),
    round: bounded(value.round, 1e6), duration: bounded(value.duration, 4 * 3600000), longEvery: Math.max(2, Math.min(8, bounded(value.longEvery, 8) || 4)), task: string(value.task, 120), fish: bounded(value.fish, 1e9), level: bounded(value.level, 1e4),
    hideSeconds: value.hideSeconds === true, catSkin: value.catSkin === 'black' ? 'black' : 'orange', accessory: ACCESSORIES.includes(value.accessory) ? value.accessory : '',
    unlockedAccessories: [...new Set((Array.isArray(value.unlockedAccessories) ? value.unlockedAccessories : []).filter((id) => ACCESSORIES.includes(id) && id))],
    weather: WEATHERS.includes(value.weather) ? value.weather : 'snow' };
}
// The 专注画面 choice (album-circle-focus-display-v1): '' follows the scene's default face.
function cleanFocusDisplay(value) {
  const v = value && typeof value === 'object' ? value : {};
  return { mode: FACES.includes(v.mode) ? v.mode : '', show: SHOWS.includes(v.show) ? v.show : 'auto', seconds: v.seconds === true };
}
// The last feed attempt (src/cat/useCatCare.js careForCompanion): display data only.
// Tiers are src/cat/cat-care.mjs tierOf ('droopy' = 无精打采); 'sleepy' is kept for older pages.
const TIERS = ['happy', 'ok', 'droopy', 'sleepy'];
function cleanCare(value) {
  const fedAt = Number(value?.fedAt);
  return { fedAt: Number.isFinite(fedAt) && fedAt > 0 ? Math.round(fedAt) : 0, ok: value?.ok === true, note: string(value?.note, 80), tier: TIERS.includes(value?.tier) ? value.tier : '', feedsToday: bounded(Number(value?.feedsToday), 99) };
}
// The deck's song for the mini player, tray and taskbar (src/room/useDeck.js › cabinNowPlaying).
// Display data only: the cover is https or a small inline image, never a stream or file URL.
const PROVIDER_IDS = ['auto', 'qq', 'netease', 'local', 'appleMusic', 'ma', 'system'];
function safeArtwork(value) { if (typeof value !== 'string') return ''; if (/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(value)) return value.length <= 200000 ? value : ''; return safeCover(value); }
const seconds = (value, max = 24 * 3600) => Number.isFinite(Number(value)) ? Math.max(0, Math.min(max, Math.round(Number(value) * 10) / 10)) : 0;
function cleanNowPlaying(value) {
  if (!value || typeof value !== 'object' || !string(value.title)) return null;
  const duration = seconds(value.duration), volume = Number(value.volume);
  return { title: string(value.title, 200), artist: string(value.artist, 200), album: string(value.album, 200), cover: safeArtwork(value.cover), playing: value.playing === true,
    position: Math.min(seconds(value.position), duration || 24 * 3600), duration, provider: PROVIDER_IDS.includes(value.provider) ? value.provider : 'auto',
    canSeek: value.canSeek === true && duration > 0, canVolume: value.canVolume === true, volume: Number.isFinite(volume) ? Math.max(0, Math.min(1, Math.round(volume * 100) / 100)) : 0, muted: value.muted === true, liked: value.liked === true,
    at: Number.isFinite(Number(value.at)) && Number(value.at) > 0 ? Math.round(Number(value.at)) : 0 };
}
function cleanCompanion(value) {
  if (!value || typeof value !== 'object') return null;
  const musicPlaying = value.musicPlaying === true, energy = Number(value.energy), bpm = Number(value.bpm), beatAt = Number(value.beatAt), lofiBpm = Number(value.lofiBpm);
  const beat = musicPlaying && bpm >= 40 && bpm <= 220 && Number.isFinite(beatAt) && beatAt > 0 ? { bpm: Math.round(bpm * 10) / 10, beatAt: Math.round(beatAt) } : { bpm: 0, beatAt: 0 };
  return { ...(require('./pet-pack.cjs').ACTIONS.includes(value.pose)?{pose:value.pose}:{}), petId: petId(value.petId), petPack: cleanPetPack(value.petPack), focus: cleanFocus(value.focus), playing: value.playing === true, track: string(value.track, 200), reduceMotion: value.reduceMotion === true,
    lofiBpm: !musicPlaying && value.playing === true && Number.isFinite(lofiBpm) && lofiBpm >= 40 && lofiBpm <= 220 ? Math.round(lofiBpm * 10) / 10 : 0,
    musicPlaying, energy: musicPlaying && Number.isFinite(energy) ? Math.round(Math.max(0, Math.min(1, energy)) * 100) / 100 : 0, energyEstimated: musicPlaying && value.energyEstimated === true, ...beat, care: cleanCare(value.care),
    // 键鼠跟随 fallback: when the cabin last saw a keydown / pointerdown (a time only).
    typingAt: Number.isFinite(Number(value.typingAt)) && Number(value.typingAt) > 0 ? Math.round(Number(value.typingAt)) : 0,
    clickAt: Number.isFinite(Number(value.clickAt)) && Number(value.clickAt) > 0 ? Math.round(Number(value.clickAt)) : 0,
    nowPlaying: cleanNowPlaying(value.nowPlaying), lyric: string(value.lyric, 300) };
}
const colour = (value, fallback) => /^#[\da-f]{6}$/i.test(value || '') ? value : fallback;
function cleanSnapshot(value) {
  if (!value || typeof value !== 'object' || !LOOKS.includes(value.look)) return null;
  const record = item(value.record), style = value.recordStyle || {}, tracks = record?.tracks.length || 0;
  return { look: value.look, petId: petId(value.petId), petOut: value.petOut === true, roomName: string(value.roomName, 120), startRow: Number.isSafeInteger(value.startRow) ? Math.max(0, Math.min(100000, value.startRow)) : 0,
    items: Array.isArray(value.items) ? value.items.slice(0, 12).map(item).filter(Boolean) : [], selectedId: string(value.selectedId), record,
    recordStyle: { base: colour(style.base, '#16191d'), opacity: Number.isFinite(style.opacity) ? Math.max(0, Math.min(100, style.opacity)) : 100, splatter: style.splatter === true, splashes: (Array.isArray(style.splashes) && style.splashes.length ? style.splashes : ['#dba746']).slice(0, 3).map((v) => colour(v, '#dba746')) },
    spinning: Boolean(record && value.spinning === true), trackIndex: Math.max(0, Math.min(tracks - 1, Number.isSafeInteger(value.trackIndex) ? value.trackIndex : 0)), reduceMotion: value.reduceMotion === true,
    statusText: string(value.statusText, 200), actualTrack: string(value.actualTrack), provider: DECK_PROVIDERS.includes(value.provider) ? value.provider : 'visual',
    weather: WEATHERS.includes(value.weather) ? value.weather : 'snow', accessory: ACCESSORIES.includes(value.accessory) ? value.accessory : '', grooving: value.grooving === true, track: string(value.track, 200), focus: cleanFocus(value.focus), focusDisplay: cleanFocusDisplay(value.focusDisplay) };
}
module.exports = { cleanSnapshot, cleanFocus, cleanFocusDisplay, cleanCompanion, cleanNowPlaying, CATALOG_IDS: Object.freeze({ looks: LOOKS, faces: FACES, shows: SHOWS, pets: PETS, phases: PHASES, weathers: WEATHERS, accessories: ACCESSORIES, providers: DECK_PROVIDERS }) };
