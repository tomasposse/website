// Mutable runtime parameters for the aurora-bloom experience.
// The dev panel (bottom-left) edits these live via sliders and copies them to
// text. The runtime reads from this object each frame.

export type AuroraParams = {
  density: number;    // particles per area (higher = more particles)
  flow: number;       // base flowing drift strength
  swirl: number;      // swirl strength around centre
  swirlGrowth: number;// swirl grows with radius
  wellMass: number;   // gravity well strength
  wellOrbit: number;  // gravity well orbit strength
  wellSpin: number;   // spin multiplier
  pointerForce: number;// repulsion when pointer held down
  damping: number;    // velocity damping per frame
  connectDist: number;// max distance for line connections (px)
  lineAlpha: number;  // line opacity
  lineWidth: number;
  sizeMin: number;    // particle size range
  sizeMax: number;
  hueBase: number;    // hue range
  hueRange: number;
  glow: number;       // particle glow opacity
};

export const DEFAULT_AURORA_PARAMS: AuroraParams = {
  density: 3300,
  flow: 0.00018,
  swirl: 0.00022,
  swirlGrowth: 0.00072,
  wellMass: 1.7,
  wellOrbit: 0.0018,
  wellSpin: 8,
  pointerForce: 0.002,
  damping: 0.91,
  connectDist: 72,
  lineAlpha: 0.1,
  lineWidth: 0.45,
  sizeMin: 0.45,
  sizeMax: 2.15,
  hueBase: 175,
  hueRange: 95,
  glow: 0.65,
};

export function auroraParamsToText(p: AuroraParams): string {
  const lines: string[] = [];
  for (const k of Object.keys(p) as (keyof AuroraParams)[]) {
    lines.push(`${k}=${p[k]}`);
  }
  return lines.join('\n');
}