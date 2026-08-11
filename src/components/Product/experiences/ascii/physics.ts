import { BLOBS, BLOB_COUNT, DT, EDGE_PAD, SOLVER_PASSES, STARTS, RULES, ruleIndex } from './config';
import type { Params } from './params';
import type { Blob, Particle, World } from './types';

const TAU = Math.PI * 2;
const EPS = 1e-6;

function noise(t: number, seed: number) {
  return Math.sin(t * 1.17 + seed * 2.3) * 0.65 + Math.sin(t * 0.41 + seed * 5.1) * 0.35;
}

// Non-harmonic interaction field. There is deliberately no universal
// attraction term: every mode either circulates, separates, exchanges motion,
// or alternates. This prevents the four bodies from all collapsing together.
function pairResponse(kind: string, a: number, b: number, nx: number, ny: number, fall: number, avx: number, avy: number, bvx: number, bvy: number, time: number) {
  const tx = -ny, ty = nx;
  const rvx = bvx - avx, rvy = bvy - avy;
  const radialVelocity = rvx * nx + rvy * ny;
  const tangentVelocity = rvx * tx + rvy * ty;
  const phase = time * (1.7 + (a + b) * 0.31);

  switch (kind) {
    case 'orbit': {
      // A bounded tangential stream plus a near-field pressure wall. It never
      // has a long-range attractive component.
      const wall = Math.max(0, 0.42 - fall) * 2.4;
      return { x: (tx * 1.45 - nx * wall) * fall, y: (ty * 1.45 - ny * wall) * fall };
    }
    case 'barrier': {
      // Inverse-distance pressure. Close particles are expelled; at range the
      // force vanishes instead of turning into attraction.
      const pressure = Math.min(2.8, 0.18 / Math.max(0.08, 1 - fall));
      return { x: -nx * pressure * fall, y: -ny * pressure * fall };
    }
    case 'exchange': {
      // Relative velocity is rotated and exchanged. This changes trajectories
      // without reducing the separation between the bodies.
      const exchange = Math.tanh(tangentVelocity * 0.018) * 1.8;
      return { x: (tx * exchange - nx * radialVelocity * 0.01) * fall, y: (ty * exchange - ny * radialVelocity * 0.01) * fall };
    }
    case 'ripple': {
      // Alternating radial shells: attraction and repulsion alternate by
      // distance, so there is no single rest distance or harmonic basin.
      const wave = Math.sin(phase + (1 - fall) * Math.PI * 5);
      return { x: nx * wave * fall, y: ny * wave * fall };
    }
    case 'shear': {
      // Tangential shear flips with the direction of relative motion and adds
      // no radial pull, so the pair slides past instead of joining.
      const shear = Math.tanh(tangentVelocity * 0.025) * 1.6;
      return { x: tx * shear * fall, y: ty * shear * fall };
    }
    case 'wander':
    default: {
      // A rotating, time-dependent field with a small outward component. It
      // continuously changes direction rather than settling at equilibrium.
      const angle = phase + Math.sin(time * 0.8 + a) * 0.7;
      const c = Math.cos(angle), s = Math.sin(angle);
      return { x: (nx * c - ny * s) * fall, y: (nx * s + ny * c) * fall };
    }
  }
}

function seedBlob(index: number, width: number, height: number, params: Params): Blob {
  const def = BLOBS[index];
  const cx = width * STARTS[index].x;
  const cy = height * STARTS[index].y;
  const particles: Particle[] = [];
  const count = Math.max(24, Math.round(params.count));
  const golden = Math.PI * (3 - Math.sqrt(5));
  const phases = Array.from({ length: 4 }, (_, i) => Math.sin(index * 17.3 + i * 9.7) * TAU);

  for (let i = 0; i < count; i++) {
    const angle = i * golden + phases[0];
    const radius = 31 * Math.sqrt((i + 0.5) / count);
    const shape = 1 + 0.16 * Math.sin(angle * 3 + phases[1]) + 0.09 * Math.sin(angle * 7 + phases[2]);
    const hx = Math.cos(angle) * radius * shape;
    const hy = Math.sin(angle) * radius * shape;
    particles.push({ x: cx + hx, y: cy + hy, vx: 0, vy: 0, ax: 0, ay: 0, hx, hy });
  }
  return { def: index, color: def.color, particles, cx, cy, vx: 0, vy: 0, ax: 0, ay: 0 };
}

export function createWorld(width: number, height: number, params: Params): World {
  return {
    width,
    height,
    time: 0,
    blobs: Array.from({ length: BLOB_COUNT }, (_, i) => seedBlob(i, width, height, params)),
    pointers: new Map(),
  };
}

export function resizeWorld(world: World, width: number, height: number) {
  const sx = width / Math.max(1, world.width);
  const sy = height / Math.max(1, world.height);
  world.width = width;
  world.height = height;
  for (const blob of world.blobs) {
    blob.cx *= sx; blob.cy *= sy;
    for (const p of blob.particles) {
      p.x *= sx; p.y *= sy; p.hx *= sx; p.hy *= sy;
    }
  }
}

// Physics order:
// 1. clear and accumulate accelerations from the current state
// 2. integrate velocity and position
// 3. solve particle contact constraints
// 4. resolve world boundaries
// The force model is a damped second-order system. Pair interactions are
// phase-rotated separation vectors: each pair has a distinct phase, while all
// bodies remain mechanically identical.
export function advance(world: World, params: Params) {
  world.time += DT;
  accumulate(world, params);
  moveDragged(world);
  integrate(world, params);
  for (let pass = 0; pass < SOLVER_PASSES; pass++) solveContacts(world, params);
  resolveBounds(world, params);
}

function accumulate(world: World, params: Params) {
  const centerX = world.width * 0.5;
  const centerY = world.height * 0.5;

  for (const blob of world.blobs) {
    blob.ax = 0;
    blob.ay = 0;
    if (isGrabbed(world, blob.def)) continue;

    blob.ay += params.gravity;
    blob.ax += (centerX - blob.cx) * params.pull;
    blob.ay += (centerY - blob.cy) * params.pull;
    blob.ax += -(centerY - blob.cy) * params.spin;
    blob.ay += (centerX - blob.cx) * params.spin;
    blob.ax += noise(world.time, blob.def) * params.drift;
    blob.ay += noise(world.time + 8, blob.def + 11) * params.drift;

    for (let otherIndex = 0; otherIndex < BLOB_COUNT; otherIndex++) {
      if (otherIndex === blob.def) continue;
      const other = world.blobs[otherIndex];
      const dx = other.cx - blob.cx;
      const dy = other.cy - blob.cy;
      const distance = Math.hypot(dx, dy);
      if (distance < EPS) continue;
      const nx = dx / distance;
      const ny = dy / distance;
      // Every pair remains active; horizon attenuates instead of hard-cutting.
      const falloff = 1 / (1 + distance / Math.max(1, params.horizon));
      const rule = RULES[ruleIndex(blob.def, otherIndex)];
      const response = pairResponse(rule.kind, blob.def, otherIndex, nx, ny, falloff, blob.vx, blob.vy, other.vx, other.vy, world.time);
      blob.ax += response.x * params.coupling;
      blob.ay += response.y * params.coupling;
      // A universal contact pressure prevents any special relationship from
      // collapsing two bodies into the same centre. The relationship-specific
      // response still controls what happens outside this contact shell.
      const contact = Math.max(0, 1 - distance / 90);
      if (contact > 0) {
        const pressure = contact * contact * params.coupling * 1.8;
        blob.ax -= nx * pressure;
        blob.ay -= ny * pressure;
      }
    }
  }

  for (const blob of world.blobs) {
    for (const particle of blob.particles) {
      const homeX = blob.cx + particle.hx;
      const homeY = blob.cy + particle.hy;
      const dx = homeX - particle.x;
      const dy = homeY - particle.y;
      const distance = Math.hypot(dx, dy);
      const softness = Math.min(1, distance / Math.max(1, params.yield));
      const spring = params.tether * (1 - 0.9 * softness);
      particle.ax = dx * spring;
      particle.ay = dy * spring;
    }
  }

  if (params.halo <= 0 || params.mingle <= 0) return;
  const radius2 = params.halo * params.halo;
  for (let a = 0; a < BLOB_COUNT; a++) for (let b = a + 1; b < BLOB_COUNT; b++) {
    const kind = RULES[ruleIndex(a, b)].kind;
    const first = world.blobs[a].particles;
    const second = world.blobs[b].particles;
    for (const p of first) for (const q of second) {
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= EPS || d2 >= radius2) continue;
      const d = Math.sqrt(d2);
      const falloff = 1 / (1 + d / Math.max(1, params.halo));
      const nx = dx / d;
      const ny = dy / d;
      const response = pairResponse(kind, a, b, nx, ny, falloff, p.vx, p.vy, q.vx, q.vy, world.time);
      const fx = response.x * params.mingle;
      const fy = response.y * params.mingle;
      p.ax += fx; p.ay += fy;
      q.ax -= fx; q.ay -= fy;
    }
  }
}

function moveDragged(world: World) {
  for (const pointer of world.pointers.values()) {
    const blob = world.blobs[pointer.blob];
    const targetX = pointer.x - pointer.ox;
    const targetY = pointer.y - pointer.oy;
    const dx = targetX - blob.cx;
    const dy = targetY - blob.cy;
    blob.cx += dx; blob.cy += dy;
    blob.vx = 0; blob.vy = 0; blob.ax = 0; blob.ay = 0;
    for (const p of blob.particles) {
      p.x += dx; p.y += dy;
      p.vx = 0; p.vy = 0; p.ax = 0; p.ay = 0;
    }
  }
}

function integrate(world: World, params: Params) {
  const damping = Math.max(0, 1 - params.drag * DT);
  for (const blob of world.blobs) {
    if (isGrabbed(world, blob.def)) continue;
    blob.vx += blob.ax * DT;
    blob.vy += blob.ay * DT;
    blob.ax = 0; blob.ay = 0;
    limit(blob, params.cap);
    const moveX = blob.vx;
    const moveY = blob.vy;
    blob.cx += moveX * DT;
    blob.cy += moveY * DT;
    blob.vx *= damping; blob.vy *= damping;

    for (const p of blob.particles) {
      p.vx += p.ax * DT;
      p.vy += p.ay * DT;
      p.ax = 0; p.ay = 0;
      limit(p, params.cap);
      p.x += (moveX + p.vx) * DT;
      p.y += (moveY + p.vy) * DT;
      p.vx *= damping; p.vy *= damping;
    }
  }
}

function limit(body: { vx: number; vy: number }, cap: number) {
  const speed2 = body.vx * body.vx + body.vy * body.vy;
  if (speed2 <= cap * cap) return;
  const scale = cap / Math.sqrt(speed2);
  body.vx *= scale;
  body.vy *= scale;
}

function solveContacts(world: World, params: Params) {
  const minDistance = params.clearance;
  const minDistance2 = minDistance * minDistance;
  const strength = params.pack * 0.5;
  const resolve = (p: Particle, q: Particle) => {
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const d2 = dx * dx + dy * dy;
    if (d2 >= minDistance2 || d2 <= EPS) return;
    const d = Math.sqrt(d2);
    const amount = ((minDistance - d) / d) * strength;
    const moveX = dx * amount;
    const moveY = dy * amount;
    p.x -= moveX; p.y -= moveY;
    q.x += moveX; q.y += moveY;
  };
  for (const blob of world.blobs) {
    for (let i = 0; i < blob.particles.length; i++) {
      for (let j = i + 1; j < blob.particles.length; j++) resolve(blob.particles[i], blob.particles[j]);
    }
  }
  for (let a = 0; a < BLOB_COUNT; a++) for (let b = a + 1; b < BLOB_COUNT; b++) {
    for (const p of world.blobs[a].particles) for (const q of world.blobs[b].particles) resolve(p, q);
  }
}

function resolveBounds(world: World, params: Params) {
  const particlePad = params.dot + EDGE_PAD;
  for (const blob of world.blobs) {
    if (blob.cx < EDGE_PAD) { blob.cx = EDGE_PAD; if (blob.vx < 0) blob.vx = -blob.vx; }
    if (blob.cx > world.width - EDGE_PAD) { blob.cx = world.width - EDGE_PAD; if (blob.vx > 0) blob.vx = -blob.vx; }
    if (blob.cy < EDGE_PAD) { blob.cy = EDGE_PAD; if (blob.vy < 0) blob.vy = -blob.vy; }
    if (blob.cy > world.height - EDGE_PAD) { blob.cy = world.height - EDGE_PAD; if (blob.vy > 0) blob.vy = -blob.vy; }
    for (const p of blob.particles) {
      p.x = Math.max(particlePad, Math.min(world.width - particlePad, p.x));
      p.y = Math.max(particlePad, Math.min(world.height - particlePad, p.y));
    }
  }
}

function isGrabbed(world: World, blobIndex: number) {
  for (const pointer of world.pointers.values()) if (pointer.blob === blobIndex) return true;
  return false;
}

export function hitTest(world: World, x: number, y: number) {
  let best = -1;
  let distance = Infinity;
  for (let i = 0; i < BLOB_COUNT; i++) {
    const d = Math.hypot(world.blobs[i].cx - x, world.blobs[i].cy - y);
    if (d < 46 && d < distance) { distance = d; best = i; }
  }
  return best;
}

export function release(world: World, pointerId: number) {
  world.pointers.delete(pointerId);
}
