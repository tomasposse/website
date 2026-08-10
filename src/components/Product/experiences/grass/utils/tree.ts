import * as THREE from "three";
import { seededRandom } from "./noise";
import { CFG } from "../../experience-config";

export type Species = { trunkColor: number; leafColor: number; height: number; spread: number };

export const SPECIES: Species[] = [
  { trunkColor: 0x5d4531, leafColor: 0x4f7d47, height: 5.4, spread: 1.7 },
  { trunkColor: 0x6e5640, leafColor: 0x6f9a58, height: 5.0, spread: 1.5 },
  { trunkColor: 0x4f3a28, leafColor: 0x46724a, height: 6.2, spread: 1.6 },
];

export type TreeArchetype = { species: Species; branches: THREE.BufferGeometry; leaves: THREE.BufferGeometry };

const cache = new Map<string, TreeArchetype>();
const UP = new THREE.Vector3(0, 1, 0);

export function clearArchetypeCache() {
  // Archetype geometries are owned by this cache, not by the InstancedMeshes.
  // Dispose them before dropping the references or every rebuild leaks GPU
  // buffers (especially obvious when the dev dock is used repeatedly).
  for (const archetype of cache.values()) {
    archetype.branches.dispose();
    archetype.leaves.dispose();
  }
  cache.clear();
}

// Recursive branching tree: each child branch grows from the END of its parent,
// so the whole structure is connected (trunk -> limbs -> twigs), not scattered
// pieces. Leaves are small clusters at the twig tips.
export function getArchetype(speciesIndex: number, variant: number): TreeArchetype {
  const key = `${speciesIndex}:${variant}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const sp = SPECIES[speciesIndex % SPECIES.length];
  const rng = seededRandom(1013 + speciesIndex * 7919 + variant * 104729);
  const H = sp.height * CFG.trees.heightMul * (0.9 + rng() * 0.2);
  const S = sp.spread * CFG.trees.spreadMul * (0.9 + rng() * 0.2);

  const wood: THREE.BufferGeometry[] = [];
  const leaf: THREE.BufferGeometry[] = [];

  function grow(from: THREE.Vector3, dir: THREE.Vector3, len: number, rad: number, depth: number) {
    const segEnd = from.clone().addScaledVector(dir, len);
    // connected cylindrical segment (trunk/limb/twig)
    const seg = new THREE.CylinderGeometry(rad * 0.7, rad, len, 6, 1);
    seg.translate(0, len / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.clone());
    seg.applyQuaternion(q);
    seg.translate(from.x, from.y, from.z);
    wood.push(seg);

    if (depth <= 0) {
      // leaf cluster at the twig tip (a few overlapping small blobs)
      const cluster = 2 + Math.floor(rng() * 2);
      for (let k = 0; k < cluster; k++) {
        const r = S * (0.16 + rng() * 0.16);
        const puff = new THREE.SphereGeometry(r, 6, 5);
        puff.translate(segEnd.x + (rng() - 0.5) * 0.3, segEnd.y + (rng() - 0.5) * 0.3, segEnd.z + (rng() - 0.5) * 0.3);
        leaf.push(puff);
      }
      return;
    }

    const children = 2 + (rng() < 0.4 ? 1 : 0);
    for (let c = 0; c < children; c++) {
      // child direction = parent direction tilted open, rotated around it
      const tilt = 0.35 + rng() * 0.45;
      const angle = rng() * Math.PI * 2;
      const normal = new THREE.Vector3().crossVectors(dir, Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : UP).normalize();
      const binormal = new THREE.Vector3().crossVectors(dir, normal).normalize();
      const child = dir.clone()
        .multiplyScalar(Math.cos(tilt))
        .addScaledVector(normal, Math.sin(tilt) * Math.cos(angle))
        .addScaledVector(binormal, Math.sin(tilt) * Math.sin(angle))
        .normalize();
      grow(segEnd, child, len * (0.72 + rng() * 0.1), rad * 0.7, depth - 1);
    }
  }

  const depth = 4;
  grow(new THREE.Vector3(0, 0, 0), UP.clone(), H * 0.35, 0.3, depth);

  const archetype = { species: sp, branches: merge(wood), leaves: merge(leaf) };
  cache.set(key, archetype);
  return archetype;
}

function merge(geoms: THREE.BufferGeometry[]) {
  let vc = 0, ic = 0;
  for (const g of geoms) { vc += g.getAttribute("position").count; ic += g.index ? g.index.count : g.getAttribute("position").count; }
  const position = new Float32Array(vc * 3);
  const normal = new Float32Array(vc * 3);
  const index = new Uint32Array(ic);
  let vo = 0, io = 0;
  for (const g of geoms) {
    const p = g.getAttribute("position"), n = g.getAttribute("normal");
    for (let i = 0; i < p.count; i++) {
      position[(vo + i) * 3] = p.getX(i); position[(vo + i) * 3 + 1] = p.getY(i); position[(vo + i) * 3 + 2] = p.getZ(i);
      normal[(vo + i) * 3] = n.getX(i); normal[(vo + i) * 3 + 1] = n.getY(i); normal[(vo + i) * 3 + 2] = n.getZ(i);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) index[io++] = g.index.getX(i) + vo;
    else for (let i = 0; i < p.count; i++) index[io++] = i + vo;
    vo += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(position, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
  out.setIndex(new THREE.BufferAttribute(index, 1));
  out.computeBoundingSphere();
  return out;
}
