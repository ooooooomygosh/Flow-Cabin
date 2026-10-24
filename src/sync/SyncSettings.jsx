import React, { useEffect, useState } from 'react';
import { importSyncedFavorites, applySnapshot, applyIfUnchanged, storageFingerprint, withSyncLock, layoutConflicts, restoreLayoutConflict, exportSnapshot, syncRequest } from './storage.mjs';
import './sync.css';
import PairQr from './PairQr';
import LiveDevices from './LiveDevices';
import { parsePairingPayload } from './pairing-model.mjs';
import { explainDeviceError } from './device-status.mjs';
export default function SyncSettings() {
  const [state, setState] = useState(null), [invite, setInvite] = useState(null), [payload, setPayload] = useState(''), [address, setAddress] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const refresh = async () => setState(await syncRequest('/status'));
  useEffect(() => { if (!window.albumMobile?.syncRequest && !window.albumDesktopCapabilities?.lanSync) { setMessage('此页面未连接本机同步服务，请使用桌面或 Android 客户端。'); return; } refresh().catch(() => setMessage('请在支持本机服务的桌面或 Android 客户端中使用局域网同步。')); }, []);
  const act = async fn => { setBusy(true); setMessage(''); try { await withSyncLock(fn); await refresh(); } catch (e) { setMessage(explainDeviceError(e)); } finally { setBusy(false); } };
  return <section className="lan-settings" aria-label="局域网同步">
    <h3>让两间小屋相遇</h3><p>同一 Wi-Fi 下连接自己的小屋，同步手记、家具布局、伙伴、配饰、场景与收藏。首次配对请核对对方显示的证书指纹；音乐账号和登录信息留在各自设备。</p>
    <p role="status">{state ? state.enabled ? '局域网接收已开启' : '局域网接收已关闭' : '正在检查桌面服务…'}{message && ` · ${message}`}</p>
    {state && <><div className="lan-actions"><button disabled={busy} onClick={() => act(async () => { await syncRequest(state.enabled ? '/stop' : '/start', {}); if (!state.enabled) applySnapshot(await syncRequest('/stage', await exportSnapshot())); else setInvite(null); })}>{state.enabled ? '关闭接收' : '开启局域网接收'}</button><button disabled={busy} onClick={() => act(async () => { setInvite(await syncRequest('/invite', {})); applySnapshot(await syncRequest('/stage', await exportSnapshot())); })}>生成 2 分钟配对码</button><button disabled={busy || !state.enabled} onClick={() => act(async () => { const summary = applySnapshot(await syncRequest('/stage', await exportSnapshot())); setMessage(`已载入：${summary.notes} 页手记，${summary.focus} 次专注`); })}>载入收到的更新</button></div>
    {state.enabled && <details><summary>本机地址与证书指纹</summary>{state.addresses.map(a => <code key={a}>{a}</code>)}<code>{state.pin}</code><p>选择同一 Wi-Fi 的地址（127.0.0.1 只用于本机）。设备休眠或退出客户端后暂停接收。</p></details>}
    <LiveDevices peers={state.peers} enabled={state.enabled} onRefresh={refresh}/>
    <PairQr invite={invite} onScan={data => { setPayload(JSON.stringify(data)); setAddress(data.addresses?.find(value => !value.includes('127.0.0.1')) || data.addresses?.[0] || ''); }}/>
    {invite && <label>配对载荷（含一次性密钥，仅交给自己的另一台设备）<textarea readOnly rows={5} value={JSON.stringify(invite)} onFocus={e => e.currentTarget.select()}/><small>有效至 {new Date(invite.expiresAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}；成功使用一次即失效。</small></label>}
    <label>另一台小屋的配对载荷<textarea rows={3} value={payload} onChange={e => setPayload(e.target.value)} placeholder="粘贴对方生成的配对载荷"/></label><label>对方局域网 HTTPS 地址<input value={address} onChange={e => setAddress(e.target.value)} placeholder="https://192.168.1.8:端口"/></label>
    <button disabled={busy || !payload || !address} onClick={() => act(async () => { const data = parsePairingPayload(payload); await syncRequest('/pair', { address, pin: data.pin, token: data.token }); setPayload(''); setMessage('已配对，请点击一键同步'); })}>核对指纹后配对</button>
    {state.peers.map(peer => <div className="lan-peer" key={peer.id}><span>{peer.name}<small>{peer.address || '从另一台发起配对'}</small><code>{peer.pin}</code></span><button disabled={busy || !peer.address} onClick={() => act(async () => { const fingerprint = storageFingerprint(); const result = await syncRequest('/sync', { peerId: peer.id, snapshot: await exportSnapshot() }); const summary = applyIfUnchanged(result, fingerprint); await importSyncedFavorites(); setMessage(`同步完成：${summary.notes} 页手记，${summary.focus} 次专注；布局冲突副本 ${summary.conflicts} 份。重新进入房间可载入新布局。`); })}>一键同步</button><button disabled={busy} onClick={() => act(async () => { await syncRequest('/revoke', { id: peer.id }); setMessage('已撤销此设备，重新同步需再次配对'); })}>撤销信任</button></div>)}</>}
    {state && layoutConflicts().map(copy => <div className="lan-peer" key={copy.key}><span>布局冲突副本 · {copy.value.theme}</span><button disabled={busy} onClick={() => act(async () => { restoreLayoutConflict(copy.key); setMessage('已采用布局副本，重新进入房间即可看到。'); })}>采用此布局</button></div>)}
    <p className="lan-hint">同一页面的不同修改保留冲突副本；删除记录会保留删除标记。布局冲突可在这里选择采用副本。此功能用于自己的局域网设备互传。</p>
  </section>;
}
