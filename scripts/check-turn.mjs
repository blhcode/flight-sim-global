#!/usr/bin/env node
/** Bank and rudder must change flight path, not just nose heading. */
import * as THREE from 'three';
import { SimpleFlightModel } from '../src/physics/SimpleFlightModel.ts';
import { cessna172Definition as d } from '../src/aircraft/definitions/cessna172.ts';

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
const ground = () => 0;

function velHeading(v) {
  const h = v.clone();
  h.y = 0;
  h.normalize();
  return THREE.MathUtils.radToDeg(Math.atan2(h.x, -h.z));
}

function run(ctrl, secs) {
  const m = new SimpleFlightModel(new THREE.Vector3(0, 500, 0), 0);
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(m.state.quaternion);
  m.state.velocity.copy(fwd.multiplyScalar(45));
  const h0 = m.headingDeg;
  const vh0 = velHeading(m.state.velocity);
  for (let i = 0; i < secs * 120; i++) m.step(1 / 120, ctrl, params, ground);
  const h1 = m.headingDeg;
  const vh1 = velHeading(m.state.velocity);
  const norm = (a, b) => {
    let d = b - a;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    return d;
  };
  const slip = (() => {
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(m.state.quaternion);
    f.y = 0;
    f.normalize();
    const v = m.state.velocity.clone();
    v.y = 0;
    v.normalize();
    return Math.abs(
      THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(f.dot(v), -1, 1))),
    );
  })();
  return {
    headingDelta: Math.round(norm(h0, h1)),
    velHeadingDelta: Math.round(norm(vh0, vh1)),
    slipDeg: Math.round(slip),
    bank: Math.round(m.rollDeg),
  };
}

const bank = run(
  { throttle: 0.7, elevator: 0, aileron: 0.75, rudder: 0, flaps: 0, brakes: 0 },
  3,
);
const rudder = run(
  { throttle: 0.7, elevator: 0, aileron: 0, rudder: 0.8, flaps: 0, brakes: 0 },
  3,
);

const pass =
  Math.abs(bank.velHeadingDelta) > 12 &&
  Math.abs(bank.headingDelta) > 10 &&
  bank.slipDeg < 15 &&
  Math.abs(rudder.velHeadingDelta) > 8 &&
  rudder.slipDeg < 20;

console.log(JSON.stringify({ pass, bank, rudder }));
process.exit(pass ? 0 : 1);
