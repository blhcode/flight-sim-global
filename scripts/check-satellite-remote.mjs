#!/usr/bin/env node
/** Satellite tiles at remote airports + after long-distance teleport from Sydney. */
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const URL = process.env.FSG_URL ?? 'http://127.0.0.1:5173/';
const TPE = { lat: 25.0777, lon: 121.233002, elevM: 32.3, headingDeg: 90 };

function screenshotStats(outPath) {
  const buf = readFileSync(outPath);
  const samples = [];
  for (let i = 5000; i < Math.min(buf.length, 50000); i += 97) samples.push(buf[i]);
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length;
  return { variance: Math.round(variance), hash: createHash('md5').update(buf).digest('hex').slice(0, 8) };
}

async function checkSpawn(page, icao, outPath) {
  const imagery = [];
  const onResp = (r) => {
    const u = r.url();
    if (/World_Imagery|services\.arcgisonline\.com.*MapServer\/tile/i.test(u)) {
      const z =
        Number(u.match(/tile\/(\d+)\//)?.[1] ?? 0) ||
        Number(u.match(/\/(\d{1,2})\/\d+\/\d+/)?.[1] ?? 0);
      imagery.push({ status: r.status(), z });
    }
  };
  page.on('response', onResp);

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.fill('#spawn-icao', icao);
  await page.dispatchEvent('#spawn-icao', 'change');
  await page.click('#spawn-go');
  await page.waitForFunction(() => window.__fsg?.isFlightReady?.(), { timeout: 180000 });
  await page.waitForTimeout(10000);
  await page.screenshot({ path: outPath, type: 'png' });

  const stats = await page.evaluate(() => {
    const dbg = window.__fsg.getSpawnDebug?.();
    const t = window.__fsg.getTelemetry?.();
    return {
      ground: dbg?.ground,
      aircraftY: dbg?.aircraftY,
      aglFt: t?.altitudeFt,
      onGround: t?.onGround,
    };
  });

  page.off('response', onResp);
  const okTiles = imagery.filter((t) => t.status === 200).length;
  const maxZoom = imagery.reduce((m, t) => Math.max(m, t.z), 0);
  return { icao, okTiles, maxZoom, ...screenshotStats(outPath), stats };
}

async function checkFlyFromSydney(page, outPath) {
  const imagery = [];
  const onResp = (r) => {
    const u = r.url();
    if (/World_Imagery|services\.arcgisonline\.com.*MapServer\/tile/i.test(u)) {
      const z =
        Number(u.match(/tile\/(\d+)\//)?.[1] ?? 0) ||
        Number(u.match(/\/(\d{1,2})\/\d+\/\d+/)?.[1] ?? 0);
      imagery.push({ status: r.status(), z });
    }
  };
  page.on('response', onResp);

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.click('#spawn-go');
  await page.waitForFunction(() => window.__fsg?.isOnRunway?.(), { timeout: 120000 });
  await page.waitForTimeout(3000);

  await page.evaluate(
    ({ lat, lon, elevM, headingDeg }) => {
      window.__fsg.teleportToGeo(lat, lon, elevM, headingDeg);
    },
    TPE,
  );

  await page.waitForTimeout(12000);
  await page.screenshot({ path: outPath, type: 'png' });

  const stats = await page.evaluate(() => {
    const t = window.__fsg.getTelemetry?.();
    const pos = window.__fsg.getSpawnDebug?.()?.aircraftY;
    return {
      aglFt: t?.altitudeFt,
      onGround: t?.onGround,
      aircraftY: pos,
    };
  });

  page.off('response', onResp);
  const okTiles = imagery.filter((t) => t.status === 200).length;
  const maxZoom = imagery.reduce((m, t) => Math.max(m, t.z), 0);
  return { okTiles, maxZoom, ...screenshotStats(outPath), stats };
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(180_000);

const sydney = await checkSpawn(page, 'YSSY', '/tmp/flightsim-sat-yssy.png');
const taipei = await checkSpawn(page, 'TPE', '/tmp/flightsim-sat-tpe.png');
const flyRemote = await checkFlyFromSydney(page, '/tmp/flightsim-sat-fly-tpe.png');

await browser.close();

const pass =
  taipei.okTiles > 10 &&
  taipei.maxZoom >= 13 &&
  taipei.variance > 100 &&
  taipei.stats.onGround &&
  taipei.stats.ground > 0 &&
  flyRemote.okTiles > 10 &&
  flyRemote.maxZoom >= 13 &&
  flyRemote.variance > 100;

console.log(JSON.stringify({ pass, sydney, taipei, flyRemote }, null, 2));
process.exit(pass ? 0 : 1);
