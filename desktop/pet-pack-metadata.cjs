'use strict';
// Display-only metadata. Never relay atlas bytes, paths, URLs or author code.
const ACTIONS=['idle','walk','sleep','focus','listen','groove','typing','click','eat','hop','deliver','celebrate','blink','stretch','yawn','groom','wave','nod','curious','shy','happy','sad','drink','return'];
function cleanPetPack(value) {
  if(!value || typeof value!=='object' || typeof value.id!=='string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(value.id))return null;
  const media=value.media;if(!media || media.type!=='spritesheet')return null;
  const {width,height,frameWidth,frameHeight}=media;
  if(![width,height].every(v=>Number.isInteger(v)&&v>0&&v<=4096) || ![frameWidth,frameHeight].every(v=>Number.isInteger(v)&&v>=16&&v<=1024) || width%frameWidth || height%frameHeight)return null;
  const count=width/frameWidth*(height/frameHeight),animations={},actionMap={};
  if(!value.animations || typeof value.animations!=='object' || Object.keys(value.animations).length>24)return null;
  for(const [key,clip]of Object.entries(value.animations)) {
    if(!ACTIONS.includes(key) || !clip || !Array.isArray(clip.frames) || !clip.frames.length || clip.frames.length>240 || !clip.frames.every(i=>Number.isInteger(i)&&i>=0&&i<count) || !Number.isFinite(clip.fps) || clip.fps<.5 || clip.fps>30)return null;
    animations[key]={frames:[...clip.frames],fps:clip.fps};
  }
  if(!animations.idle)return null;
  for(const key of ACTIONS)if(ACTIONS.includes(value.actionMap?.[key]))actionMap[key]=value.actionMap[key];
  return {id:value.id,media:{type:'spritesheet',width,height,frameWidth,frameHeight},animations,actionMap,mirror:value.mirror===true,baseline:Number.isFinite(value.baseline)?Math.min(1,Math.max(0,value.baseline)):0};
}
module.exports={cleanPetPack};
