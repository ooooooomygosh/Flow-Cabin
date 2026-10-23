import Dialog from '../Dialog';
import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { useCabinRuntime } from '../runtime/CabinRuntime';
import { readHandoff } from './focus-handoff.mjs';
import { syncRequest } from './storage.mjs';
import { formatClock } from '../focus/focus-model.mjs';

export default function LiveDevices({ peers, enabled, onRefresh }) {
  const runtime = useCabinRuntime(), service = runtime.devices;
  const live = useSyncExternalStore(service.subscribe, service.getSnapshot);
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(''), [lyrics, setLyrics] = useState(''), [handoff, setHandoff] = useState(readHandoff);
  useEffect(() => { const update = () => setHandoff(readHandoff()); window.addEventListener('cabin:handoff', update); return () => window.removeEventListener('cabin:handoff', update); }, []);
  const act = async (key, fn) => { setBusy(key); setMessage(''); try { const result = await fn(); setMessage(result?.result || '已完成'); } catch (error) { setMessage(error.message); } finally { setBusy(''); } };
  const selected = live.peers.find(peer => peer.peerId === lyrics)?.snapshot;
  return <section className="live-devices" aria-label="实时设备联动">
    <h3>让另一台设备接着陪伴</h3>
    <p>连接后可遥控音乐、显示歌词，或把暂停后的专注交给另一台小屋。</p>
    {peers.length === 0 && <p>先完成下方配对，即可连接自己的另一台设备。</p>}
    {peers.map(peer => {
      const snapshot = live.peers.find(p => p.peerId === peer.id)?.snapshot, online = live.connections.includes(peer.id);
      const send = (action, payload) => act(peer.id, () => service.send(peer.id, action, payload));
      return <article className="live-device" key={peer.id}>
        <div className="live-device-heading"><strong>{peer.name}</strong><span>{online ? '已连接' : '未连接'}</span></div>
        {!online && <button disabled={Boolean(busy) || !enabled || !peer.address} onClick={() => act(peer.id, () => service.connect(peer.id))}>连接这台小屋</button>}
        <label className="live-reconnect"><input type="checkbox" checked={peer.autoReconnect === true} disabled={Boolean(busy)} onChange={e => { const autoReconnect = e.target.checked; act(peer.id, async () => { await syncRequest('/live/preferences', { peerId: peer.id, autoReconnect }); await onRefresh(); }); }}/>同一网络下自动重连</label>
        {online && snapshot && <>
          <p>{snapshot.music.title || '尚未播放音乐'}{snapshot.music.artist ? ` · ${snapshot.music.artist}` : ''}</p>
          <div className="lan-actions"><button disabled={Boolean(busy)} onClick={() => send('music.previous')}>上一首</button><button disabled={Boolean(busy)} onClick={() => send(snapshot.music.playing ? 'music.pause' : 'music.play')}>{snapshot.music.playing ? '暂停' : '播放'}</button><button disabled={Boolean(busy)} onClick={() => send('music.next')}>下一首</button><button onClick={() => setLyrics(peer.id)}>歌词副屏</button></div>
          <p>{snapshot.focus.phase === 'idle' ? '对方正在自由活动' : `对方${snapshot.focus.phase === 'focus' ? '专注' : '休息'}剩余 ${formatClock(snapshot.focus.remaining)}${snapshot.focus.paused ? ' · 已暂停' : ''}`}</p>
          <div className="lan-actions"><button disabled={Boolean(busy) || runtime.focus.state.timer.phase === 'idle' || handoff?.role === 'source'} onClick={() => act(peer.id, () => service.transferFocus(peer.id))}>把这轮专注交过去</button><button disabled={Boolean(busy) || !runtime.focus.state.notes} onClick={() => act(peer.id, () => service.sendNote(peer.id))}>发送随手记</button><button disabled={Boolean(busy) || runtime.identity.kind === 'imported'} onClick={() => send('pet.travel', { id: runtime.identity.builtinId, accessory: runtime.identity.accessory })}>让伙伴去旅行</button></div>
          {snapshot.scenes.length > 0 && <label>启动对方的场景<select value="" disabled={Boolean(busy)} onChange={e => e.target.value && send('scene.apply', { id: e.target.value })}><option value="">选择场景</option>{snapshot.scenes.map(scene => <option key={scene.id} value={scene.id}>{scene.name}</option>)}</select></label>}
        </>}
      </article>;
    })}
    {handoff?.role === 'source' && <div role="status"><p>专注交接正在确认，本机保持暂停。重新连接后会核对接收状态。</p><button onClick={() => service.discardTransfer()}>结束本机这一轮，不重复计时</button></div>}
    {(message || live.error) && <p role="status">{message || live.error}</p>}
    {lyrics && <Dialog title="歌词副屏" close={()=>setLyrics('')} size="xl" className="live-lyric-dialog"><div className="live-lyrics" role="region" aria-label="歌词副屏"><small>{selected?.music.title || '等待连接'}</small><strong>{selected?.lyrics.current || '等待歌词…'}</strong><p>{selected?.lyrics.next || ''}</p></div></Dialog>}
  </section>;
}
