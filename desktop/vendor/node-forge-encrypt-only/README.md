# node-forge encrypt-only compatibility layer

This local package exists only because NeteaseCloudMusicApi declares the
general-purpose `node-forge` package but its production path uses only
`pki.publicKeyFromPem(...).encrypt(text, 'NONE')` and `util.bytesToHex`.

Flow Cabin replaces the runtime resolution with this small adapter backed by
Node's audited OpenSSL binding. It deliberately implements no certificate or
signature-verification APIs. The adapter is covered by the desktop crypto
regression; replacing it with another implementation requires verifying the
Netease request signature and the supported Node versions.
