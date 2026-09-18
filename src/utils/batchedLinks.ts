// src/utils/batchedLinks.ts
import * as THREE from 'three'
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import { graphconfig } from './constants'
import type { GraphLink, GraphNode } from '../types'

// One layer per `_state`: 0 = default, 1 = hop1, 2 = hop2.
interface LayerSpec {
  style: string
  width: number
  worldUnits: boolean
}

const LAYER_SPECS: LayerSpec[] = [
  // Default links keep the old 1px `THREE.Line` look.
  { style: graphconfig.colors.edge.default, width: 1, worldUnits: false },
  // Highlighted links keep the old world-unit cylinder width.
  { style: graphconfig.colors.edge.adj1, width: graphconfig.size.link.adj1, worldUnits: true },
  { style: graphconfig.colors.edge.adj2, width: graphconfig.size.link.adj2, worldUnits: true },
]

const RGBA_RE = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/

const parseRgba = (style: string): { color: THREE.Color; alpha: number } => {
  const match = RGBA_RE.exec(style)
  if (!match) return { color: new THREE.Color(style), alpha: 1 }
  const [, r, g, b, a] = match
  return {
    color: new THREE.Color(`rgb(${r}, ${g}, ${b})`),
    alpha: a === undefined ? 1 : Number(a),
  }
}

interface Layer {
  object: LineSegments2
  geometry: LineSegmentsGeometry
  data: Float32Array
  buffer: THREE.InstancedInterleavedBuffer
  count: number
}

export class BatchedLinkRenderer {
  private scene: THREE.Scene
  private layers: Layer[] = []
  private buckets: GraphLink[][] = [[], [], []]
  private capacity = 0

  constructor(scene: THREE.Scene) {
    this.scene = scene
  }

  private ensureCapacity(capacity: number) {
    if (this.layers.length > 0 && this.capacity >= capacity) return
    this.dispose()
    this.capacity = capacity

    this.layers = LAYER_SPECS.map((spec) => {
      const { color, alpha } = parseRgba(spec.style)
      const geometry = new LineSegmentsGeometry()
      const data = new Float32Array(capacity * 6)
      geometry.setPositions(data)
      geometry.instanceCount = 0

      const material = new LineMaterial({
        color,
        linewidth: spec.width,
        worldUnits: spec.worldUnits,
        transparent: true,
        opacity: graphconfig.opacity.edge * alpha,
        depthWrite: false,
        fog: true,
      })

      const object = new LineSegments2(geometry, material)
      object.frustumCulled = false
      object.renderOrder = 10
      object.visible = false
      this.scene.add(object)

      const buffer = (geometry.attributes.instanceStart as THREE.InterleavedBufferAttribute)
        .data as THREE.InstancedInterleavedBuffer

      return { object, geometry, data, buffer, count: 0 }
    })
  }

  /** Reclassify links by `_state` and refresh their positions. */
  update(links: GraphLink[], selected: GraphNode | null) {
    if (links.length === 0) {
      this.clearVisible()
      return
    }

    this.ensureCapacity(links.length)

    const buckets = this.buckets
    buckets[0].length = 0
    buckets[1].length = 0
    buckets[2].length = 0

    const hasSelection = !!selected
    for (const link of links) {
      const state = hasSelection ? (link._state ?? 0) : 0
      if (state < 0 || state > 2) continue
      // Mirrors the old `linkVisibility`: state 0 links are hidden while a node is selected.
      if (hasSelection && state === 0) continue
      buckets[state].push(link)
    }

    for (let s = 0; s < this.layers.length; s++) {
      this.writeLayer(this.layers[s], buckets[s])
    }
  }

  /** Cheap per-tick position refresh using the current classification. */
  updatePositions() {
    for (let s = 0; s < this.layers.length; s++) {
      this.writeLayer(this.layers[s], this.buckets[s])
    }
  }

  private writeLayer(layer: Layer, bucket: GraphLink[]) {
    const data = layer.data
    let offset = 0
    for (const link of bucket) {
      const source = typeof link.source === 'object' ? (link.source as GraphNode) : null
      const target = typeof link.target === 'object' ? (link.target as GraphNode) : null
      if (!source || !target || source.x == null || target.x == null) continue
      data[offset++] = source.x
      data[offset++] = source.y || 0
      data[offset++] = source.z || 0
      data[offset++] = target.x
      data[offset++] = target.y || 0
      data[offset++] = target.z || 0
    }

    const count = offset / 6
    layer.count = count
    layer.geometry.instanceCount = count
    layer.object.visible = count > 0
    if (count > 0) layer.buffer.needsUpdate = true
  }

  private clearVisible() {
    for (const layer of this.layers) {
      layer.count = 0
      layer.geometry.instanceCount = 0
      layer.object.visible = false
    }
  }

  dispose() {
    for (const layer of this.layers) {
      this.scene.remove(layer.object)
      layer.geometry.dispose()
      layer.object.material.dispose()
    }
    this.layers = []
    this.capacity = 0
  }
}
