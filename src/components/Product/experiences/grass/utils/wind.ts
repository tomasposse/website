import * as THREE from "three";
import { CFG } from "../../experience-config";

// One shared wind field drives grass, trees and clouds so everything sways in
// the same gusting direction.
export class WindSystem {
  uniforms = {
    uTime: { value: 0 },
    uWindDir: { value: new THREE.Vector2(0.82, 0.57) },
    uWindStrength: { value: 1.0 },
    uOrigin: { value: new THREE.Vector3() },
  };

  update(t: number, originX: number, originZ: number) {
    const g = CFG.grass;
    this.uniforms.uTime.value = t * g.windSpeed;
    const a = 0.55 + Math.sin(t * 0.037 * g.windSpeed) * 0.35;
    this.uniforms.uWindDir.value.set(Math.cos(a), Math.sin(a));
    this.uniforms.uWindStrength.value = (0.9 + 0.5 * Math.sin(t * 0.18) * Math.sin(t * 0.052)) * g.windStrength;
    this.uniforms.uOrigin.value.set(originX, 0, originZ);
  }
}

export const WIND_GLSL = /* glsl */ `
uniform float uTime;
uniform vec2 uWindDir;
uniform float uWindStrength;
uniform vec3 uOrigin;

float windHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float windNoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(windHash(i), windHash(i + vec2(1,0)), u.x),
             mix(windHash(i + vec2(0,1)), windHash(i + vec2(1,1)), u.x), u.y);
}

float windWave(vec2 worldXZ, float phase){
  float k = dot(worldXZ, uWindDir);
  float w1 = sin(uTime * 1.35 + k * 0.16 + phase);
  float w2 = sin(uTime * 0.62 + k * 0.055 + phase * 0.7);
  float gust = 0.55 + 0.75 * windNoise(worldXZ * 0.018 + uWindDir * uTime * 0.06);
  return (0.72 * w1 + 0.4 * w2) * gust * uWindStrength;
}
`;
