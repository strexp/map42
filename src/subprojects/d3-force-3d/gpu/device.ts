/// <reference types="@webgpu/types" />

// WebGPU device lifecycle for the force engine. A single device is shared by
// every simulation instance; it is created lazily and dropped when the GPU
// reports the device as lost so a later attempt can recreate it.

let device: GPUDevice | null = null
let adapter: GPUAdapter | null = null
let initPromise: Promise<GPUDevice> | null = null

export function isWebGPUAvailable(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.gpu
}

export async function checkWebGPUSupport(): Promise<boolean> {
  if (!isWebGPUAvailable()) return false
  try {
    const probe = await navigator.gpu.requestAdapter()
    return !!probe
  } catch {
    return false
  }
}

export async function initWebGPU(): Promise<GPUDevice> {
  if (device) return device
  if (initPromise) return initPromise

  initPromise = (async () => {
    if (!isWebGPUAvailable()) throw new Error('WebGPU is not supported in this browser')

    adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
    if (!adapter) throw new Error('No WebGPU adapter available')

    device = await adapter.requestDevice({
      requiredLimits: {
        maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
        maxBufferSize: adapter.limits.maxBufferSize,
        maxComputeWorkgroupsPerDimension: adapter.limits.maxComputeWorkgroupsPerDimension,
      },
    })

    device.lost.then((info) => {
      console.error('[d3-force-3d] WebGPU device lost:', info.message)
      device = null
      adapter = null
      initPromise = null
    })

    device.onuncapturederror = (event) => {
      console.error('[d3-force-3d] WebGPU uncaptured error:', event.error)
    }

    return device
  })()

  return initPromise
}

export function getDevice(): GPUDevice | null {
  return device
}

export function createComputePipeline(
  gpu: GPUDevice,
  code: string,
  entryPoint = 'main',
): GPUComputePipeline {
  const module = gpu.createShaderModule({ code })
  return gpu.createComputePipeline({
    layout: 'auto',
    compute: { module, entryPoint },
  })
}
