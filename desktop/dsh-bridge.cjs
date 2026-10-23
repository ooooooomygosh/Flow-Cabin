'use strict';
// Official API verified against PC2005-cloud/dsh-pet API.md + openapi.yaml.
// Assets stay with their author; this module only sends named animation cues.
const DEFAULT_MAPPING=Object.freeze({typing:'写代码',focus:'轻快记录',listen:'悠闲哼歌',groove:'轻快摇摆舞',stretch:'超大伸懒腰'});
function createDshBridge({getSnapshot=()=>({}),fetchImpl=fetch,now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout}={}) {
  let enabled=false,config=null,lockId='',expiresAt=0,counter=0,timer=null,error='',generation=0,lastAction='',lastAt=0,playbackId='',remoteConfig=null;
  const status=()=>({enabled,port:config?.port || null,petId:config?.petId || 'main',mapping:config?.mapping || DEFAULT_MAPPING,expiresAt,playbackId,error,protocol:'dsh-pet-7340'});
  async function call(endpoint,{method='GET',body,query={},signal}={}) {
    if(!config || !/^\/(state|config|lock|lock\/release|anim|playback\/[a-zA-Z0-9_-]+)$/.test(endpoint))throw Error('不允许的桌宠接口');
    const url=new URL(`http://127.0.0.1:${config.port}/dsh-pet-7340${endpoint}`);for(const [key,value]of Object.entries(query))url.searchParams.set(key,String(value));
    const response=await fetchImpl(url,{method,body:body===undefined?undefined:JSON.stringify(body),headers:body===undefined?{}:{'Content-Type':'application/json'},redirect:'error',signal:signal || AbortSignal.timeout(4000)});
    if(!response.ok)throw Error(`dsh HTTP ${response.status}`);
    const text=await response.text();if(text.length>1024*1024)throw Error('dsh 响应过大');const result=JSON.parse(text);if(result.ok===false) {const e=Error(result.message || result.reason || 'dsh 请求失败');e.reason=result.reason;throw e;}return result;
  }
  async function release() {const lock=lockId;lockId='';expiresAt=0;if(lock)try{await call('/lock/release',{method:'POST',query:{pet:config.petId},body:{lockId:lock}});}catch {}}
  async function stop() {enabled=false;generation++;clearTimer(timer);timer=null;await release();return status();}
  async function revoke() {error='桌宠已由用户接管；重新连接后才会恢复联动。';return stop();}
  async function play(action) {
    if(!enabled || !lockId || expiresAt<=now())throw Error('桌宠未连接或占用已结束');
    const snapshot=getSnapshot();if(snapshot.quiet || snapshot.paused){await stop();throw Error('联动已暂停');}
    const name=config.mapping[action];if(typeof name!=='string' || !name || name.length>100)throw Error('尚未映射这个动作');
    if(lastAction===action && now()-lastAt<5000)return {skipped:true};
    try {const result=await call('/anim',{method:'POST',query:{pet:config.petId,surface:'any',lock:lockId},body:{name}});playbackId=result.playbackId || result.data?.playbackId || '';lastAction=action;lastAt=now();return result;}
    catch(e){if(['lock-lost','lock-required'].includes(e.reason))await revoke();throw e;}
  }
  async function poll(epoch) {
    if(!enabled || epoch!==generation)return;
    try {
      const snapshot=getSnapshot();if(snapshot.quiet || snapshot.paused){await stop();return;}
      const state=await call('/state',{query:{since:counter,timeout:1000}});if(epoch!==generation)return;
      counter=Number(state.counter)||counter;
      const lock=state.pets?.[config.petId]?.lock?.data;
      if(lock && (!lock.locked || lock.expiresAt<=now())){await revoke();return;}
      if(expiresAt-now()<30000){const renewed=await call('/lock',{method:'POST',query:{pet:config.petId,surface:'any'},body:{lockId,ttl:120000}});expiresAt=renewed.expiresAt || renewed.data?.expiresAt || 0;}
      if(config.mapping[snapshot.pose] && (snapshot.pose!==lastAction || now()-lastAt>=15000))await play(snapshot.pose);
    }catch(e){error=e.message;await stop();return;}
    if(enabled && epoch===generation)timer=setTimer(()=>poll(epoch),500);
  }
  async function start(input={}) {
    await stop();
    if(!Number.isInteger(input.port) || input.port<1 || input.port>65535 || typeof input.petId!=='string' || !/^[a-zA-Z0-9_.-]{1,80}$/.test(input.petId))throw Error('请输入 dsh 本机端口与宠物 ID');
    const mapping={...DEFAULT_MAPPING};for(const [key,value]of Object.entries(input.mapping || {}))if(Object.hasOwn(DEFAULT_MAPPING,key) && typeof value==='string' && value.length<=100)mapping[key]=value;
    config={port:input.port,petId:input.petId,mapping};error='';lastAction='';
    try{remoteConfig=await call('/config');const lock=await call('/lock',{method:'POST',query:{pet:config.petId,surface:'any'},body:{ttl:120000}});lockId=lock.lockId || lock.data?.lockId;expiresAt=lock.expiresAt || lock.data?.expiresAt;if(typeof lockId!=='string' || !Number.isFinite(expiresAt) || expiresAt<=now())throw Error('dsh 返回了无效占用锁');enabled=true;const epoch=generation;timer=setTimer(()=>poll(epoch),0);return status();}catch(e){error=e.message;await release();throw e;}
  }
  async function playback(id=playbackId){if(!/^[a-zA-Z0-9_-]{1,120}$/.test(id))throw Error('无效播放编号');return call(`/playback/${id}`);}
  return{start,stop,revoke,status,play,playback,getRemoteConfig:()=>remoteConfig};
}
module.exports={createDshBridge,DEFAULT_MAPPING};
