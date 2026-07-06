import * as THREE from 'three';
import * as tt from 'three-tile';
import 'three-tile/plugin';
import type { TextureMode } from './tileSources.ts';
import { createDemSource, createImagerySource } from './tileSources.ts';
import { enhanceTileTexture, getTileAnisotropy } from './configureTileRendering.ts';

function nearestMeridian(lon: number): 0 | 90 | -90 {
  const options: (0 | 90 | -90)[] = [0, 90, -90];
  let best = options[0];
  let bestDist = Math.abs(lon - best);
  for (const m of options) {
    const d = Math.abs(lon - m);
    if (d < bestDist) {
      best = m;
      bestDist = d;
    }
  }
  return best;
}

export interface SpawnLocation {
  lat: number;
  lon: number;
  altM: number;
  headingDeg: number;
  label: string;
}

/**
 * Keeps the aircraft near local (0,0,0) for float precision by offsetting the tile map.
 */
export class TerrainManager {
  readonly group = new THREE.Group();
  private map: tt.TileMap | null = null;
  private textureMode: TextureMode = 'satellite';
  private spawn: SpawnLocation | null = null;
  private spawnLocalGroundY = 0;
  /** Trusted runway elevation (m) used when coarse DEM tiles lie. */
  private spawnGroundElevM = 0;
  private readonly scene: THREE.Scene;
  /** Pre-offset spawn position in map space (used only to position the group). */
  readonly origin = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.scene.add(this.group);
  }

  get tileMap(): tt.TileMap | null {
    return this.map;
  }

  get currentSpawn(): SpawnLocation | null {
    return this.spawn;
  }

  get textureModeName(): TextureMode {
    return this.textureMode;
  }

  async loadAt(location: SpawnLocation, maxLevel: number): Promise<void> {
    if (this.map) {
      this.group.remove(this.map);
      this.map.dispose();
      this.map = null;
    }

    this.spawn = location;
    this.map = tt.TileMap.create({
      imgSource: createImagerySource(this.textureMode, maxLevel),
      demSource: createDemSource(maxLevel),
      lon0: nearestMeridian(location.lon),
      minLevel: 2,
    });
    this.map.maxThreads = 12;
    this.map.LODThreshold = 2.4;
    this.map.updateInterval = 35;
    this.map.rotateX(-Math.PI / 2);
    this.group.add(this.map);

    this.map.addEventListener('tile-loaded', () => this.applyUnlitImagery());

    // Anchor world so spawn is near local origin
    this.origin.copy(
      this.map.geo2world(new THREE.Vector3(location.lon, location.lat, 0)),
    );
    this.group.position.copy(this.origin).negate();

    this.map.reload();

    const spawnXZ = this.geoToLocal(location.lat, location.lon, 0);
    const groundY = this.sampleHeightAtGeo(location.lat, location.lon) || spawnXZ.y;

    const primeCam = new THREE.PerspectiveCamera(60, 1, 0.5, 500_000);

    // Low-altitude pass — loads high-zoom aerial tiles at the runway
    primeCam.position.set(spawnXZ.x + 25, groundY + 28, spawnXZ.z + 25);
    primeCam.lookAt(spawnXZ.x + 80, groundY, spawnXZ.z);
    for (let i = 0; i < 16; i++) {
      this.map.update(primeCam);
      await new Promise((r) => setTimeout(r, 160));
    }

    // Mid-altitude pass — fills surrounding area
    primeCam.position.set(spawnXZ.x, groundY + 350, spawnXZ.z + 180);
    primeCam.lookAt(spawnXZ.x, groundY, spawnXZ.z);
    for (let i = 0; i < 6; i++) {
      this.map.update(primeCam);
      await new Promise((r) => setTimeout(r, 120));
    }

    // Nadir pass — highest zoom satellite at the runway
    primeCam.position.set(spawnXZ.x, groundY + 45, spawnXZ.z + 8);
    primeCam.lookAt(spawnXZ.x, groundY, spawnXZ.z);
    for (let i = 0; i < 8; i++) {
      this.map.update(primeCam);
      await new Promise((r) => setTimeout(r, 150));
    }

    this.applyUnlitImagery();
    this.spawnLocalGroundY = await this.waitForDemAt(
      location.lat,
      location.lon,
      location.altM,
    );

    await new Promise((r) => setTimeout(r, 300));
  }

  cycleTextureMode(maxLevel: number): void {
    if (!this.spawn) return;
    this.textureMode = this.textureMode === 'satellite' ? 'roadmap' : 'satellite';
    void this.loadAt(this.spawn, maxLevel);
  }

  /** Ground elevation (scene Y) at a lat/lon. */
  sampleHeightAtGeo(lat: number, lon: number): number {
    return this.resolveGroundHeight(lat, lon, this.spawn?.altM ?? 0);
  }

  /** Raw DEM raycast — may hit coarse tiles at the wrong height. */
  private sampleHeightAtGeoRaw(lat: number, lon: number): number {
    if (!this.map) return 0;
    const info = this.map.getLocalInfoFromGeo(new THREE.Vector3(lon, lat, 0));
    if (info?.point) return info.point.y;
    return this.sampleHeightAtRaw(this.geoToLocal(lat, lon, 0));
  }

  /** Place aircraft on the DEM with gear on the surface. */
  spawnPosition(lat: number, lon: number, gearOffsetM: number, fallbackAltM = 0): THREE.Vector3 {
    const ground = this.resolveGroundHeight(lat, lon, fallbackAltM);
    const pos = this.geoToLocal(lat, lon, 0);
    pos.y = ground + gearOffsetM;
    return pos;
  }

  /** Wait for high-zoom tiles, then resolve spawn ground (airport elev wins over bad DEM). */
  async waitForDemAt(lat: number, lon: number, fallbackAltM = 0): Promise<number> {
    if (!this.map) return this.resolveGroundHeight(lat, lon, fallbackAltM);

    const primeCam = new THREE.PerspectiveCamera(60, 1, 0.5, 500_000);
    const xz = this.geoToLocal(lat, lon, 0);
    primeCam.position.set(xz.x + 30, 120, xz.z + 30);
    primeCam.lookAt(xz.x, 0, xz.z);

    for (let i = 0; i < 16; i++) {
      this.map.update(primeCam);
      await new Promise((r) => setTimeout(r, 140));
    }

    const ground = this.resolveGroundHeight(lat, lon, fallbackAltM);
    this.spawnLocalGroundY = ground;
    return ground;
  }

  private resolveGroundHeight(lat: number, lon: number, fallbackAltM: number): number {
    const runwayElev = fallbackAltM > 0 ? Math.max(0, fallbackAltM - 3) : 0;
    const raw = this.sampleHeightAtGeoRaw(lat, lon);

    // Trust airport elevation at spawn when DEM is missing or noticeably off
    if (runwayElev > 0 && (raw === 0 || Math.abs(raw - runwayElev) > 12)) {
      this.spawnGroundElevM = runwayElev;
      return runwayElev;
    }

    const ground = raw || runwayElev || this.spawnLocalGroundY;
    this.spawnGroundElevM = ground;
    return ground;
  }

  private readonly recenterThresholdM = 5_000;
  private _primePending = false;

  /**
   * Shift the tile map origin when the focus point drifts far from (0,0,0) on XZ.
   * Y is left alone so repeated recenters don't stack vertical error in group.position.
   * @returns XZ delta applied to scene objects, or null if no shift
   */
  recenterIfNeeded(focus: THREE.Vector3): THREE.Vector3 | null {
    if (!this.map) return null;
    const xzDist = focus.x * focus.x + focus.z * focus.z;
    if (xzDist < this.recenterThresholdM ** 2) return null;

    const shift = new THREE.Vector3(focus.x, 0, focus.z);
    this.group.position.x -= shift.x;
    this.group.position.z -= shift.z;
    this._primePending = true;
    return shift;
  }

  /** Load high-zoom imagery around a map-local focus point (after recenter / long jump). */
  primeTilesAt(focus: THREE.Vector3, groundY?: number): void {
    if (!this.map) return;
    const y = groundY ?? this.sampleHeightAt(focus);
    const primeCam = new THREE.PerspectiveCamera(60, 1, 0.5, 500_000);
    primeCam.position.set(focus.x + 20, y + 35, focus.z + 20);
    primeCam.lookAt(focus.x + 60, y, focus.z);
    for (let i = 0; i < 14; i++) this.map.update(primeCam);
    primeCam.position.set(focus.x, y + 55, focus.z + 6);
    primeCam.lookAt(focus.x, y, focus.z);
    for (let i = 0; i < 8; i++) this.map.update(primeCam);
    this.applyUnlitImagery();
    this._primePending = false;
  }

  consumePrimePending(): boolean {
    const pending = this._primePending;
    this._primePending = false;
    return pending;
  }

  scenePositionForGeo(lat: number, lon: number, altM: number): THREE.Vector3 {
    return this.geoToLocal(lat, lon, altM);
  }

  private approxDistM(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const dy = (lat1 - lat2) * 111_000;
    const dx = (lon1 - lon2) * 111_000 * Math.cos((lat1 * Math.PI) / 180);
    return Math.hypot(dx, dy);
  }

  update(camera: THREE.Camera): void {
    if (!this.map) return;
    this.map.update(camera);
    if (this._unlitTick++ % 8 === 0) {
      this.applyUnlitImagery();
    }
  }

  private _unlitTick = 0;

  /** Replace lit terrain materials so satellite JPEGs are visible. */
  private applyUnlitImagery(): void {
    if (!this.map) return;
    this.map.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      let changed = false;
      const next = materials.map((mat) => {
        if (mat.map) enhanceTileTexture(mat.map, getTileAnisotropy());
        if (mat instanceof THREE.MeshBasicMaterial) return mat;
        if (!(mat instanceof THREE.MeshStandardMaterial) || !mat.map) return mat;
        changed = true;
        enhanceTileTexture(mat.map, getTileAnisotropy());
        const basic = new THREE.MeshBasicMaterial({
          map: mat.map,
          side: THREE.FrontSide,
          transparent: mat.transparent,
          opacity: mat.opacity,
        });
        mat.dispose();
        return basic;
      });
      if (changed) {
        obj.material = Array.isArray(obj.material) ? next : next[0];
      }
    });
  }

  /** Geographic → scene coordinates (group offset keeps values near the spawn). */
  geoToLocal(lat: number, lon: number, altM: number): THREE.Vector3 {
    if (!this.map) return new THREE.Vector3();
    return this.map.geo2world(new THREE.Vector3(lon, lat, altM));
  }

  sampleHeightAt(localPos: THREE.Vector3): number {
    if (!this.map) return this.spawnLocalGroundY;
    const raw = this.sampleHeightAtRaw(localPos);
    if (this.spawn && this.spawnGroundElevM > 0) {
      const geo = this.map.world2geo(localPos.clone());
      const dist = this.approxDistM(geo.y, geo.x, this.spawn.lat, this.spawn.lon);
      // Only flatten bad DEM at the airport — not across the whole 4 km tile radius
      if (
        dist < 900 &&
        (raw === 0 || Math.abs(raw - this.spawnGroundElevM) > 35)
      ) {
        return this.spawnGroundElevM;
      }
    }
    return raw || this.spawnGroundElevM || this.spawnLocalGroundY;
  }

  private sampleHeightAtRaw(localPos: THREE.Vector3): number {
    if (!this.map) return 0;
    const geo = this.map.world2geo(localPos.clone());
    const info = this.map.getLocalInfoFromGeo(geo);
    if (info?.point) return info.point.y;

    const probe = new THREE.Vector3(localPos.x, localPos.y + 50_000, localPos.z);
    const hit = this.map.getLocalInfoFromWorld(probe);
    if (hit?.point) return hit.point.y;
    return 0;
  }

  dispose(): void {
    if (this.map) {
      this.group.remove(this.map);
      this.map.dispose();
      this.map = null;
    }
    this.scene.remove(this.group);
  }
}
