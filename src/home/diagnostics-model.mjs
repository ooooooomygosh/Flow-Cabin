// 功能诊断: turn the cabin's internal states into plain Chinese. Each row has a
// short value, a sentence that says what it means or what to do, and a tone
// ('ok' | 'warn' | 'info') for the status dot. The exported JSON report keeps
// the raw values; this file only decides what a person reads.
import { providerLabel } from '../player/providers.mjs';

export const ACCOUNT_TEXT = Object.freeze({
  empty: ['未登录', '登录后可以播放这个平台的完整歌曲。', 'info'],
  saved: ['已保存登录', '登录信息在本机，第一次播放时会向平台确认。', 'ok'],
  valid: ['登录有效', '平台确认了这次登录。', 'ok'],
  expired: ['登录已过期', '请在「设置 › 音源 › 账户与文件夹」重新登录。', 'warn'],
  offline: ['暂时连不上平台', '网络或平台服务不可用，恢复后会自动重试。', 'warn'],
  'storage-error': ['登录凭据无法读取', '请解锁系统钥匙串（凭据存储）后重启小屋。', 'warn'],
  unavailable: ['需要桌面版', '网页版不能登录音乐平台。', 'info']
});

export const LOCATION_TEXT = Object.freeze({
  idle: ['还没有请求', '在「位置与天气」里允许大致位置，或直接搜索城市。', 'info'],
  requesting: ['正在请求', '等待系统询问是否允许定位。', 'info'],
  available: ['已获取大致位置', '只保存到城市级别，不会上传坐标。', 'ok'],
  denied: ['未允许定位', '可以在系统设置里允许，或改为搜索城市。', 'warn'],
  timeout: ['定位超时', '没有及时拿到位置，可以稍后重试或搜索城市。', 'warn'],
  disabled: ['已关闭', '天气使用你手动选择的城市。', 'info'],
  unavailable: ['设备不支持定位', '请在「位置与天气」里搜索城市。', 'info']
});

export const PHASE_TEXT = Object.freeze({ idle: '待机', focus: '专注中', shortBreak: '短休息', longBreak: '长休息' });
export const PLATFORM_TEXT = Object.freeze({ web: '网页版', desktop: '桌面版', android: 'Android 版' });

const pick = (table, key, fallback) => table[key] || [fallback || String(key || '未知'), '', 'info'];

// "今天 16:05" / "昨天 08:30" / "10月21日 09:00" / "2025年3月1日 09:00", always zh-CN.
export function formatStamp(at, now = Date.now()) {
  const time = new Date(at);
  if (!Number.isFinite(time.getTime()) || !at) return '';
  const clock = time.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  const day = (value) => { const d = new Date(value); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const days = Math.round((day(now) - day(time)) / 86400000);
  if (days === 0) return `今天 ${clock}`;
  if (days === 1) return `昨天 ${clock}`;
  const sameYear = new Date(now).getFullYear() === time.getFullYear();
  return `${time.toLocaleDateString('zh-CN', sameYear ? { month: 'long', day: 'numeric' } : { year: 'numeric', month: 'long', day: 'numeric' })} ${clock}`;
}

// The rows of 功能诊断, in reading order. `input` holds plain values only, so
// the function is testable without the runtime.
export function diagnosticRows(input, now = Date.now()) {
  const { platform = 'web', provider = 'visual', audible = false, statusText = '', remote = false, phase = 'idle', paused = false, unsaved = false, hasTrack = false, pet = '', accessory = '', connections = 0, syncError = '', accounts = {}, location = 'idle', weatherOn = false, weatherAt = 0, storage = null } = input || {};
  const rows = [];
  rows.push({ id: 'platform', label: '运行环境', value: PLATFORM_TEXT[platform] || platform, hint: platform === 'web' ? '部分功能（平台登录、桌宠、沉入桌面）需要桌面版。' : '', tone: 'info' });
  rows.push({ id: 'playback', label: '播放', value: audible ? '正在播放' : statusText || '尚未播放', hint: remote ? '声音来自外部播放器，小屋只负责遥控。' : audible ? '' : '放上一张唱片就会开始。', tone: audible ? 'ok' : 'info' });
  rows.push({ id: 'provider', label: '音源', value: providerLabel(provider), hint: provider === 'visual' ? '只转动唱片、显示曲目，不出声。可在「设置 › 音源」换成能出声的来源。' : provider === 'auto' ? '按唱片在已连接的音源里找能播放的版本。' : '', tone: provider === 'visual' ? 'warn' : 'ok' });
  rows.push({ id: 'lyrics', label: '歌词', value: hasTrack ? '跟随当前歌曲' : '放上唱片后读取', hint: hasTrack ? '对不上时可以在歌词里微调偏移。' : '', tone: hasTrack ? 'ok' : 'info' });
  rows.push({ id: 'focus', label: '专注', value: `${PHASE_TEXT[phase] || phase}${paused && phase !== 'idle' ? '（已暂停）' : ''}`, hint: '', tone: phase === 'idle' ? 'info' : 'ok' });
  rows.push({ id: 'saved', label: '保存', value: unsaved ? '有尚未保存的修改' : '记录都已保存', hint: unsaved ? '稍等片刻会自动保存；空间不足时请先导出备份。' : '', tone: unsaved ? 'warn' : 'ok' });
  rows.push({ id: 'pet', label: '伙伴', value: `${pet || '伙伴'} · ${accessory || '未佩戴配饰'}`, hint: '', tone: 'info' });
  rows.push({ id: 'devices', label: '设备联动', value: syncError ? '连接出了问题' : connections ? `已连接 ${connections} 台设备` : '没有连接其他设备', hint: syncError ? String(syncError) : connections ? '' : '同一 Wi-Fi 下可在「设置 › 同步与设备」配对。', tone: syncError ? 'warn' : connections ? 'ok' : 'info' });
  if (accounts.status === 'unavailable') rows.push({ id: 'accounts', label: '平台账号', ...rowText(ACCOUNT_TEXT.unavailable) });
  else if (!Object.keys(accounts).length) rows.push({ id: 'accounts', label: '平台账号', value: '正在读取…', hint: '', tone: 'info' });
  else for (const [key, name] of [['qq', 'QQ 音乐'], ['netease', '网易云音乐']]) if (key in accounts) rows.push({ id: `account-${key}`, label: name, ...rowText(pick(ACCOUNT_TEXT, accounts[key])) });
  rows.push({ id: 'location', label: '定位', ...rowText(pick(LOCATION_TEXT, location)) });
  rows.push({ id: 'weather', label: '天气', value: !weatherOn ? '使用装饰天气' : weatherAt ? `上次更新 ${formatStamp(weatherAt, now)}` : '还没有取到实时天气', hint: !weatherOn ? '打开「实际天气」后，窗外会跟着真实天气变化。' : weatherAt && now - weatherAt > 3 * 3600000 ? '超过三小时没有更新，可能是网络不通。' : '', tone: weatherOn && weatherAt && now - weatherAt <= 3 * 3600000 ? 'ok' : weatherOn ? 'warn' : 'info' });
  if (storage && platform === 'android') rows.push({ id: 'storage', label: '本机存储', value: storage.error ? '有数据等待重新保存' : storage.pending ? '正在保存' : '已保存在本机', hint: storage.error ? '请检查手机剩余空间，并先导出一份备份。' : '', tone: storage.error ? 'warn' : 'ok' });
  return rows;
}
function rowText([value, hint, tone]) { return { value, hint, tone }; }
