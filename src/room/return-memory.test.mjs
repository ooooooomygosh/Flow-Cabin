import test from 'node:test';
import assert from 'node:assert/strict';
import { returnMemory } from './return-memory.mjs';
test('return note uses the latest real round and does not invent an album', () => {
  assert.equal(returnMemory([]), null);
  assert.equal(returnMemory([{start:1,end:10,durationMs:9}]), null);
  const last = { start:1000,end:61000,durationMs:60000,album:{title:'晚风'} };
  assert.match(returnMemory([last]).title, /晚风/);
  assert.match(returnMemory([last,{start:100000,end:220000,durationMs:120000}]).title, /2 分钟/);
  assert.match(returnMemory([last]).detail, /1 分钟/);
});
