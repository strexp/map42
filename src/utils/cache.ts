import type { CachedGraph, MapData } from '../types'

const DB_NAME = 'bgp42'
const DB_VERSION = 1
const STORE_NAME = 'graph'

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

const runRequest = async <T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> => {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = run(db.transaction(STORE_NAME, mode).objectStore(STORE_NAME))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  } finally {
    db.close()
  }
}

export const getCachedGraph = async (key: string): Promise<CachedGraph | null> => {
  try {
    return (await runRequest('readonly', (store) => store.get(key))) ?? null
  } catch {
    return null
  }
}

export const putCachedGraph = async (key: string, data: MapData): Promise<void> => {
  try {
    const entry: CachedGraph = { data, cachedAt: Date.now() }
    await runRequest('readwrite', (store) => store.put(entry, key))
  } catch {
    // Caching is best-effort; ignore private mode / quota failures.
  }
}
