// src/composables/useGraphInteraction.ts
import { shallowRef } from 'vue'
import type { GraphNode, GraphLink, GraphConfig } from '../types'
import { resolveLinkEnds } from '../utils/graphUtils'

export function useGraphInteraction(config: GraphConfig) {
  const selectedNode = shallowRef<GraphNode | null>(null)
  const highlightNodes = shallowRef<Set<string>>(new Set())
  const highlight2Nodes = shallowRef<Set<string>>(new Set())

  // Keep references to modified links so their state can be reset
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

        const { sourceId, targetId } = resolveLinkEnds(link)
        highlightNodes.value.add(sourceId === node.id ? targetId : sourceId)
      })

      if (config.showHop2) {
        node.peers.forEach((peer) => {
          peer.links.forEach((link) => {
            if (link._state === 1) return

            if (link._state !== 2) {
              link._state = 2
              modifiedLinks.push(link)
            }

            const { sourceId, targetId } = resolveLinkEnds(link)

            if (!highlightNodes.value.has(sourceId)) highlight2Nodes.value.add(sourceId)
            if (!highlightNodes.value.has(targetId)) highlight2Nodes.value.add(targetId)
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
    updateSelected,
  }
}
