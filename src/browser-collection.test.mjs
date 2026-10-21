import test from 'node:test';
import assert from 'node:assert/strict';
import { browserCollectionRequest as request, WEB_COLLECTION_KEY, normalizeWebItem } from './browser-collection.mjs';
const memory = () => { const map = new Map(); return { getItem:k => map.get(k) ?? null, setItem:(k,v) => map.set(k,String(v)) }; };
const album = { title:'晚风', artist:'自己', tracks:['慢慢来'], cover:'' };
test('browser collection persists stable IDs, edits and deletion without any server', () => {
  const s=memory(); assert.deepEqual(request('/api/items',{},s),{items:[]});
  const {item}=request('/api/items',{method:'POST',body:album},s);
  assert.match(item.id,/^web-/);assert.equal(request('/api/items',{},s).items[0].id,item.id);
  const changed=request('/api/items?id='+item.id,{method:'PATCH',body:{id:'forbidden',notes:'我的笔记'}},s).item;
  assert.equal(changed.id,item.id);assert.equal(changed.notes,'我的笔记');
  request('/api/items?id='+item.id,{method:'DELETE'},s);assert.equal(request('/api/items',{},s).items.length,0);
});
test('browser writes are transactional and corrupt stored data is never erased', () => {
  const s=memory();request('/api/items',{method:'POST',body:album},s);const before=s.getItem(WEB_COLLECTION_KEY);
  assert.throws(()=>request('/api/items',{method:'POST',body:album},{getItem:s.getItem,setItem(){throw new Error('quota');}}),/原有唱片保持不变/);
  assert.equal(s.getItem(WEB_COLLECTION_KEY),before);
  assert.throws(()=>request('/api/items/import',{method:'POST',body:{items:[album,{}]}},s),/请填写/);
  assert.equal(s.getItem(WEB_COLLECTION_KEY),before);
  assert.throws(()=>request('/api/items/import',{method:'POST',body:{items:Array(2001).fill(album)}},s),/一次最多导入/);
  assert.equal(s.getItem(WEB_COLLECTION_KEY),before);
  s.setItem(WEB_COLLECTION_KEY,'not-json');assert.throws(()=>request('/api/items',{},s),/原有数据未被覆盖/);assert.equal(s.getItem(WEB_COLLECTION_KEY),'not-json');
});
test('backup import keeps IDs, resolves collisions and is idempotent', () => {
  const s=memory();const body={items:[{...album,id:'legacy-id',addedAt:'2025-01-01T00:00:00Z'}]};
  const first=request('/api/items/import',{method:'POST',body},s);assert.equal(first.added,1);assert.equal(first.ids['legacy-id'],'legacy-id');
  assert.equal(request('/api/items/import',{method:'POST',body},s).added,0);
  const second=request('/api/items/import',{method:'POST',body:{items:[{...album,title:'另一张',id:'legacy-id'}]}},s);
  assert.notEqual(second.ids['legacy-id'],'legacy-id');assert.equal(request('/api/items',{},s).items.length,2);
});
test('browser metadata excludes unknown fields and unsafe image URLs', () => {
  const value=normalizeWebItem({...album,secret:'not-stored',cover:'javascript:alert(1)',externalIds:{qqAlbumMid:'catalog-id'}});
  assert.equal(value.secret,undefined);assert.equal(value.cover,'');
  const s=memory();request('/api/items',{method:'POST',body:{...album,collectionId:'123'}},s);
  assert.equal(request('/api/items',{method:'POST',body:{...album,collectionId:'123'}},s).duplicate,true);
  assert.equal(request('/api/items',{},s).items.length,1);
});

test('desktop collection never falls back into browser storage, even after a 404', async () => {
  const names = ['document', 'location', 'localStorage', 'fetch'];
  const saved = names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  const s = memory(); s.setItem(WEB_COLLECTION_KEY, JSON.stringify({items:[{...album,id:'web-only'}]}));
  try {
    Object.defineProperty(globalThis,'document',{configurable:true,value:{documentElement:{dataset:{desktopClient:'true'}}}});
    Object.defineProperty(globalThis,'location',{configurable:true,value:{protocol:'https:'}});
    Object.defineProperty(globalThis,'localStorage',{configurable:true,value:s});
    let called = 0;
    globalThis.fetch = async () => { called++; return new Response(JSON.stringify({error:'native unavailable'}),{status:404}); };
    const api = await import('./collection-api.mjs?native-routing-test');
    assert.equal(api.usesBrowserCollection(),false);
    await assert.rejects(api.listItems(),/native unavailable/);
    assert.equal(called,1);
    assert.equal(JSON.parse(s.getItem(WEB_COLLECTION_KEY)).items[0].id,'web-only');
    globalThis.fetch = async () => new Response(JSON.stringify({items:[{id:'native-record'}]}));
    assert.equal((await api.listItems())[0].id,'native-record');
    document.documentElement.dataset.desktopClient = 'false';
    assert.equal(api.usesBrowserCollection(),true);
    assert.equal((await api.listItems())[0].id,'web-only');
  } finally {
    for (const [name, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis,name,descriptor); else delete globalThis[name]; }
  }
});
