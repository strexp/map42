<template>
  <div class="app-container">
    <!-- 版本切换按钮组 -->
    <div class="version-toggle">
      <button
        :class="{ active: currentVersion === 'ipv4' }"
        @click="switchVersion('ipv4')"
      >
        IPv4
      </button>
      <button
        :class="{ active: currentVersion === 'ipv6' }"
        @click="switchVersion('ipv6')"
      >
        IPv6
      </button>
    </div>

    <GraphView v-if="graphData" :data="graphData" />
    <div v-else class="loading">Loading graph data...</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import GraphView from './GraphView.vue';
import type { MapData } from './types'; // 假设 MapData 导出自 types

const graphData = ref<MapData | null>(null);
const currentVersion = ref<'ipv4' | 'ipv6'>('ipv6'); // 默认为 IPv6

const loadData = async (version: 'ipv4' | 'ipv6') => {
  graphData.value = null; // 可选：清空以触发重新挂载或显示 Loading
  try {
    const r = await fetch(`https://bgp-data.strexp.net/graph/${version}.json`);
    graphData.value = await r.json();
    currentVersion.value = version;
  } catch (e) {
    console.error('Failed to load data:', e);
  }
};

const switchVersion = (version: 'ipv4' | 'ipv6') => {
  if (currentVersion.value === version && graphData.value) return;
  loadData(version);
};

onMounted(() => {
  loadData('ipv6');
});
</script>

<style>
body {
  margin: 0;
  background-color: #000;
  color: #fff;
}

.app-container {
  position: relative;
  width: 100vw;
  height: 100vh;
}

.loading {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: #00bcd4;
  font-size: 1.2rem;
}

.version-toggle {
  position: absolute;
  top: 20px;
  left: 290px;
  z-index: 40;
  display: flex;
  background: rgba(20, 20, 25, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  overflow: hidden;
}

.version-toggle button {
  background: transparent;
  border: none;
  color: #888;
  padding: 10px 16px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
  border-right: 1px solid rgba(255, 255, 255, 0.1);
}

.version-toggle button:last-child {
  border-right: none;
}

.version-toggle button:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.05);
}

.version-toggle button.active {
  background: rgba(0, 188, 212, 0.2);
  color: #00bcd4;
  font-weight: bold;
}
</style>
