// Every deck provider, once: ids are saved (album-circle-room-player-v1) and mirrored by the
// desktop wallpaper sanitiser (desktop/test/catalog-contract.test.cjs keeps the two in step).
// `label` is the full name for settings; `short` fits the turntable plate. Dependency-free so the
// wallpaper can name a provider without bundling the source resolver; re-exported by sources.mjs.
export const PROVIDERS = Object.freeze([
  { id: 'visual', label: '仅动画展示', short: '仅展示', kind: 'visual' },
  { id: 'auto', label: '自动匹配', short: '自动匹配', kind: 'auto', desktopOnly: true },
  { id: 'qq', label: 'QQ 音乐', short: 'QQ 音乐', kind: 'account', login: true, desktopOnly: true },
  { id: 'netease', label: '网易云音乐', short: '网易云', kind: 'account', login: true, desktopOnly: true },
  { id: 'local', label: '本地音乐', short: '本地音乐', kind: 'folder', login: false, desktopOnly: true },
  { id: 'appleMusic', label: 'Apple Music（音乐 App）', short: 'Apple Music', kind: 'system-app', login: false, platform: 'darwin', desktopOnly: true },
  { id: 'ma', label: 'Music Assistant', short: '家庭播放器', kind: 'server', login: false, desktopOnly: true },
  { id: 'system', label: '系统正在播放', short: '系统播放', kind: 'follow', login: false, desktopOnly: true }
].map(Object.freeze));
export const DECK_PROVIDERS = Object.freeze(PROVIDERS.map((provider) => provider.id));
export const isDeckProvider = (id) => DECK_PROVIDERS.includes(id);
// providerLabel('netease') → 网易云音乐; providerLabel('netease', 'short') → 网易云. Unknown ids read as 自动匹配.
export const providerLabel = (id, form = 'label') => (PROVIDERS.find((provider) => provider.id === id) || PROVIDERS[1])[form === 'short' ? 'short' : 'label'];
// Sources that produce sound (everything but the visual-only deck and auto-matching).
export const SOURCES = Object.freeze(PROVIDERS.filter((provider) => !['visual', 'auto'].includes(provider.id)).map(({ short, desktopOnly, ...source }) => Object.freeze(source)));
// What the deck's controls can really do with a source. Remote players (the macOS
// 「音乐」App, Music Assistant) report a position but cannot be scrubbed or have
// their volume set from the cabin; the system mirror only shows progress.
export function deckCapabilities(provider, { remote = false } = {}) {
  const audible = isDeckProvider(provider) && provider !== 'visual' && provider !== 'system';
  const remotePlayer = provider === 'appleMusic' || provider === 'ma' || (audible && remote === true);
  return Object.freeze({ progress: provider !== 'visual' && isDeckProvider(provider), seek: audible && !remotePlayer, volume: audible && !remotePlayer, readOnlyProgress: provider === 'system' || remotePlayer });
}
