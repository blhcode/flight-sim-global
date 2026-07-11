#!/usr/bin/env node
/** Runway lineup helpers: destination point + approach end selection. */
import {
  bearingDeg,
  destinationPoint,
} from '../src/ui/NavigationMap.ts';

function headingErrorDeg(fromDeg, toDeg) {
  let err = toDeg - fromDeg;
  while (err > 180) err -= 360;
  while (err < -180) err += 360;
  return err;
}

function approachHeadingDeg(rwyHdg, inboundDeg) {
  const a = ((rwyHdg % 360) + 360) % 360;
  const b = (a + 180) % 360;
  return Math.abs(headingErrorDeg(inboundDeg, a)) <=
    Math.abs(headingErrorDeg(inboundDeg, b))
    ? a
    : b;
}

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

// ~10 km north of equator origin
const north = destinationPoint(0, 0, 0, 10);
assert(Math.abs(north.lat - 0.0899) < 0.002, `north lat ${north.lat}`);
assert(Math.abs(north.lon) < 0.001, `north lon ${north.lon}`);

// YSSY primary 16R/34L @ 168° — approach from the north should prefer 16R (168)
assert(approachHeadingDeg(168, 170) === 168, 'prefer 16');
assert(approachHeadingDeg(168, 350) === (168 + 180) % 360, 'prefer 34');

// Bearing Sydney → roughly south should be ~180-ish from a point north of YSSY
const fromN = destinationPoint(-33.946, 151.177, 0, 30);
const inbound = bearingDeg(fromN.lat, fromN.lon, -33.946, 151.177);
assert(approachHeadingDeg(168, inbound) === 168, `inbound ${inbound} → 16`);

console.log(JSON.stringify({ pass: true, inbound: Math.round(inbound) }));
process.exit(0);
