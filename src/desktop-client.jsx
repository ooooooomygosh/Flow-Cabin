import { useEffect, useState } from 'react';
import { Settings, Minus, Expand, Contract, X } from './icons';
import { readCabinFullscreen, requestCabinFullscreen } from './desktop/fullscreen-client.mjs';

export function desktopCommand(command, params = {}) {
  const url = new URL(`album-desktop://action/${command}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  // A denied new-window request carries a fixed command without navigating
  // or reloading the business page. No native IPC is exposed to that page.
  window.open(url.href, '_blank');
}
export function useDesktopAppearance() {
  const read = () => ({ ...(window.albumDesktopAppearance || {}), reduceMotion: document.documentElement.dataset.desktopReduceMotion === 'true', client: document.documentElement.dataset.desktopClient === 'true' });
  const [appearance, setAppearance] = useState(read);
  useEffect(() => {
    const update = () => setAppearance(read());
    window.addEventListener('album-desktop-settings', update);
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-desktop-reduce-motion', 'data-desktop-client'] });
    update();
    return () => { observer.disconnect(); window.removeEventListener('album-desktop-settings', update); };
  }, []);
  return appearance;
}
export function useDesktopFullscreen() {
  const read = () => readCabinFullscreen();
  const [fullscreen, setFullscreen] = useState(read);
  useEffect(() => {
    const update = () => setFullscreen(read());
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-desktop-fullscreen', 'data-desktop-client'] });
    window.addEventListener('album-desktop-fullscreen', update); document.addEventListener('fullscreenchange', update);
    update();
    return () => { observer.disconnect(); window.removeEventListener('album-desktop-fullscreen', update); document.removeEventListener('fullscreenchange', update); };
  }, []);
  return fullscreen;
}
export function DesktopControls({ fallback = false, onSettings, onError }) {
  const appearance = useDesktopAppearance(), fullscreen = useDesktopFullscreen();
  const toggle = () => requestCabinFullscreen().catch(() => onError?.('无法切换全屏，请检查浏览器是否允许全屏后重试。'));
  return <div className={`desktop-controls ${fallback ? 'desktop-fallback' : ''}`} aria-label="软件与窗口控制">
    <button type="button" aria-label="设置" title="设置：音源、房间、专注、显示与字体、备份" onClick={onSettings}><Settings size={20}/></button>
    <span className="window-control-divider"/>
    <button type="button" aria-label={fullscreen ? "退出全屏模式" : "进入全屏模式"} aria-pressed={fullscreen} title={appearance.client ? '交互全屏 · F11' : fullscreen ? '退出全屏' : '进入全屏'} onClick={toggle}>{fullscreen ? <Contract size={18}/> : <Expand size={18}/>}</button>
    {appearance.client && <>
      <button type="button" aria-label="最小化窗口" title="最小化" onClick={() => desktopCommand('minimize')}><Minus size={18}/></button>
      <button type="button" className="window-close" aria-label="关闭窗口" title="关闭" onClick={() => desktopCommand('close')}><X size={20}/></button>
    </>}
  </div>;
}
