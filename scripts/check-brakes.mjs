#!/usr/bin/env node
/** Brakes must decelerate gradually, not stop the plane in one frame. */
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

const result = await page.evaluate(() => {
  const g = window.__fsg;
  g.setControls({ throttle: 1, elevator: 0, aileron: 0, rudder: 0, brakes: 0 });
  g.simulatePhysics(14);
  const beforeBrake = g.getTelemetry().airspeedKts;

  g.setControls({ throttle: 0, elevator: 0, aileron: 0, rudder: 0, brakes: 1 });
  g.simulatePhysics(0.12);
  const afterShort = g.getTelemetry().airspeedKts;

  g.simulatePhysics(1.5);
  const afterLong = g.getTelemetry().airspeedKts;

  return { beforeBrake, afterShort, afterLong, onGround: g.getTelemetry().onGround };
});

await browser.close();

const pass =
  result.beforeBrake > 35 &&
  result.afterShort > result.beforeBrake * 0.88 &&
  result.afterLong < result.beforeBrake - 4 &&
  result.afterLong > 15 &&
  result.onGround;

console.log(JSON.stringify({ pass, ...result }));
process.exit(pass ? 0 : 1);
