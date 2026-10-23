'use strict';
// NCM main.js eagerly imports every endpoint and its unused Express server.
// Preserve its endpoint wrapper exactly, but load each endpoint on demand in
// the mobile runtime. Requests/crypto remain the same Portable dependency files.
const fs = require('node:fs'), path = require('node:path');
const base = path.dirname(require.resolve('NeteaseCloudMusicApi/package.json'));
const { cookieToJson } = require(path.join(base, 'util'));
const table = {}, modules = new Map(); let request;
for (const file of fs.readdirSync(path.join(base, 'module')).reverse()) {
  if (!file.endsWith('.js')) continue; const name = file.split('.')[0];
  table[name] = (data = {}) => {
    if (!modules.has(name)) modules.set(name, require(path.join(base, 'module', file)));
    const cookie = typeof data.cookie === 'string' ? cookieToJson(data.cookie) : data.cookie || {};
    return modules.get(name)({ ...data, cookie }, async (...args) => { request ||= require(path.join(base, 'util/request')); return request(...args); });
  };
}
module.exports = table;
