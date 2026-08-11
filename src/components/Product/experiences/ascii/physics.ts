import { ENTITIES, EDGE_MARGIN, SOLVER_PASSES, START_POSITIONS, STEP_SECONDS } from './config';
import { createInteractionRules } from './interaction-rules';
import { applyEntityInteractions } from './interactions';
import type { SimulationParams } from './params';
import type { Entity, Particle, Simulation } from './types';

const EPSILON = 1e-6;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function isDragged(sim: Simulation, id: number) {
  for (const drag of sim.dragState.values()) if (drag.entityId === id) return true;
  return false;
}

function makePoints(count: number, radius: number) {
  const spacing = radius * 2;
  const rowHeight = spacing * Math.sqrt(3) * 0.5;
  const limit = Math.ceil(Math.sqrt(count)) + 3;
  const points: Array<{ x: number; y: number; d: number }> = [];
  for (let row = -limit; row <= limit; row++) for (let column = -limit; column <= limit; column++) {
    const x = (column + (Math.abs(row) % 2) * 0.5) * spacing;
    const y = row * rowHeight;
    points.push({ x, y, d: x * x + y * y });
  }
  points.sort((a, b) => a.d - b.d);
  const selected = points.slice(0, count);
  const cx = selected.reduce((sum, point) => sum + point.x, 0) / selected.length;
  const cy = selected.reduce((sum, point) => sum + point.y, 0) / selected.length;
  return selected.map((point) => ({ x: point.x - cx, y: point.y - cy }));
}

function createEntity(id: number, width: number, height: number, params: SimulationParams): Entity {
  const start = START_POSITIONS[id % START_POSITIONS.length];
  const x = width * start.x;
  const y = height * start.y;
  const points = makePoints(Math.max(1, Math.round(params.entitiesCount)), params.dotRadius);
  const particles: Particle[] = points.map((point) => ({
    x: x + point.x,
    y: y + point.y,
    vx: 0,
    vy: 0,
    ax: 0,
    ay: 0,
    homeX: point.x,
    homeY: point.y,
  }));
  return { id, color: ENTITIES[id].color, particles, x, y, vx: 0, vy: 0, ax: 0, ay: 0 };
}

export function createSimulation(width: number, height: number, params: SimulationParams): Simulation {
  return {
    width,
    height,
    time: 0,
    entities: ENTITIES.map((_, id) => createEntity(id, width, height, params)),
    dragState: new Map(),
    interactionRules: createInteractionRules(),
  };
}

export function resizeSimulation(sim: Simulation, width: number, height: number) {
  const sx = width / Math.max(1, sim.width);
  const sy = height / Math.max(1, sim.height);
  for (const entity of sim.entities) {
    entity.x *= sx;
    entity.y *= sy;
    for (const particle of entity.particles) {
      particle.x *= sx;
      particle.y *= sy;
      particle.homeX *= sx;
      particle.homeY *= sy;
    }
  }
  sim.width = width;
  sim.height = height;
}

export function rescaleParticles(sim: Simulation, previousRadius: number, nextRadius: number) {
  const scale = nextRadius / Math.max(EPSILON, previousRadius);
  for (const entity of sim.entities) for (const particle of entity.particles) {
    particle.homeX *= scale;
    particle.homeY *= scale;
    particle.x = entity.x + (particle.x - entity.x) * scale;
    particle.y = entity.y + (particle.y - entity.y) * scale;
  }
}

export function stepSimulation(sim: Simulation, params: SimulationParams) {
  reset(sim);
  applyWorld(sim, params);
  applyEntityInteractions(sim);
  applyParticleForces(sim, params);
  applyCohesion(sim, params);
  integrate(sim, params);
  applyDrag(sim);
  for (let pass = 0; pass < SOLVER_PASSES; pass++) solveContacts(sim, params);
  constrain(sim, params);
  sim.time += STEP_SECONDS;
}

function reset(sim: Simulation) {
  for (const entity of sim.entities) {
    entity.ax = entity.ay = 0;
    for (const particle of entity.particles) particle.ax = particle.ay = 0;
  }
}

function applyWorld(sim: Simulation, params: SimulationParams) {
  const cx = sim.width * 0.5;
  const cy = sim.height * 0.5;
  for (const entity of sim.entities) {
    if (isDragged(sim, entity.id)) continue;
    entity.ay += params.gravity;
    const dx = cx - entity.x;
    const dy = cy - entity.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= EPSILON) continue;
    const nx = dx / distance;
    const ny = dy / distance;
    const tx = -ny;
    const ty = nx;
    const radial = distance * params.centerPull - (entity.vx * nx + entity.vy * ny) * 2;
    entity.ax += nx * radial;
    entity.ay += ny * radial;
    if (params.centerSpin !== 0) {
      const tangentialVelocity = entity.vx * tx + entity.vy * ty;
      const desiredTangentialVelocity = params.centerSpin * Math.min(distance, 240);
      const tangentialAcceleration = (desiredTangentialVelocity - tangentialVelocity) * 4;
      entity.ax += tx * tangentialAcceleration;
      entity.ay += ty * tangentialAcceleration;
    }
    if (params.noise) {
      const fieldX = Math.sin(sim.time * 1.13 + entity.x * 0.008 + entity.y * 0.003);
      const fieldY = Math.cos(sim.time * 0.79 + entity.x * 0.004 - entity.y * 0.007);
      entity.ax += fieldX * params.noise * 8;
      entity.ay += fieldY * params.noise * 8;
    }
    if (params.particleNoise) {
      for (const particle of entity.particles) {
        const phase = particle.homeX * 0.17 + particle.homeY * 0.23 + entity.id * 3.1;
        particle.ax += Math.sin(sim.time * 2.7 + phase) * params.particleNoise;
        particle.ay += Math.cos(sim.time * 2.1 + phase * 1.31) * params.particleNoise;
      }
    }
  }
}

function applyParticleForces(sim: Simulation, params: SimulationParams) {
  const diameter = params.dotRadius * 2;
  for (let a = 0; a < sim.entities.length; a++) for (let b = a; b < sim.entities.length; b++) {
    const same = a === b;
    const first = sim.entities[a];
    const second = sim.entities[b];
    const strength = same ? params.particleCollision : params.entityCollision;
    for (let i = 0; i < first.particles.length; i++) {
      const start = same ? i + 1 : 0;
      for (let j = start; j < second.particles.length; j++) {
        const p = first.particles[i];
        const q = second.particles[j];
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const distance = Math.hypot(dx, dy);
        if (distance <= EPSILON || distance >= diameter) continue;
        const nx = dx / distance;
        const ny = dy / distance;
        const relative = (q.vx - p.vx) * nx + (q.vy - p.vy) * ny;
        const force = (diameter - distance) * strength;
        p.ax -= nx * force; p.ay -= ny * force;
        q.ax += nx * force; q.ay += ny * force;
      }
    }
  }
}

function applyCohesion(sim: Simulation, params: SimulationParams) {
  if (params.cohesion <= 0) return;
  const decay = 1;
  for (const entity of sim.entities) {
    for (const particle of entity.particles) {
      const dx = entity.x + particle.homeX - particle.x;
      const dy = entity.y + particle.homeY - particle.y;
      particle.ax += dx * params.cohesion;
      particle.ay += dy * params.cohesion;
      particle.vx *= decay;
      particle.vy *= decay;
    }
  }
}

function integrate(sim: Simulation, params: SimulationParams) {
  const decay = Math.exp(-params.damping * STEP_SECONDS);
  for (const entity of sim.entities) {
    const dragged = isDragged(sim, entity.id);
    const oldX = entity.x;
    const oldY = entity.y;
    if (!dragged) {
      entity.vx += entity.ax * STEP_SECONDS;
      entity.vy += entity.ay * STEP_SECONDS;
      limit(entity, params.maxSpeed);
      entity.x += entity.vx * STEP_SECONDS;
      entity.y += entity.vy * STEP_SECONDS;
      entity.vx *= decay;
      entity.vy *= decay;
    }
    const bodyDx = entity.x - oldX;
    const bodyDy = entity.y - oldY;
    for (const particle of entity.particles) {
      if (!dragged) { particle.x += bodyDx; particle.y += bodyDy; }
      particle.vx += particle.ax * STEP_SECONDS;
      particle.vy += particle.ay * STEP_SECONDS;
      limit(particle, params.maxSpeed);
      particle.x += particle.vx * STEP_SECONDS;
      particle.y += particle.vy * STEP_SECONDS;
      particle.vx *= decay;
      particle.vy *= decay;
    }
  }
}

function applyDrag(sim: Simulation) {
  for (const drag of sim.dragState.values()) {
    const entity = sim.entities[drag.entityId];
    const dx = drag.x - drag.offsetX - entity.x;
    const dy = drag.y - drag.offsetY - entity.y;
    entity.x += dx;
    entity.y += dy;
    entity.vx = drag.velocityX;
    entity.vy = drag.velocityY;
    for (const particle of entity.particles) { particle.x += dx; particle.y += dy; }
  }
}

function solveContacts(sim: Simulation, params: SimulationParams) {
  const diameter = params.dotRadius * 2;
  for (let pass = 0; pass < SOLVER_PASSES; pass++) {
    for (let a = 0; a < sim.entities.length; a++) for (let b = a; b < sim.entities.length; b++) {
      const same = a === b;
      const first = sim.entities[a];
      const second = sim.entities[b];
      if ((same && params.particleCollision <= 0) || (!same && params.entityCollision <= 0)) continue;
      for (let i = 0; i < first.particles.length; i++) {
        const start = same ? i + 1 : 0;
        for (let j = start; j < second.particles.length; j++) {
          const p = first.particles[i];
          const q = second.particles[j];
          const dx = q.x - p.x;
          const dy = q.y - p.y;
          const distance = Math.hypot(dx, dy);
          if (distance >= diameter) continue;
          const angle = (i * 0.73 + j * 1.17) % (Math.PI * 2);
          const nx = distance > EPSILON ? dx / distance : Math.cos(angle);
          const ny = distance > EPSILON ? dy / distance : Math.sin(angle);
          const correction = diameter - distance;
          const firstLocked = isDragged(sim, first.id);
          const secondLocked = isDragged(sim, second.id);
          if (!firstLocked && !secondLocked) {
            p.x -= nx * correction * 0.5; p.y -= ny * correction * 0.5;
            q.x += nx * correction * 0.5; q.y += ny * correction * 0.5;
          } else if (!firstLocked) {
            p.x -= nx * correction; p.y -= ny * correction;
          } else if (!secondLocked) {
            q.x += nx * correction; q.y += ny * correction;
          }
        }
      }
    }
  }
}

function constrain(sim: Simulation, params: SimulationParams) {
  const padding = params.dotRadius + EDGE_MARGIN;
  for (const entity of sim.entities) for (const particle of entity.particles) {
    if (particle.x < padding) { particle.x = padding; particle.vx = Math.abs(particle.vx) * 0.35; }
    else if (particle.x > sim.width - padding) { particle.x = sim.width - padding; particle.vx = -Math.abs(particle.vx) * 0.35; }
    if (particle.y < padding) { particle.y = padding; particle.vy = Math.abs(particle.vy) * 0.35; }
    else if (particle.y > sim.height - padding) { particle.y = sim.height - padding; particle.vy = -Math.abs(particle.vy) * 0.35; }
  }
}

function limit(body: { vx: number; vy: number }, maxSpeed: number) {
  const speed = Math.hypot(body.vx, body.vy);
  if (speed > maxSpeed && speed > EPSILON) { body.vx *= maxSpeed / speed; body.vy *= maxSpeed / speed; }
}

export function hitTest(sim: Simulation, x: number, y: number, params: SimulationParams) {
  let selected = -1;
  let nearest = Infinity;
  for (const entity of sim.entities) for (const particle of entity.particles) {
    const distance = Math.hypot(particle.x - x, particle.y - y);
    if (distance <= params.dotRadius + 18 && distance < nearest) { selected = entity.id; nearest = distance; }
  }
  return selected;
}

export function releaseDrag(sim: Simulation, pointerId: number) { sim.dragState.delete(pointerId); }
