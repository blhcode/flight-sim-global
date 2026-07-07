#!/usr/bin/env node
/** Loop gate: Sydney + DMS outside cam must show satellite detail. */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const URL = process.env.FSG_URL ?? 'http://127.0.0.1:5173/';

function groundSpread(pngPath) {
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

async function checkSpawn(page, { label, setup, outside = true }) {
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  await setup(page);
  await page.click('#spawn-go');
  await page.waitForFunction(() => window.__fsg?.isFlightReady?.(), { timeout: 180000 });

  if (outside) {
    await page.evaluate(async () => {
      await window.__fsg.cycleToOutsideCam?.();
    });
    await page.waitForTimeout(5000);
  }

  await page.waitForTimeout(12000);
  await page
    .waitForFunction(
      () => {
        const map = window.__fsg?.getTileMap?.();
        if (!map) return false;
        let maxZ = 0;
        map.traverse((o) => {
          if (o.isMesh && o.parent?.z > maxZ) maxZ = o.parent.z;
        });
        return maxZ >= 10;
      },
      { timeout: 60000 },
    )
    .catch(() => {});
  const out = `/tmp/flightsim-loop-${label}.png`;
  await page.screenshot({ path: out, type: 'png' });

  const stats = await page.evaluate(() => {
    const map = window.__fsg?.getTileMap?.();
    let maxZ = 0;
    let meshes = 0;
    let withMap = 0;
    map?.traverse((o) => {
      if (!o.isMesh) return;
      meshes++;
      if (o.parent?.z > maxZ) maxZ = o.parent.z;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) if (m.map) withMap++;
    });
    const dbg = window.__fsg?.getSpawnDebug?.();
    return {
      maxZ,
      meshes,
      withMap,
      mapMaxLevel: map?.maxLevel,
      lon0: map?.lon0,
      ground: dbg?.ground,
      aircraftY: dbg?.aircraftY,
    };
  });

  page.removeAllListeners('console');
  const spread = groundSpread(out);
  const pass =
    stats.meshes >= 25 &&
    stats.withMap >= 25 &&
    stats.maxZ >= 10 &&
    spread > 80 &&
    Math.abs((stats.aircraftY ?? 0) - (stats.ground ?? 0)) < 12;

  return { label, pass, spread, stats, errors: errors.slice(0, 5), screenshot: out };
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const yssy = await checkSpawn(page, {
  label: 'yssy-outside',
  setup: async () => {},
});
const dms = await checkSpawn(page, {
  label: 'dms-outside',
  setup: async (p) => {
    await p.fill('#spawn-icao', '');
    await p.fill('#spawn-lat', "32°46'37.7\"S");
    await p.fill('#spawn-lon', "151°25'54.6\"E");
  },
});

await browser.close();

const pass = yssy.pass && dms.pass;
console.log(JSON.stringify({ pass, yssy, dms }, null, 2));
process.exit(pass ? 0 : 1);
