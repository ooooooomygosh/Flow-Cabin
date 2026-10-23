'use strict';
const tls = require('node:tls'), https = require('node:https'), crypto = require('node:crypto');
const { WebSocket, WebSocketServer } = require('ws');
const MAX = 128 * 1024;
const ACTIONS = new Set(['music.toggle','music.play','music.pause','music.next','music.previous','music.seek','focus.offer','focus.commit','focus.cancel','note.send','pet.travel','scene.apply']);
const string = (v, n = 200) => typeof v === 'string' ? v.slice(0, n) : '';
const id = v => typeof v === 'string' && /^[\w:-]{1,100}$/.test(v);
const number = (v, max) => Number.isFinite(v) ? Math.max(0, Math.min(max, v)) : 0;
function cleanLiveSnapshot(v = {}) {
  return { version:1, at:Date.now(), capabilities:['music','lyrics','focus','notes','pet','scene'],
    music:{ title:string(v.music?.title), artist:string(v.music?.artist), playing:v.music?.playing===true, position:number(v.music?.position,86400), duration:number(v.music?.duration,86400), rate:number(v.music?.rate,4) || 1, anchoredAt:number(v.music?.anchoredAt,9e15) },
    lyrics:{ current:string(v.lyrics?.current,1000), next:string(v.lyrics?.next,1000), at:number(v.lyrics?.at,9e15) },
    focus:{ phase:['focus','shortBreak','longBreak'].includes(v.focus?.phase)?v.focus.phase:'idle', remaining:number(v.focus?.remaining,10800000), paused:v.focus?.paused===true, sessionId:string(v.focus?.sessionId,100), owner:string(v.focus?.owner,100), version:number(v.focus?.version,1e9) },
    pet:{ id:['cat','chick','bunny','bear','fox'].includes(v.pet?.id)?v.pet.id:'cat', accessory:['headphones','scarf','beanie','bow','sprout'].includes(v.pet?.accessory)?v.pet.accessory:'' },
    scenes:(Array.isArray(v.scenes)?v.scenes:[]).slice(0,30).filter(s=>id(s?.id)).map(s=>({id:s.id,name:string(s.name,60)})) };
}
function cleanCommand(v, now = Date.now()) {
  if (!v || !id(v.id) || !ACTIONS.has(v.action) || !Number.isFinite(v.expiresAt) || v.expiresAt < now || v.expiresAt > now + 20000) throw Error('操作已过期或格式无效');
  const p = v.payload || {}; let payload = {};
  if (v.action === 'music.seek') payload = { position:number(p.position,86400) };
  if (v.action === 'note.send') { if (typeof p.text !== 'string' || p.text.length > 8000) throw Error('手记过长'); payload = { text:p.text, base:string(p.base,64) }; }
  if (v.action === 'scene.apply') { if (!id(p.id)) throw Error('场景无效'); payload = { id:p.id }; }
  if (v.action === 'pet.travel') payload = cleanLiveSnapshot({pet:p}).pet;
  if (v.action.startsWith('focus.')) {
    if (!id(p.sessionId) || !Number.isSafeInteger(p.version) || p.version < 1) throw Error('专注交接身份无效');
    payload = { sessionId:p.sessionId, version:p.version, remaining:number(p.remaining,10800000), duration:number(p.duration,10800000), phase:['focus','shortBreak','longBreak'].includes(p.phase)?p.phase:'focus' };
  }
  return { type:'command', id:v.id, action:v.action, expiresAt:v.expiresAt, payload };
}

function createLiveSession({ identity, getPeers, privateIP, endpoint, signature, equal, hash, now = Date.now }) {
  const sockets = new Map(), remotes = new Map(), inbox = new Map(), receipts = new Map(), pending = new Map(), nonces = new Map(), reconnect = new Map(), connecting = new Map();
  let local = cleanLiveSnapshot(), active = false, server, heartbeat;
  const wire = (ws, value) => { if (ws?.readyState === WebSocket.OPEN && ws.bufferedAmount < MAX * 4) ws.send(JSON.stringify(value)); };
  const peerSocket = peer => sockets.get(peer);
  function attach(peer, ws) {
    if (!getPeers().some(p=>p.id===peer)) { ws.close(); return; }
    sockets.get(peer)?.terminate(); sockets.set(peer,ws);
    clearTimeout(reconnect.get(peer)); reconnect.delete(peer);
    ws.alive = true; ws.on('pong',()=>{ws.alive=true;});
    ws.on('error',()=>{});
    ws.on('message',(raw,binary)=>{
      if (binary || raw.length > MAX || !getPeers().some(p=>p.id===peer)) { ws.close(1008); return; }
      try {
        const value = JSON.parse(raw);
        if (value.type === 'snapshot') { remotes.set(peer,{...cleanLiveSnapshot(value.value),receivedAt:now()}); return; }
        if (value.type === 'ack' && id(value.id)) {
          const request = pending.get(value.id);
          if (request?.peer === peer) { pending.delete(value.id); clearTimeout(request.timer); value.ok === true ? request.resolve({id:value.id,ok:true,result:string(value.result,200)}) : request.reject(Error(string(value.error,200) || '对方未执行操作')); }
          return;
        }
        const command = cleanCommand(value,now()), key = `${peer}:${command.id}`;
        if (receipts.has(key)) { wire(ws,receipts.get(key).value); return; }
        if (inbox.has(key)) return;
        if (inbox.size >= 100) throw Error('等待处理的操作过多');
        inbox.set(key,{...command,peerId:peer});
      } catch (error) { let value; try { value=JSON.parse(raw); } catch {} if(id(value?.id))wire(ws,{type:'ack',id:value.id,ok:false,error:error.message}); }
    });
    ws.on('close',()=>{
      if(sockets.get(peer)!==ws)return; sockets.delete(peer); remotes.delete(peer);
      for(const [key,c] of inbox)if(c.peerId===peer)inbox.delete(key);
      for(const [key,p] of pending)if(p.peer===peer){pending.delete(key);clearTimeout(p.timer);p.reject(Error('连接中断，操作不会自动重放'));}
      schedule(peer);
    });
    wire(ws,{type:'snapshot',value:local});
  }
  function connect(peerId) {
    if(connecting.has(peerId))return connecting.get(peerId);
    const attempt=connectOnce(peerId).finally(()=>connecting.delete(peerId));connecting.set(peerId,attempt);return attempt;
  }
  async function connectOnce(peerId) {
    const peer = getPeers().find(p=>p.id===peerId);
    if (!active || !peer?.address) throw Error('请开启接收并从已知地址的一端连接');
    if (peerSocket(peerId)?.readyState === WebSocket.OPEN) return status();
    const url = new URL(endpoint(peer.address));
    return new Promise((resolve,reject)=>{
      // Pin TLS before constructing the upgrade request or sending its HMAC.
      const socket=tls.connect({host:url.hostname,port:Number(url.port)||443,rejectUnauthorized:false,minVersion:'TLSv1.2'});
      let ws,agent,done=false;
      const finish=error=>{if(done)return;done=true;clearTimeout(timer);if(error){ws?.terminate();socket.destroy();agent?.destroy();reject(error);}else resolve(status());};
      const timer=setTimeout(()=>finish(Error('实时连接超时')),10000);timer.unref?.();
      socket.on('error',finish);
      socket.once('secureConnect',()=>{
        if(!socket.getPeerCertificate().raw || !equal(hash(socket.getPeerCertificate().raw),peer.pin))return finish(Error('证书指纹不匹配'));
        if(!active || !getPeers().some(p=>p.id===peer.id&&equal(p.key,peer.key)))return finish(Error('设备已撤销'));
        const nonce=`${now()}:${crypto.randomBytes(32).toString('hex')}`;
        agent=new https.Agent({keepAlive:false,maxSockets:1});agent.createConnection=()=>socket;
        ws=new WebSocket(`${url.origin.replace('https:','wss:')}/live`,{agent,perMessageDeflate:false,maxPayload:MAX,handshakeTimeout:8000,headers:{'x-cabin-device':identity.id,'x-cabin-nonce':nonce,'x-cabin-signature':signature(peer.key,'GET','/live',nonce,'')}});
        ws.once('error',finish);ws.once('open',()=>{attach(peer.id,ws);finish();});ws.once('close',()=>agent.destroy());
      });
    });
  }
  function schedule(peerId) {
    if(!active || reconnect.has(peerId) || !getPeers().some(p=>p.id===peerId&&p.autoReconnect&&p.address))return;
    const timer=setTimeout(()=>{reconnect.delete(peerId);connect(peerId).catch(()=>schedule(peerId));},5000);timer.unref?.();reconnect.set(peerId,timer);
  }
  function install(httpsServer) {
    active=true;server=new WebSocketServer({noServer:true,maxPayload:MAX,perMessageDeflate:false});
    httpsServer.on('upgrade',(req,socket,head)=>{
      const peer=getPeers().find(p=>p.id===req.headers['x-cabin-device']), nonce=req.headers['x-cabin-nonce'];
      for(const [key,expiry]of nonces)if(expiry<now())nonces.delete(key);
      if(req.url!=='/live'||!privateIP(req.socket.remoteAddress||'')||req.headers.origin||req.headers.cookie||!peer||!/^\d{10,16}:[a-f0-9]{64}$/.test(nonce||'')||Math.abs(now()-Number(nonce.split(':')[0]))>120000||nonces.has(nonce)||nonces.size>=2048||!equal(signature(peer.key,'GET','/live',nonce,''),req.headers['x-cabin-signature'])){socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');return;}
      nonces.set(nonce,now()+120000);server.handleUpgrade(req,socket,head,ws=>attach(peer.id,ws));
    });
    clearInterval(heartbeat);heartbeat=setInterval(()=>{for(const ws of sockets.values()){if(!ws.alive){ws.terminate();continue;}ws.alive=false;ws.ping();}},15000);heartbeat.unref?.();
    for(const peer of getPeers())schedule(peer.id);
  }
  function publish(value) {
    local=cleanLiveSnapshot(value);
    for(const ws of sockets.values())wire(ws,{type:'snapshot',value:local});
    for(const [key,c]of inbox)if(c.expiresAt<now()){wire(peerSocket(c.peerId),{type:'ack',id:c.id,ok:false,error:'操作已过期'});inbox.delete(key);}
    for(const [key,r]of receipts)if(r.expiresAt<now())receipts.delete(key);
    return { ...status(), commands:[...inbox.values()] };
  }
  function ack({peerId,id:commandId,ok,error,result}) {
    const key=`${peerId}:${commandId}`,command=inbox.get(key);
    if(!command)return {ok:false};
    const value={type:'ack',id:commandId,ok:ok===true,error:string(error,200),result:string(result,200)};
    receipts.set(key,{value,expiresAt:now()+600000});inbox.delete(key);
    if(receipts.size>1000)receipts.delete(receipts.keys().next().value);
    wire(peerSocket(peerId),value);return {ok:true};
  }
  function send({peerId,action,payload}) {
    const ws=peerSocket(peerId);if(ws?.readyState!==WebSocket.OPEN)throw Error('对方尚未在线');
    const command=cleanCommand({id:crypto.randomUUID(),action,payload,expiresAt:now()+12000},now());
    return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(command.id);reject(Error('没有收到执行确认，操作不会自动重放'));},12500);timer.unref?.();pending.set(command.id,{peer:peerId,resolve,reject,timer});wire(ws,command);});
  }
  function disconnect(peerId) { clearTimeout(reconnect.get(peerId));reconnect.delete(peerId);sockets.get(peerId)?.terminate();remotes.delete(peerId); }
  function stop() { active=false;clearInterval(heartbeat);for(const t of reconnect.values())clearTimeout(t);reconnect.clear();for(const ws of sockets.values())ws.terminate();sockets.clear();remotes.clear();inbox.clear();for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('实时连接已关闭'));}pending.clear();server?.close(); }
  function status(){return {active,connections:[...sockets.keys()],peers:[...remotes].map(([peerId,snapshot])=>({peerId,snapshot}))};}
  return {install,connect,disconnect,stop,publish,ack,send,status,schedule};
}
module.exports={createLiveSession,cleanLiveSnapshot,cleanCommand,ACTIONS};
