import { toSimplified } from './hanzi.mjs';
const norm = value => toSimplified(String(value || '').normalize('NFKC')).toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
export const APPLE_HANDOFF_STATUS = '请在「音乐」App 播放所选歌曲';

// A catalogue URL opens a page, not a recording. Do not claim or control the
// unrelated currentTrack until the observed recording matches the selection.
export function bindAppleHandoff(target, current, identity = null) {
  if (!target || !['playing', 'paused'].includes(current?.state)) return null;
  if (!/^[A-F0-9]{16}$/i.test(current.id || '') || (identity && identity.id !== current.id)) return null;
  if (!norm(target.title) || !norm(target.artist) || norm(target.title) !== norm(current.title)
    || norm(target.artist) !== norm(current.artist)) return null;
  // Older native single imports discarded album and duration. An exact link
  // still opens their page, but title+artist alone cannot identify a recording.
  if (!norm(target.album) || norm(target.album) !== norm(current.album)) return null;
  const wanted = Number(target.duration) || 0, duration = (Number(current.duration) || 0) * 1000;
  if (!Number.isFinite(wanted) || wanted <= 0 || !Number.isFinite(duration) || duration <= 0 || Math.abs(wanted - duration) > 8000) return null;
  return { id: current.id || '', title: current.title, artist: current.artist, album: current.album || '' };
}
