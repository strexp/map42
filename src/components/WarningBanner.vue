<template>
  <transition name="banner">
    <div v-if="visible" class="warning-banner" role="alert">
      <span class="warning-pulse" aria-hidden="true"></span>
      <TriangleAlert class="warning-icon" :size="18" aria-hidden="true" />
      <div class="warning-text">
        <span class="hud-label warning-title">Data integrity warning</span>
        <span class="warning-message">
          Current data may be incomplete or incorrect: only <b>{{ nodeCount }}</b> nodes loaded.
        </span>
      </div>
      <button class="warning-close" aria-label="Dismiss warning" @click="$emit('dismiss')">
        <X :size="16" />
      </button>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { TriangleAlert, X } from 'lucide-vue-next'

defineProps<{
  visible: boolean
  nodeCount: number
  threshold: number
}>()

defineEmits<{ dismiss: [] }>()
</script>

<style scoped>
.warning-banner {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: min(680px, calc(100vw - 40px));
  padding: 10px 12px 10px 16px;
  background: var(--bg-panel-solid);
  border: 1px solid var(--warn);
  border-left: 3px solid var(--warn-strong);
  box-shadow:
    inset 0 0 28px var(--warn-soft),
    0 0 18px rgba(255, 122, 26, 0.25);
  clip-path: polygon(
    0 0,
    calc(100% - 10px) 0,
    100% 10px,
    100% 100%,
    10px 100%,
    0 calc(100% - 10px)
  );
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.warning-pulse {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--warn-strong);
  animation: hud-pulse 1.8s ease-in-out infinite;
}

.warning-icon {
  flex: 0 0 auto;
  color: var(--warn);
  filter: drop-shadow(0 0 6px rgba(255, 176, 32, 0.6));
}

.warning-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.warning-title {
  color: var(--warn);
}

.warning-message {
  font-size: 0.85rem;
  line-height: 1.35;
  color: var(--text-primary);
}

.warning-message b {
  font-family: var(--font-mono);
  color: var(--warn);
}

.warning-close {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  background: transparent;
  border: 1px solid transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition:
    color 0.2s ease,
    border-color 0.2s ease;
}

.warning-close:hover {
  color: var(--warn);
  border-color: var(--warn);
}

.banner-enter-active,
.banner-leave-active {
  transition:
    opacity 0.25s ease,
    transform 0.25s ease;
}

.banner-enter-from,
.banner-leave-to {
  opacity: 0;
  transform: translate(-50%, -12px);
}
</style>
