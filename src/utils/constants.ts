import { getcolor } from './blackbody'
import type { GraphNode, Version } from '../types'

const LDR_URLS = [
  '/static/skybox/right.png',
  '/static/skybox/left.png',
  '/static/skybox/top.png',
  '/static/skybox/bottom.png',
  '/static/skybox/front.png',
  '/static/skybox/back.png',
]

const DEFAULT_NODE_WARNING_THRESHOLD = 200

const parseThreshold = (raw: string | undefined): number => {
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_NODE_WARNING_THRESHOLD
}

// Warn when a dataset looks suspiciously small. Override with
// VITE_NODE_WARNING_THRESHOLD (e.g. in .env.local).
const nodeWarningThreshold = parseThreshold(import.meta.env.VITE_NODE_WARNING_THRESHOLD)

const DEFAULT_DATA_BASE_URL = 'https://bgp-data.strexp.net/graph'
const dataBaseUrl = (import.meta.env.VITE_DATA_BASE_URL || DEFAULT_DATA_BASE_URL).replace(/\/$/, '')

const dataUrl = (version: Version) => `${dataBaseUrl}/${version}.json`

// Serve cached graphs without re-fetching while they are younger than this.
const CACHE_TTL_MS = 30 * 60 * 1000

const graphconfig = {
  passes: {
    bloom: {
      strength: 1.3,
      radius: 1,
      threshold: 0.1,
    },
  },
  resolution: {
    node: 16,
    edge: 2,
  },
  opacity: {
    node: 1.0,
    edge: 0.3,
  },
  colors: {
    node: {
      default: (n: GraphNode, sel: boolean = false) => {
        if (n.peers.size == 1) return `rgba(200,100,100,${n.val / 30})`
        const c = getcolor(parseFloat(n.centrality))
        if (sel) return 'rgba(255,255,255,0.2)'
        return `rgba(${c.r},${c.g},${c.b},${n.val / 100})`
      },
      selected: (i: number) => `rgba(100,255,255,${i / 10})`,
      adj1: (i: number) => `rgba(255,200,0,${i / 20})`,
      adj2: (i: number) => `rgba(255,30,0,${i / 20})`,
    },
    edge: {
      default: 'rgba(255,255,255,0.13)',
      adj1: 'rgba(0,255,255,0.4)',
      adj2: 'rgba(255,60,150,0.2)',
      others: 'rgba(255,255,255,0.1)',
    },
  },
  size: {
    link: {
      default: 0,
      adj1: 0.6,
      adj2: 0.4,
      others: 0.13,
    },
  },
  rotate: {
    speed: 2.0,
  },
}

export { LDR_URLS, graphconfig, nodeWarningThreshold, dataUrl, CACHE_TTL_MS }
