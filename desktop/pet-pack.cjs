'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { webmInfo } = require('./webm-pet.cjs');
const ACTIONS = ['idle','walk','sleep','focus','listen','groove','typing','click','eat','hop','deliver','celebrate','blink','stretch','yawn','groom','wave','nod','curious','shy','happy','sad','drink','return','observe','wake','turn','greet','petresponse','dragged','land','read','write','type','think','sway','dance','satisfied'];
const MAX_BYTES = 16 * 1024 * 1024, MAX_PIXELS = 4096 * 4096;
const name = value => typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(value);
function crc32(bytes) { let crc=0xffffffff; for(const byte of bytes) {crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^(0xedb88320&-(crc&1));} return (crc^0xffffffff)>>>0; }
function pngSize(bytes) {
  if (bytes.length < 33 || bytes.subarray(0,8).toString('hex') !== '89504e470d0a1a0a' || bytes.toString('ascii',12,16) !== 'IHDR') throw Error('需要透明 PNG 图集');
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20), depth = bytes[24], color = bytes[25];
  if (!width || !height || width > 4096 || height > 4096 || width * height > MAX_PIXELS || depth !== 8 || color !== 6 || bytes[28] !== 0) throw Error('PNG 必须为非交错 8 位 RGBA，尺寸不超过 4096');
  let offset = 8, ended = false; const data = [];
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset), type = bytes.toString('ascii',offset+4,offset+8);
    if (offset + length + 12 > bytes.length) throw Error('PNG 数据不完整');
    if(crc32(bytes.subarray(offset+4,offset+8+length)) !== bytes.readUInt32BE(offset+8+length)) throw Error('PNG 校验失败');
    if((type==='IHDR' && (offset!==8 || length!==13)) || (type==='IEND' && length!==0)) throw Error('PNG 头部无效');
    // Do not allow embedded metadata or APNG frames to bypass decoded-size limits.
    if (!['IHDR','IDAT','IEND','sRGB','gAMA','pHYs','cHRM'].includes(type)) throw Error('PNG 请移除元数据并保存为静态 RGBA');
    if (type === 'IDAT') data.push(bytes.subarray(offset+8,offset+8+length));
    offset += length + 12; if (type === 'IEND') { ended = true; break; }
  }
  if (!ended || offset !== bytes.length || !data.length) throw Error('PNG 数据不完整');
  const raw = zlib.inflateSync(Buffer.concat(data), { maxOutputLength: (width*4+1)*height });
  if (raw.length !== (width*4+1)*height) throw Error('PNG 解码尺寸不符');
  return { width, height };
}
function validatePack(input) {
  if (!input || ![1,2].includes(input.version) || !name(input.id) || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 80) throw Error('无效的宠物包信息');
  if (typeof input.author !== 'string' || input.author.length > 120 || typeof input.license !== 'string' || input.license.length > 200) throw Error('请填写作者与授权说明');
  const media = input.media;
  if (!media || !['spritesheet','webm'].includes(media.type) || !/^[A-Za-z0-9+/]*={0,2}$/.test(media.data || '') || media.data.length > MAX_BYTES*4/3+4) throw Error('仅接受 data-only PNG 图集包，不执行脚本');
  const bytes = Buffer.from(media.data, 'base64'); if (bytes.length > MAX_BYTES) throw Error('图集过大');
  const { width, height } = pngSize(bytes), { frameWidth, frameHeight } = media;
  if (![frameWidth,frameHeight].every(v => Number.isInteger(v) && v >= 16 && v <= 1024) || width % frameWidth || height % frameHeight) throw Error('帧尺寸必须整除图集');
  const count = width/frameWidth * (height/frameHeight), animations = {};
  if (!input.animations || !input.animations.idle) throw Error('需要 idle 动画');
  for (const [action, animation] of Object.entries(input.animations)) {
    if (!ACTIONS.includes(action) || !animation || !Array.isArray(animation.frames) || animation.frames.length < 1 || animation.frames.length > 240 || !animation.frames.every(v => Number.isInteger(v) && v >= 0 && v < count) || !Number.isFinite(animation.fps) || animation.fps < .5 || animation.fps > 30) throw Error('动画映射无效');
    animations[action] = { frames: animation.frames, fps: animation.fps };
  }
  const videos={},clips={};let total=bytes.length;
  if(media.type==='webm') {
    if(input.version!==2 || !media.clips?.idle || Object.keys(media.clips).length>ACTIONS.length)throw Error('需要 v2 WebM 包和 idle 视频');
    for(const [action,clip]of Object.entries(media.clips)) {
      if(!ACTIONS.includes(action)||typeof clip?.data!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/.test(clip.data)||clip.data.length>MAX_BYTES*1.4)throw Error('视频动作无效');
      const video=Buffer.from(clip.data,'base64');total+=video.length;if(total>MAX_BYTES)throw Error('宠物包全部媒体不能超过16MB');
      const info=webmInfo(video);videos[action+'.webm']=video;clips[action]={file:action+'.webm',...info};
    }
  }
  return { manifest: { version: input.version, source:typeof input.source==='string'?input.source.slice(0,300):'', id: input.id, name: input.name.trim(), author: input.author, license: input.license, authorized: input.authorized === true, media: { type: media.type, width, height, frameWidth, frameHeight, ...(media.type==='webm'?{clips}:{}) }, animations, mirror: input.mirror === true, baseline: Math.min(1,Math.max(0,Number(input.baseline) || 0)), actionMap: Object.fromEntries(ACTIONS.filter(action => ACTIONS.includes(input.actionMap?.[action])).map(action => [action,input.actionMap[action]])) }, bytes, videos };
}
// Deliberately narrow archive contract: two regular files, never extract paths.
const MAX_MANIFEST_BYTES=100*1024, MAX_ARCHIVE_BYTES=MAX_BYTES+256*1024;
function readPackArchive(bytes) {
  if(!Buffer.isBuffer(bytes) || bytes.length<22 || bytes.length>MAX_ARCHIVE_BYTES)throw Error('ZIP 大小无效');
  let end=-1;
  for(let at=bytes.length-22;at>=Math.max(0,bytes.length-65557);at--)if(bytes.readUInt32LE(at)===0x06054b50 && at+22+bytes.readUInt16LE(at+20)===bytes.length){end=at;break;}
  if(end<0 || bytes.readUInt16LE(end+4)!==0 || bytes.readUInt16LE(end+6)!==0 || bytes.readUInt16LE(end+8)!==2 || bytes.readUInt16LE(end+10)!==2)throw Error('ZIP 必须只包含 manifest.json 和 atlas.png');
  const centralSize=bytes.readUInt32LE(end+12), centralOffset=bytes.readUInt32LE(end+16);
  if(centralOffset+centralSize!==end || centralOffset>=end)throw Error('ZIP 目录无效');
  const files=new Map(),regions=[];let cursor=centralOffset,total=0;
  for(let entry=0;entry<2;entry++) {
    if(cursor+46>end || bytes.readUInt32LE(cursor)!==0x02014b50)throw Error('ZIP 目录不完整');
    const needed=bytes.readUInt16LE(cursor+6),flags=bytes.readUInt16LE(cursor+8),method=bytes.readUInt16LE(cursor+10),crc=bytes.readUInt32LE(cursor+16),compressed=bytes.readUInt32LE(cursor+20),size=bytes.readUInt32LE(cursor+24),nameLength=bytes.readUInt16LE(cursor+28),extraLength=bytes.readUInt16LE(cursor+30),commentLength=bytes.readUInt16LE(cursor+32),disk=bytes.readUInt16LE(cursor+34),attrs=bytes.readUInt32LE(cursor+38),offset=bytes.readUInt32LE(cursor+42);
    const next=cursor+46+nameLength+extraLength+commentLength;
    if(next>end || needed>20 || flags&~(0x800|8) || ![0,8].includes(method) || disk!==0 || extraLength!==0)throw Error('ZIP 不支持加密、ZIP64 或扩展条目');
    const fileName=bytes.subarray(cursor+46,cursor+46+nameLength).toString('utf8');
    if(!['manifest.json','atlas.png'].includes(fileName) || files.has(fileName) || !bytes.subarray(cursor+46,cursor+46+nameLength).equals(Buffer.from(fileName)))throw Error('ZIP 文件名或重复条目无效');
    const mode=(attrs>>>16)&0xf000;if((mode && mode!==0x8000) || attrs&0x10)throw Error('ZIP 仅接受普通文件');
    const limit=fileName==='manifest.json'?MAX_MANIFEST_BYTES:MAX_BYTES;total+=size;
    if(size<1 || size>limit || total>MAX_BYTES+MAX_MANIFEST_BYTES || compressed<1 || compressed>MAX_ARCHIVE_BYTES)throw Error('ZIP 解压大小超出限制');
    if(offset+30>centralOffset || bytes.readUInt32LE(offset)!==0x04034b50)throw Error('ZIP 本地条目无效');
    const localName=bytes.readUInt16LE(offset+26),localExtra=bytes.readUInt16LE(offset+28),dataStart=offset+30+localName+localExtra,dataEnd=dataStart+compressed;
    if(bytes.readUInt16LE(offset+4)!==needed || bytes.readUInt16LE(offset+6)!==flags || bytes.readUInt16LE(offset+8)!==method || localExtra!==0 || localName!==nameLength || dataEnd>centralOffset || !bytes.subarray(offset+30,offset+30+localName).equals(Buffer.from(fileName)))throw Error('ZIP 本地目录与中央目录不一致');
    const localCrc=bytes.readUInt32LE(offset+14),localCompressed=bytes.readUInt32LE(offset+18),localSize=bytes.readUInt32LE(offset+22);
    if(flags&8 ? ((localCrc && localCrc!==crc)||(localCompressed && localCompressed!==compressed)||(localSize && localSize!==size)) : (localCrc!==crc || localCompressed!==compressed || localSize!==size))throw Error('ZIP 声明尺寸不一致');
    let regionEnd=dataEnd;
    if(flags&8) {
      const descriptor=dataEnd+4<=centralOffset && bytes.readUInt32LE(dataEnd)===0x08074b50?dataEnd+4:dataEnd;
      if(descriptor+12>centralOffset || bytes.readUInt32LE(descriptor)!==crc || bytes.readUInt32LE(descriptor+4)!==compressed || bytes.readUInt32LE(descriptor+8)!==size)throw Error('ZIP 数据描述符无效');
      regionEnd=descriptor+12;
    }
    const source=bytes.subarray(dataStart,dataEnd);let result;
    if(method===0){if(compressed!==size)throw Error('ZIP stored 尺寸不符');result=source;}
    else {const inflated=zlib.inflateRawSync(source,{maxOutputLength:size,info:true});if(inflated.engine.bytesWritten!==compressed)throw Error('ZIP 压缩数据包含多余内容');result=inflated.buffer;}
    if(result.length!==size || crc32(result)!==crc)throw Error('ZIP 文件尺寸或 CRC 校验失败');
    files.set(fileName,result);regions.push([offset,regionEnd]);cursor=next;
  }
  regions.sort((a,b)=>a[0]-b[0]);
  if(cursor!==end || regions[0][0]!==0 || regions[0][1]!==regions[1][0] || regions[1][1]!==centralOffset)throw Error('ZIP 包含未声明或重叠数据');
  const manifest=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(files.get('manifest.json')));
  if(!manifest || manifest.media?.file!=='atlas.png' || manifest.media?.data!=null || ['script','scripts','entrypoint','javascript'].some(key=>Object.hasOwn(manifest,key)))throw Error('ZIP manifest 必须引用 atlas.png，不能包含可执行入口');
  return {...manifest,media:{...manifest.media,data:files.get('atlas.png').toString('base64')}};
}
function createPetPackStore({ directory }) {
  const safe = id => { if (!name(id)) throw Error('无效 ID'); return path.join(directory,id); };
  return {
    async export(id) {
      const manifest = (await this.list()).find(pack=>pack.id===id); if(!manifest)throw Error('找不到伙伴素材');
      const clips={};for(const [action,clip]of Object.entries(manifest.media.clips||{}))clips[action]={data:(await this.media(id,clip.file)).toString('base64')};
      const input={...manifest,media:{...manifest.media,data:(await this.media(id)).toString('base64'),...(manifest.media.type==='webm'?{clips}:{})}};
      validatePack(input);return input;
    },
    async restore(input) {
      const valid=validatePack(input),all=await this.list();
      if(all.some(p=>p.id===input.id)) {
        const existing=validatePack(await this.export(input.id));
        const signature=v=>crypto.createHash('sha256').update(JSON.stringify(v.manifest)).update(v.bytes).update(Buffer.concat(Object.keys(v.videos).sort().map(k=>v.videos[k]))).digest('hex');
        if(signature(existing)===signature(valid))return existing.manifest;
        input={...input,id:input.id.slice(0,46)+'-restore-'+crypto.randomBytes(4).toString('hex')};
      }
      return this.import(input);
    },
    async importArchive(bytes) { return this.import(readPackArchive(bytes)); },
    async import(input) {
      const pack = validatePack(input); await fs.mkdir(directory,{ recursive:true, mode:0o700 });
      const stage = path.join(directory,`.import-${crypto.randomBytes(12).toString('hex')}`);
      await fs.mkdir(stage,{mode:0o700}); try { await fs.writeFile(path.join(stage,'atlas.png'),pack.bytes,{mode:0o600}); for(const [file,data]of Object.entries(pack.videos))await fs.writeFile(path.join(stage,file),data,{mode:0o600}); await fs.writeFile(path.join(stage,'manifest.json'),JSON.stringify(pack.manifest),{mode:0o600}); await fs.rename(stage,safe(pack.manifest.id)); } catch(error) { await fs.rm(stage,{recursive:true,force:true}); throw error; }
      return pack.manifest;
    },
    async list() { await fs.mkdir(directory,{recursive:true,mode:0o700}); const result=[]; for(const item of await fs.readdir(directory,{withFileTypes:true})) if(item.isDirectory() && !item.isSymbolicLink() && name(item.name)) { try { const value=JSON.parse(await fs.readFile(path.join(safe(item.name),'manifest.json'),'utf8')); if(value.id===item.name) result.push(value); } catch {} } return result; },
    async remove(id) { await fs.rm(safe(id),{recursive:true,force:true}); },
    async media(id,filename='atlas.png') { if(filename!=='atlas.png' && !ACTIONS.some(action=>filename===action+'.webm'))throw Error('无效媒体名称'); const folder=await fs.lstat(safe(id)); if(folder.isSymbolicLink() || !folder.isDirectory()) throw Error('无效媒体目录'); const file=path.join(safe(id),filename); const stat=await fs.lstat(file); if(stat.isSymbolicLink() || !stat.isFile() || stat.size>MAX_BYTES) throw Error('无效媒体'); return fs.readFile(file); },
  };
}
async function boundedBytes(request,limit) {
  if (Number(request.headers.get('content-length')) > limit) throw Error('包过大');
  const reader=request.body?.getReader(); if(!reader) throw Error('需要宠物包'); let size=0; const chunks=[];
  try { while(true) { const {done,value}=await reader.read(); if(done) break; size+=value.length; if(size>limit) throw Error('包过大'); chunks.push(value); } } catch(error) { await reader.cancel(); throw error; }
  return Buffer.concat(chunks);
}
async function boundedJson(request) {return JSON.parse((await boundedBytes(request,MAX_BYTES*1.4)).toString('utf8'));}

function createPetPackRoute({ store, bridge }) {
  const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  return async request => {
    const url=new URL(request.url), base='/desktop-pets';
    if(!url.pathname.startsWith(base+'/')) return null;
    try {
      const origin=request.headers.get('origin'); if(origin && origin!==url.origin) return json({error:'来源不允许'},403);
      if(url.pathname===base+'/packs' && request.method==='GET') return json({packs:await store.list()});
      if(url.pathname===base+'/packs/archive' && request.method==='POST') { if(request.headers.get('content-type')?.split(';')[0]!=='application/zip')return json({error:'需要 application/zip'},415); return json({pack:await store.importArchive(await boundedBytes(request,MAX_ARCHIVE_BYTES))},201); }
      if(url.pathname===base+'/packs' && request.method==='POST') return json({pack:await store.import(await boundedJson(request))},201);
      if(url.pathname===base+'/packs/restore' && request.method==='POST') return json({pack:await store.restore(await boundedJson(request))},201);
      const exported=url.pathname.match(/^\/desktop-pets\/packs\/([a-z0-9_-]+)\/export$/);
      if(exported && request.method==='GET') return json({pack:await store.export(exported[1])});
      const match=url.pathname.match(/^\/desktop-pets\/packs\/([a-z0-9_-]+)(\/(?:atlas\.png|[a-z]+\.webm))?$/);
      if(match && match[2] && request.method==='GET') return new Response(await store.media(match[1],match[2].slice(1)),{headers:{'Content-Type':match[2].endsWith('.webm')?'video/webm':'image/png','X-Content-Type-Options':'nosniff','Cache-Control':'no-store'}});
      if(match && !match[2] && request.method==='DELETE') { await store.remove(match[1]); return json({ok:true}); }
      if(url.pathname===base+'/dsh' && bridge) {
        if(request.method==='GET') return json(bridge.status());
        if(request.method==='POST') { const data=await boundedJson(request); if(data.enabled) await bridge.start(data); else await bridge.stop(); return json(bridge.status()); }
      }
      return json({error:'Not found'},404);
    } catch(error) { return json({error:error.message},400); }
  };
}
module.exports={ readPackArchive, MAX_ARCHIVE_BYTES, crc32, ACTIONS, MAX_BYTES, pngSize, validatePack, createPetPackStore, createPetPackRoute };
