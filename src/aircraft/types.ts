import * as THREE from 'three';
import type { AeroPoint } from '../physics/AtmosphereISA.ts';

export interface ControlSurfaceInputs {
  elevator: number;
  aileron: number;
  rudder: number;
  flaps: number;
  throttle: number;
}

export interface AircraftDefinition {
  id: string;
  displayName: string;
  modelUrl: string | null;
  massKg: number;
  wingAreaM2: number;
  wingSpanM: number;
  chordM: number;
  maxThrustN: number;
  aeroTables: AeroPoint[];
  flapsCL: number;
  stallAlphaDeg: number;
  controlAuthority: { pitch: number; roll: number; yaw: number };
  gearOffsetM: number;
  cameraMounts: {
    cockpit: THREE.Vector3;
    cockpitLook: THREE.Vector3;
    gear: THREE.Vector3;
    gearLook: THREE.Vector3;
    outside: THREE.Vector3;
    chase: THREE.Vector3;
  };
  animateSurfaces: (model: THREE.Object3D, inputs: ControlSurfaceInputs, dt: number) => void;
}

export interface FlightTelemetry {
  airspeedKts: number;
  altitudeFt: number;
  headingDeg: number;
  pitchDeg: number;
  rollDeg: number;
  verticalSpeedFpm: number;
  throttle: number;
  flaps: number;
  gearDown: boolean;
  alphaDeg: number;
  onGround: boolean;
  stallWarning: boolean;
  highAlphaWarning: boolean;
  isStalled: boolean;
}

export const MS_TO_KTS = 1.94384;
export const M_TO_FT = 3.28084;
