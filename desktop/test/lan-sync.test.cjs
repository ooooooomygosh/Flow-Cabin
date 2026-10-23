'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const https = require('node:https');
const { createLanService, pinnedRequest, endpoint } = require('../lan-service.cjs');
const { emptySnapshot, mergeSnapshots, digest } = require('../lan-model.cjs');
const record = (id, value, device = 'a', rev = 1) => ({ id, rev, device, at: 12345, deleted: false, value });
const snapshot = () => ({ version: 1, notes: [record('note', { body: '我的手记' })], layouts: [record('warm', { theme: 'warm', items: [{ id: 'deck', x: 24 }] })], focus: [record('session-1', { start: 1, end: 100, completed: true })] });
function fixture(t, clock = Date.now) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cabin-lan-'));
  const service = createLanService({ directory, now: clock });
  t.after(async () => { await service.stop(); fs.rmSync(directory, { recursive: true, force: true }); }); return service;
}
test('two actual HTTPS instances pair with certificate pinning, sync all three domains, then revoke trust', async t => {
  const a = fixture(t), b = fixture(t);
  await a.start({ host: '127.0.0.1' }); await b.start({ host: '127.0.0.1' });
  const invite = await a.invite(), address = a.status().addresses[0];
  await assert.rejects(b.pair({ address, pin: '0'.repeat(64), token: invite.token }), /指纹/);
  await b.pair({ address, pin: invite.pin, token: invite.token });
  assert.equal(a.status().peers.length, 1); assert.equal(b.status().peers.length, 1);
  await assert.rejects(pinnedRequest(address, invite.pin, '/pair', { id: 'other', pin: b.status().pin, token: invite.token }), /配对码/);
  a.stage(snapshot());
  const merged = await b.sync({ peerId: a.status().id, snapshot: emptySnapshot() });
  assert.deepEqual(merged, snapshot());
  assert.deepEqual(await b.sync({ peerId: a.status().id, snapshot: merged }), merged);
  a.revoke(b.status().id);
  await assert.rejects(b.sync({ peerId: a.status().id, snapshot: merged }), /撤销/);
});
test('pairing token expires after 120 seconds and never grants trust', async t => {
  let clock = 1000000; const a = fixture(t, () => clock), b = fixture(t);
  const invite = await a.invite(); clock += 120001;
  await assert.rejects(b.pair({ address: a.status().addresses[0], pin: invite.pin, token: invite.token }), /过期/);
  assert.equal(a.status().peers.length, 0);
});
test('parallel edits create stable conflict copies, causal edits replace, tombstones prevent resurrection, focus IDs deduplicate', () => {
  const first = snapshot(), next = snapshot();
  next.notes[0] = record('note', { body: '另一台修改' }, 'b', 2);
  const merged = mergeSnapshots(first, next);
  assert.equal(merged.notes.length, 2); assert.equal(merged.focus.length, 1);
  assert.deepEqual(mergeSnapshots(next, first), merged);
  assert.deepEqual(mergeSnapshots(merged, next), merged);
  const causal = snapshot(); causal.notes[0] = { ...next.notes[0], base: digest(first.notes[0]) };
  assert.equal(mergeSnapshots(first, causal).notes.length, 1);
  const deleted = emptySnapshot(); deleted.notes = [{ id: 'note', device: 'a', rev: 3, at: 20000, deleted: true }];
  assert.equal(mergeSnapshots(deleted, next).notes[0].deleted, true);
});
test('reject public destinations, arbitrary paths and credentials before making a network connection', () => {
  for (const url of ['https://8.8.8.8:443', 'http://192.168.1.2:80', 'https://example.com', 'https://u:p@127.0.0.1', 'https://127.0.0.1/secret', 'https://127.0.0.1/?token=x']) assert.throws(() => endpoint(url));
});
test('HTTPS listener rejects browser-origin requests, cookie forwarding, unauthenticated sync and oversized bodies', async t => {
  const a = fixture(t); await a.start({ host: '127.0.0.1' }); const base = a.status().addresses[0];
  const send = headers => new Promise((resolve, reject) => {
    const req = https.request(base + '/sync', { method: 'POST', rejectUnauthorized: false, headers: { 'Content-Type': 'application/json', ...headers } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); }); req.on('error', reject); req.end('{}');
  });
  assert.equal(await send({ Origin: 'https://evil.example' }), 403);
  assert.equal(await send({ Cookie: 'session=secret' }), 403);
  assert.equal(await send({}), 401);
  assert.equal(await send({ 'Content-Length': 9 * 1024 * 1024 }), 413);
});
test('malformed remote sync cannot overwrite persisted canonical state', async t => {
  const a = fixture(t), b = fixture(t); const invite = await a.invite();
  await b.pair({ address: a.status().addresses[0], pin: invite.pin, token: invite.token });
  a.stage(snapshot());
  await assert.rejects(b.sync({ peerId: a.status().id, snapshot: { version: 1, notes: [{ id: 'bad' }], layouts: [], focus: [] } }));
  assert.deepEqual(a.stage(emptySnapshot()), snapshot());
});
test('signed HTTPS sync rejects tampered bodies and nonce replay; unauthenticated pairing is rate limited', async t => {
  const { signature } = require('../lan-service.cjs');
  const a = fixture(t), invite = await a.invite(), base = a.status().addresses[0], id = 'test-peer';
  const trusted = await pinnedRequest(base, invite.pin, '/pair', { id, pin: invite.pin, token: invite.token });
  const body = JSON.stringify(emptySnapshot()), nonce = `${Date.now()}:${'a'.repeat(64)}`;
  const send = payload => new Promise((resolve, reject) => {
    const req = https.request(base + '/sync', { method: 'POST', rejectUnauthorized: false, headers: { 'content-type': 'application/json', 'x-cabin-device': id, 'x-cabin-nonce': nonce, 'x-cabin-signature': signature(trusted.key, 'POST', '/sync', nonce, body) } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); }); req.on('error', reject); req.end(payload);
  });
  assert.equal(await send(body + ' '), 401); assert.equal(await send(body), 200); assert.equal(await send(body), 401);
  for (let i = 0; i < 27; i++) { try { await pinnedRequest(base, invite.pin, '/pair', { token: 'wrong' }); } catch {} }
  await assert.rejects(pinnedRequest(base, invite.pin, '/pair', { token: 'wrong' }), /Too many/);
});
test('virtual-origin local control rejects cross-origin forms before enabling listener', async t => {
  const a = fixture(t);
  const response = await a.routeLocal(new Request('https://cabin.invalid/desktop-sync/start', { method: 'POST', headers: { origin: 'https://attacker.invalid' }, body: '{}' }), '/start');
  assert.equal(response.status, 403); assert.equal(a.status().enabled, false);
});
async function adversary(t, handler) {
  const crypto = require('node:crypto'), { createCertificate } = require('../lan-certificate.cjs'), material = createCertificate();
  const pin = crypto.createHash('sha256').update(new crypto.X509Certificate(material.cert).raw).digest('hex');
  const server = https.createServer(material, handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  return { server, pin, address: `https://127.0.0.1:${server.address().port}` };
}
test('an adversarial HTTPS endpoint sees ZERO HTTP requests on wrong pin, for both pairing token and signed sync', async t => {
  let count = 0;
  const remote = await adversary(t, (req, res) => { count++; req.resume(); res.end('{}'); });
  await assert.rejects(pinnedRequest(remote.address, '0'.repeat(64), '/pair', { token: 'private-pair-token' }), /指纹/);
  await assert.rejects(pinnedRequest(remote.address, '0'.repeat(64), '/sync', snapshot(), { id: 'private-device', key: 'a'.repeat(64) }), /指纹/);
  assert.equal(count, 0, 'pinning must complete before any HTTP request is constructed or flushed');
  await pinnedRequest(remote.address, remote.pin, '/sync', {});
  assert.equal(count, 1, 'a correctly pinned connection reaches the same observer');
});
test('revoking trust cancels an in-flight signed HTTPS request and late data cannot be applied', async t => {
  const local = fixture(t), id = 'delayed-peer', key = 'b'.repeat(64); let release, observed;
  const received = new Promise(resolve => { observed = resolve; });
  const remote = await adversary(t, (req, res) => {
    req.resume(); if (req.url === '/pair') { res.end(JSON.stringify({ id, key, pin: remote.pin })); return; }
    release = () => res.end(JSON.stringify(snapshot())); observed();
  });
  await local.pair({ address: remote.address, pin: remote.pin, token: 'fixture-token' });
  const pending = local.sync({ peerId: id, snapshot: emptySnapshot() }); const rejected = assert.rejects(pending);
  await received; local.revoke(id); release(); await rejected;
  assert.deepEqual(local.stage(emptySnapshot()), emptySnapshot()); assert.equal(local.status().peers.length, 0);
});
test('stopping LAN cancels a pending pairing and cannot restore trust after a late response', async t => {
  const local = fixture(t); let release, observed; const received = new Promise(resolve => { observed = resolve; });
  const remote = await adversary(t, (req, res) => { req.resume(); release = () => res.end(JSON.stringify({ id: 'late-peer', key: 'c'.repeat(64), pin: remote.pin })); observed(); });
  const pending = local.pair({ address: remote.address, pin: remote.pin, token: 'fixture-token' }), rejected = assert.rejects(pending);
  await received; await local.stop(); release(); await rejected;
  assert.equal(local.status().enabled, false); assert.equal(local.status().peers.length, 0);
});
test('restored trust stays private and listener stays disabled; stopping during listener startup remains disabled', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cabin-lan-restore-'));
  const a = createLanService({ directory }), b = fixture(t);
  try {
    const invite = await a.invite(); await b.pair({ address: a.status().addresses[0], pin: invite.pin, token: invite.token }); await a.stop();
    if (process.platform !== 'win32') { fs.chmodSync(directory, 0o777); fs.chmodSync(path.join(directory, 'identity.json'), 0o666); fs.chmodSync(path.join(directory, 'state.json'), 0o666); }
    const restored = createLanService({ directory });
    try {
      assert.equal(restored.status().enabled, false); assert.equal(restored.status().peers.length, 1);
      assert.equal(restored.status().peers[0].key, undefined);
      if (process.platform !== 'win32') { assert.equal(fs.statSync(directory).mode & 0o777, 0o700); for (const name of ['identity.json', 'state.json']) assert.equal(fs.statSync(path.join(directory, name)).mode & 0o777, 0o600); }
      const started = restored.start({ host: '127.0.0.1' }), stopped = restored.stop(); await Promise.all([started, stopped]);
      assert.equal(restored.status().enabled, false);
    } finally { await restored.stop(); }
  } finally { await a.stop(); fs.rmSync(directory, { recursive: true, force: true }); }
});
test('signed timestamps prevent replay after the nonce cache has expired', async t => {
  const { signature } = require('../lan-service.cjs'); let clock = Date.now();
  const a = fixture(t, () => clock), invite = await a.invite(), base = a.status().addresses[0], id = 'time-peer';
  const trusted = await pinnedRequest(base, invite.pin, '/pair', { id, pin: invite.pin, token: invite.token });
  const body = JSON.stringify(emptySnapshot()), nonce = `${clock}:${'d'.repeat(64)}`;
  const send = () => new Promise((resolve, reject) => {
    const req = https.request(base + '/sync', { method: 'POST', rejectUnauthorized: false, headers: { 'content-type': 'application/json', 'x-cabin-device': id, 'x-cabin-nonce': nonce, 'x-cabin-signature': signature(trusted.key, 'POST', '/sync', nonce, body) } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); }); req.on('error', reject); req.end(body);
  });
  assert.equal(await send(), 200); clock += 120001;
  assert.equal(await send(), 401, 'an expired captured request remains invalid after nonce eviction');
});
