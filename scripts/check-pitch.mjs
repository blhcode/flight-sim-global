#!/usr/bin/env node
/** Pitch up/down must not yaw the aircraft without aileron input. */
import * as THREE from 'three';
import { SimpleFlightModel } from '../src/physics/SimpleFlightModel.ts';
import { cessna172Definition as d } from '../src/aircraft/definitions/cessna172.ts';

const ground = () => 0;
const params = {
  massKg: d.massKg,
  wingAreaM2: d.wingAreaM2,
  maxThrustN: d.maxThrustN,
  gearOffsetM: d.gearOffsetM,
  pitchAuthority: 1.05,
  rollAuthority: 1.55,
  yawAuthority: 2,
  stallAlphaDeg: d.stallAlphaDeg,
  flapsCL: d.flapsCL,
  aeroTables: d.aeroTables,
};

const m = new SimpleFlightModel(new THREE.Vector3(0, 400, 0), 90);
const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(m.state.quaternion);
m.state.velocity.copy(fwd.multiplyScalar(55));

const ctrl = {
  throttle: 0.5,
  elevator: -1,
  aileron: 0,
  rudder: 0,
  flaps: 0,
  brakes: 0,
};

const headingBefore = (() => {
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(m.state.quaternion);
  f.y = 0;
  f.normalize();
  return Math.atan2(f.x, -f.z);
})();
for (let i = 0; i < 50; i++) m.step(1 / 120, ctrl, params, ground);
const headingAfter = (() => {
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(m.state.quaternion);
  f.y = 0;
  f.normalize();
  return Math.atan2(f.x, -f.z);
})();
let dHeading = Math.abs(headingAfter - headingBefore);
if (dHeading > Math.PI) dHeading = 2 * Math.PI - dHeading;
dHeading = THREE.MathUtils.radToDeg(dHeading);

const pass = dHeading < 5 && m.pitchDeg < -8;

console.log(
  JSON.stringify({
    pass,
    dHeading: Math.round(dHeading * 10) / 10,
    pitchDeg: Math.round(m.pitchDeg * 10) / 10,
    rollDeg: Math.round(m.rollDeg * 10) / 10,
  }),
);
process.exit(pass ? 0 : 1);
