import assert from 'node:assert/strict';
import test from 'node:test';
import { hasViteLocalOrigin } from './vite-readiness.mjs';

const origin = 'http://127.0.0.1:4179';
test('recognizes plain and CI ANSI-decorated Vite Local output', () => {
  assert.equal(hasViteLocalOrigin('VITE ready in 165 ms\n  ➜  Local:   ' + origin + '/\n', origin), true);
  const chunks = ['\u001b[32m➜\u001b[39m  \u001b[1mLocal\u001b[22', 'm:   \u001b[36mhttp://127.0.0.1:\u001b[1m41', '79\u001b[22m/\u001b[39m\n'];
  assert.equal(hasViteLocalOrigin(chunks[0], origin), false);
  assert.equal(hasViteLocalOrigin(chunks.join(''), origin), true);
});
test('requires the exact origin on the child Local line', () => {
  for (const output of [
    'VITE ready in 165 ms',
    'Local: http://127.0.0.1:4180/\nNetwork: ' + origin,
    'Local:\n' + origin,
    'Network: ' + origin,
    'Local: ' + origin + '0/',
    'Local: ' + origin + '/unrelated',
  ]) assert.equal(hasViteLocalOrigin(output, origin), false, output);
});
