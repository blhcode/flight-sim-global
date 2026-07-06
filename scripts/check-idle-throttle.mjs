#!/usr/bin/env node
/** Zero / low throttle must not sustain ~60 kt on the ground or in level glide. */
import * as THREE from 'three';
import { chromium } from 'playwright';
import { SimpleFlightModel } from '../src/physics/SimpleFlightModel.ts';
import { cessna172Definition as d } from '../src/aircraft/definitions/cessna172.ts';

const URL = process.env.FSG_URL ?? 'http://127.0.0.1:5173/';
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

function simulateGlideKts() {
  const m = new SimpleFlightModel(new THREE.Vector3(0, 400, 0), 160);
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(m.state.quaternion);
  m.state.velocity.copy(fwd.multiplyScalar(55 / 1.944));
  const ctrl = { throttle: 0, elevator: 0, aileron: 0, rudder: 0, flaps: 0, brakes: 0 };
  for (let i = 0; i < 720; i++) {
    m.step(1 / 120, ctrl, params, ground);
  }
  return Math.round(m.indicatedAirspeed * 1.944);
}

const browser = await chromium.launch({
  headless: true,
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.click('#spawn-go');
await page.waitForFunction(() => window.__fsg?.isOnRunway?.(), { timeout: 120000 });
await page.waitForTimeout(1500);

const result = await page.evaluate(() => {
  const g = window.__fsg;

  g.setControls({ throttle: 1, elevator: 0, aileron: 0, rudder: 0, brakes: 0 });
  g.simulatePhysics(12);
  const peakKts = g.getTelemetry().airspeedKts;

  g.setControls({ throttle: 0, elevator: 0, aileron: 0, rudder: 0, brakes: 0 });
  g.simulatePhysics(10);
  const coastGround = g.getTelemetry();

  g.setControls({ throttle: 0.12, elevator: 0, aileron: 0, rudder: 0, brakes: 0 });
  g.simulatePhysics(10);
  const lowThrottleGround = g.getTelemetry();

  return {
    peakKts,
    coastGround: {
      kts: coastGround.airspeedKts,
      onGround: coastGround.onGround,
    },
    lowThrottleGround: {
      kts: lowThrottleGround.airspeedKts,
      onGround: lowThrottleGround.onGround,
    },
  };
});

await browser.close();

const glideKts = simulateGlideKts();

const pass =
  result.peakKts > 70 &&
  result.coastGround.onGround &&
  result.coastGround.kts < 18 &&
  result.lowThrottleGround.onGround &&
  result.lowThrottleGround.kts < 15 &&
  glideKts >= 30 &&
  glideKts < 54;

console.log(JSON.stringify({ pass, glideKts, ...result }));
process.exit(pass ? 0 : 1);
