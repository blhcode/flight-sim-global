import * as THREE from 'three';
import type { AircraftDefinition } from '../aircraft/types.ts';

export type CameraMode = 'cockpit' | 'gear' | 'outside';

const _box = new THREE.Box3();
const _center = new THREE.Vector3();

export class CameraRig {
  mode: CameraMode = 'outside';
  private readonly camera: THREE.PerspectiveCamera;
  private readonly definition: AircraftDefinition;
  private readonly smoothPos = new THREE.Vector3();
  private snapNext = true;

  constructor(camera: THREE.PerspectiveCamera, definition: AircraftDefinition) {
    this.camera = camera;
    this.definition = definition;
  }

  snapCamera(): void {
    this.snapNext = true;
  }

  cycleMode(): CameraMode {
    const order: CameraMode[] = ['cockpit', 'gear', 'outside'];
    const idx = order.indexOf(this.mode);
    this.mode = order[(idx + 1) % order.length];
    this.snapNext = true;
    return this.mode;
  }

  update(aircraftRoot: THREE.Object3D, visualModel: THREE.Object3D): void {
    visualModel.updateMatrixWorld(true);
    aircraftRoot.updateMatrixWorld(true);

    const mounts = this.definition.cameraMounts;
    const toWorld = (local: THREE.Vector3) =>
      local.clone().applyMatrix4(visualModel.matrixWorld);

    if (this.mode === 'cockpit') {
      this.camera.near = 0.1;
      this.camera.far = 50_000;
      this.camera.fov = 75;
      this.camera.updateProjectionMatrix();
      this.camera.position.copy(toWorld(mounts.cockpit));
      this.camera.lookAt(toWorld(mounts.cockpitLook));
      return;
    }

    if (this.mode === 'gear') {
      this.camera.near = 0.1;
      this.camera.far = 50_000;
      this.camera.fov = 85;
      this.camera.updateProjectionMatrix();
      this.camera.position.copy(toWorld(mounts.gear));
      this.camera.lookAt(toWorld(mounts.gearLook));
      return;
    }

    // Outside — chase cam behind aircraft, whole plane in frame
    this.camera.near = 0.5;
    this.camera.far = 50_000;
    this.camera.fov = 50;
    this.camera.updateProjectionMatrix();

    _box.setFromObject(visualModel);
    _box.getCenter(_center);
    const size = _box.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.y, size.z, 8);

    const fovRad = THREE.MathUtils.degToRad(this.camera.fov);
    const dist = (span / Math.tan(fovRad / 2)) * 1.05;

    // Behind + above in aircraft root space (nose = −Z)
    const offset = new THREE.Vector3(0, span * 0.35, dist);
    offset.applyQuaternion(aircraftRoot.quaternion);
    const desired = _center.clone().add(offset);

    if (this.snapNext) {
      this.smoothPos.copy(desired);
      this.snapNext = false;
    } else {
      this.smoothPos.lerp(desired, 0.14);
    }

    this.camera.position.copy(this.smoothPos);
    this.camera.lookAt(_center);
  }
}
