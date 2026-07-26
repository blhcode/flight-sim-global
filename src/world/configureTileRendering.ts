import * as THREE from 'three';
import * as tt from 'three-tile';
import { enhanceTileBitmap } from './enhanceTileImage.ts';
import { esriImageryTileUrl } from './tileSources.ts';

let configured = false;
const enhancedTextures = new WeakSet<THREE.Texture>();

/** Sharpen tile imagery for low-altitude / runway views. */
export function enhanceTileTexture(texture: THREE.Texture, anisotropy = 4): void {
  if (enhancedTextures.has(texture)) return;
  enhancedTextures.add(texture);

  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.anisotropy = anisotropy;
  texture.needsUpdate = true;
}

type TileLoadParams = {
  z: number;
  x?: number;
  y?: number;
  clipBounds: number[];
};

type TileImageLoader = tt.TileImageLoader & {
  doLoad: (url: string, params: TileLoadParams) => Promise<THREE.Texture>;
};

/** Satellite/road imagery must be unlit — MeshStandardMaterial looks flat green/grey on terrain. */
export function configureTileRendering(): void {
  if (configured) return;
  configured = true;

  const loader = tt.getImgLoader('image') as TileImageLoader;
  loader.material = new THREE.MeshBasicMaterial({
    side: THREE.FrontSide,
  });

  const originalLoad = loader.doLoad.bind(loader);
  loader.doLoad = async (url, params) => {
    let texture: THREE.Texture;
    try {
      texture = await originalLoad(url, params);
      const image = texture.image as HTMLImageElement | HTMLCanvasElement | undefined;
      if (!image || !('width' in image) || image.width < 4) throw new Error('empty');
    } catch {
      if (params.x == null || params.y == null) throw new Error('tile load failed');
      // Esri only has sharp data to ~z13. Using it as a high-z fallback paints soft upscales
      // that still count as "textured" and fool the HQ gate.
      if (params.z > 13) throw new Error('tile load failed');
      texture = await originalLoad(esriImageryTileUrl(params.z, params.x, params.y), params);
    }

    const image = texture.image as HTMLImageElement | HTMLCanvasElement | undefined;
    if (!image || !('width' in image) || image.width < 4) return texture;

    try {
      // Sharpen high-zoom tiles for all providers (Google was previously skipped and looked soft).
      if (params.z >= 14) {
        const enhanced = enhanceTileBitmap(image, image.width, image.height, params.z);
        texture.image = enhanced;
        texture.needsUpdate = true;
      }
      enhanceTileTexture(texture, getTileAnisotropy());
    } catch {
      enhanceTileTexture(texture, getTileAnisotropy());
    }
    return texture;
  };
}

export function setTileAnisotropy(renderer: THREE.WebGLRenderer): void {
  configureTileRendering();
  const max = renderer.capabilities.getMaxAnisotropy();
  _anisotropy = Math.min(16, max);
}

let _anisotropy = 8;
export function getTileAnisotropy(): number {
  return _anisotropy;
}
