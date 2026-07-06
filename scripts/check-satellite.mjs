#!/usr/bin/env node
/**
 * Headless check: high-res aerial tiles load and ground view has photo detail.
 */
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const URL = process.env.FSG_URL ?? 'http://127.0.0.1:5173/';
const OUT = '/tmp/flightsim-sat-check.png';

function colorVariance(pngPath) {
  const buf = readFileSync(pngPath);
  const samples = [];
  for (let i = 5000; i < Math.min(buf.length, 50000); i += 97) {
    samples.push(buf[i]);
  }
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  const variance =
    samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length;
  return { mean, variance, hash: createHash('md5').update(buf).digest('hex').slice(0, 8) };
}

function groundColorVariance(pngPath) {
  const buf = readFileSync(pngPath);
  const samples = [];
  for (let i = Math.floor(buf.length * 0.55); i < buf.length - 4; i += 211) {
    samples.push(buf[i], buf[i + 1], buf[i + 2]);
  }
  const spread = (arr) => (arr.length ? Math.max(...arr) - Math.min(...arr) : 0);
  const r = samples.filter((_, i) => i % 3 === 0);
  const g = samples.filter((_, i) => i % 3 === 1);
  const b = samples.filter((_, i) => i % 3 === 2);
  return spread(r) + spread(g) + spread(b);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const imagery = [];
page.on('response', (r) => {
  const u = r.url();
  if (
    /maptiler\.com.*satellite|googlecnapps\.club\/maps\/vt|khms\d*\.google|World_Imagery|services\.arcgisonline\.com.*MapServer\/tile/i.test(
      u,
    )
  ) {
    const z =
      Number(u.match(/[?&]z=(\d+)/)?.[1] ?? 0) ||
      Number(u.match(/\/(\d{1,2})\/\d+\/\d+/)?.[1] ?? 0) ||
      Number(u.match(/tile\/(\d+)\//)?.[1] ?? 0);
    imagery.push({ status: r.status(), z, url: u.slice(0, 80) });
  }
});

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.click('#spawn-go');
await page.waitForTimeout(28000);
await page.screenshot({ path: OUT, type: 'png' });

const stats = colorVariance(OUT);
const groundSpread = groundColorVariance(OUT);
const maxZoom = imagery.reduce((m, t) => Math.max(m, t.z), 0);
const okTiles = imagery.filter((t) => t.status === 200).length;
const pass = okTiles > 10 && maxZoom >= 15 && groundSpread > 40;

console.log(
  JSON.stringify({
    pass,
    okTiles,
    maxZoom,
    groundSpread,
    variance: Math.round(stats.variance),
    screenshot: OUT,
    hash: stats.hash,
  }),
);

await browser.close();
process.exit(pass ? 0 : 1);
