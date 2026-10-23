const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { createLanService } = require('../lan-service.cjs');
const { cleanCommand, cleanLiveSnapshot } = require('../live-session.cjs');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cabin-live-'));
  const service = createLanService({ directory });
  t.after(async () => { await service.stop(); fs.rmSync(directory, { recursive: true, force: true }); });
  return service;
}
async function local(service, route, body) {
  const response = await service.routeLocal(new Request(`https://cabin.invalid/desktop-sync${route}`, { method: body === undefined ? 'GET' : 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), route);
  const result = await response.json(); if (!response.ok) throw Error(result.error); return result;
}
async function waitFor(read, check) { for (let i = 0; i < 100; i++) { const v = await read(); if (check(v)) return v; await delay(20); } throw Error('No live event received'); }

test('actual pinned WSS carries snapshots, commands and receipts; disconnect never replays a command', async t => {
  const a = fixture(t), b = fixture(t);
  await a.start({ host: '127.0.0.1' }); await b.start({ host: '127.0.0.1' });
  const invite = await a.invite(); await b.pair({ address: a.status().addresses[0], pin: invite.pin, token: invite.token });
  const aid = a.status().id, bid = b.status().id;
  await Promise.all([local(b, '/live/connect', { peerId: aid }), local(b, '/live/connect', { peerId: aid })]);
  await local(a, '/live/publish', { music: { title: '雨天', position: 185, playing: true }, lyrics: { current: '此刻的歌词' }, token: 'DO_NOT_SHARE' });
  const snapshot = await waitFor(() => local(b, '/live/status'), r => r.peers[0]?.snapshot.music.title === '雨天');
  assert.equal(snapshot.peers[0].snapshot.music.position, 185); assert.ok(!JSON.stringify(snapshot).includes('DO_NOT_SHARE'));
  const command = local(b, '/live/send', { peerId: aid, action: 'music.pause' });
  const delivered = await waitFor(() => local(a, '/live/publish', {}), r => r.commands.length === 1);
  assert.equal(delivered.commands[0].action, 'music.pause');
  await local(a, '/live/ack', { peerId: bid, id: delivered.commands[0].id, ok: true, result: '已暂停' });
  assert.equal((await command).result, '已暂停');
  assert.equal((await local(a, '/live/publish', {})).commands.length, 0);
  const uncertain = local(b, '/live/send', { peerId: aid, action: 'music.toggle' });
  const rejected = assert.rejects(uncertain, /中断|关闭|在线/);
  await waitFor(() => local(a, '/live/publish', {}), r => r.commands.length === 1);
  await a.stop(); await rejected;
  assert.equal((await local(b, '/live/status')).connections.length, 0);
  await assert.rejects(local(b, '/live/send', { peerId: aid, action: 'music.play' }), /在线/);
});
test('revocation terminates an established WSS session and clears pending operations', async t => {
  const a=fixture(t),b=fixture(t);await a.start({host:'127.0.0.1'});await b.start({host:'127.0.0.1'});
  const invite=await a.invite();await b.pair({address:a.status().addresses[0],pin:invite.pin,token:invite.token});
  await local(b,'/live/connect',{peerId:a.status().id});a.revoke(b.status().id);
  await waitFor(()=>local(b,'/live/status'),r=>r.connections.length===0);
  await assert.rejects(local(b,'/live/connect',{peerId:a.status().id}),/401/);
});
test('command expiration and allowlists reject stale work and strip paths, credentials and precise locations',()=>{
  assert.throws(()=>cleanCommand({id:'a',action:'music.toggle',expiresAt:1},2),/过期/);
  assert.throws(()=>cleanCommand({id:'a',action:'shell',expiresAt:100},2));
  assert.throws(()=>cleanCommand({id:'a',action:'focus.offer',expiresAt:100,payload:{sessionId:'s',version:0}},2));
  const clean=cleanCommand({id:'a',action:'note.send',expiresAt:100,payload:{text:'笔记',base:'abc',path:'/private/file',token:'SECRET'}},2);
  assert.deepEqual(clean.payload,{text:'笔记',base:'abc'});
  assert.ok(!JSON.stringify(cleanLiveSnapshot({music:{url:'SECRET'},location:{lat:12,lng:123}})).includes('SECRET'));
});
