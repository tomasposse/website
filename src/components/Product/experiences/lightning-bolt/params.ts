// Mutable runtime parameters for the lightning-bolt experience.
// The dev panel (bottom-left) edits these live via sliders and can copy them
// to text. The runtime reads from this object each frame.

export type BoltParams = {
  frequency: number;   // strikes per second (not probability per frame)
  maxOnScreen: number;       // maximum flashes visible at once
  horizontalCenter: number;  // move the strike area left/right in camera space
  distanceFromCamera: number; // move the strike area along the camera's view axis
  horizontalSpread: number;  // left/right size of the strike area
  depthSpread: number;       // near/far variation between individual strikes
  flashShortest: number;  // shortest visible bolt lifetime (seconds)
  flashLongest: number;  // longest visible bolt lifetime (seconds)
  sideBranches: number;     // secondary branch paths per strike
  sparks: number;   // sparks emitted by each strike
  sparkFall: number; // downward spark acceleration
  sparkLaunch: number;   // initial spark velocity multiplier
  cameraRotation: number;  // camera orbit radians per second
  brightness: number;     // renderer tone mapping brightness
  glowAmount: number;
  glowSpread: number;
  glowThreshold: number;
  brightCore: number;     // main line opacity
  middleGlow: number;      // mid line opacity
  outerGlow: number;      // dim line opacity
};

export const DEFAULT_BOLT_PARAMS: BoltParams = {
  // Timing and amount
  frequency: 1.15,
  maxOnScreen: 3,
  flashShortest: 0.19,
  flashLongest: 0.55,
  sideBranches: 4,
  // Strike field
  horizontalCenter: 0,
  distanceFromCamera: 13,
  horizontalSpread: 7,
  depthSpread: 2,
  // Sparks
  sparks: 260,
  sparkFall: 3.6,
  sparkLaunch: 0.75,
  // Camera and image treatment
  cameraRotation: 0.018,
  brightness: 0.7,
  glowAmount: 1.35,
  glowSpread: 0.32,
  glowThreshold: 0.18,
  brightCore: 1,
  middleGlow: 0.48,
  outerGlow: 0.12,
};

export function boltParamsToText(p: BoltParams): string {
  const lines: string[] = [];
  for (const k of Object.keys(p) as (keyof BoltParams)[]) {
    lines.push(`${k}=${p[k]}`);
  }
  return lines.join('\n');
}