export type SimulationParams = {
  entitiesCount: number;
  dotRadius: number;
  tileSize: number;
  gravity: number;
  centerPull: number;
  centerSpin: number;
  noise: number;
  particleNoise: number;
  maxSpeed: number;
  damping: number;
  cohesion: number;
  particleCollision: number;
  entityCollision: number;
};

export const DEFAULT_PARAMS: SimulationParams = {
  entitiesCount: 13,
  dotRadius: 21,
  tileSize: 1,
  gravity: 30,
  centerPull: 2,
  centerSpin: 1.1,
  noise: 200,
  particleNoise: 200,
  maxSpeed: 430,
  damping: 12.8,
  cohesion: 4,
  particleCollision: 2000,
  entityCollision: 2000,
};
