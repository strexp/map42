// src/composables/useGraphConfig.ts
import { reactive, watch } from 'vue'
import type { GraphConfig } from '../types'

const STORAGE_KEY = 'bgp42:graph-config'

const defaults: GraphConfig = {
  showHop2: true,
  showBg: true,
  showText: true,
  isRotating: false,
}

const load = (): GraphConfig => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...defaults }
    const parsed = JSON.parse(raw) as Partial<GraphConfig>
    // Auto-rotation is transient and should not resume on reload.
    return { ...defaults, ...parsed, isRotating: false }
  } catch {
    return { ...defaults }
  }
}

export function useGraphConfig() {
  const config = reactive<GraphConfig>(load())

  watch(
    config,
    (value) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...value, isRotating: false }))
      } catch {
        // Ignore storage quota / privacy-mode errors.
      }
    },
    { deep: true },
  )

  return config
}
