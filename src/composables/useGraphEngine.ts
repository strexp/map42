// src/composables/useGraphEngine.ts
import { shallowRef, markRaw, onUnmounted } from 'vue'
import ForceGraph3D, { type ForceGraph3DInstance } from '3d-force-graph'
import * as THREE from 'three'
import SpriteText from 'three-spritetext'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js'
import { graphconfig, LDR_URLS } from '@/utils/constants'
import type { GraphConfig, GraphLink, GraphNode } from '../types'

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
  const graphInstance = shallowRef<ForceGraph3DInstance | null>(null)

  const nodeObjCache = new Map<string, THREE.Object3D>()

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
    const g = markRaw(
      ForceGraph3D({
        controlType: 'orbit',
        rendererConfig: { antialias: true, alpha: true },
      })(container),
    )

    graphInstance.value = g

    // --- Configuration ---
    g.scene().fog = new THREE.FogExp2(0x000000, 0.0002)
    g.backgroundColor('#000000')
      .showNavInfo(false)
      .nodeRelSize(1)
      .nodeResolution(graphconfig.resolution.node)
      .linkResolution(graphconfig.resolution.edge)
      .nodeOpacity(graphconfig.opacity.node)
      .linkOpacity(graphconfig.opacity.edge)
      .nodeLabel(null)
      .onEngineTick(() => onTick && onTick())

    // --- Physics ---
    g.d3Force('link').distance(200)

    // --- Controls ---
    const controls = g.controls()
    controls.maxDistance = 4000
    controls.addEventListener('start', () => {
      // 如果正在自动旋转，用户交互时停止
      if (config.isRotating) {
        config.isRotating = false
        controls.autoRotate = false
      }
    })

    // --- Node Objects (Text) ---
    g.nodeThreeObject((n: any) => {
      if (!config.showText) return null
      const node = n as GraphNode

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
    })
    g.nodeThreeObjectExtend(true)

    // --- Colors & Styling ---
    g.nodeColor((n: any) => {
      const node = n as GraphNode
      if (selectedNode.value && node.id === selectedNode.value.id)
        return graphconfig.colors.node.selected(node.val)
      if (highlightNodes.value.has(node.id)) return graphconfig.colors.node.adj1(node.val)
      if (highlight2Nodes.value.has(node.id)) return graphconfig.colors.node.adj2(node.val)
      return graphconfig.colors.node.default(node, !!selectedNode.value)
    })

    g.linkColor((l: any) => {
      const link = l as GraphLink
      if (!selectedNode.value) return graphconfig.colors.edge.default
      switch (link._state) {
        case 1:
          return graphconfig.colors.edge.adj1
        case 2:
          return graphconfig.colors.edge.adj2
        default:
          return graphconfig.colors.edge.others
      }
    })

    g.linkWidth((l: any) => {
      const link = l as GraphLink
      if (!selectedNode.value) return graphconfig.size.link.default
      switch (link._state) {
        case 1:
          return graphconfig.size.link.adj1
        case 2:
          return graphconfig.size.link.adj2
        default:
          return graphconfig.size.link.others
      }
    })

    // --- Events ---
    g.onNodeClick((n) => onNodeClick(n as GraphNode))
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

    const fxaaPass = new ShaderPass(FXAAShader)
    const pixelRatio = g.renderer().getPixelRatio()
    fxaaPass.material.uniforms['resolution'].value.x = 1 / (container.offsetWidth * pixelRatio)
    fxaaPass.material.uniforms['resolution'].value.y = 1 / (container.offsetHeight * pixelRatio)
    composer.addPass(fxaaPass)

    // --- Initial Background ---
    updateBackground(config.showBg)

    return g
  }

  const updateGraphData = (nodes: GraphNode[], links: GraphLink[]) => {
    clearCache()
    graphInstance.value?.graphData({ nodes, links })
  }

  const refreshVisuals = (options = { updateGeometry: false }) => {
    const g = graphInstance.value
    if (!g) return
    g.nodeColor(g.nodeColor())
      .linkWidth(g.linkWidth())
      .linkColor(g.linkColor())

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
    const controls = graphInstance.value.controls()
    controls.autoRotate = isActive
    controls.autoRotateSpeed = graphconfig.rotate.speed
  }

  const setRotationTarget = (x: number, y: number, z: number) => {
    if (!graphInstance.value) return
    graphInstance.value.controls().target.set(x, y, z)
  }

  onUnmounted(() => {
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
