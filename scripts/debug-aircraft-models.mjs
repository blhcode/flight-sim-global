#!/usr/bin/env node
/**
 * Debug aircraft GLB load, orientation, and materials in headless browser.
 * Usage: node scripts/debug-aircraft-models.mjs
 */
import { chromium } from 'playwright';

const URL = process.env.FSG_URL ?? 'http://127.0.0.1:5173/';
const AIRCRAFT = [
  { id: 'cessna172', label: 'Cessna 172' },
  { id: 'b737', label: 'Boeing 737' },
  { id: 'b747', label: 'Boeing 747' },
  { id: 'dash8400', label: 'Dash 8 Q400' },
  { id: 'twinOtter', label: 'Twin Otter' },
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error' || msg.type() === 'warning') {
    consoleErrors.push(`[${msg.type()}] ${msg.text()}`);
  }
});

await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });

const results = [];

for (const ac of AIRCRAFT) {
  consoleErrors.length = 0;

  await page.selectOption('#spawn-aircraft', ac.id);
  await page.fill('#spawn-icao', 'YSSY');
  await page.click('#spawn-go');

  try {
    await page.waitForFunction(
      () => window.__fsg?.getModelDebug?.() != null,
      { timeout: 180000 },
    );
  } catch {
    results.push({ aircraft: ac.id, error: 'model not loaded', consoleErrors: [...consoleErrors] });
    await page.reload({ waitUntil: 'networkidle' });
    continue;
  }

  await page.evaluate(() => {
    window.__fsg?.cycleCamera?.();
    window.__fsg?.cycleCamera?.();
  });

  const modelDebug = await page.evaluate(() => window.__fsg?.getModelDebug?.() ?? null);
  const loadErrors = consoleErrors.filter((e) => /Failed to load|procedural/i.test(e));
  const forwardOk = modelDebug && Math.abs(modelDebug.forward.z + 1) < 0.05;

  results.push({
    aircraft: ac.id,
    label: ac.label,
    modelDebug,
    forwardOk,
    loadErrors,
    modelErrors: consoleErrors.filter((e) => /model|gltf|texture|GLTF/i.test(e)),
  });

  await page.reload({ waitUntil: 'networkidle' });
}

console.log(JSON.stringify(results, null, 2));
await browser.close();

const failed = results.filter((r) => r.loadErrors?.length || r.error || !r.forwardOk);
if (failed.length) {
  console.error('\n=== FAILURES ===');
  for (const f of failed) {
    console.error(f.aircraft, f.loadErrors || f.error || `forward=${JSON.stringify(f.modelDebug?.forward)}`);
  }
  process.exit(1);
}

console.log('\nAll aircraft loaded with forward −Z.');
