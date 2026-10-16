import { useCallback, useEffect, useRef, useState } from 'react';
import { useDesktopFullscreen } from '../desktop-client';
import { readCabinFullscreen, requestCabinFullscreen } from '../desktop/fullscreen-client.mjs';
import { enterDesktopMode, exitDesktopMode, getDesktopModeStatus, onDesktopModeChange, installDesktopApi } from '../desktop/desktop-sink-client.mjs';
import { readJSON, writeJSON } from './room-storage.mjs';

const DOCK_KEY = 'album-circle-focus-dock-v1';
// A layer above the room owns the keyboard: modal dialogs, 唱机特写, the album wall.
export const roomCovered = (doc = document) => Boolean(doc.querySelector('dialog[open]'));

// Everything around the room: 沉浸 (zen) and its tools, 唱机特写 (corner), the
// focus dock, the filter panel, 桌面模式 / 沉入桌面, fullscreen and the
// matching <html> classes, plus the Z / T / Esc keys.
export default function useRoomChrome({ client, notify }) {
  const [zen, setZen] = useState(false), [zenTools, setZenTools] = useState(false), [corner, setCorner] = useState(false), [filtersOpen, setFiltersOpen] = useState(false);
  const [dock, setDock] = useState(() => readJSON(DOCK_KEY, { open: false, tab: 'timer' }));
  const saveDock = useCallback((change) => setDock((old) => { const next = { ...old, ...change }; writeJSON(DOCK_KEY, next); return next; }), []);
  const fullscreen = useDesktopFullscreen();
  const exitFullscreen = useCallback(() => requestCabinFullscreen({ exit: true }).catch(() => notify?.('无法退出全屏，请重试或使用系统退出全屏快捷键。')), [notify]);
  const toggleZen = useCallback(() => setZen((value) => !value), []);
  // 桌面模式 (browser preview: layout only) and 沉入桌面 (the desktop shell decides).
  const [desktopMode, setDesktopMode] = useState(() => document.documentElement.dataset.desktopMode === 'true');
  const [sink, setSink] = useState(getDesktopModeStatus);
  // The shell announces its legacy 桌面模式 with `album-desktop-mode` (desktop/main.cjs).
  useEffect(() => {
    const mode = (event) => setDesktopMode(Boolean(event.detail?.active));
    window.addEventListener('album-desktop-mode', mode); return () => window.removeEventListener('album-desktop-mode', mode);
  }, []);
  useEffect(() => { document.documentElement.classList.toggle('room-desktop', desktopMode); window.dispatchEvent(new Event('resize')); return () => document.documentElement.classList.remove('room-desktop'); }, [desktopMode]);
  useEffect(() => { installDesktopApi(); setSink(getDesktopModeStatus()); return onDesktopModeChange(setSink); }, [client]);
  const toggleDesktopMode = useCallback(() => { if (!client) { setDesktopMode((value) => !value); return; } const state = getDesktopModeStatus(); if (state.active || state.busy) exitDesktopMode(); else enterDesktopMode(); }, [client]);
  // Settings shows the shell's 沉入桌面 state (unsupported, with its reason, outside the desktop
  // app) and flips it with the toolbar's own toggle.
  const desktop = { state: sink, toggle: toggleDesktopMode };
  useEffect(() => { document.documentElement.classList.toggle('room-zen', zen); document.documentElement.classList.toggle('room-focus-open', dock.open); document.documentElement.classList.toggle('room-filters-open', filtersOpen); }, [zen, dock.open, filtersOpen]);
  useEffect(() => () => document.documentElement.classList.remove('room-zen', 'room-focus-open', 'room-filters-open'), []);
  useEffect(() => { const openCorner = () => setCorner(true); window.addEventListener('cabin-open-corner', openCorner); return () => window.removeEventListener('cabin-open-corner', openCorner); }, []);
  const live = useRef(null); live.current = { zen, corner, dock };
  useEffect(() => {
    const key = (event) => {
      if (event.defaultPrevented || event.repeat || event.target?.closest?.('input,textarea,select,[contenteditable="true"]') || event.altKey || event.ctrlKey || event.metaKey || roomCovered()) return;
      const { zen: isZen, corner: isCorner, dock: panel } = live.current;
      // 唱机特写 is modal: only T (close it again) reaches the room behind it.
      if ((event.key === 'z' || event.key === 'Z') && !isCorner) { event.preventDefault(); setZen((value) => !value); }
      else if ((event.key === 't' || event.key === 'T') && !event.shiftKey) { event.preventDefault(); setCorner((value) => !value); }
      else if (event.key === 'Escape' && !isCorner && !panel.open) {
        if (isZen) setZen(false);
        else if (readCabinFullscreen()) exitFullscreen();
      }
    };
    document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key);
  }, [exitFullscreen]);
  return { zen, setZen, toggleZen, zenTools, setZenTools, corner, setCorner, dock, saveDock, filtersOpen, setFiltersOpen, fullscreen, exitFullscreen, desktopMode, sink, toggleDesktopMode, desktop };
}
