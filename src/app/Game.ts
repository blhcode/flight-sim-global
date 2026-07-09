import * as THREE from 'three';
import { defaultConfig, PHYSICS_DT, qualitySettings } from './config.ts';
import { SceneManager } from '../rendering/SceneManager.ts';
import { Atmosphere } from '../world/Atmosphere.ts';
import { TerrainManager, type SpawnLocation } from '../world/TerrainManager.ts';
import { getAircraftDefinition } from '../aircraft/registry.ts';
import { AircraftInstance } from '../aircraft/AircraftInstance.ts';
import { CameraRig } from '../rendering/CameraRig.ts';
import { InputManager } from '../controls/InputManager.ts';
import { FlightControls } from '../controls/FlightControls.ts';
import { InstrumentPanel } from '../hud/InstrumentPanel.ts';
import { EngineAudio } from '../audio/EngineAudio.ts';
import { LoadingScreen } from '../ui/LoadingScreen.ts';
import { SpawnPanel, type SpawnRequest } from '../ui/SpawnPanel.ts';
import { NavigationMap } from '../ui/NavigationMap.ts';
import { getGearDebug } from '../rendering/landingGear.ts';
import type { TileMap } from 'three-tile';

export type GamePhase = 'menu' | 'loading' | 'flying';

export class Game {
  private readonly canvas: HTMLCanvasElement;
  private readonly sceneManager: SceneManager;
  private readonly atmosphere: Atmosphere;
  private readonly terrain: TerrainManager;
  private readonly spawnPanel: SpawnPanel;
  private readonly loadingScreen: LoadingScreen;
  private readonly hud: InstrumentPanel;
  private readonly navMap: NavigationMap;
  private readonly input: InputManager;
  private readonly audio = new EngineAudio();

  private aircraft: AircraftInstance | null = null;
  private cameraRig: CameraRig | null = null;
  private flightControls: FlightControls | null = null;

  private phase: GamePhase = 'menu';
  private physicsAccumulator = 0;
  private lastTime = 0;
  private rafId = 0;
  private maxTileLevel = defaultConfig.maxTileLevel;
  private terrainWarmupFrames = 0;

  constructor(container: HTMLElement) {
    container.innerHTML = '';
    container.className = 'game-root';

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'game-canvas';
    container.appendChild(this.canvas);

    this.sceneManager = new SceneManager(this.canvas, defaultConfig.quality);
    this.atmosphere = new Atmosphere(this.sceneManager.scene);
    this.atmosphere.applyFog(this.sceneManager.scene, defaultConfig.fog);
    this.atmosphere.syncSunLight(this.sceneManager.sun);

    this.terrain = new TerrainManager(this.sceneManager.scene);
    this.spawnPanel = new SpawnPanel(container);
    this.loadingScreen = new LoadingScreen(container);
    this.loadingScreen.hide();
    this.hud = new InstrumentPanel(container);
    this.navMap = new NavigationMap(container);
    this.hud.render(
      {
        airspeedKts: 0,
        altitudeFt: 0,
        headingDeg: 0,
        pitchDeg: 0,
        rollDeg: 0,
        verticalSpeedFpm: 0,
        throttle: 0,
        flaps: 0,
        gearDown: true,
        alphaDeg: 0,
        onGround: true,
        stallWarning: false,
        highAlphaWarning: false,
        isStalled: false,
      },
      'cockpit',
    );

    this.input = new InputManager(this.canvas);

    this.spawnPanel.setOnSpawn((req) => void this.startFlight(req));

    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame((t) => this.loop(t));
  }

  private async startFlight(req: SpawnRequest): Promise<void> {
    this.phase = 'loading';
    this.spawnPanel.hide();
    this.loadingScreen.setMessage('Loading terrain…');
    this.loadingScreen.setProgress(0.1);
    this.loadingScreen.show();

    const settings = qualitySettings(defaultConfig.quality);
    this.maxTileLevel = settings.maxTileLevel;

    const location: SpawnLocation = {
      lat: req.lat,
      lon: req.lon,
      altM: req.altM,
      headingDeg: req.headingDeg,
      label: req.label,
    };

    await this.terrain.loadAt(location, this.maxTileLevel, settings.minTileLevel);
    this.loadingScreen.setProgress(0.5);
    this.loadingScreen.setMessage('Loading aircraft…');

    if (this.aircraft) {
      this.sceneManager.scene.remove(this.aircraft.root);
    }

    const def = getAircraftDefinition(req.aircraftId);
    this.audio.setEngineType(def.engineType);
    this.aircraft = new AircraftInstance(def, req.weightProfileId);
    const spawnXZ = this.terrain.scenePositionForGeo(req.lat, req.lon, 0);
    const groundY = this.terrain.sampleHeightAtGeo(req.lat, req.lon);
    const modelLoaded = this.aircraft.loadModel();
    const imageryTicker = (async () => {
      while (true) {
        const done = await Promise.race([
          modelLoaded.then(() => true),
          new Promise<boolean>((r) => setTimeout(() => r(false), 120)),
        ]);
        this.terrain.tickImageryAt(spawnXZ, groundY);
        if (done) break;
      }
    })();
    await Promise.all([modelLoaded, imageryTicker]);
    this.sceneManager.scene.add(this.aircraft.root);

    const worldPos = this.terrain.spawnPosition(
      req.lat,
      req.lon,
      this.aircraft.definition.gearOffsetM,
      req.altM,
    );
    this.aircraft.spawn(worldPos, req.headingDeg);

    this.cameraRig = new CameraRig(this.sceneManager.camera, def);
    this.cameraRig.snapCamera();

    const snapped = this.terrain.spawnPosition(
      req.lat,
      req.lon,
      this.aircraft.definition.gearOffsetM,
      req.altM,
    );
    this.aircraft.respawnAt(snapped, req.headingDeg);

    for (let i = 0; i < 8; i++) {
      this.terrain.update(this.sceneManager.camera, snapped);
      await new Promise((r) => setTimeout(r, 40));
    }

    const seated = this.terrain.spawnPosition(
      req.lat,
      req.lon,
      this.aircraft.definition.gearOffsetM,
      req.altM,
    );
    this.aircraft.respawnAt(seated, req.headingDeg);
    this.cameraRig.snapCamera();

    this.flightControls = new FlightControls(
      this.input,
      this.aircraft,
      () => {
        this.cameraRig?.cycleMode();
        const mode = this.cameraRig?.mode;
        if (this.aircraft && mode === 'outside') {
          this.loadingScreen.setMessage('Loading satellite detail…');
          this.loadingScreen.show();
          void this.terrain
            .onViewChanged(this.aircraft.root.position, this.sceneManager.camera)
            .then(() => {
              const spawn = this.terrain.currentSpawn;
              if (spawn && this.aircraft) {
                const seated = this.terrain.spawnPosition(
                  spawn.lat,
                  spawn.lon,
                  this.aircraft.definition.gearOffsetM,
                  spawn.altM,
                );
                this.aircraft.respawnAt(seated, spawn.headingDeg);
                this.cameraRig?.snapCamera();
              }
              this.loadingScreen.hide();
            });
        } else if (this.aircraft) {
          void this.terrain.onViewChanged(
            this.aircraft.root.position,
            this.sceneManager.camera,
          );
        }
      },
      () => this.terrain.cycleTextureMode(this.maxTileLevel),
    );

    await this.audio.init();
    this.audio.setEngineType(def.engineType);
    this.loadingScreen.setMessage('Loading satellite detail…');
    this.loadingScreen.setProgress(0.85);
    await this.terrain.waitForTileDetail(spawnXZ, groundY, 12, 60_000);
    this.loadingScreen.setProgress(1);
    this.loadingScreen.hide();
    this.phase = 'flying';
    this.input.setFlying(true);
    this.terrainWarmupFrames = 180;
    this.terrain.setUpdateInterval(0);
    if (this.aircraft) this.aircraft.controls.throttle = 0.1;
  }

  private loop(now: number): void {
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;

    if (this.phase === 'flying' && this.aircraft && this.flightControls && this.cameraRig) {
      this.flightControls.update(dt);

      this.physicsAccumulator += dt;
      while (this.physicsAccumulator >= PHYSICS_DT) {
        this.aircraft.update(PHYSICS_DT, (pos) =>
          this.terrain.sampleHeightAt(pos),
        );
        this.physicsAccumulator -= PHYSICS_DT;
      }

    const shift = this.terrain.recenterIfNeeded(this.aircraft.root.position);
    if (shift && this.aircraft.body) {
      this.aircraft.root.position.sub(shift);
      this.aircraft.body.state.position.sub(shift);
      this.aircraft.body.resetGroundContact();
      this.terrain.onRecenter(this.aircraft.root.position);
    }

      const telem = this.aircraft.getTelemetry();
      const bodyVel = this.aircraft.body?.state.velocity;
      this.cameraRig.update(this.aircraft.root, this.aircraft.visualModel, {
        dt,
        onGround: this.aircraft.onGround,
        speedKts: telem.airspeedKts,
      });
      this.terrain.update(this.sceneManager.camera, this.aircraft.root.position, {
        velocity: bodyVel ?? new THREE.Vector3(),
        aglM: telem.altitudeFt * 0.3048,
      });

      const speedMs = bodyVel?.length() ?? 0;
      if (this.terrainWarmupFrames === 0 && speedMs > 45) {
        this.terrain.setUpdateInterval(0);
      } else if (this.terrainWarmupFrames === 0 && speedMs < 25) {
        this.terrain.setUpdateInterval(16);
      }
      if (this.terrainWarmupFrames > 0) {
        this.terrainWarmupFrames--;
        if (this.terrainWarmupFrames === 0) {
          const focus = this.aircraft.root.position;
          const gy = this.terrain.sampleHeightAtGeo(
            this.terrain.currentSpawn?.lat ?? 0,
            this.terrain.currentSpawn?.lon ?? 0,
          );
          void this.terrain.waitForTileDetail(focus, gy, 11, 15_000).then(() => {
            this.terrain.setUpdateInterval(16);
          });
        }
      }
      if (this.terrain.consumePrimePending()) {
        this.terrain.primeTilesAt(this.aircraft.root.position);
      }
      this.atmosphere.syncSunLight(this.sceneManager.sun);

      if (this.input.wasPressed('KeyM')) {
        this.navMap.toggle();
      }
      const geo = this.terrain.localToGeo(this.aircraft.root.position);
      this.navMap.updatePlayer(geo.lat, geo.lon, telem.headingDeg);
      const courseDeg = this.navMap.getDesiredHeading();

      this.hud.canvas.style.opacity = '1';
      this.hud.render(telem, this.cameraRig.mode, courseDeg);
      this.audio.update(telem.throttle, telem.airspeedKts);

      this.input.endFrame();
    } else if (this.phase === 'menu') {
      this.hud.canvas.style.opacity = '0';
    }

    this.sceneManager.render();
    this.rafId = requestAnimationFrame((t) => this.loop(t));
  }

  getTelemetry() {
    return this.aircraft?.getTelemetry() ?? null;
  }

  getRoute() {
    return this.navMap.getRoute();
  }

  getDesiredHeading(): number | null {
    return this.navMap.getDesiredHeading();
  }

  isMapVisible(): boolean {
    return this.navMap.isVisible();
  }

  toggleMap(): boolean {
    return this.navMap.toggle();
  }

  /** True when terrain + aircraft are placed on the runway. */
  isOnRunway(): boolean {
    return (
      this.phase === 'flying' &&
      (this.aircraft?.body?.state.position.y ?? 0) > 0.5
    );
  }

  /** Test / automation — loading finished, sim running, and satellite detail is present. */
  isFlightReady(): boolean {
    if (this.phase !== 'flying' || !this.aircraft?.body) return false;
    const stats = this.terrain.imageryStats(10);
    return (
      stats.maxZ >= 10 &&
      stats.highZoomWithMap >= 8 &&
      stats.brownNoMap === 0
    );
  }

  /** Test / automation — nose pitch & bank from body quaternion (gimbal-safe). */
  getBodyAttitude() {
    const q = this.aircraft?.body?.state.quaternion;
    if (!q) return null;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const right = new THREE.Vector3().crossVectors(forward, up).normalize();
    const nosePitch = THREE.MathUtils.radToDeg(
      Math.atan2(forward.y, Math.hypot(forward.x, forward.z)),
    );
    const bank = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(right.y, -1, 1)));
    const heading = (THREE.MathUtils.radToDeg(Math.atan2(forward.x, -forward.z)) + 360) % 360;
    return { nosePitch, bank, heading };
  }

  /** Test / automation hook */
  setThrottle(value: number): void {
    if (this.aircraft) this.aircraft.controls.throttle = value;
  }

  /** Test / automation hook */
  setControls(partial: {
    throttle?: number;
    elevator?: number;
    aileron?: number;
    rudder?: number;
    brakes?: number;
  }): void {
    if (!this.aircraft) return;
    Object.assign(this.aircraft.controls, partial);
  }

  /** Test / automation — cycle chase / cockpit camera */
  cycleCamera(): string | null {
    const mode = this.cameraRig?.cycleMode() ?? null;
    if (this.aircraft) {
      void this.terrain.onViewChanged(
        this.aircraft.root.position,
        this.sceneManager.camera,
      );
    }
    return mode;
  }

  /** Test / automation — cockpit → outside and wait for tile re-prime */
  async cycleToOutsideCam(): Promise<void> {
    this.cameraRig?.cycleMode();
    this.cameraRig?.cycleMode();
    this.cameraRig?.snapCamera();
    if (this.aircraft) {
      await this.terrain.onViewChanged(
        this.aircraft.root.position,
        this.sceneManager.camera,
      );
      const spawn = this.terrain.currentSpawn;
      if (spawn) {
        const seated = this.terrain.spawnPosition(
          spawn.lat,
          spawn.lon,
          this.aircraft.definition.gearOffsetM,
          spawn.altM,
        );
        this.aircraft.respawnAt(seated, spawn.headingDeg);
        this.cameraRig?.snapCamera();
      }
    }
  }

  getCamera(): { x: number; y: number; z: number } {
    const p = this.sceneManager.camera.position;
    return { x: p.x, y: p.y, z: p.z };
  }

  getAircraftPos(): { x: number; y: number; z: number } | null {
    const p = this.aircraft?.root.position;
    return p ? { x: p.x, y: p.y, z: p.z } : null;
  }

  /** Test / automation — visual model orientation and mesh stats after ModelLoader normalization. */
  getModelDebug(): {
    meshes: number;
    forward: { x: number; y: number; z: number };
    size: { x: number; y: number; z: number };
    rootName: string;
    merged: boolean;
    gear: ReturnType<typeof getGearDebug> | null;
  } | null {
    if (!this.aircraft?.model) return null;
    const model = this.aircraft.visualModel;
    model.updateMatrixWorld(true);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(model.quaternion);
    let meshes = 0;
    model.traverse((child) => {
      if (child instanceof THREE.Mesh) meshes++;
    });
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    return {
      meshes,
      forward: { x: forward.x, y: forward.y, z: forward.z },
      size: { x: size.x, y: size.y, z: size.z },
      rootName: model.name || model.children[0]?.name || 'unknown',
      merged: model.getObjectByName('twinOtterMerged') != null,
      gear: getGearDebug(model),
    };
  }

  /** Test / automation — tile map for material diagnostics */
  getTileMap(): TileMap | null {
    return this.terrain.tileMap;
  }

  /** Test / automation — spawn ground debug */
  getSpawnDebug() {
    const spawn = this.terrain.currentSpawn;
    if (!spawn || !this.terrain.tileMap) return null;
    const map = this.terrain.tileMap;
    const geo = new THREE.Vector3(spawn.lon, spawn.lat, 0);
    const gw = map.geo2world(geo.clone());
    const info = map.getLocalInfoFromGeo(geo.clone());
    const ground = this.terrain.sampleHeightAtGeo(spawn.lat, spawn.lon);
    return {
      spawn,
      geo2world: { x: gw.x, y: gw.y, z: gw.z },
      hit: info?.point
        ? { x: info.point.x, y: info.point.y, z: info.point.z }
        : null,
      location: info?.location
        ? { x: info.location.x, y: info.location.y, z: info.location.z }
        : null,
      scaleZ: map.rootTile?.scale?.z ?? null,
      ground,
      aircraftY: this.aircraft?.body?.state.position.y ?? null,
    };
  }

  /** Test / automation — jump to lat/lon (simulates arriving after a long flight). */
  teleportToGeo(
    lat: number,
    lon: number,
    altM: number,
    headingDeg = 90,
  ): void {
    if (!this.aircraft) return;
    const pos = this.terrain.spawnPosition(
      lat,
      lon,
      this.aircraft.definition.gearOffsetM,
      altM,
    );
    this.aircraft.respawnAt(pos, headingDeg);
    const shift = this.terrain.recenterIfNeeded(this.aircraft.root.position);
    if (shift && this.aircraft.body) {
      this.aircraft.root.position.sub(shift);
      this.aircraft.body.state.position.sub(shift);
      this.aircraft.body.resetGroundContact();
    }
    this.terrain.onRecenter(this.aircraft.root.position);
    this.cameraRig?.snapCamera();
    const telem = this.aircraft.getTelemetry();
    this.terrain.update(this.sceneManager.camera, this.aircraft.root.position, {
      velocity: this.aircraft.body?.state.velocity ?? new THREE.Vector3(),
      aglM: telem.altitudeFt * 0.3048,
    });
  }

  /** Test / automation — advance physics without relying on rAF */
  simulatePhysics(seconds: number): void {
    if (!this.aircraft) return;
    const steps = Math.floor(seconds * 120);
    for (let i = 0; i < steps; i++) {
      this.aircraft.update(PHYSICS_DT, (pos) =>
        this.terrain.sampleHeightAt(pos),
      );
    }
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId);
    this.terrain.dispose();
    this.sceneManager.dispose();
    this.audio.dispose();
  }
}
