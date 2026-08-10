import * as THREE from "three";
import { WIND_GLSL } from "./wind";
import { CFG } from "../../experience-config";
import type { WindSystem } from "./wind";

// ▓▓ grass ▓▓
// One instanced tuft per instance, placed at absolute world coordinates (the
// same frame as the one seamless tile). Billboarded to face the camera, tilted
// onto the local slope (identity on flat ground), blown by the wind.

function fmt(n: number) { return Number.isInteger(n) ? `${n}.0` : `${n}`; }

function tuftTexture() {
  const c = document.createElement("canvas");
  c.width = 128; c.height = 128;
  const x = c.getContext("2d")!;
  x.clearRect(0, 0, 128, 128);
  for (let i = 0; i < 15; i++) {
    const bx = 5 + (i / 15) * 118 + (Math.random() - 0.5) * 5;
    const h = 46 + Math.random() * 54;
    const lean = (Math.random() - 0.5) * 30;
    const w = 2.2 + Math.random() * 2.4;
    const tip = bx + lean;
    x.beginPath();
    x.moveTo(bx - w, 128);
    x.quadraticCurveTo(bx - w * 0.4, 128 - h * 0.55, tip, 128 - h);
    x.quadraticCurveTo(bx + w * 0.5, 128 - h * 0.45, bx + w, 128);
    x.closePath();
    const g = x.createLinearGradient(0, 128, 0, 128 - h);
    g.addColorStop(0, "#2e4c1d");
    g.addColorStop(0.5, "#5c8434");
    g.addColorStop(1, "#a6c26a");
    x.fillStyle = g;
    x.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function tuftGeometry() {
  const W = CFG.grass.bladeWidth, H = CFG.grass.bladeHeight;
  const position = new Float32Array([-W, 0, 0, W, 0, 0, -W * 0.55, H, 0, W * 0.55, H, 0]);
  const uv = new Float32Array([0, 0, 1, 0, 0.08, 1, 0.92, 1]);
  const index = new Uint32Array([0, 1, 2, 1, 3, 2]);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(position, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  g.computeBoundingSphere();
  return g;
}

export type GrassBand = {
  mesh: THREE.InstancedMesh;
  capacity: number;
  offsets: Float32Array;
  scales: Float32Array;
  phases: Float32Array;
  tints: Float32Array;
  grads: Float32Array;
};

export class GrassField {
  near: GrassBand;
  far: GrassBand;
  private material: THREE.ShaderMaterial;

  constructor(wind: WindSystem, nearCapacity: number, farCapacity: number) {
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        ...wind.uniforms,
        uMap: { value: tuftTexture() },
        uFogColor: { value: new THREE.Color(CFG.scene.fogColor) },
        uFogDensity: { value: CFG.scene.fogDensity },
        uFogNear: { value: CFG.scene.fogNear },
        uFogFar: { value: CFG.scene.fogFar },
        uFogPower: { value: CFG.scene.fogPower },
        uFogLinear: { value: CFG.scene.fogMode === "linear" ? 1 : 0 },
        uWindBend: { value: CFG.grass.windBend },
        uTintBase: { value: CFG.grass.tintBase },
        uTintRange: { value: CFG.grass.tintRange },
      },
      vertexShader: /* glsl */ `
        ${WIND_GLSL}
        uniform float uWindBend;
        attribute vec3 aOffset;
        attribute float aScale, aPhase, aTint;
        attribute vec2 aGrad;
        varying vec2 vUv; varying float vH, vTint, vDepth;
        void main() {
          vec3 p = position;
          float h = clamp(p.y / ${fmt(CFG.grass.bladeHeight)}, 0.0, 1.0);
          vec3 world = aOffset + uOrigin;

          // billboard: the painted face (+Z) aims at the camera (yaw only)
          vec2 toCam = normalize(cameraPosition.xz - world.xz);
          p.xz = mat2(toCam.y, -toCam.x, toCam.x, toCam.y) * p.xz;
          p.x += sin(aPhase * 7.0 + h * 4.0) * 0.1 * h;

          // follow the slope (55% of the normal): grass stands up but leans
          // with steep ground enough to look planted — never lying sideways
          vec3 n = normalize(vec3(-aGrad.x, 1.0, -aGrad.y));
          float ang = acos(clamp(n.y, -1.0, 1.0));
          if (ang > 0.02) {
            vec3 axis = normalize(cross(n, vec3(0.0, 1.0, 0.0)));
            float cs = cos(ang * 0.55), sn = sin(ang * 0.55);
            p = p * cs + cross(axis, p) * sn + axis * dot(axis, p) * (1.0 - cs);
          }

          // wind
          float w = windWave(world.xz + aPhase * 3.0, aPhase);
          p.xz += uWindDir * (w * 0.7 * h * h * uWindBend);
          p.y += sin(uTime * 2.2 + world.x + world.z) * 0.1 * h;
          p *= aScale;

          vec4 mv = viewMatrix * modelMatrix * vec4(p + world, 1.0);
          vDepth = -mv.z; vUv = uv; vH = h; vTint = aTint;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        uniform vec3 uFogColor; uniform float uFogDensity, uFogNear, uFogFar, uFogPower, uFogLinear;
        uniform float uTintBase, uTintRange;
        varying vec2 vUv; varying float vH, vTint, vDepth;
        void main() {
          vec4 t = texture2D(uMap, vUv);
          if (t.a < 0.4) discard;
          float tnt = uTintBase + vTint * uTintRange;
          vec3 col = mix(vec3(0.24, 0.40, 0.18), t.rgb, 0.5 + vH * 0.45);
          col = mix(col, vec3(0.31, 0.49, 0.23), tnt * 0.25);
          col *= 0.88 + tnt * 0.26;
          float expFog = 1.0 - exp(-uFogDensity * uFogDensity * vDepth * vDepth);
          float linearFog = pow(clamp((vDepth - uFogNear) / max(0.001, uFogFar - uFogNear), 0.0, 1.0), uFogPower);
          float fog = mix(expFog, linearFog, uFogLinear);
          gl_FragColor = vec4(mix(col, uFogColor, fog), 1.0);
        }`,
      side: THREE.DoubleSide,
      transparent: false,
    });
    this.near = this.makeBand(tuftGeometry(), nearCapacity);
    this.far = this.makeBand(tuftGeometry(), farCapacity);
  }

  private makeBand(geometry: THREE.BufferGeometry, capacity: number): GrassBand {
    const offsets = new Float32Array(capacity * 3);
    const scales = new Float32Array(capacity);
    const phases = new Float32Array(capacity);
    const tints = new Float32Array(capacity);
    const grads = new Float32Array(capacity * 2);
    geometry.setAttribute("aOffset", new THREE.InstancedBufferAttribute(offsets, 3));
    geometry.setAttribute("aScale", new THREE.InstancedBufferAttribute(scales, 1));
    geometry.setAttribute("aPhase", new THREE.InstancedBufferAttribute(phases, 1));
    geometry.setAttribute("aTint", new THREE.InstancedBufferAttribute(tints, 1));
    geometry.setAttribute("aGrad", new THREE.InstancedBufferAttribute(grads, 2));
    const mesh = new THREE.InstancedMesh(geometry, this.material, capacity);
    mesh.frustumCulled = false;
    mesh.count = 0;
    return { mesh, capacity, offsets, scales, phases, tints, grads };
  }

  addTo(scene: THREE.Scene) { scene.add(this.near.mesh, this.far.mesh); }

  write(band: GrassBand, slot: number, x: number, y: number, z: number, scale: number, phase: number, tint: number, gx = 0, gz = 0) {
    if (slot >= band.capacity) return;
    band.offsets[slot * 3] = x; band.offsets[slot * 3 + 1] = y; band.offsets[slot * 3 + 2] = z;
    band.scales[slot] = scale; band.phases[slot] = phase; band.tints[slot] = tint;
    band.grads[slot * 2] = gx; band.grads[slot * 2 + 1] = gz;
  }

  hide(band: GrassBand, slot: number) {
    if (slot < band.capacity) band.scales[slot] = 0;
  }

  live() {
    const u = this.material.uniforms;
    u.uFogDensity.value = CFG.scene.fogDensity;
    u.uFogNear.value = CFG.scene.fogNear;
    u.uFogFar.value = CFG.scene.fogFar;
    u.uFogPower.value = CFG.scene.fogPower;
    u.uFogLinear.value = CFG.scene.fogMode === "linear" ? 1 : 0;
    u.uFogColor.value.set(CFG.scene.fogColor);
    u.uWindBend.value = CFG.grass.windBend;
    u.uTintBase.value = CFG.grass.tintBase;
    u.uTintRange.value = CFG.grass.tintRange;
  }

  update(_dt: number, _windDir: THREE.Vector2) {
    // Wind animation is evaluated in the vertex shader from uTime/uWindDir.
    // Do not rewrite every instance's phase buffer every frame.
  }

  dispose() {
    const texture = this.material.uniforms.uMap.value as THREE.Texture;
    texture.dispose();
    this.material.dispose();
    this.near.mesh.geometry.dispose();
    this.far.mesh.geometry.dispose();
  }

  flush() {
    for (const b of [this.near, this.far]) {
      const g = b.mesh.geometry as THREE.BufferGeometry;
      g.attributes.aOffset.needsUpdate = true;
      g.attributes.aScale.needsUpdate = true;
      g.attributes.aPhase.needsUpdate = true;
      g.attributes.aTint.needsUpdate = true;
      g.attributes.aGrad.needsUpdate = true;
      b.mesh.count = b.capacity;
    }
  }
}