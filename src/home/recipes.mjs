import {THEMES,validateLayout} from './spatial-layout.mjs';
import {normalizeMix} from '../audio/ambience.mjs';
export const RECIPES_KEY='flow-cabin-recipes-v1',RECIPES_EVENT='cabin:recipes';
export function normalizeRecipes(value){
 if(value==null)return {version:1,recipes:[]};
 if(value.version!==1||!Array.isArray(value.recipes)||value.recipes.length>30)throw Error('场景配方格式无效。');
 const ids=new Set();return {version:1,recipes:value.recipes.map(r=>{if(!r||typeof r.id!=='string'||!/^[-\w]{1,80}$/.test(r.id)||ids.has(r.id)||typeof r.name!=='string'||!r.name.trim()||r.name.length>60||!THEMES.some(t=>t.id===r.theme))throw Error('场景配方无效或重复。');if(r.layout?.theme!==r.theme)throw Error('配方中的房间与布局不一致。');ids.add(r.id);return {id:r.id,name:r.name.trim(),theme:r.theme,layout:validateLayout(r.layout),dim:r.dim===true,mix:normalizeMix(r.mix),sound:r.sound===true,focusMinutes:Math.max(0,Math.min(180,Math.round(Number(r.focusMinutes)||0))),recordId:typeof r.recordId==='string'?r.recordId.slice(0,160):'',recordIdentity:typeof r.recordIdentity==='string'?r.recordIdentity.slice(0,500):''};})};
}
export function readRecipes(storage=globalThis.localStorage){const raw=storage.getItem(RECIPES_KEY);return raw?normalizeRecipes(JSON.parse(raw)):normalizeRecipes(null);}
export function writeRecipes(value,storage=globalThis.localStorage){const next=normalizeRecipes(value);storage.setItem(RECIPES_KEY,JSON.stringify(next));globalThis.dispatchEvent?.(new Event(RECIPES_EVENT));return next;}
export const LIGHTS_KEY='flow-cabin-lights-v1';
export const readLights=(storage=globalThis.localStorage)=>{try{return normalizeLights(JSON.parse(storage.getItem(LIGHTS_KEY)||'{}'));}catch{return {};}};
export function normalizeLights(value){return Object.fromEntries(THEMES.filter(t=>typeof value?.[t.id]==='boolean').map(t=>[t.id,value[t.id]]));}
export function setRoomLight(theme,dim,storage=globalThis.localStorage){if(!THEMES.some(t=>t.id===theme))throw Error('未知房间。');const next={...readLights(storage),[theme]:Boolean(dim)};storage.setItem(LIGHTS_KEY,JSON.stringify(next));globalThis.dispatchEvent?.(new Event('cabin:lights'));return next;}

export const recipeRecordIdentity = item => item ? JSON.stringify([item.type||'album',item.title?.trim().toLowerCase(),item.artist?.trim().toLowerCase()]) : '';
