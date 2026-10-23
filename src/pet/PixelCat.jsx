import { cleanPetPack } from './pack-metadata.mjs';
import { selectedPack, PACK_CHANGED, packFrame } from './imported-pack.mjs';
import React, { useEffect, useRef, useState } from 'react';
import { cachedPetFrame, drawPetFrame, petOpaqueAt, SIZE } from './pet-sprites.mjs';
import { getPet, normalizePetId } from './pet-catalog.mjs';
import { useCatMotion } from './useCatMotion';
import { startPetAnimation } from './pet-animation.mjs';

// Hit-testing for the desktop pet window (cat-only signature kept for PetApp).
export const opaqueAt = (pose, index, accessory, rx, ry, petId = 'cat') => petOpaqueAt(petId, pose, index, accessory, rx, ry);
export default function PixelCat({ petId = 'cat', skin = 'orange', pose = 'idle', accessory = '', reduceMotion = false, className = '', label, onFrame, origin = 0, packOverride, onAlpha, ...props }) {
  const [failedPack,setFailedPack]=useState('');
  const [savedPack,setPack]=useState(()=>selectedPack());
  useEffect(()=>{const update=()=>setPack(selectedPack());window.addEventListener(PACK_CHANGED,update);window.addEventListener('storage',update);return()=>{window.removeEventListener(PACK_CHANGED,update);window.removeEventListener('storage',update);};},[]);
  const pack=packOverride === undefined ? savedPack : cleanPetPack(packOverride);
  const packKey=JSON.stringify(pack);
  const alphaRef=useRef(onAlpha);alphaRef.current=onAlpha;
  const id = normalizePetId(petId), motion = useCatMotion(reduceMotion);
  const catSkin = id === 'cat' && skin === 'black' ? 'black' : 'orange';
  const canvas = useRef(null), onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;
  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (!context) return;
    context.imageSmoothingEnabled = false;
    alphaRef.current?.(null);
    if (pack && failedPack!==pack.id && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(pack.id)) {
      let disposed=false,timer;const atlas=new Image();atlas.crossOrigin='anonymous';const start=performance.now();
      const paint=()=>{if(disposed || !motion.visible)return;try{const frame=packFrame(pack,pose,performance.now()-start,motion.reduced);context.clearRect(0,0,SIZE,SIZE);context.save();if(pack.mirror){context.translate(SIZE,0);context.scale(-1,1);}context.drawImage(atlas,frame.x,frame.y,frame.width,frame.height,0,-(pack.baseline || 0)*SIZE,SIZE,SIZE);context.restore();alphaRef.current?.(context.getImageData(0,0,SIZE,SIZE));if(!motion.reduced)timer=setTimeout(paint,1000/30);}catch{setFailedPack(pack.id);setPack(null);}};
      atlas.onload=paint;atlas.onerror=()=>{if(!disposed){setFailedPack(pack.id);setPack(null);}};atlas.src=packOverride === undefined ? `/desktop-pets/packs/${pack.id}/atlas.png` : `https://album-circle.vercel.app/desktop-pets/packs/${pack.id}/atlas.png`;
      return()=>{disposed=true;clearTimeout(timer);atlas.onload=null;atlas.onerror=null;};
    }
    return startPetAnimation({ pose, origin, enabled: motion.visible, reduceMotion: motion.reduced, onFrame: (index) => {
      drawPetFrame(context, cachedPetFrame(id, pose, index, accessory), id, 1, catSkin);
      onFrameRef.current?.(index);
    } });
  }, [motion.reduced, motion.visible, pose, accessory, id, catSkin, origin, failedPack, packKey, packOverride === undefined]);
  return <canvas ref={canvas} className={`pixel-cat ${className}`} width={SIZE} height={SIZE} role="img" aria-label={label || `像素${getPet(id).species} · ${getPet(id).name}`} data-reduced-motion={motion.reduced} data-motion-enabled={motion.visible} data-skin={id === 'cat' ? catSkin : undefined} data-pet-id={id} data-pose={pose} data-accessory={accessory} {...props}/>;
}
