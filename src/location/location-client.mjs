import {readLocation,writeLocation,shouldRefreshLocation} from './location-state.mjs';
import {weatherRequest} from '../weather-client.mjs';
import {readSkySettings,writeSkySettings} from '../sky-clock.mjs';
let inflight;
export async function requestLocation(){
 if(inflight)return inflight;
 inflight=(async()=>{
  const old=readLocation(), attemptedAt=Date.now();writeLocation({...old,status:'requesting',attemptedAt});
  let result;
  try{
   if(window.albumMobile?.approximateLocation)result=await window.albumMobile.approximateLocation();
   else if(document.documentElement.dataset.desktopClient==='true'||window.albumDesktopAppearance?.client)result=await weatherRequest('/location',{});
   else result=await new Promise(resolve=>{if(!navigator.geolocation)return resolve({status:'unavailable'});navigator.geolocation.getCurrentPosition(p=>resolve({status:'available',lat:p.coords.latitude,lng:p.coords.longitude,name:'附近',zone:Intl.DateTimeFormat().resolvedOptions().timeZone,at:Date.now()}),e=>resolve({status:e.code===1?'denied':e.code===3?'timeout':'unavailable'}),{enableHighAccuracy:false,timeout:18000,maximumAge:300000});});
  }catch{result={status:'unavailable'};}
  const next=writeLocation({...old,status:result.status,attemptedAt,automatic:result.status==='available'||old.automatic,fix:result.status==='available'?result:old.fix});
  if(next.status==='available'&&next.fix)writeSkySettings({place:'custom',customPlace:next.fix,realWeather:true,locationSource:'system'});
  return next;
 })().finally(()=>{inflight=null;});return inflight;
}
export function watchLocationRefresh(){
 const refresh=()=>{if(!document.hidden&&readSkySettings().locationSource==='system'&&shouldRefreshLocation(readLocation()))requestLocation().catch(()=>{});};
 document.addEventListener('visibilitychange',refresh);window.addEventListener('focus',refresh);const timer=setInterval(refresh,15*60000);refresh();
 return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',refresh);window.removeEventListener('focus',refresh);};
}
