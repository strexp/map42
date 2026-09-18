// src/composables/useGraphProcessor.ts
import { onUnmounted, toRaw } from 'vue'
import GraphWorker from '../workers/graph.worker?worker'
import type { MapData, ProcessedGraph } from '../types'

interface WorkerResponse {
  id: number
  result?: ProcessedGraph
  error?: string
}

interface PendingEntry {
  resolve: (value: ProcessedGraph) => void
  reject: (error: Error) => void
}

export function useGraphProcessor() {
  let worker: Worker | null = null
  let sequence = 0
  const pending = new Map<number, PendingEntry>()

  const ensureWorker = (): Worker => {
    if (worker) return worker

    worker = new GraphWorker()
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const entry = pending.get(event.data.id)
      if (!entry) return
      pending.delete(event.data.id)
      if (event.data.error) entry.reject(new Error(event.data.error))
      else if (event.data.result) entry.resolve(event.data.result)
      else entry.reject(new Error('Graph worker returned an empty result'))
    }
    worker.onerror = (event) => {
      const error = new Error(event.message || 'Graph worker failed')
      pending.forEach((entry) => entry.reject(error))
      pending.clear()
    }
    return worker
  }

  const process = (data: MapData): Promise<ProcessedGraph> =>
    new Promise((resolve, reject) => {
      const id = ++sequence
      pending.set(id, { resolve, reject })
      // Send raw data so the structured clone skips Vue's reactive proxies.
      ensureWorker().postMessage({ id, data: toRaw(data) })
    })

  onUnmounted(() => {
    worker?.terminate()
    worker = null
    pending.clear()
  })

  return { process }
}
