// The rotary source selector: which positions the dial has right now and which of them can be
// used. The rows and their reasons are the ones Settings › 音源 shows (SettingsHub MusicSection):
// the same list, the same "需要心流小屋桌面版", just turned into a dial. Pure, so it is testable.
import { sourceOptions, providerFor } from '../onboarding/onboarding-model.mjs';
import { PROVIDERS, providerLabel } from '../player/providers.mjs';

const HINT = {
  visual: '唱片转动、显示曲目，不出声。',
  auto: '按唱片在已连接的音源里找能播放的版本。',
  ma: '由家里的 Music Assistant 服务器出声。'
};

// env: { desktop, mobile, mac } (onboarding-model detectEnv). status: { [sourceId]: { connected, detail } }.
export function sourceDial(env = {}, provider = 'visual', status = {}) {
  const rows = [
    { id: 'visual', available: true, hint: HINT.visual },
    { id: 'auto', available: Boolean(env.desktop || env.mobile), hint: HINT.auto, reason: '需要心流小屋桌面版' },
    ...sourceOptions(env).map((source) => ({ id: providerFor(source.id) || source.id, source: source.id, available: source.available, hint: status[source.id]?.detail || source.hint, reason: source.reason, connected: status[source.id]?.connected })),
    { id: 'ma', available: Boolean(env.desktop), hint: HINT.ma, reason: '需要心流小屋桌面版' }
  ].filter((row, index, list) => (!env.mobile || ['visual', 'auto', 'local', 'qq', 'netease'].includes(row.id)) && PROVIDERS.some((item) => item.id === row.id) && list.findIndex((other) => other.id === row.id) === index);
  return rows.map((row) => ({ ...row, label: providerLabel(row.id), short: providerLabel(row.id, 'short'), on: row.id === provider, connected: Boolean(row.connected) }));
}

// Arrow keys turn the dial to the next position that can be used, round the end.
export function nextSource(rows, current, direction) {
  const enabled = rows.filter((row) => row.available);
  if (!enabled.length) return current;
  const index = enabled.findIndex((row) => row.id === current);
  return enabled[(Math.max(0, index) + direction + enabled.length) % enabled.length].id;
}

// The pointer's angle for position i of n: spread over 240 degrees, centred on straight up.
export const dialAngle = (i, n) => (n <= 1 ? 0 : -120 + 240 * i / (n - 1));
