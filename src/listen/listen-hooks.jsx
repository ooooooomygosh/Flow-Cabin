import React, { useCallback, useEffect, useRef, useState } from 'react';
import { readLikes, writeLikes, toggleLike, LIKES_EVENT } from '../player/likes.mjs';
import { onBackgroundChange } from '../frame-clock.mjs';
import RecordSleeve from '../ui/RecordSleeve';

// The hearts on this device (flow-cabin-liked-songs-v1), live across surfaces and windows.
export function useLikes(notify) {
  const [likes, setLikes] = useState(readLikes);
  useEffect(() => { const update = () => setLikes(readLikes()); window.addEventListener(LIKES_EVENT, update); window.addEventListener('storage', update); return () => { window.removeEventListener(LIKES_EVENT, update); window.removeEventListener('storage', update); }; }, []);
  // Toggle any song's heart (not only the one on the deck); useDeck hears LIKES_EVENT.
  const toggle = useCallback((song) => { const next = toggleLike(readLikes(), song); if (!writeLikes(next)) { notify?.('无法保存喜欢，请检查存储空间后重试。', { tone: 'error' }); return false; } setLikes(next); window.dispatchEvent(new Event(LIKES_EVENT)); return true; }, [notify]);
  return [likes, toggle];
}

// One line of the current lyric from the cabin's lyric feed (window.cabinLyricFeed,
// src/lyrics/lyric-feed.mjs), read twice a second while the window is in front.
export function useLyricLine(active) {
  const [line, setLine] = useState(''), [hidden, setHidden] = useState(false);
  useEffect(() => onBackgroundChange(setHidden), []);
  useEffect(() => {
    if (!active || hidden) { if (!active) setLine(''); return; }
    const read = () => { try { const value = window.cabinLyricFeed?.around?.(0, 1)?.current; setLine(typeof value === 'string' ? value.trim().slice(0, 200) : ''); } catch { setLine(''); } };
    read(); const timer = setInterval(read, 500);
    return () => clearInterval(timer);
  }, [active, hidden]);
  return line;
}

// A line that cross-fades when it changes (both lines stay in place; reduced motion swaps).
export function FadeLine({ text, className = '' }) {
  const [state, setState] = useState({ now: text, was: '', n: 0 }), last = useRef(text);
  useEffect(() => { if (last.current === text) return; setState((old) => ({ now: text, was: old.now, n: old.n + 1 })); last.current = text; }, [text]);
  return <span className={`listen-fade ${className}`} title={state.now || undefined}>
    {state.was && <span key={`was-${state.n}`} className="listen-fade-out" aria-hidden="true">{state.was}</span>}
    <span key={`now-${state.n}`} className={state.n ? 'listen-fade-in' : ''}>{state.now || ' '}</span>
  </span>;
}

// ♥ for 我喜欢: an outline, filled once the song is kept (a clear state at a glance).
export const HeartIcon = ({ filled = false, size = 16 }) => <svg aria-hidden="true" className="listen-heart" viewBox="0 0 16 16" width={size} height={size} fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"><path d="M8 13.6 2.6 8.4A3.2 3.2 0 0 1 7.2 3.9L8 4.7l.8-.8a3.2 3.2 0 0 1 4.6 4.5Z"/></svg>;

// A cover, or the record's generated sleeve when there is none (or it fails to load).
export function Cover({ item, src = item?.cover || '', className = '' }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return <span className={`listen-cover ${className}`} aria-hidden="true">{src && !failed ? <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" draggable="false" onError={() => setFailed(true)}/> : <RecordSleeve item={item} title={false}/>}</span>;
}

// A small popover anchored to its button: Escape or a press outside closes it and the
// focus goes back to the button.
export function usePopover() {
  const [open, setOpen] = useState(false), button = useRef(null), panel = useRef(null);
  const close = useCallback((restore = true) => { setOpen(false); if (restore) button.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    if (!open) return;
    const away = (event) => { if (!panel.current?.contains(event.target) && !button.current?.contains(event.target)) close(false); };
    const key = (event) => { if (event.key === 'Escape' && panel.current?.contains(document.activeElement)) { event.preventDefault(); event.stopPropagation(); close(); } };
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', key, true);
    requestAnimationFrame(() => { const target = panel.current?.querySelector('[data-autofocus]') || panel.current; target?.focus?.({ preventScroll: true }); });
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key, true); };
  }, [open, close]);
  return { open, setOpen, toggle: () => open ? close() : setOpen(true), close, button, panel };
}
