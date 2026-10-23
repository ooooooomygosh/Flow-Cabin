import {THEMES,LAYOUT_PREFIX,LEGACY_LAYOUT_PREFIX,validateLayout,migrateLayout} from '../home/spatial-layout.mjs';
import {normalizeLife,LIFE_KEY} from '../home/life-state.mjs';
import {normalizeSkySettings,SKY_SETTINGS_KEY} from '../sky-clock.mjs';
import {normalizeLocation,LOCATION_KEY} from '../location/location-state.mjs';
import {PACK_SELECTION} from '../pet/imported-pack.mjs';
import {cleanPetPack} from '../pet/pack-metadata.mjs';
import {RECIPES_KEY,LIGHTS_KEY,normalizeRecipes,normalizeLights} from '../home/recipes.mjs';
const own=(o,k)=>Object.hasOwn(o,k), plain=v=>v&&typeof v==='object'&&!Array.isArray(v);
export function normalizeRoomData(value){
 if(value==null)return null;
 if(!plain(value)||value.version!==1)throw Error('小屋空间备份格式无效。');
 const next={version:1,layouts:{},legacyLayouts:{}};
 for(const field of ['layouts','legacyLayouts'])if(own(value,field)){
   if(!plain(value[field])||Object.keys(value[field]).length>8)throw Error('布局备份格式无效。');
   for(const [theme,layout] of Object.entries(value[field])){if(!THEMES.some(t=>t.id===theme)||layout?.theme!==theme)throw Error('布局主题不匹配。');if(field==='layouts')next.layouts[theme]=validateLayout(layout);else {migrateLayout(layout);next.legacyLayouts[theme]=structuredClone(layout);}}
 }
 for(const [field,normalize] of Object.entries({life:normalizeLife,sky:normalizeSkySettings,location:normalizeLocation,recipes:normalizeRecipes,lights:normalizeLights}))if(own(value,field))next[field]=normalize(value[field]);
 if(own(value,'petPack')){next.petPack=cleanPetPack(value.petPack);if(value.petPack!==null&&!next.petPack)throw Error('导入伙伴配置无效。');}
 return next;
}
export function readRoomData(storage){
 if(!storage)return {version:1,layouts:{},legacyLayouts:{}};
 const next={version:1,layouts:{},legacyLayouts:{}};
 for(const {id} of THEMES){const raw=storage.getItem(LAYOUT_PREFIX+id),old=storage.getItem(LAYOUT_PREFIX+'original:'+id)||storage.getItem(LEGACY_LAYOUT_PREFIX+id);if(raw)next.layouts[id]=JSON.parse(raw);if(old)next.legacyLayouts[id]=JSON.parse(old);}
 for(const [field,key] of Object.entries({life:LIFE_KEY,sky:SKY_SETTINGS_KEY,location:LOCATION_KEY,recipes:RECIPES_KEY,lights:LIGHTS_KEY,petPack:PACK_SELECTION})){const raw=storage.getItem(key);if(raw!==null)next[field]=JSON.parse(raw);}
 return normalizeRoomData(next);
}
export function roomDataWrites(value){
 const data=normalizeRoomData(value);if(!data)return [];
 const pairs=Object.entries(data.layouts).map(([id,value])=>[LAYOUT_PREFIX+id,value]);
 for(const [id,value] of Object.entries(data.legacyLayouts))pairs.push([LAYOUT_PREFIX+'original:'+id,value]);
 for(const [field,key] of Object.entries({life:LIFE_KEY,sky:SKY_SETTINGS_KEY,location:LOCATION_KEY,recipes:RECIPES_KEY,lights:LIGHTS_KEY,petPack:PACK_SELECTION}))if(own(data,field))pairs.push([key,data[field]]);
 return pairs.map(([key,value])=>({key,value:value===null?null:JSON.stringify(value)}));
}
export function restoreRoomData(value,{storage=globalThis.localStorage,target=globalThis.window}={}){
 const writes=roomDataWrites(value).map(w=>({...w,old:storage.getItem(w.key)})),committed=[];
 try{for(const w of writes){w.value===null?storage.removeItem(w.key):storage.setItem(w.key,w.value);committed.push(w);}}
 catch(error){let failed=false;for(const w of committed.reverse())try{w.old===null?storage.removeItem(w.key):storage.setItem(w.key,w.old);}catch{failed=true;}throw Error(failed?'小屋恢复失败，回滚未完成，请保留恢复点。':'小屋恢复未能保存，原布局与配置已还原。');}
 for(const w of writes){if(!target?.dispatchEvent)continue;const e=new Event('storage');Object.defineProperties(e,{key:{value:w.key},newValue:{value:w.value},oldValue:{value:w.old}});target.dispatchEvent(e);}
 for(const type of ['cabin:layout-changed','cabin:pet-pack','cabin:life-changed','cabin:sky-settings','cabin:location','cabin:recipes','cabin:lights'])target?.dispatchEvent?.(new Event(type));
 return {changed:writes.map(w=>w.key)};
}
