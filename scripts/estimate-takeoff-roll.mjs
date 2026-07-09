#!/usr/bin/env node
/** Rough ground-roll distance to rotation speed (constant accel estimate). */
const aircraft = [
  { id: 'dash8400', mass: 18000, thrust: 110000, rotate: 34 },
  { id: 'b737', mass: 70000, thrust: 240000, rotate: 40 },
  { id: 'b747', mass: 200000, thrust: 1120000, rotate: 58 },
];

for (const ac of aircraft) {
  const accel = ac.thrust / ac.mass;
  const dist = (ac.rotate * ac.rotate) / (2 * accel);
  console.log(`${ac.id}: Vr=${ac.rotate}m/s (~${Math.round(ac.rotate * 1.944)}kt) roll≈${Math.round(dist)}m`);
}
