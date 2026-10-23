// Absolute deadlines survive background throttling. A single controller belongs
// to the persistent runtime, so closing the panel never cancels the fade.
export function createSleepController({getRuntime,setLight,setResting,now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout}) {
  let state={active:false},timer,epoch=0;
  const listeners=new Set(),emit=()=>{for(const cb of listeners)cb(state);};
  const restore=(light=true)=>{if(!state.active)return;const r=getRuntime();if(state.volume!==undefined)r.deck.playback.setVolume(state.volume);r.sound.setMaster(state.master);if(light)setLight(state.theme,state.dim);};
  const cancel=()=>{epoch++;clearTimer(timer);restore();state={active:false};emit();};
  const tick=async token=>{
    if(!state.active||token!==epoch)return;
    const r=getRuntime(),remaining=Math.max(0,state.endsAt-now());
    if(r.deck.record?.id!==state.recordId||r.deck.provider!==state.provider){cancel();return;}
    try {
      const progress=Math.min(1,remaining/30000);
      if(progress<1){if(state.volume!==undefined)r.deck.playback.setVolume(state.volume*progress);r.sound.setMaster(state.master*progress);if(!state.dimmed){setLight(state.theme,true);state={...state,dimmed:true};}}
      state={...state,remaining};emit();
      if(remaining===0){
        if(r.deck.audible)await r.commands.play({propagateError:true});
        if(token!==epoch)return;
        r.sound.turnOff();restore(false);setResting(true);
        state={active:false,completed:true,pauseRequested:Boolean(r.deck.audible)};emit();return;
      }
    }catch(error){restore();state={active:false,error:error.message||'睡前模式未完成，请检查播放器。'};emit();return;}
    timer=setTimer(()=>tick(token),1000);
  };
  return {getSnapshot:()=>state,subscribe(cb){listeners.add(cb);return()=>listeners.delete(cb);},
    start(minutes=15){const r=getRuntime();if(r.deck.provider==='system')throw Error('系统媒体源无法可靠淡出，请先切换到小屋内的音源。');cancel();const duration=Math.max(1,Math.min(180,Number(minutes)||15))*60000;state={active:true,endsAt:now()+duration,remaining:duration,recordId:r.deck.record?.id,provider:r.deck.provider,volume:r.deck.playback.remote?undefined:r.deck.playback.volume,master:r.sound.mix.master,theme:r.look,dim:r.dim};emit();void tick(epoch);},
    cancel,dispose(){cancel();listeners.clear();}};
}
