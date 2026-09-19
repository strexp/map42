/// <reference types="@webgpu/types" />

import type { SimulationNodeDatum } from '../types'

export const WORKGROUP_SIZE = 256
export const NODE_FLOATS = 16
export const LINK_FLOATS = 8
export const READBACK_POOL_SIZE = 3

// `GPUBufferUsage`/`GPUMapMode` are only defined in WebGPU-capable browsers.
// They are read lazily (inside the constructors / readback) so importing this
// module never touches WebGPU globals on unsupported browsers.
const usage = () => GPUBufferUsage

interface StagingSlot {
  buffer: GPUBuffer
  inUse: boolean
}

/**
 * Node storage laid out as 16 floats per node:
 *   [x, y, z, vx, vy, vz, fx, fy, fz, strength, radius, pad, pad, pad, pad, pad]
 * `fx/fy/fz` use NaN to mean "not fixed".
 */
export class NodeBuffer {
  readonly count: number
  readonly storage: GPUBuffer

  private readonly device: GPUDevice
  private readonly cpu: Float32Array<ArrayBuffer>
  private readonly staging: StagingSlot[] = []
  private readbackSeq = 0
  private destroyed = false
  private warnedNonFinite = false

  constructor(device: GPUDevice, count: number) {
    this.device = device
    this.count = count
    const floatCount = Math.max(count, 1) * NODE_FLOATS
    this.cpu = new Float32Array(floatCount)
    this.storage = device.createBuffer({
      size: floatCount * 4,
      usage: usage().STORAGE | usage().COPY_DST | usage().COPY_SRC,
      label: 'd3-force-3d/nodes',
    })
    for (let i = 0; i < READBACK_POOL_SIZE; i++) {
      this.staging.push({
        buffer: device.createBuffer({
          size: floatCount * 4,
          usage: usage().MAP_READ | usage().COPY_DST,
          label: `d3-force-3d/nodes-staging-${i}`,
        }),
        inUse: false,
      })
    }
  }

  upload(nodes: SimulationNodeDatum[], strengths: Float32Array | null): void {
    if (this.count === 0) return
    const cpu = this.cpu
    for (let i = 0; i < this.count; i++) {
      const node = nodes[i]
      const o = i * NODE_FLOATS
      cpu[o] = node.x ?? 0
      cpu[o + 1] = node.y ?? 0
      cpu[o + 2] = node.z ?? 0
      cpu[o + 3] = node.vx ?? 0
      cpu[o + 4] = node.vy ?? 0
      cpu[o + 5] = node.vz ?? 0
      cpu[o + 6] = node.fx == null ? NaN : node.fx
      cpu[o + 7] = node.fy == null ? NaN : node.fy
      cpu[o + 8] = node.fz == null ? NaN : node.fz
      cpu[o + 9] = strengths ? strengths[i] : -30
      cpu[o + 10] = 1
    }
    this.device.queue.writeBuffer(this.storage, 0, cpu, 0, this.count * NODE_FLOATS)
  }

  /**
   * Push user-driven changes to `fx/fy/fz` (e.g. node dragging) into the GPU
   * copy. Only the fixed-position lanes are written so the GPU remains the
   * source of truth for the simulated x/y/z/vx/vy/vz. Returns whether anything
   * changed.
   */
  syncFixed(nodes: SimulationNodeDatum[]): boolean {
    if (this.count === 0) return false
    const cpu = this.cpu
    let dirty = false
    for (let i = 0; i < this.count; i++) {
      const node = nodes[i]
      const o = i * NODE_FLOATS
      const fx = node.fx == null ? NaN : node.fx
      const fy = node.fy == null ? NaN : node.fy
      const fz = node.fz == null ? NaN : node.fz
      if (Object.is(cpu[o + 6], fx) && Object.is(cpu[o + 7], fy) && Object.is(cpu[o + 8], fz)) {
        continue
      }
      cpu[o + 6] = fx
      cpu[o + 7] = fy
      cpu[o + 8] = fz
      this.device.queue.writeBuffer(this.storage, (o + 6) * 4, cpu, o + 6, 3)
      dirty = true
    }
    return dirty
  }

  /**
   * Queue a copy of the node buffer and map it back. Returns `null` when every
   * staging slot is busy, so callers can simply skip this frame.
   */
  async readback(): Promise<{ seq: number; data: Float32Array } | null> {
    const slot = this.staging.find((s) => !s.inUse)
    if (!slot) return null
    slot.inUse = true
    const seq = ++this.readbackSeq

    const byteLength = Math.max(this.count, 1) * NODE_FLOATS * 4
    const encoder = this.device.createCommandEncoder()
    encoder.copyBufferToBuffer(this.storage, 0, slot.buffer, 0, byteLength)
    this.device.queue.submit([encoder.finish()])

    try {
      await slot.buffer.mapAsync(GPUMapMode.READ)
      const data = new Float32Array(slot.buffer.getMappedRange(0, byteLength).slice(0))
      slot.buffer.unmap()
      return { seq, data }
    } catch (error) {
      // Buffers are destroyed when the static topology is rebuilt; a pending
      // map is aborted, which is expected and should not surface as an error.
      if (this.destroyed) return null
      throw error
    } finally {
      slot.inUse = false
    }
  }

  applyReadback(nodes: SimulationNodeDatum[], data: Float32Array): void {
    for (let i = 0; i < this.count; i++) {
      const o = i * NODE_FLOATS
      const node = nodes[i]
      const x = data[o]
      const y = data[o + 1]
      const z = data[o + 2]
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        if (!this.warnedNonFinite) {
          this.warnedNonFinite = true
          console.warn('[d3-force-3d] non-finite GPU position read back', {
            i,
            x,
            y,
            z,
            fx: node.fx,
            fy: node.fy,
            fz: node.fz,
          })
        }
        continue
      }
      // A fixed axis is owned by the caller (e.g. an active drag), so don't let
      // a stale readback fight the user's input.
      if (node.fx == null) node.x = x
      if (node.fy == null) node.y = y
      if (node.fz == null) node.z = z
      node.vx = data[o + 3]
      node.vy = data[o + 4]
      node.vz = data[o + 5]
    }
  }

  destroy(): void {
    this.destroyed = true
    this.storage.destroy()
    for (const slot of this.staging) slot.buffer.destroy()
    this.staging.length = 0
  }
}

/** Link storage: [source, target, distance, strength, bias, pad, pad, pad]. */
export class LinkBuffer {
  readonly count: number
  readonly storage: GPUBuffer

  private readonly device: GPUDevice
  private readonly cpu: Float32Array<ArrayBuffer>

  constructor(device: GPUDevice, count: number) {
    this.device = device
    this.count = count
    const floatCount = Math.max(count, 1) * LINK_FLOATS
    this.cpu = new Float32Array(floatCount)
    this.storage = device.createBuffer({
      size: floatCount * 4,
      usage: usage().STORAGE | usage().COPY_DST,
      label: 'd3-force-3d/links',
    })
  }

  upload(links: Float32Array): void {
    this.cpu.set(links)
    this.device.queue.writeBuffer(this.storage, 0, this.cpu, 0, Math.max(this.count, 1) * LINK_FLOATS)
  }

  destroy(): void {
    this.storage.destroy()
  }
}

/**
 * Compressed sparse row adjacency used to reduce per-link forces onto nodes.
 * `starts[i]..starts[i+1]` indexes into `slots`, each entry pointing at the
 * `linkForces` slot that belongs to node `i`.
 */
export class CsrBuffer {
  readonly starts: GPUBuffer
  readonly slots: GPUBuffer

  constructor(device: GPUDevice, starts: Uint32Array<ArrayBuffer>, slots: Uint32Array<ArrayBuffer>) {
    this.starts = device.createBuffer({
      size: starts.byteLength,
      usage: usage().STORAGE | usage().COPY_DST,
      label: 'd3-force-3d/link-starts',
    })
    this.slots = device.createBuffer({
      size: Math.max(slots.byteLength, 4),
      usage: usage().STORAGE | usage().COPY_DST,
      label: 'd3-force-3d/link-slots',
    })
    device.queue.writeBuffer(this.starts, 0, starts)
    if (slots.byteLength > 0) device.queue.writeBuffer(this.slots, 0, slots)
  }

  destroy(): void {
    this.starts.destroy()
    this.slots.destroy()
  }
}

/** Two vec4 slots per link (source / target force contributions). */
export class LinkForceBuffer {
  readonly storage: GPUBuffer

  constructor(device: GPUDevice, linkCount: number) {
    this.storage = device.createBuffer({
      size: Math.max(linkCount, 1) * 2 * 16,
      usage: usage().STORAGE,
      label: 'd3-force-3d/link-forces',
    })
  }

  destroy(): void {
    this.storage.destroy()
  }
}

/** A single vec4 holding the center offset for the current tick. */
export class CenterBuffer {
  readonly storage: GPUBuffer

  constructor(device: GPUDevice) {
    this.storage = device.createBuffer({
      size: 16,
      usage: usage().STORAGE | usage().COPY_DST,
      label: 'd3-force-3d/center',
    })
  }

  destroy(): void {
    this.storage.destroy()
  }
}

export interface SimParams {
  alpha: number
  velocityDecay: number
  nodeCount: number
  linkCount: number
  theta2: number
  distanceMin2: number
  distanceMax2: number
  centerX: number
  centerY: number
  centerZ: number
  centerStrength: number
  centerEnabled: boolean
}

/** Uniform params shared by every compute pass (16 x 4 bytes = 64 bytes). */
export class ParamsBuffer {
  readonly storage: GPUBuffer

  private readonly device: GPUDevice
  private readonly arrayBuffer: ArrayBuffer
  private readonly floats: Float32Array<ArrayBuffer>
  private readonly uints: Uint32Array<ArrayBuffer>

  constructor(device: GPUDevice) {
    this.device = device
    this.arrayBuffer = new ArrayBuffer(64)
    this.floats = new Float32Array(this.arrayBuffer)
    this.uints = new Uint32Array(this.arrayBuffer)
    this.storage = device.createBuffer({
      size: 64,
      usage: usage().UNIFORM | usage().COPY_DST,
      label: 'd3-force-3d/params',
    })
  }

  update(params: SimParams): void {
    this.floats[0] = params.alpha
    this.floats[1] = params.velocityDecay
    this.uints[2] = params.nodeCount
    this.uints[3] = params.linkCount
    this.floats[4] = params.theta2
    this.floats[5] = params.distanceMin2
    this.floats[6] = params.distanceMax2
    this.floats[7] = params.centerX
    this.floats[8] = params.centerY
    this.floats[9] = params.centerZ
    this.floats[10] = params.centerStrength
    this.uints[11] = params.centerEnabled ? 1 : 0
    this.device.queue.writeBuffer(this.storage, 0, this.arrayBuffer)
  }

  destroy(): void {
    this.storage.destroy()
  }
}
