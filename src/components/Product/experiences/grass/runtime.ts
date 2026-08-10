import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { detectQuality } from "./utils/quality";
import { WindSystem } from "./utils/wind";
import { Sky } from "./utils/sky";
import { CloudLayer } from "./utils/clouds";
import { FlyCamera } from "./utils/camera";
import { WorldSystem } from "./utils/world";
import { clearArchetypeCache } from "./utils/tree";
import { DEV, CFG, installUI } from "../experience-config";
import type { ExperienceRuntime } from "../experience-config";

export function createExperience(host: HTMLElement): ExperienceRuntime {
const root = document.createElement("div");
root.className = "garden experience-shell";
root.style.cssText = "position:relative;width:100%;height:100%;min-height:0;overflow:hidden;background:#c3ddef";
host.replaceChildren(root);
const canvas = document.createElement("canvas");
canvas.className = "garden-canvas";
canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;cursor:grab;touch-action:none";
root.appendChild(canvas);
const debugMap = DEV ? document.createElement("canvas") : null;
const debugCtx = debugMap?.getContext("2d") || null;
if (debugMap && root) {
  debugMap.className = "garden-debug-map";
  debugMap.style.display = "none";
  document.body.appendChild(debugMap);
}

// ── visibility-gated lifecycle (boot lazily, pause when hidden) ─────────────
let booted = false;
let running = false;
let rafId = 0;
let previous = 0;
let dockEl: HTMLElement | null = null;

let wind: any, scene: any, sky: any, renderer: any, cam: any, composer: any, bloom: any, world: any, clouds: any;
let levelCache: any;
let resize: () => void;
let resizeObserver: ResizeObserver | null = null;
let envTarget: THREE.WebGLRenderTarget | null = null;
let disposed = false;
let bootFailure: string | null = null;
let destroyed = false;

function isVisible() {
  if (!root || !canvas) return false;
  const r = root.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

function disposeWorld() {
  if (world) {
    try { world.dispose(); } catch (error) { console.error("grass world dispose failed", error); }
    world = null;
  }
  clearArchetypeCache();
  if (clouds) {
    try { if (clouds.group.parent) clouds.group.parent.remove(clouds.group); clouds.dispose(); }
    catch (error) { console.error("grass cloud dispose failed", error); }
    clouds = null;
  }
}

// Rebuild geometry-hungry parts IN PLACE from the current CFG (no reload).
function applyBaked() {
  if (disposed || !booted || !renderer || !root) return;
  disposeWorld();
  levelCache = detectQuality();
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, levelCache.pixelRatio));
  world = new WorldSystem(scene, wind, levelCache);
  const box = root.getBoundingClientRect();
  world.setViewport(box.width, box.height, cam.camera.fov);
  clouds = new CloudLayer(CFG.clouds.count, CFG.clouds.spread);
  scene.add(clouds.group);
  cam.apply(world.originX, world.originZ);
  world.update(cam.worldX, cam.worldZ, cam.yaw, 1 / 60, cam.camera);
  cam.apply(world.originX, world.originZ);
}

function setDock(show: boolean) {
  if (!DEV) return;
  if (show && !dockEl) {
    dockEl = installUI(applyBaked);
  } else if (!show && dockEl) {
    dockEl.remove();
    dockEl = null;
  }
}

function setRunning(on: boolean) {
  if (destroyed || disposed || bootFailure || on === running) return;
  // The panel calls start after changing display. If the element is still
  // collapsed, wait for the next lifecycle call instead of creating a WebGL
  // renderer against a zero-sized canvas.
  if (on && !isVisible()) return;
  running = on;
  if (debugMap) debugMap.style.display = on ? "block" : "none";
  setDock(on);
  if (on) {
    if (!booted) {
      if (!boot()) {
        booted = false;
        running = false;
        bootFailure = "WebGL could not be initialized";
        if (debugMap) debugMap.style.display = "none";
        setDock(false);
        console.error("grass experience disabled: WebGL initialization failed");
        return;
      }
      booted = true;
    }
    previous = performance.now();
    rafId = requestAnimationFrame(tick);
  }
}

  setRunning(true);

function disposeRuntime() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
  running = false;
  resizeObserver?.disconnect();
  resizeObserver = null;
  disposeWorld();
  try { composer?.dispose?.(); } catch (error) { console.error("grass composer dispose failed", error); }
  try { renderer?.forceContextLoss?.(); } catch (error) { console.warn("grass context release failed", error); }
  try { renderer?.dispose?.(); } catch (error) { console.error("grass renderer dispose failed", error); }
  envTarget?.dispose();
  envTarget = null;
  composer = null;
  renderer = null;
  cam = null;
  sky = null;
  wind = null;
  scene = null;
  booted = false;
}

function boot() {
  if (!root || !canvas) return false;
  try {
  canvas!.dataset.ready = "1";
  const level = detectQuality();
  levelCache = level;

  wind = new WindSystem();
  scene = new THREE.Scene();

  sky = new Sky();
  scene.add(sky.mesh);
  scene.fog = CFG.scene.fogMode === "linear"
    ? new THREE.Fog(CFG.scene.fogColor, CFG.scene.fogNear, CFG.scene.fogFar)
    : new THREE.FogExp2(CFG.scene.fogColor, CFG.scene.fogDensity);
  // Live-tunable fill and key lights keep the meadow readable while allowing
  // the dock to move the palette from pastel haze to warm, high-contrast light.
  const hemi = new THREE.HemisphereLight(CFG.scene.ambientSkyColor, CFG.scene.ambientGroundColor, CFG.scene.ambientIntensity);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(CFG.scene.keyColor, CFG.scene.keyIntensity);
  key.position.set(40, 120, 30);
  scene.add(key);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, level.pixelRatio));
  renderer.setClearColor(CFG.scene.clearColor, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = CFG.scene.exposure;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  envTarget = envRT;
  scene.environment = envRT.texture;
  scene.environmentIntensity = CFG.scene.envIntensity;
  pmrem.dispose();

  cam = new FlyCamera(1);
  // Every fresh grass boot gets a different absolute world tile and heading.
  // Do not filter this position: starting on terrain, river, or pond is valid.
  const spawnTileRadius = 32;
  const spawnTile = () => Math.floor(Math.random() * (spawnTileRadius * 2 + 1)) - spawnTileRadius;
  const spawnTileSize = Math.max(1, Math.round(CFG.world.tileSize));
  cam.worldX = (spawnTile() + Math.random()) * spawnTileSize;
  cam.worldZ = (spawnTile() + Math.random()) * spawnTileSize;
  cam.yaw = Math.random() * Math.PI * 2;

  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, cam.camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), CFG.bloom.strength, CFG.bloom.radius, CFG.bloom.threshold);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  world = new WorldSystem(scene, wind, level);
  // Set the initial floating-origin tile before the first camera application.
  // This prevents the first world update from visibly relocating Windward.
  world.originX = Math.floor(cam.worldX / spawnTileSize) * spawnTileSize;
  world.originZ = Math.floor(cam.worldZ / spawnTileSize) * spawnTileSize;
  clouds = new CloudLayer(CFG.clouds.count, CFG.clouds.spread);
  scene.add(clouds.group);

  resize = () => {
    const box = root.getBoundingClientRect();
    if (!box.width || !box.height) return;
    cam.camera.aspect = box.width / box.height;
    cam.camera.updateProjectionMatrix();
    world?.setViewport(box.width, box.height, cam.camera.fov);
    renderer.setSize(box.width, box.height);
    composer.setSize(box.width, box.height);
    bloom.setSize(box.width, box.height);
  };
  resizeObserver?.disconnect();
  resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(root);
  resize();

  world.update(cam.worldX, cam.worldZ, cam.yaw, 1 / 60, cam.camera);
  cam.apply(world.originX, world.originZ);

  let dragging = false, lastX = 0, lastY = 0, pinch = 0;
  canvas.addEventListener("pointerdown", (e: PointerEvent) => { dragging = true; lastX = e.clientX; lastY = e.clientY; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", (e: PointerEvent) => {
    if (!dragging) return;
    cam.yaw -= (e.clientX - lastX) * 0.007;
    cam.pitch = THREE.MathUtils.clamp(cam.pitch + (e.clientY - lastY) * 0.004, -0.4, 0.4);
    lastX = e.clientX; lastY = e.clientY;
  });
  canvas.addEventListener("pointerup", () => dragging = false);
  canvas.addEventListener("pointercancel", () => dragging = false);
  canvas.addEventListener("wheel", (e: WheelEvent) => { e.preventDefault(); cam.speedMul = THREE.MathUtils.clamp(cam.speedMul + e.deltaY * 0.002, 0.2, 8); }, { passive: false });

  const touches = new Map();
  canvas.addEventListener("touchstart", (e: TouchEvent) => { Array.from(e.changedTouches).forEach((t) => touches.set(t.identifier, { x: t.clientX, y: t.clientY })); }, { passive: true });
  canvas.addEventListener("touchmove", (e: TouchEvent) => {
    if (touches.size >= 2) {
      const a = Array.from(touches.values());
      const d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
      if (pinch) cam.speedMul = THREE.MathUtils.clamp(cam.speedMul * (pinch / d), 0.2, 8);
      pinch = d;
    }
    Array.from(e.changedTouches).forEach((t) => touches.set(t.identifier, { x: t.clientX, y: t.clientY }));
  }, { passive: true });
  canvas.addEventListener("touchend", (e: TouchEvent) => { Array.from(e.changedTouches).forEach((t) => touches.delete(t.identifier)); pinch = 0; }, { passive: true });

  } catch (err) {
    console.error('grass boot failed', err);
    // A partial boot must not poison the next attempt. This is especially
    // important after a fast reload or when WebGL is temporarily unavailable.
    disposeRuntime();
    return false;
  }
  return true;
}

function disposeExperience() {
  if (destroyed) return;
  destroyed = true;
  disposed = true;
  disposeRuntime();
  if (dockEl) { dockEl.remove(); dockEl = null; }
  if (debugMap?.parentNode) debugMap.remove();
}
function drawDebugMap() {
  if (!DEV || !debugMap || !debugCtx || !cam || !world) return;
  const ctx = debugCtx;
  const w = debugMap.width = 300;
  const h = debugMap.height = 220;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "rgba(5,15,24,.92)";
  ctx.fillRect(0, 0, w, h);

  const vd = world.viewportDebug;
  // Stable metres-to-pixels scale: changing tileSize changes the square size.
  const tile = Math.max(1, vd.tileSize || CFG.world.tileSize);
  const tiles = world.debugTiles || [];
  const lineLengthWorld = 1000;
  // Fixed world metres-to-pixels scale. Tile geometry is not normalized away.
  const scale = 1.5;
  const centerX = vd.camX, centerZ = vd.camZ;
  const ox = w * 0.5 - centerX * scale, oz = h * 0.55 - centerZ * scale;
  const px = (x: number) => ox + x * scale;
  const pz = (z: number) => oz + z * scale;

  ctx.font = "10px monospace";
  ctx.fillStyle = "#b9dff2";
  ctx.fillText(`tiles ${tiles.length}/${Math.round(CFG.world.activeTiles)}  size ${tile}`, 8, 14);
  ctx.fillText(`view ${(Math.atan2(vd.forwardX, vd.forwardZ) * 180 / Math.PI).toFixed(0)}°  finite footprint`, 8, 25);
  const barMeters = 50, barPixels = barMeters * scale;
  ctx.strokeStyle = "#dcefff"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(8, h - 10); ctx.lineTo(8 + barPixels, h - 10); ctx.stroke();
  ctx.font = "9px monospace"; ctx.fillStyle = "#dcefff"; ctx.fillText(`${barMeters}m`, 10 + barPixels, h - 7);

  for (const t of tiles) {
    const wx = t.ti * tile, wz = t.tj * tile;
    ctx.fillStyle = "rgba(79,164,218,.62)";
    ctx.fillRect(px(wx), pz(wz), tile * scale, tile * scale);
    if (tile * scale >= 14) { ctx.fillStyle = "#e8f7ff"; ctx.fillText(`${t.ti},${t.tj}`, px(wx) + 3, pz(wz) + 12); }
  }

  const cx = px(vd.camX), cz = pz(vd.camZ);
  const fx = vd.forwardX, fz = vd.forwardZ;
  // Left/right are the actual screen-edge rays derived from camera FOV and
  // div aspect ratio. Together they show the viewport wedge, not one heading.
  const drawInfiniteRay = (x: number, z: number, color: string, width: number) => {
    ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(cx, cz);
    ctx.lineTo(cx + x * lineLengthWorld * scale, cz + z * lineLengthWorld * scale);
    ctx.stroke();
  };
  drawInfiniteRay(vd.leftX, vd.leftZ, "#ff9f69", 2);
  drawInfiniteRay(vd.rightX, vd.rightZ, "#ff9f69", 2);
  drawInfiniteRay(fx, fz, "rgba(255,223,114,.8)", 1);
  ctx.fillStyle = "#fff2a5"; ctx.beginPath(); ctx.arc(cx, cz, 3, 0, Math.PI * 2); ctx.fill();
}

function tick(now: number) {
  if (disposed || !running || !cam || !world || !scene || !renderer || !sky) return;
  const dt = Math.min((now - previous) / 1000, 0.05);
  previous = now;
  const t = now * 0.001;

  cam.update(dt);
  // Update the camera orientation first; WorldSystem uses the actual camera
  // quaternion to calculate the div's ground footprint. Apply again after a
  // possible floating-origin shift so render coordinates stay current.
  cam.apply(world.originX, world.originZ);
  const originShift = world.update(cam.worldX, cam.worldZ, cam.yaw, dt, cam.camera);
  if (originShift) clouds.rebase(originShift.dx, originShift.dz);
  cam.apply(world.originX, world.originZ);

  wind.update(t, 0, 0);
  sky.update(t, cam.camera);
  world.updateGrass(dt, wind.uniforms.uWindDir.value);
  clouds.update(dt, cam.camera, wind.uniforms.uWindDir.value);
  drawDebugMap();

  // Live rendering controls. These are applied before the render and are
  // intentionally independent from geometry rebuilds.
  scene.environmentIntensity = Number(CFG.scene.envIntensity);
  renderer.toneMappingExposure = Number(CFG.scene.exposure);
  renderer.setClearColor(CFG.scene.clearColor, 1);
  const linearFog = CFG.scene.fogMode === "linear";
  // The dock changes fog mode live. Recreate the Three fog object when the
  // mode changes, then update the active instance below.
  if (linearFog && !(scene.fog instanceof THREE.Fog)) {
    scene.fog = new THREE.Fog(CFG.scene.fogColor, CFG.scene.fogNear, CFG.scene.fogFar);
  } else if (!linearFog && !(scene.fog instanceof THREE.FogExp2)) {
    scene.fog = new THREE.FogExp2(CFG.scene.fogColor, CFG.scene.fogDensity);
  }
  if (scene.fog instanceof THREE.Fog) {
    scene.fog.color.set(CFG.scene.fogColor);
    scene.fog.near = Math.max(0, CFG.scene.fogNear);
    scene.fog.far = Math.max(scene.fog.near + 1, CFG.scene.fogFar);
  } else if (scene.fog instanceof THREE.FogExp2) {
    scene.fog.color.set(CFG.scene.fogColor);
    scene.fog.density = Math.max(0, CFG.scene.fogDensity);
  }
  // Keep custom materials and the Three scene synchronized every frame. The
  // dev dock mutates CFG directly; these values must not require a rebuild.
  const hemi = scene.getObjectByProperty("type", "HemisphereLight") as THREE.HemisphereLight | undefined;
  if (hemi) {
    hemi.color.set(CFG.scene.ambientSkyColor);
    hemi.groundColor.set(CFG.scene.ambientGroundColor);
    hemi.intensity = CFG.scene.ambientIntensity;
    hemi.visible = CFG.scene.ambientIntensity > 0;
  }
  const key = scene.getObjectByProperty("type", "DirectionalLight") as THREE.DirectionalLight | undefined;
  if (key) {
    key.color.set(CFG.scene.keyColor);
    key.intensity = CFG.scene.keyIntensity;
    key.visible = CFG.scene.keyIntensity > 0;
    key.position.set(40, 120, 30);
  }
  // Ensure custom materials receive the new values before the composer pass.
  world.updateTerrain(t, cam.camera.position);
  // These uniforms are custom shader inputs, so Three's built-in fog values
  // do not affect them. Push every fog control into every material each frame.
  world.grass.live();
  // EffectComposer owns the bloom pass; update its actual pass instance, not
  // only CFG, so dock changes are visible immediately.
  bloom.strength = CFG.bloom.strength;
  bloom.radius = CFG.bloom.radius;
  bloom.threshold = CFG.bloom.threshold;
  bloom.enabled = CFG.bloom.strength > 0.0001;
  // Keep every scene-level rendering control live, including clear color,
  // exposure, fog, environment, fill light, key light, and bloom.
  composer.render();
  rafId = requestAnimationFrame(tick);
}

  return { destroy: disposeExperience };
}
