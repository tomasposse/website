import * as THREE from "three";
import { GrassField } from "./grass";
import { getArchetype } from "./tree";
import { terrainHeight, riverDistance, riverVegetationDistance, bankFactor, smoothstep } from "./terrain";
import { meadowHeight } from "./terrain-field";
import { seededRandom, chunkSeed, hash2, fbm } from "./noise";
import type { WindSystem } from "./wind";
import type { QualityLevel } from "./quality";
import { CFG } from "../../experience-config";
import { riverPath } from "./river";
import { worldTileSize, activeTileCount } from "./layout";
import { selectViewportTiles, type ViewportDebug } from "./viewport-tiles";

// ▓▓ INFINITE STREAMING GRID ▓▓
// A pooled set of configured world tiles follows the finite ground footprint
// of the camera. Terrain, water and vegetation all use the same absolute tile
// grid. The configured budget is exact: tiles nearest the camera win when the
// viewport footprint contains more candidates than the available slots.
//
// Tile size and pool size come from CFG.world through layout.ts. All grass
// subsystems use these same values; there is no second hardcoded tile grid.

type TreeT = { a: number; x: number; y: number; z: number; s: number; r: number };
type FlowerT = { x: number; y: number; z: number; s: number; ci: number };
type Slot = { key: string; mesh: THREE.Mesh; trees: TreeT[] };

const MEADOW_LOW = new THREE.Color(0x6c8a56);
const MEADOW_HIGH = new THREE.Color(0xa7b97a);
const CHAN_MUD = new THREE.Color(0x57533d);

const FLOWER_PALETTE = [
  0xf6eeda, 0xf0bbca, 0xf3d77f, 0xbba9dc, 0xe69a7a, 0xaccee8,
].map(h => new THREE.Color(h));
type AlphaBounds = {
  imageWidth: number; imageHeight: number;
  minX: number; maxX: number; minY: number; maxY: number;
  width: number; height: number;
};
type FlowerTextures = {
  headTex: THREE.CanvasTexture; stemTex: THREE.CanvasTexture;
  headBounds: AlphaBounds; stemBounds: AlphaBounds;
};

function alphaBounds(canvas: HTMLCanvasElement): AlphaBounds {
  const width = canvas.width, height = canvas.height;
  const data = canvas.getContext("2d")!.getImageData(0, 0, width, height).data;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * 4 + 3] <= 8) continue;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  if (maxX < 0) return { imageWidth: width, imageHeight: height, minX: 0, maxX: width - 1, minY: 0, maxY: height - 1, width, height };
  return { imageWidth: width, imageHeight: height, minX, maxX, minY, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function flowerTextures(): FlowerTextures {
  const h = document.createElement("canvas");
  h.width = h.height = 128;
  const hx = h.getContext("2d")!;
  hx.clearRect(0, 0, 128, 128);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const px = 64 + Math.cos(a) * 21, py = 64 + Math.sin(a) * 21;
    hx.save();
    hx.translate(px, py);
    hx.rotate(a + Math.PI / 2);
    hx.fillStyle = "#ffffff";
    hx.beginPath();
    hx.ellipse(0, 0, 11, 17, 0, 0, Math.PI * 2);
    hx.fill();
    hx.restore();
  }
  hx.fillStyle = "#f3dfae"; hx.beginPath(); hx.arc(64, 64, 12, 0, Math.PI * 2); hx.fill();
  hx.fillStyle = "#d9b877"; hx.beginPath(); hx.arc(64, 64, 6, 0, Math.PI * 2); hx.fill();
  const s = document.createElement("canvas");
  s.width = 64; s.height = 128;
  const sx = s.getContext("2d")!;
  sx.clearRect(0, 0, 64, 128);
  sx.strokeStyle = "#527a30"; sx.lineWidth = 5; sx.lineCap = "round";
  sx.beginPath(); sx.moveTo(32, 126); sx.quadraticCurveTo(28, 82, 32, 22); sx.stroke();
  sx.strokeStyle = "#6f9a43"; sx.lineWidth = 4;
  sx.beginPath(); sx.moveTo(31, 94); sx.quadraticCurveTo(11, 90, 7, 74); sx.stroke();
  const headTex = new THREE.CanvasTexture(h);
  headTex.colorSpace = THREE.SRGBColorSpace;
  const stemTex = new THREE.CanvasTexture(s);
  stemTex.colorSpace = THREE.SRGBColorSpace;
  return { headTex, stemTex, headBounds: alphaBounds(h), stemBounds: alphaBounds(s) };
}

const FLOWER_VERT = /* glsl */ `
  attribute vec3 aOffset;
  attribute float aScale;
  attribute vec3 aTint;
  varying vec2 vUv; varying float vDepth; varying vec3 vTint;
  void main(){
    vec3 p = position;
    vec3 world = aOffset;
    vec2 toCam = normalize(cameraPosition.xz - world.xz);
    p.xz = mat2(toCam.y, -toCam.x, toCam.x, toCam.y) * p.xz;
    p *= aScale;

    vec4 mv = viewMatrix * modelMatrix * vec4(p + world, 1.0);
    vDepth = -mv.z; vUv = uv; vTint = aTint;
    gl_Position = projectionMatrix * mv;
  }
`;
const FLOWER_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uFogColor; uniform float uFogDensity, uFogNear, uFogFar, uFogPower, uFogLinear;
  varying vec2 vUv; varying float vDepth; varying vec3 vTint;
  void main(){
    // Preserve the painted stem texture and its original green palette. The
    // geometry below only controls the silhouette/root; it must not recolor
    // the artwork.
    vec4 t = texture2D(uMap, vUv);
    if (t.a < 0.35) discard;
    vec3 col = t.rgb * vTint;
    float expFog = 1.0 - exp(-uFogDensity * uFogDensity * vDepth * vDepth);
    float linearFog = pow(clamp((vDepth - uFogNear) / max(0.001, uFogFar - uFogNear), 0.0, 1.0), uFogPower);
    float fog = mix(expFog, linearFog, uFogLinear);
    gl_FragColor = vec4(mix(col, uFogColor, fog), 1.0);
  }
`;

function flowerMaterial(map: THREE.Texture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: map },
      uFogColor: { value: new THREE.Color(CFG.scene.fogColor) },
      uFogDensity: { value: CFG.scene.fogDensity },
      uFogNear: { value: CFG.scene.fogNear },
      uFogFar: { value: CFG.scene.fogFar },
      uFogPower: { value: CFG.scene.fogPower },
      uFogLinear: { value: CFG.scene.fogMode === "linear" ? 1 : 0 },
    },
    vertexShader: FLOWER_VERT,
    fragmentShader: FLOWER_FRAG,
    // Original flower material: the head texture is white and receives the
    // per-instance palette tint in bake(); the stem texture keeps its own
    // painted green colors.
    transparent: true,
    side: THREE.DoubleSide,
  });
}

function spriteGeometry(bounds: AlphaBounds, visibleWidth: number, visibleHeight: number, visibleBottomY: number) {
  // Position the raw canvas from its measured alpha bounds. The requested
  // dimensions describe visible artwork; transparent source margins are
  // converted into the raw quad dimensions and offsets automatically.
  const rawWidth = visibleWidth * bounds.imageWidth / bounds.width;
  const rawHeight = visibleHeight * bounds.imageHeight / bounds.height;
  const transparentBottom = (bounds.imageHeight - 1 - bounds.maxY) / bounds.imageHeight * rawHeight;
  const bottomY = visibleBottomY - transparentBottom;
  // Both source canvases use the same authored center. Do not recenter their
  // alpha bounds independently; that was the horizontal stem/head offset.
  const xOffset = 0;
  const u0 = 0, u1 = 1, v0 = 0, v1 = 1;
  const positions = new Float32Array([
    -rawWidth * 0.5 + xOffset, bottomY, 0,
    rawWidth * 0.5 + xOffset, bottomY, 0,
    -rawWidth * 0.5 + xOffset, bottomY + rawHeight, 0,
    rawWidth * 0.5 + xOffset, bottomY + rawHeight, 0,
  ]);
  const uvs = new Float32Array([u0, v0, u1, v0, u0, v1, u1, v1]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex([0, 1, 2, 1, 3, 2]);
  geometry.computeBoundingSphere();
  return geometry;
}

// terrain shader: meadow + river painted in one draw. The river mask is baked
// into each terrain vertex, so geometry, water color and item removal share one
// generated path instead of independently reconstructing it.
function makeTerrainMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uDeep: { value: new THREE.Color(CFG.water.deepColor) },
      uShallow: { value: new THREE.Color(CFG.water.lightColor) },
      uWaterContrast: { value: CFG.water.contrast },
      uFogColor: { value: new THREE.Color(CFG.scene.fogColor) },
      uFogDensity: { value: CFG.scene.fogDensity },
      uFogNear: { value: CFG.scene.fogNear },
      uFogFar: { value: CFG.scene.fogFar },
      uFogPower: { value: CFG.scene.fogPower },
      uFogLinear: { value: CFG.scene.fogMode === "linear" ? 1 : 0 },
      uKeyDir: { value: new THREE.Vector3(0.30, 0.91, 0.23).normalize() },
      uKeyColor: { value: new THREE.Color(CFG.scene.keyColor) },
      uKeyI: { value: CFG.scene.keyIntensity },
      uAmbient: { value: new THREE.Color(CFG.scene.ambientSkyColor) },
      uAmbientGround: { value: new THREE.Color(CFG.scene.ambientGroundColor) },
      uAmbientIntensity: { value: CFG.scene.ambientIntensity }
    },
    vertexShader: /* glsl */ `
      attribute vec3 color;
      attribute float aRiver;
      varying vec3 vWorld, vN, vCol;
      varying float vRiver, vDepth;
      void main(){
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        vN = normal;
        vCol = color;
        vRiver = aRiver;
        vec4 mv = viewMatrix * modelMatrix * vec4(position, 1.0);
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uFogColor, uKeyDir, uKeyColor, uAmbient, uAmbientGround, uDeep, uShallow;
      uniform float uFogDensity, uFogNear, uFogFar, uFogPower, uFogLinear, uKeyI, uAmbientIntensity, uWaterContrast;
      varying vec3 vWorld, vN, vCol;
      varying float vRiver, vDepth;

      void main(){
        float rf = clamp(vRiver, 0.0, 1.0);

        vec3 n = normalize(vN);
        float ndl = max(dot(n, uKeyDir), 0.0);
        vec3 ambient = mix(uAmbientGround, uAmbient, clamp(n.y * 0.5 + 0.5, 0.0, 1.0));
        vec3 col = vCol * (ambient * uAmbientIntensity + uKeyColor * uKeyI * ndl);

        float wet = (1.0 - smoothstep(0.6, 0.9, rf)) * smoothstep(0.0, 0.3, rf);
        col = mix(col, col * 0.6 + vec3(0.30, 0.31, 0.25), wet * 0.75);

        // Water only ever sits on the carved flat bed: height = meadow*(1-rf)
        // is exactly 0 where rf = 1 (the whole river core), so painting water
        // here keeps the surface a flat plane at level 0. rf never exceeds 1.
        float wa = smoothstep(0.9, 1.0, rf);
        if (wa > 0.0) {
          // Stable water: no time, camera, UV or tile-local chord pattern.
          // Every tile gets exactly the same result from the baked river mask.
          vec3 wcol = mix(uDeep, uShallow, clamp(0.35 + uWaterContrast * 0.25, 0.0, 1.0));
          col = mix(col, wcol, wa);
        }

        float expFog = 1.0 - exp(-uFogDensity * uFogDensity * vDepth * vDepth);
        float linearFog = pow(clamp((vDepth - uFogNear) / max(0.001, uFogFar - uFogNear), 0.0, 1.0), uFogPower);
        float fog = mix(expFog, linearFog, uFogLinear);
        gl_FragColor = vec4(mix(col, uFogColor, fog), 1.0);
      }`,
  });
}

// ── world ────────────────────────────────────────────────────────────────────
export class WorldSystem {
  grass: GrassField;
  debugTiles: { ti: number; tj: number }[] = [];
  viewportDebug: ViewportDebug = { camX: 0, camZ: 0, forwardX: 0, forwardZ: 1, leftX: -1, leftZ: 0, rightX: 1, rightZ: 0, tileSize: 1, tiles: [] };
  originX = 0;
  originZ = 0;
  private scene: THREE.Scene;
  private terrainMat: THREE.ShaderMaterial;
  private slots: Slot[] = [];
  private detail: { br: THREE.InstancedMesh; lf: THREE.InstancedMesh }[] = [];
  private stems: THREE.InstancedMesh;
  private blooms: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();
  private zero = new THREE.Matrix4().makeScale(0, 0, 0);
  private perGrass: number;
  private perFar: number;
  private perTrees: number;
  private perFlowers: number;
  private flowerData: (FlowerT | undefined)[];
  private seg: number;
  private viewportWidth = 1280;
  private viewportHeight = 720;
  private cameraFov = 72;
  private lastWantedKey = "";

  constructor(scene: THREE.Scene, wind: WindSystem, q: QualityLevel) {
    this.scene = scene;
    this.seg = q.terrainSegments;
    // grassCount is per active tile: billboarded tufts keep each tile full
    // without allocating an excessive population for every pooled slot.
    this.perGrass = q.grassCount;
    this.perFar = Math.floor(this.perGrass * 0.5);
    this.perTrees = Math.max(0, Math.round(CFG.trees.count));
    this.perFlowers = Math.max(0, Math.round(CFG.flowers.count));
    const slots = activeTileCount();
    const tile = worldTileSize();
    this.flowerData = new Array(slots * this.perFlowers);

    this.terrainMat = makeTerrainMaterial();
    for (let i = 0; i < slots; i++) {
      const g = new THREE.PlaneGeometry(tile, tile, q.terrainSegments, q.terrainSegments);
      g.rotateX(-Math.PI / 2);
      g.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute("position").count * 3), 3));
      g.setAttribute("aRiver", new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute("position").count), 1));
      const mesh = new THREE.Mesh(g, this.terrainMat);
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.slots.push({ key: "", mesh, trees: [] });
    }

    this.grass = new GrassField(wind, slots * this.perGrass, slots * this.perFar);
    this.grass.addTo(scene);

    this.detail = [];
    for (let a = 0; a < 3; a++) {
      const arche = getArchetype(a, a);
      const cap = slots * this.perTrees;
      const br = new THREE.InstancedMesh(arche.branches, new THREE.MeshStandardMaterial({ color: new THREE.Color(CFG.trees.trunkColor), roughness: 0.85, metalness: 0.05, fog: true }), cap);
      const lf = new THREE.InstancedMesh(arche.leaves, new THREE.MeshStandardMaterial({ color: new THREE.Color(CFG.trees.leafColor), roughness: 0.9, metalness: 0, side: THREE.DoubleSide, fog: true }), cap);
      for (const m of [br, lf]) { m.frustumCulled = false; m.count = cap; for (let s = 0; s < cap; s++) m.setMatrixAt(s, this.zero); }
      scene.add(br, lf);
      this.detail.push({ br, lf });
    }

    const tex = flowerTextures();
    const fcap = slots * this.perFlowers;
    const flowerHeight = CFG.flowers.height;
    // The configured height is the total visible flower height. Split it by
    // measured alpha bounds; each instance multiplies both meshes by its own
    // f.s value. Both use one shared root/join coordinate.
    const visibleHeightTotal = tex.stemBounds.height + tex.headBounds.height;
    const stemHeight = flowerHeight * tex.stemBounds.height / visibleHeightTotal;
    const headHeight = flowerHeight - stemHeight;
    const stemWidth = stemHeight * tex.stemBounds.width / tex.stemBounds.height;
    const headWidth = headHeight * tex.headBounds.width / tex.headBounds.height;
    this.stems = new THREE.InstancedMesh(
      spriteGeometry(tex.stemBounds, stemWidth, stemHeight, 0), flowerMaterial(tex.stemTex), fcap,
    );
    this.blooms = new THREE.InstancedMesh(
      spriteGeometry(tex.headBounds, headWidth, headHeight, stemHeight), flowerMaterial(tex.headTex), fcap,
    );
    for (const m of [this.stems, this.blooms]) {
      m.frustumCulled = false;
      m.count = fcap;
      const gg = m.geometry as THREE.BufferGeometry;
      gg.setAttribute("aOffset", new THREE.InstancedBufferAttribute(new Float32Array(fcap * 3), 3));
      gg.setAttribute("aScale", new THREE.InstancedBufferAttribute(new Float32Array(fcap), 1));
      gg.setAttribute("aTint", new THREE.InstancedBufferAttribute(new Float32Array(fcap * 3), 3));
    }
    scene.add(this.stems, this.blooms);
  }

  setViewport(width: number, height: number, fov: number) {
    this.viewportWidth = Math.max(1, width);
    this.viewportHeight = Math.max(1, height);
    this.cameraFov = fov;
  }

  update(camX: number, camZ: number, _yaw: number, _dt: number, viewCamera?: THREE.PerspectiveCamera) {
    // floating origin follows the same configured tile grid as every other
    // grass subsystem.
    const tile = worldTileSize();
    const newOX = Math.floor(camX / tile) * tile;
    const newOZ = Math.floor(camZ / tile) * tile;
    let originShift: { dx: number; dz: number } | null = null;
    if (newOX !== this.originX || newOZ !== this.originZ) {
      const dx = newOX - this.originX, dz = newOZ - this.originZ;
      originShift = { dx, dz };
      this.originX = newOX; this.originZ = newOZ;
      const nearO = this.grass.near.offsets, farO = this.grass.far.offsets;
      for (let i = 0; i < this.grass.near.capacity; i++) { nearO[i * 3] -= dx; nearO[i * 3 + 2] -= dz; }
      for (let i = 0; i < this.grass.far.capacity; i++) { farO[i * 3] -= dx; farO[i * 3 + 2] -= dz; }
      if (this.grass.near.mesh.geometry) this.grass.near.mesh.geometry.attributes.aOffset.needsUpdate = true;
      if (this.grass.far.mesh.geometry) this.grass.far.mesh.geometry.attributes.aOffset.needsUpdate = true;
    }

    const cameraForTiles = viewCamera || new THREE.PerspectiveCamera(this.cameraFov, this.viewportWidth / this.viewportHeight, 0.1, 1000);
    const wanted = selectViewportTiles(cameraForTiles, camX, camZ, terrainHeight(camX, camZ), tile, activeTileCount(), this.viewportDebug);
    const wantedKey = wanted.map(w => w.key).join("|");
    const layoutChanged = wantedKey !== this.lastWantedKey;
    this.lastWantedKey = wantedKey;
    this.debugTiles = wanted.map(({ ti, tj }) => ({ ti, tj }));
    // The selector returns exactly the configured tile budget. It ranks tiles
    // nearest the camera first, while keeping the allocation inside the
    // camera-facing coverage wedge.
    riverPath.ensureForCamera(camX, camZ);

    // recycle slots: keep existing, rebuild newly entered
    const byKey = new Map<string, number>();
    this.slots.forEach((s, i) => byKey.set(s.key, i));
    const used = new Set<number>();
    for (const w of wanted) if (byKey.has(w.key)) used.add(byKey.get(w.key)!);
    for (const w of wanted) {
      if (used.has(byKey.get(w.key) ?? -1)) continue;
      let free = -1;
      for (let i = 0; i < this.slots.length; i++) if (!used.has(i)) { free = i; break; }
      if (free < 0) break;
      used.add(free);
      const slot = this.slots[free];
      slot.key = w.key;
      // Resolve this exact tile's river yes/no state before terrain and
      // vegetation are generated. No tile can use stale river data.
      riverPath.ensureTile(w.ti, w.tj);
      this.build(slot, w.ti, w.tj, free);
    }

    // Clear pooled slots outside the current viewport so stale tiles never
    // leave empty-looking or overlapping geometry behind.
    for (let i = 0; i < this.slots.length; i++) {
      if (used.has(i)) continue;
      const slot = this.slots[i];
      slot.key = "";
      slot.mesh.visible = false;
      slot.trees = [];
      const nearStart = i * this.perGrass;
      const farStart = i * this.perFar;
      for (let n = 0; n < this.perGrass; n++) this.grass.near.scales[nearStart + n] = 0;
      for (let n = 0; n < this.perFar; n++) this.grass.far.scales[farStart + n] = 0;
      for (let n = 0; n < this.perFlowers; n++) this.flowerData[i * this.perFlowers + n] = undefined;
    }

    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (!s.key) continue;
      const [ti, tj] = s.key.split(",").map(Number);
      // PlaneGeometry is centered (local ±tile/2): place the mesh at the
      // absolute tile center so heights and items share the same coordinates.
      s.mesh.position.set(ti * tile + tile / 2 - this.originX, 0, tj * tile + tile / 2 - this.originZ);
    }

    if (layoutChanged || originShift) {
      this.grass.flush();
      this.bake();
    }
    return originShift;
  }

  // EXACT height + gradient on the tile's RENDERED mesh.
  private surfaceAt(slot: Slot, wx: number, wz: number, tileMinX: number, tileMinZ: number) {
    const pos = slot.mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
    const tile = worldTileSize();
    const seg = this.seg, cell = tile / seg;
    const ix = Math.min(seg, Math.max(0, (wx - tileMinX) / cell));
    // PlaneGeometry rows run from tileMinZ to tileMinZ + tile after the
    // rotateX(-PI/2), so world Z maps directly to the row index.
    const iy = Math.min(seg, Math.max(0, (wz - tileMinZ) / cell));
    const i0 = Math.min(seg - 1, Math.floor(ix));
    const j0 = Math.min(seg - 1, Math.floor(iy));
    const fx = ix - i0, fy = iy - j0;
    const idx = i0 + (seg + 1) * j0;
    const ha = pos.getY(idx), hb = pos.getY(idx + (seg + 1)), hc = pos.getY(idx + (seg + 1) + 1), hd = pos.getY(idx + 1);
    if (fx + fy <= 1) {
      return { y: (1 - fx - fy) * ha + fy * hb + fx * hd, gx: hd - ha, gz: -(hb - ha) };
    }
    return { y: (1 - fx) * hb + (fx + fy - 1) * hc + (1 - fy) * hd, gx: hc - hb, gz: -(hc - hd) };
  }

  private build(slot: Slot, ti: number, tj: number, si: number) {
    slot.mesh.visible = true;
    const tile = worldTileSize();
    const tileMinX = ti * tile, tileMinZ = tj * tile;
    const rng = seededRandom(chunkSeed(ti, tj));
    const pos = slot.mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
    const colors = slot.mesh.geometry.getAttribute("color") as THREE.BufferAttribute;
    const riverAttr = slot.mesh.geometry.getAttribute("aRiver") as THREE.BufferAttribute;
    const seg = this.seg, stride = seg + 1, cell = tile / seg;
    const c = new THREE.Color();
    // meadowHeight is normalized to [0, total] (each amp * fbm^3 layer, floor
    // exactly at water level 0, peaks at their amplitude), so the colour ramp
    // spans that whole range.
    const t = CFG.terrain;
    const heightSpan = t.rolling + t.hillSize + t.hillDetail + t.smallBumps + t.fineBumps;

    // Calculate the river distance/mask ONCE per terrain vertex. Reuse it for
    // the height and material color; never recalculate the corridor twice.
    for (let i = 0; i < pos.count; i++) {
      const wx = tileMinX + tile / 2 + pos.getX(i);
      const wz = tileMinZ + tile / 2 + pos.getZ(i);
      const rf = bankFactor(wx, wz);
      riverAttr.setX(i, rf);
      pos.setY(i, meadowHeight(wx, wz) * (1 - rf));
    }
    for (let i = 0; i < pos.count; i++) {
      const wx = tileMinX + tile / 2 + pos.getX(i);
      const wz = tileMinZ + tile / 2 + pos.getZ(i);
      const h = pos.getY(i);
      const ix = i % stride, iy = (i / stride) | 0;
      const hL = pos.getY(i - (ix > 0 ? 1 : 0)), hR = pos.getY(i + (ix < seg ? 1 : 0));
      const hD = pos.getY(i - (iy > 0 ? stride : 0)), hU = pos.getY(i + (iy < seg ? stride : 0));
      const slope = Math.sqrt((hR - hL) * (hR - hL) + (hU - hD) * (hU - hD)) / (2 * cell);
      const rf = riverAttr.getX(i);
      const heightT = smoothstep(0.0, heightSpan, h);
      const inChan = smoothstep(0.35, 0.95, rf);
      const varN = fbm(wx * 0.02 + 11, wz * 0.02 - 7, 2) - 0.5;
      const shade = 0.8 + 0.2 / (1 + slope * 1.5);
      c.copy(MEADOW_LOW).lerp(MEADOW_HIGH, heightT);
      c.lerp(CHAN_MUD, inChan);
      c.multiplyScalar((0.92 + varN * 0.24) * shade);
      colors.setXYZ(i, c.r, c.g, c.b);
    }
    pos.needsUpdate = true; colors.needsUpdate = true; riverAttr.needsUpdate = true;
    slot.mesh.geometry.computeVertexNormals();

    // Vegetation is removed inside water plus the configured shoreline margin;
    // terrain height remains available for items on the banks.
    const inRiver = (x: number, z: number) => riverDistance(x, z) < riverVegetationDistance();
    // grass at the tile's rendered surface height. On steep ground tufts get
    // smaller and sink a bit deeper so their base can't lift off the slope.
    // (cell is already defined above.)
    const gScale = CFG.grass;
    const nearBase = si * this.perGrass;
    for (let n = 0; n < this.perGrass; n++) {
      const x = tileMinX + rng() * tile, z = tileMinZ + rng() * tile;
      if (inRiver(x, z)) { this.grass.hide(this.grass.near, nearBase + n); continue; }
      const s = this.surfaceAt(slot, x, z, tileMinX, tileMinZ);
      const gx = s.gx / cell, gz = s.gz / cell;   // true slope (m per m)
      const steep = Math.max(0, Math.hypot(gx, gz) - 0.4);
      const k = Math.max(0.35, 1 - steep * 0.9);
      this.grass.write(this.grass.near, nearBase + n, x - this.originX, s.y, z - this.originZ,
        (gScale.scaleMin + rng() * (gScale.scaleMax - gScale.scaleMin)) * k, rng() * 6.28, rng(), gx, gz);
    }
    const farBase = si * this.perFar;
    for (let n = 0; n < this.perFar; n++) {
      const x = tileMinX + rng() * tile, z = tileMinZ + rng() * tile;
      if (inRiver(x, z)) { this.grass.hide(this.grass.far, farBase + n); continue; }
      const s = this.surfaceAt(slot, x, z, tileMinX, tileMinZ);
      const gx = s.gx / cell, gz = s.gz / cell;
      const steep = Math.max(0, Math.hypot(gx, gz) - 0.4);
      const k = Math.max(0.4, 1 - steep * 0.85);
      this.grass.write(this.grass.far, farBase + n, x - this.originX, s.y, z - this.originZ,
        (gScale.scaleMin + rng() * (gScale.scaleMax - gScale.scaleMin)) * k * 0.8, rng() * 6.28, rng(), gx, gz);
    }

    // trees at the rendered surface height
    slot.trees = [];
    for (let n = 0; n < this.perTrees; n++) {
      const x = tileMinX + rng() * tile, z = tileMinZ + rng() * tile;
      if (inRiver(x, z)) continue;
      slot.trees.push({ a: n % 3, x, y: this.surfaceAt(slot, x, z, tileMinX, tileMinZ).y, z, s: 1.5 + rng() * 0.8, r: rng() * 6.28 });
    }

    // flowers at the rendered surface height
    for (let n = 0; n < this.perFlowers; n++) {
      const idx = si * this.perFlowers + n;
      this.flowerData[idx] = undefined;
      const x = tileMinX + rng() * tile, z = tileMinZ + rng() * tile;
      if (inRiver(x, z)) continue;
      const s = this.surfaceAt(slot, x, z, tileMinX, tileMinZ);
      this.flowerData[idx] = {
        // Root position is the terrain sample itself. The visible alpha
        // bounds are aligned to this coordinate and then scaled by f.s.
        x,
        y: s.y,
        z,
        s: CFG.flowers.sizeMin + rng() * (CFG.flowers.sizeMax - CFG.flowers.sizeMin),
        ci: Math.floor(rng() * FLOWER_PALETTE.length),
      };
    }
  }

  private bake() {
    const trunkCol = new THREE.Color(CFG.trees.trunkColor);
    const leafCol = new THREE.Color(CFG.trees.leafColor);
    const count = new Array(3).fill(0);
    for (let a = 0; a < 3; a++)
      for (let s = 0; s < this.detail[a].br.count; s++) {
        this.detail[a].br.setMatrixAt(s, this.zero);
        this.detail[a].lf.setMatrixAt(s, this.zero);
      }
    for (const slot of this.slots) {
      for (const t of slot.trees) {
        const a = t.a;
        this.dummy.position.set(t.x - this.originX, t.y, t.z - this.originZ);
        this.dummy.rotation.set(0, t.r, 0);
        this.dummy.scale.setScalar(t.s);
        this.dummy.updateMatrix();
        const i = count[a]++;
        if (i < this.detail[a].br.count) {
          this.detail[a].br.setMatrixAt(i, this.dummy.matrix);
          this.detail[a].lf.setMatrixAt(i, this.dummy.matrix);
          const tv = hash2(Math.floor(t.x * 1.3), Math.floor(t.z * 1.3));
          this.detail[a].br.setColorAt(i, trunkCol.clone().multiplyScalar(0.9 + tv * 0.22));
          this.detail[a].lf.setColorAt(i, leafCol.clone().multiplyScalar(0.85 + tv * 0.32));
        }
      }
    }
    for (let a = 0; a < 3; a++) {
      this.detail[a].br.instanceMatrix.needsUpdate = true;
      this.detail[a].lf.instanceMatrix.needsUpdate = true;
      const brColor = this.detail[a].br.instanceColor;
      const lfColor = this.detail[a].lf.instanceColor;
      if (brColor) brColor.needsUpdate = true;
      if (lfColor) lfColor.needsUpdate = true;
    }

    const gs = this.stems.geometry, gb = this.blooms.geometry;
    const sOff = gs.getAttribute("aOffset") as THREE.InstancedBufferAttribute;
    const bOff = gb.getAttribute("aOffset") as THREE.InstancedBufferAttribute;
    const sScale = gs.getAttribute("aScale") as THREE.InstancedBufferAttribute;
    const bScale = gb.getAttribute("aScale") as THREE.InstancedBufferAttribute;
    const sTints = gs.getAttribute("aTint") as THREE.InstancedBufferAttribute;
    const bTints = gb.getAttribute("aTint") as THREE.InstancedBufferAttribute;
    const pal = FLOWER_PALETTE;
    for (let i = 0; i < this.flowerData.length; i++) {
      const f = this.flowerData[i];
      if (!f) { sScale.setX(i, 0); bScale.setX(i, 0); continue; }
      const lx = f.x - this.originX, lz = f.z - this.originZ;
      sOff.setXYZ(i, lx, f.y, lz);
      bOff.setXYZ(i, lx, f.y, lz);
      sScale.setX(i, f.s);
      bScale.setX(i, f.s);
        sTints.setXYZ(i, 1, 1, 1);
      const color = pal[f.ci];
      bTints.setXYZ(i, color.r, color.g, color.b);
    }
    sOff.needsUpdate = true; bOff.needsUpdate = true;
    sScale.needsUpdate = true; bScale.needsUpdate = true;
    sTints.needsUpdate = true; bTints.needsUpdate = true;
  }

  updateTerrain(_t: number, _camPos: THREE.Vector3) {
    const u = this.terrainMat.uniforms;
    u.uFogColor.value.set(CFG.scene.fogColor);
    u.uFogDensity.value = CFG.scene.fogDensity;
    u.uFogNear.value = Math.max(0, CFG.scene.fogNear);
    u.uFogFar.value = Math.max(u.uFogNear.value + 1, CFG.scene.fogFar);
    u.uFogPower.value = Math.max(0.001, CFG.scene.fogPower);
    u.uFogLinear.value = CFG.scene.fogMode === "linear" ? 1 : 0;
    u.uKeyColor.value.set(CFG.scene.keyColor);
    u.uKeyI.value = CFG.scene.keyIntensity;
    u.uAmbient.value.set(CFG.scene.ambientSkyColor);
    u.uAmbientGround.value.set(CFG.scene.ambientGroundColor);
    u.uAmbientIntensity.value = CFG.scene.ambientIntensity;
    u.uDeep.value.set(CFG.water.deepColor);
    u.uShallow.value.set(CFG.water.lightColor);
    u.uWaterContrast.value = CFG.water.contrast;
    const stemMaterial = this.stems.material as THREE.ShaderMaterial;
    const bloomMaterial = this.blooms.material as THREE.ShaderMaterial;
    for (const material of [stemMaterial, bloomMaterial]) {
      material.uniforms.uFogColor.value.set(CFG.scene.fogColor);
      material.uniforms.uFogDensity.value = CFG.scene.fogDensity;
      material.uniforms.uFogNear.value = Math.max(0, CFG.scene.fogNear);
      material.uniforms.uFogFar.value = Math.max(material.uniforms.uFogNear.value + 1, CFG.scene.fogFar);
      material.uniforms.uFogPower.value = Math.max(0.001, CFG.scene.fogPower);
      material.uniforms.uFogLinear.value = CFG.scene.fogMode === "linear" ? 1 : 0;
    }
  }

  updateGrass(dt: number, windDir: THREE.Vector2) { this.grass.update(dt, windDir); }

  dispose() {
    for (const s of this.slots) {
      this.scene.remove(s.mesh);
      s.mesh.geometry.dispose();
    }
    this.scene.remove(this.grass.near.mesh, this.grass.far.mesh);
    this.grass.dispose();
    for (const d of this.detail) {
      this.scene.remove(d.br, d.lf);
      // Archetype geometries are disposed by clearArchetypeCache() after this
      // world has released its meshes. Do not dispose them twice here.
      (d.br.material as THREE.Material).dispose();
      (d.lf.material as THREE.Material).dispose();
    }
    this.scene.remove(this.stems, this.blooms);
    this.stems.geometry.dispose();
    this.blooms.geometry.dispose();
    const stemMaterial = this.stems.material as THREE.ShaderMaterial;
    const bloomMaterial = this.blooms.material as THREE.ShaderMaterial;
    const stemTexture = stemMaterial.uniforms.uMap.value as THREE.Texture;
    const bloomTexture = bloomMaterial.uniforms.uMap.value as THREE.Texture;
    stemMaterial.dispose();
    bloomMaterial.dispose();
    stemTexture.dispose();
    bloomTexture.dispose();
    this.terrainMat.dispose();
  }
}