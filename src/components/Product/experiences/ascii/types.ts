export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ax: number;
  ay: number;
  homeX: number;
  homeY: number;
};

export type Entity = {
  id: number;
  color: string;
  particles: Particle[];
  x: number;
  y: number;
  vx: number;
  vy: number;
  ax: number;
  ay: number;
};

export type DragState = {
  pointerId: number;
  entityId: number;
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
  velocityX: number;
  velocityY: number;
  lastTime: number;
};

export type Simulation = {
  width: number;
  height: number;
  time: number;
  entities: Entity[];
  dragState: Map<number, DragState>;
  interactionRules: import('./interaction-rules').InteractionRule[];
};
