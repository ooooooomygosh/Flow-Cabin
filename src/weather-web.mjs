const TTL=30*60000, CACHE='flow-cabin-weather-cache-v1';let active=null;
export function webWeatherReport(report,place,now=Date.now()){
 const c=report?.current,code=c?.weather_code;if(!Number.isFinite(code))throw Error('天气数据暂不可用。');
 const kind=code>=95?'storm':[71,73,75,77,85,86].includes(code)?'snow':code>=51?'rain':[45,48].includes(code)?'fog':code===3 || (code>0&&c.cloud_cover>=45)?'cloudy':'clear';
 return {kind,intensity:['clear'].includes(kind)?0:.6,wind:Math.min(1,Math.max(0,(c.wind_speed_10m||0)/50)),temperature:c.temperature_2m,feelsLike:c.apparent_temperature,humidity:c.relative_humidity_2m,fetchedAt:now,source:'open-meteo',lat:place.lat,lng:place.lng};
}
const get=async url=>{const response=await fetch(url,{credentials:'omit',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('天气服务暂时无法连接，保留上次天气。');return response.json();};
export async function webWeatherRequest(path,value){
 if(path.startsWith('/search?')){const name=new URLSearchParams(path.split('?')[1]).get('name');if(!name||name.length<2||name.length>80)throw Error('请输入 2 至 80 字的城市名。');const data=await get(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=10&language=zh&format=json`);return {results:(data.results||[]).map(p=>({name:p.name,lat:p.latitude,lng:p.longitude,zone:p.timezone,country:p.country,admin1:p.admin1,admin2:p.admin2}))};}
 if(path==='/status')return {report:active};
 if(path!=='/set')throw Error('不支持的天气操作。');
 if(!value?.enabled){active=null;return {report:null};}
 const lat=Math.round(Number(value.lat)*100)/100,lng=Math.round(Number(value.lng)*100)/100;
 if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)throw Error('请选择有效地区。');
 let saved;try{saved=JSON.parse(localStorage.getItem(CACHE)||'null');}catch{}
 const matches=saved?.lat===lat&&saved?.lng===lng;
 if(matches&&Date.now()-saved.fetchedAt<TTL&&!value.force){active=saved;return {report:active};}
 try{const data=await get(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=weather_code,wind_speed_10m,cloud_cover,temperature_2m,apparent_temperature,relative_humidity_2m&timezone=auto`);active=webWeatherReport(data,{lat,lng});try{localStorage.setItem(CACHE,JSON.stringify(active));}catch{}return {report:active};}catch(error){if(matches){active=saved;return {report:active,error:error.message};}throw error;}
}
