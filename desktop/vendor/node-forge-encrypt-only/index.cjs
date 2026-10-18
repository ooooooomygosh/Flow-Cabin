'use strict';
// NeteaseCloudMusicApi uses forge only to encrypt a short session key with its
// embedded RSA public key. This package keeps that exact call shape without
// shipping forge's unused certificate/signature parsers.
const crypto = require('node:crypto');

function publicKeyFromPem(pem) {
  const key = crypto.createPublicKey({ key: pem, format: 'pem', type: 'spki' });
  return {
    encrypt(value, scheme) {
      if (scheme !== 'NONE' && scheme !== 'RSA_PKCS1') throw new Error('Only RSA PKCS#1 public encryption is supported');
      return crypto.publicEncrypt({ key, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(String(value), 'utf8')).toString('latin1');
    }
  };
}

function bytesToHex(value) {
  return Buffer.from(value, 'latin1').toString('hex');
}

module.exports = { pki: { publicKeyFromPem }, util: { bytesToHex } };
