#!/usr/bin/env node
/**
 * Convert OpenFlights airports.dat → compact airports.json
 * Usage: node scripts/build-airports.mjs [path-to-airports.dat]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const defaultDat = join(
  process.env.HOME ?? '',
  'Projects/inland-air/scripts/airports.dat',
);
const inputPath = process.argv[2] ?? defaultDat;
const outputPath = join(root, 'src/data/airports.json');

function parseLine(line) {
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

function clean(field) {
  const v = field?.replace(/"/g, '') ?? '';
  return v === '\\N' ? '' : v;
}

const raw = readFileSync(inputPath, 'utf8');
const airports = [];
const seen = new Set();

for (const line of raw.split('\n')) {
  if (!line.trim()) continue;
  const f = parseLine(line);
  if (clean(f[12]) !== 'airport') continue;

  const iata = clean(f[4]);
  const icao = clean(f[5]);
  const lat = parseFloat(f[6]);
  const lon = parseFloat(f[7]);
  const elevFt = parseInt(f[8], 10);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

  const hasIata = iata.length === 3;
  const hasIcao = /^[A-Z0-9]{4}$/i.test(icao);
  if (!hasIata && !hasIcao) continue;

  const key = hasIcao ? icao.toUpperCase() : iata.toUpperCase();
  if (seen.has(key)) continue;
  seen.add(key);

  airports.push({
    iata: hasIata ? iata.toUpperCase() : '',
    icao: hasIcao ? icao.toUpperCase() : '',
    name: clean(f[1]) || clean(f[2]) || key,
    city: clean(f[2]) || '',
    country: clean(f[3]) || '',
    lat,
    lon,
    elevM: Number.isFinite(elevFt) ? elevFt * 0.3048 : 0,
  });
}

airports.sort((a, b) => a.name.localeCompare(b.name));

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(airports));
console.log(`Wrote ${airports.length} airports → ${outputPath}`);
