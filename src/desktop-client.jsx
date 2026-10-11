import { useEffect, useState } from 'react';
import { Settings, Minus, Maximize, X } from './icons';

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
  const read = () => document.documentElement.dataset.desktopFullscreen === 'true';
  const [fullscreen, setFullscreen] = useState(read);
  useEffect(() => {
    const update = () => setFullscreen(read());
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-desktop-fullscreen'] });
    window.addEventListener('album-desktop-fullscreen', update);
    update();
    return () => { observer.disconnect(); window.removeEventListener('album-desktop-fullscreen', update); };
  }, []);
  return fullscreen;
}
export function DesktopControls({ fallback = false }) {
  const appearance = useDesktopAppearance(), fullscreen = useDesktopFullscreen();
  if (!appearance.client) return null;
  return <div className={`desktop-controls ${fallback ? 'desktop-fallback' : ''}`} aria-label="软件与窗口控制">
    <button type="button" aria-label="软件设置" title="设置 · Ctrl+," onClick={() => desktopCommand('settings')}><Settings size={20}/></button>
    <span className="window-control-divider"/>
    <button type="button" aria-label={fullscreen ? "退出全屏模式" : "进入全屏模式"} aria-pressed={fullscreen} title="交互全屏 · F11" onClick={() => desktopCommand('fullscreen')}><Maximize size={18}/></button>
    <button type="button" aria-label="最小化窗口" title="最小化" onClick={() => desktopCommand('minimize')}><Minus size={18}/></button>
    <button type="button" aria-label="最大化或还原窗口" title="最大化 / 还原" onClick={() => desktopCommand('maximize')}><Maximize size={16}/></button>
    <button type="button" className="window-close" aria-label="关闭窗口" title="关闭" onClick={() => desktopCommand('close')}><X size={20}/></button>
  </div>;
}
