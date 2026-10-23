export function parsePairingPayload(raw, now = Date.now()) {
  if (typeof raw !== 'string' || raw.length > 8192) throw Error('配对载荷无效');
  const value = JSON.parse(raw);
  if (value?.type !== 'flow-cabin-pair' || value.version !== 1 || !/^[a-f0-9]{64}$/i.test(value.pin) || !/^[a-f0-9]{64}$/i.test(value.token) || !Number.isFinite(value.expiresAt) || value.expiresAt <= now || value.expiresAt > now + 5 * 60000) throw Error('配对码无效、已过期或设备时间相差过大');
  if (!Array.isArray(value.addresses) || value.addresses.length > 32) throw Error('配对地址无效');
  const addresses = value.addresses.filter(address => {
    if (typeof address !== 'string') return false;
    try { const url = new URL(address); return url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash && /^\d{1,3}(\.\d{1,3}){3}$/.test(url.hostname) && url.hostname.split('.').every(part => Number(part) <= 255); } catch { return false; }
  });
  if (!addresses.length) throw Error('配对码缺少局域网地址');
  return { version: 1, type: value.type, pin: value.pin, token: value.token, expiresAt: value.expiresAt, addresses };
}
