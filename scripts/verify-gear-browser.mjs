#!/usr/bin/env node
/** Browser repro: gear toggle and placement per aircraft. */
import { chromium } from 'playwright';

const URL = process.env.FSG_URL ?? 'http://127.0.0.1:5173/';
const AIRCRAFT = ['b737', 'dash8400', 'b747', 'twinOtter'];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });

const results = [];
for (const id of AIRCRAFT) {
  await page.selectOption('#spawn-aircraft', id);
  await page.fill('#spawn-icao', 'YSSY');
  await page.click('#spawn-go');
  await page.waitForFunction(() => window.__fsg?.getModelDebug?.() != null, { timeout: 180000 });

  const down = await page.evaluate(() => window.__fsg.getModelDebug());
  await page.evaluate(() => {
    window.__fsg.aircraft.gearDown = false;
    window.__fsg.aircraft.controls.gearDown = false;
  });
  await page.waitForTimeout(100);
  const up = await page.evaluate(() => window.__fsg.getModelDebug());

  results.push({
    aircraft: id,
    gearDown: down?.gear,
    gearUp: up?.gear,
    forwardOk: down && Math.abs(down.forward.z + 1) < 0.05,
    pass:
      (down?.gear?.wheels ?? 0) >= 3 &&
      (down?.gear?.visibleWheels ?? 0) === down?.gear?.wheels &&
      (up?.gear?.visibleWheels ?? 0) === 0,
  });
}

console.log(JSON.stringify(results, null, 2));
await browser.close();
process.exit(results.every((r) => r.pass && r.forwardOk) ? 0 : 1);
