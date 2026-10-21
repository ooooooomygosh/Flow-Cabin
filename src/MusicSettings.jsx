import React, { useEffect, useRef, useState } from 'react';
import { FolderOpen, Trash2, Refresh } from './icons';
import { desktopCommand, useDesktopAppearance } from './desktop-client';
import { musicRequest, normalizeLocalLibrary } from './room-playback.mjs';
import { requestPermission } from './player/sources.mjs';
import './player/player.css';

// Settings › 音源 › 账户与文件夹: platform logins, local folders, Music Assistant
// and the Apple Music permission. Which source the deck uses is chosen one page
// up (the 唱机音源 list); 音质 lives there too.

// 系统 Apple Music (macOS): plays songs from your library in the “音乐” App.
function AppleMusicSetting({ available }) {
  const [state, setState] = useState(null), [busy, setBusy] = useState(false);
  if (!available) return null;
  const check = async () => { setBusy(true); setState(await requestPermission('appleMusic')); setBusy(false); };
  return <section className="music-local music-apple"><h3>Apple Music（音乐 App）</h3>
    <p>在 Mac 的“音乐”App 里播放同一首歌，小屋显示进度、可暂停和切歌；声音来自“音乐”App。</p>
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
    <p>选择电脑里的音乐文件夹，按标签整理成专辑。音乐留在原位置播放，不会复制或上传；在「添加到唱片架 › 本地音乐」里把专辑放上唱片架。</p>
    {summary?.folders?.length > 0 && <ul className="music-local-folders">{summary.folders.map((folder) => <li key={folder.path} title={folder.path}><FolderOpen size={16}/><span>{folder.name}</span><button type="button" aria-label={`移除文件夹 ${folder.name}`} disabled={busy} onClick={() => act('/local/remove-folder', { path: folder.path })}><Trash2 size={15}/></button></li>)}</ul>}
    <div className="music-local-actions"><button type="button" disabled={busy} onClick={() => { if (pending.current || busy) return; pending.current = true; revision.current++; setBusy(true); setMessage('请选择音乐文件夹…'); desktopCommand('local-music-folder'); }}><FolderOpen size={16}/>添加音乐文件夹</button>{summary?.folders?.length > 0 && <button type="button" disabled={busy} onClick={() => act('/local/rescan', {})}><Refresh size={16}/>重新扫描</button>}</div>
    <p role="status" className="music-local-status">{message || (summary ? `${summary.albumCount} 张专辑 · ${summary.trackCount} 首歌曲` : '')}</p>
  </section>;
}
export default function MusicAccounts() {
  const desktop = useDesktopAppearance().client || Boolean(globalThis.albumMobile);
  const pending = useRef(false);
  const [config, setConfig] = useState({}), [url, setURL] = useState(''), [token, setToken] = useState(''), [players, setPlayers] = useState([]), [playerId, setPlayerId] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const sameServer = url.trim().replace(/\/+$/, '') === (config.maURL || '').replace(/\/+$/, '');
  const refresh = async () => { try { const next = await musicRequest('/config'); setConfig(next); setURL(next.maURL || ''); setPlayerId(next.playerId || ''); } catch (error) { setError((previous) => previous || error.message); } };
  useEffect(() => {
    refresh();
    const receive = (event) => { const detail = event.detail || {}; pending.current = false; setBusy(false); setError(detail.error || (detail.cancelled ? detail.message || '' : '')); if (detail.ok) setNotice('平台登录信息已更新，实际播放权限需播放时确认。'); else if (detail.cancelled && !detail.message) setNotice('登录窗口已关闭，没有更改登录状态。'); refresh(); };
    window.addEventListener('album-music-account', receive);
    return () => window.removeEventListener('album-music-account', receive);
  }, []);
  const connect = async (event) => {
    event.preventDefault(); if (pending.current) return; pending.current = true; setBusy(true); setError(''); setNotice('');
    try { const next = await musicRequest('/config', { maURL: url, ...(token || !sameServer ? { maToken: token } : {}), playerId: sameServer ? playerId : '' }); setConfig(next); setURL(next.maURL || ''); setPlayerId(next.playerId || ''); setToken(''); window.dispatchEvent(new Event('album-music-settings')); const result = await musicRequest('/ma/players'); setPlayers(result.players); setNotice(result.players.length ? '服务器连接成功，请选择播放器并保存。' : '已连接服务器，但没有可用播放器。请先在 Music Assistant 配置播放器。'); }
    catch (error) { setError(error.message); } finally { pending.current = false; setBusy(false); }
  };
  const account = (provider, logout = false) => { if (pending.current) return; if (!desktop) { setError('平台登录需要在心流小屋桌面版中进行：登录窗口由桌面版打开，凭据只加密保存在本机。'); return; } pending.current = true; setBusy(true); setError(''); setNotice(''); desktopCommand(logout ? 'music-logout' : 'music-login', { provider }); };
  return <div className="music-accounts">
    <p className="music-accounts-intro">平台登录在官方页面完成，登录信息加密保存在本机，不会上传。</p>
    {[['qq', 'QQ 音乐', config.qqLoggedIn], ['netease', '网易云音乐', config.neteaseLoggedIn]].map(([provider, name, loggedIn]) => <div className="music-account" key={provider}><span><strong>{name}</strong><small>{loggedIn ? '已保存登录信息 · 尚未验证本次播放权限' : '未登录，可尝试平台允许的游客音频'}</small></span><button type="button" disabled={busy || !desktop} title={desktop ? '' : '需要在心流小屋桌面版中登录'} onClick={() => account(provider)}>{loggedIn ? '重新登录' : '登录'}</button>{loggedIn && <button type="button" disabled={busy} onClick={() => account(provider, true)}>退出平台</button>}</div>)}
    {!globalThis.albumMobile && <LocalMusicSettings/>}
    <details className="music-advanced"><summary>Music Assistant · 连接家里的播放器</summary>{config.maURL && config.playerId && <p className="music-accounts-saved">已保存服务器与播放器</p>}<form onSubmit={connect}><p>声音从服务器上配置好的播放器发出，不从本机播放。连接只检查服务器和播放器列表。</p>
      <label>服务器地址<input type="url" aria-label="Music Assistant 服务器地址" placeholder="http://192.168.1.8:8095" value={url} onChange={(event) => { setURL(event.target.value); setPlayers([]); setPlayerId(''); setToken(''); setNotice(''); }} disabled={busy} required/></label>
      <label>访问令牌<input type="password" aria-label="Music Assistant 访问令牌" value={token} onChange={(event) => setToken(event.target.value)} disabled={busy} placeholder={config.maTokenSet && sameServer ? '令牌已加密保存，留空可沿用' : '从服务器的用户资料中创建访问令牌'} autoComplete="off"/></label>
      <button type="submit" disabled={busy}>{busy ? '正在连接…' : '连接并读取播放器'}</button>
      {(players.length > 0 || playerId) && <><label>服务器播放器<select aria-label="Music Assistant 播放器" value={playerId} onChange={(event) => setPlayerId(event.target.value)} disabled={busy}><option value="">请选择播放器</option>{playerId && !players.some((p) => p.id === playerId) && <option value={playerId}>{playerId}（已保存）</option>}{players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label><button type="button" disabled={busy || !playerId || !sameServer} onClick={async () => { if (pending.current || !sameServer) return; pending.current = true; setBusy(true); setError(''); setNotice(''); try { await musicRequest('/config', { maURL: url, playerId }); window.dispatchEvent(new Event('album-music-settings')); setNotice('播放器已保存；声音从服务器播放器输出，本机音量滑块不控制它。'); } catch (error) { setError(error.message); } finally { pending.current = false; setBusy(false); } }}>保存播放器</button></>}
    </form></details>
    <AppleMusicSetting available={Boolean(config.appleMusicAvailable)}/>
    <details className="music-advanced"><summary>系统正在播放 · 跟随其他播放器</summary><p>在唱机音源里选「系统正在播放」，Spotify、网易云音乐、QQ 音乐、Apple Music 等正在放的歌会显示在小屋里，可暂停和切歌；不会把收藏发送到音乐平台。Windows 读取系统媒体控制；macOS 支持 Music 与 Spotify，第一次使用可能请求“自动化”权限。</p></details>
    <p className="music-platform-note">音频受版权、地区和会员权限限制；只有名称时需手动选择版本，不会替换收藏里的封面或曲目。</p>
    {error && <p className="record-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
  </div>;
}
