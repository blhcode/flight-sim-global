#!/usr/bin/env node
/** Taxi steering must not pitch the nose; high-speed roll must not scramble attitude. */
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
await page.waitForTimeout(2000);

const result = await page.evaluate(() => {
  const g = window.__fsg;
  if (!g) return null;

  g.setControls?.({ throttle: 1, elevator: 0, aileron: 0, rudder: 0, brakes: 0 });
  g.simulatePhysics?.(12);
  if ((g.getTelemetry?.()?.airspeedKts ?? 0) < 55) {
    return { error: 'slow', kts: g.getTelemetry?.()?.airspeedKts };
  }

  const beforeSteer = g.getBodyAttitude?.();
  g.setControls?.({ throttle: 0.85, elevator: 0, aileron: 1, rudder: 0, brakes: 0 });
  g.simulatePhysics?.(2);
  const afterSteer = g.getBodyAttitude?.();

  g.setControls?.({ throttle: 0.85, elevator: 0, aileron: 0, rudder: 0, brakes: 0 });
  g.simulatePhysics?.(0.5);
  const beforeRoll = g.getBodyAttitude?.();
  g.setControls?.({ throttle: 0.85, elevator: 0, aileron: 1, rudder: 0, brakes: 0 });
  g.simulatePhysics?.(1.5);
  const afterRoll = g.getBodyAttitude?.();

  const dHeading = Math.abs((afterSteer?.heading ?? 0) - (beforeSteer?.heading ?? 0));
  const pitchDuringSteer = Math.abs(
    (afterSteer?.nosePitch ?? 0) - (beforeSteer?.nosePitch ?? 0),
  );
  const pitchDuringFastRoll = Math.abs(
    (afterRoll?.nosePitch ?? 0) - (beforeRoll?.nosePitch ?? 0),
  );
  const bankDuringFastRoll = Math.abs((afterRoll?.bank ?? 0) - (beforeRoll?.bank ?? 0));

  // Airborne: gentle bank should not rocket the plane upward
  g.setControls?.({ throttle: 0.85, elevator: 0, aileron: 0, rudder: 0, brakes: 0 });
  g.simulatePhysics?.(10);
  const climbAlt = g.getTelemetry?.()?.altitudeFt ?? 0;
  const beforeBank = g.getTelemetry?.()?.altitudeFt ?? 0;
  g.setControls?.({ throttle: 0.85, elevator: 0, aileron: 0.75, rudder: 0.02, brakes: 0 });
  g.simulatePhysics?.(3);
  const afterBank = g.getTelemetry?.()?.altitudeFt ?? 0;
  const climbDuringBank = afterBank - beforeBank;

  return {
    dHeading: Math.round(dHeading),
    pitchDuringSteer: Math.round(pitchDuringSteer),
    pitchDuringFastRoll: Math.round(pitchDuringFastRoll),
    bankDuringFastRoll: Math.round(bankDuringFastRoll),
    climbAlt: Math.round(climbAlt),
    climbDuringBank: Math.round(climbDuringBank),
  };
});

await browser.close();

const pass =
  result &&
  !result.error &&
  result.dHeading > 12 &&
  result.pitchDuringSteer < 8 &&
  result.pitchDuringFastRoll < 12 &&
  result.bankDuringFastRoll < 8 &&
  (result.climbAlt < 30 || result.climbDuringBank < 120);

console.log(JSON.stringify({ pass, result }));
process.exit(pass ? 0 : 1);
