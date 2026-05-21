// src/composables/useGraphInteraction.ts
import { shallowRef } from 'vue'
import type { GraphNode, GraphLink, GraphConfig } from '../types'

export function useGraphInteraction(config: GraphConfig) {
  const selectedNode = shallowRef<GraphNode | null>(null)
  const highlightNodes = shallowRef<Set<string>>(new Set())
  const highlight2Nodes = shallowRef<Set<string>>(new Set())

  // 保持对修改过的 Link 的引用，以便重置状态
  let modifiedLinks: GraphLink[] = []

  const updateSelected = (node: GraphNode | null, callback?: () => void) => {
    // Reset previous states
    modifiedLinks.forEach((link) => {
      link._state = 0
    })
    modifiedLinks = []

    highlightNodes.value.clear()
    highlight2Nodes.value.clear()

    selectedNode.value = node

    if (node) {
      highlightNodes.value.add(node.id)

      node.links.forEach((link) => {
        link._state = 1
        modifiedLinks.push(link)

        // Determine the other node ID
        const otherNodeId =
          (typeof link.source === 'object' ? (link.source as GraphNode).id : link.source) === node.id
            ? typeof link.target === 'object'
              ? (link.target as GraphNode).id
              : link.target
            : typeof link.source === 'object'
              ? (link.source as GraphNode).id
              : link.source

        if (typeof otherNodeId === 'string') highlightNodes.value.add(otherNodeId)
      })

      if (config.showHop2) {
        node.peers.forEach((peer) => {
          peer.links.forEach((link) => {
            if (link._state === 1) return

            if (link._state !== 2) {
              link._state = 2
              modifiedLinks.push(link)
            }

            const sId = typeof link.source === 'object' ? (link.source as GraphNode).id : link.source
            const tId = typeof link.target === 'object' ? (link.target as GraphNode).id : link.target

            if (!highlightNodes.value.has(sId as string)) highlight2Nodes.value.add(sId as string)
            if (!highlightNodes.value.has(tId as string)) highlight2Nodes.value.add(tId as string)
          })
        })
      }
    }

    if (callback) callback()
  }

  return {
    selectedNode,
    highlightNodes,
    highlight2Nodes,
    updateSelected
  }
}
