import * as THREE from 'three';
import type { AircraftDefinition, WeightProfile } from '../aircraft/types.ts';
import { SimpleFlightModel } from '../physics/SimpleFlightModel.ts';
import type { SimControls } from '../physics/forces/GroundContact.ts';
import { loadAircraftModel } from '../rendering/ModelLoader.ts';
import { setLandingGearVisible } from '../rendering/landingGear.ts';
import { M_TO_FT, MS_TO_KTS, type FlightTelemetry } from './types.ts';

export class AircraftInstance {
  readonly root = new THREE.Group();
  readonly definition: AircraftDefinition;
  body: SimpleFlightModel | null = null;
  model: THREE.Object3D | null = null;

  controls: SimControls = {
    throttle: 0.2,
    elevator: 0,
    aileron: 0,
    rudder: 0,
    flaps: 0,
    brakes: 0,
    gearDown: true,
  };

  flapsDeployed = false;
  gearDown = true;
  onGround = true;
  private activeWeight: WeightProfile | null = null;

  constructor(definition: AircraftDefinition, weightProfileId?: string) {
    this.definition = definition;
    this.setWeightProfile(weightProfileId);
  }

  setWeightProfile(profileId?: string): void {
    const profiles = this.definition.weightProfiles;
    if (!profiles?.length) {
      this.activeWeight = null;
      return;
    }
    this.activeWeight =
      profiles.find((p) => p.id === profileId) ?? profiles[0] ?? null;
  }

  get weightProfileId(): string | undefined {
    return this.activeWeight?.id;
  }

  get weightProfileLabel(): string | undefined {
    return this.activeWeight?.label;
  }

  private flightMassKg(): number {
    return this.activeWeight?.massKg ?? this.definition.massKg;
  }

  private flightRotateSpeedMs(): number | undefined {
    return this.activeWeight?.rotateSpeedMs ?? this.definition.rotateSpeedMs;
  }

  private flightStallSpeedMs(): number | undefined {
    return this.activeWeight?.stallSpeedMs ?? this.definition.stallSpeedMs;
  }

  async loadModel(): Promise<void> {
    const loaded = await loadAircraftModel(this.definition);
    this.model = loaded.root;
    this.model.userData.mixer = loaded.mixer;
    const m = this.definition.cameraMounts;
    m.cockpit.copy(loaded.cameraMounts.cockpit);
    m.cockpitLook.copy(loaded.cameraMounts.cockpitLook);
    m.gear.copy(loaded.cameraMounts.gear);
    m.gearLook.copy(loaded.cameraMounts.gearLook);
    m.chase.copy(loaded.cameraMounts.chase);
    m.outside.copy(loaded.cameraMounts.outside);
    this.definition.gearOffsetM = loaded.gearOffsetM;
    this.root.add(this.model);
  }

  get visualModel(): THREE.Object3D {
    return this.model ?? this.root;
  }

  spawn(worldPos: THREE.Vector3, headingDeg: number): void {
    this.respawnAt(worldPos, headingDeg);
  }

  respawnAt(worldPos: THREE.Vector3, headingDeg: number): void {
    if (!this.body) {
      this.body = new SimpleFlightModel(worldPos, headingDeg);
    } else {
      this.body.state.position.copy(worldPos);
      this.body.state.quaternion.setFromEuler(
        new THREE.Euler(0, THREE.MathUtils.degToRad(headingDeg), 0, 'YXZ'),
      );
      this.body.state.velocity.set(0, 0, 0);
      this.body.resetGroundContact();
    }
    this.root.position.copy(worldPos);
    this.root.quaternion.copy(this.body.state.quaternion);
    this.controls.elevator = 0;
    this.controls.aileron = 0;
    this.controls.rudder = 0;
  }

  update(
    dt: number,
    groundHeightFn: (pos: THREE.Vector3) => number,
  ): void {
    if (!this.body || !this.model) return;

    const d = this.definition;
    this.onGround = this.body.step(
      dt,
      {
        throttle: this.controls.throttle,
        elevator: this.controls.elevator,
        aileron: this.controls.aileron,
        rudder: this.controls.rudder,
        flaps: this.flapsDeployed ? 1 : 0,
        brakes: this.controls.brakes,
      },
      {
        massKg: this.flightMassKg(),
        wingAreaM2: d.wingAreaM2,
        maxThrustN: d.maxThrustN,
        gearOffsetM: d.gearOffsetM,
        pitchAuthority: d.controlAuthority.pitch,
        rollAuthority: d.controlAuthority.roll,
        yawAuthority: d.controlAuthority.yaw,
        stallAlphaDeg: d.stallAlphaDeg,
        flapsCL: d.flapsCL,
        aeroTables: d.aeroTables,
        engineType: d.engineType,
        rotateSpeedMs: this.flightRotateSpeedMs(),
        stallSpeedMs: this.flightStallSpeedMs(),
        groundRollLiftScale: d.groundRollLiftScale,
      },
      groundHeightFn,
    );

    this.root.position.copy(this.body.state.position);
    this.root.quaternion.copy(this.body.state.quaternion);

    this.definition.animateSurfaces(this.model, {
      elevator: this.controls.elevator,
      aileron: this.controls.aileron,
      rudder: this.controls.rudder,
      flaps: this.flapsDeployed ? 1 : 0,
      throttle: this.controls.throttle,
      gearDown: this.gearDown,
    }, dt);

    setLandingGearVisible(this.model, this.gearDown);
  }

  getTelemetry(): FlightTelemetry {
    const b = this.body;
    if (!b) {
      return {
        airspeedKts: 0,
        altitudeFt: 0,
        headingDeg: 0,
        pitchDeg: 0,
        rollDeg: 0,
        verticalSpeedFpm: 0,
        throttle: this.controls.throttle,
        flaps: this.flapsDeployed ? 1 : 0,
        gearDown: this.gearDown,
        alphaDeg: 0,
        onGround: true,
        stallWarning: false,
        highAlphaWarning: false,
        isStalled: false,
      };
    }
    return {
      airspeedKts: b.indicatedAirspeed * MS_TO_KTS,
      altitudeFt: b.aglM * M_TO_FT,
      headingDeg: b.headingDeg,
      pitchDeg: b.pitchDeg,
      rollDeg: b.rollDeg,
      verticalSpeedFpm: b.verticalSpeed * M_TO_FT * 60,
      throttle: this.controls.throttle,
      flaps: this.flapsDeployed ? 1 : 0,
      gearDown: this.gearDown,
      alphaDeg: b.alphaDeg,
      onGround: this.onGround,
      stallWarning: b.stallWarning,
      highAlphaWarning: b.highAlphaWarning,
      isStalled: b.isStalled,
    };
  }
}
