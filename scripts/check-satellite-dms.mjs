#!/usr/bin/env node
/** Satellite tiles at DMS coordinates (Diana's Farm area, NSW). */
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const URL = process.env.FSG_URL ?? 'http://127.0.0.1:5173/';
const OUT = '/tmp/flightsim-sat-dms.png';
const LAT = "32°46'37.7\"S";
const LON = "151°25'54.6\"E";

function screenshotStats(outPath) {
  const buf = readFileSync(outPath);
  const samples = [];
  for (let i = 5000; i < Math.min(buf.length, 50000); i += 97) samples.push(buf[i]);
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length;
  return { variance: Math.round(variance), hash: createHash('md5').update(buf).digest('hex').slice(0, 8) };
}

function groundColorSpread(pngPath) {
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
  if (/World_Imagery|services\.arcgisonline\.com.*MapServer\/tile/i.test(u)) {
    const z =
      Number(u.match(/tile\/(\d+)\//)?.[1] ?? 0) ||
      Number(u.match(/\/(\d{1,2})\/\d+\/\d+/)?.[1] ?? 0);
    imagery.push({ status: r.status(), z });
  }
});

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.fill('#spawn-icao', '');
await page.fill('#spawn-lat', LAT);
await page.fill('#spawn-lon', LON);
await page.dispatchEvent('#spawn-lat', 'change');
await page.dispatchEvent('#spawn-lon', 'change');
await page.click('#spawn-go');
await page.waitForFunction(() => window.__fsg?.isFlightReady?.(), { timeout: 180000 });
await page.waitForTimeout(12000);
await page.screenshot({ path: OUT, type: 'png' });

const meshStats = await page.evaluate(() => {
  const map = window.__fsg?.getTileMap?.();
  if (!map) return { meshes: 0, withMap: 0, brown: 0 };
  let meshes = 0;
  let withMap = 0;
  let brown = 0;
  map.traverse((obj) => {
    if (!obj.isMesh) return;
    meshes++;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) {
      if (m.map) withMap++;
      if (m.color?.getHex?.() === 0x3a4a38 && !m.map) brown++;
    }
  });
  return { meshes, withMap, brown };
});

const okTiles = imagery.filter((t) => t.status === 200).length;
const maxZoom = imagery.reduce((m, t) => Math.max(m, t.z), 0);
const groundSpread = groundColorSpread(OUT);
const pass =
  okTiles > 20 &&
  maxZoom >= 13 &&
  meshStats.withMap > 10 &&
  meshStats.brown === 0 &&
  groundSpread > 35;

console.log(
  JSON.stringify(
    {
      pass,
      okTiles,
      maxZoom,
      groundSpread,
      meshStats,
      ...screenshotStats(OUT),
      screenshot: OUT,
    },
    null,
    2,
  ),
);

await browser.close();
process.exit(pass ? 0 : 1);
