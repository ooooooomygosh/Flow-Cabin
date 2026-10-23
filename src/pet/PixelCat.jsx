import React, { useEffect, useRef, useState } from 'react';
import { startVideoPet } from './video-pet.mjs';
import { cleanPetPack } from './pack-metadata.mjs';
import { selectedPack, PACK_CHANGED, packFrame } from './imported-pack.mjs';
import { cachedPetFrame, drawPetFrame, petOpaqueAt, SIZE } from './pet-sprites.mjs';
import { getPet, normalizePetId } from './pet-catalog.mjs';
import { useCatMotion } from './useCatMotion';
import { startPetAnimation } from './pet-animation.mjs';
import { loadPetArt, loadPetAccessories, artFrame, drawPetArt } from './pet-art-v21.mjs';

export const opaqueAt = (pose,index,accessory,rx,ry,petId='cat') => petOpaqueAt(petId,pose,index,accessory,rx,ry);
export default function PixelCat({ petId='cat',skin='orange',pose='idle',accessory='',reduceMotion=false,className='',label,onFrame,origin=0,packOverride,packBase,onAlpha,...props }) {
  const [savedPack,setPack]=useState(selectedPack), [failedPack,setFailedPack]=useState(''), [videoFallback,setVideoFallback]=useState('');
  useEffect(()=>{const update=()=>setPack(selectedPack());window.addEventListener(PACK_CHANGED,update);window.addEventListener('storage',update);return()=>{window.removeEventListener(PACK_CHANGED,update);window.removeEventListener('storage',update);};},[]);
  const pack=packOverride===undefined ? savedPack : cleanPetPack(packOverride), packKey=JSON.stringify(pack);
  const id=normalizePetId(petId), motion=useCatMotion(reduceMotion), canvas=useRef(null), callbacks=useRef(null);
  callbacks.current={onFrame,onAlpha};
  useEffect(()=>{
    const context=canvas.current?.getContext('2d');if(!context)return;
    const size=canvas.current.width;let disposed=false,timer,stopFallback;
    const start=origin || performance.now();
    const report=index=>{callbacks.current.onFrame?.(index);if(callbacks.current.onAlpha)try{callbacks.current.onAlpha(context.getImageData(0,0,size,size));}catch{callbacks.current.onAlpha(null);}};
    const paintLegacy=()=>{const small=document.createElement('canvas');small.width=small.height=SIZE;const ctx=small.getContext('2d');stopFallback=startPetAnimation({pose,origin,enabled:motion.visible,reduceMotion:motion.reduced,onFrame:index=>{drawPetFrame(ctx,cachedPetFrame(id,pose,index,accessory),id,1,id==='cat'&&skin==='black'?'black':'orange');context.clearRect(0,0,size,size);context.imageSmoothingEnabled=false;context.drawImage(small,0,0,size,size);report(index);}});};
    const base=packBase || (packOverride===undefined ? '/desktop-pets/packs' : 'https://album-circle.vercel.app/desktop-pets/packs');
    const clip=pack?.media.type==='webm' && (pack.media.clips[pack.actionMap?.[pose] || pose] || pack.media.clips.idle);
    if(clip && motion.visible && videoFallback!==pack.id && failedPack!==pack.id) return startVideoPet({src:`${base}/${pack.id}/${clip.file}`,context,size,mirror:pack.mirror,baseline:pack.baseline,reduced:motion.reduced,onFrame:()=>report(0),onFallback:reason=>{if(canvas.current)canvas.current.dataset.videoFallbackReason=reason;setVideoFallback(pack.id);}});
    if(pack && failedPack!==pack.id){
      const atlas=new Image();atlas.crossOrigin='anonymous';
      const paint=()=>{if(disposed || !motion.visible)return;try{const frame=packFrame(pack,pose,performance.now()-start,motion.reduced);context.clearRect(0,0,size,size);context.imageSmoothingEnabled=false;context.save();if(pack.mirror){context.translate(size,0);context.scale(-1,1);}context.drawImage(atlas,frame.x,frame.y,frame.width,frame.height,0,-(pack.baseline||0)*size,size,size);context.restore();report(0);if(!motion.reduced)timer=setTimeout(paint,1000/30);}catch{setFailedPack(pack.id);}};
      atlas.onload=paint;atlas.onerror=()=>{if(!disposed)setFailedPack(pack.id);};
      atlas.src=`${base}/${pack.id}/atlas.png`;
      return()=>{disposed=true;clearTimeout(timer);atlas.onload=atlas.onerror=null;};
    }
    Promise.all([loadPetArt(id),accessory?loadPetAccessories().catch(()=>null):null]).then(([art,gear])=>{
      let last='';const paint=()=>{if(disposed || !motion.visible)return;const sample=artFrame(art.manifest,pose,performance.now()-start,motion.reduced);if(sample.key!==last){last=sample.key;drawPetArt(context,art,sample,accessory,gear);report(sample.index);}if(Number.isFinite(sample.wait))timer=setTimeout(paint,sample.wait);};paint();
    }).catch(()=>{if(!disposed)paintLegacy();});
    return()=>{disposed=true;clearTimeout(timer);stopFallback?.();};
  },[id,pose,accessory,skin,origin,motion.visible,motion.reduced,packKey,failedPack,videoFallback,packBase,packOverride===undefined]);
  return <canvas ref={canvas} width={256} height={256} className={`pixel-cat ${className}`} role="img" aria-label={label || (pack ? `${pack.name || '导入的伙伴'}${failedPack===pack.id ? ' · 素材缺失，显示内置替代伙伴' : ''}` : `${getPet(id).name} · ${getPet(id).species}`)} data-reduced-motion={motion.reduced} data-motion-enabled={motion.visible} data-pet-id={id} data-pose={pose} data-accessory={accessory} data-video-fallback={Boolean(pack && videoFallback===pack.id)} data-pack-unavailable={Boolean(pack && failedPack===pack.id)} {...props}/>;
}
