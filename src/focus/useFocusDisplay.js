import { useSyncExternalStore } from 'react';
import { createDisplayStore, faceFor } from './focus-display.mjs';
import { useRecordLibrary } from '../RecordLibrary';

// The 专注画面 preference, one live value per window.
let store = null;
const displayStore = () => (store ||= createDisplayStore());
export function useFocusDisplay() {
  const s = displayStore(), value = useSyncExternalStore(s.subscribe, s.get, s.get);
  return [value, s.set];
}
// The scene the room shows now (faces take its palette and default face).
export function useSceneLook(fallback = 'pixel') {
  const library = useRecordLibrary();
  return library?.data.rooms[library.roomId]?.look || fallback;
}
export const useFaceId = (look) => faceFor(useFocusDisplay()[0], look);
