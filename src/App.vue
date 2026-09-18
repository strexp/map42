<template>
  <div class="app-container">
    <div class="version-toggle">
      <button
        class="hud-btn version-btn"
        :class="{ 'is-active': currentVersion === 'ipv4' }"
        @click="switchVersion('ipv4')"
      >
        IPv4
      </button>
      <button
        class="hud-btn version-btn"
        :class="{ 'is-active': currentVersion === 'ipv6' }"
        @click="switchVersion('ipv6')"
      >
        IPv6
      </button>
    </div>

    <WarningBanner
      :visible="showNodeWarning"
      :node-count="nodeCount"
      @dismiss="warningDismissed = true"
    />

    <GraphView v-if="graphData" :data="graphData" />

    <div v-if="graphData" class="data-meta hud-panel" :title="dataUpdatedFull">
      <Clock class="data-meta-icon" :size="14" aria-hidden="true" />
      <span class="hud-label">Data</span>
      <span class="data-meta-value">{{ dataUpdatedRelative }}</span>
    </div>

    <div v-else-if="errorMessage" class="status-overlay">
      <TriangleAlert class="status-icon status-icon--error" :size="30" aria-hidden="true" />
      <p class="status-title">Data link failure</p>
      <p class="status-detail">{{ errorMessage }}</p>
      <button class="hud-btn retry-btn" @click="loadData(currentVersion)">
        <RefreshCw :size="15" aria-hidden="true" />
        Retry
      </button>
    </div>

    <div v-else class="status-overlay" aria-live="polite">
      <span class="loader" aria-hidden="true"></span>
      <p class="status-title">Initializing topology</p>
      <p class="status-detail">Fetching {{ currentVersion }} graph data…</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Clock, RefreshCw, TriangleAlert } from 'lucide-vue-next'
import GraphView from '@/components/GraphView.vue'
import WarningBanner from '@/components/WarningBanner.vue'
import { CACHE_TTL_MS, dataUrl, nodeWarningThreshold } from '@/utils/constants'
import { getCachedGraph, putCachedGraph } from '@/utils/cache'
import { formatRelativeTime, formatTimestamp } from '@/utils/format'
import { readUrlState, writeUrlState } from '@/utils/urlState'
import type { MapData, Version } from '@/types'

const initialUrlState = readUrlState()
const graphData = ref<MapData | null>(null)
const currentVersion = ref<Version>(initialUrlState.version)
const errorMessage = ref('')
const warningDismissed = ref(false)

const nodeCount = computed(() => graphData.value?.nodes.length ?? 0)
const showNodeWarning = computed(
  () => !warningDismissed.value && !!graphData.value && nodeCount.value < nodeWarningThreshold,
)
const dataUpdatedFull = computed(() =>
  graphData.value ? formatTimestamp(graphData.value.created) : '',
)
const dataUpdatedRelative = computed(() =>
  graphData.value ? formatRelativeTime(graphData.value.created) : '',
)

// Guards against out-of-order responses when switching versions quickly.
let loadToken = 0

const loadData = async (version: Version) => {
  const token = ++loadToken
  graphData.value = null
  errorMessage.value = ''
  warningDismissed.value = false

  const cached = await getCachedGraph(version)
  if (token !== loadToken) return

  // Serve fresh cache without hitting the network.
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    graphData.value = cached.data
    currentVersion.value = version
    writeUrlState({ version })
    return
  }

  try {
    const r = await fetch(dataUrl(version))
    if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`)
    const data = (await r.json()) as MapData
    if (token !== loadToken) return
    graphData.value = data
    currentVersion.value = version
    writeUrlState({ version })
    void putCachedGraph(version, data)
  } catch (e) {
    if (token !== loadToken) return
    // Fall back to the stale cache when the network is unavailable.
    if (cached) {
      graphData.value = cached.data
      currentVersion.value = version
      return
    }
    errorMessage.value = e instanceof Error ? e.message : String(e)
    console.error('Failed to load data:', e)
  }
}

const switchVersion = (version: Version) => {
  if (currentVersion.value === version && graphData.value) return
  loadData(version)
}

onMounted(() => {
  loadData(initialUrlState.version)
})
</script>

<style scoped>
.app-container {
  position: relative;
  width: 100vw;
  height: 100vh;
  background:
    radial-gradient(circle at 50% 40%, rgba(34, 227, 255, 0.06), transparent 55%), var(--bg-void);
}

.version-toggle {
  position: absolute;
  top: 20px;
  left: 290px;
  z-index: 40;
  display: flex;
  padding: 3px;
  background: var(--bg-panel);
  border: 1px solid var(--border-hud);
  clip-path: polygon(0 0, calc(100% - 9px) 0, 100% 9px, 100% 100%, 9px 100%, 0 calc(100% - 9px));
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.version-btn {
  padding: 8px 16px;
  font-size: 0.78rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  font-family: var(--font-mono);
}

.version-btn + .version-btn {
  border-left: 1px solid rgba(34, 227, 255, 0.14);
}

.data-meta {
  position: absolute;
  right: 20px;
  bottom: 20px;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
}

.data-meta-icon {
  color: var(--accent);
  filter: drop-shadow(0 0 6px var(--accent-glow));
}

.data-meta-value {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  color: var(--text-primary);
}

.status-overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 28px 36px;
  text-align: center;
  background: var(--bg-panel);
  border: 1px solid var(--border-hud);
  clip-path: var(--hud-clip);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.status-title {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 0.8rem;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: var(--accent);
  text-shadow: 0 0 12px var(--accent-glow);
}

.status-detail {
  margin: 0;
  font-size: 0.82rem;
  color: var(--text-muted);
}

.status-icon--error {
  color: var(--danger);
  filter: drop-shadow(0 0 8px rgba(255, 77, 109, 0.5));
}

.loader {
  width: 42px;
  height: 42px;
  border: 2px solid rgba(34, 227, 255, 0.15);
  border-top-color: var(--accent);
  border-radius: 50%;
  box-shadow: 0 0 16px var(--accent-glow);
  animation: hud-spin 0.9s linear infinite;
}

.retry-btn {
  margin-top: 4px;
  border: 1px solid var(--border-hud);
  clip-path: polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px));
}

@media (max-width: 640px) {
  .version-toggle {
    left: 20px;
    top: 72px;
  }

  .data-meta {
    display: none;
  }
}
</style>
