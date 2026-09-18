// src/composables/useGraphEngine.ts
import { shallowRef, markRaw, onUnmounted } from 'vue'
import ForceGraph3D, { type ConfigOptions, type ForceGraph3DInstance } from '3d-force-graph'
import * as THREE from 'three'
import SpriteText from 'three-spritetext'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js'
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { graphconfig, LDR_URLS } from '@/utils/constants'
import { BatchedLinkRenderer } from '@/utils/batchedLinks'
import type { GraphConfig, GraphLink, GraphNode } from '../types'

type GraphInstance = ForceGraph3DInstance<GraphNode, GraphLink>

// `3d-force-graph` only declares a constructor in its typings, while the
// runtime API is a curried factory: ForceGraph3D(options)(element).
type ForceGraph3DFactory = (
  configOptions?: ConfigOptions,
) => (element: HTMLElement) => GraphInstance

interface EngineProps {
  container: HTMLElement
  config: GraphConfig
  selectedNode: { value: GraphNode | null }
  highlightNodes: { value: Set<string> }
  highlight2Nodes: { value: Set<string> }
  onNodeClick: (node: GraphNode) => void
  onBgClick: () => void
  onTick?: () => void
}

export function useGraphEngine() {
  const graphInstance = shallowRef<GraphInstance | null>(null)

  const nodeObjCache = new Map<string, THREE.Object3D>()

  let linkRenderer: BatchedLinkRenderer | null = null
  let currentLinks: GraphLink[] = []
  let selectedRef: { value: GraphNode | null } | null = null

  const clearCache = () => {
    nodeObjCache.forEach((group) => {
      group.traverse((child) => {
        if (child instanceof THREE.Mesh || child instanceof THREE.Sprite) {
          child.geometry.dispose()
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose())
          } else {
            child.material.dispose()
          }
        }
      })
    })
    nodeObjCache.clear()
  }

  const initGraph = ({
    container,
    config,
    selectedNode,
    highlightNodes,
    highlight2Nodes,
    onNodeClick,
    onBgClick,
    onTick,
  }: EngineProps) => {
    const createGraph = ForceGraph3D as unknown as ForceGraph3DFactory
    const g = markRaw(
      createGraph({
        controlType: 'orbit',
        rendererConfig: { antialias: true, alpha: true },
      })(container),
    )

    graphInstance.value = g
    selectedRef = selectedNode

    // --- Configuration ---
    g.scene().fog = new THREE.FogExp2(0x000000, 0.0002)
    g.backgroundColor('#000000')
      .showNavInfo(false)
      .nodeRelSize(1)
      .nodeResolution(graphconfig.resolution.node)
      .nodeOpacity(graphconfig.opacity.node)
      .nodeLabel(null as unknown as string)
      .onEngineTick(() => {
        linkRenderer?.updatePositions()
        if (onTick) onTick()
      })

    // Edges are rendered by a single batched `LineSegments2` layer per `_state`.
    linkRenderer = new BatchedLinkRenderer(g.scene())

    // --- Physics ---
    g.d3Force('link')?.distance(200)

    // --- Controls ---
    const controls = g.controls() as unknown as OrbitControls
    controls.maxDistance = 4000
    controls.addEventListener('start', () => {
      // Stop auto-rotation when the user interacts
      if (config.isRotating) {
        config.isRotating = false
        controls.autoRotate = false
      }
    })

    // --- Node Objects (Text) ---
    const buildNodeObject = (node: GraphNode): THREE.Object3D | null => {
      if (!config.showText) return null

      if (nodeObjCache.has(node.id)) {
        return nodeObjCache.get(node.id)!
      }

      const group = new THREE.Object3D()
      const sprite = new SpriteText(node.name)
      sprite.material.depthWrite = false
      sprite.material.depthTest = false
      sprite.renderOrder = 999
      sprite.color = '#999999'
      sprite.textHeight = (node.size || 1) * 0.7
      sprite.strokeWidth = 1
      sprite.strokeColor = '#000000'
      sprite.position.z = node.size || 1
      group.add(sprite)
      nodeObjCache.set(node.id, group)
      return group
    }
    g.nodeThreeObject(buildNodeObject as unknown as (node: GraphNode) => THREE.Object3D)
    g.nodeThreeObjectExtend(true)

    // Edges are drawn by `BatchedLinkRenderer`; disable the per-link objects.
    g.linkVisibility(false)

    // --- Colors & Styling ---
    g.nodeColor((node) => {
      if (selectedNode.value && node.id === selectedNode.value.id)
        return graphconfig.colors.node.selected(node.val)
      if (highlightNodes.value.has(node.id)) return graphconfig.colors.node.adj1(node.val)
      if (highlight2Nodes.value.has(node.id)) return graphconfig.colors.node.adj2(node.val)
      return graphconfig.colors.node.default(node, !!selectedNode.value)
    })

    // --- Events ---
    g.onNodeClick((node) => onNodeClick(node))
      .onBackgroundClick(onBgClick)
      .onLinkClick(onBgClick)

    // --- Post Processing ---
    const composer = g.postProcessingComposer()
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      graphconfig.passes.bloom.strength,
      graphconfig.passes.bloom.radius,
      graphconfig.passes.bloom.threshold,
    )
    composer.addPass(bloomPass)

    const smaaPass = new SMAAPass()
    composer.addPass(smaaPass)

    // --- Initial Background ---
    updateBackground(config.showBg)

    return g
  }

  const updateGraphData = (nodes: GraphNode[], links: GraphLink[]) => {
    clearCache()
    currentLinks = links
    graphInstance.value?.graphData({ nodes, links })
    linkRenderer?.update(currentLinks, selectedRef?.value ?? null)
  }

  const refreshVisuals = (options = { updateGeometry: false }) => {
    const g = graphInstance.value
    if (!g) return
    g.nodeColor(g.nodeColor())
    linkRenderer?.update(currentLinks, selectedRef?.value ?? null)

    if (options.updateGeometry) {
      g.nodeThreeObject(g.nodeThreeObject())
    }
  }

  const updateBackground = (showBg: boolean) => {
    const g = graphInstance.value
    if (!g) return
    const scene = g.scene()
    if (showBg) {
      new THREE.CubeTextureLoader().load(LDR_URLS, (bg) => (scene.background = bg))
    } else {
      scene.background = new THREE.Color(0x000000)
    }
  }

  const focusNode = (node: GraphNode) => {
    if (!graphInstance.value) return
    graphInstance.value.cameraPosition(
      { x: (node.x || 0) * 2, y: (node.y || 0) * 2, z: (node.z || 0) * 2 },
      { x: node.x || 0, y: node.y || 0, z: node.z || 0 },
      3000,
    )
  }

  const toggleRotation = (isActive: boolean) => {
    if (!graphInstance.value) return
    const controls = graphInstance.value.controls() as unknown as OrbitControls
    controls.autoRotate = isActive
    controls.autoRotateSpeed = graphconfig.rotate.speed
  }

  const setRotationTarget = (x: number, y: number, z: number) => {
    if (!graphInstance.value) return
    const controls = graphInstance.value.controls() as unknown as OrbitControls
    controls.target.set(x, y, z)
  }

  onUnmounted(() => {
    linkRenderer?.dispose()
    linkRenderer = null
    currentLinks = []
    selectedRef = null
    clearCache()
    graphInstance.value?._destructor()
  })

  return {
    graphInstance,
    initGraph,
    updateGraphData,
    refreshVisuals,
    updateBackground,
    focusNode,
    toggleRotation,
    setRotationTarget,
  }
}
