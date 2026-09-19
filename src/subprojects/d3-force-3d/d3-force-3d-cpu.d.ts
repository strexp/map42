declare module 'd3-force-3d-cpu' {
  export function forceSimulation<N>(
    nodes?: N[],
    numDimensions?: number,
  ): import('./types').Simulation<N>
  export function forceLink<N>(links?: unknown[]): import('./types').Force<N>
  export function forceManyBody<N>(): import('./types').Force<N>
  export function forceCenter<N>(x?: number, y?: number, z?: number): import('./types').Force<N>
  export function forceRadial<N>(
    radius?: unknown,
    x?: number,
    y?: number,
    z?: number,
  ): import('./types').Force<N>
  export function forceX<N>(x?: number): import('./types').Force<N>
  export function forceY<N>(y?: number): import('./types').Force<N>
  export function forceZ<N>(z?: number): import('./types').Force<N>
  export function forceCollide<N>(radius?: unknown): import('./types').Force<N>
}
