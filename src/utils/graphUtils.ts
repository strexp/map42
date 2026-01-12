// src/utils/graphUtils.ts
import type { GraphLink, GraphNode, MapEdge, MapNode } from '../types'

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
