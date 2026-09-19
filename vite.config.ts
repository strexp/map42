import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
  ],
  // `three-forcegraph` imports the aliased `d3-force-3d`. Listing it as an
  // explicit optimizeDeps entry makes Vite pre-bundle it as its own chunk and
  // re-optimize when the engine source changes, instead of caching a stale copy
  // inside the `three-forcegraph` bundle.
  optimizeDeps: {
    exclude: ['d3-force-3d'],
  },
  resolve: {
    alias: [
      // Swap `d3-force-3d` for the WebGPU implementation. `three-forcegraph`
      // imports it directly, so the alias keeps every call site untouched.
      {
        find: /^d3-force-3d$/,
        replacement: fileURLToPath(new URL('./src/subprojects/d3-force-3d/index.ts', import.meta.url)),
      },
      {
        find: '@',
        replacement: fileURLToPath(new URL('./src', import.meta.url)),
      },
    ],
  },
})
