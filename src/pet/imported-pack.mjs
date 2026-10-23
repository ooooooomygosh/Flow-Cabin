import { cleanPetPack } from './pack-metadata.mjs';
export const PACK_SELECTION='cabin.petPack.v1';
export const PACK_CHANGED='cabin:pet-pack';
export function selectedPack(storage=globalThis.localStorage) {try{const raw=storage.getItem(PACK_SELECTION);return raw && raw.length<=100000 ? cleanPetPack(JSON.parse(raw)) : null;}catch{return null;}}
export function selectPack(pack,storage=globalThis.localStorage) {try{if(pack)storage.setItem(PACK_SELECTION,JSON.stringify(cleanPetPack(pack)));else storage.removeItem(PACK_SELECTION);}catch{}globalThis.dispatchEvent?.(new Event(PACK_CHANGED));}
export function packFrame(pack,action,elapsed=0,reduced=false) {
  const clip=pack.animations[pack.actionMap?.[action] || action] || pack.animations.idle;
  const frame=clip.frames[reduced?0:Math.max(0,Math.floor(elapsed/1000*clip.fps))%clip.frames.length];
  const columns=pack.media.width/pack.media.frameWidth;
  return {x:frame%columns*pack.media.frameWidth,y:Math.floor(frame/columns)*pack.media.frameHeight,width:pack.media.frameWidth,height:pack.media.frameHeight};
}
