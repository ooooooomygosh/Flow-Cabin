export const INTERFACE_KEY = 'flow-cabin-interface-v1';
export function interfaceMode(storage=globalThis.localStorage) { try { return storage.getItem(INTERFACE_KEY)==='beta'?'beta':'classic'; } catch { return 'classic'; } }
// This per-device opt-in is deliberately excluded from shared layouts and backups.
export async function switchInterface(mode,{storage=globalThis.localStorage,flush=async()=>{},restart=()=>globalThis.location.reload()}={}) {
  if(!['classic','beta'].includes(mode))throw Error('未知首页模式。');
  const previous=storage.getItem(INTERFACE_KEY);
  try{storage.setItem(INTERFACE_KEY,mode);await flush();await restart();}
  catch(error){try{previous===null?storage.removeItem(INTERFACE_KEY):storage.setItem(INTERFACE_KEY,previous);await flush();}catch{}throw error;}
}
