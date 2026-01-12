// src/composables/useGraphSearch.ts
import { ref } from 'vue'
import type { GraphNode } from '../types'

export function useGraphSearch() {
  const searchQuery = ref('')
  const searchResults = ref<GraphNode[]>([])
  const allNodesCache = ref<GraphNode[]>([])

  const setNodesCache = (nodes: GraphNode[]) => {
    allNodesCache.value = nodes
  }

  const handleSearch = () => {
    const query = searchQuery.value.trim().toLowerCase()
    if (!query || query.length < 2) {
      searchResults.value = []
      return
    }
    searchResults.value = allNodesCache.value
      .filter((n) => n.asn.toLowerCase().includes(query) || n.name.toLowerCase().includes(query))
      .slice(0, 10)
  }

  const clearSearch = () => {
    searchQuery.value = ''
    searchResults.value = []
  }

  return {
    searchQuery,
    searchResults,
    handleSearch,
    clearSearch,
    setNodesCache
  }
}
