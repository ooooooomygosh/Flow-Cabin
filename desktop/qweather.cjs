'use strict';
const fs = require('node:fs'), path = require('node:path');
// Credentials remain in the native encrypted store, never renderer preferences or backups.
function validHost(input) {
  const host = String(input || '').trim().toLowerCase();
  return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.){1,2}qweatherapi\.com$/.test(host) ? host : null;
}
function createWeatherProfile({ directory, safeStorage } = {}) {
  const file = directory && path.join(directory, 'qweather-key.bin');
  let loaded = false, profile = null, persistent = false, revision = 0;
  const secure = () => { try { return !!safeStorage?.isEncryptionAvailable() && safeStorage.getSelectedStorageBackend?.() !== 'basic_text'; } catch { return false; } };
  function read() {
    if (!loaded) {
      loaded = true;
      try { const bytes = fs.readFileSync(file); if (secure()) { const data = JSON.parse(safeStorage.decryptString(bytes)); if (validHost(data.host) && typeof data.key === 'string' && /^[A-Za-z0-9._-]{8,400}$/.test(data.key)) { profile = data; persistent = true; } } } catch {}
    }
    return profile;
  }
  const state = () => { const value = read(); return { provider: value ? 'qweather' : 'open-meteo', host: value?.host || '', stored: !!value, secure: persistent, revision }; };
  return { read, state, set(value) {
    const old = read(); let next = null;
    if (value?.provider === 'qweather') {
      const host = validHost(value.host), key = String(value.key || (host === old?.host ? old.key : '')).trim();
      if (!host || !/^[A-Za-z0-9._-]{8,400}$/.test(key)) throw Error('请填写控制台分配的 API Host 和有效的 API KEY。');
      next = { host, key };
    } else if (value?.provider !== 'open-meteo') throw Error('天气来源无效');
    let saved = false;
    if (file && next && secure()) {
      fs.mkdirSync(directory, { recursive: true });
      const temp = file + '.tmp';
      try { fs.writeFileSync(temp, safeStorage.encryptString(JSON.stringify(next)), { mode: 0o600 }); fs.renameSync(temp, file); saved = true; }
      finally { fs.rmSync(temp, { force: true }); }
    } else if (file) fs.rmSync(file, { force: true });
    profile = next; persistent = saved; revision++; return state();
  } };
}
function qweatherReport(report) {
  const code = Number(report?.condition?.code), n = v => typeof v === 'number' && Number.isFinite(v), clamp = v => Math.max(0, Math.min(1, v));
  if (!Number.isInteger(code) || !n(report?.temperature?.value) || report.temperature.unit !== '°C') return null;
  let kind;
  if ([100,150,102,152].includes(code)) kind = 'clear';
  else if (code >= 101 && code <= 153) kind = 'cloudy';
  else if ([302,303,304].includes(code)) kind = 'storm';
  else if (code >= 300 && code < 400) kind = 'rain';
  else if (code >= 400 && code < 500) kind = 'snow';
  else if (code >= 500 && code < 600) kind = 'fog';
  else return null;
  const speed = report.wind?.speed, wind = n(speed?.value) ? clamp(speed.value * (speed.unit === 'm/s' ? 3.6 : 1) / 50) : 0;
  const intensity = kind === 'clear' ? 0 : kind === 'cloudy' ? clamp(report.cloudCover ?? .7) : clamp(.35 + (report.precipitation?.intensity?.value || 0) / 15);
  const result = { kind, intensity, wind, temperature: report.temperature.value };
  if (n(report.feelsLike?.value) && report.feelsLike.unit === '°C') result.feelsLike = report.feelsLike.value;
  if (n(report.humidity)) result.humidity = Math.round(clamp(report.humidity) * 100);
  if (n(report.precipitation?.amount?.value) && report.precipitation.amount.unit === 'mm') result.precipitation = report.precipitation.amount.value;
  return result;
}
module.exports = { validHost, createWeatherProfile, qweatherReport };
