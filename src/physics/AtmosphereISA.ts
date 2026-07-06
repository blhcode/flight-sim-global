export interface AeroPoint {
  alphaDeg: number;
  CL: number;
  CD: number;
}

export function interpolateTable(
  table: AeroPoint[],
  alphaDeg: number,
): { CL: number; CD: number } {
  const a = alphaDeg;
  if (a <= table[0].alphaDeg) return { CL: table[0].CL, CD: table[0].CD };
  const last = table[table.length - 1];
  if (a >= last.alphaDeg) return { CL: last.CL, CD: last.CD };

  for (let i = 0; i < table.length - 1; i++) {
    const p0 = table[i];
    const p1 = table[i + 1];
    if (a >= p0.alphaDeg && a <= p1.alphaDeg) {
      const t = (a - p0.alphaDeg) / (p1.alphaDeg - p0.alphaDeg);
      return {
        CL: p0.CL + t * (p1.CL - p0.CL),
        CD: p0.CD + t * (p1.CD - p0.CD),
      };
    }
  }
  return { CL: last.CL, CD: last.CD };
}

export function isaDensity(altitudeM: number): number {
  const T0 = 288.15;
  const rho0 = 1.225;
  const L = 0.0065;
  const g = 9.80665;
  const M = 0.0289644;
  const R = 8.31447;
  const h = Math.max(0, altitudeM);
  const T = T0 - L * h;
  if (T <= 0) return 0.3;
  return rho0 * Math.pow(T / T0, (g * M) / (R * L) - 1);
}

export function isaSpeedOfSound(altitudeM: number): number {
  const T0 = 288.15;
  const L = 0.0065;
  const gamma = 1.4;
  const R = 287.05;
  const h = Math.max(0, altitudeM);
  const T = Math.max(1, T0 - L * h);
  return Math.sqrt(gamma * R * T);
}
