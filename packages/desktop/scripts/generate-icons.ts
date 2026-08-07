/**
 * Draws the Cowork app mark and writes every size and container the packagers
 * need (PNG, .ico, .icns).
 *
 * There is no image library in this repo and the mark is pure geometry, so it
 * is rasterized here rather than exported from a design tool. Re-run after
 * changing the shape or the palette:
 *
 *   bun packages/desktop/scripts/generate-icons.ts
 */

import { deflateSync } from "node:zlib"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const desktop = join(here, "..")

type RGB = readonly [number, number, number]

const PALETTE = {
  backdropTop: [86, 92, 214] as RGB,
  backdropBottom: [58, 62, 168] as RGB,
  sheet: [255, 255, 255] as RGB,
  sheetBack: [198, 205, 255] as RGB,
  rule: [126, 134, 226] as RGB,
} as const

/** Signed distance to a rounded rectangle, negative inside. */
function roundedRect(x: number, y: number, cx: number, cy: number, hw: number, hh: number, r: number) {
  const dx = Math.abs(x - cx) - (hw - r)
  const dy = Math.abs(y - cy) - (hh - r)
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0))
  return outside + Math.min(Math.max(dx, dy), 0) - r
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

/**
 * Colors one point of the mark in a unit square: a rounded-square backdrop
 * carrying two offset sheets of paper, the front one ruled with lines.
 */
function sample(u: number, v: number): [RGB, number] {
  const backdrop = roundedRect(u, v, 0.5, 0.5, 0.5, 0.5, 0.225)
  if (backdrop > 0) return [PALETTE.sheet, 0]

  let color = mix(PALETTE.backdropTop, PALETTE.backdropBottom, v)

  const back = roundedRect(u, v, 0.44, 0.46, 0.19, 0.24, 0.045)
  if (back <= 0) color = PALETTE.sheetBack

  const front = roundedRect(u, v, 0.56, 0.54, 0.19, 0.24, 0.045)
  if (front <= 0) {
    color = PALETTE.sheet
    // Three ruled lines, shortest last, suggesting written text.
    const lines: Array<[number, number]> = [
      [0.44, 0.15],
      [0.53, 0.15],
      [0.62, 0.09],
    ]
    for (const [top, width] of lines) {
      if (roundedRect(u, v, 0.5 + width / 2 + 0.005, top + 0.018, width / 2, 0.018, 0.016) <= 0) {
        color = PALETTE.rule
      }
    }
  }

  return [color, 1]
}

const SUPERSAMPLE = 4

function render(size: number) {
  const pixels = Buffer.alloc(size * size * 4)
  const step = 1 / (size * SUPERSAMPLE)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const u = (x * SUPERSAMPLE + sx + 0.5) * step
          const v = (y * SUPERSAMPLE + sy + 0.5) * step
          const [color, alpha] = sample(u, v)
          r += color[0] * alpha
          g += color[1] * alpha
          b += color[2] * alpha
          a += alpha
        }
      }
      const total = SUPERSAMPLE * SUPERSAMPLE
      const offset = (y * size + x) * 4
      // Un-premultiply so edge pixels keep their color at partial coverage.
      const coverage = a / total
      pixels[offset] = coverage > 0 ? Math.round(r / a) : 0
      pixels[offset + 1] = coverage > 0 ? Math.round(g / a) : 0
      pixels[offset + 2] = coverage > 0 ? Math.round(b / a) : 0
      pixels[offset + 3] = Math.round(coverage * 255)
    }
  }
  return pixels
}

function crc32(buffer: Buffer) {
  let crc = ~0
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return ~crc >>> 0
}

function chunk(type: string, data: Buffer) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, "ascii"), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function png(size: number, pixels: Buffer) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8 // bit depth
  header[9] = 6 // truecolor with alpha
  // Each scanline is prefixed with its filter type; 0 means no filtering.
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ])
}

function ico(entries: Array<{ size: number; data: Buffer }>) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2) // icon
  header.writeUInt16LE(entries.length, 4)

  let offset = 6 + entries.length * 16
  const directory: Buffer[] = []
  for (const entry of entries) {
    const record = Buffer.alloc(16)
    record[0] = entry.size >= 256 ? 0 : entry.size
    record[1] = entry.size >= 256 ? 0 : entry.size
    record.writeUInt16LE(1, 4) // color planes
    record.writeUInt16LE(32, 6) // bits per pixel
    record.writeUInt32LE(entry.data.length, 8)
    record.writeUInt32LE(offset, 12)
    directory.push(record)
    offset += entry.data.length
  }
  return Buffer.concat([header, ...directory, ...entries.map((entry) => entry.data)])
}

const ICNS_TYPES: Record<number, string> = {
  16: "icp4",
  32: "icp5",
  64: "icp6",
  128: "ic07",
  256: "ic08",
  512: "ic09",
  1024: "ic10",
}

function icns(entries: Array<{ size: number; data: Buffer }>) {
  const parts: Buffer[] = []
  for (const entry of entries) {
    const type = ICNS_TYPES[entry.size]
    if (!type) continue
    const length = Buffer.alloc(4)
    length.writeUInt32BE(entry.data.length + 8)
    parts.push(Buffer.from(type, "ascii"), length, entry.data)
  }
  const body = Buffer.concat(parts)
  const total = Buffer.alloc(4)
  total.writeUInt32BE(body.length + 8)
  return Buffer.concat([Buffer.from("icns", "ascii"), total, body])
}

const cache = new Map<number, Buffer>()
const at = (size: number) => {
  const hit = cache.get(size)
  if (hit) return hit
  const data = png(size, render(size))
  cache.set(size, data)
  return data
}

// Names electron-builder and the Windows/Linux packagers look for.
const PNG_TARGETS: Array<[string, number]> = [
  ["32x32.png", 32],
  ["64x64.png", 64],
  ["128x128.png", 128],
  ["128x128@2x.png", 256],
  ["Square30x30Logo.png", 30],
  ["Square44x44Logo.png", 44],
  ["Square71x71Logo.png", 71],
  ["Square89x89Logo.png", 89],
  ["Square107x107Logo.png", 107],
  ["Square142x142Logo.png", 142],
  ["Square150x150Logo.png", 150],
  ["Square284x284Logo.png", 284],
  ["Square310x310Logo.png", 310],
  ["icon.png", 512],
  ["dock.png", 256],
]

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]
const ICNS_SIZES = [16, 32, 64, 128, 256, 512, 1024]

for (const directory of ["resources/icons", "icons/dev", "icons/beta", "icons/prod"]) {
  const target = join(desktop, directory)
  mkdirSync(target, { recursive: true })
  for (const [name, size] of PNG_TARGETS) writeFileSync(join(target, name), at(size))
  writeFileSync(join(target, "icon.ico"), ico(ICO_SIZES.map((size) => ({ size, data: at(size) }))))
  writeFileSync(join(target, "icon.icns"), icns(ICNS_SIZES.map((size) => ({ size, data: at(size) }))))
  console.log("wrote", directory)
}
