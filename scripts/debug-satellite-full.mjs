#!/usr/bin/env node
/** Full satellite repro: cockpit + outside, YSSY + DMS, network + screenshot. */
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

async function runCase(page, { label, setup, outside }) {
  const network = { maptiler: [], google: [], esri: [], failed: [] };
  const onResp = (r) => {
    const u = r.url();
    const z =
      Number(u.match(/[?&]z=(\d+)/)?.[1] ?? 0) ||
      Number(u.match(/\/(\d{1,2})\/\d+\/\d+/)?.[1] ?? 0) ||
      Number(u.match(/tile\/(\d+)\//)?.[1] ?? 0);
    const entry = { z, status: r.status(), len: r.headers()['content-length'] };
    if (/maptiler.*satellite/i.test(u)) network.maptiler.push(entry);
    else if (/googlecnapps/i.test(u)) network.google.push(entry);
    else if (/World_Imagery/i.test(u)) network.esri.push(entry);
    if (r.status() !== 200 && /maptiler|googlecnapps|World_Imagery/i.test(u)) {
      network.failed.push({ status: r.status(), url: u.slice(0, 100) });
    }
  };
  page.on('response', onResp);

  const consoleErr = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErr.push(m.text());
  });

  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  await setup(page);
  await page.click('#spawn-go');
  await page.waitForFunction(() => window.__fsg?.isFlightReady?.(), { timeout: 180000 });

  if (outside) {
    await page.evaluate(async () => {
      await window.__fsg.cycleToOutsideCam?.();
    });
    await page.waitForTimeout(15000);
  } else {
    await page.waitForTimeout(15000);
  }

  const shot = `/tmp/flightsim-debug-full-${label}.png`;
  await page.screenshot({ path: shot, type: 'png' });

  const stats = await page.evaluate(() => {
    const map = window.__fsg?.getTileMap?.();
    let maxZ = 0,
      meshes = 0,
      withMap = 0,
      brown = 0;
    map?.traverse((o) => {
      if (!o.isMesh) return;
      meshes++;
      if (o.parent?.z > maxZ) maxZ = o.parent.z;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m.map) withMap++;
        if (m.color?.getHex?.() === 0x3a4a38 && !m.map) brown++;
      }
    });
    const dbg = window.__fsg?.getSpawnDebug?.();
    return {
      maxZ,
      meshes,
      withMap,
      brown,
      mapMaxLevel: map?.maxLevel,
      ground: dbg?.ground,
      aircraftY: dbg?.aircraftY,
      altM: dbg?.spawn?.altM,
    };
  });

  page.off('response', onResp);
  const maxNetZ = (arr) => Math.max(0, ...arr.map((t) => t.z));

  return {
    label,
    outside,
    stats,
    spread: groundSpread(shot),
    screenshot: shot,
    network: {
      maptiler: network.maptiler.length,
      maxMaptilerZ: maxNetZ(network.maptiler),
      google: network.google.length,
      maxGoogleZ: maxNetZ(network.google),
      esri: network.esri.length,
      failed: network.failed.slice(0, 5),
    },
    consoleErr: consoleErr.slice(0, 5),
    pass:
      stats.maxZ >= 10 &&
      stats.withMap >= 20 &&
      stats.brown === 0 &&
      groundSpread(shot) > 80 &&
      Math.abs((stats.aircraftY ?? 0) - (stats.ground ?? 0)) < 15,
  };
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const cases = [
  { label: 'yssy-cockpit', outside: false, setup: async () => {} },
  {
    label: 'yssy-outside',
    outside: true,
    setup: async () => {},
  },
  {
    label: 'dms-outside',
    outside: true,
    setup: async (p) => {
      await p.fill('#spawn-icao', '');
      await p.fill('#spawn-lat', "32°46'37.7\"S");
      await p.fill('#spawn-lon', "151°25'54.6\"E");
    },
  },
];

const results = [];
for (const c of cases) {
  results.push(await runCase(page, c));
}

await browser.close();

const pass = results.every((r) => r.pass);
console.log(JSON.stringify({ pass, results }, null, 2));
process.exit(pass ? 0 : 1);
