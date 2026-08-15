import * as THREE from 'three';
import type { AircraftDefinition } from '../aircraft/types.ts';

export type CameraMode = 'cockpit' | 'gear' | 'outside';

export interface CameraRigOptions {
  dt: number;
  onGround: boolean;
  speedKts: number;
}

const _box = new THREE.Box3();
const _meshBox = new THREE.Box3();
const _center = new THREE.Vector3();
const _ahead = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _look = new THREE.Vector3();
const _size = new THREE.Vector3();
const _offset = new THREE.Vector3();

function isRotorObject(obj: THREE.Object3D): boolean {
  for (let o: THREE.Object3D | null = obj; o; o = o.parent) {
    const n = o.name;
    if (
      n === 'mainRotor' ||
      n === 'tailRotor' ||
      n === 'Tblades' ||
      n === 'Tdisc' ||
      n === 'Hub' ||
      n === 'Shaft' ||
      n === 'Tailshaft' ||
      n.startsWith('Mblade') ||
      n.startsWith('Fblade') ||
      n.startsWith('Hinge') ||
      n.startsWith('Plink')
    ) {
      return true;
    }
  }
  return false;
}

export class CameraRig {
  mode: CameraMode = 'cockpit';
  private readonly camera: THREE.PerspectiveCamera;
  private readonly definition: AircraftDefinition;
  private readonly smoothPos = new THREE.Vector3();
  private readonly smoothLook = new THREE.Vector3();
  private snapNext = true;
  private lastMode: CameraMode = 'cockpit';

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

  update(
    aircraftRoot: THREE.Object3D,
    visualModel: THREE.Object3D,
    opts: CameraRigOptions,
  ): void {
    visualModel.updateMatrixWorld(true);
    aircraftRoot.updateMatrixWorld(true);

    if (this.mode !== this.lastMode) {
      this.applyProjection(this.mode);
      this.lastMode = this.mode;
    }

    const mounts = this.definition.cameraMounts;
    const toWorld = (local: THREE.Vector3, target: THREE.Vector3) =>
      target.copy(local).applyMatrix4(visualModel.matrixWorld);

    if (this.mode === 'outside') {
      this.updateOutside(aircraftRoot, visualModel, opts.dt);
      return;
    }

    const onGroundSlow = opts.onGround && opts.speedKts < 25;
    const mount = this.mode === 'gear' ? mounts.gear : mounts.cockpit;
    const lookMount = this.mode === 'gear' ? mounts.gearLook : mounts.cockpitLook;

    toWorld(mount, _eye);
    toWorld(lookMount, _look);

    if (onGroundSlow && this.mode === 'cockpit') {
      _ahead.set(0, 0, -1).applyQuaternion(aircraftRoot.quaternion);
      _ahead.y = 0;
      if (_ahead.lengthSq() > 0.001) {
        _ahead.normalize();
        _look.copy(_eye).addScaledVector(_ahead, 30);
        _look.y = _eye.y - 1.8;
      }
    }

    const posAlpha = onGroundSlow ? 0.1 : 0.22;
    const lookAlpha = onGroundSlow ? 0.12 : 0.2;
    const posBlend = 1 - Math.pow(1 - posAlpha, Math.max(opts.dt, 1 / 120) * 60);
    const lookBlend = 1 - Math.pow(1 - lookAlpha, Math.max(opts.dt, 1 / 120) * 60);

    if (this.snapNext) {
      this.smoothPos.copy(_eye);
      this.smoothLook.copy(_look);
      this.snapNext = false;
    } else {
      this.smoothPos.lerp(_eye, posBlend);
      this.smoothLook.lerp(_look, lookBlend);
    }

    this.camera.position.copy(this.smoothPos);
    this.camera.lookAt(this.smoothLook);
  }

  private applyProjection(mode: CameraMode): void {
    if (mode === 'cockpit') {
      this.camera.near = 0.1;
      this.camera.far = 50_000;
      this.camera.fov = 78;
    } else if (mode === 'gear') {
      this.camera.near = 0.1;
      this.camera.far = 50_000;
      this.camera.fov = 88;
    } else {
      this.camera.near = 0.5;
      this.camera.far = 50_000;
      this.camera.fov = 50;
    }
    this.camera.updateProjectionMatrix();
  }

  private updateOutside(
    aircraftRoot: THREE.Object3D,
    visualModel: THREE.Object3D,
    dt: number,
  ): void {
    const heli = this.definition.category === 'helicopter';
    if (heli) this.setAirframeBox(visualModel, _box);
    else _box.setFromObject(visualModel);
    _box.getCenter(_center);
    _box.getSize(_size);
    const span = heli
      ? Math.max(_size.x, _size.y, _size.z, this.definition.wingSpanM * 0.7)
      : Math.max(_size.x, _size.y, _size.z, 8);

    const fovRad = THREE.MathUtils.degToRad(this.camera.fov);
    const dist = (span / Math.tan(fovRad / 2)) * (heli ? 0.92 : 1.05);

    _offset.set(0, heli ? Math.min(1.4, span * 0.14) : span * 0.35, dist);
    _offset.applyQuaternion(aircraftRoot.quaternion);
    _eye.copy(_center).add(_offset);

    const posBlend = 1 - Math.pow(1 - 0.12, Math.max(dt, 1 / 120) * 60);
    // Helicopters climb/descend on collective; keep look-at on the airframe so
    // the ship does not sit on the top edge of the frame.
    const lookBlend = 1 - Math.pow(1 - (heli ? 0.55 : 0.12), Math.max(dt, 1 / 120) * 60);

    if (this.snapNext) {
      this.smoothPos.copy(_eye);
      this.smoothLook.copy(_center);
      this.snapNext = false;
    } else {
      this.smoothPos.lerp(_eye, posBlend);
      this.smoothLook.lerp(_center, lookBlend);
    }

    this.camera.position.copy(this.smoothPos);
    this.camera.lookAt(this.smoothLook);
  }

  /** Fuselage-only bounds so spinning rotors do not yank the chase frame around. */
  private setAirframeBox(root: THREE.Object3D, out: THREE.Box3): void {
    out.makeEmpty();
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !child.visible) return;
      if (isRotorObject(child)) return;
      _meshBox.setFromObject(child);
      out.union(_meshBox);
    });
    if (out.isEmpty()) out.setFromObject(root);
  }
}
