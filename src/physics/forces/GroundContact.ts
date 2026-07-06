import * as THREE from 'three';
import type { RigidBodyState } from '../integrator.ts';
import {
  angularAcceleration,
  computeAerodynamics,
  gravityForce,
  thrustForce,
} from './Aerodynamics.ts';
import { isaDensity } from '../AtmosphereISA.ts';
import type { AeroInputs } from './Aerodynamics.ts';
import type { AeroParams } from './Aerodynamics.ts';
import { quaternionDerivative } from '../integrator.ts';
import type { BodyDerivatives } from '../integrator.ts';

export interface SimControls {
  throttle: number;
  elevator: number;
  aileron: number;
  rudder: number;
  flaps: number;
  brakes: number;
  gearDown: boolean;
}

export interface GroundState {
  onGround: boolean;
  agl: number;
}

export function createDerivativeFn(
  controls: SimControls,
  aeroParams: AeroParams,
  maxThrustN: number,
  inertia: THREE.Vector3,
  groundFn: (pos: THREE.Vector3) => GroundState,
  damping: number,
): (state: RigidBodyState) => BodyDerivatives {
  const angularDamping = 1 - damping;

  return (state: RigidBodyState): BodyDerivatives => {
    const alt = state.position.y;
    const rho = isaDensity(alt);

    const aeroIn: AeroInputs = {
      elevator: controls.elevator,
      aileron: controls.aileron,
      rudder: controls.rudder,
      flaps: controls.flaps,
      alphaBiasDeg: 0,
    };

    const aero = computeAerodynamics(
      state.velocity,
      state.quaternion,
      rho,
      aeroIn,
      aeroParams,
    );

    const thrust = thrustForce(controls.throttle, maxThrustN, state.quaternion, rho);
    const gravity = gravityForce(aeroParams.massKg);

    const totalForce = new THREE.Vector3()
      .add(aero.forceWorld)
      .add(thrust)
      .add(gravity);

    const ground = groundFn(state.position);
    if (ground.onGround && totalForce.y < 0) {
      totalForce.y = 0;
    }

    const accel = totalForce.divideScalar(aeroParams.massKg);
    const angAccel = angularAcceleration(aero.momentBody, inertia);
    const dAngVel = angAccel.multiplyScalar(angularDamping);

    return {
      dPosition: state.velocity.clone(),
      dVelocity: accel,
      dQuaternion: quaternionDerivative(state.quaternion, state.angularVelocity),
      dAngularVelocity: dAngVel,
    };
  };
}

export function applyGroundConstraint(
  state: RigidBodyState,
  gearHeight: number,
  groundFn: (pos: THREE.Vector3) => GroundState,
): boolean {
  const ground = groundFn(state.position);
  const minY = ground.agl + gearHeight;
  let onGround = ground.onGround;
  if (state.position.y < minY) {
    state.position.y = minY;
    if (state.velocity.y < 0) state.velocity.y = 0;
    onGround = true;
  }
  return onGround;
}

export function applyGroundFriction(
  state: RigidBodyState,
  controls: SimControls,
  onGround: boolean,
): void {
  if (!onGround) return;
  const rolling = 0.96;
  state.velocity.x *= rolling;
  state.velocity.z *= rolling;
  if (controls.brakes > 0) {
    const brake = 1 - controls.brakes * 0.18;
    state.velocity.x *= brake;
    state.velocity.z *= brake;
  }
}
