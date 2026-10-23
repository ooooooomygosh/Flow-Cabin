import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { PNG } from 'pngjs'

// Installs an ImageGen-repaired sprite in its existing atlas cell. The only
// image transforms are alpha trimming, nearest-neighbor fitting and packing.
const [theme, id, input, archive, promptPath, contextPath] = process.argv.slice(2)
if (!promptPath) throw new Error('Usage: node scripts/art-v21/replace-furniture-frame.mjs <theme> <frame-id> <ImageGen-png> <archive-directory> <prompt-file>')
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const dir = path.join(repo, 'public/room-scenes/v21/furniture', theme)
const sourceDir = path.join(archive, 'sources', theme)
const manifestPath = path.join(dir, 'manifest.json')
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
const archivedManifestPath = path.join(sourceDir, 'manifest.json')
const archivedManifest = JSON.parse(fs.readFileSync(archivedManifestPath, 'utf8'))
const frame = manifest.frames[id], previous = archivedManifest.frames[id]
if (!frame || !previous) throw new Error(`Unknown frame: ${theme}/${id}`)
if (frame.sourceOverride) throw new Error(`Frame already repaired: ${theme}/${id}`)
const revision = path.join(archive, 'repairs', theme, id)
fs.mkdirSync(revision, { recursive: true })
fs.copyFileSync(input, path.join(revision, 'source.png'))
fs.copyFileSync(promptPath, path.join(revision, 'prompt.txt'))
fs.copyFileSync(path.join(sourceDir, previous.sprite), path.join(revision, 'before.png'))
fs.writeFileSync(path.join(revision, 'before-frame.json'), `${JSON.stringify(previous, null, 2)}\n`)
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const sourceBytes = fs.readFileSync(input), source = PNG.sync.read(sourceBytes)
let x0 = source.width, y0 = source.height, x1 = -1, y1 = -1
for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) if (source.data[(y * source.width + x) * 4 + 3] >= 32) {
  x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y)
}
if (x1 < 0) throw new Error('Empty repair source')
x0 = Math.max(0, x0 - 3); y0 = Math.max(0, y0 - 3)
x1 = Math.min(source.width - 1, x1 + 3); y1 = Math.min(source.height - 1, y1 + 3)
const sw = x1 - x0 + 1, sh = y1 - y0 + 1
const border = 4, scale = Math.min((previous.frame[2] - border * 2) / sw, (frame.cell[3] - 24 - border * 2) / sh, 1)
const width = Math.round(sw * scale), height = Math.round(sh * scale)
const sprite = new PNG({ width: width + border * 2, height: height + border * 2 })
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  const sx = x0 + Math.min(sw - 1, Math.floor((x + 0.5) * sw / width)), sy = y0 + Math.min(sh - 1, Math.floor((y + 0.5) * sh / height))
  source.data.copy(sprite.data, ((y + border) * sprite.width + x + border) * 4, (sy * source.width + sx) * 4, (sy * source.width + sx) * 4 + 4)
}
const originalAtlasPath = path.join(sourceDir, previous.file)
const atlas = PNG.sync.read(fs.readFileSync(originalAtlasPath))
const [cellX, cellY, cellWidth, cellHeight] = frame.cell
for (let y = cellY; y < cellY + cellHeight; y++) atlas.data.fill(0, (y * atlas.width + cellX) * 4, (y * atlas.width + cellX + cellWidth) * 4)
const dx = cellX + Math.floor((cellWidth - sprite.width) / 2), dy = cellY + cellHeight - 12 - sprite.height
PNG.bitblt(sprite, atlas, 0, 0, sprite.width, sprite.height, dx, dy)
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-cabin-furniture-repair-'))
const packedPng = path.join(temporary, 'atlas.png'), packedWebp = path.join(temporary, 'atlas.webp'), roundtripPng = path.join(temporary, 'roundtrip.png')
const atlasBytes = PNG.sync.write(atlas)
fs.writeFileSync(packedPng, atlasBytes)
for (const [binary, args] of [['cwebp', ['-quiet', '-lossless', '-exact', '-m', '6', '-q', '100', packedPng, '-o', packedWebp]], ['dwebp', ['-quiet', packedWebp, '-o', roundtripPng]]]) {
  const result = spawnSync(binary, args)
  if (result.status !== 0) throw new Error(`${binary}: ${result.stderr}`)
}
const decoded = PNG.sync.read(fs.readFileSync(roundtripPng)), webpBytes = fs.readFileSync(packedWebp)
if (!decoded.data.equals(atlas.data)) throw new Error('WebP roundtrip changed pixels')
const context = contextPath ? JSON.parse(fs.readFileSync(contextPath, 'utf8')) : null
const sourceOverride = { generator: 'image_gen.imagegen', sourceOrigin: path.basename(input), sourceSha256: sha(sourceBytes), sourceDimensions: [source.width, source.height], sourceRect: [x0, y0, sw, sh], fit: 'nearest-neighbor', packedDimensions: [sprite.width, sprite.height], repair: context?.repair || 'Complete previously clipped rug fringe and restore transparent margin.', ...(context ? { imageGenOriginal: context } : {}) }
frame.frame = [dx, dy, sprite.width, sprite.height]
frame.sourceRect = [x0, y0, sw, sh]
frame.sourceOverride = sourceOverride
if (frame.type === 'weather' && id.endsWith('-se') && context?.orientation) {
  frame.blankRect = { x: 0.28, y: 0.36, width: 0.55, height: 0.24 }
  frame.blankQuad = [[0.25, 0.44], [0.88, 0.25], [0.88, 0.59], [0.25, 0.79]]
}
archivedManifest.frames[id] = { ...frame, file: previous.file, sprite: previous.sprite }
const provenancePath = path.join(repo, 'scripts/art-v21/furniture-provenance.json')
const provenance = JSON.parse(fs.readFileSync(provenancePath, 'utf8'))
const record = provenance.themes[theme].sources.find(item => item.atlas === frame.file)
record.frameOverrides = [...(record.frameOverrides || []), { id, ...sourceOverride, prompt: fs.readFileSync(promptPath, 'utf8') }]
fs.writeFileSync(originalAtlasPath, atlasBytes)
fs.writeFileSync(path.join(sourceDir, previous.sprite), PNG.sync.write(sprite))
fs.copyFileSync(packedWebp, path.join(dir, frame.file))
for (const [file, value] of [[manifestPath, manifest], [archivedManifestPath, archivedManifest], [provenancePath, provenance]]) fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
const reportPath = path.join(archive, 'lossless-webp-report.json')
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
const encoded = report.files.find(item => item.theme === theme && item.file === frame.file)
Object.assign(encoded, { rgbaIdentical: true, pngBytes: atlasBytes.length, webpBytes: webpBytes.length, pngSha256: sha(atlasBytes), webpSha256: sha(webpBytes), rgbaSha256: sha(atlas.data), repairs: [...(encoded.repairs || []), id] })
const files = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)])
report.themes[theme].bytes = files(dir).reduce((sum, file) => sum + fs.statSync(file).size, 0)
report.afterBytes = Object.values(report.themes).reduce((sum, result) => sum + result.bytes, 0)
report.reductionPercent = Number((100 * (1 - report.afterBytes / report.beforeBytes)).toFixed(2))
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
fs.rmSync(temporary, { recursive: true, force: true })
console.log(JSON.stringify({ theme, id, frame: frame.frame, sourceOverride, rgbaIdentical: true }))
