import * as THREE from 'three';
import type { FlightControls, FlightParams, FlightState } from './SimpleFlightModel.ts';

const _dq = new THREE.Quaternion();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _forward = new THREE.Vector3();
const _up = new THREE.Vector3();
const _right = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);
const _axisX = new THREE.Vector3(1, 0, 0);
const _axisZ = new THREE.Vector3(0, 0, 1);
const _vHat = new THREE.Vector3();

/** Collective fraction that roughly hovers an R22-class ship in still air. */
export const HOVER_COLLECTIVE = 0.62;

/**
 * Arcade-leaning helicopter: collective is vertical thrust, cyclic tilts the
 * disc (and body), pedals yaw. Stability assist keeps keyboard hover flyable.
 */
export class HelicopterFlightModel {
  state: FlightState;
  indicatedAirspeed = 0;
  aglM = 0;
  headingDeg = 0;
  pitchDeg = 0;
  rollDeg = 0;
  verticalSpeed = 0;
  alphaDeg = 0;
  stallWarning = false;
  highAlphaWarning = false;
  isStalled = false;

  private groundYFiltered: number | null = null;

  constructor(position: THREE.Vector3, headingDeg: number) {
    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0, THREE.MathUtils.degToRad(headingDeg), 0, 'YXZ'),
    );
    this.state = {
      position: position.clone(),
      velocity: new THREE.Vector3(),
      quaternion: q,
    };
    this.resetGroundContact();
  }

  resetGroundContact(): void {
    this.groundYFiltered = null;
  }

  step(
    dt: number,
    controls: FlightControls,
    params: FlightParams,
    groundHeightAt: (pos: THREE.Vector3) => number,
  ): boolean {
    const { state } = this;
    const sampled = groundHeightAt(state.position);
    if (this.groundYFiltered === null) this.groundYFiltered = sampled;
    else {
      const d = sampled - this.groundYFiltered;
      this.groundYFiltered += THREE.MathUtils.clamp(d, -40 * dt, 40 * dt);
    }
    const groundY = this.groundYFiltered;
    const agl = state.position.y - groundY - params.gearOffsetM;
    const onSkids = agl < 0.18;

    _forward.set(0, 0, -1).applyQuaternion(state.quaternion);
    _up.set(0, 1, 0).applyQuaternion(state.quaternion);
    _right.set(1, 0, 0).applyQuaternion(state.quaternion);

    const horizPitch = Math.hypot(_forward.x, _forward.z);
    const pitchDeg =
      horizPitch > 1e-5
        ? -THREE.MathUtils.radToDeg(Math.atan2(_forward.y, horizPitch))
        : 0;
    _right.crossVectors(_forward, _up);
    const rollDeg =
      _right.lengthSq() < 1e-8
        ? 0
        : THREE.MathUtils.radToDeg(
            Math.asin(THREE.MathUtils.clamp(_right.normalize().y, -1, 1)),
          );

    // Cyclic inverted vs airplanes so W/S and A/D match heli feel (W = nose down / forward).
    let pitchRate = controls.elevator * params.pitchAuthority;
    let rollRate = controls.aileron * params.rollAuthority;
    const horizSpd = Math.hypot(state.velocity.x, state.velocity.z);
    const trimPitch = -THREE.MathUtils.clamp(horizSpd * 0.22, 0, 9);
    if (Math.abs(controls.elevator) < 0.08) {
      pitchRate += THREE.MathUtils.degToRad(trimPitch - pitchDeg) * 1.6;
    }
    if (Math.abs(controls.aileron) < 0.08) {
      rollRate += THREE.MathUtils.degToRad(-rollDeg) * 2.2;
    }
    if (onSkids) {
      pitchRate *= 0.35;
      rollRate *= 0.2;
    }

    applyLocal(state, _axisX, pitchRate, dt);
    applyLocal(state, _axisZ, rollRate, dt);

    clampAttitude(state, -22, 16, 28);

    const torque = (controls.throttle - 0.12) * 0.55;
    const yawRate = controls.rudder * params.yawAuthority - torque;
    applyWorldYaw(state, yawRate, dt);

    const mass = Math.max(80, params.massKg);
    const weight = mass * 9.80665;
    const ge = 1 + 0.16 * Math.exp(-Math.max(0, agl) / 2.4);
    const etl = 1 + 0.2 * smoothstep(6, 26, horizSpd);
    let thrust = params.maxThrustN * THREE.MathUtils.clamp(controls.throttle, 0, 1) * ge * etl;
    // Autorotation cushion if the engine is cut and you're descending.
    if (controls.throttle < 0.12 && state.velocity.y < -1.5) {
      thrust += weight * 0.5 * THREE.MathUtils.clamp(-state.velocity.y / 14, 0, 1);
    }

    _up.set(0, 1, 0).applyQuaternion(state.quaternion);
    state.velocity.addScaledVector(_up, (thrust / mass) * dt);
    state.velocity.y -= 9.80665 * dt;

    const speed = state.velocity.length();
    if (speed > 0.05) {
      const cd = 0.42 + horizSpd * 0.008;
      const dragA = (0.5 * 1.225 * cd * 2.8 * speed * speed) / mass;
      _vHat.copy(state.velocity).normalize();
      state.velocity.addScaledVector(_vHat, -dragA * dt);
    }

    // Hover damping — kills the "ice rink" slide at low speed.
    if (horizSpd < 14) {
      const damp = 1 - THREE.MathUtils.clamp((14 - horizSpd) / 14, 0, 1) * 1.8 * dt;
      state.velocity.x *= damp;
      state.velocity.z *= damp;
    }

    state.position.addScaledVector(state.velocity, dt);

    const minY = groundY + params.gearOffsetM;
    if (state.position.y < minY) {
      state.position.y = minY;
      if (state.velocity.y < 0) state.velocity.y = 0;
      if (controls.throttle < HOVER_COLLECTIVE * 0.92) {
        const slide = Math.pow(0.15, dt);
        state.velocity.x *= slide;
        state.velocity.z *= slide;
      }
    }

    const onGround = state.position.y <= minY + 0.12;
    this.aglM = state.position.y - groundY - params.gearOffsetM;
    this.verticalSpeed = state.velocity.y;
    this.indicatedAirspeed = Math.hypot(state.velocity.x, state.velocity.z);
    this.alphaDeg = 0;
    this.stallWarning = false;
    this.highAlphaWarning = false;
    this.isStalled = false;

    _forward.set(0, 0, -1).applyQuaternion(state.quaternion);
    const hp = Math.hypot(_forward.x, _forward.z);
    this.pitchDeg =
      hp > 1e-5 ? -THREE.MathUtils.radToDeg(Math.atan2(_forward.y, hp)) : 0;
    _up.set(0, 1, 0).applyQuaternion(state.quaternion);
    _right.crossVectors(_forward, _up);
    this.rollDeg =
      _right.lengthSq() < 1e-8
        ? 0
        : THREE.MathUtils.radToDeg(
            Math.asin(THREE.MathUtils.clamp(_right.normalize().y, -1, 1)),
          );
    this.headingDeg =
      (THREE.MathUtils.radToDeg(Math.atan2(_forward.x, -_forward.z)) + 360) % 360;

    return onGround;
  }
}

function applyLocal(
  state: FlightState,
  axis: THREE.Vector3,
  rate: number,
  dt: number,
): void {
  if (Math.abs(rate) < 1e-5) return;
  _dq.setFromAxisAngle(axis, rate * dt);
  state.quaternion.multiply(_dq);
  state.quaternion.normalize();
}

function applyWorldYaw(state: FlightState, yawRate: number, dt: number): void {
  if (Math.abs(yawRate) < 1e-5) return;
  _dq.setFromAxisAngle(_worldUp, yawRate * dt);
  state.quaternion.premultiply(_dq);
}

function clampAttitude(
  state: FlightState,
  minPitch: number,
  maxPitch: number,
  maxRoll: number,
): void {
  _euler.setFromQuaternion(state.quaternion, 'YXZ');
  const pitch = THREE.MathUtils.radToDeg(_euler.x);
  const roll = THREE.MathUtils.radToDeg(_euler.z);
  _euler.x = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(pitch, minPitch, maxPitch));
  _euler.z = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(roll, -maxRoll, maxRoll));
  state.quaternion.setFromEuler(_euler);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
