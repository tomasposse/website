import { EXPERIENCE_DEV } from '../experience-config';
import type { ExperienceRuntime } from '../experience-config';
import { MAX_ELAPSED_SECONDS, STEP_SECONDS } from './config';
import { DEFAULT_PARAMS, type SimulationParams } from './params';
import { createSimulation, hitTest, releaseDrag, resizeSimulation, stepSimulation } from './physics';
import { render, type RenderOptions } from './render';

export function createExperience(host: HTMLElement): ExperienceRuntime {
  const root = document.createElement('div');
  root.className = 'ascii experience-shell';
  root.style.cssText = 'position:relative;width:100%;height:100%;min-height:0;overflow:hidden;background:#04070c;touch-action:none;cursor:grab';
  host.replaceChildren(root);

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
  root.appendChild(canvas);
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Could not create canvas context');

  const params: SimulationParams = { ...DEFAULT_PARAMS };
  const options: RenderOptions = { ascii: true, tileSize: params.tileSize, tileMode: false };
  const initial = root.getBoundingClientRect();
  let simulation = createSimulation(Math.max(1, initial.width), Math.max(1, initial.height), params);
  let dead = false;
  let raf = 0;
  let accumulator = 0;
  let previous = performance.now();

  const rebuild = () => {
    const rect = root.getBoundingClientRect();
    simulation = createSimulation(Math.max(1, rect.width), Math.max(1, rect.height), params);
  };

  const resize = () => {
    const rect = root.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
      resizeSimulation(simulation, rect.width, rect.height);
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(root);
  resize();

  const position = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * simulation.width / Math.max(1, rect.width),
      y: (event.clientY - rect.top) * simulation.height / Math.max(1, rect.height),
    };
  };

  const down = (event: PointerEvent) => {
    const point = position(event);
    const entityId = hitTest(simulation, point.x, point.y, params);
    if (entityId < 0) return;
    const entity = simulation.entities[entityId];
    simulation.dragState.set(event.pointerId, {
      pointerId: event.pointerId,
      entityId,
      x: point.x,
      y: point.y,
      offsetX: point.x - entity.x,
      offsetY: point.y - entity.y,
      velocityX: 0,
      velocityY: 0,
      lastTime: event.timeStamp,
    });
    canvas.setPointerCapture(event.pointerId);
    root.style.cursor = 'grabbing';
    event.preventDefault();
  };

  const move = (event: PointerEvent) => {
    const drag = simulation.dragState.get(event.pointerId);
    if (!drag) return;
    const point = position(event);
    const now = event.timeStamp;
    const elapsed = Math.max(1, now - drag.lastTime) / 1000;
    const nextX = point.x - drag.x;
    const nextY = point.y - drag.y;
    drag.velocityX = nextX / elapsed;
    drag.velocityY = nextY / elapsed;
    drag.x = point.x;
    drag.y = point.y;
    drag.lastTime = now;
  };

  const up = (event: PointerEvent) => {
    releaseDrag(simulation, event.pointerId);
    if (simulation.dragState.size === 0) root.style.cursor = 'grab';
  };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);

  const frame = (now: number) => {
    if (dead) return;
    accumulator += Math.min(MAX_ELAPSED_SECONDS, (now - previous) / 1000);
    previous = now;
    while (accumulator >= STEP_SECONDS) {
      stepSimulation(simulation, params);
      accumulator -= STEP_SECONDS;
    }
    render(ctx, simulation, params, options);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  let panel: HTMLElement | null = null;
  if (EXPERIENCE_DEV) {
    panel = buildPanel(params, options, rebuild, () => simulation);
    document.body.appendChild(panel);
  }

  return {
    destroy() {
      dead = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      panel?.remove();
      host.replaceChildren();
    },
  };
}

type Control = { key: keyof SimulationParams; label: string; min: number; max: number; step: number; rebuild?: boolean };

function buildPanel(params: SimulationParams, options: RenderOptions, rebuild: () => void, getSimulation: () => ReturnType<typeof createSimulation>) {
  const controls: Control[] = [
    { key: 'entitiesCount', label: 'Population · particles per entity', min: 1, max: 120, step: 1, rebuild: true },
    { key: 'dotRadius', label: 'Appearance · particle radius', min: 1, max: 30, step: 1 },
    { key: 'tileSize', label: 'Appearance · tile amount / size', min: 4, max: 32, step: 1 },
    { key: 'gravity', label: 'World · gravity (down)', min: -500, max: 500, step: 5 },
    { key: 'centerPull', label: 'World · center pull', min: 0, max: 2, step: 0.01 },
    { key: 'centerSpin', label: 'World · center spin', min: -2, max: 2, step: 0.01 },
    { key: 'noise', label: 'World · shared noise field', min: 0, max: 200, step: 1 },
    { key: 'particleNoise', label: 'Particles · individual noise', min: 0, max: 200, step: 1 },
    { key: 'maxSpeed', label: 'Motion · maximum speed', min: 0, max: 1000, step: 10 },
    { key: 'damping', label: 'Motion · damping', min: 0, max: 20, step: 0.1 },
    { key: 'entityCollision', label: 'Contact · body collision', min: 0, max: 2000, step: 5 },
    { key: 'cohesion', label: 'Shape · cohesion force', min: 0, max: 80, step: 0.5 },
    { key: 'particleCollision', label: 'Shape · particle collision', min: 0, max: 2000, step: 5 }
  ];

  // Controls must mutate the same render options object used by the frame loop.
  const renderOptions: RenderOptions = options;
  const panel = document.createElement('div');
  panel.style.cssText = 'box-sizing:border-box;position:fixed;left:12px;bottom:12px;z-index:99999;width:min(440px,calc(100vw - 24px));max-height:75vh;overflow:auto;padding:14px;background:rgb(4 10 18 / 98%);color:#fff;font:14px/1.4 ui-monospace,monospace;border:1px solid rgb(150 210 255 / 70%);border-radius:12px;box-shadow:0 12px 40px rgb(0 0 0 / 55%)';
  const title = document.createElement('strong');
  title.textContent = 'COLOR GROUP CONTROLS';
  title.style.cssText = 'display:block;color:#a9ddff;font-size:15px;margin-bottom:10px';
  panel.appendChild(title);

  const reset = document.createElement('button');
  reset.textContent = 'Reset groups';
  reset.onclick = rebuild;
  reset.style.cssText = 'padding:6px 8px;margin-bottom:10px;background:#14283a;color:#fff;border:1px solid #4f7897;border-radius:6px';
  panel.appendChild(reset);

  const tileToggle = document.createElement('label');
  tileToggle.style.cssText = 'display:flex;align-items:center;gap:8px;margin:0 0 12px;color:#fff;cursor:pointer';
  const tileCheckbox = document.createElement('input');
  tileCheckbox.type = 'checkbox';
  tileCheckbox.checked = options.tileMode;
  tileCheckbox.addEventListener('change', () => {
    options.tileMode = tileCheckbox.checked;
  });
  tileToggle.append(tileCheckbox, document.createTextNode('Tile characters: ON / OFF'));
  panel.appendChild(tileToggle);

  for (const control of controls) {
    const row = document.createElement('label');
    row.style.cssText = 'display:grid;grid-template-columns:minmax(0,1fr) 115px 55px;align-items:center;gap:8px;margin:8px 0';
    const label = document.createElement('span');
    label.textContent = control.label;
    label.style.cssText = 'white-space:normal;overflow-wrap:anywhere';
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(control.min);
    input.max = String(control.max);
    input.step = String(control.step);
    input.value = String(params[control.key]);
    const value = document.createElement('output');
    value.textContent = String(params[control.key]);
    value.style.cssText = 'text-align:right;font-weight:700';
    input.oninput = () => {
      const previousValue = params[control.key];
      params[control.key] = Number(input.value);
      value.textContent = input.value;
      if (control.key === 'dotRadius') {
        const scale = Number(input.value) / Math.max(0.01, Number(previousValue));
        for (const entity of getSimulation().entities) {
          for (const particle of entity.particles) {
            particle.homeX *= scale;
            particle.homeY *= scale;
            particle.x = entity.x + (particle.x - entity.x) * scale;
            particle.y = entity.y + (particle.y - entity.y) * scale;
          }
        }
      }
      if (control.key === 'tileSize') options.tileSize = Number(input.value);
      if (control.rebuild) rebuild();
    };
    row.append(label, input, value);
    panel.appendChild(row);
  }

  return panel;
}
