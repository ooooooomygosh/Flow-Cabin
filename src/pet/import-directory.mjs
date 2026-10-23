const ACTIONS = ['idle','walk','turn','dragged','land','petresponse','sleep','wake','observe','stretch','yawn','greet','read','write','type','think','listen','nod','sway','dance','eat','satisfied','celebrate','deliver'];
function parseConfig(text) {
  let out = '', quoted = false, escaped = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { out += c; if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quoted = false; }
    else if (c === '"') { quoted = true; out += c; }
    else if (c === '/' && text[i+1] === '/') { while (i < text.length && text[i] !== '\n') i++; out += '\n'; }
    else if (c === '/' && text[i+1] === '*') { i += 2; while (i < text.length && !(text[i] === '*' && text[i+1] === '/')) i++; i++; }
    else if (c === ',') { let j = i+1; while (/\s/.test(text[j] || '') && j < text.length) j++; if (!['}',']'].includes(text[j])) out += c; }
    else out += c;
  }
  return JSON.parse(out);
}
const base64 = file => new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload=()=>resolve(String(reader.result).split(',')[1]); reader.onerror=()=>reject(Error('无法读取素材')); reader.readAsDataURL(file); });
async function poster(file) {
  const url=URL.createObjectURL(file), video=document.createElement('video');video.muted=true;video.playsInline=true;video.preload='auto';
  try {
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('视频预览超时，请提供 atlas.png 回退图集')),10000);video.onloadeddata=()=>{clearTimeout(timer);resolve();};video.onerror=()=>{clearTimeout(timer);reject(Error('不能解码此视频，请提供 atlas.png 回退图集'));};video.src=url;video.load();});
    const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const ctx=canvas.getContext('2d');ctx.drawImage(video,0,0,256,256);
    const data=ctx.getImageData(0,0,256,256).data;let transparent=0;for(let i=3;i<data.length;i+=4)if(data[i]<20)transparent++;
    if(transparent<256)throw Error('当前设备不能读取视频透明通道，请提供 atlas.png 回退图集');
    return canvas.toDataURL('image/png').split(',')[1];
  } finally {video.pause();video.removeAttribute('src');video.load();URL.revokeObjectURL(url);}
}
const firstName=value=>typeof value==='string'?value:Array.isArray(value)?value.map(firstName).find(Boolean):value&&typeof value==='object'?firstName(value.actions)||firstName(value.name):null;
export async function readPetDirectory(input) {
  const files=[...input];if(files.length>500)throw Error('请选择只包含这位宠物配置和素材的目录');
  const resolve=name=>{if(typeof name!=='string'||!name||name.split(/[\\/]/).includes('..')||/^(?:[a-z]+:|\/)/i.test(name))throw Error('素材路径无效');const matches=files.filter(f=>(f.webkitRelativePath||f.name).endsWith('/'+name)||f.name===name);if(matches.length!==1)throw Error(`素材缺失或重名：${name}`);return matches[0];};
  const manifests=files.filter(f=>f.name==='manifest.json'),configs=manifests.length?manifests:files.filter(f=>/(?:-config|config)\.jsonc?$/i.test(f.name));
  if(configs.length!==1||configs[0].size>100*1024)throw Error('目录需要一份 manifest.json 或 dsh-pet config.json');
  const config=parseConfig(await configs[0].text());let total=0;
  const read=async file=>{total+=file.size;if(total>16*1024*1024)throw Error('所选动作总大小超过16MB，请减少动作或压缩视频');return base64(file);};
  if(config.media) {
    const media={...config.media,data:await read(resolve(config.media.file||'atlas.png'))};
    if(media.type==='webm'){media.clips={};for(const [action,clip]of Object.entries(config.media.clips||{})){if(!ACTIONS.includes(action))throw Error('未知视频动作');media.clips[action]={data:await read(resolve(clip.file))};}}
    return {...config,media};
  }
  const entries=config.animations?[config]:Object.values(config).filter(v=>v?.animations);
  if(entries.length!==1)throw Error('请选择单一宠物种类的配置与动画目录');
  const entry=entries[0],pool=entry.animations, clips={},animations={idle:{frames:[0],fps:1}};
  const mapping={idle:firstName(pool.idle),turn:firstName(pool.turn),dragged:firstName(pool.drag),petresponse:firstName(pool.clicks),walk:firstName(pool.moves?.actions)};
  for(const action of ACTIONS)mapping[action] ||= firstName(pool[action]) || firstName(pool.categories?.[action]);
  if(!mapping.idle)throw Error('dsh-pet 配置没有 idle 动作');
  let idle;
  for(const [action,name]of Object.entries(mapping))if(name){const file=resolve(name.endsWith('.webm')?name:name+'.webm');if(action==='idle')idle=file;clips[action]={data:await read(file)};animations[action]={frames:[0],fps:1};}
  const fallback=files.find(f=>f.name==='atlas.png');
  return {version:2,id:'import-'+crypto.randomUUID().slice(0,12),name:String(entry.name||'导入的伙伴').slice(0,80),author:String(entry.author||'作者未填写').slice(0,120),license:String(entry.license||'原包未填写授权信息').slice(0,200),source:'dsh-pet local directory',authorized:entry.authorized===true,media:{type:'webm',data:fallback?await read(fallback):await poster(idle),frameWidth:256,frameHeight:256,clips},animations};
}
