import type { AeroPoint } from '../physics/AtmosphereISA.ts';

/** Baseline light-aircraft polar — scale CL/CD for larger types. */
export const lightAeroTable: AeroPoint[] = [
  { alphaDeg: -10, CL: -0.35, CD: 0.045 },
  { alphaDeg: -5, CL: 0.05, CD: 0.032 },
  { alphaDeg: 0, CL: 0.28, CD: 0.03 },
  { alphaDeg: 5, CL: 0.55, CD: 0.035 },
  { alphaDeg: 10, CL: 0.95, CD: 0.05 },
  { alphaDeg: 15, CL: 1.25, CD: 0.085 },
  { alphaDeg: 18, CL: 1.1, CD: 0.12 },
  { alphaDeg: 22, CL: 0.85, CD: 0.18 },
  { alphaDeg: 30, CL: 0.55, CD: 0.28 },
];

export function scaleAeroTable(table: AeroPoint[], clScale: number, cdScale = 1): AeroPoint[] {
  return table.map((p) => ({
    alphaDeg: p.alphaDeg,
    CL: p.CL * clScale,
    CD: p.CD * cdScale,
  }));
}
