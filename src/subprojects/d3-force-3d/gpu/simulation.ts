/// <reference types="@webgpu/types" />

// GPU-backed `forceSimulation` compatible with the d3-force-3d surface that
// `three-forcegraph` consumes. Node state lives on the GPU between ticks; only
// the parameters are refreshed each frame and positions are read back
// asynchronously for rendering.

import { forceSimulation as cpuForceSimulation } from 'd3-force-3d-cpu'
import { createComputePipeline, initWebGPU } from './device'
import {
  CenterBuffer,
  CsrBuffer,
  LinkBuffer,
  LinkForceBuffer,
  LINK_FLOATS,
  NodeBuffer,
  ParamsBuffer,
  WORKGROUP_SIZE,
} from './buffers'
import {
  centerSumWgsl,
  integrateWgsl,
  linkForceWgsl,
  manyBodyWgsl,
} from './shaders'
import lcg from '../lcg'
import type { Force, GpuCapableSimulation, SimulationNodeDatum } from '../types'

type Node = SimulationNodeDatum

interface Pipelines {
  link: GPUComputePipeline
  manyBody: GPUComputePipeline
  center: GPUComputePipeline
  integrate: GPUComputePipeline
}

interface GpuResources {
  nodeBuffer: NodeBuffer
  linkBuffer: LinkBuffer
  linkForceBuffer: LinkForceBuffer
  csr: CsrBuffer
  centerBuffer: CenterBuffer
  paramsBuffer: ParamsBuffer
  linkBindGroup: GPUBindGroup | null
  manyBodyBindGroup: GPUBindGroup | null
  centerBindGroup: GPUBindGroup | null
  integrateBindGroup: GPUBindGroup
}

interface ManyBodyConfig {
  strengths: Float32Array
  theta: number
  distanceMin: number
  distanceMax: number
}

interface CenterConfig {
  x: number
  y: number
  z: number
  strength: number
}

const clampDimensions = (value: number | undefined): number => {
  const n = Math.round(value ?? 2)
  return Math.min(3, Math.max(1, n))
}

const hasMethod = <T>(force: Force<T>, name: string): boolean =>
  typeof (force as unknown as Record<string, unknown>)[name] === 'function'

const classifyForce = <T>(force: Force<T>): 'link' | 'manyBody' | 'center' | 'other' => {
  if (hasMethod(force, 'links') && hasMethod(force, 'distance')) return 'link'
  if (hasMethod(force, 'theta') && hasMethod(force, 'distanceMin')) return 'manyBody'
  if (hasMethod(force, 'radius')) return 'other' // forceRadial has no GPU path
  if (hasMethod(force, 'x') && hasMethod(force, 'y') && hasMethod(force, 'z')) return 'center'
  return 'other'
}

type NumberAccessor = (d: unknown, i: number, all: unknown[]) => number

const isNumberAccessor = (value: unknown): value is NumberAccessor => typeof value === 'function'

export function createGpuSimulation<N extends Node>(
  initialNodes: N[],
  initialDimensions?: number,
): GpuCapableSimulation<N> {
  let nodes = initialNodes
  let nDim = clampDimensions(initialDimensions)
  let alpha = 1
  let alphaMin = 0.001
  let alphaDecay = 1 - Math.pow(alphaMin, 1 / 300)
  let alphaTarget = 0
  let velocityDecay = 0.6
  let random = lcg()
  const forces = new Map<string, Force<N>>()
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>()

  // CPU delegate used when WebGPU is unavailable or fails to initialise.
  let cpu: ReturnType<typeof cpuForceSimulation<N>> | null = null

  // GPU state.
  let gpuDevice: GPUDevice | null = null
  let pipelines: Pipelines | null = null
  let resources: GpuResources | null = null
  let initialized = false
  let staticDirty = true
  let manyBodyConfig: ManyBodyConfig | null = null
  let centerConfig: CenterConfig | null = null
  let linkCount = 0
  let lastAppliedSeq = 0
  let gpuReadyResolve: (value: boolean) => void = () => {}
  const gpuReadyPromise = new Promise<boolean>((resolve) => {
    gpuReadyResolve = resolve
  })

  const emit = (name: string, ...args: unknown[]) => {
    listeners.get(name)?.forEach((listener) => listener(...args))
  }

  const initializeNodes = () => {
    const initialRadius = 10
    const rollAngle = Math.PI * (3 - Math.sqrt(5))
    const yawAngle = (Math.PI * 20) / (9 + Math.sqrt(221))

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]
      node.index = i
      if (node.fx != null) node.x = node.fx
      if (node.fy != null) node.y = node.fy
      if (node.fz != null) node.z = node.fz

      if (Number.isNaN(node.x) || (nDim > 1 && Number.isNaN(node.y)) || (nDim > 2 && Number.isNaN(node.z))) {
        const radius = initialRadius * (nDim > 2 ? Math.cbrt(0.5 + i) : Math.sqrt(0.5 + i))
        if (nDim === 1) {
          node.x = radius
        } else if (nDim === 2) {
          node.x = radius * Math.cos(i * rollAngle)
          node.y = radius * Math.sin(i * rollAngle)
        } else {
          node.x = radius * Math.sin(i * rollAngle) * Math.cos(i * yawAngle)
          node.y = radius * Math.cos(i * rollAngle)
          node.z = radius * Math.sin(i * rollAngle) * Math.sin(i * yawAngle)
        }
      }

      if (Number.isNaN(node.vx) || (nDim > 1 && Number.isNaN(node.vy)) || (nDim > 2 && Number.isNaN(node.vz))) {
        node.vx = 0
        if (nDim > 1) node.vy = 0
        if (nDim > 2) node.vz = 0
      }
    }
  }

  const initializeForce = (force: Force<N>) => {
    force.initialize?.(nodes, random, nDim)
    return force
  }

  const destroyResources = () => {
    if (!resources) return
    resources.nodeBuffer.destroy()
    resources.linkBuffer.destroy()
    resources.linkForceBuffer.destroy()
    resources.csr.destroy()
    resources.centerBuffer.destroy()
    resources.paramsBuffer.destroy()
    resources = null
  }

  const rebuildStatic = () => {
    if (!gpuDevice || !pipelines) return
    const device = gpuDevice

    let linkForce: Force<N> | null = null
    let manyBodyForce: Force<N> | null = null
    let centerForce: Force<N> | null = null
    for (const [name, force] of forces) {
      switch (classifyForce(force)) {
        case 'link':
          linkForce = force
          break
        case 'manyBody':
          manyBodyForce = force
          break
        case 'center':
          centerForce = force
          break
        default:
          console.warn(`[d3-force-3d] force "${name}" has no GPU implementation; it is ignored`)
      }
    }

    // --- Link force data -------------------------------------------------
    let linkFloats: Float32Array | null = null
    let csrStarts = new Uint32Array(nodes.length + 1)
    let csrSlots = new Uint32Array(0)
    linkCount = 0

    if (linkForce) {
      const lf = initializeForce(linkForce) as unknown as {
        links(): unknown[]
        distance(): unknown
        strength(): unknown
      }
      const rawLinks = lf.links()
      const distance = lf.distance()
      const strength = lf.strength()
      linkCount = rawLinks.length
      linkFloats = new Float32Array(Math.max(linkCount, 1) * LINK_FLOATS)

      const counts = new Uint32Array(nodes.length)
      const sources = new Uint32Array(linkCount)
      const targets = new Uint32Array(linkCount)
      const distances = new Float32Array(linkCount)
      const strengths = new Float32Array(linkCount)

      for (let i = 0; i < linkCount; i++) {
        const link = rawLinks[i] as { source: { index: number }; target: { index: number } }
        const s = link.source.index
        const t = link.target.index
        sources[i] = s
        targets[i] = t
        counts[s]++
        counts[t]++
        distances[i] = isNumberAccessor(distance)
          ? Number(distance(link, i, rawLinks))
          : Number(distance)
        strengths[i] = isNumberAccessor(strength)
          ? Number(strength(link, i, rawLinks))
          : Number(strength)
        if (!Number.isFinite(distances[i])) distances[i] = 30
        if (!Number.isFinite(strengths[i])) strengths[i] = 1
      }

      const starts = new Uint32Array(nodes.length + 1)
      for (let i = 0; i < linkCount; i++) {
        starts[sources[i] + 1]++
        starts[targets[i] + 1]++
      }
      for (let i = 1; i <= nodes.length; i++) starts[i] += starts[i - 1]

      const cursor = starts.slice(0, nodes.length)
      const slots = new Uint32Array(linkCount * 2)
      for (let i = 0; i < linkCount; i++) {
        const s = sources[i]
        const t = targets[i]
        const total = counts[s] + counts[t]
        const bias = total > 0 ? counts[s] / total : 0.5
        const o = i * LINK_FLOATS
        linkFloats[o] = s
        linkFloats[o + 1] = t
        linkFloats[o + 2] = distances[i]
        linkFloats[o + 3] = strengths[i]
        linkFloats[o + 4] = bias
        slots[cursor[s]++] = 2 * i
        slots[cursor[t]++] = 2 * i + 1
      }
      csrStarts = starts
      csrSlots = slots
    }

    // --- Many-body force data -------------------------------------------
    manyBodyConfig = null
    if (manyBodyForce) {
      const mf = initializeForce(manyBodyForce) as unknown as {
        strength(): unknown
        theta(): number
        distanceMin(): number
        distanceMax(): number
      }
      const strength = mf.strength()
      const strengths = new Float32Array(nodes.length)
      for (let i = 0; i < nodes.length; i++) {
        strengths[i] = isNumberAccessor(strength)
          ? Number(strength(nodes[i], i, nodes))
          : Number(strength)
        if (!Number.isFinite(strengths[i])) strengths[i] = -30
      }
      manyBodyConfig = {
        strengths,
        theta: mf.theta(),
        distanceMin: mf.distanceMin(),
        distanceMax: mf.distanceMax(),
      }
    }

    // --- Center force data ----------------------------------------------
    centerConfig = null
    if (centerForce) {
      const cf = initializeForce(centerForce) as unknown as {
        x(): number
        y(): number
        z(): number
        strength(): number
      }
      centerConfig = { x: cf.x(), y: cf.y(), z: cf.z(), strength: cf.strength() }
    }

    // --- (Re)create buffers and bind groups -----------------------------
    destroyResources()

    const nodeBuffer = new NodeBuffer(device, nodes.length)
    nodeBuffer.upload(nodes, manyBodyConfig?.strengths ?? null)

    const linkBuffer = new LinkBuffer(device, linkCount)
    if (linkFloats) linkBuffer.upload(linkFloats)

    const linkForceBuffer = new LinkForceBuffer(device, linkCount)
    const csr = new CsrBuffer(device, csrStarts, csrSlots)
    const centerBuffer = new CenterBuffer(device)
    const paramsBuffer = new ParamsBuffer(device)

    const linkBindGroup =
      linkCount > 0
        ? device.createBindGroup({
            layout: pipelines.link.getBindGroupLayout(0),
            entries: [
              { binding: 0, resource: { buffer: nodeBuffer.storage } },
              { binding: 1, resource: { buffer: linkBuffer.storage } },
              { binding: 2, resource: { buffer: paramsBuffer.storage } },
              { binding: 3, resource: { buffer: linkForceBuffer.storage } },
            ],
          })
        : null

    const manyBodyBindGroup = manyBodyConfig
      ? device.createBindGroup({
          layout: pipelines.manyBody.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: nodeBuffer.storage } },
            { binding: 1, resource: { buffer: paramsBuffer.storage } },
          ],
        })
      : null

    const centerBindGroup = centerConfig
      ? device.createBindGroup({
          layout: pipelines.center.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: nodeBuffer.storage } },
            { binding: 1, resource: { buffer: paramsBuffer.storage } },
            { binding: 2, resource: { buffer: centerBuffer.storage } },
          ],
        })
      : null

    const integrateBindGroup = device.createBindGroup({
      layout: pipelines.integrate.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: nodeBuffer.storage } },
        { binding: 1, resource: { buffer: paramsBuffer.storage } },
        { binding: 2, resource: { buffer: csr.starts } },
        { binding: 3, resource: { buffer: csr.slots } },
        { binding: 4, resource: { buffer: linkForceBuffer.storage } },
        { binding: 5, resource: { buffer: centerBuffer.storage } },
      ],
    })

    resources = {
      nodeBuffer,
      linkBuffer,
      linkForceBuffer,
      csr,
      centerBuffer,
      paramsBuffer,
      linkBindGroup,
      manyBodyBindGroup,
      centerBindGroup,
      integrateBindGroup,
    }
    staticDirty = false
  }

  const scheduleReadback = () => {
    const nodeBuffer = resources?.nodeBuffer
    if (!nodeBuffer) return
    nodeBuffer
      .readback()
      .then((result) => {
        if (!result || result.seq <= lastAppliedSeq) return
        if (nodeBuffer !== resources?.nodeBuffer) return
        lastAppliedSeq = result.seq
        nodeBuffer.applyReadback(nodes, result.data)
      })
      .catch((error) => {
        console.error('[d3-force-3d] readback failed:', error)
      })
  }

  const gpuStep = () => {
    if (!initialized || !gpuDevice || !pipelines) return
    try {
      stepGpu()
    } catch (error) {
      console.error('[d3-force-3d] GPU step failed, falling back to CPU:', error)
      fallbackToCpu()
    }
  }

  const stepGpu = () => {
    if (!gpuDevice || !pipelines) return
    if (staticDirty) rebuildStatic()
    const res = resources
    if (!res) return

    // Pick up `fx/fy/fz` edits made outside the engine (node dragging) before
    // integrating this tick.
    res.nodeBuffer.syncFixed(nodes)

    const count = nodes.length
    res.paramsBuffer.update({
      alpha,
      velocityDecay,
      nodeCount: count,
      linkCount,
      theta2: manyBodyConfig ? manyBodyConfig.theta * manyBodyConfig.theta : 0.81,
      distanceMin2: manyBodyConfig ? manyBodyConfig.distanceMin * manyBodyConfig.distanceMin : 1,
      distanceMax2: manyBodyConfig
        ? manyBodyConfig.distanceMax === Infinity
          ? 1e30
          : manyBodyConfig.distanceMax * manyBodyConfig.distanceMax
        : 1e30,
      centerX: centerConfig?.x ?? 0,
      centerY: centerConfig?.y ?? 0,
      centerZ: centerConfig?.z ?? 0,
      centerStrength: centerConfig?.strength ?? 1,
      centerEnabled: !!centerConfig,
    })

    const nodeWorkgroups = Math.ceil(count / WORKGROUP_SIZE)
    const linkWorkgroups = Math.ceil(linkCount / WORKGROUP_SIZE)

    const encoder = gpuDevice.createCommandEncoder()
    const pass = encoder.beginComputePass()

    if (linkCount > 0 && res.linkBindGroup) {
      pass.setPipeline(pipelines.link)
      pass.setBindGroup(0, res.linkBindGroup)
      pass.dispatchWorkgroups(linkWorkgroups)
    }

    if (res.manyBodyBindGroup) {
      pass.setPipeline(pipelines.manyBody)
      pass.setBindGroup(0, res.manyBodyBindGroup)
      pass.dispatchWorkgroups(nodeWorkgroups)
    }

    if (res.centerBindGroup) {
      pass.setPipeline(pipelines.center)
      pass.setBindGroup(0, res.centerBindGroup)
      pass.dispatchWorkgroups(1)
    }

    pass.setPipeline(pipelines.integrate)
    pass.setBindGroup(0, res.integrateBindGroup)
    pass.dispatchWorkgroups(nodeWorkgroups)

    pass.end()
    gpuDevice.queue.submit([encoder.finish()])

    scheduleReadback()
  }

  const fallbackToCpu = () => {
    destroyResources()
    pipelines = null
    gpuDevice = null
    initialized = false

    const sim = cpuForceSimulation<N>(nodes, nDim)
    sim.stop()
    sim.alpha(alpha)
    sim.alphaMin(alphaMin)
    sim.alphaDecay(alphaDecay)
    sim.alphaTarget(alphaTarget)
    sim.velocityDecay(1 - velocityDecay)
    sim.randomSource(random)
    for (const [name, force] of forces) sim.force(name, force)
    cpu = sim
  }

  const bootstrap = async () => {
    try {
      const device = await initWebGPU()
      gpuDevice = device
      pipelines = {
        link: createComputePipeline(device, linkForceWgsl),
        manyBody: createComputePipeline(device, manyBodyWgsl),
        center: createComputePipeline(device, centerSumWgsl),
        integrate: createComputePipeline(device, integrateWgsl),
      }
      initialized = true
      staticDirty = true
    } catch (error) {
      console.warn('[d3-force-3d] WebGPU unavailable, falling back to CPU:', error)
      fallbackToCpu()
    } finally {
      gpuReadyResolve(initialized)
    }
  }

  initializeNodes()
  void bootstrap()

  const simulation: GpuCapableSimulation<N> = {
    tick(iterations = 1) {
      if (cpu) return cpu.tick(iterations) as unknown as typeof simulation
      for (let k = 0; k < iterations; k++) {
        alpha += (alphaTarget - alpha) * alphaDecay
        gpuStep()
      }
      emit('tick', simulation)
      return simulation
    },

    restart() {
      if (cpu) cpu.restart()
      return simulation
    },

    stop() {
      if (cpu) cpu.stop()
      return simulation
    },

    nodes(next?: N[]) {
      if (next === undefined) return nodes
      nodes = next
      initializeNodes()
      forces.forEach(initializeForce)
      staticDirty = true
      if (cpu) cpu.nodes(next)
      return simulation
    },

    numDimensions(dimensions?: number) {
      if (dimensions === undefined) return nDim
      nDim = clampDimensions(dimensions)
      initializeNodes()
      forces.forEach(initializeForce)
      staticDirty = true
      if (cpu) cpu.numDimensions(nDim)
      return simulation
    },

    alpha(value?: number) {
      if (value === undefined) return alpha
      alpha = +value
      if (cpu) cpu.alpha(alpha)
      return simulation
    },

    alphaMin(value?: number) {
      if (value === undefined) return alphaMin
      alphaMin = +value
      if (cpu) cpu.alphaMin(alphaMin)
      return simulation
    },

    alphaDecay(value?: number) {
      if (value === undefined) return alphaDecay
      alphaDecay = +value
      if (cpu) cpu.alphaDecay(alphaDecay)
      return simulation
    },

    alphaTarget(value?: number) {
      if (value === undefined) return alphaTarget
      alphaTarget = +value
      if (cpu) cpu.alphaTarget(alphaTarget)
      return simulation
    },

    velocityDecay(value?: number) {
      if (value === undefined) return 1 - velocityDecay
      velocityDecay = 1 - +value
      if (cpu) cpu.velocityDecay(1 - velocityDecay)
      return simulation
    },

    randomSource(source?: () => number) {
      if (source === undefined) return random
      random = source
      forces.forEach(initializeForce)
      if (cpu) cpu.randomSource(source)
      return simulation
    },

    force(name: string, value?: Force<N> | null) {
      if (value === undefined) return forces.get(name)
      if (value === null) {
        forces.delete(name)
      } else {
        forces.set(name, initializeForce(value))
      }
      staticDirty = true
      if (cpu) cpu.force(name, value)
      return simulation
    },

    find(x: number, y: number, z = 0, radius = Infinity) {
      let closest: N | undefined
      let best = radius * radius
      for (const node of nodes) {
        const dx = x - (node.x ?? 0)
        const dy = y - (node.y ?? 0)
        const dz = z - (node.z ?? 0)
        const d2 = dx * dx + dy * dy + dz * dz
        if (d2 < best) {
          closest = node
          best = d2
        }
      }
      return closest
    },

    on(name: string, listener?: (...args: unknown[]) => void) {
      if (listener === undefined) {
        const set = listeners.get(name)
        return set ? Array.from(set)[0] : undefined
      }
      const set = listeners.get(name) ?? new Set()
      set.add(listener)
      listeners.set(name, set)
      return simulation
    },

    isGPUEnabled() {
      return initialized
    },

    gpuReady() {
      return gpuReadyPromise
    },
  }

  return simulation
}
