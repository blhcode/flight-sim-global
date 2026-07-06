#!/usr/bin/env node
import { chromium } from 'playwright';

const URL = process.env.FSG_URL ?? 'http://127.0.0.1:5173/';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.click('#spawn-go');
await page.waitForFunction(() => window.__fsg?.isOnRunway?.(), { timeout: 120000 });

const trace = await page.evaluate(() => {
  const g = window.__fsg;
  const log = [];
  const snap = (label) => {
    const t = g.getTelemetry?.();
    log.push({
      label,
      agl: Math.round(t?.altitudeFt ?? 0),
      kts: Math.round(t?.airspeedKts ?? 0),
      pitch: Math.round(t?.pitchDeg ?? 0),
      elev: Math.round((g.aircraft?.controls?.elevator ?? 0) * 100) / 100,
      onGnd: t?.onGround,
      y: Math.round((g.aircraft?.body?.state.position.y ?? 0) * 10) / 10,
    });
  };
  snap('spawn');
  g.setControls?.({ throttle: 1, elevator: 0, aileron: 0, rudder: 0, brakes: 0 });
  g.simulatePhysics?.(14);
  snap('roll');
  g.setControls?.({ throttle: 0.9, elevator: -0.8, aileron: 0, rudder: 0, brakes: 0 });
  g.simulatePhysics?.(8);
  snap('rotate');
  g.setControls?.({ throttle: 0.75, elevator: 0, aileron: 0, rudder: 0, brakes: 0 });
  g.simulatePhysics?.(15);
  snap('climb');
  g.aircraft && (g.aircraft.flapsDeployed = true);
  g.setControls?.({ throttle: 0.12, elevator: 0, aileron: 0, rudder: 0, brakes: 0 });
  g.simulatePhysics?.(25);
  snap('approach');
  g.setControls?.({ throttle: 0.08, elevator: -1, aileron: 0, rudder: 0, brakes: 0 });
  g.simulatePhysics?.(3);
  snap('flare');
  return log;
});

await browser.close();
console.log(JSON.stringify(trace, null, 2));
