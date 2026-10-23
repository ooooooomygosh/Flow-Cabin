'use strict';
const https = require('node:https');
const net = require('node:net');
const tls = require('node:tls');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { createCertificate } = require('./lan-certificate.cjs');
const { validateSnapshot, mergeSnapshots, emptySnapshot } = require('./lan-model.cjs');
const MAX = 8 * 1024 * 1024;
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const secret = () => crypto.randomBytes(32).toString('hex');
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const privateIP = address => { const ip = address.replace(/^::ffff:/, ''); return net.isIP(ip) === 4 && (/^10\./.test(ip) || /^192\.168\./.test(ip) || /^127\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip)); };
function endpoint(value) { const url = new URL(value); if (url.protocol !== 'https:' || !privateIP(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('请输入同一局域网的 IPv4 HTTPS 地址'); return url.origin; }
function atomic(file, value) {
  const temporary = `${file}.${crypto.randomBytes(12).toString('hex')}.tmp`;
  let fd;
  try { fd = fs.openSync(temporary, 'wx', 0o600); fs.writeFileSync(fd, value); fs.closeSync(fd); fd = null; fs.renameSync(temporary, file); }
  finally { if (fd != null) fs.closeSync(fd); try { fs.unlinkSync(temporary); } catch {} }
}
function signature(key, method, route, nonce, body) { return crypto.createHmac('sha256', key).update(`${method}\n${route}\n${nonce}\n${hash(body)}`).digest('hex'); }
function pinnedRequest(address, pin, route, data, auth = null, { signal } = {}) {
  const url = new URL(endpoint(address));
  if (!/^[a-f0-9]{64}$/i.test(pin)) return Promise.reject(new Error('证书指纹格式错误'));
  const body = JSON.stringify(data), nonce = `${Date.now()}:${secret()}`;
  if (Buffer.byteLength(body) > MAX) return Promise.reject(new Error('Sync payload too large'));
  return new Promise((resolve, reject) => {
    // Establish and pin TLS BEFORE constructing an HTTP request. No HTTP headers,
    // pairing token, HMAC or body exists on the wire before this gate succeeds.
    const socket = tls.connect({ host: url.hostname, port: Number(url.port) || 443, rejectUnauthorized: false, minVersion: 'TLSv1.2', signal });
    let agent, settled = false;
    const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); agent?.destroy(); socket.destroy(); error ? reject(error) : resolve(value); };
    const timer = setTimeout(() => finish(new Error('连接超时')), 10000); timer.unref?.();
    socket.on('error', error => finish(error));
    socket.once('secureConnect', () => {
      const cert = socket.getPeerCertificate();
      if (!cert.raw || !equal(hash(cert.raw), pin.toLowerCase())) return finish(new Error('证书指纹不匹配，已拒绝连接'));
      if (signal?.aborted) return finish(new Error('同步已取消'));
      agent = new https.Agent({ keepAlive: false, maxSockets: 1 });
      agent.createConnection = () => socket;
      const req = https.request(url.origin + route, { agent, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...(auth ? { 'x-cabin-device': auth.id, 'x-cabin-nonce': nonce, 'x-cabin-signature': signature(auth.key, 'POST', route, nonce, body) } : {}) } }, res => {
        const chunks = []; let size = 0;
        res.on('data', b => { size += b.length; if (size > MAX) finish(new Error('Sync response too large')); else chunks.push(b); });
        res.on('error', error => finish(error)); res.on('end', () => { try { const value = JSON.parse(Buffer.concat(chunks)); if (res.statusCode !== 200) finish(new Error(value.error || 'Sync rejected')); else finish(null, value); } catch (e) { finish(e); } });
      });
      req.on('error', error => finish(error)); req.end(body);
    });
  });
}
function createLanService({ directory, now = Date.now } = {}) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (fs.lstatSync(directory).isSymbolicLink()) throw new Error('Unsafe LAN storage directory');
  if (process.platform !== 'win32') fs.chmodSync(directory, 0o700);
  const identityPath = path.join(directory, 'identity.json'), statePath = path.join(directory, 'state.json');
  for (const file of [identityPath, statePath]) if (fs.existsSync(file)) { if (fs.lstatSync(file).isSymbolicLink()) throw new Error('Unsafe LAN state file'); if (process.platform !== 'win32') fs.chmodSync(file, 0o600); }
  const identity = fs.existsSync(identityPath) ? JSON.parse(fs.readFileSync(identityPath, 'utf8')) : { id: crypto.randomUUID(), ...createCertificate() };
  if (!fs.existsSync(identityPath)) atomic(identityPath, JSON.stringify(identity));
  const certificate = new crypto.X509Certificate(identity.cert);
  if (!equal(hash(certificate.publicKey.export({ type: 'spki', format: 'der' })), hash(crypto.createPublicKey(identity.key).export({ type: 'spki', format: 'der' })))) throw new Error('LAN identity key mismatch');
  const pin = hash(certificate.raw);
  let state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : { peers: [], snapshot: emptySnapshot() };
  state.snapshot = validateSnapshot(state.snapshot);
  if (!Array.isArray(state.peers) || state.peers.length > 1000 || state.peers.some(peer => !peer || typeof peer.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(peer.id) || !/^[a-f0-9]{64}$/.test(peer.key || '') || !/^[a-f0-9]{64}$/.test(peer.pin || '') || typeof peer.name !== 'string' || peer.name.length > 80 || (peer.address !== '' && endpoint(peer.address) !== peer.address))) throw new Error('Invalid saved LAN trust state');
  let server = null, pairing = null, listening = null, lifecycle = 0;
  const requests = new Map();
  const cancelRequests = id => { for (const [peerId, controllers] of requests) if (id == null || id === peerId) for (const controller of controllers) controller.abort(); };
  async function outbound(id, address, fingerprint, route, data, auth) {
    const controller = new AbortController(), controllers = requests.get(id) || new Set(); controllers.add(controller); requests.set(id, controllers);
    try { return await pinnedRequest(address, fingerprint, route, data, auth, { signal: controller.signal }); }
    finally { controllers.delete(controller); if (!controllers.size) requests.delete(id); }
  }
  const nonces = new Map(), limits = new Map();
  const save = () => atomic(statePath, JSON.stringify(state));
  const publicPeer = ({ id, name, address, pin }) => ({ id, name, address, pin });
  const status = () => ({ id: identity.id, enabled: Boolean(server?.listening), pin, addresses: server?.listening ? [...new Set(['127.0.0.1', ...Object.values(os.networkInterfaces()).flat().filter(n => n.family === 'IPv4' && privateIP(n.address)).map(n => n.address)])].map(ip => `https://${ip}:${server.address().port}`) : [], peers: state.peers.map(publicPeer) });
  async function start({ host = '0.0.0.0', port = 0 } = {}) {
    if (server?.listening) return status(); if (listening) return listening;
    if (host !== '0.0.0.0' && !privateIP(host)) throw new Error('Only local interfaces allowed');
    server = https.createServer({ key: identity.key, cert: identity.cert, minVersion: 'TLSv1.2' }, async (req, res) => {
      const respond = (code, value) => { if (!res.destroyed) { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(value)); } };
      try {
        if (!privateIP(req.socket.remoteAddress || '') || req.headers.origin || req.headers.cookie || req.method !== 'POST' || !['/pair', '/sync'].includes(req.url)) return respond(403, { error: 'Forbidden' });
        const ip = req.socket.remoteAddress, bucket = limits.get(ip); if (!bucket || bucket.until < now()) limits.set(ip, { until: now() + 60000, count: 1 }); else if (++bucket.count > 30) return respond(429, { error: 'Too many requests' });
        if (limits.size > 2048) limits.clear();
        if (Number(req.headers['content-length']) > MAX || !String(req.headers['content-type']).startsWith('application/json')) return respond(413, { error: 'Invalid payload' });
        const chunks = []; let bytes = 0; req.setTimeout(10000, () => req.destroy());
        for await (const chunk of req) { bytes += chunk.length; if (bytes > MAX) { respond(413, { error: 'Payload too large' }); return; } chunks.push(chunk); }
        const body = Buffer.concat(chunks).toString('utf8');
        if (req.url === '/sync') {
          const peer = state.peers.find(p => p.id === req.headers['x-cabin-device']), nonce = req.headers['x-cabin-nonce'];
          for (const [key, until] of nonces) if (until < now()) nonces.delete(key);
          if (!peer || !/^\d{10,16}:[a-f0-9]{64}$/.test(nonce || '') || Math.abs(now() - Number(nonce.split(':')[0])) > 120000 || nonces.has(nonce) || !equal(signature(peer.key, 'POST', '/sync', nonce, body), req.headers['x-cabin-signature'])) return respond(401, { error: '设备未获信任或已撤销' });
          nonces.set(nonce, Number(nonce.split(':')[0]) + 120000);
          state.snapshot = mergeSnapshots(state.snapshot, JSON.parse(body)); save(); return respond(200, state.snapshot);
        }
        const data = JSON.parse(body);
        if (!pairing || pairing.expiresAt < now() || !equal(pairing.token, data.token)) return respond(401, { error: '配对码无效或已过期' });
        if (typeof data.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(data.id) || data.id === identity.id || !/^[a-f0-9]{64}$/.test(data.pin || '')) return respond(400, { error: 'Invalid device' });
        const key = secret(); pairing = null;
        state.peers = state.peers.filter(p => p.id !== data.id);
        state.peers.push({ id: data.id, name: String(data.name || '另一间小屋').slice(0, 80), key, pin: data.pin, address: '' }); save();
        respond(200, { id: identity.id, key, pin });
      } catch { respond(400, { error: '同步数据无效，原数据已保留' }); }
    });
    server.headersTimeout = 10000; server.requestTimeout = 15000; server.maxConnections = 8;
    listening = new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, () => resolve(status())); });
    try { return await listening; } finally { listening = null; }
  }
  async function stop() { lifecycle++; cancelRequests(); pairing = null; if (server) { const current = server; if (listening) await listening.catch(() => {}); if (server === current) server = null; current.closeAllConnections(); await new Promise(resolve => current.close(resolve)); } return status(); }
  async function invite() { const generation = lifecycle; await start(); if (generation !== lifecycle || !server?.listening) throw new Error('局域网接收已关闭'); pairing = { token: secret(), expiresAt: now() + 120000 }; return { version: 1, type: 'flow-cabin-pair', ...pairing, pin, addresses: status().addresses }; }
  async function pair({ address, pin: remotePin, token, name = '我的小屋' }) {
    const generation = lifecycle, origin = endpoint(address), result = await outbound('pair', origin, remotePin, '/pair', { id: identity.id, name, pin, token });
    if (generation !== lifecycle) throw new Error('配对已取消，请重新生成配对码');
    if (typeof result.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(result.id) || !/^[a-f0-9]{64}$/.test(result.key || '') || result.pin !== remotePin) throw new Error('Invalid peer response');
    state.peers = state.peers.filter(p => p.id !== result.id); state.peers.push({ ...result, name: '已配对小屋', address: origin }); save(); return status();
  }
  async function sync({ peerId, snapshot }) {
    const peer = state.peers.find(p => p.id === peerId); if (!peer?.address) throw new Error('请从已输入另一台地址的设备发起同步');
    const generation = lifecycle, candidate = mergeSnapshots(state.snapshot, snapshot);
    const incoming = await outbound(peerId, peer.address, peer.pin, '/sync', candidate, { id: identity.id, key: peer.key });
    if (generation !== lifecycle || !state.peers.some(current => current.id === peerId && equal(current.key, peer.key))) throw new Error('设备信任已撤销，同步结果未载入');
    state.snapshot = mergeSnapshots(state.snapshot, mergeSnapshots(candidate, incoming)); save(); return state.snapshot;
  }
  function stage(snapshot) { state.snapshot = mergeSnapshots(state.snapshot, snapshot); save(); return state.snapshot; }
  function revoke(id) { lifecycle++; cancelRequests(id); cancelRequests('pair'); state.peers = state.peers.filter(p => p.id !== id); save(); return status(); }
  async function routeLocal(request, route) {
    const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    try {
      const origin = request.headers.get('origin');
      if ((origin && origin !== new URL(request.url).origin) || request.headers.get('sec-fetch-site') === 'cross-site') return json({ error: 'Forbidden' }, 403);
      if (request.method === 'GET' && route === '/status') return json(status());
      if (request.method !== 'POST' || !['/start', '/stop', '/invite', '/pair', '/sync', '/stage', '/revoke'].includes(route)) return json({ error: 'Not found' }, 404);
      if (Number(request.headers.get('content-length')) > MAX) return json({ error: 'Payload too large' }, 413);
      const raw = await request.text(); if (Buffer.byteLength(raw) > MAX) return json({ error: 'Payload too large' }, 413);
      const data = raw ? JSON.parse(raw) : {};
      return json(await ({ '/start': () => start(), '/stop': stop, '/invite': invite, '/pair': () => pair(data), '/sync': () => sync(data), '/stage': () => stage(data), '/revoke': () => revoke(data.id) }[route])());
    } catch (e) { return json({ error: e.message }, 400); }
  }
  return { status, start, stop, invite, pair, sync, stage, revoke, routeLocal };
}
module.exports = { createLanService, pinnedRequest, privateIP, endpoint, signature };
