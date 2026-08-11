import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { EXPERIENCE_DEV } from '../experience-config';
import type { ExperienceRuntime } from '../experience-config';
import { DEFAULT_BOLT_PARAMS, boltParamsToText, type BoltParams } from './params';

type Sparks = {
  points: THREE.Points; positions: Float32Array; velocities: Float32Array; ages: Float32Array;
  lives: Float32Array; geometry: THREE.BufferGeometry; material: THREE.PointsMaterial; count: number;
};
type Bolt = {
  group: THREE.Group; materials: THREE.Material[]; light: THREE.PointLight; ground: THREE.Sprite;
  sparks: Sparks; start: THREE.Vector3; main: THREE.Vector3[]; age: number; life: number; alive: boolean;
};

export function createExperience(host: HTMLElement): ExperienceRuntime {
  host.innerHTML = '<div class="stage" style="position:relative;width:100%;height:100%;min-height:120px;overflow:hidden;background:#010108"><canvas style="position:absolute;inset:0;width:100%;height:100%;display:block;cursor:crosshair"></canvas></div>';
  const stage = host.firstElementChild as HTMLElement;
  const canvas = stage.querySelector('canvas') as HTMLCanvasElement;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x010108);
  scene.fog = new THREE.FogExp2(0x010108, 0.022);
  const params: BoltParams = { ...DEFAULT_BOLT_PARAMS };

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 80);
  camera.position.set(2, 4, 11);
  const cameraTarget = new THREE.Vector3(0, 2.5, 0);
  camera.lookAt(cameraTarget);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = params.brightness;
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), params.glowAmount, params.glowSpread, params.glowThreshold);
  composer.addPass(bloom);
  scene.add(new THREE.AmbientLight(0x080818, 0.04));

  const glowAmount = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d')!;
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.08, 'rgba(220,235,255,.8)');
    g.addColorStop(0.2, 'rgba(140,180,255,.3)'); g.addColorStop(0.4, 'rgba(60,100,220,.08)');
    g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();

  const bolts: Bolt[] = [];
  let raf = 0, clock = 0, dead = false;
  let observer: ResizeObserver | null = null;

  function path(a: THREE.Vector3, b: THREE.Vector3, depth = 6) {
    const out: THREE.Vector3[] = [];
    function split(p: THREE.Vector3, q: THREE.Vector3, d: number) {
      if (d >= depth) { if (!out.length || out[out.length - 1].distanceTo(p) > 0.001) out.push(p.clone()); out.push(q.clone()); return; }
      const m = new THREE.Vector3().lerpVectors(p, q, 0.5);
      const v = q.clone().sub(p), len = v.length();
      if (len < 0.01) { out.push(p.clone(), q.clone()); return; }
      let n = new THREE.Vector3(-v.y, v.x, 0);
      if (n.length() < 0.001) n.set(1, 0, 0); n.normalize();
      m.addScaledVector(n, (Math.random() - 0.5) * len * 0.38 * (1 - d / depth));
      split(p, m, d + 1); split(m, q, d + 1);
    }
    split(a, b, 0); return out;
  }
  function addLine(group: THREE.Group, materials: THREE.Material[], points: THREE.Vector3[], color: number, opacity: number) {
    if (points.length < 2) return;
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material));
    materials.push(material);
  }
  function addSprites(group: THREE.Group, materials: THREE.Material[], points: THREE.Vector3[], color: number, size: number, opacity: number, mult = 1) {
    const step = Math.max(1, Math.floor(points.length / (points.length * mult)));
    for (let i = 0; i < points.length; i += step) {
      const material = new THREE.SpriteMaterial({ map: glowAmount, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
      const sprite = new THREE.Sprite(material);
      sprite.position.copy(points[i]);
      sprite.scale.set(size * (0.6 + Math.random() * 0.5), size * (0.6 + Math.random() * 0.5), 1);
      group.add(sprite); materials.push(material);
    }
  }

  function make(x?: number, z?: number): Bolt {
    // Automatic strikes are positioned in camera space. Distance is measured
    // along the camera's forward axis, so moving the control farther away
    // cannot accidentally move the strike sideways in screen space.
    camera.updateMatrixWorld();
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward).normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    const distance = params.distanceFromCamera + (Math.random() - 0.5) * params.depthSpread;
    const horizontal = x ?? (params.horizontalCenter + (Math.random() - 0.5) * params.horizontalSpread);
    const center = z === undefined
      ? camera.position.clone().addScaledVector(forward, distance)
      : new THREE.Vector3(horizontal, 0, z);
    const lateral = z === undefined ? right.clone().multiplyScalar(horizontal) : new THREE.Vector3();
    const start = center.clone().add(lateral);
    start.y = 7.5 + Math.random() * 2;
    const end = center.clone().add(lateral);
    end.x += (Math.random() - 0.5) * 1.5;
    end.z += (Math.random() - 0.5) * 1.5;
    end.y = -0.45;
    const main = path(start, end, 7);
    const group = new THREE.Group(), materials: THREE.Material[] = [];
    addLine(group, materials, main, 0xffffff, params.brightCore);
    addLine(group, materials, main, 0x88ccff, params.middleGlow);
    addLine(group, materials, main, 0x4477dd, params.outerGlow);
    addSprites(group, materials, main, 0xaaccff, 0.35, 0.7);
    for (let i = 0; i < params.sideBranches; i++) {
      const off = 0.04 + Math.random() * 0.1;
      const a = start.clone().add(new THREE.Vector3((Math.random() - 0.5) * off, 0, (Math.random() - 0.5) * off));
      const b = end.clone().add(new THREE.Vector3((Math.random() - 0.5) * off * 2, (Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * off * 2));
      const branch = path(a, b, 6);
      addLine(group, materials, branch, 0x88bbff, params.middleGlow * 0.8);
      addLine(group, materials, branch, 0x4488ff, params.outerGlow * 0.6);
      addSprites(group, materials, branch, 0x88bbff, 0.15, 0.4, 0.5);
    }
    scene.add(group);
    const light = new THREE.PointLight(0x4488ff, 0, 28);
    light.position.copy(start); scene.add(light);
    const groundMat = new THREE.SpriteMaterial({ map: glowAmount, color: 0x4488ff, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending, depthWrite: false });
    const ground = new THREE.Sprite(groundMat);
    ground.position.set(end.x, -0.4, end.z); ground.scale.set(3, 3, 1); scene.add(ground);
    materials.push(groundMat);

    const count = Math.max(10, Math.round(params.sparks));
    const positions = new Float32Array(count * 3), velocities = new Float32Array(count * 3);
    const ages = new Float32Array(count), lives = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const p = main[Math.floor(Math.random() * main.length)];
      positions[i * 3] = p.x + (Math.random() - 0.5) * 0.2;
      positions[i * 3 + 1] = p.y + (Math.random() - 0.5) * 0.2;
      positions[i * 3 + 2] = p.z + (Math.random() - 0.5) * 0.2;
      velocities[i * 3] = (Math.random() - 0.5) * 6 * params.sparkLaunch;
      velocities[i * 3 + 1] = (Math.random() * 5 + 1) * params.sparkLaunch;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 6 * params.sparkLaunch;
      lives[i] = 0.1 + Math.random() * 0.5;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ size: 0.06, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
    const points = new THREE.Points(geometry, material); scene.add(points);
    return {
      group, materials, light, ground,
      sparks: { points, positions, velocities, ages, lives, geometry, material, count },
      start, main, age: 0, life: params.flashShortest + Math.random() * (params.flashLongest - params.flashShortest), alive: true,
    };
  }

  function kill(b: Bolt) {
    if (!b.alive) return; b.alive = false;
    scene.remove(b.group, b.light, b.ground, b.sparks.points);
    for (const m of b.materials) m.dispose();
    b.group.traverse(o => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); });
    b.sparks.geometry.dispose(); b.sparks.material.dispose();
  }
  function strike(x?: number, z?: number) {
    while (bolts.length > Math.max(1, params.maxOnScreen)) { const b = bolts.shift(); if (b) kill(b); }
    const n = Math.random() < 0.5 ? 2 : 1;
    for (let i = 0; i < n; i++) bolts.push(make(x === undefined ? undefined : x + (Math.random() - 0.5) * 0.5, z === undefined ? undefined : z + (Math.random() - 0.5) * 0.5));
  }
  function resize() {
    const b = stage.getBoundingClientRect();
    if (!b.width || !b.height) return;
    camera.aspect = b.width / b.height; camera.updateProjectionMatrix();
    renderer.setSize(b.width, b.height); composer.setSize(b.width, b.height); bloom.setSize(b.width, b.height);
  }
  let last = performance.now();
  function frame(now: number) {
    if (dead) return;
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now; clock += dt;
    if (Math.random() < dt * params.frequency) strike();
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i]; b.age += dt; const t = b.age / b.life;
      if (t > 1) { kill(b); bolts.splice(i, 1); continue; }
      const flick = 0.25 + 0.75 * (Math.sin(t * 280 + b.start.x * 11) * 0.2 + Math.sin(t * 410 + 4.2) * 0.2 + Math.sin(t * 160 + b.start.z * 7 + 1.9) * 0.18 + Math.sin(t * 550 + 6.8) * 0.15 + Math.random() * 0.15);
      const op = Math.max(0.02, Math.min(1, flick)) * Math.min(1, t / 0.015) * Math.max(0, (1 - t) / 0.1);
      for (const m of b.materials) m.opacity = op;
      b.light.intensity = op * 25;
      b.ground.material.opacity = 0.15 * op;
      b.ground.scale.setScalar(Math.min(4.2, 1 + t * 2.2));
      const s = b.sparks;
      for (let n = 0; n < s.count; n++) {
        s.ages[n] += dt;
        if (s.ages[n] < s.lives[n]) {
          s.positions[n * 3] += s.velocities[n * 3] * dt;
          s.positions[n * 3 + 1] += s.velocities[n * 3 + 1] * dt;
          s.positions[n * 3 + 2] += s.velocities[n * 3 + 2] * dt;
          s.velocities[n * 3] *= 0.93;
          s.velocities[n * 3 + 1] -= params.sparkFall * dt;
          s.velocities[n * 3 + 2] *= 0.93;
        } else { s.positions[n * 3] = b.start.x; s.positions[n * 3 + 1] = -10; s.positions[n * 3 + 2] = b.start.z; }
      }
      s.geometry.attributes.position.needsUpdate = true;
      s.material.opacity = 0.9 * op;
    }
    camera.position.set(Math.sin(clock * params.cameraRotation) * 12, 4, Math.cos(clock * params.cameraRotation) * 12);
    camera.lookAt(0, 2.5, 0);
    composer.render();
    raf = requestAnimationFrame(frame);
  }

  const onClick = (e: MouseEvent) => {
    const b = canvas.getBoundingClientRect();
    strike((e.clientX - b.left) / b.width * 18 - 9, (e.clientY - b.top) / b.height * (-13) + 6.5);
  };
  const onTouch = (e: TouchEvent) => {
    e.preventDefault();
    const t = e.touches[0], b = canvas.getBoundingClientRect();
    strike((t.clientX - b.left) / b.width * 18 - 9, (t.clientY - b.top) / b.height * (-13) + 6.5);
  };

  observer = new ResizeObserver(resize); observer.observe(stage);
  canvas.addEventListener('click', onClick);
  canvas.addEventListener('touchstart', onTouch, { passive: false });
  resize();
  raf = requestAnimationFrame(frame);

  let panel: HTMLElement | null = null;
  if (EXPERIENCE_DEV) {
    panel = buildBoltDevPanel(params, () => {
      renderer.toneMappingExposure = params.brightness;
      bloom.strength = params.glowAmount;
      bloom.radius = params.glowSpread;
      bloom.threshold = params.glowThreshold;
    });
    document.body.appendChild(panel);
  }

  return {
    destroy() {
      if (dead) return; dead = true;
      cancelAnimationFrame(raf); observer?.disconnect(); observer = null;
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('touchstart', onTouch);
      for (const b of bolts) kill(b);
      composer.dispose(); glowAmount.dispose();
      renderer.forceContextLoss(); renderer.dispose();
      if (panel?.parentNode) panel.remove();
      host.replaceChildren();
    },
  };
}

function buildBoltDevPanel(params: BoltParams, applyRender: () => void): HTMLElement {
  type Slider = { key: keyof BoltParams; label: string; min: number; max: number; step: number };
  const sliders: Slider[] = [
    { key: 'frequency', label: 'How often lightning appears', min: 0, max: 3, step: 0.05 },
    { key: 'maxOnScreen', label: 'How many flashes at once', min: 1, max: 12, step: 1 },
    { key: 'horizontalCenter', label: 'Move strikes left or right', min: -6, max: 6, step: 0.1 },
    { key: 'distanceFromCamera', label: 'Distance from camera', min: 1, max: 20, step: 0.1 },
    { key: 'horizontalSpread', label: 'Left-right strike spread', min: 1, max: 18, step: 0.5 },
    { key: 'depthSpread', label: 'Near-far strike spread', min: 1, max: 14, step: 0.5 },
    { key: 'flashShortest', label: 'Minimum flash time (seconds)', min: 0.05, max: 1, step: 0.01 },
    { key: 'flashLongest', label: 'Maximum flash time (seconds)', min: 0.1, max: 2, step: 0.01 },
    { key: 'sideBranches', label: 'Side branches per flash', min: 0, max: 8, step: 1 },
    { key: 'sparks', label: 'Sparks per flash', min: 10, max: 500, step: 5 },
    { key: 'sparkFall', label: 'Spark fall speed', min: 0, max: 10, step: 0.1 },
    { key: 'sparkLaunch', label: 'Spark launch strength', min: 0, max: 3, step: 0.05 },
    { key: 'cameraRotation', label: 'Camera rotation speed', min: 0, max: 0.2, step: 0.001 },
    { key: 'brightness', label: 'Overall brightness', min: 0.1, max: 1.5, step: 0.01 },
    { key: 'glowAmount', label: 'How bright the glow is', min: 0, max: 5, step: 0.05 },
    { key: 'glowSpread', label: 'Glow size', min: 0, max: 1, step: 0.01 },
    { key: 'glowThreshold', label: 'Brightness needed for glow', min: 0, max: 1, step: 0.01 },
    { key: 'brightCore', label: 'Bright core opacity', min: 0, max: 1, step: 0.01 },
    { key: 'middleGlow', label: 'Middle glow opacity', min: 0, max: 1, step: 0.01 },
    { key: 'outerGlow', label: 'Outer glow opacity', min: 0, max: 1, step: 0.01 },
  ];

  const panel = document.createElement('div');
  panel.style.cssText = 'box-sizing:border-box;position:fixed;left:12px;bottom:12px;z-index:99999;width:440px;max-height:80vh;overflow:auto;padding:10px;background:rgb(10 14 20 / 92%);color:#dfe9f2;font:11px/1.4 ui-monospace,monospace;border:1px solid rgb(140 190 220 / 25%);border-radius:10px;backdrop-filter:blur(10px);';
  const head = document.createElement('div');
  head.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-weight:700;color:#9ddcff;';
  head.textContent = 'Lightning bolt';
  const copy = document.createElement('button');
  copy.textContent = 'Copy';
  copy.style.cssText = 'background:#1d3a52;color:#cfe7ff;border:1px solid #3a6a8f;border-radius:6px;padding:3px 8px;cursor:pointer;';
  copy.onclick = () => {
    applyRender();
    navigator.clipboard?.writeText(boltParamsToText(params)).catch(() => {});
    copy.textContent = 'Copied ✓';
    setTimeout(() => { copy.textContent = 'Copy'; }, 1200);
  };
  head.appendChild(copy);
  panel.appendChild(head);

  for (const s of sliders) {
    const row = document.createElement('div');
    row.style.cssText = 'display:grid;grid-template-columns:190px 140px 56px;align-items:center;gap:8px;margin:7px 0;';
    const label = document.createElement('span');
    label.style.cssText = 'color:#c1d5e1;white-space:normal;line-height:1.2;';
    label.textContent = s.label;
    const slider = document.createElement('input');
    slider.type = 'range'; slider.min = String(s.min); slider.max = String(s.max); slider.step = String(s.step);
    slider.value = String(params[s.key]);
    slider.style.cssText = 'width:140px;accent-color:#63b8eb;';
    const val = document.createElement('span');
    val.style.cssText = 'text-align:right;color:#dff0ff;';
    val.textContent = String(params[s.key]);
    slider.oninput = () => {
      params[s.key] = Number(slider.value);
      val.textContent = String(params[s.key]);
      applyRender();
    };
    row.appendChild(label); row.appendChild(slider); row.appendChild(val);
    panel.appendChild(row);
  }
  return panel;
}