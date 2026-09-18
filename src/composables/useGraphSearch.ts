// src/composables/useGraphSearch.ts
import { ref } from 'vue'
import type { GraphNode } from '../types'
import { debounce } from '../utils/debounce'
import { fuzzyScore } from '../utils/fuzzy'

const SEARCH_DEBOUNCE_MS = 180
const MAX_RESULTS = 10
const MIN_QUERY_LENGTH = 2

export function useGraphSearch() {
  const searchQuery = ref('')
  const searchResults = ref<GraphNode[]>([])
  const allNodesCache = ref<GraphNode[]>([])

  const setNodesCache = (nodes: GraphNode[]) => {
    allNodesCache.value = nodes
  }

  const runSearch = () => {
    const query = searchQuery.value.trim().toLowerCase()
    if (query.length < MIN_QUERY_LENGTH) {
      searchResults.value = []
      return
    }

    const scored: { node: GraphNode; score: number }[] = []
    for (const node of allNodesCache.value) {
      const nameScore = fuzzyScore(query, node.name)
      const asnScore = fuzzyScore(query, node.asn)
      const best = Math.max(nameScore ?? -Infinity, asnScore ?? -Infinity)
      if (best > -Infinity) scored.push({ node, score: best })
    }

    scored.sort((a, b) => b.score - a.score)
    searchResults.value = scored.slice(0, MAX_RESULTS).map((entry) => entry.node)
  }

  const handleSearch = debounce(runSearch, SEARCH_DEBOUNCE_MS)

  const clearSearch = () => {
    handleSearch.cancel()
    searchQuery.value = ''
    searchResults.value = []
  }

  return {
    searchQuery,
    searchResults,
    handleSearch,
    clearSearch,
    setNodesCache,
  }
}
