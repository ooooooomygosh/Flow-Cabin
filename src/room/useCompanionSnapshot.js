import { useEffect, useRef } from 'react';
import { lazySnapshot } from './lazy-snapshot.mjs';

// window.albumRoomSnapshot() is read by the desktop shell (wallpaper and pet,
// polled every 125–750 ms), never by the room itself. Keep only the raw inputs
// on render and build the snapshot on demand, reusing it while they are unchanged.
export default function useCompanionSnapshot(inputs, build, onWallpaper) {
  const lazy = useRef(null); lazy.current ||= lazySnapshot(build);
  lazy.current.update(inputs);
  const receiveRef = useRef(onWallpaper); receiveRef.current = onWallpaper;
  useEffect(() => {
    const getter = () => lazy.current.read(); window.albumRoomSnapshot = getter;
    const receive = (event) => { window.albumRoomWallpaperState = event.detail; receiveRef.current?.(event.detail || {}); };
    window.addEventListener('album-room-wallpaper', receive);
    return () => { if (window.albumRoomSnapshot === getter) delete window.albumRoomSnapshot; window.removeEventListener('album-room-wallpaper', receive); };
  }, []);
}
