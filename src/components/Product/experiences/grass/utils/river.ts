import { valueNoiseP } from "./noise";
import { CFG } from "../../experience-config";
import { worldTileSize } from "./layout";

// Unified water field. Rivers and ponds are the same feature: an isocontour of
// one deterministic tiled scalar field. Open contours read as rivers; closed
// contours read as ponds. There is no separate main-river generator.

function hashSeed(seed: number, n: number) {
  return Math.sin(seed * (12.9898 + n * 78.233)) * 43758.5453;
}
function fract(v: number) { return v - Math.floor(v); }
export class WaterField {
  private signature = "";
  private seedX = 0;
  private seedZ = 0;

  private refresh() {
    const r = CFG.river;
    const signature = [
      CFG.world.tileSize,
      r.enabled,
      r.occurrence,
      r.featureScaleTiles,
      r.warpTiles,
      r.fieldLevel,
      r.seed,
    ].join(":");
    if (signature === this.signature) return;
    this.signature = signature;
    this.seedX = fract(hashSeed(r.seed, 1)) * 1000;
    this.seedZ = fract(hashSeed(r.seed, 2)) * 1000;
  }

  private scalar(x: number, z: number) {
    const r = CFG.river;
    const tile = worldTileSize();
    const scale = Math.max(tile, tile * r.featureScaleTiles);
    const warp = scale * r.warpTiles;
    const sx = this.seedX * 0.01;
    const sz = this.seedZ * 0.01;
    const qx = x / scale + sx;
    const qz = z / scale + sz;
    const wx = (valueNoiseP(qx, qz, 97) - 0.5) * (warp / scale);
    const wz = (valueNoiseP(qx + 19.7, qz - 11.3, 97) - 0.5) * (warp / scale);
    return valueNoiseP(qx + wx, qz + wz, 113);
  }

  distance(x: number, z: number) {
    this.refresh();
    const r = CFG.river;
    if (!r.enabled || r.occurrence <= 0) return Infinity;
    const tile = worldTileSize();
    const scale = Math.max(tile, tile * r.featureScaleTiles);
    // occurrence controls how much contour width is present without creating
    // a second feature generator. At 1 the contour is fully available.
    const contourDistance = Math.abs(this.scalar(x, z) - r.fieldLevel);
    return contourDistance * scale / Math.max(0.05, r.occurrence);
  }

  ensureForCamera(_x: number, _z: number) { this.refresh(); }
  ensureTile(_tx: number, _tz: number) { this.refresh(); }
  distanceInTile(x: number, z: number, _tx: number, _tz: number) { return this.distance(x, z); }
}

export const riverPath = new WaterField();