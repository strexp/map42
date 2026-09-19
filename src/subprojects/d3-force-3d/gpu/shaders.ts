// WGSL compute kernels for the WebGPU force engine.
//
// Kept as string literals (rather than `?raw` imports) so the Vite dependency
// optimizer can bundle this module without a custom loader.

export const linkForceWgsl = `
// Link (spring) force. One invocation per link.
//
// Each link owns two slots in linkForces (source at 2*l, target at 2*l+1) so
// the write is race-free. The per-node reduction happens in the integrate pass
// using the CSR adjacency arrays.

struct Params {
  alpha: f32,
  velocityDecay: f32,
  nodeCount: u32,
  linkCount: u32,
  theta2: f32,
  distanceMin2: f32,
  distanceMax2: f32,
  centerX: f32,
  centerY: f32,
  centerZ: f32,
  centerStrength: f32,
  centerEnabled: u32,
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
  _pad3: f32,
}

struct Node {
  x: f32,
  y: f32,
  z: f32,
  vx: f32,
  vy: f32,
  vz: f32,
  fx: f32,
  fy: f32,
  fz: f32,
  strength: f32,
  radius: f32,
  _p0: f32,
  _p1: f32,
  _p2: f32,
  _p3: f32,
  _p4: f32,
}

struct Link {
  source: f32,
  targetIndex: f32,
  distance: f32,
  strength: f32,
  bias: f32,
  _p0: f32,
  _p1: f32,
  _p2: f32,
}

@group(0) @binding(0) var<storage, read> nodes: array<Node>;
@group(0) @binding(1) var<storage, read> links: array<Link>;
@group(0) @binding(2) var<uniform> params: Params;
@group(0) @binding(3) var<storage, read_write> linkForces: array<vec4<f32>>;

fn jiggle(seed: u32) -> f32 {
  let s = (seed * 1103515245u + 12345u) & 0x7fffffffu;
  return (f32(s) / f32(0x7fffffff) - 0.5) * 1e-6;
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let l = gid.x;
  if (l >= params.linkCount) {
    return;
  }

  let link = links[l];
  let sourceIdx = u32(link.source);
  let targetIdx = u32(link.targetIndex);
  let sourceNode = nodes[sourceIdx];
  let targetNode = nodes[targetIdx];

  var dx = targetNode.x + targetNode.vx - sourceNode.x - sourceNode.vx;
  var dy = targetNode.y + targetNode.vy - sourceNode.y - sourceNode.vy;
  var dz = targetNode.z + targetNode.vz - sourceNode.z - sourceNode.vz;

  if (dx == 0.0) {
    dx = jiggle(l * 3u);
  }
  if (dy == 0.0) {
    dy = jiggle(l * 3u + 1u);
  }
  if (dz == 0.0) {
    dz = jiggle(l * 3u + 2u);
  }

  var dist = sqrt(dx * dx + dy * dy + dz * dz);
  // Coincident nodes have no defined direction; avoid a 0/0 below that would
  // turn into a NaN and spread through the graph on the next tick.
  if (!(dist > 0.0)) {
    dist = 1e-6;
  }
  let factor = (dist - link.distance) / dist * params.alpha * link.strength;
  dx *= factor;
  dy *= factor;
  dz *= factor;

  let bias = link.bias;
  let sourceShare = 1.0 - bias;

  linkForces[2u * l] = vec4<f32>(dx * sourceShare, dy * sourceShare, dz * sourceShare, 0.0);
  linkForces[2u * l + 1u] = vec4<f32>(-dx * bias, -dy * bias, -dz * bias, 0.0);
}
`

export const manyBodyWgsl = `
// Many-body (charge) force. Brute-force O(n^2) with tiled shared-memory reads.
//
// For the node counts this project targets (<= a few thousand) the direct sum
// is faster to maintain than a GPU Barnes-Hut tree, and it exactly matches the
// non-approximated part of d3's octree calculation.

struct Params {
  alpha: f32,
  velocityDecay: f32,
  nodeCount: u32,
  linkCount: u32,
  theta2: f32,
  distanceMin2: f32,
  distanceMax2: f32,
  centerX: f32,
  centerY: f32,
  centerZ: f32,
  centerStrength: f32,
  centerEnabled: u32,
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
  _pad3: f32,
}

struct Node {
  x: f32,
  y: f32,
  z: f32,
  vx: f32,
  vy: f32,
  vz: f32,
  fx: f32,
  fy: f32,
  fz: f32,
  strength: f32,
  radius: f32,
  _p0: f32,
  _p1: f32,
  _p2: f32,
  _p3: f32,
  _p4: f32,
}

@group(0) @binding(0) var<storage, read_write> nodes: array<Node>;
@group(0) @binding(1) var<uniform> params: Params;

const TILE_SIZE: u32 = 256u;

// x, y, z, strength
var<workgroup> tile: array<vec4<f32>, 256>;

fn jiggle(seed: u32) -> f32 {
  let s = (seed * 1103515245u + 12345u) & 0x7fffffffu;
  return (f32(s) / f32(0x7fffffff) - 0.5) * 1e-6;
}

@compute @workgroup_size(256)
fn main(
  @builtin(global_invocation_id) gid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>
) {
  let i = gid.x;
  let count = params.nodeCount;
  let valid = i < count;
  // Keep every invocation in the workgroup alive so the barriers below stay in
  // uniform control flow. Out-of-range invocations read a safe slot and their
  // writes are discarded at the end.
  let node = nodes[select(0u, i, valid)];
  var forceX = 0.0;
  var forceY = 0.0;
  var forceZ = 0.0;

  let numTiles = (count + TILE_SIZE - 1u) / TILE_SIZE;

  for (var t = 0u; t < numTiles; t = t + 1u) {
    let tileIndex = t * TILE_SIZE + lid.x;
    if (tileIndex < count) {
      let other = nodes[tileIndex];
      tile[lid.x] = vec4<f32>(other.x, other.y, other.z, other.strength);
    } else {
      tile[lid.x] = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    }

    workgroupBarrier();

    let tileEnd = min(TILE_SIZE, count - t * TILE_SIZE);
    for (var j = 0u; j < tileEnd; j = j + 1u) {
      let otherIndex = t * TILE_SIZE + j;
      if (otherIndex == i) {
        continue;
      }

      let other = tile[j];
      var dx = other.x - node.x;
      var dy = other.y - node.y;
      var dz = other.z - node.z;
      var l2 = dx * dx + dy * dy + dz * dz;

      // !(l2 < max) also skips NaN/Inf so one bad value can't poison the sum.
      if (!(l2 < params.distanceMax2)) {
        continue;
      }

      if (dx == 0.0) {
        dx = jiggle(i * count + otherIndex);
        l2 += dx * dx;
      }
      if (dy == 0.0) {
        dy = jiggle(i * count + otherIndex + 1u);
        l2 += dy * dy;
      }
      if (dz == 0.0) {
        dz = jiggle(i * count + otherIndex + 2u);
        l2 += dz * dz;
      }

      if (l2 < params.distanceMin2) {
        l2 = sqrt(params.distanceMin2 * l2);
      }
      // Guard coincident nodes (or a NaN carried in from elsewhere) so the
      // division below can never yield NaN.
      if (!(l2 > 0.0)) {
        l2 = max(params.distanceMin2, 1e-12);
      }

      let f = other.w * params.alpha / l2;
      forceX += dx * f;
      forceY += dy * f;
      forceZ += dz * f;
    }

    workgroupBarrier();
  }

  if (valid) {
    nodes[i].vx = node.vx + forceX;
    nodes[i].vy = node.vy + forceY;
    nodes[i].vz = node.vz + forceZ;
  }
}
`

export const centerSumWgsl = `
// Center force. A single workgroup reduces the mean position and writes the
// uniform offset applied by the integrate pass. This mirrors d3's forceCenter,
// which shifts every node by (mean - target) * strength.

struct Params {
  alpha: f32,
  velocityDecay: f32,
  nodeCount: u32,
  linkCount: u32,
  theta2: f32,
  distanceMin2: f32,
  distanceMax2: f32,
  centerX: f32,
  centerY: f32,
  centerZ: f32,
  centerStrength: f32,
  centerEnabled: u32,
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
  _pad3: f32,
}

struct Node {
  x: f32,
  y: f32,
  z: f32,
  vx: f32,
  vy: f32,
  vz: f32,
  fx: f32,
  fy: f32,
  fz: f32,
  strength: f32,
  radius: f32,
  _p0: f32,
  _p1: f32,
  _p2: f32,
  _p3: f32,
  _p4: f32,
}

@group(0) @binding(0) var<storage, read> nodes: array<Node>;
@group(0) @binding(1) var<uniform> params: Params;
@group(0) @binding(2) var<storage, read_write> center: array<vec4<f32>>;

const WG_SIZE: u32 = 256u;

var<workgroup> partial: array<vec4<f32>, 256>;

@compute @workgroup_size(256)
fn main(@builtin(local_invocation_id) lid: vec3<u32>) {
  let count = params.nodeCount;
  var sum = vec3<f32>(0.0, 0.0, 0.0);

  var i = lid.x;
  while (i < count) {
    let node = nodes[i];
    sum += vec3<f32>(node.x, node.y, node.z);
    i += WG_SIZE;
  }

  partial[lid.x] = vec4<f32>(sum, 0.0);
  workgroupBarrier();

  var stride = WG_SIZE / 2u;
  while (stride > 0u) {
    if (lid.x < stride) {
      partial[lid.x] = partial[lid.x] + partial[lid.x + stride];
    }
    workgroupBarrier();
    stride = stride / 2u;
  }

  if (lid.x == 0u) {
    let denom = f32(max(count, 1u));
    let mean = partial[0].xyz / denom;
    center[0] = vec4<f32>(
      (mean.x - params.centerX) * params.centerStrength,
      (mean.y - params.centerY) * params.centerStrength,
      (mean.z - params.centerZ) * params.centerStrength,
      0.0
    );
  }
}
`

export const integrateWgsl = `
// Integration pass. One invocation per node:
//   1. reduce the link force contributions from the CSR adjacency,
//   2. apply the center offset,
//   3. velocity-Verlet style position update with velocity decay,
//   4. honour fixed positions (fx/fy/fz).

struct Params {
  alpha: f32,
  velocityDecay: f32,
  nodeCount: u32,
  linkCount: u32,
  theta2: f32,
  distanceMin2: f32,
  distanceMax2: f32,
  centerX: f32,
  centerY: f32,
  centerZ: f32,
  centerStrength: f32,
  centerEnabled: u32,
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
  _pad3: f32,
}

struct Node {
  x: f32,
  y: f32,
  z: f32,
  vx: f32,
  vy: f32,
  vz: f32,
  fx: f32,
  fy: f32,
  fz: f32,
  strength: f32,
  radius: f32,
  _p0: f32,
  _p1: f32,
  _p2: f32,
  _p3: f32,
  _p4: f32,
}

@group(0) @binding(0) var<storage, read_write> nodes: array<Node>;
@group(0) @binding(1) var<uniform> params: Params;
@group(0) @binding(2) var<storage, read> linkStart: array<u32>;
@group(0) @binding(3) var<storage, read> linkSlots: array<u32>;
@group(0) @binding(4) var<storage, read> linkForces: array<vec4<f32>>;
@group(0) @binding(5) var<storage, read> center: array<vec4<f32>>;

fn isNaNf(v: f32) -> bool {
  // Bitwise test is immune to fast-math optimisations.
  let bits = bitcast<u32>(v);
  return (bits & 0x7fffffffu) > 0x7f800000u;
}

fn isFinitef(v: f32) -> bool {
  let bits = bitcast<u32>(v);
  return (bits & 0x7fffffffu) < 0x7f800000u;
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= params.nodeCount) {
    return;
  }

  var node = nodes[i];
  let prevX = node.x;
  let prevY = node.y;
  let prevZ = node.z;
  var vx = node.vx;
  var vy = node.vy;
  var vz = node.vz;

  let start = linkStart[i];
  let end = linkStart[i + 1u];
  for (var j = start; j < end; j = j + 1u) {
    let f = linkForces[linkSlots[j]];
    vx += f.x;
    vy += f.y;
    vz += f.z;
  }

  if (params.centerEnabled != 0u) {
    let offset = center[0].xyz;
    node.x = node.x - offset.x;
    node.y = node.y - offset.y;
    node.z = node.z - offset.z;
  }

  let decay = params.velocityDecay;
  if (isNaNf(node.fx)) {
    vx = vx * decay;
    node.x = node.x + vx;
  } else {
    node.x = node.fx;
    vx = 0.0;
  }
  if (isNaNf(node.fy)) {
    vy = vy * decay;
    node.y = node.y + vy;
  } else {
    node.y = node.fy;
    vy = 0.0;
  }
  if (isNaNf(node.fz)) {
    vz = vz * decay;
    node.z = node.z + vz;
  } else {
    node.z = node.fz;
    vz = 0.0;
  }

  // A single non-finite value must never be allowed to poison the graph: fall
  // back to the previous position and drop the velocity instead.
  if (!isFinitef(vx)) {
    vx = 0.0;
  }
  if (!isFinitef(vy)) {
    vy = 0.0;
  }
  if (!isFinitef(vz)) {
    vz = 0.0;
  }
  if (!isFinitef(node.x)) {
    node.x = select(0.0, prevX, isFinitef(prevX));
  }
  if (!isFinitef(node.y)) {
    node.y = select(0.0, prevY, isFinitef(prevY));
  }
  if (!isFinitef(node.z)) {
    node.z = select(0.0, prevZ, isFinitef(prevZ));
  }

  node.vx = vx;
  node.vy = vy;
  node.vz = vz;
  nodes[i] = node;
}
`
