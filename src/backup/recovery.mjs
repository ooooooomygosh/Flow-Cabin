export const RECOVERY_KEY='flow-cabin-recovery-v1';
async function digest(text){const data=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return [...new Uint8Array(data)].map(v=>v.toString(16).padStart(2,'0')).join('');}
export function listRecovery(storage=globalThis.localStorage){const raw=storage.getItem(RECOVERY_KEY);if(!raw)return [];const values=JSON.parse(raw);if(!Array.isArray(values)||values.length>3)throw Error('恢复点索引异常。');return values;}
export async function saveRecovery(backup,{storage=globalThis.localStorage,reason='恢复前',now=Date.now()}={}){
 const text=JSON.stringify(backup),hash=await digest(text),entry={id:`${now}-${hash.slice(0,10)}`,at:now,reason,hash,text};
 const before=storage.getItem(RECOVERY_KEY),next=[entry,...listRecovery(storage)].slice(0,3);
 storage.setItem(RECOVERY_KEY,JSON.stringify(next));
 try{const saved=listRecovery(storage)[0];if(saved.hash!==hash||await digest(saved.text)!==hash)throw Error('恢复点校验失败。');}catch(error){before===null?storage.removeItem(RECOVERY_KEY):storage.setItem(RECOVERY_KEY,before);throw error;}
 return entry;
}
export async function readRecovery(id,storage=globalThis.localStorage){const entry=listRecovery(storage).find(v=>v.id===id);if(!entry||await digest(entry.text)!==entry.hash)throw Error('恢复点校验失败，请使用原备份文件。');return entry.text;}

// Permanent deletion must also remove local historical copies.
export function invalidateRecovery(storage=globalThis.localStorage){if(storage?.getItem(RECOVERY_KEY)!==null)storage?.removeItem(RECOVERY_KEY);}
