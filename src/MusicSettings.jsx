import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Music2, FolderOpen, Trash2, Loading } from './icons';
import { desktopCommand, useDesktopAppearance } from './desktop-client';
import './player/player.css';

// "Use on the deck": one click from a connected source to hearing it.
function UseSource({ value, provider, useSource }) {
  if (!useSource) return null;
  return provider === value ? <span className="music-source-current" aria-label={`唱机正在使用 ${providerLabel(value)}`}>唱机在用</span> : <button type="button" className="music-source-use" onClick={() => useSource(value)}>在唱机上用</button>;
}
import { musicRequest, normalizeLocalLibrary } from './room-playback.mjs';
import { requestPermission, providerLabel } from './player/sources.mjs';

// Requested tier. Platforms answer with the best tier the account may play;
// the deck status shows the tier that is actually playing.
function QualitySetting({ config, onChange }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const options = Array.isArray(config.qualities) && config.qualities.length ? config.qualities : [{ id: 'standard', label: '标准 · 128k' }, { id: 'exhigh', label: '高品质 · 320k' }, { id: 'lossless', label: '无损 · FLAC' }];
  const change = async (event) => { setBusy(true); setError(''); try { onChange(await musicRequest('/quality', { quality: event.target.value })); window.dispatchEvent(new Event('album-music-settings')); } catch (cause) { setError(cause.message); } finally { setBusy(false); } };
  return <section className="music-local music-quality"><h3>音质</h3>
    <label>QQ 音乐 / 网易云音质<select aria-label="音质" value={config.quality || 'exhigh'} disabled={busy} onChange={change}>{options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
    <p>没有会员或这首歌没有该音质时，会自动换成能播放的最高音质，唱机上会显示实际播放的音质。</p>{error && <p className="record-error" role="alert">{error}</p>}
  </section>;
}

// 系统 Apple Music (macOS): plays songs from your library in the “音乐” App.
function AppleMusicSetting({ available, provider, useSource }) {
  const [state, setState] = useState(null), [busy, setBusy] = useState(false);
  if (!available) return null;
  const check = async () => { setBusy(true); setState(await requestPermission('appleMusic')); setBusy(false); };
  return <section className="music-local music-apple"><h3>系统 Apple Music <UseSource value="appleMusic" provider={provider} useSource={useSource}/></h3>
    <p>在 Mac 的“音乐”App 资料库里找到同一首歌并在那里播放，小屋显示进度并可暂停、切歌。Apple 不允许把音频转到其他应用，所以声音来自“音乐”App。歌单请在「歌单」里选「音乐 App」导入。</p>
    <button type="button" disabled={busy} onClick={check}>{busy ? '正在检查…' : '检查“自动化”权限'}</button>
    {state && <p role="status">{state.granted ? '已允许控制“音乐”App。' : state.error || '尚未授权。'}</p>}
  </section>;
}

// Local folders are scanned in place; files are never copied or uploaded.
function LocalMusicSettings() {
  const [summary, setSummary] = useState(null), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const alive = useRef(false), pending = useRef(false), revision = useRef(0), request = useRef(null), wasScanning = useRef(false);
  const progress = '正在扫描音乐文件，大型文件夹可能需要几分钟。可关闭此窗口，扫描会继续。';
  const complete = (next) => `扫描完成：${next.albumCount} 张专辑，${next.trackCount} 首歌曲。`;
  const load = async () => {
    const version = revision.current;
    try {
      const next = normalizeLocalLibrary(await musicRequest('/local/summary'));
      if (!alive.current || version !== revision.current) return;
      setSummary(next);
      if (!pending.current) {
        setBusy(Boolean(next.scanning));
        if (next.scanning) setMessage(progress);
        else if (wasScanning.current) setMessage(`扫描已结束：${next.albumCount} 张专辑，${next.trackCount} 首歌曲。`);
      }
      wasScanning.current = Boolean(next.scanning);
    } catch (error) { if (alive.current && version === revision.current && !pending.current) setMessage(error.message); }
  };
  useEffect(() => {
    alive.current = true;
    load();
    // The native scan survives closing/reopening settings or a timed-out HTTP
    // response. Read its status so the UI never claims the scan was cancelled.
    let polling = false;
    const timer = setInterval(async () => { if (polling) return; polling = true; try { await load(); } finally { polling = false; } }, 2000);
    const receive = (event) => {
      const detail = event.detail || {}; revision.current++;
      if (detail.scanning) { pending.current = true; wasScanning.current = true; setBusy(true); setMessage(progress); return; }
      pending.current = false; wasScanning.current = false; setBusy(false);
      if (detail.error) setMessage(detail.error);
      else if (detail.ok) { const next = normalizeLocalLibrary(detail); setSummary(next); setMessage(complete(next)); }
      else if (detail.cancelled) setMessage('');
      load();
    };
    window.addEventListener('album-local-music', receive);
    return () => { alive.current = false; revision.current++; request.current?.abort(); clearInterval(timer); window.removeEventListener('album-local-music', receive); };
  }, []);
  const act = async (path, value) => {
    if (pending.current || busy) return;
    pending.current = true; const version = ++revision.current;
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setMessage(progress);
    try {
      const next = normalizeLocalLibrary(await musicRequest(path, value, controller.signal));
      if (alive.current && version === revision.current) { setSummary(next); setMessage(complete(next)); }
    } catch (error) {
      if (alive.current && version === revision.current) setMessage(`${error.message} 扫描可能仍在后台继续，正在检查状态。`);
    } finally {
      if (version === revision.current) { pending.current = false; request.current = null; if (alive.current) await load(); }
    }
  };
  return <section className="music-local"><h3>本地音乐</h3>
    <p>选择电脑里的音乐文件夹，按标签整理成专辑。音乐留在原位置播放，不会复制或上传。在「添加专辑 › 本地音乐」里把本地专辑放上唱片架。</p>
    {summary?.folders?.length > 0 && <ul className="music-local-folders">{summary.folders.map((folder) => <li key={folder.path} title={folder.path}><FolderOpen size={16}/><span>{folder.name}</span><button type="button" aria-label={`移除文件夹 ${folder.name}`} disabled={busy} onClick={() => act('/local/remove-folder', { path: folder.path })}><Trash2 size={15}/></button></li>)}</ul>}
    <div className="music-local-actions"><button type="button" disabled={busy} onClick={() => { if (pending.current || busy) return; pending.current = true; revision.current++; setBusy(true); setMessage('请选择音乐文件夹…'); desktopCommand('local-music-folder'); }}><FolderOpen size={16}/>添加音乐文件夹</button>{summary?.folders?.length > 0 && <button type="button" disabled={busy} onClick={() => act('/local/rescan', {})}><Loading size={16}/>重新扫描</button>}</div>
    <p role="status" className="music-local-status">{message || (summary ? `${summary.albumCount} 张专辑 · ${summary.trackCount} 首歌曲` : '')}</p>
  </section>;
}
export default function MusicSettings({ close, provider = '', useSource }) {
  const desktop = useDesktopAppearance().client, currentProvider = provider;
  const pending = useRef(false);
  const dialog = useRef(null), [config, setConfig] = useState({}), [url, setURL] = useState(''), [token, setToken] = useState(''), [players, setPlayers] = useState([]), [playerId, setPlayerId] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const sameServer = url.trim().replace(/\/+$/, '') === (config.maURL || '').replace(/\/+$/, '');
  const refresh = async () => { try { const next = await musicRequest('/config'); setConfig(next); setURL(next.maURL || ''); setPlayerId(next.playerId || ''); } catch (error) { setError((previous) => previous || error.message); } };
  useEffect(() => {
    const previous = document.activeElement; dialog.current.showModal(); refresh();
    const receive = (event) => { const detail = event.detail || {}; pending.current = false; setBusy(false); setError(detail.error || (detail.cancelled ? detail.message || '' : '')); if (detail.ok) setNotice('平台登录信息已更新，实际播放权限需播放时确认。'); else if (detail.cancelled && !detail.message) setNotice('登录窗口已关闭，没有更改登录状态。'); refresh(); };
    window.addEventListener('album-music-account', receive);
    return () => { window.removeEventListener('album-music-account', receive); previous?.focus?.({ preventScroll: true }); };
  }, []);
  const connect = async (event) => {
    event.preventDefault(); if (pending.current) return; pending.current = true; setBusy(true); setError(''); setNotice('');
    try { const next = await musicRequest('/config', { maURL: url, ...(token || !sameServer ? { maToken: token } : {}), playerId: sameServer ? playerId : '' }); setConfig(next); setURL(next.maURL || ''); setPlayerId(next.playerId || ''); setToken(''); window.dispatchEvent(new Event('album-music-settings')); const result = await musicRequest('/ma/players'); setPlayers(result.players); setNotice(result.players.length ? '服务器连接成功，请选择播放器并保存。' : '已连接服务器，但没有可用播放器。请先在 Music Assistant 配置播放器。'); }
    catch (error) { setError(error.message); } finally { pending.current = false; setBusy(false); }
  };
  const account = (provider, logout = false) => { if (pending.current) return; if (!desktop) { setError('平台登录需要在心流小屋桌面版中进行：登录窗口由桌面版打开，凭据只加密保存在本机。'); return; } pending.current = true; setBusy(true); setError(''); setNotice(''); desktopCommand(logout ? 'music-logout' : 'music-login', { provider }); };
  return createPortal(<dialog ref={dialog} className="record-dialog music-settings" aria-label="音源与账户" onCancel={(event) => { event.preventDefault(); close(); }}>
    <header><h2><Music2 size={22}/>音源与账户</h2><button type="button" aria-label="关闭音源设置" onClick={close}><X/></button></header>
    <p className="record-dialog-intro">先选一种音乐来源，点「在唱机上用」，再双击专辑放盘。平台登录在官方页面完成，登录信息加密保存在本机，不会上传。{provider && <> 唱机现在用的是 <strong>{providerLabel(provider)}</strong>。</>}</p>
    {[['qq', 'QQ 音乐', config.qqLoggedIn], ['netease', '网易云音乐', config.neteaseLoggedIn]].map(([provider, name, loggedIn]) => <div className="music-account" key={provider}><span><strong>{name}</strong><small>{loggedIn ? '已保存登录信息 · 尚未验证本次播放权限' : '未登录，可尝试平台允许的游客音频'}</small></span><button type="button" disabled={busy || !desktop} title={desktop ? '' : '需要在心流小屋桌面版中登录'} onClick={() => account(provider)}>{loggedIn ? '重新登录' : '登录'}</button>{loggedIn && <button type="button" disabled={busy} onClick={() => account(provider, true)}>退出平台</button>}<UseSource value={provider} provider={currentProvider} useSource={useSource}/></div>)}
    <QualitySetting config={config} onChange={setConfig}/>
    <LocalMusicSettings/>{useSource && <p className="music-source-row"><UseSource value="local" provider={currentProvider} useSource={useSource}/><small>本地音乐 · 扫描的文件夹和这次选的音乐文件</small></p>}
    <details className="music-advanced"><summary>Music Assistant · 连接家里的播放器</summary>{config.maURL && config.playerId && <p className="music-source-row"><UseSource value="ma" provider={currentProvider} useSource={useSource}/><small>已保存服务器与播放器</small></p>}<form onSubmit={connect}><p>通过服务器的已配置播放器发声，不从本机播放。连接成功只验证服务器和播放器列表，不代表已验证歌曲播放权限。此处不自动安装或启动 Music Assistant。</p>
      <label>服务器地址<input type="url" aria-label="Music Assistant 服务器地址" placeholder="http://192.168.1.8:8095" value={url} onChange={(event) => { setURL(event.target.value); setPlayers([]); setPlayerId(''); setToken(''); setNotice(''); }} disabled={busy} required/></label>
      <label>访问令牌<input type="password" aria-label="Music Assistant 访问令牌" value={token} onChange={(event) => setToken(event.target.value)} disabled={busy} placeholder={config.maTokenSet && sameServer ? '令牌已加密保存，留空可沿用' : '从服务器的用户资料中创建访问令牌'} autoComplete="off"/></label>
      <button type="submit" disabled={busy}>{busy ? '正在连接…' : '连接并读取播放器'}</button>
      {(players.length > 0 || playerId) && <><label>服务器播放器<select aria-label="Music Assistant 播放器" value={playerId} onChange={(event) => setPlayerId(event.target.value)} disabled={busy}><option value="">请选择播放器</option>{playerId && !players.some((p) => p.id === playerId) && <option value={playerId}>{playerId}（已保存）</option>}{players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label><button type="button" disabled={busy || !playerId || !sameServer} onClick={async () => { if (pending.current || !sameServer) return; pending.current = true; setBusy(true); setError(''); setNotice(''); try { await musicRequest('/config', { maURL: url, playerId }); window.dispatchEvent(new Event('album-music-settings')); setNotice('播放器已保存；声音从服务器播放器输出，本机音量滑块不控制它。'); } catch (error) { setError(error.message); } finally { pending.current = false; setBusy(false); } }}>保存播放器</button></>}
    </form></details><AppleMusicSetting available={Boolean(config.appleMusicAvailable)} provider={currentProvider} useSource={useSource}/><section className="music-local"><h3>系统正在播放 <UseSource value="system" provider={currentProvider} useSource={useSource}/></h3><p>此模式只显示和控制外部播放器，不会把收藏自动发送到音乐平台。在唱机选择“系统正在播放”，Spotify、网易云音乐、QQ 音乐、Apple Music 等播放器正在放的歌会显示在小屋里，并可暂停和切歌。Windows 读取系统媒体控制；macOS 支持 Music 与 Spotify，首次使用可能请求“自动化”权限。</p></section><p className="music-platform-note">在唱机上选择音源后，双击或拖拽放盘即可播放。音频受版权、地区和会员权限限制；仅有名称时需手动选择版本，不会自动替换收藏中的封面或曲目。</p>
    {error && <p className="record-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}<footer><button type="button" className="record-primary" onClick={close}>完成音源设置</button></footer>
  </dialog>, document.body);
}
