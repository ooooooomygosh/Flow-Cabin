import React, { useEffect, useState } from 'react';
import { SKY_CITIES, cityForZone, systemZone, normalizeCustomPlace, placeDescription } from './sky-cities.mjs';
import { desktopShell, readSkySettings, subscribeSky, writeSkySettings } from './sky-clock.mjs';
import { weatherRequest } from './weather-client.mjs';
import { effectiveWeather } from './sky-weather.mjs';

// 窗外的天色 (房间 tab): where the sun is taken from, and — desktop only, off by default — 跟随真实天气.
const BUCKETS = { morning: '清晨', day: '白天', dusk: '黄昏', night: '夜里' };
const KINDS = { clear: '晴', cloudy: '多云', fog: '起雾', rain: '下雨', snow: '下雪', storm: '雷雨', starry: '星空' };
const clockText = (ms) => new Date(ms).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });

export default function SkySettings() {
  const [settings, setSettings] = useState(readSkySettings), [snapshot, setSnapshot] = useState(null);
  const [query, setQuery] = useState(''), [results, setResults] = useState([]), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const [custom, setCustom] = useState(() => readSkySettings().customPlace || { name: '', lat: '', lng: '', zone: systemZone() || 'UTC' });
  const choose = value => { const normalized = normalizeCustomPlace(value); if (!normalized) { setNotice('请填写地点名称、有效经纬度和 IANA 时区（例如 Asia/Shanghai）。'); return; } setCustom(normalized); change({ place: 'custom', customPlace: normalized }); setResults([]); setNotice('地点已保存，日出日落与天气都会跟随这里。'); };
  const search = async () => { setBusy(true); setNotice(''); try { const result = await weatherRequest('/search?name=' + encodeURIComponent(query)); setResults(result.results || []); if (!result.results?.length) setNotice('没有找到，请尝试英文名或添加国家、省份，也可以手动填写坐标。'); } catch (e) { setNotice(e.message); } finally { setBusy(false); } };
  useEffect(() => subscribeSky((value) => { setSnapshot(value); setSettings(value.settings); }), []);
  const desktop = desktopShell(), auto = cityForZone(systemZone()), city = snapshot?.city;
  const change = (patch) => setSettings(writeSkySettings(patch));
  const real = snapshot?.real ? effectiveWeather(null, snapshot.real) : null;
  const sky = snapshot ? `${city ? city.name : '固定作息'} · ${BUCKETS[snapshot.state.bucket] || ''}` : '';
  const weatherHint = !settings.realWeather ? '关着时窗外是你装上的窗景；打开后按所选城市的实时天气下雨、下雪或起雾，每 30 分钟更新一次。之后再手动换窗景，会自动关掉这里。'
    : !city ? '固定作息没有地点，先选一座城市。'
    : real?.source === 'real' ? `${placeDescription(city)}现在${KINDS[real.kind] || '晴'}${Number.isFinite(snapshot.real.temperature) ? `，${snapshot.real.temperature}°C` : ''}${Number.isFinite(snapshot.real.feelsLike) ? `，体感 ${snapshot.real.feelsLike}°C` : ''}${Number.isFinite(snapshot.real.humidity) ? `，湿度 ${snapshot.real.humidity}%` : ''}（${clockText(snapshot.real.fetchedAt)} 更新）。`
    : '正在问天气…连不上时窗外照旧是你装上的窗景。';
  return <section aria-labelledby="sky-settings-title"><div className="personalization-heading"><h3 id="sky-settings-title">窗外</h3><span>天色每分钟都在变</span></div><div className="hub-rows">
    <div className="hub-row"><span><strong>天色跟着哪座城市</strong><small>{`日出日落跟着这座城市走，季节不同，天亮的时间也不同。${sky ? `现在：${sky}。` : ''}`}</small></span>
      <span className="hub-row-actions"><select aria-label="天色跟随的城市" value={settings.place} onChange={(event) => change({ place: event.target.value })}>
        <option value="auto">{`跟随时区${auto ? `（${auto.name}）` : '（固定作息）'}`}</option>
        <option value="custom">{settings.customPlace ? `自定地点（${settings.customPlace.name}）` : '自定地点'}</option>
        <option value="clock">固定作息（6:30 日出）</option>
        {SKY_CITIES.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
      </select></span>
    </div>
    <div className="hub-row"><span><strong>查找自己的城市</strong><small>输入城市名，查询结果会列出国家和行政区；也可以手动填经纬度。查询时只发送输入的地名。</small></span><span className="hub-row-actions"><input aria-label="查询地点名称" value={query} onChange={e => setQuery(e.target.value)} placeholder="城市 / 地区"/><button type="button" disabled={busy || query.trim().length < 2} onClick={search}>{busy ? '查询中…' : '查找'}</button></span></div>
    {results.map((entry, index) => <div className="hub-row" key={`${entry.name}:${entry.lat}:${index}`}><span><strong>{placeDescription(entry)}</strong><small>{entry.lat}, {entry.lng} · {entry.zone}</small></span><button type="button" onClick={() => choose(entry)}>采用地点</button></div>)}
    <details className="hub-row"><summary>手动填写地点坐标与时区</summary><div style={{ display: 'grid', gap: 8, paddingBlock: 12 }}>{[['name', '地点名称'], ['lat', '纬度 −90 至 90'], ['lng', '经度 −180 至 180'], ['zone', 'IANA 时区']].map(([key, label]) => <label key={key}>{label}<input aria-label={label} value={custom[key] ?? ''} inputMode={key === 'lat' || key === 'lng' ? 'decimal' : 'text'} onChange={e => setCustom({ name: custom.name, lat: custom.lat, lng: custom.lng, zone: custom.zone, [key]: e.target.value })}/></label>)}<button type="button" onClick={() => choose(custom)}>保存并跟随此地点</button></div></details>
    {notice && <p role="status">{notice}</p>}
    {desktop && <div className="hub-row"><span><strong>跟随真实天气</strong><small>{weatherHint}只发送城市的大致坐标。天气数据：<a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo.com</a>（CC BY 4.0）</small></span>
      <span className="hub-row-actions"><label className="hub-toggle"><input type="checkbox" aria-label="跟随真实天气" checked={settings.realWeather} onChange={(event) => change({ realWeather: event.target.checked })}/><span>{settings.realWeather ? '开' : '关'}</span></label></span>
    </div>}
  </div></section>;
}
