// Optional UI-driven equivalent of playback-regression.mjs for an existing
// cloud browser. All fixtures stay on loopback and contain only silent PCM.
import { createServer } from 'vite';
import { execFileSync } from 'node:child_process';
const baseline = process.env.PLAYBACK_BASELINE === '1';
const original = baseline ? execFileSync('git', ['show', 'HEAD:src/useRoomPlayback.jsx'], { encoding: 'utf8' }) : null;
const wav = Buffer.alloc(44 + 8000 * 2 * 60);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
const server = await createServer({ server: { host: '127.0.0.1', port: Number(process.env.PLAYBACK_PORT || 4185), strictPort: true }, plugins: [{ name: 'silent-playback-fixture', enforce: 'pre', load(id) { if (original && id.endsWith('/src/useRoomPlayback.jsx')) return original; }, configureServer(server) { server.middlewares.use(async (req, res, next) => { if (req.url === '/desktop-music/resolve') { let body = ''; for await (const chunk of req) body += chunk; const { id } = JSON.parse(body); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ audioPath: `/fixture-audio/${id}` })); } else if (req.url.startsWith('/fixture-audio/')) { res.setHeader('Content-Type', 'audio/wav'); res.end(wav); } else next(); }); } }] });
await server.listen(); server.printUrls(); console.log(baseline ? 'Baseline main playback' : 'Working-tree playback');
