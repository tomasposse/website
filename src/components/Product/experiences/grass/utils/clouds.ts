import * as THREE from "three";
import { CFG } from "../../experience-config";
import { terrainHeight } from "./terrain";

// ▓▓ clouds ▓▓
// A cloud = a loose cluster of overlapping soft puffs (billboarded sprites) so
// the silhouette is a rounded cumulus, never a rectangle. Clouds are ALWAYS
// visible anywhere in the sky — no proximity fade. They drift inside a box
// around the camera and only soften + wrap at the box edge (beyond the fog),
// so nothing ever pops into view.

function puffTexture() {
  const c = document.createElement("canvas");
  c.width = 128; c.height = 128;
  const x = c.getContext("2d")!;
  x.clearRect(0, 0, 128, 128);
  const g = x.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.45, "rgba(252,253,255,0.9)");
  g.addColorStop(0.8, "rgba(248,250,253,0.32)");
  g.addColorStop(1, "rgba(245,248,252,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

type Cloud = { group: THREE.Group; mats: THREE.ShaderMaterial[]; speed: number; altitude: number; geometries: THREE.BufferGeometry[] };

export class CloudLayer {
  group = new THREE.Group();
  private clouds: Cloud[] = [];
  private texture: THREE.Texture | null = null;
  private originX = 0;
  private originZ = 0;

  constructor(count: number, spread: number) {
    const map = puffTexture();
    this.texture = map;
    const c = CFG.clouds;
    for (let i = 0; i < count; i++) {
      const group = new THREE.Group();
      const mats: THREE.ShaderMaterial[] = [];
      const geometries: THREE.BufferGeometry[] = [];
      const alpha = c.opacityMin + Math.random() * (c.opacityMax - c.opacityMin);
      const nPuffs = 6 + Math.floor(Math.random() * 4);
      const w = 55 + Math.random() * 55;
      for (let p = 0; p < nPuffs; p++) {
        const r = 16 + Math.random() * 26;
        const mat = new THREE.ShaderMaterial({
          uniforms: {
            uMap: { value: map },
            uHorizon: { value: new THREE.Color(CFG.sky.horizon) },
            uAlpha: { value: alpha },
            uFade: { value: 1 },
          },
          vertexShader: /* glsl */ `
            varying vec2 vUv;
            void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
          fragmentShader: /* glsl */ `
            uniform sampler2D uMap; uniform vec3 uHorizon; uniform float uAlpha, uFade;
            varying vec2 vUv;
            void main(){
              vec4 t = texture2D(uMap, vUv);
              float a = t.a * uAlpha * uFade;
              if (a < 0.02) discard;
              vec3 col = mix(uHorizon, vec3(1.0), 0.55 + uFade * 0.45);
              gl_FragColor = vec4(col, a);
            }`,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const geometry = new THREE.PlaneGeometry(r * 2, r * 2 * 0.62);
        const mesh = new THREE.Mesh(geometry, mat);
        geometries.push(geometry);
        mesh.position.set((Math.random() - 0.5) * w, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 12);
        mesh.frustumCulled = false;
        group.add(mesh);
        mats.push(mat);
      }
      const altitude = c.altMin + Math.random() * (c.altMax - c.altMin);
      group.position.set(
        (Math.random() - 0.5) * spread,
        0,
        (Math.random() - 0.5) * spread
      );
      this.group.add(group);
      this.clouds.push({ group, mats, speed: 0.5 + Math.random() * 0.9, altitude, geometries });
    }
  }

  rebase(dx: number, dz: number) {
    this.originX += dx;
    this.originZ += dz;
    for (const cloud of this.clouds) {
      cloud.group.position.x -= dx;
      cloud.group.position.z -= dz;
    }
  }

  update(dt: number, camera: THREE.Camera, windDir: THREE.Vector2) {
    const HALF = CFG.clouds.fadeFar;   // box half-extent around the camera
    const FADE = 30;                   // metres of fade band at the box edges
    const spd = CFG.clouds.speedMul;
    for (const cloud of this.clouds) {
      const p = cloud.group.position;
      p.x += windDir.x * cloud.speed * spd * dt;
      p.z += windDir.y * cloud.speed * spd * dt;

      // Cloud altitude is relative to the terrain directly below it. This
      // keeps clouds above large hills instead of leaving them buried inside
      // terrain when rolling/hill amplitudes are increased.
      p.y = terrainHeight(p.x + this.originX, p.z + this.originZ) + cloud.altitude;

      const rx = p.x - camera.position.x;
      const rz = p.z - camera.position.z;

      // Continuous fade near the box edge: fade = 1 in the middle of the sky,
      // ramping smoothly to 0 as the cloud approaches the wrap boundary — and
      // after wrapping it fades back in the same way. No visible pop, ever.
      const r = Math.max(Math.abs(rx), Math.abs(rz));
      let fade = Math.min(1, Math.max(0, (HALF - r) / FADE));
      if (r > HALF) {
        if (Math.abs(rx) >= Math.abs(rz)) p.x -= 2 * HALF * Math.sign(rx);
        else p.z -= 2 * HALF * Math.sign(rz);
        fade = 0;
      }

      for (const m of cloud.mats) {
        m.uniforms.uFade.value = fade;
        m.uniforms.uHorizon.value.set(CFG.sky.horizon);
      }
      cloud.group.quaternion.copy(camera.quaternion);
    }
  }

  dispose() {
    for (const cloud of this.clouds) {
      this.group.remove(cloud.group);
      for (const m of cloud.mats) m.dispose();
      for (const geometry of cloud.geometries) geometry.dispose();
    }
    this.texture?.dispose();
    this.texture = null;
    this.clouds = [];
  }
}