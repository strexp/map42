import * as THREE from 'three'

interface GraphLink {
  source: string | GraphNode
  target: string | GraphNode
  _state?: number // 0:default, 1:hop1, 2:hop2
  __threeObj?: THREE.Object3D
}

interface GraphNode {
  id: string
  asn: string
  name: string
  size: number
  centrality: string
  val: number
  peers: Set<GraphNode>

  links: GraphLink[]
  x?: number
  y?: number
  z?: number
}

interface MapNode {
  id: string
  asn: string
  name: string
  size: number
  centrality: string
  color: string
}

interface MapEdge {
  sourceID: string
  targetID: string
}

interface MapData {
  created: number
  nodes: MapNode[]
  edges: MapEdge[]
}

interface GraphConfig {
  showHop2: boolean
  showBg: boolean
  showText: boolean
  isRotating: boolean
}

export type { GraphConfig, MapData, MapNode, MapEdge, GraphNode, GraphLink }
