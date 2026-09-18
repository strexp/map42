// src/utils/color.ts
import * as THREE from 'three'

const RGBA_RE = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/

export interface ParsedColor {
  color: THREE.Color
  alpha: number
}

/** Parse a CSS `rgb()` / `rgba()` string into a THREE.Color plus alpha. */
export const parseRgba = (style: string): ParsedColor => {
  const match = RGBA_RE.exec(style)
  if (!match) return { color: new THREE.Color(style), alpha: 1 }
  const [, r, g, b, a] = match
  return {
    color: new THREE.Color(`rgb(${r}, ${g}, ${b})`),
    alpha: Math.min(1, Math.max(0, a === undefined ? 1 : Number(a))),
  }
}
