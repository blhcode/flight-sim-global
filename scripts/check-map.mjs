#!/usr/bin/env node
/** Navigation map: toggle, position, airports, route waypoints. */
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
await page.waitForTimeout(1000);

const result = await page.evaluate(async () => {
  const g = window.__fsg;
  const before = g.isMapVisible();
  g.toggleMap();
  const open = g.isMapVisible();
  const map = document.querySelector('.nav-map');
  const canvas = document.querySelector('.nav-map-canvas');
  const rect = canvas.getBoundingClientRect();
  const tap = (x, y) => {
    canvas.dispatchEvent(
      new PointerEvent('pointerdown', {
        clientX: rect.left + x,
        clientY: rect.top + y,
        bubbles: true,
        pointerId: 1,
      }),
    );
    canvas.dispatchEvent(
      new PointerEvent('pointerup', {
        clientX: rect.left + x,
        clientY: rect.top + y,
        bubbles: true,
        pointerId: 1,
      }),
    );
  };
  tap(120, 140);
  await new Promise((r) => setTimeout(r, 50));
  const route1 = g.getRoute().length;
  tap(200, 180);
  await new Promise((r) => setTimeout(r, 50));
  const route2 = g.getRoute().length;
  const course = g.getDesiredHeading?.() ?? null;
  document.querySelector('[data-action="clear-route"]')?.dispatchEvent(
    new MouseEvent('click', { bubbles: true }),
  );
  await new Promise((r) => setTimeout(r, 50));
  const routeCleared = g.getRoute().length;
  const icaoBtn = document.querySelector('[data-code="icao"]');
  const iataBtn = document.querySelector('[data-code="iata"]');
  iataBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  const iataActive = iataBtn?.classList.contains('active');
  icaoBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  const icaoActive = icaoBtn?.classList.contains('active');
  g.toggleMap();
  const closed = !g.isMapVisible();
  return {
    before,
    open,
    mapVisible: map && !map.classList.contains('hidden'),
    canvasOk: !!canvas,
    route1,
    route2,
    courseOk: route2 >= 1 ? typeof course === 'number' : true,
    routeCleared,
    iataActive,
    icaoActive,
    closed,
    pass:
      !before &&
      open &&
      mapVisible &&
      canvasOk &&
      route1 >= 1 &&
      route2 >= 2 &&
      routeCleared === 0 &&
      iataActive &&
      icaoActive &&
      closed,
  };
});

await browser.close();
console.log(JSON.stringify(result, null, 2));
process.exit(result.pass ? 0 : 1);
