// WebGPU re-implementation of `d3-force-3d`.
//
// The force factories are the battle-tested CPU implementations from the
// original package (used as the fallback and as the configuration surface),
// while `forceSimulation` swaps in a GPU compute pipeline when WebGPU is
// available.

export {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceRadial,
  forceX,
  forceY,
  forceZ,
} from 'd3-force-3d-cpu'

export { default as forceSimulation } from './simulation'
export { checkWebGPUSupport, isWebGPUAvailable } from './gpu/device'
export type { Force, Simulation, SimulationLinkDatum, SimulationNodeDatum } from './types'
