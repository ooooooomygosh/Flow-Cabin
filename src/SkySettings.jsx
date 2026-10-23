import React,{useEffect,useState} from 'react';
import {SKY_CITIES,normalizeCustomPlace,placeDescription} from './sky-cities.mjs';
import {readSkySettings,subscribeSky,writeSkySettings,refreshWeather} from './sky-clock.mjs';
import {weatherRequest} from './weather-client.mjs';
import {readLocation,LOCATION_EVENT} from './location/location-state.mjs';
import {requestLocation} from './location/location-client.mjs';
import {interfaceMode} from './interface-mode.mjs';
const KINDS={clear:'晴',cloudy:'多云',fog:'雾',rain:'雨',snow:'雪',storm:'雷雨'};
const MESSAGES={idle:'使用系统大致位置，不持续追踪。',requesting:'正在获取大致位置…',available:'已保存大致位置，前台使用超过六小时后更新。',denied:'未获得定位权限。你可以在系统设置中允许定位，也可以搜索城市。',timeout:'定位超时，保留上次地点和天气；可以重试或搜索城市。',disabled:'系统定位已关闭，保留上次天气；可以搜索城市。',unavailable:'暂时无法获取位置，保留上次天气；可以搜索城市。'};
export default function SkySettings(){
 const [settings,setSettings]=useState(readSkySettings),[snapshot,setSnapshot]=useState(null),[location,setLocation]=useState(readLocation);
 const [query,setQuery]=useState(''),[results,setResults]=useState([]),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 useEffect(()=>subscribeSky(value=>{setSnapshot(value);setSettings(value.settings);}),[]);
 useEffect(()=>{const update=()=>setLocation(readLocation());window.addEventListener(LOCATION_EVENT,update);return()=>window.removeEventListener(LOCATION_EVENT,update);},[]);
 const change=patch=>setSettings(writeSkySettings(patch));
 const choose=value=>{const place=normalizeCustomPlace(value);if(!place)return;change({place:'custom',customPlace:place,realWeather:true,locationSource:'manual'});setResults([]);setNotice(`天气已切换到${place.name}。`);};
 const locate=async()=>{setNotice('');try{await requestLocation();}catch{setNotice('地点未能保存，请检查本机存储空间。');}};
 const search=async e=>{e.preventDefault();setBusy(true);setNotice('');try{const value=await weatherRequest('/search?name='+encodeURIComponent(query));setResults(value.results||[]);if(!value.results?.length)setNotice('没有找到这个地点，可以试试城市名或英文名称。');}catch(error){setNotice(error.message);}finally{setBusy(false);}};
 const weather=snapshot?.real,city=snapshot?.city;
 return <section className="home-weather-settings" aria-label="位置与天气">
   {interfaceMode() === 'classic' && <h3>窗外</h3>}
   <div className="home-weather-current"><small>{settings.realWeather&&city?placeDescription(city):'窗外'}</small><strong>{Number.isFinite(weather?.temperature)?`${Math.round(weather.temperature)}°`:'—'}</strong><span>{weather?KINDS[weather.kind]||'天气':'还没有实时天气'}</span>{weather&&<small>更新于 {new Date(weather.fetchedAt).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}</small>}</div>
   <button type="button" className="home-primary" disabled={location.status==='requesting'} onClick={locate}>{location.status==='requesting'?'定位中…':location.fix?'更新当前位置':'使用当前位置'}</button>
   <p role="status">{MESSAGES[location.status]}</p>
   <form onSubmit={search}><label htmlFor="weather-city-search">或搜索城市</label><div><input id="weather-city-search" aria-label="查询地点名称" value={query} onChange={e=>setQuery(e.target.value)} placeholder="城市 / 地区"/><button type="submit" disabled={busy||query.trim().length<2}>{busy?'查询中…':'查找'}</button></div></form>
   {results.length>0&&<ul className="home-city-results">{results.map((entry,i)=><li key={i}><span>{placeDescription(entry)}</span><button type="button" onClick={()=>choose(entry)}>采用地点</button></li>)}</ul>}
   {notice&&<p role="status">{notice}</p>}
   <details><summary>城市与窗景选项</summary><label>选择地区<select aria-label="天色跟随的城市" value={settings.place} onChange={e=>{const place=e.target.value;change({place,locationSource:'manual',realWeather:!['clock','auto'].includes(place)});}}><option value="clock">固定作息与装饰窗景</option><option value="auto">仅参考系统时区的天色</option>{settings.customPlace&&<option value="custom">{settings.customPlace.name}</option>}{SKY_CITIES.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label><input type="checkbox" aria-label="跟随真实天气" disabled={['auto','clock'].includes(settings.place)} checked={settings.realWeather} onChange={e=>change({realWeather:e.target.checked})}/>跟随真实天气</label></details>
   {settings.realWeather&&<button type="button" onClick={()=>{refreshWeather();setNotice('已请求刷新天气。');}}>刷新天气</button>}
   <WeatherProvider onChanged={()=>refreshWeather()}/>
   <p className="home-weather-credit">只向天气服务发送取整的大致坐标，天气约每 30 分钟更新。{weather?.source==='qweather'?<a href="https://developer.qweather.com/attribution.html" target="_blank" rel="noreferrer">和风天气 · 数据来源与归因</a>:<><a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> · CC BY 4.0</>}</p>
 </section>;
}

function WeatherProvider({onChanged}) {
 const [profile,setProfile]=useState(null),[provider,setProvider]=useState('open-meteo'),[host,setHost]=useState(''),[key,setKey]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{let alive=true;weatherRequest('/provider').then(value=>{if(alive){setProfile(value);setProvider(value.provider);setHost(value.host);}}).catch(()=>{});return()=>{alive=false;};},[]);
 if(!profile)return null;
 const save=async e=>{e.preventDefault();setBusy(true);setNotice('');try{const value=await weatherRequest('/provider',{provider,host,key});setKey('');setProfile(value);setNotice(value.stored&&!value.secure?'已启用；系统加密不可用，凭据仅保留到本次退出。':'天气来源已保存。');onChanged();}catch(error){setNotice(error.message);}finally{setBusy(false);}};
 return <details><summary>天气来源</summary><form onSubmit={save}><label>服务<select value={provider} onChange={e=>setProvider(e.target.value)}><option value="open-meteo">Open-Meteo（默认）</option><option value="qweather">和风天气（自带 API KEY）</option></select></label>{provider==='qweather'&&<><label>API Host<input value={host} onChange={e=>setHost(e.target.value)} placeholder="控制台分配的 qweatherapi.com 域名" autoCapitalize="none" autoCorrect="off"/></label><label>API KEY<input type="password" value={key} onChange={e=>setKey(e.target.value)} placeholder={profile.stored?'已保存；留空继续使用':'仅保存到本机'} autoComplete="new-password"/></label></>}<button type="submit" disabled={busy}>{busy?'保存中…':'保存天气来源'}</button>{notice&&<p role="status">{notice}</p>}</form></details>;
}
