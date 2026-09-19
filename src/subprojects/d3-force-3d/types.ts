// Shared types for the WebGPU re-implementation of d3-force-3d.
//
// The public surface mirrors the parts of `d3-force-3d` that consumers
// (notably `three-forcegraph`) rely on, so this module can be swapped in via a
// Vite alias without touching the call sites.

export interface SimulationNodeDatum {
  index?: number
  x?: number
  y?: number
  z?: number
  vx?: number
  vy?: number
  vz?: number
  fx?: number | null
  fy?: number | null
  fz?: number | null
  [key: string]: unknown
}

export interface SimulationLinkDatum<N> {
  source: N | string | number
  target: N | string | number
  index?: number
  [key: string]: unknown
}

// A d3-style force is a callable that mutates node velocities/positions for a
// given alpha. GPU-backed forces are configured on the CPU and only their
// parameters are uploaded, so `initialize` is used to resolve link endpoints
// and to evaluate accessor functions.
export interface Force<N> {
  (alpha: number): void
  initialize?: (nodes: N[], random: () => number, numDimensions?: number) => void
  [key: string]: unknown
}

export type ForceName = 'link' | 'charge' | 'manyBody' | 'center' | 'dagRadial' | 'radial' | string

// Getters and setters share a single signature (union return) so the
// implementation can be a plain function with an optional argument.
export interface Simulation<N> {
  tick(iterations?: number): Simulation<N>
  restart(): Simulation<N>
  stop(): Simulation<N>
  nodes(nodes?: N[]): N[] | Simulation<N>
  numDimensions(dimensions?: number): number | Simulation<N>
  alpha(alpha?: number): number | Simulation<N>
  alphaMin(min?: number): number | Simulation<N>
  alphaDecay(decay?: number): number | Simulation<N>
  alphaTarget(target?: number): number | Simulation<N>
  velocityDecay(decay?: number): number | Simulation<N>
  randomSource(source?: () => number): (() => number) | Simulation<N>
  force(name: ForceName, force?: Force<N> | null): Force<N> | undefined | Simulation<N>
  find(x: number, y: number, z?: number, radius?: number): N | undefined
  on(name: string, listener?: (...args: unknown[]) => void): unknown
}

export interface GpuCapableSimulation<N> extends Simulation<N> {
  isGPUEnabled(): boolean
  gpuReady(): Promise<boolean>
}
