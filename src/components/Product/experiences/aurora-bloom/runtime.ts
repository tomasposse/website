import { EXPERIENCE_DEV } from '../experience-config';
import type { ExperienceRuntime } from '../experience-config';
import { DEFAULT_AURORA_PARAMS, auroraParamsToText, type AuroraParams } from './params';

type Particle = { x: number; y: number; vx: number; vy: number; seed: number; size: number; hue: number };
type GravityWell = { x: number; y: number; mass: number; spin: number; life: number };

export function createExperience(host: HTMLElement): ExperienceRuntime {
  host.innerHTML = `<div class="aurora-bloom" style="position:relative;width:100%;height:100%;min-height:120px;overflow:hidden;background:#05030d"><canvas style="position:absolute;inset:0;width:100%;height:100%;display:block;cursor:crosshair;touch-action:none"></canvas></div>`;
  const root = host.firstElementChild as HTMLElement;
  const canvas = root.querySelector('canvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Aurora Bloom could not create a canvas context');
  const params: AuroraParams = { ...DEFAULT_AURORA_PARAMS };

  const particles: Particle[] = [], wells: GravityWell[] = [];
  const pointer = { x: 0.5, y: 0.5, active: false, down: false };
  let width = 1, height = 1, ratio = 1, raf = 0, previous = 0, destroyed = false;

  const random = (seed: number) => { const v = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
  function resize() {
    const b = root.getBoundingClientRect();
    width = Math.max(1, b.width); height = Math.max(1, b.height);
    ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = width * ratio; canvas.height = height * ratio;
    ctx!.setTransform(ratio, 0, 0, ratio, 0, 0);
    particles.length = 0;
    const count = Math.min(900, Math.max(120, Math.floor(width * height / params.density)));
    for (let i = 0; i < count; i++) {
      const a = random(i + 1) * Math.PI * 2, r = Math.sqrt(random(i + 21)) * 0.62;
      particles.push({
        x: 0.5 + Math.cos(a) * r * width / Math.max(width, height),
        y: 0.5 + Math.sin(a) * r * height / Math.max(width, height),
        vx: 0, vy: 0, seed: random(i + 71) * 100,
        size: params.sizeMin + random(i + 101) * (params.sizeMax - params.sizeMin),
        hue: params.hueBase + random(i + 151) * params.hueRange,
      });
    }
  }
  function move(e: PointerEvent) { const b = canvas.getBoundingClientRect(); pointer.x = (e.clientX - b.left) / b.width; pointer.y = (e.clientY - b.top) / b.height; pointer.active = true; }
  function plant() { wells.push({ x: pointer.x, y: pointer.y, mass: pointer.down ? 2.8 : 1.7, spin: (pointer.x - pointer.y) * params.wellSpin, life: 1 }); if (wells.length > 12) wells.shift(); }
  function frame(now: number) {
    if (destroyed) return;
    const dt = Math.min((now - previous) / 1000 || 0.016, 0.05); previous = now;
    const time = now * 0.001, aspect = width / Math.max(1, height);
    for (const well of wells) well.life *= Math.pow(params.damping, dt * 60);
    for (const p of particles) {
      const dx = p.x - 0.5, dy = p.y - 0.5, r = Math.sqrt(dx * dx + dy * dy) || 0.001, a = Math.atan2(dy, dx);
      const flow = Math.sin(time * 0.34 + p.seed * 1.7 + r * 8) * params.flow;
      const swirl = params.swirl + r * params.swirlGrowth;
      p.vx += (-Math.sin(a) * swirl + Math.cos(a) * flow) * aspect;
      p.vy += (Math.cos(a) * swirl + Math.sin(a) * flow) / aspect;
      for (const well of wells) {
        const px = p.x - well.x, py = p.y - well.y, d = Math.sqrt(px * px + py * py) + 0.006, fall = Math.min(1, 0.16 / d) * well.life;
        const gravity = params.wellMass * fall * (0.0009 / 1.7), orbit = params.wellOrbit * fall * well.mass;
        p.vx -= px / d * gravity; p.vy -= py / d * gravity;
        p.vx += -py / d * orbit * well.spin * 0.12; p.vy += px / d * orbit * well.spin * 0.12;
      }
      if (pointer.active && pointer.down) {
        const px = p.x - pointer.x, py = p.y - pointer.y, d = Math.sqrt(px * px + py * py) + 0.01;
        if (d < 0.28) { const force = (1 - d / 0.28) ** 2 * params.pointerForce; p.vx -= px / d * force; p.vy -= py / d * force; }
      }
      p.vx *= Math.pow(params.damping, dt * 60); p.vy *= Math.pow(params.damping, dt * 60);
      p.x += p.vx * dt * 60; p.y += p.vy * dt * 60;
      if (p.x < -0.12) p.x = 1.12; if (p.x > 1.12) p.x = -0.12; if (p.y < -0.12) p.y = 1.12; if (p.y > 1.12) p.y = -0.12;
    }
    const bg = ctx!.createRadialGradient(width * 0.5, height * 0.48, 0, width * 0.5, height * 0.5, Math.max(width, height) * 0.78);
    bg.addColorStop(0, '#1a153d'); bg.addColorStop(0.42, '#0b1025'); bg.addColorStop(1, '#04050d');
    ctx!.fillStyle = bg; ctx!.fillRect(0, 0, width, height);
    ctx!.globalCompositeOperation = 'lighter';
    for (let i = 0; i < particles.length; i++) {
      const a = particles[i];
      for (let j = i + 1; j < particles.length; j++) {
        const b = particles[j], dx = (a.x - b.x) * width, dy = (a.y - b.y) * height, d = Math.sqrt(dx * dx + dy * dy);
        if (d > params.connectDist) continue;
        ctx!.strokeStyle = `hsla(${(a.hue + b.hue) * 0.5},85%,72%,${(1 - d / params.connectDist) * params.lineAlpha})`;
        ctx!.lineWidth = params.lineWidth;
        ctx!.beginPath(); ctx!.moveTo(a.x * width, a.y * height); ctx!.lineTo(b.x * width, b.y * height); ctx!.stroke();
      }
    }
    for (const p of particles) {
      const x = p.x * width, y = p.y * height, pulse = 0.82 + Math.sin(time * 1.8 + p.seed) * 0.18, r = (7 + p.size * 5) * pulse;
      const g = ctx!.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `hsla(${p.hue},100%,88%,${params.glow})`);
      g.addColorStop(0.16, `hsla(${p.hue},100%,70%,${params.glow * 0.31})`);
      g.addColorStop(1, `hsla(${p.hue},100%,60%,0)`);
      ctx!.fillStyle = g; ctx!.beginPath(); ctx!.arc(x, y, r, 0, Math.PI * 2); ctx!.fill();
      ctx!.fillStyle = `hsla(${p.hue},100%,88%,${0.46 + p.size * 0.18})`;
      ctx!.beginPath(); ctx!.arc(x, y, p.size * pulse, 0, Math.PI * 2); ctx!.fill();
    }
    ctx!.globalCompositeOperation = 'source-over';
    for (let i = wells.length - 1; i >= 0; i--) if (wells[i].life < 0.03) wells.splice(i, 1);
    raf = requestAnimationFrame(frame);
  }
  const down = (e: PointerEvent) => { pointer.down = true; move(e); plant(); canvas.setPointerCapture(e.pointerId); };
  const up = () => { pointer.down = false };
  const leave = () => { pointer.active = false; pointer.down = false };

  resize();
  const observer = new ResizeObserver(resize); observer.observe(root);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointerleave', leave);
  canvas.addEventListener('pointermove', () => { if (pointer.down && Math.random() < 0.12) plant(); });
  previous = performance.now();
  raf = requestAnimationFrame(frame);

  let panel: HTMLElement | null = null;
  if (EXPERIENCE_DEV) {
    const apply = () => { particles.length = 0; resize(); };
    panel = buildAuroraDevPanel(params, apply);
    document.body.appendChild(panel);
  }

  return {
    destroy() {
      if (destroyed) return; destroyed = true;
      cancelAnimationFrame(raf); observer.disconnect();
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointerleave', leave);
      if (panel?.parentNode) panel.remove();
      canvas.replaceWith(canvas.cloneNode(true));
      host.replaceChildren();
    },
  };
}

function buildAuroraDevPanel(params: AuroraParams, apply: () => void): HTMLElement {
  type Slider = { key: keyof AuroraParams; label: string; min: number; max: number; step: number };
  const sliders: Slider[] = [
    { key: 'density', label: 'density', min: 800, max: 12000, step: 100 },
    { key: 'flow', label: 'flow', min: 0, max: 0.001, step: 0.00001 },
    { key: 'swirl', label: 'swirl', min: 0, max: 0.001, step: 0.00001 },
    { key: 'swirlGrowth', label: 'swirl growth', min: 0, max: 0.003, step: 0.00001 },
    { key: 'wellMass', label: 'well mass', min: 0, max: 6, step: 0.1 },
    { key: 'wellOrbit', label: 'well orbit', min: 0, max: 0.006, step: 0.0001 },
    { key: 'wellSpin', label: 'well spin', min: -20, max: 20, step: 0.5 },
    { key: 'pointerForce', label: 'pointer force', min: 0, max: 0.01, step: 0.0001 },
    { key: 'damping', label: 'damping', min: 0.8, max: 1, step: 0.001 },
    { key: 'connectDist', label: 'connect dist', min: 10, max: 200, step: 2 },
    { key: 'lineAlpha', label: 'line alpha', min: 0, max: 0.3, step: 0.005 },
    { key: 'lineWidth', label: 'line width', min: 0.1, max: 2, step: 0.05 },
    { key: 'sizeMin', label: 'size min', min: 0.1, max: 3, step: 0.05 },
    { key: 'sizeMax', label: 'size max', min: 0.5, max: 6, step: 0.05 },
    { key: 'hueBase', label: 'hue base', min: 0, max: 360, step: 1 },
    { key: 'hueRange', label: 'hue range', min: 0, max: 360, step: 1 },
    { key: 'glow', label: 'glow', min: 0, max: 1, step: 0.01 },
  ];

  const panel = document.createElement('div');
  panel.style.cssText = 'box-sizing:border-box;position:fixed;left:12px;bottom:12px;z-index:99999;width:300px;max-height:70vh;overflow:auto;padding:10px;background:rgb(10 14 20 / 92%);color:#dfe9f2;font:11px/1.4 ui-monospace,monospace;border:1px solid rgb(140 190 220 / 25%);border-radius:10px;backdrop-filter:blur(10px);';
  const head = document.createElement('div');
  head.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-weight:700;color:#9ddcff;';
  head.textContent = 'Aurora bloom';
  const copy = document.createElement('button');
  copy.textContent = 'Copy';
  copy.style.cssText = 'background:#1d3a52;color:#cfe7ff;border:1px solid #3a6a8f;border-radius:6px;padding:3px 8px;cursor:pointer;';
  copy.onclick = () => {
    navigator.clipboard?.writeText(auroraParamsToText(params)).catch(() => {});
    copy.textContent = 'Copied ✓';
    setTimeout(() => { copy.textContent = 'Copy'; }, 1200);
  };
  head.appendChild(copy);
  panel.appendChild(head);

  for (const s of sliders) {
    const row = document.createElement('div');
    row.style.cssText = 'display:grid;grid-template-columns:1fr 110px 44px;align-items:center;gap:6px;margin:4px 0;';
    const label = document.createElement('span');
    label.style.cssText = 'color:#c1d5e1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    label.textContent = s.label;
    const slider = document.createElement('input');
    slider.type = 'range'; slider.min = String(s.min); slider.max = String(s.max); slider.step = String(s.step);
    slider.value = String(params[s.key]);
    slider.style.cssText = 'width:110px;accent-color:#63b8eb;';
    const val = document.createElement('span');
    val.style.cssText = 'text-align:right;color:#dff0ff;';
    val.textContent = String(params[s.key]);
    slider.oninput = () => {
      params[s.key] = Number(slider.value);
      val.textContent = String(params[s.key]);
      apply();
    };
    row.appendChild(label); row.appendChild(slider); row.appendChild(val);
    panel.appendChild(row);
  }
  return panel;
}