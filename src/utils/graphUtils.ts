// src/utils/graphUtils.ts
import type {
  GraphLink,
  GraphNode,
  MapData,
  ProcessedGraph,
  ProcessedLink,
  ProcessedNode,
} from '../types'

const pushPeer = (map: Map<string, string[]>, key: string, value: string) => {
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}

/**
 * Pure, serializable transform from the raw API payload to the worker shape.
 * Shared by the Web Worker and the main-thread fallback so both paths agree.
 */
export const buildProcessedGraph = (data: MapData): ProcessedGraph => {
  const validIds = new Set(data.nodes.map((node) => String(node.id)))
  const peerMap = new Map<string, string[]>()
  const links: ProcessedLink[] = []

  for (const edge of data.edges) {
    const source = String(edge.sourceID)
    const target = String(edge.targetID)
    if (!validIds.has(source) || !validIds.has(target)) continue

    links.push({ source, target })
    pushPeer(peerMap, source, target)
    pushPeer(peerMap, target, source)
  }

  const nodes: ProcessedNode[] = data.nodes.map((node) => {
    const id = String(node.id)
    const size = node.size || 1
    const rawVal = size * 40 - 60
    return {
      id,
      asn: node.asn,
      name: node.name,
      size,
      centrality: node.centrality,
      val: rawVal > 0 ? rawVal : 5,
      peerIds: peerMap.get(id) ?? [],
    }
  })

  return { nodes, links }
}

/** Resolve a link's endpoints, which `3d-force-graph` swaps to node objects. */
export const resolveLinkEnds = (
  link: GraphLink,
): { source: GraphNode | null; target: GraphNode | null; sourceId: string; targetId: string } => {
  const source = typeof link.source === 'object' ? link.source : null
  const target = typeof link.target === 'object' ? link.target : null
  return {
    source,
    target,
    sourceId: source?.id ?? String(link.source),
    targetId: target?.id ?? String(link.target),
  }
}

// Rebuild the object graph (Sets / cross references) from the worker payload.
export const hydrateProcessedGraph = (processed: ProcessedGraph) => {
  const nodes: GraphNode[] = processed.nodes.map((n) => ({
    id: n.id,
    asn: n.asn,
    name: n.name,
    size: n.size,
    centrality: n.centrality,
    val: n.val,
    peers: new Set(),
    links: [],
  }))
  const nodesMap = new Map(nodes.map((node) => [node.id, node]))

  for (const processedNode of processed.nodes) {
    const node = nodesMap.get(processedNode.id)
    if (!node) continue
    for (const peerId of processedNode.peerIds) {
      const peer = nodesMap.get(peerId)
      if (peer) node.peers.add(peer)
    }
  }

  const links: GraphLink[] = processed.links.map((l) => {
    const link: GraphLink = { source: l.source, target: l.target, _state: 0 }
    const source = nodesMap.get(l.source)
    const target = nodesMap.get(l.target)
    if (source && target) {
      source.links.push(link)
      target.links.push(link)
    }
    return link
  })

  return { nodes, links }
}
