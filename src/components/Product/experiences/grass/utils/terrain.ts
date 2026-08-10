import { CFG } from "../../experience-config";
import { riverPath } from "./river";
import { meadowHeight } from "./terrain-field";

export const RIVER_LEVEL = 0;
export function riverVegetationDistance() {
  return riverHalf() + CFG.river.bankWidth + CFG.river.vegetationMargin;
}

export function riverWidth() { return CFG.river.width; }
export function riverHalf() { return riverWidth() / 2; }
export function riverDistance(x: number, z: number) { return riverPath.distance(x, z); }

export function smoothstep(e0: number, e1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

export function bankFactor(x: number, z: number) {
  const meadow = meadowHeight(x, z);
  const adaptiveBank = CFG.river.bankWidth + meadow * CFG.river.heightSoftness;
  return 1 - smoothstep(
    riverHalf(),
    riverHalf() + adaptiveBank,
    riverDistance(x, z),
  );
}

export function terrainHeight(x: number, z: number) {
  const meadow = meadowHeight(x, z);
  const f = bankFactor(x, z);
  return meadow * (1 - f) + RIVER_LEVEL * f;
}