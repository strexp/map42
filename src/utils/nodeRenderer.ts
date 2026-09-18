// src/utils/nodeRenderer.ts
import * as THREE from 'three'
import { parseRgba } from './color'
import { graphconfig } from './constants'
import type { GraphNode } from '../types'

export type NodeColorResolver = (node: GraphNode) => string

const radiusOf = (node: GraphNode) => Math.cbrt(node.val || 1)

/**
 * Renders every node sphere with a single `InstancedMesh` draw call.
 *
 * `3d-force-graph`'s own per-node meshes are replaced by invisible pick objects
 * (see `useGraphEngine`), so this layer owns the visual spheres.
 */
export class NodeRenderer {
  private scene: THREE.Scene
  private mesh: THREE.InstancedMesh | null = null
  private geometry: THREE.SphereGeometry | null = null
  private material: THREE.MeshLambertMaterial | null = null
  private alphaAttr: THREE.InstancedBufferAttribute | null = null
  private nodes: GraphNode[] = []

  private readonly matrix = new THREE.Matrix4()
  private readonly position = new THREE.Vector3()
  private readonly quaternion = new THREE.Quaternion()
  private readonly scale = new THREE.Vector3()

  constructor(scene: THREE.Scene) {
    this.scene = scene
  }

  setData(nodes: GraphNode[]) {
    this.dispose()
    this.nodes = nodes
    if (nodes.length === 0) return

    const segments = graphconfig.resolution.node
    const geometry = new THREE.SphereGeometry(1, segments, segments)
    // `instanceColor` defines USE_COLOR, which requires a `color` attribute to
    // exist; a constant white attribute lets the per-instance colour show through.
    const vertexCount = geometry.attributes.position.count
    geometry.setAttribute(
      'color',
      new THREE.BufferAttribute(new Float32Array(vertexCount * 3).fill(1), 3),
    )
    this.alphaAttr = new THREE.InstancedBufferAttribute(new Float32Array(nodes.length), 1)
    geometry.setAttribute('instanceAlpha', this.alphaAttr)

    const material = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      transparent: true,
      depthWrite: true,
    })
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nattribute float instanceAlpha;\nvarying float vInstanceAlpha;',
        )
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvInstanceAlpha = instanceAlpha;',
        )
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vInstanceAlpha;')
        .replace(
          '#include <opaque_fragment>',
          '#include <opaque_fragment>\ngl_FragColor.a *= vInstanceAlpha;',
        )
    }

    const mesh = new THREE.InstancedMesh(geometry, material, nodes.length)
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.frustumCulled = false
    this.scene.add(mesh)

    this.geometry = geometry
    this.material = material
    this.mesh = mesh

    this.updatePositions()
  }

  updatePositions() {
    const mesh = this.mesh
    if (!mesh) return
    const nodes = this.nodes
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]
      this.position.set(node.x || 0, node.y || 0, node.z || 0)
      this.scale.setScalar(radiusOf(node))
      this.matrix.compose(this.position, this.quaternion, this.scale)
      mesh.setMatrixAt(i, this.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }

  refreshColors(resolve: NodeColorResolver) {
    const mesh = this.mesh
    const alphaAttr = this.alphaAttr
    if (!mesh || !alphaAttr) return
    for (let i = 0; i < this.nodes.length; i++) {
      const { color, alpha } = parseRgba(resolve(this.nodes[i]))
      mesh.setColorAt(i, color)
      alphaAttr.setX(i, alpha)
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    alphaAttr.needsUpdate = true
  }

  dispose() {
    if (this.mesh) {
      this.scene.remove(this.mesh)
      this.mesh.dispose()
    }
    this.geometry?.dispose()
    this.material?.dispose()
    this.mesh = null
    this.geometry = null
    this.material = null
    this.alphaAttr = null
    this.nodes = []
  }
}
