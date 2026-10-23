'use strict';
// Minimal self-signed RSA X.509. No OS trust store or external OpenSSL executable.
const crypto = require('node:crypto');
const der = (tag, bytes) => { bytes = Buffer.from(bytes); const n = bytes.length; const length = n < 128 ? Buffer.from([n]) : (() => { const hex = n.toString(16).padStart(Math.ceil(n.toString(16).length / 2) * 2, '0'); const b = Buffer.from(hex, 'hex'); return Buffer.concat([Buffer.from([128 + b.length]), b]); })(); return Buffer.concat([Buffer.from([tag]), length, bytes]); };
const seq = (...v) => der(0x30, Buffer.concat(v));
function positiveSerial(bytes) {
  bytes = Buffer.from(bytes);
  let first = 0; while (first < bytes.length && bytes[first] === 0) first++;
  bytes = first === bytes.length ? Buffer.from([1]) : bytes.subarray(first);
  return bytes[0] & 0x80 ? Buffer.concat([Buffer.from([0]), bytes]) : bytes;
}
function createCertificate({ randomBytes = crypto.randomBytes } = {}) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const algorithm = Buffer.from('300d06092a864886f70d01010b0500', 'hex');
  const name = seq(der(0x31, seq(Buffer.from('0603550403', 'hex'), der(0x0c, Buffer.from('Flow Cabin local sync')))));
  const time = date => der(0x17, Buffer.from(date.toISOString().replace(/\D/g, '').slice(2, 14) + 'Z'));
  const serial = positiveSerial(randomBytes(16));
  const tbs = seq(der(2, serial), algorithm, name, seq(time(new Date(Date.now() - 86400000)), time(new Date(Date.now() + 3650 * 86400000))), name, publicKey.export({ type: 'spki', format: 'der' }));
  const cert = seq(tbs, algorithm, der(3, Buffer.concat([Buffer.from([0]), crypto.sign('sha256', tbs, privateKey)])));
  return { key: privateKey.export({ type: 'pkcs8', format: 'pem' }), cert: `-----BEGIN CERTIFICATE-----\n${cert.toString('base64').match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----\n` };
}
module.exports = { createCertificate, positiveSerial };
