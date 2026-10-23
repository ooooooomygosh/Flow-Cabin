export const ART_ACTIONS = Object.freeze(['idle','observe','stretch','yawn','sleep','wake','walk','turn','greet','petresponse','dragged','land','read','write','type','think','listen','nod','sway','dance','eat','satisfied','celebrate','deliver']);
export const ART_ALIASES = Object.freeze({ focus:'read', typing:'type', click:'petresponse', hop:'celebrate', groove:'dance', blink:'observe', groom:'petresponse', wave:'greet', curious:'think', shy:'petresponse', happy:'satisfied', sad:'observe', drink:'eat', return:'walk' });
export function artAction(pose) { return ART_ACTIONS.includes(pose) ? pose : ART_ALIASES[pose] || 'idle'; }
export function artFrame(manifest, pose, elapsed = 0, reduced = false) {
  const action = artAction(pose), clip = manifest.clips[action] || manifest.clips.idle;
  const frames = clip.frames, total = frames.reduce((n,f) => n + f.durationMs,0);
  let time = reduced ? 0 : Math.max(0,elapsed);
  time = clip.loop === false ? Math.min(time,total-1) : time % total;
  let index = 0;
  while (index < frames.length-1 && time >= frames[index].durationMs) time -= frames[index++].durationMs;
  return { action, frame:frames[index], index, key:`${action}:${index}`, wait:reduced || (clip.loop === false && index === frames.length-1) ? Infinity : Math.max(16,frames[index].durationMs-time) };
}
export const MUSIC_ART_ACTIONS = Object.freeze(['listen','nod','sway','dance']);
// Every surface uses the heard beat's wall-clock anchor. Only the next half-beat
// can change either the drawing or the music clip; delayed timers skip frames.
export function artBeatFrame(manifest, now, beat) {
  if (!beat?.known || !(beat.bpm >= 40 && beat.bpm <= 220)) return null;
  const half = 30000 / beat.bpm, cycle = half * 4;
  const phase = ((now - beat.beatAt) % cycle + cycle) % cycle;
  const into = phase % half, boundary = now - into;
  const action = MUSIC_ART_ACTIONS[((Math.floor(boundary / 8000) % 4) + 4) % 4];
  const frames = manifest.clips[action].frames, index = Math.floor(phase / half) % frames.length;
  return { action, frame:frames[index], index, key:`${action}:${index}`, wait:Math.max(1, half - into) };
}
export function validatePetArt(manifest) {
  if (manifest?.version !== 2 || !Number.isInteger(manifest.width) || !Number.isInteger(manifest.height) || manifest.width > 4096 || manifest.height > 4096) throw Error('伙伴动画规格不正确。');
  for (const action of ART_ACTIONS) {
    const clip=manifest.clips?.[action];
    if (!clip?.frames?.length || clip.frames.length>120) throw Error(`缺少伙伴动作：${action}`);
    for (const f of clip.frames) if (![f.x,f.y,f.w,f.h,f.durationMs].every(Number.isFinite) || f.x<0 || f.y<0 || f.w<=0 || f.h<=0 || f.x+f.w>manifest.width || f.y+f.h>manifest.height || f.durationMs<30) throw Error(`伙伴动作裁切无效：${action}`);
  }
  return manifest;
}
const pets = new Map(); let accessories;
const read = async url => { const r=await fetch(url); if(!r.ok)throw Error('伙伴素材尚未加载。'); return r.json(); };
const image = url => new Promise((resolve,reject) => { const img=new Image(); img.onload=()=>resolve(img);img.onerror=()=>reject(Error('伙伴图片加载失败。'));img.src=url; });
export function loadPetArt(id) {
  if (!['cat','chick','bunny','bear','fox'].includes(id)) return Promise.reject(Error('未知伙伴。'));
  if (!pets.has(id)) pets.set(id,(async()=>{const base=`/pet-art/v21/${id}/`,manifest=validatePetArt(await read(base+'manifest.json'));const atlas=await image(base+manifest.atlas);if(atlas.naturalWidth!==manifest.width || atlas.naturalHeight!==manifest.height)throw Error('伙伴图片尺寸不匹配。');return {manifest,atlas};})().catch(e=>{pets.delete(id);throw e;}));
  return pets.get(id);
}
export function loadPetAccessories() {
  if (!accessories) accessories=(async()=>{const base='/pet-art/v21/accessories/',manifest=await read(base+'manifest.json');return {manifest,atlas:await image(base+manifest.atlas)};})().catch(e=>{accessories=null;throw e;});
  return accessories;
}
// Both the room's Pixi texture and every DOM/native companion use this draw path.
export function drawPetArt(context, art, sample, accessory='', gear=null) {
  const f=sample.frame, size=context.canvas.width;
  context.clearRect(0,0,size,size);context.imageSmoothingEnabled=false;
  const a=gear?.manifest.items?.[accessory], anchors=f.accessoryAnchors;
  const v=a && anchors?.supported && (a.variants[anchors.orientation] || a.variants.front), target=a && anchors?.[a.target];
  const drawBody=()=>context.drawImage(art.atlas,f.x,f.y,f.w,f.h,0,0,size,size);
  const drawGear=()=>{if(!v || !target)return;const width=target.width*a.widthMultiplier*size, height=width*v.frame.h/v.frame.w;context.save();context.translate(target.x*size,target.y*size);context.rotate((anchors.rotationDegrees || 0)*Math.PI/180);context.drawImage(gear.atlas,v.frame.x,v.frame.y,v.frame.w,v.frame.h,-width*a.anchor.x,-height*a.anchor.y,width,height);context.restore();};
  if(target?.layer==='behind'){drawGear();drawBody();}else{drawBody();drawGear();}
}
