/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Minimum expected node count. When a dataset contains fewer nodes than this
   * value, the UI warns that the data may be incomplete. Defaults to 200.
   */
  readonly VITE_NODE_WARNING_THRESHOLD?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
