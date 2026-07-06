import * as plugin from 'three-tile/plugin';
import type { ISource } from 'three-tile';

export type TextureMode = 'satellite' | 'roadmap';

const ESRI_IMAGERY =
  'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

const ESRI_STREETS =
  'https://services.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';

export function createImagerySource(mode: TextureMode, maxLevel = 17): ISource {
  if (mode === 'roadmap') {
    const src = new plugin.ArcGisSource({
      style: 'World_Street_Map',
      url: ESRI_STREETS,
    });
    src.maxLevel = maxLevel;
    return src;
  }

  // Esri World Imagery — reliable CORS, works without third-party mirrors.
  const esri = new plugin.ArcGisSource({
    style: 'World_Imagery',
    url: ESRI_IMAGERY,
  });
  esri.maxLevel = Math.min(maxLevel, 19);
  return esri;
}

export function createDemSource(maxLevel = 17): ISource {
  const src = new plugin.ArcGisDemSource();
  src.maxLevel = Math.min(maxLevel, 13);
  return src;
}

export function nextTextureMode(mode: TextureMode): TextureMode {
  return mode === 'satellite' ? 'roadmap' : 'satellite';
}
