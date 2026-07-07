#!/usr/bin/env node
/** Runtime diagnostics for brown / missing satellite terrain. */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const URL = process.env.FSG_URL ?? 'http://127.0.0.1:5173/';
const OUT = '/tmp/flightsim-debug-terrain.png';

async function inspect(page, label) {
  const imagery = { ok: 0, fail: 0, maxZ: 0, errors: [] };
  const onResp = (r) => {
    const u = r.url();
    if (!/World_Imagery|Terrain3D|MapServer\/tile/i.test(u)) return;
    const z = Number(u.match(/tile\/(\d+)\//)?.[1] ?? 0);
    if (r.status() === 200) {
      imagery.ok++;
      imagery.maxZ = Math.max(imagery.maxZ, z);
    } else {
      imagery.fail++;
      if (imagery.errors.length < 5) imagery.errors.push({ status: r.status(), url: u.slice(0, 100) });
    }
  };
  page.on('response', onResp);

  const consoleLines = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      consoleLines.push(`[${msg.type()}] ${msg.text()}`);
    }
  });

  return { imagery, consoleLines, onResp };
}

async function runCase(page, { label, setup, outsideCam = true }) {
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  await setup(page);
  await page.click('#spawn-go');
  await page.waitForFunction(() => window.__fsg?.isFlightReady?.(), { timeout: 180000 });

  if (outsideCam) {
    // Cycle cockpit -> gear -> outside (default is cockpit)
    await page.evaluate(() => {
      window.__fsg.cycleCamera?.();
      window.__fsg.cycleCamera?.();
    });
  }

  // Let tiles stream in while sim runs
  await page.waitForTimeout(15000);

  const stats = await page.evaluate(() => {
    const map = window.__fsg?.getTileMap?.();
    if (!map) return { error: 'no tile map' };

    const mats = {
      basic: 0,
      basicWithMap: 0,
      basicBrownNoMap: 0,
      standard: 0,
      standardWithMap: 0,
      standardNoMap: 0,
      other: 0,
    };
    let meshes = 0;
    let visibleMeshes = 0;

    map.traverse((obj) => {
      if (!obj.isMesh) return;
      meshes++;
      if (obj.visible) visibleMeshes++;
      const list = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of list) {
        const type = m.type;
        const hasMap = !!m.map;
        const hex = m.color?.getHex?.() ?? null;
        if (type === 'MeshBasicMaterial') {
          mats.basic++;
          if (hasMap) mats.basicWithMap++;
          else if (hex === 0x3a4a38) mats.basicBrownNoMap++;
        } else if (type === 'MeshStandardMaterial') {
          mats.standard++;
          if (hasMap) mats.standardWithMap++;
          else mats.standardNoMap++;
        } else {
          mats.other++;
        }
      }
    });

    const spawn = window.__fsg?.getSpawnDebug?.();
    const t = window.__fsg?.getTelemetry?.();
    return {
      meshes,
      visibleMeshes,
      mats,
      spawn: spawn?.spawn,
      ground: spawn?.ground,
      aircraftY: spawn?.aircraftY,
      aglFt: t?.altitudeFt,
      mapPos: { x: map.parent?.position?.x, y: map.parent?.position?.y, z: map.parent?.position?.z },
      downloading: map.downloadingThreads ?? null,
    };
  });

  await page.screenshot({ path: `${OUT}-${label}.png`, type: 'png' });
  return stats;
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const cases = [
  {
    label: 'yssy-default',
    setup: async (p) => {
      /* YSSY prefilled */
    },
  },
  {
    label: 'dms-no-icao',
    setup: async (p) => {
      await p.fill('#spawn-icao', '');
      await p.fill('#spawn-lat', "32°46'37.7\"S");
      await p.fill('#spawn-lon', "151°25'54.6\"E");
    },
  },
  {
    label: 'dms-icao-still-yssy',
    setup: async (p) => {
      await p.fill('#spawn-icao', 'YSSY');
      await p.fill('#spawn-lat', "32°46'37.7\"S");
      await p.fill('#spawn-lon', "151°25'54.6\"E");
    },
  },
];

const results = {};
for (const c of cases) {
  const { onResp } = await inspect(page, c.label);
  results[c.label] = await runCase(page, c);
  page.off('response', onResp);
}

await browser.close();
console.log(JSON.stringify(results, null, 2));
