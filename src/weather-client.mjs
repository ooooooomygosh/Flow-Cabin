import { webWeatherRequest } from './weather-web.mjs';
export async function weatherRequest(path, value) {
  if (globalThis.window?.albumMobile?.weatherRequest) return window.albumMobile.weatherRequest(path, value);
  if (!globalThis.window?.albumDesktopAppearance?.client && globalThis.document?.documentElement?.dataset.desktopClient !== 'true') return webWeatherRequest(path,value);
  const response = await fetch('/desktop-weather' + path, { credentials: 'omit', method: value === undefined ? 'GET' : 'POST', ...(value === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }) });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || '天气服务暂不可用'); return result;
}
