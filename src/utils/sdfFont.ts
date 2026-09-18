// src/utils/sdfFont.ts
import * as THREE from 'three'

/**
 * Runtime SDF font atlas shared by every text instance.
 *
 * The atlas is generated once from a system font: each glyph is rasterised into
 * a fixed-size cell, a signed distance field is computed with a two-pass
 * Euclidean distance transform, and the cells are packed into a grid.
 */

export interface SdfGlyph {
  u0: number
  v0: number
  du: number
  dv: number
  advance: number
}

export interface SdfFont {
  texture: THREE.DataTexture
  glyphs: Map<string, SdfGlyph>
  fallback: SdfGlyph | null
  /** Cell quad origin/size in em, relative to the pen origin at the baseline. */
  cellOffset: THREE.Vector2
  cellSize: THREE.Vector2
  /** World units per em needed for a capital letter to be `textHeight` tall. */
  capHeightEm: number
}

const FONT_SIZE = 48
const SPREAD = 6
const PAD = SPREAD + 4
const CELL_W = FONT_SIZE + PAD * 2 + 8
const CELL_H = FONT_SIZE + PAD * 2 + Math.ceil(FONT_SIZE * 0.4)
const BASELINE = PAD + FONT_SIZE
const FONT_FAMILY = 'Arial, Helvetica, sans-serif'
const INF = 1e12

const CHARSET = (() => {
  let out = ''
  for (let c = 33; c <= 126; c++) out += String.fromCharCode(c)
  return out
})()

/** 1D squared Euclidean distance transform (Felzenszwalb & Huttenlocher). */
const edt1d = (f: Float64Array, n: number): Float64Array => {
  const d = new Float64Array(n)
  const v = new Int32Array(n)
  const z = new Float64Array(n + 1)
  let k = 0
  v[0] = 0
  z[0] = -INF
  z[1] = INF
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
    while (s <= z[k]) {
      k--
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
    }
    k++
    v[k] = q
    z[k] = s
    z[k + 1] = INF
  }
  k = 0
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]
  }
  return d
}

/** 2D squared distance transform of a binary mask (1 = seed). */
const edt2d = (mask: Uint8Array, w: number, h: number): Float64Array => {
  const f = new Float64Array(w * h)
  for (let i = 0; i < f.length; i++) f[i] = mask[i] ? 0 : INF

  for (let y = 0; y < h; y++) {
    const row = edt1d(f.subarray(y * w, y * w + w), w)
    f.set(row, y * w)
  }

  const col = new Float64Array(h)
  const out = new Float64Array(h)
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) col[y] = f[y * w + x]
    out.set(edt1d(col, h))
    for (let y = 0; y < h; y++) f[y * w + x] = out[y]
  }
  return f
}

let cached: SdfFont | null = null

export const getSdfFont = (): SdfFont => {
  if (cached) return cached

  const count = CHARSET.length
  const cols = Math.ceil(Math.sqrt(count))
  const rows = Math.ceil(count / cols)
  const atlasW = cols * CELL_W
  const atlasH = rows * CELL_H

  const canvas = document.createElement('canvas')
  canvas.width = atlasW
  canvas.height = atlasH
  const ctx = canvas.getContext('2d')!
  ctx.font = `${FONT_SIZE}px ${FONT_FAMILY}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#ffffff'

  for (let i = 0; i < count; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    ctx.fillText(CHARSET[i], col * CELL_W + PAD, row * CELL_H + BASELINE)
  }

  const image = ctx.getImageData(0, 0, atlasW, atlasH)
  const alpha = image.data
  const atlas = new Uint8Array(atlasW * atlasH * 4)
  atlas.fill(255)

  const mask = new Uint8Array(CELL_W * CELL_H)
  const inv = new Uint8Array(CELL_W * CELL_H)

  for (let i = 0; i < count; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    const ox = col * CELL_W
    const oy = row * CELL_H

    for (let y = 0; y < CELL_H; y++) {
      for (let x = 0; x < CELL_W; x++) {
        const a = alpha[((oy + y) * atlasW + ox + x) * 4 + 3]
        const inside = a > 127 ? 1 : 0
        mask[y * CELL_W + x] = inside
        inv[y * CELL_W + x] = inside ? 0 : 1
      }
    }

    const toInside = edt2d(mask, CELL_W, CELL_H)
    const toOutside = edt2d(inv, CELL_W, CELL_H)

    for (let p = 0; p < mask.length; p++) {
      const signed = Math.sqrt(toOutside[p]) - Math.sqrt(toInside[p])
      const sdf = Math.max(0, Math.min(1, 0.5 + signed / (2 * SPREAD)))
      const value = Math.round(sdf * 255)
      const idx = ((oy + Math.floor(p / CELL_W)) * atlasW + ox + (p % CELL_W)) * 4
      atlas[idx] = value
      atlas[idx + 1] = value
      atlas[idx + 2] = value
    }
  }

  const texture = new THREE.DataTexture(atlas, atlasW, atlasH, THREE.RGBAFormat)
  texture.colorSpace = THREE.NoColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true

  const glyphs = new Map<string, SdfGlyph>()
  for (let i = 0; i < count; i++) {
    const ch = CHARSET[i]
    const col = i % cols
    const row = Math.floor(i / cols)
    const u0 = (col * CELL_W) / atlasW
    const vBottom = ((row + 1) * CELL_H) / atlasH
    const vTop = (row * CELL_H) / atlasH
    glyphs.set(ch, {
      u0,
      v0: vBottom,
      du: CELL_W / atlasW,
      dv: vTop - vBottom,
      advance: ctx.measureText(ch).width / FONT_SIZE,
    })
  }

  const capAscent = ctx.measureText('H').actualBoundingBoxAscent || FONT_SIZE * 0.72
  const capHeightEm = capAscent / FONT_SIZE

  const x0 = -PAD / FONT_SIZE
  const x1 = (CELL_W - PAD) / FONT_SIZE
  const yBottom = (BASELINE - CELL_H) / FONT_SIZE
  const yTop = BASELINE / FONT_SIZE
  const yCenter = (yTop + yBottom) / 2

  cached = {
    texture,
    glyphs,
    fallback: glyphs.get('?') ?? null,
    cellOffset: new THREE.Vector2(x0, yBottom - yCenter),
    cellSize: new THREE.Vector2(x1 - x0, yTop - yBottom),
    capHeightEm,
  }
  return cached
}
