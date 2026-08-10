import { CFG } from "../../experience-config";

// Single source of truth for the streamed terrain layout.
export function worldTileSize() {
  return Math.max(1, Math.round(CFG.world.tileSize));
}

export function activeTileCount() {
  return Math.max(1, Math.round(CFG.world.activeTiles));
}
