import React, { memo, useLayoutEffect, useRef } from 'react';
import { RECORD_PX, recordPixels } from './pixel-record.mjs';

// <canvas> of the 48×48 pixel record; CSS sizes it to a whole multiple (pixelated).
function PixelRecord({ base, opacity = 100, splatter = false, splashes = [], label, seed = '', className = '' }) {
  const canvas = useRef(null), key = `${base}|${opacity}|${splatter}|${splashes.join(',')}|${label}|${seed}`;
  useLayoutEffect(() => {
    const context = canvas.current?.getContext('2d'); if (!context) return;
    context.putImageData(new ImageData(recordPixels({ base, opacity, splatter, splashes, label, seed }), RECORD_PX, RECORD_PX), 0, 0);
  }, [key]);
  return <canvas ref={canvas} className={`pixel-record ${className}`} width={RECORD_PX} height={RECORD_PX} aria-hidden="true"/>;
}
export default memo(PixelRecord);
