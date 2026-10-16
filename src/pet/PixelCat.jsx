import React, { useEffect, useRef } from 'react';
import { cachedPetFrame, drawPetFrame, petOpaqueAt, SIZE } from './pet-sprites.mjs';
import { getPet, normalizePetId } from './pet-catalog.mjs';
import { useCatMotion } from './useCatMotion';
import { startPetAnimation } from './pet-animation.mjs';

// Hit-testing for the desktop pet window (cat-only signature kept for PetApp).
export const opaqueAt = (pose, index, accessory, rx, ry, petId = 'cat') => petOpaqueAt(petId, pose, index, accessory, rx, ry);
export default function PixelCat({ petId = 'cat', skin = 'orange', pose = 'idle', accessory = '', reduceMotion = false, className = '', label, onFrame, ...props }) {
  const id = normalizePetId(petId), motion = useCatMotion(reduceMotion);
  const catSkin = id === 'cat' && skin === 'black' ? 'black' : 'orange';
  const canvas = useRef(null), onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;
  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (!context) return;
    context.imageSmoothingEnabled = false;
    return startPetAnimation({ pose, enabled: motion.visible, reduceMotion: motion.reduced, onFrame: (index) => {
      drawPetFrame(context, cachedPetFrame(id, pose, index, accessory), id, 1, catSkin);
      onFrameRef.current?.(index);
    } });
  }, [motion.reduced, motion.visible, pose, accessory, id, catSkin]);
  return <canvas ref={canvas} className={`pixel-cat ${className}`} width={SIZE} height={SIZE} role="img" aria-label={label || `像素${getPet(id).species} · ${getPet(id).name}`} data-reduced-motion={motion.reduced} data-motion-enabled={motion.visible} data-skin={id === 'cat' ? catSkin : undefined} data-pet-id={id} data-pose={pose} data-accessory={accessory} {...props}/>;
}
