import * as THREE from 'three';
import type { AeroPoint } from '../AtmosphereISA.ts';
import { interpolateTable } from '../AtmosphereISA.ts';

const _forward = new THREE.Vector3();
const _up = new THREE.Vector3();
const _right = new THREE.Vector3();
const _wind = new THREE.Vector3();
const _lift = new THREE.Vector3();
const _drag = new THREE.Vector3();
const _side = new THREE.Vector3();
const _force = new THREE.Vector3();
const _moment = new THREE.Vector3();

export interface AeroInputs {
  elevator: number;
  aileron: number;
  rudder: number;
  flaps: number;
  alphaBiasDeg: number;
}

export interface AeroParams {
  wingAreaM2: number;
  aeroTables: AeroPoint[];
  flapsCL: number;
  controlAuthority: { pitch: number; roll: number; yaw: number };
  massKg: number;
  wingSpanM: number;
  chordM: number;
}

export interface AeroOutput {
  forceWorld: THREE.Vector3;
  momentBody: THREE.Vector3;
  alphaDeg: number;
  dynamicPressure: number;
  airspeed: number;
}

export function computeAerodynamics(
  velocityWorld: THREE.Vector3,
  quaternion: THREE.Quaternion,
  rho: number,
  inputs: AeroInputs,
  params: AeroParams,
): AeroOutput {
  const rot = new THREE.Matrix4().makeRotationFromQuaternion(quaternion);
  _forward.set(0, 0, -1).applyMatrix4(rot);
  _up.set(0, 1, 0).applyMatrix4(rot);
  _right.set(1, 0, 0).applyMatrix4(rot);

  _wind.copy(velocityWorld).negate();
  const airspeed = _wind.length();
  const q = 0.5 * rho * airspeed * airspeed;

  if (airspeed < 0.5) {
    return {
      forceWorld: new THREE.Vector3(),
      momentBody: new THREE.Vector3(),
      alphaDeg: 0,
      dynamicPressure: q,
      airspeed,
    };
  }

  _wind.normalize();
  const alphaRad = Math.asin(THREE.MathUtils.clamp(_up.dot(_wind), -1, 1));
  const betaRad = Math.asin(THREE.MathUtils.clamp(_right.dot(_wind), -1, 1));
  const alphaDeg =
    THREE.MathUtils.radToDeg(alphaRad) +
    inputs.elevator * 8 +
    inputs.alphaBiasDeg;

  const { CL, CD } = interpolateTable(params.aeroTables, alphaDeg);
  const flapBoost = inputs.flaps * params.flapsCL;
  const CLtotal = CL + flapBoost;
  const CDtotal = CD + inputs.flaps * 0.03;

  _lift.copy(_up).multiplyScalar(q * params.wingAreaM2 * CLtotal);
  _drag.copy(_wind).multiplyScalar(-q * params.wingAreaM2 * CDtotal);
  _side.copy(_right).multiplyScalar(-q * params.wingAreaM2 * 0.15 * Math.sin(betaRad));

  _force.copy(_lift).add(_drag).add(_side);

  _moment.set(
    inputs.elevator * params.controlAuthority.pitch * q * params.wingAreaM2 * params.chordM,
    inputs.rudder * params.controlAuthority.yaw * q * params.wingAreaM2 * params.wingSpanM,
    inputs.aileron * params.controlAuthority.roll * q * params.wingAreaM2 * params.wingSpanM,
  );

  return {
    forceWorld: _force.clone(),
    momentBody: _moment.clone(),
    alphaDeg,
    dynamicPressure: q,
    airspeed,
  };
}

export function thrustForce(
  throttle: number,
  maxThrustN: number,
  quaternion: THREE.Quaternion,
  rho: number,
): THREE.Vector3 {
  const thrust = maxThrustN * throttle * Math.min(1, rho / 1.225);
  const rot = new THREE.Matrix4().makeRotationFromQuaternion(quaternion);
  return new THREE.Vector3(0, 0, -1).applyMatrix4(rot).multiplyScalar(thrust);
}

export function gravityForce(massKg: number): THREE.Vector3 {
  return new THREE.Vector3(0, -massKg * 9.80665, 0);
}

export function angularAcceleration(
  momentBody: THREE.Vector3,
  inertia: THREE.Vector3,
): THREE.Vector3 {
  return new THREE.Vector3(
    momentBody.x / inertia.x,
    momentBody.y / inertia.y,
    momentBody.z / inertia.z,
  );
}
