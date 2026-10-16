import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRecordLibrary } from '../RecordLibrary';
import { matchesLibraryFilters } from '../record-library.mjs';
import { shelfWindow } from '../room-model.mjs';
import { getRoomScene } from '../scene-catalog.mjs';
import { readJSON, writeJSON } from './room-storage.mjs';

export const SORTS = { recent: '最近放上', year: '发行年份', title: '专辑名', artist: '歌手' };
export const DEFAULT_FILTERS = { sort: 'recent', type: 'all', box: 'all', genre: 'all', decade: 'all', provider: 'all' };
const FILTERS_KEY = 'album-circle-shelf-filters-v1';
const BY = { year: (a, b) => (Number(b.year) || 0) - (Number(a.year) || 0), title: (a, b) => String(a.title).localeCompare(String(b.title), 'zh'), artist: (a, b) => String(a.artist).localeCompare(String(b.artist), 'zh'), recent: (a, b) => String(b.addedAt || '').localeCompare(String(a.addedAt || '')) };

// The record shelf: sort / filter (kept on this computer), the three visible
// rows, the selected sleeve, and ↑ ↓ Home End / wheel paging over `stage`.
export default function useShelf({ items, look, stage }) {
  const library = useRecordLibrary();
  const [filters, setFiltersState] = useState(() => readJSON(FILTERS_KEY, DEFAULT_FILTERS));
  const setFilters = useCallback((change) => setFiltersState((old) => { const next = typeof change === 'function' ? change(old) : change; writeJSON(FILTERS_KEY, next); return next; }), []);
  const visible = useMemo(() => {
    const list = items.filter((item) => (filters.type === 'all' || item.type === filters.type) && matchesLibraryFilters(item, library.data, library.roomId, filters));
    return [...list].sort(BY[filters.sort] || BY.recent);
  }, [items, filters, library.data, library.roomId]);
  const columns = getRoomScene(look).geometry.columns.length;
  const [row, setRow] = useState(0), [selectedId, setSelectedId] = useState(visible[0]?.id || '');
  const signature = visible.map((item) => item.id).join('|');
  const view = useMemo(() => shelfWindow(visible, row, columns), [visible, row, columns]);
  const selected = view.items.find((item) => item.id === selectedId) || view.items[0];
  const live = useRef(null); live.current = { visible, columns, view };
  const changeRow = useCallback((next) => { const { visible: list, columns: count } = live.current, value = shelfWindow(list, next, count); setRow(value.startRow); setSelectedId(value.items[0]?.id || ''); }, []);
  useEffect(() => { setRow(0); setSelectedId(visible[0]?.id || ''); }, [signature, look]);
  useEffect(() => {
    const wheel = { amount: 0, time: 0 }, element = stage.current;
    const blocked = (target) => target?.closest?.('input,textarea,select,[contenteditable="true"],dialog,.room-turntable,.shelf-filters,.focus-dock,.listening-corner,.album-wall-overlay') || document.querySelector('dialog[open], .listening-corner, .album-wall-overlay');
    const keydown = (event) => {
      if (blocked(event.target) || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      const { view: current } = live.current;
      event.preventDefault(); changeRow(event.key === 'Home' ? 0 : event.key === 'End' ? current.maxRow : current.startRow + (event.key === 'ArrowDown' ? 1 : -1));
    };
    const onWheel = (event) => {
      if (blocked(event.target) || event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      event.preventDefault(); const now = performance.now();
      if (now - wheel.time > 280 || Math.sign(wheel.amount) !== Math.sign(event.deltaY)) wheel.amount = 0;
      wheel.amount += event.deltaY * (event.deltaMode === 1 ? 18 : event.deltaMode === 2 ? 200 : 1);
      if (Math.abs(wheel.amount) >= 65 && now - wheel.time >= 180) { changeRow(live.current.view.startRow + Math.sign(wheel.amount)); wheel.amount = 0; wheel.time = now; }
    };
    document.addEventListener('keydown', keydown); element.addEventListener('wheel', onWheel, { passive: false });
    return () => { document.removeEventListener('keydown', keydown); element.removeEventListener('wheel', onWheel); };
  }, [changeRow, stage]);
  return { filters, setFilters, visible, view, selected, setSelectedId, changeRow, filtered: visible.length !== items.length };
}
