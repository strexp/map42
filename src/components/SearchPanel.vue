<template>
  <div class="search-panel">
    <div class="search-input-wrapper">
      <span class="search-icon">🔍</span>
      <input
        :value="searchQuery"
        @input="onInput"
        placeholder="Search ASN or Name..."
        class="search-input"
      />
      <button v-if="searchQuery" @click="$emit('clear')" class="clear-btn">✕</button>
    </div>
    <ul v-if="searchResults.length > 0" class="search-results">
      <li
        v-for="node in searchResults"
        :key="node.id"
        @click="$emit('select', node)"
        class="result-item"
      >
        <span class="result-asn">{{ node.asn }}</span>
        <span class="result-name">{{ node.name }}</span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import type { GraphNode } from '../types'

defineProps({
  searchQuery: String,
  searchResults: Array as PropType<GraphNode[]>,
})

const emit = defineEmits(['update:searchQuery', 'search', 'clear', 'select'])

const onInput = (e: Event) => {
  const val = (e.target as HTMLInputElement).value
  emit('update:searchQuery', val)
  emit('search')
}
</script>

<style scoped>
.search-panel {
  position: absolute;
  top: 20px;
  left: 20px;
  z-index: 30;
  width: 250px;
  font-family: 'Segoe UI', sans-serif;
}

.search-input-wrapper {
  display: flex;
  align-items: center;
  background: rgba(20, 20, 25, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  padding: 0 10px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
}

.search-icon {
  margin-right: 8px;
  font-size: 14px;
  filter: grayscale(1);
}

.search-input {
  background: transparent;
  border: none;
  color: #fff;
  padding: 10px 0;
  width: 100%;
  outline: none;
  font-size: 14px;
}

.clear-btn {
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  font-size: 16px;
}
.clear-btn:hover {
  color: #fff;
}

.search-results {
  list-style: none;
  margin: 5px 0 0 0;
  padding: 0;
  background: rgba(30, 30, 35, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  max-height: 300px;
  overflow-y: auto;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.6);
}

.result-item {
  padding: 8px 12px;
  cursor: pointer;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  display: flex;
  flex-direction: column;
  transition: background 0.2s;
}

.result-item:hover {
  background: rgba(0, 255, 255, 0.1);
}

.result-asn {
  font-size: 12px;
  color: #00bcd4;
  font-family: monospace;
}

.result-name {
  font-size: 13px;
  color: #ddd;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
