#!/usr/bin/env node
/** W/S must not pitch the aircraft during taxi or idle on the ground. */
import { chromium } from 'playwright';

const URL = process.env.FSG_URL ?? 'http://127.0.0.1:5173/';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.click('#spawn-go');
await page.waitForFunction(() => window.__fsg?.isOnRunway?.(), { timeout: 120000 });
await page.waitForTimeout(1000);

const idleBefore = await page.evaluate(() => {
  const t = window.__fsg.getTelemetry();
  return { pitch: t.pitchDeg, kts: t.airspeedKts, onGround: t.onGround };
});

await page.keyboard.down('KeyW');
await page.waitForTimeout(1200);
await page.keyboard.up('KeyW');

const idleAfterW = await page.evaluate(() => {
  const t = window.__fsg.getTelemetry();
  return { pitch: Math.round(t.pitchDeg), kts: Math.round(t.airspeedKts), onGround: t.onGround };
});

await page.keyboard.down('KeyS');
await page.waitForTimeout(1200);
await page.keyboard.up('KeyS');

const idleAfterS = await page.evaluate(() => {
  const t = window.__fsg.getTelemetry();
  return { pitch: Math.round(t.pitchDeg), kts: Math.round(t.airspeedKts) };
});

await page.evaluate(() => {
  window.__fsg.setControls({ throttle: 0.5, elevator: 0, aileron: 0, rudder: 0, brakes: 0 });
  window.__fsg.simulatePhysics(4);
});
const taxiBefore = await page.evaluate(() => window.__fsg.getTelemetry().pitchDeg);

await page.keyboard.down('KeyW');
await page.waitForTimeout(1200);
await page.keyboard.up('KeyW');

const taxiAfterW = await page.evaluate(() => ({
  pitch: Math.round(window.__fsg.getTelemetry().pitchDeg),
  kts: Math.round(window.__fsg.getTelemetry().airspeedKts),
  onGround: window.__fsg.getTelemetry().onGround,
}));

await browser.close();

const pass =
  idleBefore.onGround &&
  Math.abs(idleAfterW.pitch - idleBefore.pitch) < 4 &&
  Math.abs(idleAfterS.pitch - idleBefore.pitch) < 4 &&
  taxiAfterW.onGround &&
  Math.abs(taxiAfterW.pitch - taxiBefore) < 5;

console.log(JSON.stringify({ pass, idleBefore, idleAfterW, idleAfterS, taxiBefore, taxiAfterW }));
process.exit(pass ? 0 : 1);
