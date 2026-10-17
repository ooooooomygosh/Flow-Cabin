import { useLayoutEffect, useRef, useState } from 'react';
import { useRecordLibrary } from './RecordLibrary';
import { nudgeDelta } from './drag-gesture.mjs';

// Position stays in the existing per-room preferences, as fractions of the
// available screen area so a smaller window never strands the drag handle.
export default function useTurntablePosition(readOnly) {
  const library = useRecordLibrary(), element = useRef(null), gesture = useRef(null), frame = useRef(0);
  const saved = readOnly ? null : library?.data.rooms[library.roomId]?.turntable;
  const [position, setPosition] = useState(null), [moving, setMoving] = useState(false);
  const bounds = () => {
    const rect = element.current.getBoundingClientRect();
    const header = document.querySelector('.cabin-toolbar')?.getBoundingClientRect();
    const top = Math.max(24, (header?.bottom || 0) + 24);
    return { left: 16, top, width: Math.max(0, innerWidth - rect.width - 32), height: Math.max(0, innerHeight - rect.height - top - 20) };
  };
  const clamp = (point) => {
    const area = bounds();
    return { x: Math.max(area.left, Math.min(area.left + area.width, point.x)), y: Math.max(area.top, Math.min(area.top + area.height, point.y)) };
  };
  const restore = () => {
    if (!saved) { setPosition(null); return; }
    const area = bounds(); setPosition({ x: area.left + saved.x * area.width, y: area.top + saved.y * area.height });
  };
  useLayoutEffect(() => {
    if (readOnly) return;
    const resize = () => { gesture.current = null; stopFrame(); setMoving(false); restore(); };
    const observer = new ResizeObserver(resize);
    observer.observe(element.current);
    const toolbar = document.querySelector('.cabin-toolbar'); if (toolbar) observer.observe(toolbar);
    window.addEventListener('resize', resize); restore();
    return () => { observer.disconnect(); window.removeEventListener('resize', resize); stopFrame(); };
  }, [saved?.x, saved?.y, readOnly]);
  const save = (point) => {
    const area = bounds();
    const turntable = point ? { x: area.width ? (point.x - area.left) / area.width : 0, y: area.height ? (point.y - area.top) / area.height : 0 } : undefined;
    const stored = library?.update((old) => ({ ...old, rooms: { ...old.rooms, [library.roomId]: { ...old.rooms[library.roomId], turntable } } }));
    if (stored === false) restore();
    return stored;
  };
  // Pointer moves land in the next frame only (high-rate mice send several per frame).
  const stopFrame = () => { if (frame.current) { cancelAnimationFrame(frame.current); frame.current = 0; } };
  const finish = (event, cancel = false) => {
    const drag = gesture.current; if (!drag || drag.id !== event.pointerId) return;
    gesture.current = null; stopFrame(); setMoving(false);
    if (cancel) restore(); else if (drag.point) { drag.point = clamp(drag.point); setPosition(drag.point); save(drag.point); }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return {
    ref: element, moving, style: position ? { left: position.x, top: position.y, bottom: 'auto' } : undefined,
    handle: readOnly ? {} : {
      onPointerDown(event) {
        if (!event.isPrimary || event.button !== 0) return;
        event.preventDefault(); event.currentTarget.focus();
        const rect = element.current.getBoundingClientRect();
        gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
        event.currentTarget.setPointerCapture(event.pointerId);
      },
      onPointerMove(event) {
        const drag = gesture.current; if (!drag || drag.id !== event.pointerId) return;
        const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
        if (!drag.point && Math.hypot(dx, dy) < 5) return;
        if (!drag.point) setMoving(true);
        drag.point = { x: drag.left + dx, y: drag.top + dy };
        if (!frame.current) frame.current = requestAnimationFrame(() => { frame.current = 0; const live = gesture.current; if (live?.point) { live.point = clamp(live.point); setPosition(live.point); } });
      },
      onPointerUp: (event) => finish(event), onPointerCancel: (event) => finish(event, true), onLostPointerCapture: (event) => finish(event, true),
      onDoubleClick() { gesture.current = null; setMoving(false); setPosition(null); save(null); },
      onKeyDown(event) {
        if (event.key === 'Escape' && gesture.current) { gesture.current = null; stopFrame(); setMoving(false); restore(); return; }
        if (event.key === 'Home') { event.preventDefault(); setPosition(null); save(null); return; }
        const delta = nudgeDelta(event.key, event.shiftKey);
        if (!delta) return;
        event.preventDefault(); event.stopPropagation();
        const rect = element.current.getBoundingClientRect(), next = clamp({ x: rect.left + delta[0], y: rect.top + delta[1] });
        setPosition(next); save(next);
      }
    }
  };
}
