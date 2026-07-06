import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

export class Atmosphere {
  readonly sky: Sky;
  private readonly sun = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.sky = new Sky();
    this.sky.scale.setScalar(450_000);
    this.sky.renderOrder = -2;
    this.sky.material.depthWrite = false;
    scene.add(this.sky);

    const uniforms = this.sky.material.uniforms;
    uniforms['turbidity'].value = 4;
    uniforms['rayleigh'].value = 1.2;
    uniforms['mieCoefficient'].value = 0.004;
    uniforms['mieDirectionalG'].value = 0.85;

    this.setTimeOfDay(14);
  }

  setTimeOfDay(hour: number): void {
    const phi = THREE.MathUtils.degToRad(90 - (hour / 24) * 180 + 30);
    const theta = THREE.MathUtils.degToRad(180);
    this.sun.setFromSphericalCoords(1, phi, theta);
    this.sky.material.uniforms['sunPosition'].value.copy(this.sun);
  }

  applyFog(scene: THREE.Scene, enabled: boolean): void {
    if (enabled) {
      scene.fog = new THREE.FogExp2(0xb8cce8, 0.000002);
    } else {
      scene.fog = null;
    }
  }

  syncSunLight(light: THREE.DirectionalLight): void {
    light.position.copy(this.sun).multiplyScalar(200_000);
  }
}
