import * as THREE from 'three';
import type { RigidBodyState } from './integrator.ts';
import { integrateRK4 } from './integrator.ts';
import type { SimControls } from './forces/GroundContact.ts';
import {
  applyGroundConstraint,
  applyGroundFriction,
  createDerivativeFn,
} from './forces/GroundContact.ts';
import type { AeroParams } from './forces/Aerodynamics.ts';

export class RigidBody6DOF {
  readonly state: RigidBodyState;
  readonly inertia = new THREE.Vector3(1200, 1800, 1400);

  alphaDeg = 0;
  airspeed = 0;
  altitudeM = 0;
  headingDeg = 0;
  verticalSpeed = 0;

  constructor(position: THREE.Vector3, headingDeg: number) {
    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0, THREE.MathUtils.degToRad(headingDeg), 0, 'YXZ'),
    );
    this.state = {
      position: position.clone(),
      velocity: new THREE.Vector3(),
      quaternion: q,
      angularVelocity: new THREE.Vector3(),
    };
  }

  step(
    dt: number,
    controls: SimControls,
    aero: AeroParams,
    maxThrustN: number,
    gearHeight: number,
    groundFn: (pos: THREE.Vector3) => { onGround: boolean; agl: number },
  ): void {
    const derivFn = createDerivativeFn(
      controls,
      aero,
      maxThrustN,
      this.inertia,
      groundFn,
      0.92,
    );
    const next = integrateRK4(this.state, dt, derivFn);
    this.state.position.copy(next.position);
    this.state.velocity.copy(next.velocity);
    this.state.quaternion.copy(next.quaternion).normalize();
    this.state.angularVelocity.copy(next.angularVelocity);

    const onGround = applyGroundConstraint(this.state, gearHeight, groundFn);
    applyGroundFriction(this.state, controls, onGround);

    this.altitudeM = this.state.position.y;
    this.airspeed = this.state.velocity.length();
    this.verticalSpeed = this.state.velocity.y;

    const rot = new THREE.Matrix4().makeRotationFromQuaternion(this.state.quaternion);
    const forward = new THREE.Vector3(0, 0, -1).applyMatrix4(rot);
    this.headingDeg = (THREE.MathUtils.radToDeg(Math.atan2(forward.x, -forward.z)) + 360) % 360;

    const up = new THREE.Vector3(0, 1, 0).applyMatrix4(rot);
    const wind = this.state.velocity.clone().negate().normalize();
    this.alphaDeg = THREE.MathUtils.radToDeg(
      Math.asin(THREE.MathUtils.clamp(up.dot(wind), -1, 1)),
    );
  }

  get pitchDeg(): number {
    const e = new THREE.Euler().setFromQuaternion(this.state.quaternion, 'YXZ');
    return THREE.MathUtils.radToDeg(e.x);
  }

  get rollDeg(): number {
    const e = new THREE.Euler().setFromQuaternion(this.state.quaternion, 'YXZ');
    return THREE.MathUtils.radToDeg(e.z);
  }
}
