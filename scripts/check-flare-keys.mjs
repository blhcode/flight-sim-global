#!/usr/bin/env node
/** Real W key flare — must raise nose on short final. */
import { chromium } from 'playwright';

const URL = process.env.FSG_URL ?? 'http://127.0.0.1:5173/';

const browser = await chromium.launch({
  headless: true,
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.click('#spawn-go');
await page.waitForFunction(() => window.__fsg?.isOnRunway?.(), { timeout: 120000 });
await page.waitForTimeout(1500);

await page.evaluate(() => {
  const g = window.__fsg;
  g.setControls({ throttle: 1, elevator: 0, aileron: 0, rudder: 0, brakes: 0 });
  g.simulatePhysics(14);
  g.setControls({ throttle: 0.9, elevator: -0.15, aileron: 0, rudder: 0, brakes: 0 });
  g.simulatePhysics(40);
  g.aircraft.flapsDeployed = true;
  g.setControls({ throttle: 0.42, elevator: 0.03, aileron: 0, rudder: 0, brakes: 0 });
  for (let i = 0; i < 60; i++) {
    g.simulatePhysics(0.25);
    const t = g.getTelemetry();
    if (
      !t.onGround &&
      t.altitudeFt > 6 &&
      t.altitudeFt < 45 &&
      t.airspeedKts > 42
    ) {
      break;
    }
  }
});

const before = await page.evaluate(() => {
  const t = window.__fsg.getTelemetry();
  return {
    aglFt: Math.round(t.altitudeFt),
    kts: Math.round(t.airspeedKts),
    pitch: Math.round(t.pitchDeg),
    vs: Math.round(t.verticalSpeedFpm),
    onGround: t.onGround,
  };
});

await page.keyboard.down('KeyW');
await page.waitForTimeout(1500);
await page.keyboard.up('KeyW');

const after = await page.evaluate(() => {
  const t = window.__fsg.getTelemetry();
  return {
    aglFt: Math.round(t.altitudeFt),
    kts: Math.round(t.airspeedKts),
    pitch: Math.round(t.pitchDeg),
    elev: Math.round(window.__fsg.aircraft.controls.elevator * 100) / 100,
    vs: Math.round(t.verticalSpeedFpm),
    onGround: t.onGround,
  };
});

await browser.close();

const pass =
  (before.aglFt > 8 || before.kts > 40) &&
  after.pitch < before.pitch - 2 &&
  after.elev < -0.25 &&
  after.vs > before.vs - 500;

console.log(JSON.stringify({ pass, before, after }));
process.exit(pass ? 0 : 1);
