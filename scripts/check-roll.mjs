#!/usr/bin/env node
/** A/D roll direction (unit) + ground steering (browser). */
import { chromium } from 'playwright';
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
const groundAt = () => 0;

function rollDelta(aileron) {
  const m = new SimpleFlightModel(new THREE.Vector3(0, 500, 0), 0);
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(m.state.quaternion);
  m.state.velocity.copy(fwd.multiplyScalar(50));
  const ctrl = { throttle: 0.5, elevator: 0, aileron, rudder: 0, flaps: 0, brakes: 0 };
  for (let i = 0; i < 90; i++) m.step(1 / 120, ctrl, params, groundAt);
  return m.rollDeg;
}

const rollA = rollDelta(1);
const rollD = rollDelta(-1);
const unitPass = rollA > 8 && rollD < -8;

const URL = process.env.FSG_URL ?? 'http://127.0.0.1:5173/';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.click('#spawn-go');
await page.waitForFunction(() => window.__fsg?.isOnRunway?.(), { timeout: 120000 });
await page.waitForTimeout(1500);

const groundSteer = await page.evaluate(() => {
  const g = window.__fsg;
  if (!g) return { error: 'no hook' };
  g.setControls?.({ throttle: 0.5, elevator: 0, aileron: 0, rudder: 0, brakes: 0 });
  g.simulatePhysics?.(3);
  const before = g.getBodyAttitude?.();
  g.setControls?.({ throttle: 0.5, elevator: 0, aileron: 1, rudder: 0, brakes: 0 });
  g.simulatePhysics?.(2);
  const after = g.getBodyAttitude?.();
  let headingA = (after?.heading ?? 0) - (before?.heading ?? 0);
  if (headingA > 180) headingA -= 360;
  if (headingA < -180) headingA += 360;
  return { headingA: Math.round(headingA) };
});
await browser.close();

const pass = unitPass && groundSteer && !groundSteer.error && groundSteer.headingA < -5;
console.log(JSON.stringify({ pass, unit: { rollA: Math.round(rollA), rollD: Math.round(rollD) }, ground: groundSteer }));
process.exit(pass ? 0 : 1);
