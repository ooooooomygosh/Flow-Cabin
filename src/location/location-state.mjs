export const LOCATION_KEY='flow-cabin-location-v1', LOCATION_EVENT='cabin:location';
export const LOCATION_TTL=6*60*60*1000;
const STATUSES=['idle','requesting','available','denied','timeout','disabled','unavailable'];
export function normalizeLocation(value){
 const status=STATUSES.includes(value?.status)?value.status:'idle', fix=value?.fix;
 const lat=fix?.lat,lng=fix?.lng;
 let zone;try{if(fix?.zone && new Intl.DateTimeFormat('en',{timeZone:fix.zone}))zone=fix.zone;}catch{}
 const usable=Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180&&Number.isFinite(fix?.at)&&fix.at>0;
 return {status,automatic:value?.automatic===true,attemptedAt:Number.isFinite(value?.attemptedAt)?value.attemptedAt:0,fix:usable?{lat:Math.round(lat*100)/100,lng:Math.round(lng*100)/100,name:typeof fix.name==='string'&&fix.name.trim()?fix.name.slice(0,80):'附近',zone:zone||Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC',at:fix.at}:null};
}
export function readLocation(storage=globalThis.localStorage,now=Date.now()){try{const state=normalizeLocation(JSON.parse(storage.getItem(LOCATION_KEY)||'{}'));return state.status==='requesting'&&now-state.attemptedAt>30000?{...state,status:'timeout'}:state;}catch{return normalizeLocation(null);}}
export function writeLocation(value,storage=globalThis.localStorage){const next=normalizeLocation(value);storage.setItem(LOCATION_KEY,JSON.stringify(next));globalThis.dispatchEvent?.(new Event(LOCATION_EVENT));return next;}
export const shouldRefreshLocation=(state,now=Date.now())=>state.automatic&&state.status==='available'&&state.fix&&now-state.fix.at>=LOCATION_TTL&&now-state.attemptedAt>=LOCATION_TTL;
