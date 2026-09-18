// src/utils/instancedText.ts
import * as THREE from 'three'
import { getSdfFont } from './sdfFont'
import type { GraphNode } from '../types'

/**
 * Renders every node label with a single instanced draw call, sampling a shared
 * SDF font atlas. One instance == one glyph; each glyph references its node's
 * position/scale through a small float data texture so per-tick updates stay cheap.
 */
export class InstancedTextLayer {
  private scene: THREE.Scene
  private geometry: THREE.InstancedBufferGeometry | null = null
  private material: THREE.ShaderMaterial | null = null
  private mesh: THREE.Mesh | null = null
  private nodeTexture: THREE.DataTexture | null = null
  private nodeData: Float32Array = new Float32Array(0)
  private nodes: GraphNode[] = []
  private dataWidth = 1

  constructor(scene: THREE.Scene) {
    this.scene = scene
  }

  setData(nodes: GraphNode[], textHeightOf: (node: GraphNode) => number) {
    this.dispose()
    this.nodes = nodes
    if (nodes.length === 0) return

    const font = getSdfFont()
    const nodeIndices: number[] = []
    const penX: number[] = []
    const uvs: number[] = []

    const advanceOf = (ch: string) => (font.glyphs.get(ch) ?? font.fallback)?.advance ?? 0.5

    for (let ni = 0; ni < nodes.length; ni++) {
      const name = nodes[ni].name || ''
      let total = 0
      for (const ch of name) total += advanceOf(ch)

      let pen = -total / 2
      for (const ch of name) {
        if (ch !== ' ') {
          const glyph = font.glyphs.get(ch) ?? font.fallback
          if (glyph) {
            nodeIndices.push(ni)
            penX.push(pen)
            uvs.push(glyph.u0, glyph.v0, glyph.du, glyph.dv)
          }
        }
        pen += advanceOf(ch)
      }
    }

    const count = nodeIndices.length
    if (count === 0) return

    const geometry = new THREE.InstancedBufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0], 3),
    )
    geometry.setIndex([0, 1, 2, 2, 1, 3])
    geometry.setAttribute('iNode', new THREE.InstancedBufferAttribute(new Float32Array(nodeIndices), 1))
    geometry.setAttribute('iPenX', new THREE.InstancedBufferAttribute(new Float32Array(penX), 1))
    geometry.setAttribute('iUv', new THREE.InstancedBufferAttribute(new Float32Array(uvs), 4))
    geometry.instanceCount = count

    this.dataWidth = nodes.length
    this.nodeData = new Float32Array(nodes.length * 4)
    for (let i = 0; i < nodes.length; i++) {
      this.nodeData[i * 4 + 3] = textHeightOf(nodes[i]) / font.capHeightEm
    }
    this.writePositions()

    const nodeTexture = new THREE.DataTexture(
      this.nodeData,
      this.dataWidth,
      1,
      THREE.RGBAFormat,
      THREE.FloatType,
    )
    nodeTexture.minFilter = THREE.NearestFilter
    nodeTexture.magFilter = THREE.NearestFilter
    nodeTexture.generateMipmaps = false
    nodeTexture.needsUpdate = true

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uAtlas: { value: font.texture },
        uNodeData: { value: nodeTexture },
        uDataWidth: { value: this.dataWidth },
        uCellOffset: { value: font.cellOffset },
        uCellSize: { value: font.cellSize },
        uColor: { value: new THREE.Color('#888888') },
        uOpacity: { value: 0.8 },
      },
      vertexShader: /* glsl */ `
        uniform sampler2D uNodeData;
        uniform float uDataWidth;
        uniform vec2 uCellOffset;
        uniform vec2 uCellSize;
        attribute float iNode;
        attribute float iPenX;
        attribute vec4 iUv;
        varying vec2 vUv;
        void main() {
          vec4 nd = texture2D(uNodeData, vec2((iNode + 0.5) / uDataWidth, 0.5));
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          vec2 local = uCellOffset + vec2(iPenX, 0.0) + position.xy * uCellSize;
          vec3 world = nd.xyz + (right * local.x + up * local.y) * nd.w;
          vUv = iUv.xy + position.xy * iUv.zw;
          gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uAtlas;
        uniform vec3 uColor;
        uniform float uOpacity;
        varying vec2 vUv;
        void main() {
          float d = texture2D(uAtlas, vUv).r;
          float w = fwidth(d);
          float a = smoothstep(0.5 - w, 0.5 + w, d);
          if (a < 0.02) discard;
          gl_FragColor = vec4(uColor, a * uOpacity);
        }
      `,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    })

    const mesh = new THREE.Mesh(geometry, material)
    mesh.frustumCulled = false
    mesh.renderOrder = 999
    this.scene.add(mesh)

    this.geometry = geometry
    this.material = material
    this.mesh = mesh
    this.nodeTexture = nodeTexture
  }

  private writePositions() {
    const data = this.nodeData
    const nodes = this.nodes
    for (let i = 0; i < nodes.length; i++) {
      data[i * 4] = nodes[i].x || 0
      data[i * 4 + 1] = nodes[i].y || 0
      data[i * 4 + 2] = nodes[i].z || 0
    }
  }

  updatePositions() {
    if (!this.nodeTexture) return
    this.writePositions()
    this.nodeTexture.needsUpdate = true
  }

  setVisible(visible: boolean) {
    if (this.mesh) this.mesh.visible = visible
  }

  dispose() {
    if (this.mesh) {
      this.scene.remove(this.mesh)
      this.mesh = null
    }
    this.geometry?.dispose()
    this.material?.dispose()
    this.nodeTexture?.dispose()
    this.geometry = null
    this.material = null
    this.nodeTexture = null
    this.nodeData = new Float32Array(0)
    this.nodes = []
  }
}
