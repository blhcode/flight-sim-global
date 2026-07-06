#!/usr/bin/env node
/** Approach flare: W should raise nose, soften sink, and land. */
import * as THREE from 'three';
import { SimpleFlightModel } from '../src/physics/SimpleFlightModel.ts';
import { cessna172Definition as d } from '../src/aircraft/definitions/cessna172.ts';

const ground = () => 6.4008;
const params = {
  massKg: d.massKg,
  wingAreaM2: d.wingAreaM2,
  maxThrustN: d.maxThrustN,
  gearOffsetM: 0.8,
  pitchAuthority: 1.05,
  rollAuthority: 1.55,
  yawAuthority: 2,
  stallAlphaDeg: d.stallAlphaDeg,
  flapsCL: d.flapsCL,
  aeroTables: d.aeroTables,
};

function rampElevator(ctrl, m, dt) {
  const kts = m.indicatedAirspeed * 1.944;
  const onFinal = m.aglM < 20 && kts > 18 && kts < 85;
  const rate = onFinal ? 2.6 * dt : 0.34 * dt;
  ctrl.elevator = Math.max(-1, ctrl.elevator - rate);
  if (onFinal && ctrl.elevator > -0.3) {
    ctrl.elevator = Math.min(ctrl.elevator, -0.3);
  }
}

function simulateLanding(throttle, flaps, startKts, startAglFt) {
  const m = new SimpleFlightModel(new THREE.Vector3(0, startAglFt / 3.28, 0), 160);
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(m.state.quaternion);
  m.state.velocity
    .copy(fwd.multiplyScalar(startKts / 1.944))
    .add(new THREE.Vector3(0, -1.5, 0));
  const ctrl = { throttle, elevator: 0, aileron: 0, rudder: 0, flaps, brakes: 0 };
  let maxAglFt = startAglFt;
  let pitchBefore = m.pitchDeg;
  let vsBefore = m.verticalSpeed * 196.85;
  let touched = false;

  for (let i = 0; i < 900; i++) {
    const dt = 1 / 120;
    if (i === 48) {
      pitchBefore = m.pitchDeg;
      vsBefore = m.verticalSpeed * 196.85;
    }
    rampElevator(ctrl, m, dt);
    m.step(dt, ctrl, params, ground);
    maxAglFt = Math.max(maxAglFt, m.aglM * 3.28);
    if (m.aglM < 0.25) touched = true;
    if (touched && m.aglM < 0.1 && m.indicatedAirspeed * 1.944 < 25) break;
  }

  return {
    touched,
    maxAglFt: Math.round(maxAglFt),
    pitchAfter: Math.round(m.pitchDeg),
    pitchDelta: Math.round((m.pitchDeg - pitchBefore) * 10) / 10,
    kts: Math.round(m.indicatedAirspeed * 1.944),
    vsAfter: Math.round(m.verticalSpeed * 196.85),
    vsBefore: Math.round(vsBefore),
    aglFt: Math.round(m.aglM * 3.28),
  };
}

const idleFlaps = simulateLanding(0, 1, 60, 35);
const partialThr = simulateLanding(0.25, 1, 62, 35);

const pass =
  idleFlaps.touched &&
  partialThr.touched &&
  idleFlaps.maxAglFt <= 40 &&
  idleFlaps.vsAfter > idleFlaps.vsBefore - 80 &&
  idleFlaps.aglFt <= 2;

console.log(JSON.stringify({ pass, idleFlaps, partialThr }));
process.exit(pass ? 0 : 1);
