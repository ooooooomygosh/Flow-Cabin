import React, { useEffect, useState } from 'react';
import { SKY_CITIES, cityForZone, systemZone } from './sky-cities.mjs';
import { desktopShell, readSkySettings, subscribeSky, writeSkySettings } from './sky-clock.mjs';
import { effectiveWeather } from './sky-weather.mjs';

// 窗外的天色 (房间 tab): where the sun is taken from, and — desktop only, off by default — 跟随真实天气.
const BUCKETS = { morning: '清晨', day: '白天', dusk: '黄昏', night: '夜里' };
const KINDS = { clear: '晴', cloudy: '多云', fog: '起雾', rain: '下雨', snow: '下雪', storm: '雷雨', starry: '星空' };
const clockText = (ms) => new Date(ms).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });

export default function SkySettings() {
  const [settings, setSettings] = useState(readSkySettings), [snapshot, setSnapshot] = useState(null);
  useEffect(() => subscribeSky((value) => { setSnapshot(value); setSettings(value.settings); }), []);
  const desktop = desktopShell(), auto = cityForZone(systemZone()), city = snapshot?.city;
  const change = (patch) => setSettings(writeSkySettings(patch));
  const real = snapshot?.real ? effectiveWeather(null, snapshot.real) : null;
  const sky = snapshot ? `${city ? city.name : '固定作息'} · ${BUCKETS[snapshot.state.bucket] || ''}` : '';
  const weatherHint = !settings.realWeather ? '关着时窗外是你装上的窗景；打开后按所选城市的实时天气下雨、下雪或起雾，每 30 分钟更新一次。之后再手动换窗景，会自动关掉这里。'
    : !city ? '固定作息没有地点，先选一座城市。'
    : real?.source === 'real' ? `${city.name}现在${KINDS[real.kind] || '晴'}（${clockText(snapshot.real.fetchedAt)} 更新）。`
    : '正在问天气…连不上时窗外照旧是你装上的窗景。';
  return <section aria-labelledby="sky-settings-title"><div className="personalization-heading"><h3 id="sky-settings-title">窗外</h3><span>天色每分钟都在变</span></div><div className="hub-rows">
    <div className="hub-row"><span><strong>天色跟着哪座城市</strong><small>{`日出日落跟着这座城市走，季节不同，天亮的时间也不同。${sky ? `现在：${sky}。` : ''}`}</small></span>
      <span className="hub-row-actions"><select aria-label="天色跟随的城市" value={settings.place} onChange={(event) => change({ place: event.target.value })}>
        <option value="auto">{`跟随时区${auto ? `（${auto.name}）` : '（固定作息）'}`}</option>
        <option value="clock">固定作息（6:30 日出）</option>
        {SKY_CITIES.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
      </select></span>
    </div>
    {desktop && <div className="hub-row"><span><strong>跟随真实天气</strong><small>{weatherHint}只发送城市的大致坐标。天气数据：<a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo.com</a>（CC BY 4.0）</small></span>
      <span className="hub-row-actions"><label className="hub-toggle"><input type="checkbox" aria-label="跟随真实天气" checked={settings.realWeather} onChange={(event) => change({ realWeather: event.target.checked })}/><span>{settings.realWeather ? '开' : '关'}</span></label></span>
    </div>}
  </div></section>;
}
