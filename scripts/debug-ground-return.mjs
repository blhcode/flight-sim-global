#!/usr/bin/env node
/** Repro: fly away from spawn, return — check ground height drift at airport. */
import { chromium } from 'playwright';

const URL = process.env.FSG_URL ?? 'http://127.0.0.1:5173/';
const FLIGHT_MS = Number(process.env.FSG_FLIGHT_MS ?? 55_000);

async function runCase(page, { label, setup }) {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await setup(page);
  await page.click('#spawn-go');
  await page.waitForFunction(() => window.__fsg?.isFlightReady?.(), { timeout: 180_000 });

  const baseline = await page.evaluate(() => {
    const d = window.__fsg.getSpawnDebug();
    return { ground: d?.ground, spawn: d?.spawn, acY: d?.aircraftY };
  });

  await page.evaluate(() => {
    window.__fsg.setThrottle(1);
    window.__fsg.setControls({ elevator: -0.25, aileron: 0.22, rudder: 0 });
  });

  const samples = [];
  const t0 = Date.now();
  while (Date.now() - t0 < FLIGHT_MS) {
    await page.waitForTimeout(2000);
    const s = await page.evaluate(() => {
      const g = window.__fsg;
      const d = g.getSpawnDebug();
      const ac = g.getAircraftPos();
      const t = g.getTelemetry();
      if (!d || !ac || !t) return null;
      const aglM = t.altitudeFt * 0.3048;
      const impliedGroundY = ac.y - aglM;
      const spawn = d.spawn;
      const dx = (spawn.lon - 0) * 111_000 * Math.cos((spawn.lat * Math.PI) / 180);
      const dy = (spawn.lat - 0) * 111_000;
      const distSpawnM = Math.hypot(ac.x, ac.z);
      return {
        acY: ac.y,
        aglFt: t.altitudeFt,
        impliedGroundY,
        spawnGroundY: d.ground,
        groundErrM: impliedGroundY - d.ground,
        distFromOriginM: distSpawnM,
        onGround: t.onGround,
        ias: t.airspeedKts,
      };
    });
    if (s) samples.push(s);
  }

  // Turn back toward origin and descend
  await page.evaluate(() => {
    window.__fsg.setControls({ elevator: 0.35, aileron: -0.22, throttle: 0.35 });
  });
  await page.waitForTimeout(25_000);

  const landing = await page.evaluate(() => {
    const g = window.__fsg;
    const d = g.getSpawnDebug();
    const ac = g.getAircraftPos();
    const t = g.getTelemetry();
    const aglM = t.altitudeFt * 0.3048;
    const impliedGroundY = ac.y - aglM;
    return {
      acY: ac.y,
      aglFt: t.altitudeFt,
      impliedGroundY,
      spawnGroundY: d.ground,
      groundErrM: impliedGroundY - d.ground,
      onGround: t.onGround,
      distFromOriginM: Math.hypot(ac.x, ac.z),
    };
  });

  const maxErr = Math.max(...samples.map((s) => Math.abs(s.groundErrM)), Math.abs(landing.groundErrM));
  const nearSpawn = samples.filter((s) => s.distFromOriginM < 1200);
  const maxNearErr = nearSpawn.length
    ? Math.max(...nearSpawn.map((s) => Math.abs(s.groundErrM)))
    : 0;

  return { label, baseline, landing, maxErr, maxNearErr, samples: samples.slice(-5) };
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const result = await runCase(page, {
  label: 'yssy',
  setup: async () => {},
});

await browser.close();

const pass = Math.abs(result.landing.groundErrM) < 15;
console.log(JSON.stringify({ pass, ...result }, null, 2));
process.exit(pass ? 0 : 1);
