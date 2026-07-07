import * as plugin from 'three-tile/plugin';
import type { ISource } from 'three-tile';

export type TextureMode = 'satellite' | 'roadmap';

/** Override via `.env.local`: VITE_SATELLITE_PROVIDER=google|maptiler|esri */
export type SatelliteProvider = 'google' | 'maptiler' | 'esri';

export const ESRI_IMAGERY_URL =
  'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

const ESRI_STREETS =
  'https://services.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';

const MAPTILER_DEMO_KEY = 'get_your_own_key_QmavnBrQwNGsQ8YvPzZg';

/** CORS-safe Google satellite mirror (256×256 tiles — one zoom level finer than 512px sources). */
const GOOGLE_SATELLITE_URL =
  'https://gac-geo.googlecnapps.club/maps/vt?lyrs=s&x={x}&y={y}&z={z}';

function satelliteProvider(): SatelliteProvider {
  const env = import.meta.env.VITE_SATELLITE_PROVIDER as SatelliteProvider | undefined;
  if (env === 'google' || env === 'maptiler' || env === 'esri') return env;
  return 'maptiler';
}

function createGoogleSource(maxLevel: number): ISource {
  const google = new plugin.GoogleSource({
    style: 's',
    url: GOOGLE_SATELLITE_URL,
  });
  // 256 px tiles — allow two extra zooms vs 512 px sources for similar sharpness.
  google.maxLevel = Math.min(maxLevel + 2, 20);
  return google;
}

function createSatelliteSource(maxLevel: number): ISource {
  const provider = satelliteProvider();
  const imageryMax = Math.min(maxLevel, 18);

  if (provider === 'google') {
    return createGoogleSource(maxLevel);
  }

  if (provider === 'maptiler') {
    const token = import.meta.env.VITE_MAPTILER_KEY ?? MAPTILER_DEMO_KEY;
    const src = new plugin.MapTilerSource({
      style: 'satellite-v2',
      token,
      format: 'jpg',
    });
    src.maxLevel = imageryMax;
    return src;
  }

  const esri = new plugin.ArcGisSource({
    style: 'World_Imagery',
    url: ESRI_IMAGERY_URL,
  });
  esri.maxLevel = Math.min(imageryMax, 13);
  return esri;
}

export function createImagerySources(mode: TextureMode, maxLevel = 17): ISource | ISource[] {
  if (mode === 'roadmap') {
    const src = new plugin.ArcGisSource({
      style: 'World_Street_Map',
      url: ESRI_STREETS,
    });
    src.maxLevel = maxLevel;
    return src;
  }

  // Single imagery layer — stacking MapTiler + Esri paints coarse Esri upscales on top at z>13.
  return createSatelliteSource(maxLevel);
}

export function createImagerySource(mode: TextureMode, maxLevel = 17): ISource {
  const src = createImagerySources(mode, maxLevel);
  return Array.isArray(src) ? src[0] : src;
}

export function createDemSource(maxLevel = 17): ISource {
  const src = new plugin.ArcGisDemSource();
  src.maxLevel = Math.min(maxLevel, 13);
  return src;
}

export function nextTextureMode(mode: TextureMode): TextureMode {
  return mode === 'satellite' ? 'roadmap' : 'satellite';
}

export function currentSatelliteProviderName(): SatelliteProvider {
  return satelliteProvider();
}

/** LOD during normal flight — must stay high or tiles merge after spawn prime. */
export function satelliteLodThreshold(): number {
  return satelliteProvider() === 'google' ? 3.5 : 3.2;
}

/** LOD while priming — slightly higher than normal. */
export function satellitePrimeLodThreshold(): number {
  return satelliteProvider() === 'google' ? 4.0 : 3.6;
}

export function esriImageryTileUrl(z: number, x: number, y: number): string {
  const cz = Math.min(z, 13);
  const scale = 2 ** (z - cz);
  const cx = Math.floor(x / scale);
  const cy = Math.floor(y / scale);
  return ESRI_IMAGERY_URL.replace('{z}', String(cz))
    .replace('{x}', String(cx))
    .replace('{y}', String(cy));
}
