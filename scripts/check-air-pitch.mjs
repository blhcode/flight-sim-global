#!/usr/bin/env node
/** W/S must work in the air below taxi speed; still locked on the ground. */
import * as THREE from 'three';
import { SimpleFlightModel } from '../src/physics/SimpleFlightModel.ts';
import { cessna172Definition as d } from '../src/aircraft/definitions/cessna172.ts';
import { pitchLockedOnGround } from '../src/physics/groundState.ts';

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

function runSlowAirPitch() {
  const m = new SimpleFlightModel(new THREE.Vector3(0, 20, 0), 160);
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(m.state.quaternion);
  m.state.velocity.copy(fwd.multiplyScalar(28 / 1.944));
  const ctrl = { throttle: 0.12, elevator: 0, aileron: 0, rudder: 0, flaps: 0, brakes: 0 };

  for (let i = 0; i < 90; i++) m.step(1 / 120, ctrl, params, ground);

  const kts = m.indicatedAirspeed * 1.944;
  const locked = pitchLockedOnGround(m.aglM, m.verticalSpeed, kts);
  const pitchBefore = m.pitchDeg;

  ctrl.elevator = -0.85;
  for (let i = 0; i < 48; i++) m.step(1 / 120, ctrl, params, ground);

  return {
    kts: Math.round(kts),
    aglFt: Math.round(m.aglM * 3.28),
    locked,
    pitchBefore: Math.round(pitchBefore),
    pitchAfter: Math.round(m.pitchDeg),
    elev: Math.round(ctrl.elevator * 100) / 100,
  };
}

function runTaxiPitchLock() {
  const m = new SimpleFlightModel(new THREE.Vector3(0, 6.4008 + 0.8, 0), 160);
  const ctrl = { throttle: 0.15, elevator: 0, aileron: 0, rudder: 0, flaps: 0, brakes: 0 };
  for (let i = 0; i < 60; i++) m.step(1 / 120, ctrl, params, ground);
  const kts = m.indicatedAirspeed * 1.944;
  const locked = pitchLockedOnGround(m.aglM, m.verticalSpeed, kts);
  const pitchBefore = m.pitchDeg;
  ctrl.elevator = -0.85;
  for (let i = 0; i < 48; i++) m.step(1 / 120, ctrl, params, ground);
  return {
    kts: Math.round(kts),
    locked,
    pitchDelta: Math.round((m.pitchDeg - pitchBefore) * 10) / 10,
  };
}

const slowAir = runSlowAirPitch();
const taxi = runTaxiPitchLock();

const pass =
  slowAir.kts < 38 &&
  slowAir.kts > 12 &&
  slowAir.aglFt > 15 &&
  !slowAir.locked &&
  slowAir.pitchAfter < slowAir.pitchBefore - 3 &&
  taxi.locked &&
  taxi.kts < 38 &&
  Math.abs(taxi.pitchDelta) < 2;

console.log(JSON.stringify({ pass, slowAir, taxi }));
process.exit(pass ? 0 : 1);
