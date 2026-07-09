#!/usr/bin/env node
/** Brakes must slow all aircraft types on rollout (idle throttle). */
import { chromium } from 'playwright';

const URL = process.env.FSG_URL ?? 'http://127.0.0.1:5173/';
const AIRCRAFT = ['cessna172', 'twinOtter', 'dash8400', 'b737', 'b747'];

const browser = await chromium.launch({
  headless: true,
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

const results = [];

for (const id of AIRCRAFT) {
  await page.selectOption('#spawn-aircraft', id);
  if (id === 'twinOtter') {
    await page.selectOption('#spawn-weight', 'standard');
  }
  await page.click('#spawn-go');
  await page.waitForFunction(() => window.__fsg?.isOnRunway?.(), { timeout: 120000 });
  await page.waitForTimeout(1200);

  const result = await page.evaluate((aircraftId) => {
    const g = window.__fsg;
    g.setControls({ throttle: 1, elevator: 0, aileron: 0, rudder: 0, brakes: 0 });
    const accelSec = aircraftId === 'b747' ? 28 : aircraftId === 'b737' ? 18 : 14;
    g.simulatePhysics(accelSec);
    const beforeBrake = g.getTelemetry().airspeedKts;
    g.setControls({ throttle: 0, elevator: 0, aileron: 0, rudder: 0, brakes: 1 });
    g.simulatePhysics(aircraftId === 'b747' ? 6 : 3);
    const afterBrake = g.getTelemetry().airspeedKts;
    const delta = beforeBrake - afterBrake;
    const pass =
      beforeBrake > 12 &&
      delta > (aircraftId === 'b747' ? 8 : 4) &&
      afterBrake < beforeBrake * 0.92;
    return { beforeBrake, afterBrake, delta, pass, onGround: g.getTelemetry().onGround };
  }, id);

  results.push({ id, ...result });
  await page.reload({ waitUntil: 'domcontentloaded' });
}

await browser.close();

const pass = results.every((r) => r.pass);
console.log(JSON.stringify({ pass, results }, null, 2));
process.exit(pass ? 0 : 1);
