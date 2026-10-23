import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { PNG } from 'pngjs'

// Repackages generated artwork without changing a single RGBA pixel. Source
// art, prompts, atlas configurations and individual sprites remain archived.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const root = path.join(repo, 'public/room-scenes/v21/furniture')
const archive = process.argv[2] && path.resolve(process.argv[2])
if (!archive) throw new Error('Usage: node scripts/art-v21/optimize-furniture-assets.mjs <archive-directory>')
const themes = ['pixel', 'warm', 'night-study', 'forest', 'seaside', 'starlight', 'rain-train', 'greenhouse']
const independent = new Set(['plant-se', 'tea-se'])
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const webp = name => name.replace(/\.png$/, '.webp')
const run = (binary, args) => new Promise((resolve, reject) => {
  const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] })
  let stderr = ''
  child.stderr.on('data', chunk => { stderr += chunk })
  child.on('error', reject)
  child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${binary}: ${stderr}`)))
})
const files = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const location = path.join(directory, entry.name)
  return entry.isDirectory() ? files(location) : [location]
})
const totalBytes = directory => files(directory).reduce((sum, file) => sum + fs.statSync(file).size, 0)

fs.mkdirSync(archive, { recursive: true })
const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-cabin-furniture-webp-'))
const report = { generatedAt: new Date().toISOString(), codec: 'libwebp cwebp -lossless -exact -m 6 -q 100', verification: 'Every decoded WebP RGBA byte equals the corresponding packed PNG byte.', beforeBytes: totalBytes(root), files: [], themes: {} }
const jobs = []
const manifests = new Map()
const provenance = { version: 1, generator: 'image_gen.imagegen', note: 'All artwork is generated with transparent backgrounds. Packing crops and arranges original pixels; no recolor, bitmap mirroring or rotation. Four weather symbols per theme are direction invariant. Source PNG files and packing inputs are archived outside the runtime package.', themes: {} }

for (const theme of themes) {
  const dir = path.join(root, theme)
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'))
  if (Object.values(manifest.frames).some(frame => !frame.file.endsWith('.png'))) throw new Error(`Already optimized: ${theme}`)
  const archived = path.join(archive, 'sources', theme)
  if (fs.existsSync(archived)) throw new Error(`Refusing to overwrite existing source archive: ${archived}`)
  fs.cpSync(dir, archived, { recursive: true })
  const needed = new Set(Object.keys(manifest.atlases))
  for (const id of independent) {
    if (!manifest.frames[id]?.sprite) throw new Error(`Missing standalone sprite: ${theme}/${id}`)
    needed.add(manifest.frames[id].sprite)
  }
  for (const name of needed) jobs.push({ theme, name, input: path.join(dir, name), output: path.join(staging, theme, webp(name)) })
  manifests.set(theme, manifest)
  provenance.themes[theme] = { title: manifest.title, style: manifest.style, sources: [] }
  for (const [name, atlas] of Object.entries(manifest.atlases)) {
    const prompt = fs.readFileSync(path.join(dir, atlas.promptFile), 'utf8')
    provenance.themes[theme].sources.push({ atlas: webp(name), origin: atlas.sourceOrigin, sha256: atlas.sourceSha256, sourceDimensions: [atlas.sourceWidth, atlas.sourceHeight], prompt })
  }
}

let next = 0
await Promise.all(Array.from({ length: 4 }, async () => {
  while (next < jobs.length) {
    const job = jobs[next++]
    fs.mkdirSync(path.dirname(job.output), { recursive: true })
    await run('cwebp', ['-quiet', '-lossless', '-exact', '-m', '6', '-q', '100', job.input, '-o', job.output])
    const decodedPath = `${job.output}.roundtrip.png`
    await run('dwebp', ['-quiet', job.output, '-o', decodedPath])
    const originalBytes = fs.readFileSync(job.input), outputBytes = fs.readFileSync(job.output)
    const original = PNG.sync.read(originalBytes), decoded = PNG.sync.read(fs.readFileSync(decodedPath))
    if (original.width !== decoded.width || original.height !== decoded.height || !original.data.equals(decoded.data)) throw new Error(`Lossless verification failed: ${job.theme}/${job.name}`)
    fs.unlinkSync(decodedPath)
    report.files.push({ theme: job.theme, file: webp(job.name), width: original.width, height: original.height, rgbaIdentical: true, pngBytes: originalBytes.length, webpBytes: outputBytes.length, pngSha256: sha(originalBytes), webpSha256: sha(outputBytes), rgbaSha256: sha(original.data) })
  }
}))

// Publish only after every conversion has passed the pixel-for-pixel roundtrip.
for (const theme of themes) {
  const dir = path.join(root, theme), manifest = manifests.get(theme)
  for (const job of jobs.filter(job => job.theme === theme)) fs.copyFileSync(job.output, path.join(dir, webp(job.name)))
  manifest.atlases = Object.fromEntries(Object.entries(manifest.atlases).map(([name, atlas]) => {
    const { source, promptFile, ...metadata } = atlas
    return [webp(name), { ...metadata, encoding: 'lossless-webp', originalRgbaPreserved: true }]
  }))
  for (const [id, frame] of Object.entries(manifest.frames)) {
    frame.file = webp(frame.file)
    if (independent.has(id)) frame.sprite = webp(frame.sprite)
    else delete frame.sprite
  }
  manifest.provenance = { catalog: 'scripts/art-v21/furniture-provenance.json', archiveGroup: `art-v21-furniture/sources/${theme}`, sourceFilesAreRuntimeAssets: false }
  manifest.packaging = { format: 'lossless-webp', exactRgbaRoundtrip: true, standaloneSprites: [...independent], weatherAliases: ['sun', 'moon', 'cloud', 'rain'] }
  fs.writeFileSync(path.join(dir, 'manifest.json.tmp'), `${JSON.stringify(manifest, null, 2)}\n`)
  fs.renameSync(path.join(dir, 'manifest.json.tmp'), path.join(dir, 'manifest.json'))
  for (const file of files(dir)) {
    if (file.endsWith('.png') || /\/(?:source-[^/]+\.json|prompt-[^/]+\.txt)$/.test(file)) fs.unlinkSync(file)
  }
  report.themes[theme] = { frames: Object.keys(manifest.frames).length, physicalSprites: new Set(Object.values(manifest.frames).map(frame => `${frame.file}:${frame.frame.join(',')}`)).size, atlases: Object.keys(manifest.atlases).length, standaloneSprites: [...independent], bytes: totalBytes(dir) }
}
report.files.sort((a, b) => `${a.theme}/${a.file}`.localeCompare(`${b.theme}/${b.file}`))
report.afterBytes = totalBytes(root)
report.reductionPercent = Number((100 * (1 - report.afterBytes / report.beforeBytes)).toFixed(2))
fs.writeFileSync(path.join(repo, 'scripts/art-v21/furniture-provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`)
fs.writeFileSync(path.join(archive, 'lossless-webp-report.json'), `${JSON.stringify(report, null, 2)}\n`)
fs.rmSync(staging, { recursive: true, force: true })
console.log(JSON.stringify({ convertedAndVerified: report.files.length, beforeBytes: report.beforeBytes, afterBytes: report.afterBytes, reductionPercent: report.reductionPercent, themes: report.themes }))
