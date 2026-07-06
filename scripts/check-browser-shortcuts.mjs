#!/usr/bin/env node
/** While flying: arrow keys control throttle without closing the tab. */
import { chromium } from 'playwright';

const URL = process.env.FSG_URL ?? 'http://127.0.0.1:5173/';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.click('#spawn-go');
await page.waitForFunction(() => window.__fsg?.isOnRunway?.(), { timeout: 120000 });
await page.click('.game-canvas');

await page.evaluate(() => {
  const g = window.__fsg;
  g.setControls({ throttle: 1, elevator: 0, aileron: 0, rudder: 0, brakes: 0 });
  g.simulatePhysics(14);
});

const throttleBefore = await page.evaluate(() => window.__fsg.getTelemetry().throttle);

await page.keyboard.down('ArrowDown');
await page.keyboard.down('KeyW');
await page.waitForTimeout(800);

const afterCombo = await page.evaluate(() => ({
  throttle: window.__fsg.getTelemetry().throttle,
  elevator: window.__fsg.aircraft.controls.elevator,
}));

await page.keyboard.up('KeyW');
await page.keyboard.up('ArrowDown');
await browser.close();

const pass =
  throttleBefore > afterCombo.throttle + 0.02 &&
  afterCombo.elevator < -0.05;

console.log(JSON.stringify({ pass, throttleBefore, afterCombo }));
process.exit(pass ? 0 : 1);
