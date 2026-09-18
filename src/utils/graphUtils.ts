// src/utils/graphUtils.ts
import type { GraphLink, GraphNode, MapEdge, MapNode, ProcessedGraph } from '../types'

export const processGraphData = (rawNodes: MapNode[], rawEdges: MapEdge[]) => {
  const nodesMap = new Map<string, GraphNode>()

  const processedNodes: GraphNode[] = rawNodes.map((n) => {
    const val = (n.size || 1) * 40 - 60
    const node: GraphNode = {
      ...n,
      id: String(n.id),
      val: val > 0 ? val : 5,
      peers: new Set(),
      links: [],
    }
    nodesMap.set(node.id, node)
    return node
  })

  const processedEdges: GraphLink[] = rawEdges.map((e) => {
    const sId = String(e.sourceID)
    const tId = String(e.targetID)
    const sourceNode = nodesMap.get(sId)
    const targetNode = nodesMap.get(tId)

    const link: GraphLink = {
      source: sId,
      target: tId,
      _state: 0,
    }

    if (sourceNode && targetNode) {
      sourceNode.peers.add(targetNode)
      targetNode.peers.add(sourceNode)
      sourceNode.links.push(link)
      targetNode.links.push(link)
    }

    return link
  })

  return { nodes: processedNodes, links: processedEdges, nodesMap }
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
