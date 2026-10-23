import { syncRequest } from './storage.mjs';
import { readHandoff, writeHandoff } from './focus-handoff.mjs';
import { remainingMs } from '../focus/focus-model.mjs';
import { readRecipes } from '../home/recipes.mjs';
import { applySceneRecipe } from '../home/apply-scene.mjs';
import { playbackPosition } from '../lyrics/lyric-session.mjs';
import { saveJournalEntry } from '../focus/journal-entries.mjs';

const RECEIPTS = 'flow-cabin-live-receipts-v1';
const digest = async text => [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(n=>n.toString(16).padStart(2,'0')).join('');
export function createDeviceSession(getRuntime, { request=syncRequest, storage=globalThis.localStorage, now=Date.now, setTimer=setTimeout, clearTimer=clearTimeout } = {}) {
  let state={connections:[],peers:[],error:''},timer,stopped=false,identity='',updating=false;
  const listeners=new Set(),emit=()=>{for(const cb of listeners)cb(state);};
  const send=(peerId,action,payload={})=>request('/live/send',{peerId,action,payload});
  function recoverCommittedFocus() {
    const h=readHandoff(storage),r=getRuntime();
    if(h?.role!=='owner'||h.activated!==false)return;
    const remaining=h.remaining-Math.max(0,now()-h.committedAt);
    if(r.focus.state.timer.sessionId!==h.sessionId && remaining>0) {
      if(r.focus.state.timer.phase!=='idle')throw Error('交接已提交，但本机有其他计时；请先处理本机计时。');
      r.focus.acceptTransfer({...h,remaining});
    }
    writeHandoff({...h,activated:true},storage);
  }
  async function execute(command) {
    const r=getRuntime(),{action,payload:p,peerId}=command;
    if(command.expiresAt<now())throw Error('操作已过期');
    if(action.startsWith('music.')) {
      if(!r.deck.deckItem || r.deck.provider==='visual')throw Error('对方尚未放上可播放的唱片');
      if(action==='music.toggle')await r.commands.play({propagateError:true});
      if(action==='music.play'&&!r.deck.audible)await r.commands.play({propagateError:true});
      if(action==='music.pause'&&r.deck.audible)await r.commands.play({propagateError:true});
      if(action==='music.next')await r.commands.next();
      if(action==='music.previous')await r.commands.previous();
      if(action==='music.seek'){if(r.deck.provider==='system'||!r.deck.playback.seek)throw Error('当前音源不支持定位');await r.deck.playback.seek(p.position);}
      return '已执行音乐操作';
    }
    if(action==='note.send') {
      if(!r.focus.state.notes || await digest(r.focus.state.notes)===p.base) { if(!r.focus.saveNotes(p.text))throw Error('随手记未能保存'); }
      else { const result=saveJournalEntry({storage,body:p.text,tags:['设备接力'],now:now()});if(!result.ok)throw Error(result.error);r.notify('收到随手记，已保留为新手记；本机草稿仍在。'); }
      return '随手记已保存';
    }
    if(action==='pet.travel') { if(r.commands.pet(p.id)===false)throw Error('伙伴选择未能保存');if(p.accessory && !r.focus.equip('accessory',p.accessory))r.notify('伙伴到了；这件配饰在本机尚未解锁。');return '伙伴已到达'; }
    if(action==='scene.apply') { const recipe=readRecipes(storage).recipes.find(s=>s.id===p.id);if(!recipe)throw Error('场景已被删除');applySceneRecipe(r,recipe,storage);return '场景已启动'; }
    const handoff=readHandoff(storage);
    if(action==='focus.offer') {
      if(handoff?.role==='owner'&&handoff.sessionId===p.sessionId&&handoff.version>=p.version)throw Error('这轮专注已接收');
      if(r.focus.state.timer.phase!=='idle')throw Error('接收端已有计时');
      writeHandoff({...p,role:'prepared',peerId,expiresAt:now()+30000},storage);return 'prepared';
    }
    if(action==='focus.cancel') { if(handoff?.role==='prepared'&&handoff.peerId===peerId&&handoff.sessionId===p.sessionId)writeHandoff(null,storage);return 'cancelled'; }
    if(action==='focus.commit') {
      if(handoff?.role==='owner'&&handoff.sessionId===p.sessionId&&handoff.version===p.version)return 'committed';
      if(handoff?.role!=='prepared'||handoff.peerId!==peerId||handoff.sessionId!==p.sessionId||handoff.version!==p.version||handoff.expiresAt<now())throw Error('没有有效的专注接收确认');
      // Persist ownership before starting the timer. A repeated commit never
      // restarts a timer or issues another reward, even after a process restart.
      const owner={...handoff,role:'owner',owner:identity,activated:false,committedAt:now()};
      writeHandoff(owner,storage);
      try { r.focus.acceptTransfer(handoff); } catch(error) { writeHandoff(handoff,storage);throw error; }
      writeHandoff({...owner,activated:true},storage);
      return 'committed';
    }
    throw Error('不支持的设备操作');
  }
  async function handle(command) {
    const key=`${command.peerId}:${command.id}`;
    let history;try{history=JSON.parse(storage.getItem(RECEIPTS)||'{}');}catch{history={};}
    const old=history[key];
    if(old){await request('/live/ack',{peerId:command.peerId,id:command.id,...old});return;}
    // Write-ahead receipt: if the renderer dies during execution, the command
    // stays uncertain instead of repeating a toggle or a timer after restart.
    history=Object.fromEntries(Object.entries(history).slice(-250));
    history[key]={ok:false,error:'上次操作的结果未确认，请检查对方状态'};storage.setItem(RECEIPTS,JSON.stringify(history));
    let result;try{result={ok:true,result:await execute(command)};}catch(e){result={ok:false,error:e.message};}
    history[key]=result;storage.setItem(RECEIPTS,JSON.stringify(history));
    await request('/live/ack',{peerId:command.peerId,id:command.id,...result});
  }
  async function tick() {
    if(stopped||updating)return;updating=true;
    try {
      const status=await request('/status');identity=status.id;
      if(status.enabled) {
        recoverCommittedFocus();
        const r=getRuntime(),t=r.focus.state.timer,h=readHandoff(storage);
        const position=playbackPosition(r.deck.playback,r.deck.provider==='system'?r.deck.system:null),sung=r.lyricFeed?r.lyricFeed.around(1,8):{lines:[],current:'',next:''};
        const published=await request('/live/publish',{music:{title:r.deck.nowTrack,artist:r.lyricsTrack.artist,playing:r.deck.audible,position:(position||0)/1000,duration:r.lyricsTrack.duration,rate:r.deck.playback.rate||1,anchoredAt:now()},lyrics:{current:sung.current,next:sung.next,lines:sung.lines,skin:r.look||'',title:r.lyricsTrack.title||'',at:now()},focus:{phase:t.phase,remaining:remainingMs(t,now()),paused:t.paused,sessionId:t.sessionId||'',owner:h?.role==='owner'?identity:'',version:t.ownerVersion||0},pet:{id:r.identity.builtinId,accessory:r.identity.accessory},scenes:readRecipes(storage).recipes.map(({id,name})=>({id,name}))});
        state={...published,error:'',deviceId:identity};emit();
        for(const c of published.commands || [])if(!stopped)await handle(c);
        if(h?.role==='source' && published.peers.some(p=>p.peerId===h.peerId&&p.snapshot.focus.sessionId===h.sessionId&&p.snapshot.focus.owner===h.peerId&&p.snapshot.focus.version===h.version)) { if(r.focus.releaseTransfer(h.sessionId))writeHandoff({...h,role:'sent'},storage); }
      } else {state={connections:[],peers:[],error:'',deviceId:identity};emit();}
    }catch(e){state={...state,error:e.message};emit();}
    finally{updating=false;if(!stopped)timer=setTimer(tick,state.connections.length?500:3000);}
  }
  return {
    getSnapshot:()=>state,subscribe(cb){listeners.add(cb);return()=>listeners.delete(cb);},start(){stopped=false;void tick();},stop(){stopped=true;clearTimer(timer);},
    send,connect:peerId=>request('/live/connect',{peerId}),
    async sendNote(peerId){const text=getRuntime().focus.state.notes;return send(peerId,'note.send',{text,base:await digest(text)});},
    async transferFocus(peerId) {
      const r=getRuntime(),data=r.focus.prepareTransfer();let committing=false;
      writeHandoff({...data,role:'source',peerId,at:now()},storage);
      try {
        await send(peerId,'focus.offer',data);committing=true;
        await send(peerId,'focus.commit',data);
        if(!r.focus.releaseTransfer(data.sessionId))throw Error('接收已完成，本机交接状态尚未保存');
        writeHandoff({...data,role:'sent',peerId,at:now()},storage);
      } catch(e) {
        if(!committing){writeHandoff(null,storage);send(peerId,'focus.cancel',data).catch(()=>{});}
        throw Error(committing?'接收确认中断，本机保持暂停；重连后确认所有权。':`${e.message}；本机计时已暂停，可手动继续。`);
      }
    },
    discardTransfer(){const h=readHandoff(storage);if(h?.role==='source'&&getRuntime().focus.releaseTransfer(h.sessionId))writeHandoff({...h,role:'sent'},storage);}
  };
}
