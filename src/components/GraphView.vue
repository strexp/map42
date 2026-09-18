<template>
  <div class="graph-wrapper">
    <!-- 3D canvas -->
    <div ref="container" id="container"></div>

    <!-- Search panel -->
    <SearchPanel
      v-model:searchQuery="searchQuery"
      :searchResults="searchResults"
      @search="handleSearch"
      @clear="clearSearch"
      @select="selectFromSearch"
    />

    <!-- Stats.js mount point -->
    <div ref="statsContainer" class="stats-panel"></div>

    <!-- Details card -->
    <InfoCard
      :selectedNode="selectedNode"
      :config="config"
      @handleClose="handleClose"
      @focusSelect="focusSelect"
      @toggleHop2="toggleHop2"
      @toggleBg="toggleBg"
      @toggleText="toggleText"
      @toggleRotation="toggleRotation"
      @handleNodeClick="handleNodeClick"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch, markRaw, type PropType } from 'vue'
import Stats from 'stats.js'

import InfoCard from '@/components/InfoCard.vue'
import SearchPanel from '@/components/SearchPanel.vue'

import type { GraphNode, MapData } from '@/types'
import { buildProcessedGraph, hydrateProcessedGraph } from '@/utils/graphUtils'
import { readUrlState, writeUrlState } from '@/utils/urlState'
import { useGraphSearch } from '@/composables/useGraphSearch'
import { useGraphInteraction } from '@/composables/useGraphInteraction'
import { useGraphEngine } from '@/composables/useGraphEngine'
import { useGraphConfig } from '@/composables/useGraphConfig'
import { useGraphProcessor } from '@/composables/useGraphProcessor'

const props = defineProps({
  data: Object as PropType<MapData>,
})

// DOM Refs
const container = ref<HTMLElement | null>(null)
const statsContainer = ref<HTMLElement | null>(null)
const stats = ref<Stats | null>(null)

// Config State
const config = useGraphConfig()

// Composables
const { searchQuery, searchResults, handleSearch, clearSearch, setNodesCache } = useGraphSearch()
const { selectedNode, highlightNodes, highlight2Nodes, updateSelected } =
  useGraphInteraction(config)
const {
  initGraph,
  updateGraphData,
  refreshVisuals,
  updateBackground,
  focusNode,
  toggleRotation: engineToggleRotation,
  setRotationTarget,
} = useGraphEngine()
const { process: processGraph } = useGraphProcessor()

// --- Data processing ---

const buildGraph = async (data: MapData) => {
  try {
    const processed = await processGraph(data)
    return hydrateProcessedGraph(processed)
  } catch (error) {
    console.warn('Graph worker unavailable, processing on main thread:', error)
    return hydrateProcessedGraph(buildProcessedGraph(data))
  }
}

let dataToken = 0

const applyData = async (data: MapData) => {
  const token = ++dataToken
  const { nodes, links } = await buildGraph(data)
  if (token !== dataToken) return null

  const rawNodes = markRaw(nodes)
  const rawLinks = markRaw(links)
  setNodesCache(rawNodes)
  updateGraphData(rawNodes, rawLinks)
  return rawNodes
}

// --- Actions ---

const handleNodeClick = (node: GraphNode) => {
  if (!node) return
  if (selectedNode.value && selectedNode.value.id === node.id) return

  // Stop rotation
  if (config.isRotating) {
    config.isRotating = false
    engineToggleRotation(false)
  }

  updateSelected(node, () => {
    refreshVisuals()
  })
  writeUrlState({ asn: node.asn })
}

const handleClose = () => {
  updateSelected(null, () => {
    refreshVisuals()
  })
  clearSearch()
  writeUrlState({ asn: null })
}

const selectFromSearch = (node: GraphNode) => {
  handleNodeClick(node)
  focusSelect()
  clearSearch()
}

const focusSelect = () => {
  if (selectedNode.value) {
    focusNode(selectedNode.value)
  }
}

// --- Toggles ---

const toggleHop2 = () => {
  config.showHop2 = !config.showHop2
  if (selectedNode.value) {
    updateSelected(selectedNode.value, () => refreshVisuals())
  }
}

const toggleBg = () => {
  config.showBg = !config.showBg
  updateBackground(config.showBg)
}

const toggleText = () => {
  config.showText = !config.showText
  refreshVisuals()
}

const toggleRotation = () => {
  if (!selectedNode.value) return
  config.isRotating = !config.isRotating

  if (config.isRotating) {
    const { x, y, z } = selectedNode.value
    setRotationTarget(x || 0, y || 0, z || 0)
    engineToggleRotation(true)
  } else {
    engineToggleRotation(false)
  }
}

// --- Lifecycle & Watchers ---

onMounted(async () => {
  if (!props.data || !container.value) return

  // Init Stats
  if (statsContainer.value) {
    stats.value = new Stats()
    stats.value.showPanel(0)
    stats.value.dom.style.bottom = '0px'
    stats.value.dom.style.top = ''
    statsContainer.value.appendChild(stats.value.dom)
  }

  // Init 3D Graph
  initGraph({
    container: container.value,
    config,
    selectedNode,
    highlightNodes,
    highlight2Nodes,
    onNodeClick: handleNodeClick,
    onBgClick: handleClose,
    onTick: () => stats.value?.update(),
  })

  // Initial data load
  const nodes = await applyData(props.data)
  if (!nodes) return

  // Restore the node referenced by the shared URL.
  const { asn } = readUrlState()
  if (!asn) return
  const target = nodes.find((node) => node.asn === asn)
  if (!target) return

  handleNodeClick(target)
  window.setTimeout(() => focusNode(target), 1000)
})

watch(
  () => props.data,
  async (newData) => {
    if (!newData) return
    handleClose()
    if (config.isRotating) {
      config.isRotating = false
      engineToggleRotation(false)
    }
    await applyData(newData)
  },
)
</script>

<style scoped>
.graph-wrapper {
  position: relative;
  width: 100%;
  height: 100vh;
  background-color: var(--bg-void);
  overflow: hidden;
  font-family: var(--font-sans);
}

#container {
  width: 100%;
  height: 100%;
}

.stats-panel {
  position: absolute;
  bottom: 0;
  left: 0;
  z-index: 5;
  pointer-events: none;
}
</style>
