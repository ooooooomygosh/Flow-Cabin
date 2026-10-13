'use strict';
const string = (value, max = 300) => typeof value === 'string' ? value.slice(0, max).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '') : '';
function safeCover(value) {
  try { const url = new URL(value); if (url.protocol !== 'https:' || url.username || url.password || url.port) return ''; return url.href.length <= 4000 ? url.href : ''; } catch { return ''; }
}
function item(value) {
  if (!value || typeof value !== 'object' || !string(value.id)) return null;
  return { id: string(value.id), title: string(value.title), artist: string(value.artist), type: value.type === 'song' ? 'song' : 'album', cover: safeCover(value.cover), tracks: Array.isArray(value.tracks) ? value.tracks.slice(0, 500).map((track) => string(typeof track === 'string' ? track : track?.title)).filter(Boolean) : [] };
}
const PETS = ['cat', 'chick', 'bunny', 'bear', 'fox'], LOOKS = ['warm', 'pixel', 'forest', 'seaside', 'starlight', 'night-study'];
const petId = (value) => PETS.includes(value) ? value : 'cat';
const PHASES = ['idle', 'focus', 'shortBreak', 'longBreak'], WEATHERS = ['snow', 'clear', 'rain', 'starry'], ACCESSORIES = ['', 'headphones', 'scarf', 'beanie'];
const bounded = (value, max) => Number.isFinite(value) ? Math.max(0, Math.min(max, Math.round(value))) : 0;
// Focus state shown by the wallpaper and the desktop pet: no task history.
function cleanFocus(value) {
  if (!value || typeof value !== 'object') return null;
  return { phase: PHASES.includes(value.phase) ? value.phase : 'idle', paused: value.paused === true, remaining: bounded(value.remaining, 4 * 3600000), endsAt: bounded(value.endsAt, 9e15),
    round: bounded(value.round, 1e6), task: string(value.task, 120), fish: bounded(value.fish, 1e9), level: bounded(value.level, 1e4),
    hideSeconds: value.hideSeconds === true, catSkin: value.catSkin === 'black' ? 'black' : 'orange', accessory: ACCESSORIES.includes(value.accessory) ? value.accessory : '', weather: WEATHERS.includes(value.weather) ? value.weather : 'snow' };
}
function cleanCompanion(value) {
  if (!value || typeof value !== 'object') return null;
  const musicPlaying = value.musicPlaying === true, energy = Number(value.energy), bpm = Number(value.bpm), beatAt = Number(value.beatAt);
  const beat = musicPlaying && bpm >= 40 && bpm <= 220 && Number.isFinite(beatAt) && beatAt > 0 ? { bpm: Math.round(bpm * 10) / 10, beatAt: Math.round(beatAt) } : { bpm: 0, beatAt: 0 };
  return { petId: petId(value.petId), focus: cleanFocus(value.focus), playing: value.playing === true, track: string(value.track, 200), reduceMotion: value.reduceMotion === true,
    musicPlaying, energy: musicPlaying && Number.isFinite(energy) ? Math.round(Math.max(0, Math.min(1, energy)) * 100) / 100 : 0, energyEstimated: musicPlaying && value.energyEstimated === true, ...beat };
}
const colour = (value, fallback) => /^#[\da-f]{6}$/i.test(value || '') ? value : fallback;
function cleanSnapshot(value) {
  if (!value || typeof value !== 'object' || !LOOKS.includes(value.look)) return null;
  const record = item(value.record), style = value.recordStyle || {}, tracks = record?.tracks.length || 0;
  return { look: value.look, petId: petId(value.petId), petOut: value.petOut === true, roomName: string(value.roomName, 120), startRow: Number.isSafeInteger(value.startRow) ? Math.max(0, Math.min(100000, value.startRow)) : 0,
    items: Array.isArray(value.items) ? value.items.slice(0, 12).map(item).filter(Boolean) : [], selectedId: string(value.selectedId), record,
    recordStyle: { base: colour(style.base, '#16191d'), opacity: Number.isFinite(style.opacity) ? Math.max(0, Math.min(100, style.opacity)) : 100, splatter: style.splatter === true, splashes: (Array.isArray(style.splashes) && style.splashes.length ? style.splashes : ['#dba746']).slice(0, 3).map((v) => colour(v, '#dba746')) },
    spinning: Boolean(record && value.spinning === true), trackIndex: Math.max(0, Math.min(tracks - 1, Number.isSafeInteger(value.trackIndex) ? value.trackIndex : 0)), reduceMotion: value.reduceMotion === true,
    statusText: string(value.statusText, 200), actualTrack: string(value.actualTrack), provider: ['auto', 'qq', 'netease', 'ma', 'local', 'system'].includes(value.provider) ? value.provider : 'visual',
    weather: WEATHERS.includes(value.weather) ? value.weather : 'snow', accessory: ACCESSORIES.includes(value.accessory) ? value.accessory : '', grooving: value.grooving === true, track: string(value.track, 200), focus: cleanFocus(value.focus) };
}
module.exports = { cleanSnapshot, cleanFocus, cleanCompanion };
