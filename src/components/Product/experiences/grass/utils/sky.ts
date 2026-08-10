import * as THREE from "three";
import { CFG } from "../../experience-config";

// Dreamy sky: a clean gradient dome (soft periwinkle top -> hazy pale horizon).
// No sun disc — just even, hazed sky light. The dome is huge and centred on the
// camera (the camera's far plane is 3000), so it always surrounds the view and
// its horizon colour matches the fog colour for a seamless melt.
export class Sky {
  mesh: THREE.Mesh;
  horizon = new THREE.Color(0xedf1ea);
  private material: THREE.ShaderMaterial;

  constructor() {
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTop: { value: new THREE.Color(CFG.sky.top) },        // soft periwinkle
        uMid: { value: new THREE.Color(CFG.sky.mid) },        // pale blue
        uHorizon: { value: new THREE.Color(CFG.sky.horizon) }, // hazy warm-cream
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 uTop,uMid,uHorizon;
        varying vec3 vDir;
        void main(){
          float h = vDir.y;
          vec3 sky = mix(uHorizon, uMid, smoothstep(0.0, 0.14, h));
          sky = mix(sky, uTop, smoothstep(0.14, 0.62, max(h, 0.0)));
          // gentle warm haze hugging the horizon line
          sky = mix(sky, uHorizon, pow(1.0 - smoothstep(0.0, 0.055, h + 0.03), 2.0) * 0.55);
          gl_FragColor = vec4(sky, 1.0);
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 20), this.material);
    this.mesh.frustumCulled = false;
  }

  update(_time: number, camera: THREE.Camera) {
    this.material.uniforms.uTop.value.set(CFG.sky.top);
    this.material.uniforms.uMid.value.set(CFG.sky.mid);
    this.material.uniforms.uHorizon.value.set(CFG.sky.horizon);
    this.horizon.set(CFG.sky.horizon);
    this.mesh.position.copy(camera.position);
  }
}