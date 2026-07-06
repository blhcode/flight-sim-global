#!/usr/bin/env node
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

const spawnTelem = await page.evaluate(() => {
  const g = window.__fsg;
  g?.setThrottle?.(1);
  g?.simulatePhysics?.(12);
  return g?.getTelemetry?.() ?? null;
});

await page.screenshot({ path: '/tmp/physics-check.png' });
await browser.close();

const spawnAgl = spawnTelem?.altitudeFt ?? 999;
const maxKts = spawnTelem?.airspeedKts ?? 0;
const pass = spawnAgl < 25 && maxKts > 70;

console.log(
  JSON.stringify({
    pass,
    aglFt: Math.round(spawnAgl),
    onGround: spawnTelem?.onGround,
    maxKts: Math.round(maxKts),
    stall: spawnTelem?.isStalled,
  }),
);
process.exit(pass ? 0 : 1);
