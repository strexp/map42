// Public entry point. Picks the WebGPU engine when the browser exposes it and
// otherwise delegates to the original CPU `d3-force-3d` implementation.

import { forceSimulation as cpuForceSimulation } from 'd3-force-3d-cpu'
import { isWebGPUAvailable } from './gpu/device'
import { createGpuSimulation } from './gpu/simulation'
import type { Simulation, SimulationNodeDatum } from './types'

export default function forceSimulation<N extends SimulationNodeDatum>(
  nodes?: N[],
  numDimensions?: number,
): Simulation<N> {
  const initialNodes = nodes ?? []
  if (!isWebGPUAvailable()) {
    console.log("warning: webgpu not supported")
    return cpuForceSimulation<N>(initialNodes, numDimensions)
  }
  return createGpuSimulation<N>(initialNodes, numDimensions)
}
