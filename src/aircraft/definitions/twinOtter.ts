import * as THREE from 'three';
import type { AircraftDefinition } from '../types.ts';
import { lightAeroTable, scaleAeroTable } from '../aeroCommon.ts';
export const twinOtterDefinition: AircraftDefinition = {
  id: 'twinOtter',
  displayName: 'DHC-6 Twin Otter',
  modelUrl: `${import.meta.env.BASE_URL}models/twin-otter/scene.glb`,
  proceduralModelId: 'twinOtter',
  engineType: 'turboprop',
  massKg: 5200,
  wingAreaM2: 30,
  wingSpanM: 19.8,
  chordM: 1.5,
  maxThrustN: 11500,
  rotateSpeedMs: 36,
  stallSpeedMs: 34,
  groundRollLiftScale: 1.0,
  aeroTables: scaleAeroTable(lightAeroTable, 1.12, 1.02),
  flapsCL: 0.55,
  stallAlphaDeg: 14,
  weightProfiles: [
    {
      id: 'standard',
      label: 'Standard',
      massKg: 5200,
      rotateSpeedMs: 36,
      stallSpeedMs: 34,
    },
    {
      id: 'stol',
      label: 'STOL',
      massKg: 4000,
      rotateSpeedMs: 31,
      stallSpeedMs: 29,
    },
  ],
  controlAuthority: { pitch: 0.85, roll: 0.75, yaw: 0.55 },
  gearOffsetM: 1.4,
  cameraMounts: {
    cockpit: new THREE.Vector3(0, 2.2, 1.2),
    cockpitLook: new THREE.Vector3(0, 2.1, -12),
    gear: new THREE.Vector3(-2.5, 0.5, 1.5),
    gearLook: new THREE.Vector3(0, 1.8, -18),
    outside: new THREE.Vector3(0, 5.5, 22),
    chase: new THREE.Vector3(0, 4.5, 14),
  },
  animateSurfaces: () => {},
};
