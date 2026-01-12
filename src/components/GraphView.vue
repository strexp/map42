<template>
  <div class="graph-wrapper">
    <!-- 3D 容器 -->
    <div ref="container" id="container"></div>

    <!-- 搜索面板组件 -->
    <SearchPanel
      v-model:searchQuery="searchQuery"
      :searchResults="searchResults"
      @search="handleSearch"
      @clear="clearSearch"
      @select="selectFromSearch"
    />

    <!-- 性能统计 Stats 挂载点 -->
    <div ref="statsContainer" class="stats-panel"></div>

    <!-- 详细信息卡片 -->
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
import { onMounted, ref, reactive, watch, type PropType } from 'vue'
import Stats from 'stats.js'

import InfoCard from '@/components/InfoCard.vue'
import SearchPanel from '@/components/SearchPanel.vue'

import type { GraphConfig, GraphNode, MapData } from './types'
import { processGraphData } from '@/utils/graphUtils'
import { useGraphSearch } from '@/composables/useGraphSearch'
import { useGraphInteraction } from '@/composables/useGraphInteraction'
import { useGraphEngine } from '@/composables/useGraphEngine'

const props = defineProps({
  data: Object as PropType<MapData>,
})

// DOM Refs
const container = ref<HTMLElement | null>(null)
const statsContainer = ref<HTMLElement | null>(null)
const stats = ref<Stats | null>(null)

// Config State
const config: GraphConfig = reactive({
  showHop2: true,
  showBg: true,
  showText: true,
  isRotating: false,
})

// Composables
const { searchQuery, searchResults, handleSearch, clearSearch, setNodesCache } = useGraphSearch()
const { selectedNode, highlightNodes, highlight2Nodes, updateSelected } = useGraphInteraction(config)
const {
  initGraph,
  updateGraphData,
  refreshVisuals,
  updateBackground,
  focusNode,
  toggleRotation: engineToggleRotation,
  setRotationTarget
} = useGraphEngine()

// --- Actions ---

const handleNodeClick = (node: GraphNode) => {
  if (!node) return
  if (selectedNode.value && selectedNode.value.id === node.id) return

  // 停止旋转
  if (config.isRotating) {
    config.isRotating = false
    engineToggleRotation(false)
  }

  updateSelected(node, () => {
    refreshVisuals()
  })
}

const handleClose = () => {
  updateSelected(null, () => {
    refreshVisuals()
  })
  clearSearch()
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
  refreshVisuals() // refreshVisuals 内部会重新调用 nodeThreeObject，读取最新的 config
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

onMounted(() => {
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
    onTick: () => stats.value?.update()
  })

  // Initial Data Load
  const { nodes, links } = processGraphData(props.data.nodes, props.data.edges)
  setNodesCache(nodes)
  updateGraphData(nodes, links)
})

watch(
  () => props.data,
  (newData) => {
    if (newData) {
      handleClose()
      if (config.isRotating) {
        config.isRotating = false
        engineToggleRotation(false)
      }
      const { nodes, links } = processGraphData(newData.nodes, newData.edges)
      setNodesCache(nodes)
      updateGraphData(nodes, links)
    }
  },
  { deep: true },
)
</script>

<style scoped>
.graph-wrapper {
  position: relative;
  width: 100%;
  height: 100vh;
  background-color: #000;
  overflow: hidden;
  font-family: 'Segoe UI', sans-serif;
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
