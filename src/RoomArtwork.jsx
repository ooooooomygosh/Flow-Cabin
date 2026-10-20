import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { roomArtworkResolution } from './artwork-resolution.mjs';
import RecordSleeve from './ui/RecordSleeve';

export function ShowroomArtwork({ item, className = '', pixel = false }) {
  const [failed, setFailed] = useState(false), [loaded, setLoaded] = useState(null);
  const [painted, setPainted] = useState('');
  const canvas = useRef(null);
  useEffect(() => {
    setFailed(false); setLoaded(null); setPainted('');
    if (!pixel || !item.cover) return;
    const source = item.cover, image = new Image();
    let disposed = false;
    image.onload = () => { if (!disposed) setLoaded({ source, image }); };
    image.onerror = () => { if (!disposed) setFailed(true); };
    image.src = source;
    return () => { disposed = true; image.onload = image.onerror = null; };
  }, [item.cover, pixel]);
  // Paint after React has restored the canvas following an image error. A fixed
  // backing grid needs neither ResizeObservers nor repainting on window resize.
  useLayoutEffect(() => {
    const element = canvas.current;
    if (!pixel || !element || loaded?.source !== item.cover) return;
    const { image } = loaded, side = Math.min(image.naturalWidth, image.naturalHeight);
    const resolution = roomArtworkResolution(side);
    element.width = element.height = resolution;
    const context = element.getContext('2d');
    if (!context) return;
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
    context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, resolution, resolution);
    setPainted(item.cover);
  }, [loaded, item.cover, pixel]);
  const ready = painted === item.cover && Boolean(item.cover);
  return <span className={`showroom-artwork ${className} ${pixel ? 'pixel-artwork' : ''}`}>
    {item.cover && !failed ? <><img src={item.cover} alt={`${item.title} 封面`} width="800" height="800" decoding="async" draggable="false" style={ready ? { visibility: 'hidden' } : undefined} onError={() => setFailed(true)}/>{pixel && <canvas ref={canvas} width="64" height="64" className={ready ? 'is-painted' : ''} aria-hidden="true"/>}</> : <RecordSleeve item={item} className="showroom-art-placeholder is-generated"/>}
  </span>;
}
