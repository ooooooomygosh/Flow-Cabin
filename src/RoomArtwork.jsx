import React, { useEffect, useRef, useState } from 'react';
import { artworkResolution } from './artwork-resolution.mjs';
import { GRID, gridToRgba, proceduralGrid, readPalette } from './player/pixel-cover.mjs';
import './room-artwork.css';

// No cover (or it failed): a 32×32 sleeve generated from title + artist in the
// cabin palette (same generator as imported covers), titled on a printed strip.
// Same record → same sleeve; no black box with an icon.
// Painted at 3× (96 px, the cover canvases' floor) so CSS stretches it no more than a cover.
const SLEEVE_SCALE = 3, SLEEVE_SIDE = GRID * SLEEVE_SCALE;
function GeneratedSleeve({ item }) {
  const canvas = useRef(null);
  useEffect(() => {
    const context = canvas.current?.getContext('2d'); if (!context) return;
    let palette; try { palette = readPalette(getComputedStyle(document.documentElement)); } catch { palette = readPalette(null); }
    context.putImageData(new ImageData(gridToRgba(proceduralGrid(item).grid, GRID, palette, SLEEVE_SCALE), SLEEVE_SIDE, SLEEVE_SIDE), 0, 0);
  }, [item.title, item.artist]);
  return <span className="showroom-art-placeholder is-generated"><canvas ref={canvas} className="is-painted" width={SLEEVE_SIDE} height={SLEEVE_SIDE} aria-hidden="true"/><strong>{item.title}</strong></span>;
}

export function ShowroomArtwork({ item, className = '', pixel = false }) {
  const [failed, setFailed] = useState(false), [painted, setPainted] = useState(false);
  const root = useRef(null), canvas = useRef(null);
  useEffect(() => {
    setFailed(false); setPainted(false);
    if (!pixel || !item.cover) return;
    const image = new Image();
    let disposed = false, ready = false, frame = 0;
    const paint = () => {
      const element = canvas.current;
      if (disposed || !ready || !element) return;
      const side = Math.min(image.naturalWidth, image.naturalHeight);
      const resolution = artworkResolution(element.parentElement.getBoundingClientRect().width, window.devicePixelRatio, side);
      if (element.width !== resolution) element.width = element.height = resolution;
      const context = element.getContext('2d');
      if (!context) return; // the ordinary image remains available
      // Average on reduction, then use crisp enlargement. No cross-origin readback.
      context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
      context.clearRect(0, 0, resolution, resolution);
      context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, resolution, resolution);
      setPainted(true);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(paint); };
    const observer = new ResizeObserver(schedule);
    if (root.current) observer.observe(root.current);
    image.onload = () => { ready = true; paint(); };
    image.onerror = () => { if (!disposed) setFailed(true); }; image.src = item.cover;
    return () => { disposed = true; cancelAnimationFrame(frame); observer.disconnect(); image.onload = image.onerror = null; };
  }, [item.cover, pixel]);
  return <span ref={root} className={`showroom-artwork ${className} ${pixel ? 'pixel-artwork' : ''}`}>
    {item.cover && !failed ? <><img src={item.cover} alt={`${item.title} 封面`} width="800" height="800" decoding="async" draggable="false" style={painted ? { visibility: 'hidden' } : undefined} onError={() => setFailed(true)}/>{pixel && <canvas ref={canvas} width="96" height="96" className={painted ? 'is-painted' : ''} aria-hidden="true"/>}</> : <GeneratedSleeve item={item}/>}
  </span>;
}
