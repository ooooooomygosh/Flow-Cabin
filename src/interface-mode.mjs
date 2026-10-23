export const INTERFACE_KEY = 'flow-cabin-interface-v1';
export const HOME_NOTICE_KEY = 'flow-cabin-home-notice-v22';
// 2.2: the life cabin ('beta' kept as the stored id for compatibility) is the default home.
// Only an explicit, saved choice of the classic shelf keeps the classic home.
export function interfaceMode(storage=globalThis.localStorage) { try { return storage.getItem(INTERFACE_KEY)==='classic'?'classic':'beta'; } catch { return 'beta'; } }
// One dismissible notice for people who did not choose the classic home themselves.
export function shouldShowHomeNotice(storage=globalThis.localStorage) { try { return storage.getItem(INTERFACE_KEY)===null && storage.getItem(HOME_NOTICE_KEY)!=='done'; } catch { return false; } }
export function dismissHomeNotice(storage=globalThis.localStorage) { try { storage.setItem(HOME_NOTICE_KEY,'done'); } catch {} }
// This per-device opt-in is deliberately excluded from shared layouts and backups.
export async function switchInterface(mode,{storage=globalThis.localStorage,flush=async()=>{},restart=()=>globalThis.location.reload()}={}) {
  if(!['classic','beta'].includes(mode))throw Error('未知首页模式。');
  const previous=storage.getItem(INTERFACE_KEY);
  try{storage.setItem(INTERFACE_KEY,mode);await flush();await restart();}
  catch(error){try{previous===null?storage.removeItem(INTERFACE_KEY):storage.setItem(INTERFACE_KEY,previous);await flush();}catch{}throw error;}
}
