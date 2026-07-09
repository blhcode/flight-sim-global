import * as THREE from 'three';
import type { AeroPoint } from './AtmosphereISA.ts';
import {
  TAXI_PITCH_LOCK_MS,
  weightOnWheels,
} from './groundState.ts';

export interface FlightState {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

export interface FlightControls {
  throttle: number;
  elevator: number;
  aileron: number;
  rudder: number;
  flaps: number;
  brakes: number;
}

export interface FlightParams {
  massKg: number;
  wingAreaM2: number;
  maxThrustN: number;
  gearOffsetM: number;
  pitchAuthority: number;
  rollAuthority: number;
  yawAuthority: number;
  stallAlphaDeg: number;
  flapsCL: number;
  aeroTables: AeroPoint[];
  engineType?: 'prop' | 'turboprop' | 'jet';
  rotateSpeedMs?: number;
  stallSpeedMs?: number;
  groundRollLiftScale?: number;
}

const MS_TO_KTS = 1.94384;
/** Rotation speed ~55 kt */
const ROTATE_SPEED_MS = 28;
/** Clean stall ~48 kt */
const STALL_SPEED_MS = 25;

/** Below ~10% throttle = mixture idle, essentially no forward thrust. */
function effectiveThrustFraction(throttle: number): number {
  const t = THREE.MathUtils.clamp(throttle, 0, 1);
  if (t <= 0.1) return 0;
  return Math.pow((t - 0.1) / 0.9, 1.05);
}

/** Mild speed falloff for heavy jets only — never applied to prop/turboprop. */
function thrustSpeedFactor(
  engineType: FlightParams['engineType'],
  bodySpeed: number,
  groundRollLiftScale?: number,
): number {
  if (engineType !== 'jet' || (groundRollLiftScale ?? 1) >= 1) return 1;
  const v = Math.max(bodySpeed, 6);
  return Math.max(0.55, 1 - v * 0.00075);
}

/** Fixed-pitch windmilling drag rises as throttle closes. */
function propDragMultiplier(throttle: number): number {
  const idle = 1 - THREE.MathUtils.clamp(throttle, 0, 1);
  return idle * idle * 0.58;
}

const _bodyY = new THREE.Vector3();
const _bodyZ = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);
const _dq = new THREE.Quaternion();
const _qInv = new THREE.Quaternion();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _rot = new THREE.Matrix4();
const _forward = new THREE.Vector3();
const _up = new THREE.Vector3();
const _vLocal = new THREE.Vector3();
const _vHat = new THREE.Vector3();
const _liftDir = new THREE.Vector3();
const _liftScratch = new THREE.Vector3();
const _fwdGround = new THREE.Vector3();
const _bankRight = new THREE.Vector3();

/** Wing-level bank from quaternion — stable when pitching (unlike euler.z). */
function bankRadians(q: THREE.Quaternion): number {
  _forward.set(0, 0, -1).applyQuaternion(q);
  _up.set(0, 1, 0).applyQuaternion(q);
  _bankRight.crossVectors(_forward, _up);
  if (_bankRight.lengthSq() < 1e-8) return 0;
  return Math.asin(THREE.MathUtils.clamp(_bankRight.normalize().y, -1, 1));
}

function applyBodyRate(
  state: FlightState,
  localAxis: THREE.Vector3,
  rate: number,
  dt: number,
): void {
  if (Math.abs(rate) < 1e-5) return;
  // Axis is in body frame — multiply applies rotation locally (do not rotate axis into world)
  _dq.setFromAxisAngle(localAxis, rate * dt);
  state.quaternion.multiply(_dq);
}

/** Pitch about the horizontal wing axis — stable through flare (no gimbal flip past ±90°). */
function applyWorldPitch(state: FlightState, pitchRate: number, dt: number): void {
  if (Math.abs(pitchRate) < 1e-5) return;
  _forward.set(0, 0, -1).applyQuaternion(state.quaternion);
  const horiz = new THREE.Vector3(_forward.x, 0, _forward.z);
  if (horiz.lengthSq() < 1e-8) return;
  horiz.normalize();
  const pitchAxis = new THREE.Vector3().crossVectors(horiz, _worldUp).normalize();
  _dq.setFromAxisAngle(pitchAxis, pitchRate * dt);
  state.quaternion.premultiply(_dq);
}

/** Keep pitch in a flyable range — prevents ±90° flips that invert controls. */
function clampPitchQuaternion(state: FlightState, minDeg: number, maxDeg: number): void {
  _forward.set(0, 0, -1).applyQuaternion(state.quaternion);
  const horiz = Math.hypot(_forward.x, _forward.z);
  if (horiz < 1e-6) return;
  const pitchDeg = -THREE.MathUtils.radToDeg(Math.atan2(_forward.y, horiz));
  const clamped = THREE.MathUtils.clamp(pitchDeg, minDeg, maxDeg);
  if (Math.abs(clamped - pitchDeg) < 0.05) return;
  const delta = THREE.MathUtils.degToRad(clamped - pitchDeg);
  const horizN = new THREE.Vector3(_forward.x, 0, _forward.z).normalize();
  const pitchAxis = new THREE.Vector3().crossVectors(horizN, _worldUp).normalize();
  _dq.setFromAxisAngle(pitchAxis, -delta);
  state.quaternion.premultiply(_dq);
}

/** World-yaw rotation — also slews horizontal velocity so the flight path follows the nose. */
function applyWorldYaw(
  state: FlightState,
  yawRate: number,
  dt: number,
  slewVelocity = true,
): void {
  const dYaw = yawRate * dt;
  if (Math.abs(dYaw) < 1e-8) return;
  _dq.setFromAxisAngle(_worldUp, dYaw);
  state.quaternion.premultiply(_dq);
  if (!slewVelocity) return;
  const spH = Math.hypot(state.velocity.x, state.velocity.z);
  if (spH < 1) return;
  _vHat.set(state.velocity.x, 0, state.velocity.z).applyQuaternion(_dq);
  state.velocity.x = _vHat.x;
  state.velocity.z = _vHat.z;
}

/** Bleed sideslip — horizontal velocity tracks where the nose points. */
function alignHorizontalVelocity(
  state: FlightState,
  forward: THREE.Vector3,
  rate: number,
  dt: number,
): void {
  _fwdGround.copy(forward);
  _fwdGround.y = 0;
  const fwdLen = _fwdGround.lengthSq();
  if (fwdLen < 1e-6) return;
  _fwdGround.multiplyScalar(1 / Math.sqrt(fwdLen));
  const spH = Math.hypot(state.velocity.x, state.velocity.z);
  if (spH < 2) return;
  const blend = 1 - Math.exp(-rate * dt);
  state.velocity.x += (_fwdGround.x * spH - state.velocity.x) * blend;
  state.velocity.z += (_fwdGround.z * spH - state.velocity.z) * blend;
}

export class SimpleFlightModel {
  readonly state: FlightState;

  alphaDeg = 0;
  airspeed = 0;
  indicatedAirspeed = 0;
  altitudeM = 0;
  aglM = 0;
  headingDeg = 0;
  verticalSpeed = 0;
  pitchDeg = 0;
  rollDeg = 0;
  isStalled = false;
  stallWarning = false;
  highAlphaWarning = false;

  /** Low-pass filtered terrain height — avoids LOD/tile pops snapping the aircraft. */
  private groundYFiltered: number | null = null;
  private readonly lastGroundSamplePos = new THREE.Vector3();

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
    this.lastGroundSamplePos.set(0, -99_999, 0);
  }

  step(
    dt: number,
    controls: FlightControls,
    params: FlightParams,
    groundHeightAt: (pos: THREE.Vector3) => number,
  ): boolean {
    const { state } = this;
    _rot.makeRotationFromQuaternion(state.quaternion);
    _forward.set(0, 0, -1).applyMatrix4(_rot);
    _up.set(0, 1, 0).applyMatrix4(_rot);

    if (this.lastGroundSamplePos.distanceToSquared(state.position) > 12_000) {
      this.groundYFiltered = null;
    }
    this.lastGroundSamplePos.copy(state.position);

    const sampledGroundY = groundHeightAt(state.position);
    const speed = state.velocity.length();
    if (this.groundYFiltered === null) {
      this.groundYFiltered = sampledGroundY;
    } else {
      const delta = sampledGroundY - this.groundYFiltered;
      const aglEst = state.position.y - this.groundYFiltered - params.gearOffsetM;
      const onGroundEarly = aglEst < 0.35;
      if (
        Math.abs(delta) > 45 && (aglEst < 150 || Math.abs(delta) > 120) ||
        (onGroundEarly && delta > 8)
      ) {
        this.groundYFiltered = sampledGroundY;
      } else {
        const slew = onGroundEarly && speed < 10
          ? Math.max(0.8 * dt, 0.02)
          : Math.max(18 * dt, 0.35);
        this.groundYFiltered += THREE.MathUtils.clamp(delta, -slew, slew);
      }
    }
    const groundY = this.groundYFiltered;
    const agl = state.position.y - groundY - params.gearOffsetM;
    const onGround = agl < 0.25;
    const onWheels = weightOnWheels(agl, state.velocity.y);

    const rho = isaRho(Math.max(0, groundY + agl));
    const rho0 = 1.225;
    const bodySpeed = state.velocity.dot(_forward);
    const iasBase = Math.max(bodySpeed, speed * 0.55);
    const iasMs = Math.max(0, iasBase * Math.sqrt(rho / rho0));
    const onTaxi = onWheels && iasMs < TAXI_PITCH_LOCK_MS;
    const rotateSpeed = params.rotateSpeedMs ?? ROTATE_SPEED_MS;
    const onTakeoffRoll = onWheels && !onTaxi && iasMs < rotateSpeed * 1.05;
    const inRoundout =
      !onWheels &&
      agl < 20 &&
      iasMs > 18 &&
      iasMs < 42 &&
      speed > 8;

    _fwdGround.copy(_forward);
    _fwdGround.y = 0;
    let groundFwdSpeed = 0;
    if (_fwdGround.lengthSq() > 0.001) {
      _fwdGround.normalize();
      groundFwdSpeed = Math.abs(state.velocity.dot(_fwdGround));
    }

    const thrustFrac = effectiveThrustFraction(controls.throttle);
    // Run-up / parking brake: power set and barely moving — not landing rollout
    const brakeHold =
      onWheels &&
      controls.brakes > 0 &&
      thrustFrac > 0.25 &&
      groundFwdSpeed < 1.2;
    let thrustN =
      params.maxThrustN *
      thrustFrac *
      thrustSpeedFactor(params.engineType, bodySpeed, params.groundRollLiftScale) *
      Math.min(1, rho / rho0);
    if (onWheels && controls.brakes > 0 && !brakeHold) {
      thrustN *= Math.max(0, 1 - controls.brakes * 0.98);
    }
    if (!brakeHold) {
      state.velocity.addScaledVector(_forward, (thrustN / params.massKg) * dt);
    }

    state.velocity.y -= 9.80665 * dt;

    let alphaDeg = 0;
    if (speed > 2) {
      // Body-frame pitch angle — bank does not fake a high angle of attack
      _qInv.copy(state.quaternion).invert();
      _vLocal.copy(state.velocity).applyQuaternion(_qInv);
      const alpha = Math.atan2(-_vLocal.y, -_vLocal.z);
      alphaDeg = THREE.MathUtils.radToDeg(alpha);
      // Allow elevator to raise AoA through rotation speed (was capped at 55 m/s,
      // which blocked Dash 8 / 737 / 747 takeoffs).
      const groundAlphaMax = Math.max(55, rotateSpeed * 1.15);
      if (!onGround || (onGround && speed > 4 && speed < groundAlphaMax)) {
        alphaDeg += -controls.elevator * (inRoundout ? 3.2 : 3.2);
      }
    }
    this.alphaDeg = alphaDeg;

    const { CL, CD } = interpolateAero(params.aeroTables, alphaDeg, controls.flaps, params.flapsCL);
    const qDyn = 0.5 * rho * speed * speed;

    const stallAlpha = params.stallAlphaDeg + controls.flaps * 4;
    const stallSpeed = controls.flaps > 0
      ? (params.stallSpeedMs ?? STALL_SPEED_MS) * 0.85
      : (params.stallSpeedMs ?? STALL_SPEED_MS);
    const stallMargin = inRoundout ? 8 : 2;
    this.isStalled =
      !onGround &&
      !inRoundout &&
      iasMs > 5 &&
      iasMs < stallSpeed &&
      alphaDeg > stallAlpha - stallMargin;
    this.stallWarning =
      !onGround &&
      iasMs > 5 &&
      iasMs < stallSpeed + 5 &&
      alphaDeg > stallAlpha - (inRoundout ? 10 : 5);
    this.highAlphaWarning =
      !onGround && alphaDeg > stallAlpha - 8 && alphaDeg <= stallAlpha - 5;

    let liftCoeff = CL;
    if (this.isStalled) {
      const stallFactor = inRoundout ? 0.08 : 0.06;
      liftCoeff = CL * Math.max(inRoundout ? 0.55 : 0.35, 1 - (alphaDeg - stallAlpha) * stallFactor);
    }

    const pitchingUp = controls.elevator < -0.05;

    if (!onGround && speed > 3) {
      let liftN = qDyn * params.wingAreaM2 * liftCoeff;
      if (agl < 10) {
        liftN *= 1 + (10 - agl) * 0.025;
      }
      // Pulling back in the flare: raise the nose without ballooning upward
      if (inRoundout && pitchingUp) {
        const pull = Math.abs(controls.elevator);
        const altFactor = Math.min(1, agl / 15);
        liftN *= Math.max(0.32, 1 - pull * 0.6 * (1 - altFactor * 0.4));
      }
      // Lift ⊥ velocity in the plane of body-up — bank reduces vertical thrust naturally
      _vHat.copy(state.velocity).normalize();
      _liftScratch.copy(_up).addScaledVector(_vHat, -_up.dot(_vHat));
      if (_liftScratch.lengthSq() < 1e-6) {
        _liftDir.set(0, 1, 0);
      } else {
        _liftDir.copy(_liftScratch.normalize());
      }
      state.velocity.addScaledVector(_liftDir, (liftN / params.massKg) * dt);

      let dragMul = 1;
      if (controls.flaps > 0) dragMul += 0.28;
      if (inRoundout) dragMul += 0.14;
      if (inRoundout && pitchingUp) dragMul += 0.12 * Math.abs(controls.elevator);
      const dragN = qDyn * params.wingAreaM2 * CD * dragMul;
      state.velocity.addScaledVector(
        state.velocity.clone().normalize().negate(),
        (dragN / params.massKg) * dt,
      );

      if (inRoundout && pitchingUp) {
        const pull = Math.abs(controls.elevator);
        const fwdSpd = Math.max(bodySpeed, 0);
        const targetVy = -0.45 * pull;
        if (fwdSpd > 8) {
          state.velocity.addScaledVector(_forward, -pull * 0.14 * dt);
        }
        if (state.velocity.y < targetVy - 0.05) {
          state.velocity.y += (targetVy - state.velocity.y) * pull * 5 * dt;
        }
        if (state.velocity.y > 0.1) {
          state.velocity.y = THREE.MathUtils.lerp(state.velocity.y, targetVy, 5 * dt);
        }
      }
    } else if (onGround && speed > 1 && controls.brakes <= 0) {
      const idleBlend = 1 - THREE.MathUtils.clamp(controls.throttle, 0, 1);
      const rollMu = 0.016 + idleBlend * idleBlend * 0.072;
      const groundDecel = rollMu * 9.80665 + (0.012 + idleBlend * 0.02) * speed;
      state.velocity.addScaledVector(
        _vHat.copy(state.velocity).normalize().negate(),
        groundDecel * dt,
      );
      // Heavy jets (groundRollLiftScale < 1) need a pull at Vr; others can unstick.
      const needsRotatePull = (params.groundRollLiftScale ?? 1) < 1;
      const rotateLift =
        speed > rotateSpeed * 0.88 && (!needsRotatePull || pitchingUp);
      const liftScale =
        (rotateSpeed > ROTATE_SPEED_MS * 1.2 ? 1.05 : 0.85) *
        (params.groundRollLiftScale ?? 1);
      if (rotateLift) {
        // Help heavy types unstick near Vr, but only when rotating and not instantly.
        const weightN = params.massKg * 9.80665;
        const rawLiftN =
          qDyn * params.wingAreaM2 * Math.max(liftCoeff, 0.35) * liftScale;
        const overVr = THREE.MathUtils.clamp(
          (speed - rotateSpeed * 0.88) / (rotateSpeed * 0.2),
          0,
          1,
        );
        const pull = pitchingUp ? Math.abs(controls.elevator) : 0;
        const targetLiftFrac =
          0.35 + overVr * 0.45 + pull * 0.35; // up to ~1.15× weight with full pull past Vr
        const unstickBoost = Math.max(
          1,
          (weightN * targetLiftFrac) / Math.max(rawLiftN, 1),
        );
        const liftN = rawLiftN * Math.min(unstickBoost, 3.2);
        state.velocity.addScaledVector(_up, (liftN / params.massKg) * dt);
      }
      if (inRoundout && pitchingUp) {
        const pull = Math.abs(controls.elevator);
        if (state.velocity.y < -0.2) {
          state.velocity.y += (-state.velocity.y - 0.15) * pull * 3.5 * dt;
        }
        state.velocity.addScaledVector(_forward, -pull * 0.2 * dt);
      }
    }

    if (speed > 2) {
      const propDragN =
        propDragMultiplier(controls.throttle) * qDyn * params.wingAreaM2;
      state.velocity.addScaledVector(
        _vHat.copy(state.velocity).normalize().negate(),
        (propDragN / params.massKg) * dt,
      );
    }

    const controlScale = inRoundout
      ? 1.05 + Math.min(speed / 45, 0.35)
      : onTakeoffRoll
        ? 0.55 + Math.min(speed / 35, 0.55)
        : onGround
          ? 0.38 + Math.min(speed / 32, 0.42)
          : 0.48 + Math.min(speed / 38, 0.82);

    const horizFwd = Math.hypot(_forward.x, _forward.z);
    const currentPitchDeg =
      horizFwd > 1e-5
        ? -THREE.MathUtils.radToDeg(Math.atan2(_forward.y, horizFwd))
        : 0;

    const pitchLimit =
      onTakeoffRoll && !pitchingUp && speed > rotateSpeed * 0.85
        ? Math.max(0.25, 1 - (speed - rotateSpeed * 0.85) / (rotateSpeed * 0.55))
        : 1;
    const flareBoost = inRoundout ? 1.75 : 1;
    const maxPitchUp = inRoundout
      ? -THREE.MathUtils.lerp(5, 13, 1 - THREE.MathUtils.clamp(agl / 14, 0, 1))
      : -32;
    let flarePitchLimit = 1;
    if (currentPitchDeg < maxPitchUp) flarePitchLimit = 0.35;
    else if (inRoundout && currentPitchDeg < -7) flarePitchLimit = 0.75;
    else if (inRoundout && currentPitchDeg < -3) flarePitchLimit = 0.92;

    let pitchRate = 0;
    if (!onTaxi) {
      pitchRate =
        -controls.elevator *
        params.pitchAuthority *
        controlScale *
        pitchLimit *
        flareBoost *
        flarePitchLimit;
    }

    const bank = bankRadians(state.quaternion);
    const rollDamp = Math.max(0.4, 1 - Math.abs(bank) / 1.0);
    const rollRate = onGround
      ? 0
      : controls.aileron * params.rollAuthority * controlScale * rollDamp;
    const yawRate = controls.rudder * params.yawAuthority * controlScale;

    applyWorldPitch(state, pitchRate, dt);
    _bodyZ.set(0, 0, 1);
    applyBodyRate(state, _bodyZ, rollRate, dt);
    _bodyY.set(0, 1, 0);
    applyBodyRate(state, _bodyY, yawRate, dt);
    if (onTaxi) {
      clampPitchQuaternion(state, -2, 2);
    } else {
      clampPitchQuaternion(state, maxPitchUp, 22);
    }

    // Banked turn: coordinated yaw from bank angle (works even after releasing aileron)
    if (!onGround && agl > 3 && speed > 10 && Math.abs(bank) > 0.06) {
      const coordYaw = THREE.MathUtils.clamp(
        (9.80665 * Math.tan(THREE.MathUtils.clamp(bank, -0.78, 0.78))) / Math.max(speed, 12),
        -0.55,
        0.55,
      );
      applyWorldYaw(state, coordYaw, dt, true);
    } else if (onGround && speed > 1.5 && Math.abs(controls.aileron) > 0.02) {
      const steer = controls.aileron * params.rollAuthority * 0.32 * controlScale;
      applyWorldYaw(state, steer, dt, true);
    }

    // Rudder / residual sideslip: pull flight path toward nose
    if (!onGround && speed > 6) {
      _forward.set(0, 0, -1).applyQuaternion(state.quaternion);
      let alignRate = 1.8 + Math.abs(bank) * 2.2;
      if (Math.abs(controls.rudder) > 0.05) alignRate += 4.0;
      alignHorizontalVelocity(state, _forward, alignRate, dt);
    }

    state.quaternion.normalize();

    state.position.addScaledVector(state.velocity, dt);

    const groundY2 = groundHeightAt(state.position);
    if (this.groundYFiltered !== null) {
      const delta2 = groundY2 - this.groundYFiltered;
      const aglEst = state.position.y - this.groundYFiltered - params.gearOffsetM;
      const onGroundLate = aglEst < 0.35;
      if (
        Math.abs(delta2) > 45 && (aglEst < 150 || Math.abs(delta2) > 120) ||
        (onGroundLate && delta2 > 8)
      ) {
        this.groundYFiltered = groundY2;
      } else {
        const postSpeed = state.velocity.length();
        const slew = onGroundLate && postSpeed < 10
          ? Math.max(0.8 * dt, 0.02)
          : Math.max(18 * dt, 0.35);
        this.groundYFiltered += THREE.MathUtils.clamp(delta2, -slew, slew);
      }
    }
    const minY = this.groundYFiltered! + params.gearOffsetM;
    if (state.position.y < minY) {
      state.position.y = minY;
      if (state.velocity.y < 0) {
        if (inRoundout && pitchingUp) {
          state.velocity.y = THREE.MathUtils.lerp(state.velocity.y, -0.3, 5 * dt);
        } else {
          state.velocity.y = 0;
        }
      }
    }

    const grounded = state.position.y <= minY + 0.15;
    const aglFinal = state.position.y - this.groundYFiltered! - params.gearOffsetM;
    const onWheelsFinal = weightOnWheels(aglFinal, state.velocity.y) || grounded;
    if (onWheelsFinal) {
      const latRoll = Math.pow(0.985, dt * 60);
      _fwdGround.copy(_forward);
      _fwdGround.y = 0;
      if (_fwdGround.lengthSq() > 0.001) {
        _fwdGround.normalize();
        const vFwd = state.velocity.dot(_fwdGround);
        const vLat = state.velocity
          .clone()
          .sub(_fwdGround.clone().multiplyScalar(vFwd));
        state.velocity.sub(vLat.multiplyScalar(1 - latRoll));
        if (controls.brakes > 0) {
          if (brakeHold) {
            if (Math.abs(vFwd) > 0.01) {
              state.velocity.sub(_fwdGround.multiplyScalar(vFwd));
            }
          } else {
            const speedAbs = Math.abs(vFwd);
            const rollout = THREE.MathUtils.clamp(speedAbs / 50, 0, 1);
            const massBoost =
              1 + Math.log10(Math.max(params.massKg, 800) / 1000) * 0.42;
            const brakeDecel =
              (1.5 + 3.4 * rollout) * controls.brakes * massBoost;
            const lowSpeedScale = THREE.MathUtils.clamp(speedAbs / 6, 0.35, 1);
            if (speedAbs > 0.05) {
              const sign = Math.sign(vFwd) || 1;
              const dV = Math.min(speedAbs, brakeDecel * lowSpeedScale * dt);
              state.velocity.sub(_fwdGround.multiplyScalar(sign * dV));
            }
          }
        } else if (controls.throttle <= 0.12 && speed < 1.8) {
          const idleDamp = Math.pow(0.88, dt * 60);
          state.velocity.multiplyScalar(idleDamp);
        }
      }
    }

    this.airspeed = speed;
    this.indicatedAirspeed = iasMs;
    this.altitudeM = state.position.y;
    this.aglM = state.position.y - this.groundYFiltered! - params.gearOffsetM;
    this.verticalSpeed = state.velocity.y;

    _euler.setFromQuaternion(state.quaternion, 'YXZ');
    _forward.set(0, 0, -1).applyQuaternion(state.quaternion);
    const horiz = Math.hypot(_forward.x, _forward.z);
    this.pitchDeg =
      horiz > 1e-5
        ? -THREE.MathUtils.radToDeg(Math.atan2(_forward.y, horiz))
        : THREE.MathUtils.radToDeg(_euler.x);
    this.rollDeg = THREE.MathUtils.radToDeg(bankRadians(state.quaternion));
    this.headingDeg =
      (THREE.MathUtils.radToDeg(Math.atan2(_forward.x, -_forward.z)) + 360) % 360;

    return onWheelsFinal;
  }
}

function interpolateAero(
  table: AeroPoint[],
  alphaDeg: number,
  flaps: number,
  flapsCL: number,
): { CL: number; CD: number } {
  const sorted = [...table].sort((a, b) => a.alphaDeg - b.alphaDeg);
  let CL = sorted[0].CL;
  let CD = sorted[0].CD;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (alphaDeg >= a.alphaDeg && alphaDeg <= b.alphaDeg) {
      const t = (alphaDeg - a.alphaDeg) / (b.alphaDeg - a.alphaDeg);
      CL = THREE.MathUtils.lerp(a.CL, b.CL, t);
      CD = THREE.MathUtils.lerp(a.CD, b.CD, t);
      break;
    }
    if (alphaDeg > sorted[sorted.length - 1].alphaDeg) {
      const last = sorted[sorted.length - 1];
      CL = last.CL;
      CD = last.CD;
    }
  }
  CL += flaps * flapsCL;
  return { CL, CD };
}

function isaRho(altM: number): number {
  const T0 = 288.15;
  const rho0 = 1.225;
  const L = 0.0065;
  const h = Math.max(0, altM);
  const T = T0 - L * h;
  if (T <= 0) return 0.3;
  return rho0 * Math.pow(T / T0, 4.256);
}

export { MS_TO_KTS, ROTATE_SPEED_MS, STALL_SPEED_MS };
