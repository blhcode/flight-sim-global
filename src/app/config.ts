export const PHYSICS_HZ = 120;
export const PHYSICS_DT = 1 / PHYSICS_HZ;

export type QualityPreset = 'low' | 'medium' | 'high';

export interface GameConfig {
  defaultSpawn: { iata: string; headingDeg: number };
  quality: QualityPreset;
  maxTileLevel: number;
  shadows: boolean;
  fog: boolean;
}

export const defaultConfig: GameConfig = {
  defaultSpawn: { iata: 'YSSY', headingDeg: 160 },
  quality: 'high',
  maxTileLevel: 17,
  shadows: true,
  fog: false,
};

export function qualitySettings(quality: QualityPreset) {
  switch (quality) {
    case 'low':
      return { maxTileLevel: 14, minTileLevel: 6, shadows: false, fog: false };
    case 'high':
      return { maxTileLevel: 19, minTileLevel: 10, shadows: true, fog: false };
    default:
      return { maxTileLevel: 17, minTileLevel: 8, shadows: true, fog: false };
  }
}
