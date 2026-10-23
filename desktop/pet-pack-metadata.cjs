'use strict';
// Display-only metadata. Never relay atlas bytes, paths, URLs or author code.
const ACTIONS=['idle','walk','sleep','focus','listen','groove','typing','click','eat','hop','deliver','celebrate','blink','stretch','yawn','groom','wave','nod','curious','shy','happy','sad','drink','return','observe','wake','turn','greet','petresponse','dragged','land','read','write','type','think','sway','dance','satisfied'];
function cleanPetPack(value) {
  if(!value || typeof value!=='object' || typeof value.id!=='string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(value.id))return null;
  const media=value.media;if(!media || !['spritesheet','webm'].includes(media.type))return null;
  const {width,height,frameWidth,frameHeight}=media;
  if(![width,height].every(v=>Number.isInteger(v)&&v>0&&v<=4096) || ![frameWidth,frameHeight].every(v=>Number.isInteger(v)&&v>=16&&v<=1024) || width%frameWidth || height%frameHeight)return null;
  const count=width/frameWidth*(height/frameHeight),animations={},actionMap={};
  if(!value.animations || typeof value.animations!=='object' || Object.keys(value.animations).length>ACTIONS.length)return null;
  for(const [key,clip]of Object.entries(value.animations)) {
    if(!ACTIONS.includes(key) || !clip || !Array.isArray(clip.frames) || !clip.frames.length || clip.frames.length>240 || !clip.frames.every(i=>Number.isInteger(i)&&i>=0&&i<count) || !Number.isFinite(clip.fps) || clip.fps<.5 || clip.fps>30)return null;
    animations[key]={frames:[...clip.frames],fps:clip.fps};
  }
  if(!animations.idle)return null;
  for(const key of ACTIONS)if(ACTIONS.includes(value.actionMap?.[key]))actionMap[key]=value.actionMap[key];
  const clips={};if(media.type==='webm'){for(const [key,clip]of Object.entries(media.clips||{})){if(!ACTIONS.includes(key)||clip?.file!==key+'.webm')return null;clips[key]={file:clip.file};}if(!clips.idle)return null;}
  const text=(v,n)=>typeof v==='string'?v.slice(0,n):'';
  return {id:value.id,name:text(value.name,80),author:text(value.author,120),license:text(value.license,200),source:text(value.source,300),media:{type:media.type,width,height,frameWidth,frameHeight,...(media.type==='webm'?{clips}:{})},animations,actionMap,mirror:value.mirror===true,baseline:Number.isFinite(value.baseline)?Math.min(1,Math.max(0,value.baseline)):0};
}
module.exports={cleanPetPack};
