import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './fonts.css';
import './cabin-room.css';
import './room-immersive.css';
import './record-library.css';
import './album-wall.css';
import './app.css';
import './styles/pixel-ui.css';
import './styles/perf-low.css';
import { frameClock } from './frame-clock.mjs';
import { installZenConsoleReveal } from './scene/zen-console.mjs';
import { syncPerformance, applyPerformance, startPerformanceProbe } from './perf-profile.mjs';
import { initializeMobile } from './mobile/platform.mjs';
import { installEscapeBack } from './ui/back-stack.mjs';
import './mobile/mobile.css';

async function start() {
  await initializeMobile();
  syncPerformance();
  applyPerformance();
  startPerformanceProbe();
  frameClock();
  installZenConsoleReveal();
  installEscapeBack();
  const { default: App } = await import('./App');
  createRoot(document.getElementById('root')).render(<App/>);
}
start().catch(() => {
  const root = document.getElementById('root'); root.textContent = '';
  const message = document.createElement('p'); message.textContent = '无法读取本机小屋数据。原有数据没有被覆盖，请重新打开；请勿卸载或清除应用数据。';
  const retry = document.createElement('button'); retry.textContent = '重新读取'; retry.onclick = () => location.reload();
  root.append(message, retry);
});
