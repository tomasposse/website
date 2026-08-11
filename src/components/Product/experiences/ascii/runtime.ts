import { EXPERIENCE_DEV } from '../experience-config';
import type { ExperienceRuntime } from '../experience-config';
import { DT, MAX_FRAME } from './config';
import { DEFAULT_PARAMS, paramsToText, type Params } from './params';
import { advance, createWorld, hitTest, release, resizeWorld } from './physics';
import { draw, type RenderOptions } from './render';

export function createExperience(host: HTMLElement): ExperienceRuntime {
  const root = document.createElement('div');
  root.className = 'ascii experience-shell';
  root.style.cssText = 'position:relative;width:100%;height:100%;min-height:0;overflow:hidden;background:#04070c;touch-action:none;cursor:grab';
  host.replaceChildren(root);

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
  root.appendChild(canvas);
  const ctx = canvas.getContext('2d', { alpha: false })!;

  const params: Params = { ...DEFAULT_PARAMS };
  const renderOpts: RenderOptions = { ascii: true, tiles: 110 };

  const rect = root.getBoundingClientRect();
  let w = createWorld(Math.max(1, rect.width), Math.max(1, rect.height), params);
  let dead = false, raf = 0, acc = 0, last = performance.now();

  // rebuild the world from scratch (used when particle count changes / reset)
  const rebuild = () => {
    const r = root.getBoundingClientRect();
    w = createWorld(Math.max(1, r.width), Math.max(1, r.height), params);
  };

  const resize = () => {
    const r = root.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    resizeWorld(w, r.width, r.height);
    canvas.width = Math.round(w.width * dpr);
    canvas.height = Math.round(w.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(root);
  resize();

  const pos = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const down = (e: PointerEvent) => {
    const p = pos(e);
    const id = hitTest(w, p.x, p.y);
    if (id < 0 || w.pointers.has(e.pointerId)) return;
    const b = w.blobs[id];
    w.pointers.set(e.pointerId, { id: e.pointerId, x: p.x, y: p.y, blob: id, ox: p.x - b.cx, oy: p.y - b.cy });
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const move = (e: PointerEvent) => {
    const p = w.pointers.get(e.pointerId); if (!p) return;
    const q = pos(e); p.x = q.x; p.y = q.y;
  };
  const up = (e: PointerEvent) => release(w, e.pointerId);

  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);

  const frame = (now: number) => {
    if (dead) return;
    acc += Math.min(MAX_FRAME, (now - last) / 1000); last = now;
    while (acc >= DT) { advance(w, params); acc -= DT; }
    draw(ctx, w, params, renderOpts);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  // ---- dev panel (bottom-left) ----
  let panel: HTMLElement | null = null;
  if (EXPERIENCE_DEV) {
    panel = buildDevPanel(params, renderOpts, rebuild);
    document.body.appendChild(panel);
  }

  return {
    destroy() {
      if (dead) return; dead = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      if (panel?.parentNode) panel.remove();
      host.replaceChildren();
    },
  };
}

// Build the bottom-left dev panel: ASCII toggle + tile slider, physics
// sliders, and a button that copies all current values to text.
function buildDevPanel(params: Params, renderOpts: RenderOptions, onRebuild: () => void): HTMLElement {
  type Slider = { key: keyof Params; label: string; min: number; max: number; step: number };
  // Ranges are set to the magnitudes that actually matter for each force.
  // EVERY slider below genuinely changes the simulation.
  // Ranges are in the physical units the physics uses (px/s², 1/s², px, px/s)
  // so every slider maps to a real, comparable force magnitude.
  const sliders: Slider[] = [
    { key: 'count', label: 'particles / body', min: 40, max: 400, step: 10 },
    { key: 'dot', label: 'particle dot (px)', min: 1, max: 8, step: 0.1 },
    { key: 'gravity', label: 'gravity (px/s²)', min: 0, max: 250, step: 1 },
    { key: 'pull', label: 'centre pull (1/s²)', min: 0, max: 4, step: 0.05 },
    { key: 'spin', label: 'spin (1/s²)', min: 0, max: 3, step: 0.05 },
    { key: 'drift', label: 'drift (px/s²)', min: 0, max: 80, step: 1 },
    { key: 'cap', label: 'velocity cap (px/s)', min: 100, max: 1500, step: 10 },
    { key: 'drag', label: 'drag (1/s)', min: 0.5, max: 8, step: 0.1 },
    { key: 'coupling', label: 'coupling (px/s²)', min: 0, max: 250, step: 1 },
    { key: 'horizon', label: 'interaction horizon (px)', min: 60, max: 800, step: 10 },
    { key: 'tether', label: 'tether (1/s²)', min: 0, max: 30, step: 0.5 },
    { key: 'yield', label: 'yield distance (px)', min: 10, max: 200, step: 5 },
    { key: 'pack', label: 'packing stiffness', min: 0, max: 1, step: 0.05 },
    { key: 'clearance', label: 'clearance (px)', min: 2, max: 20, step: 0.1 },
    { key: 'halo', label: 'particle halo radius (px)', min: 0, max: 200, step: 2 },
    { key: 'mingle', label: 'particle mingle strength', min: 0, max: 120, step: 1 },
  ];

  const panel = document.createElement('div');
  panel.style.cssText = `
    box-sizing:border-box; position:fixed; left:12px; bottom:12px; z-index:99999;
    width:300px; max-height:70vh; overflow:auto; padding:10px;
    background:rgb(10 14 20 / 92%); color:#dfe9f2; font:11px/1.4 ui-monospace,monospace;
    border:1px solid rgb(140 190 220 / 25%); border-radius:10px; backdrop-filter:blur(10px);
  `;

  const head = document.createElement('div');
  head.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-weight:700;color:#9ddcff;';
  head.textContent = 'ASCII physics';
  const btns = document.createElement('div');
  btns.style.cssText = 'display:flex;gap:4px;';
  const reset = document.createElement('button');
  reset.textContent = 'Reset';
  reset.title = 'Respawn / reposition the bodies (keeps your slider values)';
  reset.style.cssText = 'background:#3a3a52;color:#cfe7ff;border:1px solid #3a6a8f;border-radius:6px;padding:3px 8px;cursor:pointer;';
  reset.onclick = () => {
    onRebuild(); // recreate blobs at their start spots, keep params as-is
  };
  btns.appendChild(reset);
  const copy = document.createElement('button');
  copy.textContent = 'Copy';
  copy.title = 'Copy all slider values';
  copy.style.cssText = 'background:#1d3a52;color:#cfe7ff;border:1px solid #3a6a8f;border-radius:6px;padding:3px 8px;cursor:pointer;';
  copy.onclick = () => {
    navigator.clipboard?.writeText(paramsToText(params)).catch(() => {});
    copy.textContent = 'Copied ✓';
    setTimeout(() => { copy.textContent = 'Copy'; }, 1200);
  };
  btns.appendChild(copy);
  head.appendChild(btns);
  panel.appendChild(head);

  // ASCII renderer toggle + tiles
  const renderRow = document.createElement('div');
  renderRow.style.cssText = 'margin-bottom:8px;';
  const asciiToggle = document.createElement('label');
  asciiToggle.style.cssText = 'display:flex;align-items:center;gap:6px;cursor:pointer;';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = renderOpts.ascii;
  cb.style.accentColor = '#4f9fdc';
  cb.onchange = () => { renderOpts.ascii = cb.checked; };
  asciiToggle.appendChild(cb);
  asciiToggle.appendChild(document.createTextNode('ASCII renderer'));
  renderRow.appendChild(asciiToggle);
  const tileRow = document.createElement('div');
  tileRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:4px;';
  const tileLabel = document.createElement('span');
  tileLabel.style.cssText = 'flex:1;color:#c1d5e1;';
  tileLabel.textContent = 'ASCII tiles';
  const tileSlider = document.createElement('input');
  tileSlider.type = 'range';
  tileSlider.min = '20';
  tileSlider.max = '160';
  tileSlider.step = '2';
  tileSlider.value = String(renderOpts.tiles);
  tileSlider.style.cssText = 'flex:1;accent-color:#63b8eb;';
  const tileVal = document.createElement('span');
  tileVal.style.cssText = 'width:34px;text-align:right;color:#dff0ff;';
  tileVal.textContent = String(renderOpts.tiles);
  tileSlider.oninput = () => { renderOpts.tiles = Number(tileSlider.value); tileVal.textContent = String(renderOpts.tiles); };
  tileRow.appendChild(tileLabel);
  tileRow.appendChild(tileSlider);
  tileRow.appendChild(tileVal);
  renderRow.appendChild(tileRow);
  panel.appendChild(renderRow);

  // physics sliders.
  for (const s of sliders) {
    const row = document.createElement('div');
    row.style.cssText = 'display:grid;grid-template-columns:1fr 110px 44px;align-items:center;gap:6px;margin:4px 0;';
    const label = document.createElement('span');
    label.style.cssText = 'color:#c1d5e1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    label.textContent = s.label;
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(s.min);
    slider.max = String(s.max);
    slider.step = String(s.step);
    slider.value = String(params[s.key]);
    slider.style.cssText = 'width:110px;accent-color:#63b8eb;';
    const val = document.createElement('span');
    val.style.cssText = 'text-align:right;color:#dff0ff;';
    val.textContent = String(params[s.key]);
    slider.oninput = () => {
      params[s.key] = Number(slider.value);
      val.textContent = String(params[s.key]);
      if (s.key === 'count') onRebuild();
    };
    row.appendChild(label);
    row.appendChild(slider);
    row.appendChild(val);
    panel.appendChild(row);
  }

  return panel;
}