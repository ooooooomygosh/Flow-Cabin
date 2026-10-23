import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { PNG } from 'pngjs'

// Measured on the pixel reference after alpha trimming. Coordinates are
// normalized to each frame, not its padded atlas cell. Theme variants use the
// same reference geometry; consumers preserve aspect ratio when fitting them.
function interactionGeometry(type, facing) {
  const reverse = facing === 'nw'
  if (type === 'desk') return {
    supportAnchor: { x: 0.49, y: reverse ? 0.28 : 0.27 },
    supportPolygon: reverse ? [[0.02, 0.21], [0.31, 0.02], [0.98, 0.35], [0.71, 0.55]] : [[0.02, 0.27], [0.68, 0.02], [0.98, 0.23], [0.22, 0.52]],
  }
  if (type === 'deck') return {
    supportAnchor: { x: 0.5, y: 0.43 },
    turntableDisc: { cx: reverse ? 0.51 : 0.47, cy: 0.395, rx: 0.19, ry: 0.10, rotation: reverse ? 12 : -12 },
  }
  if (type === 'clock') return {
    blankRect: { x: reverse ? 0.18 : 0.29, y: 0.27, width: 0.47, height: 0.48 },
    blankEllipse: { cx: reverse ? 0.45 : 0.57, cy: 0.52, rx: 0.31, ry: 0.36 },
  }
  if (type === 'calendar') return { blankRect: { x: 0.17, y: 0.28, width: 0.68, height: 0.56 } }
  if (type === 'weather') return {
    blankRect: { x: 0.15, y: 0.43, width: 0.62, height: 0.23 },
    blankQuad: [[0.12, 0.32], [0.80, 0.42], [0.80, 0.77], [0.12, 0.68]],
  }
  if (type === 'tasks') return { blankRect: { x: 0.12, y: 0.20, width: 0.76, height: 0.61 } }
  if (type === 'records') return { supportAnchor: { x: 0.50, y: 0.19 } }
  if (type === 'photo') return { blankRect: { x: 0.24, y: 0.20, width: 0.43, height: 0.54 } }
  if (type === 'timer') return { blankRect: { x: reverse ? 0.23 : 0.51, y: 0.41, width: 0.35, height: 0.35 } }
  if (type === 'player') return { turntableDisc: { cx: reverse ? 0.46 : 0.54, cy: 0.54, rx: 0.23, ry: 0.13, rotation: reverse ? 12 : -12 } }
  return {}
}

// Mechanical atlas packing only. Preserve generated RGBA pixels; no AI artwork
// is recolored, mirrored, rotated or redrawn by this utility.
const configPath = process.argv[2]
if (!configPath) throw new Error('Usage: node scripts/art-v21/pack-furniture-atlas.mjs <source.json>')
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
const dir = path.dirname(path.resolve(configPath))
const source = PNG.sync.read(fs.readFileSync(path.resolve(dir, config.source)))
function segmentSprites(png, expected) {
  const size = png.width * png.height, labels = new Int32Array(size), queue = new Int32Array(size), components = []
  const threshold = config.segmentationThreshold || 32
  let label = 0
  for (let start = 0; start < size; start++) {
    if (labels[start] || png.data[start * 4 + 3] < threshold) continue
    label++
    let front = 0, end = 1, area = 0, x0 = png.width, y0 = png.height, x1 = 0, y1 = 0
    labels[start] = label; queue[0] = start
    while (front < end) {
      const pos = queue[front++], x = pos % png.width, y = Math.floor(pos / png.width)
      area++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y)
      for (const next of [pos - 1, pos + 1, pos - png.width, pos + png.width]) {
        if (next < 0 || next >= size || labels[next] || Math.abs(next % png.width - x) > 1 || png.data[next * 4 + 3] < threshold) continue
        labels[next] = label; queue[end++] = next
      }
    }
    components.push({ label, area, x0, y0, x1, y1 })
  }
  const largest = [...components].sort((a, b) => b.area - a.area).slice(0, expected)
  if (largest.some(item => item.area < 800)) throw new Error('Could not identify every sprite; inspect source manually')
  const ordered = []
  largest.sort((a, b) => (a.y0 + a.y1) - (b.y0 + b.y1))
  for (let row = 0; row < expected; row += 4) ordered.push(...largest.slice(row, row + 4).sort((a, b) => (a.x0 + a.x1) - (b.x0 + b.x1)))
  const owners = new Int32Array(label + 1).fill(-1)
  const bounds = ordered.map((item, index) => { owners[item.label] = index; return { ...item } })
  for (const item of components) {
    if (owners[item.label] >= 0 || item.area < 10) continue
    let best = -1, distance = Infinity
    for (const [index, box] of ordered.entries()) {
      const dx = Math.max(0, box.x0 - item.x1, item.x0 - box.x1), dy = Math.max(0, box.y0 - item.y1, item.y0 - box.y1)
      const d = dx * dx + dy * dy + (Math.abs(item.x0 + item.x1 - box.x0 - box.x1) + Math.abs(item.y0 + item.y1 - box.y0 - box.y1)) / 10000
      if (d < distance) { distance = d; best = index }
    }
    if (distance > 24 * 24) continue
    owners[item.label] = best
    const box = bounds[best]
    box.x0 = Math.min(box.x0, item.x0); box.x1 = Math.max(box.x1, item.x1)
    box.y0 = Math.min(box.y0, item.y0); box.y1 = Math.max(box.y1, item.y1)
  }
  return { labels, owners, rects: bounds.map(box => {
    const x = Math.max(0, box.x0 - 3), y = Math.max(0, box.y0 - 3)
    return [x, y, Math.min(png.width - 1, box.x1 + 3) - x + 1, Math.min(png.height - 1, box.y1 + 3) - y + 1]
  }) }
}
const segmentation = config.segmented ? segmentSprites(source, config.items.length) : null
const cellSize = config.cellSize || 384
const columns = config.columns || 4
const rows = Math.ceil(config.items.length / columns)
const atlas = new PNG({ width: columns * cellSize, height: rows * cellSize })
const frames = {}
const sprites = path.join(dir, 'sprites')
fs.mkdirSync(sprites, { recursive: true })
let alphaPixels = 0
for (let i = 3; i < source.data.length; i += 4) if (source.data[i] === 0) alphaPixels++
for (const [index, item] of config.items.entries()) {
  const [sx, sy, sw, sh] = segmentation?.rects[index] || item.sourceRect
  if (sx < 0 || sy < 0 || sx + sw > source.width || sy + sh > source.height) throw new Error(`Out of bounds: ${item.id}`)
  let x0 = sw, y0 = sh, x1 = -1, y1 = -1
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
    const pos = (sy + y) * source.width + sx + x
    if (source.data[pos * 4 + 3] > 4 && (!segmentation || segmentation.owners[segmentation.labels[pos]] === index)) {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y)
    }
  }
  if (x1 < 0) throw new Error(`Empty asset: ${item.id}`)
  // Ignore isolated <2%-opacity generation noise when finding the visual box,
  // then retain a three-pixel fringe. The copied pixels remain unmodified.
  x0 = Math.max(0, x0 - 3); y0 = Math.max(0, y0 - 3)
  x1 = Math.min(sw - 1, x1 + 3); y1 = Math.min(sh - 1, y1 + 3)
  const width = x1 - x0 + 1, height = y1 - y0 + 1
  if (width > cellSize - 8 || height > cellSize - 8) throw new Error(`Asset needs larger cell: ${item.id} (${width}×${height})`)
  const tileX = index % columns * cellSize, tileY = Math.floor(index / columns) * cellSize
  const dx = tileX + Math.floor((cellSize - width) / 2)
  const dy = tileY + cellSize - 12 - height
  const sprite = new PNG({ width, height })
  PNG.bitblt(source, sprite, sx + x0, sy + y0, width, height, 0, 0)
  if (segmentation) for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const pos = (sy + y0 + y) * source.width + sx + x0 + x, label = segmentation.labels[pos]
    if (label && segmentation.owners[label] !== index) sprite.data.fill(0, (y * width + x) * 4, (y * width + x) * 4 + 4)
  }
  PNG.bitblt(sprite, atlas, 0, 0, width, height, dx, dy)
  const id = `${item.id}-${config.facing || 'se'}`
  fs.writeFileSync(path.join(sprites, `${id}.png`), PNG.sync.write(sprite))
  frames[id] = {
    type: item.id,
    file: config.output || 'atlas.png',
    frame: [dx, dy, width, height],
    cell: [tileX, tileY, cellSize, cellSize],
    sprite: `sprites/${id}.png`,
    logical: { width: item.width, height: item.height },
    surface: item.surface,
    facing: config.facing || 'se',
    anchor: item.anchor || [0.5, 1],
    sourceRect: [sx + x0, sy + y0, width, height],
    ...interactionGeometry(item.id, config.facing || 'se'),
    ...(item.display ? { display: item.display } : {}),
  }
  if (item.directionInvariant) {
    frames[id].facing = 'neutral'
    frames[id].supportedFacings = ['se', 'nw']
    const oppositeId = `${item.id}-${config.facing === 'nw' ? 'se' : 'nw'}`
    frames[oppositeId] = { ...frames[id], aliasOf: id }
  }
}
const output = config.output || 'atlas.png'
fs.writeFileSync(path.join(dir, output), PNG.sync.write(atlas))
const manifestPath = path.join(dir, 'manifest.json')
const existing = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {}
const manifest = {
  version: 1,
  theme: config.theme,
  title: config.title,
  style: config.style,
  projection: { kind: 'fixed-oblique', screenRatio: '2:1', light: 'upper-left', rotationSupported: false },
  geometryCalibration: { reference: 'pixel', units: 'normalized-to-trimmed-frame', precision: 'visual-reference-sample' },
  facingGuide: { se: 'Long front edge rises toward screen-right; furniture faces lower-left.', nw: 'Long front edge falls toward screen-right; furniture faces lower-right.' },
  world: { width: 1200, height: 800 },
  pixelPolicy: 'Preserve source pixel art; uniform fit to logical dimensions. Use explicit facing frames; never rotate a flat sprite by 90 degrees.',
  atlases: {
    ...existing.atlases,
    [output]: {
      width: atlas.width, height: atlas.height, cellSize, columns, rows, alpha: true,
      source: config.source, sourceWidth: source.width, sourceHeight: source.height,
      sourceTransparentFraction: Number((alphaPixels / (source.width * source.height)).toFixed(4)),
      promptFile: config.promptFile, generator: 'image_gen.imagegen',
      sourceOrigin: config.origin ? path.basename(config.origin) : null,
      sourceSha256: createHash('sha256').update(fs.readFileSync(path.resolve(dir, config.source))).digest('hex'),
    },
  },
  frames: { ...existing.frames, ...frames },
}
fs.writeFileSync(`${manifestPath}.tmp`, `${JSON.stringify(manifest, null, 2)}\n`)
fs.renameSync(`${manifestPath}.tmp`, manifestPath)
console.log(JSON.stringify({ theme: config.theme, output, frames: Object.keys(frames), dimensions: [atlas.width, atlas.height] }))
