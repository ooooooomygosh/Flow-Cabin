// Built-in places for the window sky (设置 › 房间 › 窗外). No geolocation prompt: the
// default follows the system time zone; 'clock' keeps the old fixed day (6–20 h).
// [id, 中文名, IANA zone, latitude, longitude]. The first city of a zone is its default.
const ROWS = [
  ['shanghai', '上海', 'Asia/Shanghai', 31.23, 121.47], ['beijing', '北京', 'Asia/Shanghai', 39.9, 116.4],
  ['guangzhou', '广州', 'Asia/Shanghai', 23.13, 113.26], ['shenzhen', '深圳', 'Asia/Shanghai', 22.54, 114.06],
  ['hangzhou', '杭州', 'Asia/Shanghai', 30.27, 120.16], ['nanjing', '南京', 'Asia/Shanghai', 32.06, 118.8],
  ['chengdu', '成都', 'Asia/Shanghai', 30.57, 104.07], ['chongqing', '重庆', 'Asia/Shanghai', 29.56, 106.55],
  ['wuhan', '武汉', 'Asia/Shanghai', 30.59, 114.31], ['xian', '西安', 'Asia/Shanghai', 34.34, 108.94],
  ['changsha', '长沙', 'Asia/Shanghai', 28.23, 112.94], ['xiamen', '厦门', 'Asia/Shanghai', 24.48, 118.09],
  ['qingdao', '青岛', 'Asia/Shanghai', 36.07, 120.38], ['kunming', '昆明', 'Asia/Shanghai', 25.04, 102.71],
  ['harbin', '哈尔滨', 'Asia/Shanghai', 45.8, 126.53], ['lhasa', '拉萨', 'Asia/Shanghai', 29.65, 91.12],
  ['urumqi', '乌鲁木齐', 'Asia/Urumqi', 43.83, 87.62], ['hongkong', '香港', 'Asia/Hong_Kong', 22.32, 114.17],
  ['macau', '澳门', 'Asia/Macau', 22.2, 113.54], ['taipei', '台北', 'Asia/Taipei', 25.03, 121.57],
  ['tokyo', '东京', 'Asia/Tokyo', 35.68, 139.69], ['seoul', '首尔', 'Asia/Seoul', 37.57, 126.98],
  ['singapore', '新加坡', 'Asia/Singapore', 1.35, 103.82], ['bangkok', '曼谷', 'Asia/Bangkok', 13.76, 100.5],
  ['kualalumpur', '吉隆坡', 'Asia/Kuala_Lumpur', 3.14, 101.69], ['dubai', '迪拜', 'Asia/Dubai', 25.2, 55.27],
  ['sydney', '悉尼', 'Australia/Sydney', -33.87, 151.21], ['melbourne', '墨尔本', 'Australia/Melbourne', -37.81, 144.96],
  ['auckland', '奥克兰', 'Pacific/Auckland', -36.85, 174.76], ['london', '伦敦', 'Europe/London', 51.51, -0.13],
  ['paris', '巴黎', 'Europe/Paris', 48.86, 2.35], ['berlin', '柏林', 'Europe/Berlin', 52.52, 13.4],
  ['amsterdam', '阿姆斯特丹', 'Europe/Amsterdam', 52.37, 4.9], ['moscow', '莫斯科', 'Europe/Moscow', 55.76, 37.62],
  ['reykjavik', '雷克雅未克', 'Atlantic/Reykjavik', 64.15, -21.94], ['tromso', '特罗姆瑟', 'Europe/Oslo', 69.65, 18.96],
  ['newyork', '纽约', 'America/New_York', 40.71, -74.01], ['toronto', '多伦多', 'America/Toronto', 43.65, -79.38],
  ['chicago', '芝加哥', 'America/Chicago', 41.88, -87.63], ['losangeles', '洛杉矶', 'America/Los_Angeles', 34.05, -118.24],
  ['sanfrancisco', '旧金山', 'America/Los_Angeles', 37.77, -122.42], ['seattle', '西雅图', 'America/Los_Angeles', 47.61, -122.33],
  ['vancouver', '温哥华', 'America/Vancouver', 49.28, -123.12], ['saopaulo', '圣保罗', 'America/Sao_Paulo', -23.55, -46.63]
];
export const SKY_CITIES = Object.freeze(ROWS.map(([id, name, zone, lat, lng]) => Object.freeze({ id, name, zone, lat, lng })));
const byId = new Map(SKY_CITIES.map((city) => [city.id, city]));
// Zones that share a city's clock but are not listed verbatim.
const ZONE_ALIASES = { 'Asia/Chongqing': 'chongqing', 'Asia/Chungking': 'chongqing', 'Asia/Harbin': 'harbin', 'PRC': 'shanghai', 'Asia/Kashgar': 'urumqi', 'Asia/Ho_Chi_Minh': 'bangkok', 'Asia/Jakarta': 'singapore', 'Asia/Manila': 'hongkong', 'Europe/Dublin': 'london', 'Europe/Madrid': 'paris', 'Europe/Rome': 'paris', 'Europe/Brussels': 'paris', 'Europe/Vienna': 'berlin', 'Europe/Zurich': 'berlin', 'Europe/Stockholm': 'berlin', 'Europe/Copenhagen': 'berlin', 'America/Denver': 'chicago', 'America/Phoenix': 'losangeles' };
export const getSkyCity = (id) => byId.get(id) || null;
export function cityForZone(zone) {
  if (!zone) return null;
  return byId.get(ZONE_ALIASES[zone]) || SKY_CITIES.find((city) => city.zone === zone) || null;
}
export function systemZone() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return ''; } }
// place: 'auto' (system zone, else the fixed clock), 'clock' or a city id → a city or null (fixed clock).
export function resolveSkyCity(place = 'auto', zone = systemZone(), customPlace = null) {
  if (place === 'clock') return null;
  if (place === 'custom') return normalizeCustomPlace(customPlace);
  return getSkyCity(place) || cityForZone(zone);
}

export function normalizeCustomPlace(value) {
  if (!value || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 80) return null;
  const numeric = v => typeof v === 'number' || (typeof v === 'string' && /^-?\d{1,3}(\.\d+)?$/.test(v)) ? Number(v) : NaN;
  const lat = numeric(value.lat), lng = numeric(value.lng), zone = value.zone ?? value.timezone;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || typeof zone !== 'string' || zone.length > 80) return null;
  try { new Intl.DateTimeFormat('en', { timeZone: zone }).format(0); } catch { return null; }
  const result = { id: 'custom', name: value.name.trim(), lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100, zone };
  for (const key of ['admin1', 'admin2', 'country']) if (typeof value[key] === 'string' && value[key].trim()) result[key] = value[key].trim().slice(0, 80);
  return result;
}
export const placeDescription = place => [...new Set([place?.country, place?.admin1, place?.admin2, place?.name].filter(Boolean))].join(' · ');
