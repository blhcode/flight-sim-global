#!/usr/bin/env node
/** Spawn should be on the ground at the airport, not hundreds of feet in the air. */
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

const samples = [];
for (const sec of [0, 0.5, 1, 2, 3, 5]) {
  if (sec > 0) await page.waitForTimeout((sec - samples.at(-1).sec) * 1000);
  const row = await page.evaluate(() => {
    const g = window.__fsg;
    const t = g.getTelemetry();
    const p = g.aircraft?.root?.position;
    return {
      agl: t?.altitudeFt ?? 999,
      onGround: t?.onGround ?? false,
      y: p?.y ?? 0,
      kts: t?.airspeedKts ?? 0,
    };
  });
  samples.push({ sec, ...row });
}

await page.screenshot({ path: '/tmp/spawn-check.png' });
await browser.close();

const maxAgl = Math.max(...samples.map((s) => s.agl));
const spawnAgl = samples[0].agl;
const pass =
  spawnAgl < 25 &&
  maxAgl < 40 &&
  samples.every((s) => s.onGround || s.sec >= 5) &&
  samples.filter((s) => s.sec <= 2).every((s) => s.agl < 30);

console.log(JSON.stringify({ pass, spawnAgl: Math.round(spawnAgl), maxAgl: Math.round(maxAgl), samples }));
process.exit(pass ? 0 : 1);
