// All velocities are in px/s, all accelerations in px/s², positions in px.
// Every force is accumulated into the ax/ay field and then applied by the
// integrator as v += a*dt (semi-implicit Euler).
export type Particle = {
  x: number;
  y: number;
  vx: number;   // px/s
  vy: number;
  ax: number;   // accumulated acceleration this frame (px/s²)
  ay: number;
  // home position relative to the blob centre (the organic rest shape)
  hx: number;
  hy: number;
};

export type Blob = {
  def: number;
  color: string;
  particles: Particle[];
  // blob centre + velocity (shared motion from interaction forces)
  cx: number;
  cy: number;
  vx: number;   // px/s
  vy: number;
  ax: number;   // accumulated acceleration this frame (px/s²)
  ay: number;
};

export type World = {
  width: number;
  height: number;
  time: number;
  blobs: Blob[];
  pointers: Map<number, Pointer>;
};

export type Pointer = {
  id: number;
  x: number;
  y: number;
  blob: number;
  ox: number;
  oy: number;
};