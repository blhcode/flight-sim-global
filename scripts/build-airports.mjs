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
  // OpenFlights CSV with quoted fields
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

const raw = readFileSync(inputPath, 'utf8');
const airports = [];

for (const line of raw.split('\n')) {
  if (!line.trim()) continue;
  const f = parseLine(line);
  const type = f[12]?.replace(/"/g, '');
  if (type !== 'airport') continue;

  const iata = f[4]?.replace(/"/g, '');
  if (!iata || iata === '\\N' || iata.length !== 3) continue;

  const lat = parseFloat(f[6]);
  const lon = parseFloat(f[7]);
  const elevFt = parseInt(f[8], 10);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

  airports.push({
    iata,
    icao: f[5]?.replace(/"/g, '') || '',
    name: f[1]?.replace(/"/g, '') || '',
    city: f[2]?.replace(/"/g, '') || '',
    country: f[3]?.replace(/"/g, '') || '',
    lat,
    lon,
    elevM: Number.isFinite(elevFt) ? elevFt * 0.3048 : 0,
  });
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(airports));
console.log(`Wrote ${airports.length} airports → ${outputPath}`);
