<template>
  <transition name="fade">
    <div v-if="selectedNode" class="info-card hud-panel">
      <div class="card-header">
        <div class="card-title">{{ selectedNode.name }}</div>
        <button class="close-btn" aria-label="Close details" @click="$emit('handleClose')">
          <X :size="16" />
        </button>
      </div>

      <div class="card-subtitle">
        <div class="asn-row">
          <span class="badge">{{ selectedNode.asn }}</span>
          <button
            class="icon-btn"
            title="Center camera"
            aria-label="Center camera"
            @click="$emit('focusSelect')"
          >
            <Crosshair :size="16" />
          </button>
        </div>
        <div class="meta">
          <span class="hud-label">Centrality</span>
          <span class="meta-value">{{ formatNumber(selectedNode.centrality) }}</span>
        </div>
      </div>

      <div class="divider"></div>

      <div class="card-text peers-view">
        <div class="peers-heading">
          <Share2 :size="14" aria-hidden="true" />
          <b>Peers: {{ selectedNode.peers?.size || 0 }}</b>
        </div>
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
          class="hud-btn tool-btn"
          :class="{ 'is-active': config.showHop2 }"
          title="Toggle 2nd hop"
          @click="$emit('toggleHop2')"
        >
          <Waypoints :size="15" aria-hidden="true" />
          <span>2nd Hop</span>
        </button>
        <button
          class="hud-btn tool-btn"
          :class="{ 'is-active': config.showBg }"
          title="Toggle background"
          @click="$emit('toggleBg')"
        >
          <Cloud v-if="config.showBg" :size="15" aria-hidden="true" />
          <CloudOff v-else :size="15" aria-hidden="true" />
          <span>BG</span>
        </button>
        <button
          class="hud-btn tool-btn"
          :class="{ 'is-active': config.showText }"
          title="Toggle labels"
          @click="$emit('toggleText')"
        >
          <Type :size="15" aria-hidden="true" />
          <span>Text</span>
        </button>
        <button
          class="hud-btn tool-btn"
          :class="{ 'is-active': config.isRotating }"
          title="Auto rotate"
          @click="$emit('toggleRotation')"
        >
          <RotateCw :size="15" aria-hidden="true" />
          <span>Rotate</span>
        </button>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import { Cloud, CloudOff, Crosshair, RotateCw, Share2, Type, Waypoints, X } from 'lucide-vue-next'
import type { GraphConfig, GraphNode } from '../types'

defineProps({
  config: { type: Object as PropType<GraphConfig>, required: true },
  selectedNode: { type: Object as PropType<GraphNode | null>, default: null },
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
  return isNaN(n) ? String(val) : n.toFixed(4)
}
</script>

<style scoped>
.info-card {
  position: absolute;
  top: 20px;
  right: 20px;
  width: 320px;
  max-width: calc(100vw - 40px);
  z-index: 20;
  display: flex;
  flex-direction: column;
}

.card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 16px 16px 8px;
}

.card-title {
  font-size: 1.15rem;
  font-weight: 500;
  line-height: 1.25;
  color: var(--text-primary);
  text-shadow: 0 0 14px rgba(34, 227, 255, 0.25);
}

.close-btn {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  background: transparent;
  border: 1px solid transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition:
    color 0.2s ease,
    border-color 0.2s ease;
}

.close-btn:hover {
  color: var(--accent);
  border-color: var(--border-hud);
}

.card-subtitle {
  padding: 0 16px 14px;
}

.asn-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.badge {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  color: var(--accent);
  background: var(--accent-soft);
  border: 1px solid var(--border-hud);
  padding: 2px 6px;
}

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
  background: none;
  border: none;
  color: var(--accent);
  cursor: pointer;
  filter: drop-shadow(0 0 6px var(--accent-glow));
  transition: transform 0.2s ease;
}

.icon-btn:hover {
  transform: scale(1.15);
}

.meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.meta-value {
  font-family: var(--font-mono);
  font-size: 0.82rem;
  color: var(--text-primary);
}

.divider {
  height: 1px;
  width: 100%;
  background: linear-gradient(90deg, transparent, var(--border-hud), transparent);
}

.card-text {
  padding: 14px 16px;
  font-size: 0.85rem;
}

.peers-view {
  max-height: 200px;
  overflow-y: auto;
}

.peers-heading {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-primary);
}

.peers-heading svg {
  color: var(--accent);
}

.peer-list {
  margin-top: 8px;
}

.peer-item {
  display: block;
  padding: 5px 6px;
  color: var(--text-muted);
  cursor: pointer;
  border-left: 2px solid transparent;
  transition:
    color 0.15s ease,
    background 0.15s ease,
    border-color 0.15s ease;
}

.peer-item:hover {
  color: var(--accent);
  background: var(--accent-soft);
  border-left-color: var(--accent);
}

.toolbar {
  display: flex;
  justify-content: space-between;
  gap: 2px;
  padding: 6px;
  background: rgba(0, 0, 0, 0.25);
}

.tool-btn {
  flex: 1 1 0;
  flex-direction: column;
  gap: 3px;
  padding: 8px 4px;
  font-size: 0.66rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-family: var(--font-mono);
}

.fade-enter-active,
.fade-leave-active {
  transition:
    opacity 0.22s ease,
    transform 0.22s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateX(14px);
}

@media (max-width: 640px) {
  .info-card {
    top: auto;
    bottom: 12px;
    right: 12px;
    left: 12px;
    width: auto;
  }
}
</style>
