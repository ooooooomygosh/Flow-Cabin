import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { PNG } from 'pngjs'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const root = path.join(repo, 'public/room-scenes/v21/furniture')
const archive = process.argv[2] && path.resolve(process.argv[2])
if (!archive) throw new Error('Usage: node scripts/art-v21/verify-furniture-assets.mjs <archive-directory> [playwright-module-path]')
const themes = ['pixel', 'warm', 'night-study', 'forest', 'seaside', 'starlight', 'rain-train', 'greenhouse']
const types = ['deck', 'desk', 'chair', 'books', 'speaker', 'records', 'bed', 'plant', 'clock', 'tasks', 'calendar', 'weather', 'lyrics', 'notes', 'mail', 'lamp', 'tea', 'photo', 'curtain', 'rug', 'vinyl', 'cover', 'player', 'headphones', 'timer', 'journal', 'keyboard', 'mouse', 'sun', 'moon', 'cloud', 'rain']
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-cabin-furniture-qa-'))
const qa = path.join(archive, 'qa')
fs.mkdirSync(qa, { recursive: true })
const decoded = new Map()
function readImage(filename) {
  if (decoded.has(filename)) return decoded.get(filename)
  let input = filename
  if (filename.endsWith('.webp')) {
    input = path.join(temporary, `${decoded.size}.png`)
    const result = spawnSync('dwebp', ['-quiet', filename, '-o', input])
    if (result.status !== 0) throw new Error(`Failed to decode ${filename}: ${result.stderr}`)
  }
  const image = PNG.sync.read(fs.readFileSync(input))
  decoded.set(filename, image)
  return image
}
function assert(condition, message) { if (!condition) throw new Error(message) }
const escape = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;')
const report = { generatedAt: new Date().toISOString(), themes: {}, checks: ['all expected type and facing keys exist', 'all runtime file references exist', 'all atlas frame bounds are valid', 'every atlas frame matches its archived individual PNG byte for byte', 'standalone plant and tea match atlas frames', 'no visible opaque pixels touch trimmed frame edges', 'all declared normalized interaction geometry is in bounds'], totalKeys: 0, totalPhysicalSprites: 0, totalAtlases: 0 }
const reviews = []

for (const theme of themes) {
  const dir = path.join(root, theme)
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'))
  const original = JSON.parse(fs.readFileSync(path.join(archive, 'sources', theme, 'manifest.json'), 'utf8'))
  const unique = new Set(), edgeWarnings = []
  assert(Object.keys(manifest.frames).length === 64, `${theme}: expected 64 frame keys`)
  assert(Object.keys(manifest.atlases).length === 4, `${theme}: expected 4 atlases`)
  for (const type of types) for (const facing of ['se', 'nw']) assert(manifest.frames[`${type}-${facing}`], `${theme}: missing ${type}-${facing}`)
  for (const [id, frame] of Object.entries(manifest.frames)) {
    const atlas = readImage(path.join(dir, frame.file))
    const info = manifest.atlases[frame.file]
    assert(info && atlas.width === info.width && atlas.height === info.height, `${theme}/${id}: atlas metadata mismatch`)
    const [x, y, width, height] = frame.frame
    assert(x >= 0 && y >= 0 && width > 0 && height > 0 && x + width <= atlas.width && y + height <= atlas.height, `${theme}/${id}: frame out of bounds`)
    const crop = new PNG({ width, height })
    PNG.bitblt(atlas, crop, x, y, width, height, 0, 0)
    const archivedSprite = readImage(path.join(archive, 'sources', theme, original.frames[id].sprite))
    assert(width === archivedSprite.width && height === archivedSprite.height && crop.data.equals(archivedSprite.data), `${theme}/${id}: pixels differ from packed PNG`)
    if (frame.sprite) {
      const standalone = readImage(path.join(dir, frame.sprite))
      assert(standalone.width === width && standalone.height === height && standalone.data.equals(crop.data), `${theme}/${id}: standalone pixels differ`)
    }
    let edgePixels = 0, visiblePixels = 0
    for (let py = 0; py < height; py++) for (let px = 0; px < width; px++) {
      const alpha = crop.data[(py * width + px) * 4 + 3]
      if (alpha >= 32) visiblePixels++
      if ((px === 0 || py === 0 || px === width - 1 || py === height - 1) && alpha >= 32) edgePixels++
    }
    assert(visiblePixels > 50, `${theme}/${id}: empty sprite`)
    if (edgePixels) edgeWarnings.push({ id, edgePixels })
    for (const field of ['supportAnchor', 'blankRect', 'blankEllipse']) if (frame[field]) {
      for (const value of Object.values(frame[field])) assert(value >= 0 && value <= 1, `${theme}/${id}: ${field} outside normalized bounds`)
    }
    for (const field of ['supportPolygon', 'blankQuad']) if (frame[field]) {
      for (const pair of frame[field]) for (const value of pair) assert(value >= 0 && value <= 1, `${theme}/${id}: ${field} outside normalized bounds`)
    }
    if (frame.aliasOf) {
      assert(['sun', 'moon', 'cloud', 'rain'].includes(frame.type), `${theme}/${id}: unexpected alias`)
      const target = manifest.frames[frame.aliasOf]
      assert(target?.file === frame.file && target.frame.join(',') === frame.frame.join(','), `${theme}/${id}: alias mismatch`)
    }
    unique.add(`${frame.file}:${frame.frame.join(',')}`)
  }
  assert(unique.size === 60, `${theme}: expected 60 unique sprites`)
  report.themes[theme] = { frameKeys: 64, physicalSprites: unique.size, atlases: 4, standaloneSprites: 2, visibleEdgeWarnings: edgeWarnings, status: edgeWarnings.length ? 'needs-edge-review' : 'pass' }
  report.totalKeys += 64
  report.totalPhysicalSprites += unique.size
  report.totalAtlases += 4
  const cards = types.flatMap(type => ['se', 'nw'].map(facing => {
    const id = `${type}-${facing}`, frame = manifest.frames[id]
    const source = pathToFileURL(path.join(archive, 'sources', theme, original.frames[id].sprite)).href
    const ratio = Math.min(1, 164 / frame.logical.width, 136 / frame.logical.height)
    return `<figure><div class="sprite"><img src="${source}" width="${Math.round(frame.logical.width * ratio)}" height="${Math.round(frame.logical.height * ratio)}" style="object-fit:contain"></div><figcaption>${escape(id)}${frame.aliasOf ? ' · shared' : ''}</figcaption></figure>`
  })).join('')
  const html = `<!doctype html><meta charset="utf-8"><title>${escape(theme)} furniture QA</title><style>*{box-sizing:border-box}body{margin:0;padding:28px;background:#ece5d8;color:#332a24;font:14px system-ui,-apple-system,sans-serif}h1{margin:0 0 6px;font-size:24px}p{margin:0 0 20px;color:#665b51}.grid{display:grid;grid-template-columns:repeat(8,1fr);gap:12px}figure{margin:0;background:#f7f2e8;border:1px solid #dfd5c5;border-radius:8px;padding:8px}figure:nth-child(4n+3),figure:nth-child(4n+4){background:#292b31;color:#eee6da;border-color:#3c3c44}.sprite{height:136px;display:flex;align-items:flex-end;justify-content:center}img{image-rendering:pixelated}figcaption{height:24px;margin-top:8px;font:11px ui-monospace,monospace;text-align:center;white-space:nowrap}</style><h1>${escape(manifest.title)} · ${escape(theme)}</h1><p>ImageGen · actual sprite crop · two physical facings · light/dark alpha review · 64 logical frames, 60 unique artworks. The four weather symbols share both facing keys.</p><div class="grid">${cards}</div>`
  const htmlPath = path.join(qa, `${theme}-contact-sheet.html`)
  fs.writeFileSync(htmlPath, html)
  reviews.push({ htmlPath, pngPath: path.join(qa, `${theme}-contact-sheet.png`) })
  // Do not hold all eight full-size atlases and crops in memory at once.
  decoded.clear()
}
fs.writeFileSync(path.join(qa, 'verification.json'), `${JSON.stringify(report, null, 2)}\n`)
if (process.argv[3]) {
  const { chromium } = await import(pathToFileURL(path.resolve(process.argv[3])).href)
  const browser = await chromium.launch({ headless: true, ...(process.env.FURNITURE_QA_BROWSER_EXECUTABLE ? { executablePath: process.env.FURNITURE_QA_BROWSER_EXECUTABLE } : {}) })
  try {
    const page = await browser.newPage({ viewport: { width: 1536, height: 900 }, deviceScaleFactor: 1 })
    for (const review of reviews) {
      await page.goto(pathToFileURL(review.htmlPath).href)
      await page.evaluate(async () => { await Promise.all([...document.images].map(image => image.decode())) })
      await page.screenshot({ path: review.pngPath, fullPage: true })
    }
  } finally { await browser.close() }
}
fs.rmSync(temporary, { recursive: true, force: true })
const edgeWarnings = Object.entries(report.themes).flatMap(([theme, result]) => result.visibleEdgeWarnings.map(item => ({ theme, ...item })))
console.log(JSON.stringify({ status: edgeWarnings.length ? 'needs-edge-review' : 'pass', keys: report.totalKeys, physicalSprites: report.totalPhysicalSprites, atlases: report.totalAtlases, themes: themes.length, edgeWarnings, report: path.join(qa, 'verification.json'), contactSheets: reviews.length }))
if (edgeWarnings.length) process.exitCode = 1
