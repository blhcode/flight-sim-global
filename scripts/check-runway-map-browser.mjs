#!/usr/bin/env node
/** Verify destination runway lineup line appears on the nav map (dev server). */
import { chromium } from 'playwright';

const URL = process.env.FSG_URL ?? 'http://127.0.0.1:5173/';
const CHROME =
  process.env.PLAYWRIGHT_CHROME ??
  '/home/isaiah/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome';

const browser = await chromium.launch({
  headless: true,
  executablePath: CHROME,
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.fill('#spawn-icao', 'YSSY');
await page.click('#spawn-go');
await page.waitForFunction(() => window.__fsg?.isOnRunway?.(), { timeout: 120000 });
await page.waitForTimeout(500);

const result = await page.evaluate(async () => {
  const g = window.__fsg;
  g.toggleMap();
  await new Promise((r) => setTimeout(r, 100));

  const pick = async (field, query) => {
    const input = document.querySelector(`#nav-map-${field}`);
    input.value = query;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 280));
    const hit = document.querySelector(
      `[data-field="${field}"] .nav-map-search-results li`,
    );
    hit?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return !!hit;
  };

  const depOk = await pick('dep', 'YSSY');
  const destOk = await pick('dest', 'NZQN');
  document.querySelector('[data-action="set-route"]')?.click();
  await new Promise((r) => setTimeout(r, 200));

  const aid = g.getRunwayAidDebug?.() ?? null;
  const canvas = document.querySelector('.nav-map-canvas');
  const ctx = canvas.getContext('2d');
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let pink = 0;
  let green = 0;
  for (let i = 0; i < img.length; i += 4) {
    const r = img[i];
    const gc = img[i + 1];
    const b = img[i + 2];
    const a = img[i + 3];
    if (a < 40) continue;
    if (r > 180 && gc < 170 && b > 130) pink++;
    if (gc > 140 && r < 140 && b < 180) green++;
  }

  return {
    depOk,
    destOk,
    routeLen: g.getRoute().length,
    aid,
    pink,
    green,
    hint: document.querySelector('.nav-map-hint')?.textContent ?? '',
    pass:
      depOk &&
      destOk &&
      g.getRoute().length >= 1 &&
      aid?.destination?.rwyHdg != null &&
      pink > 40 &&
      green > 20,
  };
});

await page.screenshot({ path: '/tmp/fsg-runway-map.png' });
await browser.close();

console.log(JSON.stringify({ result, errors }, null, 2));
process.exit(result.pass ? 0 : 1);
