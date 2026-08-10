import * as THREE from "three";
import { terrainHeight } from "./terrain";
import { CFG } from "../../experience-config";

// First-person camera that rides just above the bumpy terrain, looking down at
// the grass field around it. It eases up/down so it never embeds in the ground
// or floats high above.
export class FlyCamera {
  camera: THREE.PerspectiveCamera;
  worldX = 0;
  worldZ = 0;
  yaw = 0;
  pitch = -0.25;          // look slightly down at the grass
  eyeHeight = 5;        // eye just above the turf line
  speed = 5;
  speedMul = 1;           // wheel/pinch zoom multiplier (dev-step friendly)
  lookAhead = 14;
  private smoothY = 2;
  private lastDt = 1 / 60;
  private first = true;

  constructor(aspect = 1) {
    // near plane small enough to see grass right under the camera; far plane big
    // enough to never clip the sky dome (radius 900) that surrounds the view.
    this.camera = new THREE.PerspectiveCamera(CFG.camera.fov, aspect, 0.05, 3000);
    this.pitch = CFG.camera.pitch;
    this.eyeHeight = CFG.camera.eyeHeight;
    this.speed = CFG.camera.speed;
    this.lookAhead = CFG.camera.lookAhead;
  }

  update(dt: number) {
    this.lastDt = dt;
    // Keep pointer-controlled pitch; CFG.camera.pitch is the base pitch that
    // the terrain-follow calculation uses below.
    this.eyeHeight = CFG.camera.eyeHeight;
    this.lookAhead = CFG.camera.lookAhead;
    this.speed = CFG.camera.speed * this.speedMul;
    this.worldX += Math.sin(this.yaw) * this.speed * dt;
    this.worldZ += Math.cos(this.yaw) * this.speed * dt;
  }

  apply(ox: number, oz: number) {
    const c = CFG.camera;
    // everything rendered in the LOCAL frame (world - origin) keeps coords small
    // Ride the ground: the terrain height is the source of truth. The camera
    // eases toward ground + eye, clamped so it CANNOT dip below the ground,
    // however big the hills.
    const here = terrainHeight(this.worldX, this.worldZ) + c.eyeHeight;
    if (this.first) { this.smoothY = here; this.first = false; }
    const k = 1 - Math.exp(-c.lerpK * this.lastDt);
    this.smoothY += (here - this.smoothY) * k;
    if (this.smoothY < here) this.smoothY = here;

    this.camera.position.set(this.worldX - ox, this.smoothY, this.worldZ - oz);
    if (this.camera.fov !== c.fov) { this.camera.fov = c.fov; this.camera.updateProjectionMatrix(); }

    // Look ahead through the same rolling ground, with the pitch auto-adapted
    // to the slope ahead: cresting hills tilts the view up, so the camera
    // never feels buried inside the hillside.
    const aheadX = this.worldX + Math.sin(this.yaw) * c.lookAhead;
    const aheadZ = this.worldZ + Math.cos(this.yaw) * c.lookAhead;
    const aheadH = terrainHeight(aheadX, aheadZ);
    // Pitch is an angle in radians. The old code added it directly to the
    // target height as metres, which made shallow/high cameras point almost
    // horizontally and invalidated the viewport tile footprint.
    const terrainSlopeAngle = Math.atan2(aheadH - (here - c.eyeHeight), Math.max(1, c.lookAhead));
    const basePitch = c.pitch + (this.pitch - c.pitch) * 0.35;
    const effectivePitch = basePitch + terrainSlopeAngle * c.terrainFollow;
    const targetDistance = Math.max(1, c.lookAhead);
    const targetY = this.camera.position.y + Math.tan(effectivePitch) * targetDistance;
    this.camera.lookAt(aheadX - ox, targetY, aheadZ - oz);
  }
}
