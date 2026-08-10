import * as THREE from "three";

export type ViewTile = { ti: number; tj: number; key: string };
type Point = { x: number; z: number };
type Candidate = ViewTile & { distance: number; along: number; across: number };

export type ViewportDebug = {
  camX: number; camZ: number; forwardX: number; forwardZ: number;
  leftX: number; leftZ: number; rightX: number; rightZ: number;
  tileSize: number; tiles: ViewTile[];
};

const EPSILON = 1e-7;
const key = (ti: number, tj: number) => `${ti},${tj}`;

function tileCenter(ti: number, tj: number, size: number): Point {
  return { x: (ti + 0.5) * size, z: (tj + 0.5) * size };
}

function cross(a: Point, b: Point, c: Point) {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
}

/** Return the convex hull in the X/Z plane. */
function convexHull(points: Point[]) {
  const sorted = points.slice().sort((a, b) => a.x - b.x || a.z - b.z);
  if (sorted.length <= 2) return sorted;

  const lower: Point[] = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
      lower.pop();
    }
    lower.push(point);
  }

  const upper: Point[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const point = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
      upper.pop();
    }
    upper.push(point);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/**
 * SAT intersection between a convex viewport polygon and a terrain tile.
 * A tile is considered visible when it touches the viewport boundary. That
 * avoids one-pixel cracks when the camera is exactly over a tile edge.
 */
function tileIntersects(polygon: Point[], ti: number, tj: number, size: number) {
  const square: Point[] = [
    { x: ti * size, z: tj * size },
    { x: (ti + 1) * size, z: tj * size },
    { x: (ti + 1) * size, z: (tj + 1) * size },
    { x: ti * size, z: (tj + 1) * size },
  ];

  const axes: Point[] = [{ x: 1, z: 0 }, { x: 0, z: 1 }];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    axes.push({ x: -(b.z - a.z), z: b.x - a.x });
  }

  for (const axis of axes) {
    let polygonMin = Infinity;
    let polygonMax = -Infinity;
    let squareMin = Infinity;
    let squareMax = -Infinity;

    for (const point of polygon) {
      const projection = point.x * axis.x + point.z * axis.z;
      polygonMin = Math.min(polygonMin, projection);
      polygonMax = Math.max(polygonMax, projection);
    }
    for (const point of square) {
      const projection = point.x * axis.x + point.z * axis.z;
      squareMin = Math.min(squareMin, projection);
      squareMax = Math.max(squareMax, projection);
    }

    if (polygonMax < squareMin - EPSILON || squareMax < polygonMin - EPSILON) {
      return false;
    }
  }
  return true;
}

function rayFromScreen(camera: THREE.PerspectiveCamera, sx: number, sy: number) {
  const near = new THREE.Vector3(sx, sy, -1).unproject(camera);
  const far = new THREE.Vector3(sx, sy, 1).unproject(camera);
  return far.sub(near).normalize();
}

function distanceToTile(x: number, z: number, ti: number, tj: number, size: number) {
  const minX = ti * size;
  const maxX = minX + size;
  const minZ = tj * size;
  const maxZ = minZ + size;
  const dx = x < minX ? minX - x : x > maxX ? x - maxX : 0;
  const dz = z < minZ ? minZ - z : z > maxZ ? z - maxZ : 0;
  return dx * dx + dz * dz;
}

function horizontalDirection(camera: THREE.PerspectiveCamera) {
  const direction = camera.getWorldDirection(new THREE.Vector3());
  const length = Math.hypot(direction.x, direction.z);
  if (length < EPSILON) return { x: 0, z: 1 };
  return { x: direction.x / length, z: direction.z / length };
}

/**
 * Build the finite part of the camera's viewport that meets the ground.
 *
 * The old selector grew a connected tile cluster after finding visible tiles.
 * That was the source of the bug: once the visible cluster ended, it happily
 * appended tiles outside the viewport. This function instead computes the
 * footprint once, filters tiles against it, and only ranks that filtered set.
 */
export function selectViewportTiles(
  camera: THREE.PerspectiveCamera,
  camX: number,
  camZ: number,
  groundY: number,
  tileSize: number,
  budget: number,
  debug?: ViewportDebug,
): ViewTile[] {
  const size = Math.max(1, tileSize);
  const count = Math.max(1, Math.floor(budget));
  camera.updateMatrixWorld(true);
  const origin = camera.position;
  const forward = horizontalDirection(camera);
  const right = { x: forward.z, z: -forward.x };
  const halfFov = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * camera.aspect);
  const leftRay = {
    x: Math.sin(Math.atan2(forward.x, forward.z) - halfFov),
    z: Math.cos(Math.atan2(forward.x, forward.z) - halfFov),
  };
  const rightRay = {
    x: Math.sin(Math.atan2(forward.x, forward.z) + halfFov),
    z: Math.cos(Math.atan2(forward.x, forward.z) + halfFov),
  };

  const groundOrigin: Point = { x: camX, z: camZ };
  // Include the camera point explicitly. The near clip plane can put the
  // mathematical corner intersections beyond the tile containing the camera,
  // even though terrain immediately below the camera is part of the view.
  const footprint: Point[] = [groundOrigin];

  for (const sy of [-1, 1]) {
    for (const sx of [-1, 1]) {
      const ray = rayFromScreen(camera, sx, sy);
      if (ray.y >= -EPSILON) continue;
      const distance = (groundY - origin.y) / ray.y;
      if (!Number.isFinite(distance) || distance <= 0) continue;
      footprint.push({ x: camX + ray.x * distance, z: camZ + ray.z * distance });
    }
  }

  // Looking above the horizon leaves no finite ground intersection. This
  // conservative fallback still gives the pool a useful near wedge, but does
  // not invent an arbitrarily distant row of tiles.
  if (footprint.length < 3) {
    const depth = Math.max(size * 2, count * size);
    footprint.push(
      { x: camX + leftRay.x * depth, z: camZ + leftRay.z * depth },
      { x: camX + rightRay.x * depth, z: camZ + rightRay.z * depth },
    );
  }

  const base = convexHull(footprint);

  // The tile budget is an allocation contract: when it is 4, four tiles must
  // be selected. A camera looking toward the horizon has only a small finite
  // ground intersection (the upper rays point into the sky), so the exact
  // intersection alone can contain fewer than the requested tiles. Extend the
  // *viewport wedge* just far enough to satisfy the budget. This is not a
  // connected-neighbour fill: every fallback tile still has to intersect the
  // camera-facing wedge and is ranked by distance to the camera.
  const coverageDepth = Math.max(size * 4, (count + 2) * size * 2);
  const coverage = [
    groundOrigin,
    { x: camX + leftRay.x * coverageDepth, z: camZ + leftRay.z * coverageDepth },
    { x: camX + rightRay.x * coverageDepth, z: camZ + rightRay.z * coverageDepth },
    ...base,
  ];
  const polygon = convexHull(coverage);

  if (debug) {
    debug.camX = camX;
    debug.camZ = camZ;
    debug.forwardX = forward.x;
    debug.forwardZ = forward.z;
    debug.leftX = leftRay.x;
    debug.leftZ = leftRay.z;
    debug.rightX = rightRay.x;
    debug.rightZ = rightRay.z;
    debug.tileSize = size;
  }

  const minX = Math.min(...polygon.map(point => point.x));
  const maxX = Math.max(...polygon.map(point => point.x));
  const minZ = Math.min(...polygon.map(point => point.z));
  const maxZ = Math.max(...polygon.map(point => point.z));
  const firstX = Math.floor(minX / size);
  const lastX = Math.floor(maxX / size);
  const firstZ = Math.floor(minZ / size);
  const lastZ = Math.floor(maxZ / size);
  const candidates: Candidate[] = [];

  for (let ti = firstX; ti <= lastX; ti++) {
    for (let tj = firstZ; tj <= lastZ; tj++) {
      if (!tileIntersects(polygon, ti, tj, size)) continue;
      const center = tileCenter(ti, tj, size);
      const dx = center.x - camX;
      const dz = center.z - camZ;
      candidates.push({
        ti,
        tj,
        key: key(ti, tj),
        // Distance to the tile, rather than its center, makes the tile under
        // the camera rank first and behaves correctly on tile boundaries.
        distance: distanceToTile(camX, camZ, ti, tj, size),
        along: dx * forward.x + dz * forward.z,
        across: Math.abs(dx * right.x + dz * right.z),
      });
    }
  }

  candidates.sort((a, b) =>
    a.distance - b.distance ||
    a.along - b.along ||
    a.across - b.across ||
    a.ti - b.ti ||
    a.tj - b.tj,
  );

  // The coverage wedge is deliberately sized to provide enough candidates.
  // The budget is an allocation contract: if it is 4, return 4 tiles, with
  // the nearest candidates winning. Never append an arbitrary neighbour just
  // to fill the pool, because that puts terrain outside the camera-facing
  // coverage region.
  const result = candidates.slice(0, count).map(({ ti, tj, key: tileKey }) => ({ ti, tj, key: tileKey }));
  if (debug) debug.tiles = result;
  return result;
}
