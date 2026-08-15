import * as THREE from 'three';
import * as tt from 'three-tile';
import 'three-tile/plugin';
import type { TextureMode } from './tileSources.ts';
import {
  createDemSource,
  createImagerySources,
  currentSatelliteProviderName,
  satelliteBestQualityMinZ,
  satelliteLodThreshold,
  satelliteMaxThreads,
  satellitePrimeLodThreshold,
} from './tileSources.ts';

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

export interface ImageryStats {
  maxZ: number;
  meshes: number;
  withMap: number;
  highZoomWithMap: number;
  brownNoMap: number;
  downloading: number;
}

export interface TileDetailResult {
  maxZ: number;
  ready: boolean;
  stats: ImageryStats;
}

export type TileDetailProgress = (info: {
  maxZ: number;
  targetZ: number;
  ready: boolean;
  stats: ImageryStats;
}) => void;

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
  /**
   * Cumulative horizontal shift applied to keep aircraft coords near zero.
   * Map/tile space = local scene position + sceneOrigin.
   */
  private readonly sceneOrigin = new THREE.Vector3();
  private readonly _mapPosScratch = new THREE.Vector3();

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

  setUpdateInterval(ms: number): void {
    if (this.map) this.map.updateInterval = ms;
  }

  /**
   * Bypass TileMap's interval timer so every call actually runs LOD.
   * `map.update()` often no-ops when called multiple times in the same tick.
   */
  private forceMapUpdate(camera: THREE.Camera): void {
    if (!this.map) return;
    const map = this.map as tt.TileMap & {
      rootTile: { update: (p: Record<string, unknown>) => void };
      loader: unknown;
    };
    map.rootTile.update({
      camera,
      loader: map.loader,
      minLevel: map.minLevel,
      maxLevel: map.maxLevel,
      LODThreshold: map.LODThreshold,
    });
  }

  /** Wait until the tile download queue has headroom so three-tile will run LOD again. */
  private async waitForDownloadHeadroom(maxBusy?: number, timeoutMs = 4_000): Promise<void> {
    if (!this.map) return;
    const busy = maxBusy ?? Math.max(10, this.map.maxThreads - 6);
    const deadline = performance.now() + timeoutMs;
    while (this.map.downloading > busy && performance.now() < deadline) {
      await new Promise((r) => setTimeout(r, 40));
    }
  }

  async loadAt(location: SpawnLocation, maxLevel: number, minLevel = 8): Promise<void> {
    if (this.map) {
      this.group.remove(this.map);
      this.map.dispose();
      this.map = null;
    }

    this.spawn = location;
    this.spawnGroundElevM = 0;
    this._hasPrimeAnchor = false;
    this._recenterBoost = 0;
    this.sceneOrigin.set(0, 0, 0);
    this.map = tt.TileMap.create({
      imgSource: createImagerySources(this.textureMode, maxLevel),
      demSource: createDemSource(maxLevel),
      lon0: nearestMeridian(location.lon),
      minLevel,
    });
    this.map.maxThreads = satelliteMaxThreads(false);
    this.map.LODThreshold = satelliteLodThreshold();
    this.map.updateInterval = 16;
    this.map.rotateX(-Math.PI / 2);
    this.group.add(this.map);

    this.origin.copy(
      this.map.geo2world(new THREE.Vector3(location.lon, location.lat, 0)),
    );
    this.group.position.copy(this.origin).negate();

    this.map.reload();

    const spawnXZ = this.geoToLocal(location.lat, location.lon, 0);

    this.spawnLocalGroundY = await this.waitForDemAt(
      location.lat,
      location.lon,
      location.altM,
    );
    if (this.spawnLocalGroundY < 1 && location.altM > 3) {
      this.spawnLocalGroundY = Math.max(0, location.altM - 3);
      this.spawnGroundElevM = this.spawnLocalGroundY;
    }
    await this.primeImageryAt(spawnXZ, this.spawnLocalGroundY);

    // Final ground pass after imagery prime — DEM may have refined during prime.
    const ground = this.resolveGroundHeight(location.lat, location.lon, location.altM);
    this.spawnLocalGroundY = ground;
    this.spawnGroundElevM = ground;

    await this.waitForTileDetail(spawnXZ, ground, satelliteBestQualityMinZ(), 45_000);
  }

  /** Block until high-zoom tiles are textured and downloads have settled. */
  async waitForTileDetail(
    focus: THREE.Vector3,
    groundY: number,
    minZ: number,
    timeoutMs: number,
    onProgress?: TileDetailProgress,
  ): Promise<TileDetailResult> {
    const empty: ImageryStats = {
      maxZ: 0,
      meshes: 0,
      withMap: 0,
      highZoomWithMap: 0,
      brownNoMap: 0,
      downloading: 0,
    };
    if (!this.map) return { maxZ: 0, ready: false, stats: empty };

    const savedInterval = this.map.updateInterval;
    const savedLod = this.map.LODThreshold;
    const savedThreads = this.map.maxThreads;
    this.map.updateInterval = 0;
    this.map.LODThreshold = satellitePrimeLodThreshold();
    this.map.maxThreads = satelliteMaxThreads(true);

    const primeCam = new THREE.PerspectiveCamera(50, 1, 0.2, 500_000);
    const y = Number.isFinite(groundY) ? groundY : 0;
    // Stay very close to the surface so distRatio keeps refining toward maxLevel.
    primeCam.position.set(focus.x, y + 4, focus.z + 2);
    primeCam.lookAt(focus.x, y, focus.z);
    primeCam.updateMatrixWorld(true);

    const deadline = performance.now() + timeoutMs;
    let maxZ = 0;
    let stablePasses = 0;
    let ready = false;
    let stats = empty;
    let camHop = 0;
    while (performance.now() < deadline) {
      await this.waitForDownloadHeadroom();

      // Hold the nadir camera on the pad until we near target zoom, then micro-hop.
      if (maxZ >= minZ - 2) {
        camHop = (camHop + 1) % 4;
      }
      const ox = maxZ >= minZ - 2 ? (camHop % 2) * 2.5 - 1.25 : 0;
      const oz = maxZ >= minZ - 2 ? Math.floor(camHop / 2) * 2.5 - 1.25 : 0;
      primeCam.position.set(focus.x + ox, y + 3.2, focus.z + oz + 1.2);
      primeCam.lookAt(focus.x, y, focus.z);
      primeCam.updateMatrixWorld(true);

      this.forceMapUpdate(primeCam);
      await new Promise((r) => setTimeout(r, 100));

      stats = this.collectImageryStats(minZ, focus, 1_200);
      maxZ = stats.maxZ;
      ready = this.imageryReady(minZ, stats);
      onProgress?.({ maxZ, targetZ: minZ, ready, stats });
      if (ready) {
        stablePasses++;
        if (stablePasses >= 3) break;
      } else {
        stablePasses = 0;
      }
    }

    this.map.updateInterval = savedInterval;
    this.map.LODThreshold = savedLod;
    this.map.maxThreads = savedThreads;
    ready = this.imageryReady(minZ, stats) && stablePasses >= 3;
    if (!ready) {
      console.warn(
        '[terrain] satellite detail incomplete after wait',
        { provider: currentSatelliteProviderName(), minZ, ...stats },
      );
    }
    return { maxZ, ready, stats };
  }

  /** True when near-aircraft satellite tiles meet best-quality zoom for the active provider. */
  isBestQuality(focus?: THREE.Vector3, radiusM = 2_500): boolean {
    const minZ = satelliteBestQualityMinZ();
    return this.imageryReady(minZ, this.collectImageryStats(minZ, focus, radiusM));
  }

  /** Keep satellite downloads moving while other assets load. */
  tickImageryAt(focus: THREE.Vector3, groundY?: number): void {
    if (!this.map) return;
    const y = Number.isFinite(groundY) ? groundY! : this.sampleHeightAt(focus);
    this.lodCamera.position.set(focus.x, y + 15, focus.z + 6);
    this.lodCamera.lookAt(focus.x, y, focus.z);
    this.lodCamera.updateMatrixWorld(true);
    this.map.update(this.lodCamera);
  }

  imageryStats(minZ = 10, focus?: THREE.Vector3, radiusM = 0): ImageryStats {
    return this.collectImageryStats(minZ, focus, radiusM);
  }

  private collectImageryStats(
    minZ: number,
    focus?: THREE.Vector3,
    radiusM = 0,
  ): ImageryStats {
    const stats: ImageryStats = {
      maxZ: 0,
      meshes: 0,
      withMap: 0,
      highZoomWithMap: 0,
      brownNoMap: 0,
      downloading: this.map?.downloading ?? 0,
    };
    if (!this.map) return stats;

    const r2 = radiusM > 0 && focus ? radiusM * radiusM : 0;
    const tmp = new THREE.Vector3();

    this.map.traverse((o) => {
      const parent = o.parent as { z?: number } | null;
      if (!(o as THREE.Mesh).isMesh || parent?.z == null) return;

      if (r2 > 0 && focus) {
        o.getWorldPosition(tmp);
        const dx = tmp.x - focus.x;
        const dz = tmp.z - focus.z;
        if (dx * dx + dz * dz > r2) return;
      }

      stats.meshes++;
      if (parent.z > stats.maxZ) stats.maxZ = parent.z;

      const mesh = o as THREE.Mesh;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      let hasMap = false;
      for (const m of mats) {
        const mat = m as THREE.MeshBasicMaterial;
        if (mat.map) {
          hasMap = true;
          stats.withMap++;
        } else if (mat.color?.getHex?.() === 0x3a4a38) {
          stats.brownNoMap++;
        }
      }
      if (hasMap && parent.z >= minZ) stats.highZoomWithMap++;
    });
    return stats;
  }

  private imageryReady(minZ: number, stats: ImageryStats): boolean {
    const minHighZoom = minZ >= 18 ? 18 : minZ >= 16 ? 14 : minZ >= 12 ? 10 : 6;
    return (
      stats.maxZ >= minZ &&
      stats.highZoomWithMap >= minHighZoom &&
      stats.brownNoMap === 0
    );
  }

  cycleTextureMode(maxLevel: number, minLevel = 8): void {
    if (!this.spawn) return;
    this.textureMode = this.textureMode === 'satellite' ? 'roadmap' : 'satellite';
    void this.loadAt(this.spawn, maxLevel, minLevel);
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

    const savedInterval = this.map.updateInterval;
    this.map.updateInterval = 0;

    const primeCam = new THREE.PerspectiveCamera(60, 1, 0.5, 500_000);
    const xz = this.geoToLocal(lat, lon, 0);
    primeCam.position.set(xz.x + 30, 200, xz.z + 30);
    primeCam.lookAt(xz.x, 0, xz.z);
    primeCam.updateMatrixWorld(true);

    for (let i = 0; i < 40; i++) {
      this.forceMapUpdate(primeCam);
      await new Promise((r) => setTimeout(r, 80));
    }

    this.map.updateInterval = savedInterval;

    const ground = this.resolveGroundHeight(lat, lon, fallbackAltM);
    this.spawnLocalGroundY = ground;
    return ground;
  }

  /** Prime high-zoom satellite tiles at a map-local point (after DEM is ready). */
  async primeImageryAt(focus: THREE.Vector3, groundY: number): Promise<void> {
    if (!this.map) return;

    const savedInterval = this.map.updateInterval;
    const savedLod = this.map.LODThreshold;
    const savedThreads = this.map.maxThreads;
    this.map.updateInterval = 0;
    this.map.LODThreshold = satellitePrimeLodThreshold();
    this.map.maxThreads = satelliteMaxThreads(true);

    const primeCam = new THREE.PerspectiveCamera(50, 1, 0.2, 500_000);
    const y = Number.isFinite(groundY) ? groundY : this.sampleHeightAt(focus);

    const prime = (px: number, py: number, pz: number, lx: number, ly: number, lz: number, n: number) => {
      primeCam.position.set(px, py, pz);
      primeCam.lookAt(lx, ly, lz);
      primeCam.updateMatrixWorld(true);
      for (let i = 0; i < n; i++) {
        this.forceMapUpdate(primeCam);
      }
    };

    for (let i = 0; i < 40; i++) {
      await this.waitForDownloadHeadroom();
      const ox = ((i % 3) - 1) * 2.5;
      const oz = (Math.floor(i / 3) % 3 - 1) * 2.5;
      prime(focus.x + ox, y + 3.5, focus.z + oz + 1.5, focus.x, y, focus.z, 1);
      await new Promise((r) => setTimeout(r, 80));
    }

    await this.waitForDownloadHeadroom();
    prime(focus.x, y + 3, focus.z + 1.5, focus.x, y, focus.z, 2);
    await new Promise((r) => setTimeout(r, 150));

    this.map.updateInterval = savedInterval;
    this.map.LODThreshold = savedLod;
    this.map.maxThreads = savedThreads;
    this._primePending = false;
  }

  private resolveGroundHeight(lat: number, lon: number, fallbackAltM: number): number {
    const runwayElev = fallbackAltM > 0 ? Math.max(0, fallbackAltM - 3) : 0;
    const raw = this.sampleHeightAtGeoRaw(lat, lon);
    const dem = Math.abs(raw) < 0.5 ? 0 : raw;

    if (runwayElev > 0 && (dem === 0 || Math.abs(dem - runwayElev) > 12)) {
      this.spawnGroundElevM = runwayElev;
      return runwayElev;
    }

    const ground = dem || runwayElev || this.spawnLocalGroundY;
    this.spawnGroundElevM = ground;
    return ground;
  }

  /**
   * Shift the tile map origin when the focus drifts far from (0,0,0).
   * @returns delta applied to scene objects, or null if no shift
   */
  recenterIfNeeded(focus: THREE.Vector3): THREE.Vector3 | null {
    if (!this.map) return null;
    const dx = focus.x;
    const dz = focus.z;
    if (dx * dx + dz * dz < this.recenterThresholdM ** 2) return null;

    // Horizontal only — shifting Y corrupts DEM heights after flying at altitude.
    const shift = new THREE.Vector3(dx, 0, dz);
    this.sceneOrigin.add(shift);
    this.group.position.sub(shift);
    this._primePending = true;
    return shift;
  }

  /** Local scene position → three-tile map coordinates (stable across recenters). */
  private toMapPosition(localPos: THREE.Vector3, out = this._mapPosScratch): THREE.Vector3 {
    return out.copy(localPos).add(this.sceneOrigin);
  }

  /** Load high-zoom imagery around a map-local focus point (after recenter / long jump). */
  primeTilesAt(focus: THREE.Vector3, groundY?: number): void {
    if (!this.map) return;
    const y = groundY ?? this.sampleHeightAt(focus);
    void this.primeImageryAt(focus, y);
  }

  private readonly recenterThresholdM = 2_500;
  private _primePending = false;
  private _viewDebounce: ReturnType<typeof setTimeout> | null = null;

  /**
   * Re-prime after camera mode changes. Debounced so rapid C C does not overlap primes.
   */
  onViewChanged(focus: THREE.Vector3, camera: THREE.Camera): Promise<void> {
    if (!this.map) return Promise.resolve();
    const f = focus.clone();
    return new Promise((resolve) => {
      if (this._viewDebounce) clearTimeout(this._viewDebounce);
      this._viewDebounce = setTimeout(() => {
        this._viewDebounce = null;
        void this.runViewChanged(f, camera).then(resolve);
      }, 300);
    });
  }

  private async runViewChanged(focus: THREE.Vector3, camera: THREE.Camera): Promise<void> {
    if (!this.map) return;
    const groundY = this.sampleHeightAt(focus);
    await this.refreshImageryLod(focus);
    await this.primeImageryAlongView(focus, groundY, camera);
    await this.waitForTileDetail(focus, groundY, satelliteBestQualityMinZ(), 40_000);
  }

  /** Prime nadir tiles along the chase-camera ground path (horizon view stays coarse otherwise). */
  private async primeImageryAlongView(
    focus: THREE.Vector3,
    groundY: number,
    camera: THREE.Camera,
  ): Promise<void> {
    if (!this.map) return;
    const savedInterval = this.map.updateInterval;
    const savedLod = this.map.LODThreshold;
    const savedThreads = this.map.maxThreads;
    this.map.updateInterval = 0;
    this.map.LODThreshold = satellitePrimeLodThreshold();
    this.map.maxThreads = satelliteMaxThreads(true);

    const primeCam = new THREE.PerspectiveCamera(50, 1, 0.2, 500_000);
    const y = Number.isFinite(groundY) ? groundY : 0;
    const points: THREE.Vector3[] = [focus.clone()];

    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const camPos = camera.position;
    if (dir.y < -0.02) {
      const hitDist = (y - camPos.y) / dir.y;
      if (hitDist > 0) {
        for (const t of [0.2, 0.45, 0.7, 1]) {
          points.push(camPos.clone().addScaledVector(dir, hitDist * t));
        }
      }
    }

    for (const pt of points) {
      primeCam.position.set(pt.x, y + 4, pt.z + 1.5);
      primeCam.lookAt(pt.x, y, pt.z);
      primeCam.updateMatrixWorld(true);
      for (let i = 0; i < 28; i++) this.forceMapUpdate(primeCam);
      await new Promise((r) => setTimeout(r, 40));
    }

    this.map.updateInterval = savedInterval;
    this.map.LODThreshold = savedLod;
    this.map.maxThreads = savedThreads;
  }

  /** Fast nadir LOD refresh after recenter (not full imagery re-download). */
  private async refreshImageryLod(focus: THREE.Vector3): Promise<void> {
    if (!this.map) return;
    const savedInterval = this.map.updateInterval;
    const savedLod = this.map.LODThreshold;
    const savedThreads = this.map.maxThreads;
    this.map.updateInterval = 0;
    this.map.LODThreshold = satellitePrimeLodThreshold();
    this.map.maxThreads = satelliteMaxThreads(true);

    const primeCam = new THREE.PerspectiveCamera(50, 1, 0.2, 500_000);
    const y = this.sampleHeightAt(focus);
    primeCam.position.set(focus.x, y + 4, focus.z + 2);
    primeCam.lookAt(focus.x, y, focus.z);
    primeCam.updateMatrixWorld(true);

    for (let i = 0; i < 48; i++) {
      this.forceMapUpdate(primeCam);
      await new Promise((r) => setTimeout(r, 35));
    }

    this.map.updateInterval = savedInterval;
    this.map.LODThreshold = savedLod;
    this.map.maxThreads = savedThreads;
  }

  consumePrimePending(): boolean {
    const pending = this._primePending;
    this._primePending = false;
    return pending;
  }

  scenePositionForGeo(lat: number, lon: number, altM: number): THREE.Vector3 {
    return this.geoToLocal(lat, lon, altM);
  }

  localToGeo(localPos: THREE.Vector3): { lat: number; lon: number; altM: number } {
    if (!this.map) {
      return {
        lat: this.spawn?.lat ?? 0,
        lon: this.spawn?.lon ?? 0,
        altM: localPos.y,
      };
    }
    const geo = this.map.world2geo(this.toMapPosition(localPos));
    return { lat: geo.y, lon: geo.x, altM: geo.z };
  }

  private approxDistM(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const dy = (lat1 - lat2) * 111_000;
    const dx = (lon1 - lon2) * 111_000 * Math.cos((lat1 * Math.PI) / 180);
    return Math.hypot(dx, dy);
  }

  update(
    camera: THREE.Camera,
    focus?: THREE.Vector3,
    motion?: { velocity: THREE.Vector3; aglM: number },
  ): void {
    if (!this.map) return;
    const lodCam = this.lodCameraFor(camera, focus, motion);
    this.map.update(lodCam);

    if (motion && motion.velocity.length() > 35) {
      const lead = this.lodCameraFor(camera, focus, motion, 1);
      this.map.update(lead);
    }

    if (focus) {
      this.maybePrimeAlongPath(focus, motion?.aglM ?? 0);
    }

    if (this._recenterBoost > 0) {
      this._recenterBoost--;
      if (this._recenterBoost === 0 && this._normalUpdateInterval >= 0) {
        this.map.updateInterval = this._normalUpdateInterval;
      }
    }
  }

  /** Soft reprime every ~900 m so scenery stays sharp away from spawn. */
  private maybePrimeAlongPath(focus: THREE.Vector3, aglM: number): void {
    if (!this.map) return;
    if (!this._hasPrimeAnchor) {
      this._lastPrimeX = focus.x;
      this._lastPrimeZ = focus.z;
      this._hasPrimeAnchor = true;
      return;
    }
    const dx = focus.x - this._lastPrimeX;
    const dz = focus.z - this._lastPrimeZ;
    if (dx * dx + dz * dz < this.primeEveryM ** 2) return;
    this._lastPrimeX = focus.x;
    this._lastPrimeZ = focus.z;

    // High-altitude cruise doesn't need nadir z16 under the aircraft.
    if (aglM > 900) return;

    const y = this.sampleHeightAt(focus);
    this._recenterBoost = Math.max(this._recenterBoost, 45);
    this._normalUpdateInterval = this.map.updateInterval;
    this.map.updateInterval = 0;
    void this.refreshImageryLod(focus);
    void this.primeImageryAt(focus, y);
  }

  /** Aggressive tile refresh after origin shift (prevents the forward "cliff"). */
  onRecenter(focus: THREE.Vector3): void {
    if (!this.map) return;
    this._recenterBoost = 120;
    this._normalUpdateInterval = this.map.updateInterval;
    this.map.updateInterval = 0;
    this._lastPrimeX = focus.x;
    this._lastPrimeZ = focus.z;
    this._hasPrimeAnchor = true;
    const y = this.sampleHeightAt(focus);
    void this.refreshImageryLod(focus);
    void this.primeImageryAt(focus, y);
  }

  private _recenterBoost = 0;
  private _normalUpdateInterval = 16;
  private _lastPrimeX = 0;
  private _lastPrimeZ = 0;
  private _hasPrimeAnchor = false;
  private readonly primeEveryM = 900;

  private readonly lodCamera = new THREE.PerspectiveCamera(60, 1, 0.5, 500_000);
  private readonly _lodLook = new THREE.Vector3();

  private lodCameraFor(
    viewCamera: THREE.Camera,
    focus?: THREE.Vector3,
    motion?: { velocity: THREE.Vector3; aglM: number },
    leadScale = 0.65,
  ): THREE.Camera {
    if (!focus) return viewCamera;
    const groundY = this.sampleHeightAt(focus);
    const agl = Math.max(0, motion?.aglM ?? 0);
    // Cap LOD camera height — a 1200 m camera collapses tiles to soft mid-zoom.
    // Low AGL / pattern flying needs near-nadir for sharp satellite.
    const lodAgl =
      agl < 80 ? Math.max(4, agl) : agl < 250 ? Math.min(agl, 120) : Math.min(agl, 380);
    const camH = groundY + lodAgl;

    let lx = focus.x;
    let lz = focus.z;
    const vel = motion?.velocity;
    if (vel) {
      const hx = vel.x;
      const hz = vel.z;
      const hlen = Math.hypot(hx, hz);
      if (hlen > 8) {
        const lead = Math.min(2200, hlen * 5.5) * leadScale;
        lx += (hx / hlen) * lead;
        lz += (hz / hlen) * lead;
      }
    }

    this.lodCamera.position.set(lx, camH, lz);
    this._lodLook.set(lx, groundY, lz);
    this.lodCamera.lookAt(this._lodLook);
    this.lodCamera.updateMatrixWorld(true);
    return this.lodCamera;
  }

  /** Geographic → scene coordinates (group offset keeps values near the spawn). */
  geoToLocal(lat: number, lon: number, altM: number): THREE.Vector3 {
    if (!this.map) return new THREE.Vector3();
    return this.map
      .geo2world(new THREE.Vector3(lon, lat, altM))
      .clone()
      .sub(this.sceneOrigin);
  }

  sampleHeightAt(localPos: THREE.Vector3): number {
    if (!this.map) return this.spawnLocalGroundY;
    const raw = this.sampleHeightAtRaw(localPos);
    if (this.spawn && this.spawnGroundElevM > 0) {
      const geo = this.map.world2geo(this.toMapPosition(localPos));
      const dist = this.approxDistM(geo.y, geo.x, this.spawn.lat, this.spawn.lon);
      if (dist < 900) {
        if (raw === 0 || Math.abs(raw) < 0.5) return this.spawnGroundElevM;
        // DEM mesh above runway database — trust mesh so the aircraft doesn't sink.
        if (raw > this.spawnGroundElevM + 2) return raw;
        // Coarse/wrong tile far from runway elev — trust database.
        if (Math.abs(raw - this.spawnGroundElevM) > 35) return this.spawnGroundElevM;
        return raw;
      }
      if (dist < 2000 && (raw === 0 || Math.abs(raw - this.spawnGroundElevM) > 35)) {
        return this.spawnGroundElevM;
      }
    }
    return raw || this.spawnGroundElevM || this.spawnLocalGroundY;
  }

  private sampleHeightAtRaw(localPos: THREE.Vector3): number {
    if (!this.map) return 0;
    const mapPos = this.toMapPosition(localPos);
    const geo = this.map.world2geo(mapPos);
    const info = this.map.getLocalInfoFromGeo(geo);
    if (info?.point) {
      const y = info.point.y;
      return Math.abs(y) < 0.5 ? 0 : y;
    }

    const probe = new THREE.Vector3(localPos.x, localPos.y + 50_000, localPos.z);
    const hit = this.map.getLocalInfoFromWorld(probe);
    if (hit?.point) {
      const y = hit.point.y;
      return Math.abs(y) < 0.5 ? 0 : y;
    }
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
