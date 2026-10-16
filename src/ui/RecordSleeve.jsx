import React, { memo, useLayoutEffect, useMemo, useRef } from 'react';
import { GRID, gridToRgba, proceduralGrid, readPalette } from '../player/pixel-cover.mjs';
import './record-sleeve.css';

// The one sleeve for a record without a usable cover (none, failed, or still loading):
// a 32×32 scene from the cabin palette, seeded by title + artist so the same record
// always wears the same sleeve, on every surface (shelf, record card, album wall,
// box manager, playlists, mini player). The canvas holds the 32 art pixels (at 3x); CSS
// enlarges them with nearest-neighbour, and a 2px printed band frames the print.
// Painted at 3x (96 px backing, like the cover canvases' floor) so CSS never stretches a
// backing pixel more than a cover's, and every art pixel stays a whole 3x3 block.
const SCALE = 3, SIDE = GRID * SCALE;
let palette = null;
const livePalette = () => palette ||= (() => { try { return readPalette(getComputedStyle(document.documentElement)); } catch { return readPalette(null); } })();

function RecordSleeve({ item, title = true, className = '', loading = false }) {
  const canvas = useRef(null), name = item?.title || '', artist = item?.artist || '';
  const sleeve = useMemo(() => proceduralGrid({ title: name, artist }), [name, artist]);
  useLayoutEffect(() => {
    const context = canvas.current?.getContext('2d'); if (!context) return;
    context.putImageData(new ImageData(gridToRgba(sleeve.grid, GRID, livePalette(), SCALE), SIDE, SIDE), 0, 0);
  }, [sleeve]);
  return <span className={`record-sleeve ${loading ? 'is-loading' : ''} ${className}`} data-sleeve={sleeve.scene}>
    <canvas ref={canvas} className="is-painted" width={SIDE} height={SIDE} aria-hidden="true"/>
    {title && name && <strong>{name}</strong>}
  </span>;
}
export default memo(RecordSleeve);
