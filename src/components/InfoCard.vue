<template>
  <transition name="fade">
    <div v-if="selectedNode" class="info-card">
      <div class="card-header">
        <div class="card-title">{{ selectedNode.name }}</div>
        <button class="close-btn" @click="$emit('handleClose')">✕</button>
      </div>
      <div class="card-subtitle">
        <div class="asn-row">
          <span class="badge">{{ selectedNode.asn }}</span>
          <button class="icon-btn" @click="$emit('focusSelect')" title="Center Camera">⌖</button>
        </div>
        <div class="meta">
          <span>Centrality: {{ formatNumber(selectedNode.centrality) }}</span>
        </div>
      </div>
      <div class="divider"></div>
      <div class="card-text peers-view">
        <b>Peers: {{ selectedNode.peers?.size || 0 }}</b>
        <div class="peer-list">
          <span
            v-for="peer in Array.from(selectedNode.peers || [])"
            :key="peer.id"
            class="peer-item"
            @click.stop="$emit('handleNodeClick', peer)"
          >
            {{ peer.name }}
          </span>
        </div>
      </div>

      <div class="divider"></div>
      <div class="toolbar">
        <button
          class="tool-btn"
          @click="$emit('toggleHop2')"
          :class="{ active: config.showHop2 }"
          title="Toggle Hop 2"
        >
          ☍ 2nd Hop
        </button>
        <button
          class="tool-btn"
          @click="$emit('toggleBg')"
          :class="{ active: config.showBg }"
          title="Toggle Background"
        >
          ☁ BG
        </button>
        <button
          class="tool-btn"
          @click="$emit('toggleText')"
          :class="{ active: config.showText }"
          title="Toggle Text"
        >
          T Text
        </button>
        <button
          class="tool-btn"
          @click="$emit('toggleRotation')"
          :class="{ active: config.isRotating }"
          title="Auto Rotate"
        >
          ↻ Rotate
        </button>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import type { GraphConfig, GraphNode } from './types'

defineProps({
  config: { type: Object as PropType<GraphConfig>, required: true },
  selectedNode: Object as PropType<GraphNode | null>,
})

defineEmits([
  'handleClose',
  'focusSelect',
  'toggleHop2',
  'toggleBg',
  'toggleText',
  'toggleRotation',
  'handleNodeClick',
])

const formatNumber = (val: string | number) => {
  const n = Number(val)
  return isNaN(n) ? val : n.toFixed(4)
}
</script>

<style scoped>
.info-card {
  position: absolute;
  top: 20px;
  right: 20px;
  width: 320px;
  background: rgba(30, 30, 30, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #fff;
  border-radius: 4px;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  z-index: 20;
}

.card-header {
  padding: 16px;
  display: flex;
  justify-content: space-between;
  align-items: start;
}

.card-title {
  font-size: 1.25rem;
  font-weight: 500;
  line-height: 1.2;
}

.close-btn {
  background: transparent;
  border: none;
  color: #aaa;
  font-size: 1.2rem;
  cursor: pointer;
  line-height: 1;
}
.close-btn:hover {
  color: #fff;
}

.card-subtitle {
  padding: 0 16px 16px;
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.7);
}

.asn-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.badge {
  font-family: monospace;
  background: #444;
  padding: 2px 4px;
  border-radius: 3px;
}

.icon-btn {
  background: none;
  border: none;
  color: #00bcd4;
  cursor: pointer;
  font-size: 1.1em;
  padding: 0;
}

.divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.12);
  width: 100%;
}

.card-text {
  padding: 16px;
  font-size: 0.875rem;
}

.peers-view {
  max-height: 200px;
  overflow-y: auto;
}

.peer-list {
  margin-top: 8px;
}

.peer-item {
  display: block;
  padding: 4px 0;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}
.peer-item:hover {
  color: #00bcd4;
}

.toolbar {
  display: flex;
  justify-content: space-around;
  padding: 8px;
  background: rgba(0, 0, 0, 0.2);
}

.tool-btn {
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.9rem;
  cursor: pointer;
  padding: 8px;
  border-radius: 4px;
  transition: all 0.2s;
}

.tool-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.tool-btn.active {
  color: #00bcd4;
  text-shadow: 0 0 5px rgba(0, 188, 212, 0.5);
}
</style>
