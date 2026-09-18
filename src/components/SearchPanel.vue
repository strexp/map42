<template>
  <div class="search-panel">
    <div class="search-input-wrapper hud-panel">
      <Search class="search-icon" :size="16" aria-hidden="true" />
      <input
        :value="searchQuery"
        class="search-input"
        type="text"
        placeholder="Search ASN or name…"
        aria-label="Search ASN or name"
        role="combobox"
        aria-autocomplete="list"
        :aria-expanded="searchResults.length > 0"
        @input="onInput"
        @keydown="onKeydown"
      />
      <button
        v-if="searchQuery"
        class="clear-btn"
        aria-label="Clear search"
        @click="$emit('clear')"
      >
        <X :size="15" />
      </button>
    </div>

    <transition name="results">
      <ul
        v-if="searchResults.length > 0"
        ref="listRef"
        class="search-results hud-panel"
        role="listbox"
      >
        <li
          v-for="(node, index) in searchResults"
          :key="node.id"
          class="result-item"
          :class="{ 'is-active': index === activeIndex }"
          role="option"
          :aria-selected="index === activeIndex"
          @click="$emit('select', node)"
          @mouseenter="activeIndex = index"
        >
          <span class="result-asn">{{ node.asn }}</span>
          <span class="result-name">{{ node.name }}</span>
        </li>
      </ul>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import type { PropType } from 'vue'
import { Search, X } from 'lucide-vue-next'
import type { GraphNode } from '../types'

const props = defineProps({
  searchQuery: { type: String, default: '' },
  searchResults: { type: Array as PropType<GraphNode[]>, default: () => [] },
})

const emit = defineEmits(['update:searchQuery', 'search', 'clear', 'select'])

const listRef = ref<HTMLElement | null>(null)
const activeIndex = ref(-1)

watch(
  () => props.searchResults,
  (results) => {
    activeIndex.value = results.length > 0 ? 0 : -1
  },
)

const onInput = (e: Event) => {
  const val = (e.target as HTMLInputElement).value
  emit('update:searchQuery', val)
  emit('search')
}

const moveActive = (delta: number) => {
  const count = props.searchResults.length
  if (count === 0) return
  activeIndex.value = (activeIndex.value + delta + count) % count
  nextTick(() => {
    listRef.value?.children[activeIndex.value]?.scrollIntoView({ block: 'nearest' })
  })
}

const onKeydown = (e: KeyboardEvent) => {
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault()
      moveActive(1)
      break
    case 'ArrowUp':
      e.preventDefault()
      moveActive(-1)
      break
    case 'Enter': {
      const node = props.searchResults[activeIndex.value]
      if (node) emit('select', node)
      break
    }
    case 'Escape':
      emit('clear')
      break
  }
}
</script>

<style scoped>
.search-panel {
  position: absolute;
  top: 20px;
  left: 20px;
  z-index: 30;
  width: 250px;
}

.search-input-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  transition: border-color 0.2s ease;
}

.search-input-wrapper:focus-within {
  border-color: var(--border-hud-strong);
}

.search-icon {
  flex: 0 0 auto;
  color: var(--accent);
  filter: drop-shadow(0 0 6px var(--accent-glow));
}

.search-input {
  flex: 1 1 auto;
  min-width: 0;
  background: transparent;
  border: none;
  color: var(--text-primary);
  padding: 11px 0;
  outline: none;
  font-size: 0.85rem;
  letter-spacing: 0.02em;
}

.search-input::placeholder {
  color: var(--text-faint);
}

.clear-btn {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  transition: color 0.2s ease;
}

.clear-btn:hover {
  color: var(--accent);
}

.search-results {
  list-style: none;
  margin: 8px 0 0;
  padding: 4px;
  max-height: 300px;
  overflow-y: auto;
}

.result-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  cursor: pointer;
  border-left: 2px solid transparent;
  transition:
    background 0.15s ease,
    border-color 0.15s ease;
}

.result-item:hover,
.result-item.is-active {
  background: var(--accent-soft);
  border-left-color: var(--accent);
}

.result-asn {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  color: var(--accent);
}

.result-name {
  font-size: 0.82rem;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.results-enter-active,
.results-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.results-enter-from,
.results-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

@media (max-width: 640px) {
  .search-panel {
    width: calc(100vw - 40px);
  }
}
</style>
