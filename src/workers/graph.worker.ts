import type { MapData, MapNode, ProcessedGraph, ProcessedLink, ProcessedNode } from '../types'

interface WorkerRequest {
  id: number
  data: MapData
}

interface WorkerResponse {
  id: number
  result?: ProcessedGraph
  error?: string
}

const pushPeer = (map: Map<string, string[]>, key: string, value: string) => {
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}

const process = (data: MapData): ProcessedGraph => {
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

  const nodes: ProcessedNode[] = data.nodes.map((node: MapNode) => {
    const id = String(node.id)
    const size = node.size || 1
    const rawVal = size * 40 - 60
    return {
      id,
      asn: node.asn,
      name: node.name,
      size,
      centrality: node.centrality,
      color: node.color,
      val: rawVal > 0 ? rawVal : 5,
      peerIds: peerMap.get(id) ?? [],
    }
  })

  return { nodes, links }
}

const ctx = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null
  postMessage: (message: WorkerResponse) => void
}

ctx.onmessage = (event) => {
  const { id, data } = event.data
  try {
    ctx.postMessage({ id, result: process(data) })
  } catch (error) {
    ctx.postMessage({ id, error: error instanceof Error ? error.message : String(error) })
  }
}
