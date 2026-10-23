'use strict';
const path = require('node:path'), fs = require('node:fs');
const PET_IDS = ['cat','chick','bunny','bear','fox'];
const normalize = id => PET_IDS.includes(id) ? id : 'cat';
const ACCESSORIES = ['headphones','scarf','beanie','bow','sprout'];
const ART = path.join(__dirname,'assets','pets-v21');
function trayIconPath(petId,platform=process.platform,base) {
  const id=normalize(petId);
  if(platform==='darwin')return path.join(base || ART,id,'menu-idle.png');
  return path.join(base || path.join(__dirname,'assets','tray'),`${id}.${platform==='win32'?'ico':'png'}`);
}
function createTrayPet({getTray,nativeImage,getWindow=()=>null,app=null,directory='',platform=process.platform,setTimer=setTimeout,clearTimer=clearTimeout}) {
  const file=directory && path.join(directory,'pet-identity.json'), cache=new Map();
  let current='cat', accessory='', imported=null, timer=null, state={playing:false,focus:false,reduced:false}, revision='';
  if(file)try{current=normalize(JSON.parse(fs.readFileSync(file,'utf8')).petId);}catch{}
  const artPath=(id,name)=>path.join(ART,id,...(accessory?['equipped',accessory]:[]),name);
  const image=(id,frame='idle')=>{const key=`${id}:${accessory}:${frame}`;if(!cache.has(key)){const img=nativeImage.createFromPath(platform==='darwin'?artPath(id,`menu-${frame}.png`):trayIconPath(id,platform));img.setTemplateImage?.(false);cache.set(key,img);}return cache.get(key);};
  const paint=frame=>{const tray=getTray();if(!tray)return;const img=imported?.menu || image(current,frame);if(!img.isEmpty()){tray.setImage(img);tray.__petId=current;}};
  const schedule=()=>{clearTimer(timer);timer=null;if(platform!=='darwin'||state.reduced||imported||!getTray())return;timer=setTimer(()=>{paint(state.focus?'focus':state.playing?'listen':'blink');timer=setTimer(()=>{paint(state.focus?'focus':'idle');schedule();},state.playing&&!state.focus?380:140);timer?.unref?.();},state.playing&&!state.focus?4400:9000);timer?.unref?.();};
  const applyDock=()=>{const full=imported?.dock || nativeImage.createFromPath(artPath(current,'dock-512.png'));if(!full.isEmpty()){if(!imported && full.addRepresentation)try{full.addRepresentation({scaleFactor:2,buffer:fs.readFileSync(artPath(current,'dock-1024.png'))});}catch{}if(platform==='darwin')app?.dock?.setIcon(full);const win=getWindow();if(platform==='win32'&&win&&!win.isDestroyed())win.setIcon(full);}};
  const controller={
    get petId(){return current;},
    get avatar(){return imported?.dock?.toDataURL?.() || nativeImage.createFromPath(artPath(current,'avatar-256.png')).toDataURL?.() || '';},
    get imported(){return Boolean(imported);},
    setTrayPet(petId){const id=normalize(petId);if(id===current && !imported && getTray()?.__petId===id)return false;if(file && id!==current){fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify({version:2,petId:id}),{mode:0o600});fs.renameSync(file+'.tmp',file);}current=id;imported=null;revision='';applyDock();paint(state.focus?'focus':'idle');schedule();return true;},
    setCompanion(value){
      const id=normalize(value?.petId), pack=value?.petPack;
      const nextAccessory=ACCESSORIES.includes(value?.focus?.accessory)?value.focus.accessory:'';
      const nextKey=`${pack?.id || id}:${nextAccessory}:${pack?JSON.stringify([pack.mirror,pack.baseline,pack.actionMap,pack.animations]):''}`;
      if(nextKey!==revision){
        if(file && id!==current)try{fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify({version:2,petId:id}),{mode:0o600});fs.renameSync(file+'.tmp',file);}catch{}
        imported=null;current=id;accessory=nextAccessory;
        if(pack && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(pack.id))try{
          const dir=path.join(directory,'pet-packs',pack.id), media=path.join(dir,'atlas.png');
          if(fs.lstatSync(dir).isSymbolicLink()||fs.lstatSync(media).isSymbolicLink())throw Error('invalid');
          const atlas=nativeImage.createFromPath(media),m=pack.media,frame=(pack.animations?.[pack.actionMap?.idle]||pack.animations?.idle)?.frames?.[0] || 0;
          const cropped=atlas.crop({x:(frame%(m.width/m.frameWidth))*m.frameWidth,y:Math.floor(frame/(m.width/m.frameWidth))*m.frameHeight,width:m.frameWidth,height:m.frameHeight});
          let avatar=cropped.resize({width:512,height:512,quality:'good'});
          if(pack.mirror || pack.baseline){const pixels=avatar.toBitmap(),shift=Math.round((pack.baseline||0)*512),output=Buffer.alloc(512*512*4);for(let y=0;y<512;y++){const sourceY=y+shift;if(sourceY>=512)break;for(let x=0;x<512;x++){const source=(sourceY*512+(pack.mirror?511-x:x))*4;pixels.copy(output,(y*512+x)*4,source,source+4);}}avatar=nativeImage.createFromBitmap(output,{width:512,height:512});}
          const menuSize=platform==='darwin'?18:32;
          imported={dock:avatar,menu:avatar.resize({width:menuSize,height:menuSize,quality:'good'})};
          imported.dock.addRepresentation({scaleFactor:2,buffer:avatar.resize({width:1024,height:1024,quality:'good'}).toPNG()});
          imported.menu.addRepresentation({scaleFactor:2,buffer:avatar.resize({width:menuSize*2,height:menuSize*2,quality:'good'}).toPNG()});
          imported.menu.setTemplateImage?.(false);
        }catch{}
        revision=nextKey;applyDock();paint(state.focus?'focus':'idle');
      }
      const next={playing:Boolean(value?.musicPlaying || value?.playing),focus:value?.focus?.phase==='focus'&&!value.focus.paused,reduced:value?.reduceMotion===true};
      if(JSON.stringify(next)!==JSON.stringify(state)){state=next;paint(state.focus?'focus':'idle');schedule();}
      else if(!timer)schedule();
    },
    refresh(){paint(state.focus?'focus':'idle');schedule();},
    stop(){clearTimer(timer);timer=null;},
  };return controller;
}
module.exports={trayIconPath,createTrayPet,PET_IDS};
