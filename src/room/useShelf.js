import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRecordLibrary } from '../RecordLibrary';
import { matchesLibraryFilters } from '../record-library.mjs';
import { shelfWindow } from '../room-model.mjs';
import { getRoomScene } from '../scene-catalog.mjs';
import { readJSON, writeJSON } from './room-storage.mjs';

export const SORTS = { recent: '最近放上', year: '发行年份', title: '专辑名', artist: '歌手' };
export const DEFAULT_FILTERS = { sort: 'recent', type: 'all', box: 'all', genre: 'all', decade: 'all', provider: 'all' };
const FILTERS_KEY = 'album-circle-shelf-filters-v1';
const BY = { year: (a, b) => (Number(b.year) || 0) - (Number(a.year) || 0), title: (a, b) => String(a.title).localeCompare(String(b.title), 'zh'), artist: (a, b) => String(a.artist).localeCompare(String(b.artist), 'zh'), recent: (a, b) => String(b.addedAt || '').localeCompare(String(a.addedAt || '')) };

// The record shelf's data: sort / filter (kept on this computer), the filtered list, the selected
// record and the first rows the desktop wallpaper's rack shows. Paging and keys belong to the
// 唱片架 close-up (src/listen/RecordShelf.jsx), which handles its own.
export default function useShelf({ items, look }) {
  const library = useRecordLibrary();
  const [filters, setFiltersState] = useState(() => readJSON(FILTERS_KEY, DEFAULT_FILTERS));
  const setFilters = useCallback((change) => setFiltersState((old) => { const next = typeof change === 'function' ? change(old) : change; writeJSON(FILTERS_KEY, next); return next; }), []);
  const visible = useMemo(() => {
    const list = items.filter((item) => (filters.type === 'all' || item.type === filters.type) && matchesLibraryFilters(item, library.data, library.roomId, filters));
    return [...list].sort(BY[filters.sort] || BY.recent);
  }, [items, filters, library.data, library.roomId]);
  const columns = getRoomScene(look).geometry.columns.length;
  const [selectedId, setSelectedId] = useState(visible[0]?.id || '');
  const signature = visible.map((item) => item.id).join('|');
  const view = useMemo(() => shelfWindow(visible, 0, columns), [visible, columns]);
  const selected = view.items.find((item) => item.id === selectedId) || view.items[0];
  useEffect(() => { setSelectedId(visible[0]?.id || ''); }, [signature, look]);
  return { filters, setFilters, visible, view, selected, setSelectedId };
}
