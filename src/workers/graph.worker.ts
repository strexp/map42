import { buildProcessedGraph } from '../utils/graphUtils'
import type { GraphWorkerRequest, GraphWorkerResponse } from '../types'

const ctx = self as unknown as {
  onmessage: ((event: MessageEvent<GraphWorkerRequest>) => void) | null
  postMessage: (message: GraphWorkerResponse) => void
}

ctx.onmessage = (event) => {
  const { id, data } = event.data
  try {
    ctx.postMessage({ id, result: buildProcessedGraph(data) })
  } catch (error) {
    ctx.postMessage({ id, error: error instanceof Error ? error.message : String(error) })
  }
}
