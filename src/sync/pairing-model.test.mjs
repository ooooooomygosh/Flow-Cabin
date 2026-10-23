import test from 'node:test';
import assert from 'node:assert/strict';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { parsePairingPayload } from './pairing-model.mjs';
const now = Date.now(), invite = { version: 1, type: 'flow-cabin-pair', pin: 'a'.repeat(64), token: 'b'.repeat(64), expiresAt: now + 120000, addresses: ['https://192.168.1.3:48321'] };
test('locally generated QR round-trips the entire authenticated invitation', () => {
  const qr = QRCode.create(JSON.stringify(invite), { errorCorrectionLevel: 'M' }), scale = 5, margin = 4, size = (qr.modules.size + margin * 2) * scale, pixels = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const xx = Math.floor(x / scale) - margin, yy = Math.floor(y / scale) - margin, on = xx >= 0 && yy >= 0 && xx < qr.modules.size && yy < qr.modules.size && qr.modules.get(yy, xx), index = (y * size + x) * 4; pixels[index] = pixels[index + 1] = pixels[index + 2] = on ? 0 : 255; pixels[index + 3] = 255; }
  const read = jsQR(pixels, size, size); assert.ok(read); assert.deepEqual(parsePairingPayload(read.data, now), invite);
});
test('foreign, expired, oversized and credential-bearing invitations are rejected', () => {
  for (const patch of [{ type: 'foreign' }, { token: 'bad' }, { expiresAt: now }, { expiresAt: now + 3600000 }, { addresses: ['https://user:secret@192.168.1.3:80'] }, { addresses: ['file:///tmp/pair'] }]) assert.throws(() => parsePairingPayload(JSON.stringify({ ...invite, ...patch }), now));
  assert.throws(() => parsePairingPayload(' '.repeat(8193), now));
});
