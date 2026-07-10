#!/usr/bin/env node
/** Autopilot banks toward a course and disconnects without a route / on ground / on manual roll. */
import { Autopilot, headingErrorDeg } from '../src/avionics/Autopilot.ts';

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

assert(Math.abs(headingErrorDeg(10, 350) - -20) < 0.01, 'wrap left');
assert(Math.abs(headingErrorDeg(350, 10) - 20) < 0.01, 'wrap right');
assert(Math.abs(headingErrorDeg(0, 90) - 90) < 0.01, 'right 90');

const ap = new Autopilot();
assert(ap.toggle(false, 5) === false, 'refuse without canArm');
assert(ap.isEnabled() === false, 'still off');

assert(ap.toggle(true, 4) === true, 'arm');
assert(ap.isEnabled() === true, 'on');

// Need left turn (course 270, heading 0 → err −90) → positive aileron (roll left)
let out = ap.update({
  enabled: true,
  courseDeg: 270,
  headingDeg: 0,
  rollDeg: 0,
  pitchDeg: 4,
  onGround: false,
  aglM: 200,
  manualRoll: false,
  dt: 1 / 60,
});
assert(out.enabled && out.aileron != null && out.aileron > 0.05, `left turn aileron=${out.aileron}`);

// Need right turn → negative aileron
ap.setEnabled(true, 4);
out = ap.update({
  enabled: true,
  courseDeg: 90,
  headingDeg: 0,
  rollDeg: 0,
  pitchDeg: 4,
  onGround: false,
  aglM: 200,
  manualRoll: false,
  dt: 1 / 60,
});
assert(out.enabled && out.aileron != null && out.aileron < -0.05, `right turn aileron=${out.aileron}`);

// Manual roll disconnects
ap.setEnabled(true, 4);
out = ap.update({
  enabled: true,
  courseDeg: 90,
  headingDeg: 0,
  rollDeg: 0,
  pitchDeg: 4,
  onGround: false,
  aglM: 200,
  manualRoll: true,
  dt: 1 / 60,
});
assert(!out.enabled && out.reason === 'manual', 'manual disconnect');

// No route disconnects
ap.setEnabled(true, 4);
out = ap.update({
  enabled: true,
  courseDeg: null,
  headingDeg: 0,
  rollDeg: 0,
  pitchDeg: 4,
  onGround: false,
  aglM: 200,
  manualRoll: false,
  dt: 1 / 60,
});
assert(!out.enabled && out.reason === 'no-route', 'no-route disconnect');

// Ground disconnects
ap.setEnabled(true, 4);
out = ap.update({
  enabled: true,
  courseDeg: 90,
  headingDeg: 0,
  rollDeg: 0,
  pitchDeg: 4,
  onGround: true,
  aglM: 2,
  manualRoll: false,
  dt: 1 / 60,
});
assert(!out.enabled && out.reason === 'ground', 'ground disconnect');

console.log(JSON.stringify({ pass: true }));
process.exit(0);
