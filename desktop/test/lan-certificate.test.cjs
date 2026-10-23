'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createCertificate, positiveSerial } = require('../lan-certificate.cjs');
test('DER positive certificate serials use minimal sign padding and never encode zero', () => {
  for (const [input, expected] of [['000001', '01'], ['00007f', '7f'], ['0080', '0080'], ['80', '0080'], ['ff', '00ff'], ['0000', '01'], ['', '01']]) assert.equal(positiveSerial(Buffer.from(input, 'hex')).toString('hex'), expected);
  for (let second = 0; second < 256; second++) {
    const serial = positiveSerial(Buffer.from([0, second, 1]));
    assert.ok(serial[0] < 128); assert.ok(serial.length === 1 || serial[0] !== 0 || serial[1] >= 128);
  }
});
test('fixed random inputs reproduce every previous illegal-padding edge and produce parseable self-signed X509 certificates', () => {
  for (const bytes of [Buffer.alloc(16), Buffer.from('00000100000000000000000000000000', 'hex'), Buffer.from('00800100000000000000000000000000', 'hex'), Buffer.alloc(16, 255)]) {
    const original = Buffer.from(bytes), value = createCertificate({ randomBytes: () => bytes });
    const cert = new crypto.X509Certificate(value.cert);
    assert.ok(cert.verify(cert.publicKey)); assert.ok(cert.checkPrivateKey(crypto.createPrivateKey(value.key)));
    assert.deepEqual(bytes, original, 'serial encoding must not modify the supplied randomness');
    assert.notEqual(cert.serialNumber, '00');
  }
});
