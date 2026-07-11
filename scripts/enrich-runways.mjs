#!/usr/bin/env node
/**
 * Enrich airports.json with runway true headings from OurAirports runways.csv.
 *
 * Writes:
 *   rwys: [{ id, hdg, lat?, lon? }, ...]  — all open runways ≥ 800 ft
 *   rwyHdg / rwy — primary (longest) runway, kept for older callers
 *
 * Usage: node scripts/enrich-runways.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const dataDir = join(__dirname, 'data');
const runwaysPath = join(dataDir, 'runways.csv');
const airportsPath = join(root, 'src/data/airports.json');
const RUNWAYS_URL =
  'https://davidmegginson.github.io/ourairports-data/runways.csv';

function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  fields.push(current);
  return fields;
}

function ensureRunwaysCsv() {
  mkdirSync(dataDir, { recursive: true });
  if (existsSync(runwaysPath) && readFileSync(runwaysPath, 'utf8').length > 1000) {
    return;
  }
  console.log('Downloading OurAirports runways.csv…');
  execFileSync('curl', ['-sL', RUNWAYS_URL, '-o', runwaysPath], { stdio: 'inherit' });
}

function bearingFromEnds(lat1, lon1, lat2, lon2) {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

ensureRunwaysCsv();

const raw = readFileSync(runwaysPath, 'utf8').split(/\r?\n/);
const header = parseCsvLine(raw[0]);
const idx = Object.fromEntries(header.map((h, i) => [h.replace(/^"|"$/g, ''), i]));

/** @type {Map<string, Array<{ length: number, hdg: number, le: string, he: string, lat: number|null, lon: number|null }>>} */
const runwaysByIdent = new Map();

for (let i = 1; i < raw.length; i++) {
  const line = raw[i];
  if (!line.trim()) continue;
  const f = parseCsvLine(line);
  const ident = (f[idx.airport_ident] ?? '').replace(/"/g, '').toUpperCase();
  if (!ident) continue;
  if (f[idx.closed] === '1') continue;
  const length = parseFloat(f[idx.length_ft]);
  if (!Number.isFinite(length) || length < 800) continue; // skip helipads / tiny strips

  const lat1 = parseFloat(f[idx.le_latitude_deg]);
  const lon1 = parseFloat(f[idx.le_longitude_deg]);
  const lat2 = parseFloat(f[idx.he_latitude_deg]);
  const lon2 = parseFloat(f[idx.he_longitude_deg]);
  const hasEnds =
    Number.isFinite(lat1) &&
    Number.isFinite(lon1) &&
    Number.isFinite(lat2) &&
    Number.isFinite(lon2);

  let hdg = parseFloat(f[idx.le_heading_degT]);
  if (!Number.isFinite(hdg) && hasEnds) {
    hdg = bearingFromEnds(lat1, lon1, lat2, lon2);
  }
  if (!Number.isFinite(hdg)) continue;

  const le = (f[idx.le_ident] ?? '').replace(/"/g, '');
  const he = (f[idx.he_ident] ?? '').replace(/"/g, '');
  const midLat = hasEnds ? (lat1 + lat2) / 2 : null;
  const midLon = hasEnds ? (lon1 + lon2) / 2 : null;

  const list = runwaysByIdent.get(ident) ?? [];
  list.push({
    length,
    hdg: Math.round(hdg) % 360,
    le,
    he,
    lat: midLat,
    lon: midLon,
  });
  runwaysByIdent.set(ident, list);
}

const airports = JSON.parse(readFileSync(airportsPath, 'utf8'));
let matched = 0;
let runwayCount = 0;
for (const ap of airports) {
  delete ap.rwyHdg;
  delete ap.rwy;
  delete ap.rwys;
  const key = (ap.icao || ap.iata || '').toUpperCase();
  const list = runwaysByIdent.get(key);
  if (!list?.length) continue;

  // Longest first; drop near-duplicates (same ends / heading within 2°)
  list.sort((a, b) => b.length - a.length);
  const rwys = [];
  for (const r of list) {
    const id = r.le && r.he ? `${r.le}/${r.he}` : r.le || r.he || `${r.hdg}`;
    const dup = rwys.some((x) => {
      if (x.id === id) return true;
      if (x.lat == null || r.lat == null || x.lon == null || r.lon == null) {
        return false;
      }
      const sameAxis =
        Math.abs(x.hdg - r.hdg) <= 2 ||
        Math.abs(x.hdg - ((r.hdg + 180) % 360)) <= 2;
      return (
        sameAxis &&
        Math.abs(x.lat - r.lat) < 0.0015 &&
        Math.abs(x.lon - r.lon) < 0.0015
      );
    });
    if (dup) continue;
    const entry = { id, hdg: r.hdg };
    if (r.lat != null && r.lon != null) {
      entry.lat = Math.round(r.lat * 1e6) / 1e6;
      entry.lon = Math.round(r.lon * 1e6) / 1e6;
    }
    rwys.push(entry);
  }
  if (!rwys.length) continue;

  ap.rwys = rwys;
  ap.rwyHdg = rwys[0].hdg;
  ap.rwy = rwys[0].id;
  matched++;
  runwayCount += rwys.length;
}

writeFileSync(airportsPath, JSON.stringify(airports));
console.log(
  `Enriched ${matched}/${airports.length} airports with ${runwayCount} runways → ${airportsPath}`,
);
