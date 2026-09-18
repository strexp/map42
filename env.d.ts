/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Minimum expected node count. When a dataset contains fewer nodes than this
   * value, the UI warns that the data may be incomplete. Defaults to 200.
   */
  readonly VITE_NODE_WARNING_THRESHOLD?: string

  /**
   * Base URL of the graph dataset directory. Defaults to
   * https://bgp-data.strexp.net/graph
   */
  readonly VITE_DATA_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
