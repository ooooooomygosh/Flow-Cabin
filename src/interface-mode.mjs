// 3.1: the life cabin is the only home. Earlier versions let people keep the old record-shelf
// home ('classic') with a per-device switch; that choice (and the one-time "首页换成了生活小屋"
// notice flag) is simply forgotten the first time this version opens.
export const INTERFACE_KEY = 'flow-cabin-interface-v1';
export const HOME_NOTICE_KEY = 'flow-cabin-home-notice-v22';
export function retireClassicHome(storage = globalThis.localStorage) {
  try { storage.removeItem(INTERFACE_KEY); storage.removeItem(HOME_NOTICE_KEY); } catch { /* storage unavailable: nothing to forget */ }
}
