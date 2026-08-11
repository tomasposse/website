import { ENTITIES } from './config';
import { getInteractionRule } from './interaction-rules';
import type { Simulation } from './types';

const EPSILON = 1e-6;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/**
 * Applies all 12 directed cross-colour fields to actual world-space particles.
 * The reverse relationship is evaluated separately, so A -> B and B -> A can
 * behave differently without hidden global interaction parameters.
 */
export function applyEntityInteractions(sim: Simulation) {
  for (let actorIndex = 0; actorIndex < sim.entities.length; actorIndex++) {
    const actor = sim.entities[actorIndex];
    if (isDragged(sim, actor.id)) continue;

    for (let targetIndex = 0; targetIndex < sim.entities.length; targetIndex++) {
      if (actorIndex === targetIndex) continue;
      applyDirectedField(sim, actor, sim.entities[targetIndex], actorIndex, targetIndex);
    }
  }
}

function applyDirectedField(sim: Simulation, actor: Simulation['entities'][number], target: Simulation['entities'][number], actorIndex: number, targetIndex: number) {
  const rule = getInteractionRule(sim.interactionRules, actorIndex, targetIndex);
  const sensing = Math.max(rule.preferredDistance, rule.sensingDistance);
  const actorParticleCount = Math.max(1, actor.particles.length);

  for (const particle of actor.particles) {
    let targetParticle = target.particles[0];
    let targetX = targetParticle.x;
    let targetY = targetParticle.y;
    let distance = Infinity;

    for (const candidate of target.particles) {
      const candidateX = candidate.x;
      const candidateY = candidate.y;
      const candidateDistance = Math.hypot(candidateX - particle.x, candidateY - particle.y);
      if (candidateDistance < distance) {
        distance = candidateDistance;
        targetParticle = candidate;
        targetX = candidateX;
        targetY = candidateY;
      }
    }

    if (distance <= EPSILON || distance > sensing) continue;
    const nx = (targetX - particle.x) / distance;
    const ny = (targetY - particle.y) / distance;
    const tx = -ny;
    const ty = nx;
    const error = (distance - rule.preferredDistance) / Math.max(1, rule.preferredDistance);
    const radialCoefficient = error >= 0 ? rule.attraction : rule.repulsion;
    const radial = clamp(error * radialCoefficient * 1.5, -500, 500);
    const particleVx = actor.vx + particle.vx;
    const particleVy = actor.vy + particle.vy;
    const targetVx = target.vx + targetParticle.vx;
    const targetVy = target.vy + targetParticle.vy;
    const relativeVx = targetVx - particleVx;
    const relativeVy = targetVy - particleVy;
    const radialVelocity = relativeVx * nx + relativeVy * ny;
    const tangentVelocity = relativeVx * tx + relativeVy * ty;
    const braking = radialVelocity * rule.braking * 0.15;
    const matchingX = relativeVx * rule.velocityMatch * 0.12;
    const matchingY = relativeVy * rule.velocityMatch * 0.12;
    const sideways = tangentVelocity * rule.sideways * 0.12;
    const falloff = 0.25 + 0.75 * Math.pow(clamp(1 - distance / sensing, 0, 1), 0.7);
    const scale = ENTITIES[actorIndex].response * rule.strength * falloff;
    const forceX = clamp((nx * (radial - braking) + matchingX + tx * sideways) * scale, -900, 900);
    const forceY = clamp((ny * (radial - braking) + matchingY + ty * sideways) * scale, -900, 900);

    // Deformation is local. The remainder moves the actor body, so fields are
    // visible even when cohesion is low and do not collapse every particle.
    particle.ax += forceX * rule.deformation;
    particle.ay += forceY * rule.deformation;
    actor.ax += forceX * (1 - rule.deformation) / actorParticleCount;
    actor.ay += forceY * (1 - rule.deformation) / actorParticleCount;

    // A small deterministic particle-group bias gives selected colour pairs
    // distinct local behaviour without introducing animation or bounce.
    const groupBias = ((actorIndex * 7 + targetIndex * 13 + particleIndex(particle, actor)) % 3) - 1;
    const lateral = groupBias * rule.sideways * scale * 0.08;
    particle.ax += tx * lateral;
    particle.ay += ty * lateral;
  }
}

function particleIndex(particle: Simulation['entities'][number]['particles'][number], entity: Simulation['entities'][number]) {
  return entity.particles.indexOf(particle);
}

function isDragged(sim: Simulation, entityId: number) {
  for (const state of sim.dragState.values()) if (state.entityId === entityId) return true;
  return false;
}
