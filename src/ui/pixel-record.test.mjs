import assert from 'node:assert/strict';
import test from 'node:test';
import { RECORD_PX, recordPixels } from './pixel-record.mjs';

const at = (px, x, y) => [...px.slice((y * RECORD_PX + x) * 4, (y * RECORD_PX + x) * 4 + 4)];
const hex = (rgba) => '#' + rgba.slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('');
const colours = (px) => { const set = new Set(); for (let i = 0; i < px.length; i += 4) if (px[i + 3]) set.add(hex([...px.slice(i, i + 4)])); return set; };

test('pixel record: a round disc with a transparent outside, a hole and the label in the cover colour', () => {
  const px = recordPixels({ base: '#16191d', label: '#df9b68', seed: 'x' }), c = RECORD_PX / 2;
  assert.equal(px.length, RECORD_PX * RECORD_PX * 4);
  for (const [x, y] of [[0, 0], [RECORD_PX - 1, 0], [0, RECORD_PX - 1], [RECORD_PX - 1, RECORD_PX - 1]]) assert.equal(at(px, x, y)[3], 0, 'corners are clear');
  assert.equal(hex(at(px, c, c)), '#0d0805', 'spindle hole');
  assert.equal(hex(at(px, c + 6, c)), '#df9b68', 'label carries the cover colour');
  assert.equal(at(px, c, 1)[3], 255, 'disc reaches the edge');
});
test('pixel record: deterministic per record, honours splatter colours, transparency and the lamp side', () => {
  const style = { base: '#16191d', label: '#355d6a', splatter: true, splashes: ['#dba746', '#efe3c1', '#9f3d2e'], seed: 'album' };
  assert.deepEqual(recordPixels(style), recordPixels(style));
  assert.notDeepEqual(recordPixels(style), recordPixels({ ...style, seed: 'other' }));
  const splashed = colours(recordPixels(style)), plain = colours(recordPixels({ ...style, splatter: false }));
  for (const colour of style.splashes) { assert.ok(splashed.has(colour), `${colour} thrown`); assert.ok(!plain.has(colour)); }
  const clear = recordPixels({ ...style, splatter: false, opacity: 50 });
  assert.equal(at(clear, 4, RECORD_PX / 2)[3], 128, 'vinyl takes the chosen transparency'); assert.equal(at(clear, RECORD_PX / 2 + 6, RECORD_PX / 2)[3], 255, 'label stays opaque');
  // The rim facing the top-left lamp is lighter than the rim facing away from it.
  const lum = ([r, g, b]) => r * .3 + g * .59 + b * .11, rim = recordPixels({ base: '#16191d', label: '#fff', seed: 'r' });
  assert.ok(lum(at(rim, 8, 8)) > lum(at(rim, RECORD_PX - 9, RECORD_PX - 9)));
});
