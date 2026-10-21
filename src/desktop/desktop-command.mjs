// The one channel from the page to the desktop shell: a denied new-window request for
// `album-desktop://action/<command>?<params>`. It never navigates or reloads the page and
// exposes no native IPC; the shell only acts on its own whitelist (desktop/main/site-commands.cjs).
export function desktopCommandUrl(command, params = {}) {
  const url = new URL(`album-desktop://action/${command}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  return url.href;
}
export function desktopCommand(command, params = {}, open = (href) => window.open(href, '_blank')) {
  if (globalThis.albumMobile && ['music-login', 'music-logout'].includes(command)) { globalThis.albumMobile.platformAccount(params.provider, command === 'music-logout'); return; }
  open(desktopCommandUrl(command, params));
}
