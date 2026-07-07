#!/usr/bin/env node
/** Deep texture + LOD diagnostics at aircraft position. */
import { chromium } from 'playwright';

const URL = process.env.FSG_URL ?? 'http://127.0.0.1:5173/';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
await page.fill('#spawn-icao', '');
await page.fill('#spawn-lat', "32°46'37.7\"S");
await page.fill('#spawn-lon', "151°25'54.6\"E");
await page.click('#spawn-go');
await page.waitForFunction(() => window.__fsg?.isFlightReady?.(), { timeout: 180000 });
await page.evaluate(() => {
  window.__fsg.cycleCamera?.();
  window.__fsg.cycleCamera?.();
});
await page.waitForTimeout(12000);

const report = await page.evaluate(() => {
  const map = window.__fsg?.getTileMap?.();
  const ac = window.__fsg?.getTelemetry?.();
  if (!map) return { error: 'no map' };

  const cam = window.__fsg?.getCamera?.();
  const acPos = window.__fsg?.getAircraftPos?.();

  const tiles = [];
  map.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) {
      const img = m.map?.image;
      let imgW = 0;
      let imgH = 0;
      let imgType = 'none';
      if (img) {
        imgW = img.width ?? img.videoWidth ?? 0;
        imgH = img.height ?? img.videoHeight ?? 0;
        imgType = img.constructor?.name ?? typeof img;
      }
      const tile = obj.parent;
      tiles.push({
        z: tile?.z ?? null,
        x: tile?.x ?? null,
        y: tile?.y ?? null,
        matType: m.type,
        color: m.color?.getHex?.(),
        hasMap: !!m.map,
        imgW,
        imgH,
        imgType,
        mapGen: m.map?.version ?? null,
        dist: acPos
          ? Math.hypot(
              obj.position.x + (obj.parent?.position?.x ?? 0) - acPos.x,
              obj.position.z + (obj.parent?.position?.z ?? 0) - acPos.z,
            )
          : null,
        worldY: obj.matrixWorld?.elements?.[13] ?? null,
      });
    }
  });

  tiles.sort((a, b) => (a.dist ?? 1e9) - (b.dist ?? 1e9));

  const near = tiles.slice(0, 8);
  const maxZ = tiles.reduce((m, t) => Math.max(m, t.z ?? 0), 0);

  return {
    tileCount: tiles.length,
    maxZ,
    near,
    cam: cam ? { x: cam.x, y: cam.y, z: cam.z } : null,
    acPos,
    spawn: window.__fsg?.getSpawnDebug?.()?.spawn,
  };
});

await page.screenshot({ path: '/tmp/flightsim-debug-textures.png', type: 'png' });
await browser.close();
console.log(JSON.stringify(report, null, 2));
