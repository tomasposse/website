import { fbm } from "./noise";
import { CFG } from "../../experience-config";

// Shared pre-river meadow height. Terrain, river drainage and the camera all
// use this same field, so there is one source of truth for elevation.
//
// The raw field is a bounded sum of one-sided noise layers. A small normalized
// lowland band is reserved for the waterline and clamped to exactly 0. This
// matters because fbm's mathematical minimum is rarely sampled by the finite
// viewport; relying on that theoretical minimum made the visible terrain float
// above zero forever. The upper bound remains the sum of the configured amps.
const LOWLAND_FRACTION = 0.08;

export function meadowHeight(x: number, z: number) {
  const t = CFG.terrain;
  const total = t.rolling + t.hillSize + t.hillDetail + t.smallBumps + t.fineBumps;
  if (total <= 0) return 0;

  const raw = t.rolling * fbm(x * 0.0029 + 2, z * 0.0029 - 1, 4) ** 2
    + t.hillSize * fbm(x * 0.0058 + 7, z * 0.0058 + 3, 3) ** 2
    + t.hillDetail * fbm(x * 0.011 + 11, z * 0.011 - 4, 3) ** 2
    + t.smallBumps * fbm(x * 0.02 + 5, z * 0.02 + 8, 2) ** 2
    + t.fineBumps * fbm(x * 0.045 + 3, z * 0.045 - 6, 2) ** 2;

  // Map raw [0,total] to [0,total], with the lowest 8% becoming the actual
  // waterline. This gives real visible zeroes without ever producing dry
  // terrain below water level.
  const floor = total * LOWLAND_FRACTION;
  return Math.max(0, (raw - floor) / (1 - LOWLAND_FRACTION));
}