// Runtime coefficients for the phase-coupled identical-body system.
// These are defined after the physics and entity model; they are not the model.
export type Params = {
  count: number;
  dot: number;
  gravity: number;
  pull: number;
  spin: number;
  drift: number;
  cap: number;
  drag: number;
  coupling: number;
  horizon: number;
  tether: number;
  yield: number;
  pack: number;
  clearance: number;
  halo: number;
  mingle: number;
};

export const DEFAULT_PARAMS: Params = {
  count: 180,
  dot: 1,
  gravity: 250,
  pull: 2.75,
  spin: 0.95,
  drift: 31,
  cap: 1100,
  drag: 4.3,
  coupling: 100,
  horizon: 370,
  tether: 27.5,
  yield: 70,
  pack: 0.7,
  clearance: 8,
  halo: 172,
  mingle: 54,
};

export function paramsToText(params: Params) {
  return (Object.keys(params) as (keyof Params)[])
    .map(key => `${key}=${params[key]}`)
    .join('\n');
}
