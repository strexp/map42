// src/composables/useGraphEngine.ts
import { shallowRef, markRaw, onUnmounted } from 'vue'
import ForceGraph3D, { type ConfigOptions, type ForceGraph3DInstance } from '3d-force-graph'
import * as THREE from 'three'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js'
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { graphconfig, LDR_URLS } from '@/utils/constants'
import { BatchedLinkRenderer } from '@/utils/batchedLinks'
import { NodeRenderer } from '@/utils/nodeRenderer'
import { InstancedTextLayer } from '@/utils/instancedText'
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

  let linkRenderer: BatchedLinkRenderer | null = null
  let nodeRenderer: NodeRenderer | null = null
  let textRenderer: InstancedTextLayer | null = null
  let currentLinks: GraphLink[] = []
  let selectedRef: { value: GraphNode | null } | null = null
  let highlight1Ref: { value: Set<string> } | null = null
  let highlight2Ref: { value: Set<string> } | null = null
  let configRef: GraphConfig | null = null

  const textHeightOf = (node: GraphNode) => (node.size || 1) * graphconfig.size.textHeightFactor

  const resolveNodeColor = (node: GraphNode): string => {
    if (selectedRef?.value && node.id === selectedRef.value.id)
      return graphconfig.colors.node.selected(node.val)
    if (highlight1Ref?.value.has(node.id)) return graphconfig.colors.node.adj1(node.val)
    if (highlight2Ref?.value.has(node.id)) return graphconfig.colors.node.adj2(node.val)
    return graphconfig.colors.node.default(node, !!selectedRef?.value)
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
    if (import.meta.env.DEV) {
      ;(globalThis as unknown as { __forceGraph?: GraphInstance }).__forceGraph = g
    }
    selectedRef = selectedNode
    highlight1Ref = highlightNodes
    highlight2Ref = highlight2Nodes
    configRef = config

    // --- Configuration ---
    g.scene().fog = new THREE.FogExp2(0x000000, graphconfig.scene.fogDensity)
    g.backgroundColor('#000000')
      .showNavInfo(false)
      .nodeLabel(null as unknown as string)
      .onEngineTick(() => {
        linkRenderer?.updatePositions()
        nodeRenderer?.updatePositions()
        textRenderer?.updatePositions()
        if (onTick) onTick()
      })

    // Nodes, edges and labels each render through a single batched draw call.
    linkRenderer = new BatchedLinkRenderer(g.scene())
    nodeRenderer = new NodeRenderer(g.scene())
    textRenderer = new InstancedTextLayer(g.scene())

    // --- Physics ---
    g.d3Force('link')?.distance(graphconfig.scene.linkDistance)

    // --- Controls ---
    const controls = g.controls() as unknown as OrbitControls
    controls.maxDistance = graphconfig.scene.maxCameraDistance
    controls.addEventListener('start', () => {
      // Stop auto-rotation when the user interacts
      if (config.isRotating) {
        config.isRotating = false
        controls.autoRotate = false
      }
    })

    // three's OrbitControls only records pointer positions for touch pointers,
    // but `3d-force-graph` synthesises a touch-style `pointerup` when a node
    // drag ends. If the real pointer is still tracked (e.g. it left the canvas
    // mid-drag) that synthetic event reads an undefined position and throws.
    // Recording every pointer keeps `_pointerPositions` populated.
    const orbitInternals = controls as unknown as {
      _trackPointer?: (event: PointerEvent) => void
      domElement?: HTMLElement
    }
    const trackPointer = (event: PointerEvent) => orbitInternals._trackPointer?.(event)
    orbitInternals.domElement?.addEventListener('pointerdown', trackPointer)
    orbitInternals.domElement?.addEventListener('pointermove', trackPointer)

    // --- Node picking ---
    // Visual spheres are drawn by `NodeRenderer`; `3d-force-graph` only keeps
    // invisible, geometry-less pick objects so its click/hover logic still works.
    const pickSphere = new THREE.Sphere()
    const pickPoint = new THREE.Vector3()
    const buildPickObject = (node: GraphNode): THREE.Object3D => {
      const object = new THREE.Object3D()
      object.visible = false
      const radius = Math.cbrt(node.val || 1)
      object.raycast = function (raycaster, intersects) {
        pickSphere.center.setFromMatrixPosition(this.matrixWorld)
        pickSphere.radius = radius
        if (!raycaster.ray.intersectsSphere(pickSphere)) return
        raycaster.ray.closestPointToPoint(pickSphere.center, pickPoint)
        intersects.push({
          distance: raycaster.ray.origin.distanceTo(pickPoint),
          point: pickPoint.clone(),
          object: this,
        })
      }
      return object
    }
    g.nodeThreeObject(buildPickObject as unknown as (node: GraphNode) => THREE.Object3D)

    // Edges are drawn by `BatchedLinkRenderer`; disable the per-link objects.
    g.linkVisibility(false)

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
  }

  const applyRenderState = () => {
    nodeRenderer?.refreshColors(resolveNodeColor)
    textRenderer?.setVisible(configRef?.showText ?? true)
    linkRenderer?.update(currentLinks, selectedRef?.value ?? null)
  }

  const updateGraphData = (nodes: GraphNode[], links: GraphLink[]) => {
    currentLinks = links
    graphInstance.value?.graphData({ nodes, links })
    nodeRenderer?.setData(nodes)
    textRenderer?.setData(nodes, textHeightOf)
    applyRenderState()
  }

  const refreshVisuals = () => {
    if (!graphInstance.value) return
    applyRenderState()
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
      graphconfig.scene.focusDistance,
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
    nodeRenderer?.dispose()
    textRenderer?.dispose()
    linkRenderer = null
    nodeRenderer = null
    textRenderer = null
    currentLinks = []
    selectedRef = null
    highlight1Ref = null
    highlight2Ref = null
    configRef = null
    graphInstance.value?._destructor()
  })

  return {
    initGraph,
    updateGraphData,
    refreshVisuals,
    updateBackground,
    focusNode,
    toggleRotation,
    setRotationTarget,
  }
}
