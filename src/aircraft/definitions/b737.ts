import * as THREE from 'three';
import type { AircraftDefinition } from '../types.ts';
import { lightAeroTable, scaleAeroTable } from '../aeroCommon.ts';
import { animatePropsOnly } from '../animateCommon.ts';

export const b737Definition: AircraftDefinition = {
  id: 'b737',
  displayName: 'Boeing 737-800',
  modelUrl: `${import.meta.env.BASE_URL}models/b737-800/scene.glb`,
  proceduralModelId: 'b737',
  engineType: 'jet',
  massKg: 72000,
  wingAreaM2: 125,
  wingSpanM: 35.8,
  chordM: 3.5,
  maxThrustN: 210000,
  rotateSpeedMs: 72,
  stallSpeedMs: 64,
  groundRollLiftScale: 0.85,
  aeroTables: scaleAeroTable(lightAeroTable, 1.2, 0.85),
  flapsCL: 0.42,
  stallAlphaDeg: 11,
  controlAuthority: { pitch: 0.35, roll: 0.28, yaw: 0.25 },
  gearOffsetM: 3.5,
  cameraMounts: {
    cockpit: new THREE.Vector3(0, 5.5, 6),
    cockpitLook: new THREE.Vector3(0, 5.2, -24),
    gear: new THREE.Vector3(-5, 1.2, 4),
    gearLook: new THREE.Vector3(0, 4, -38),
    outside: new THREE.Vector3(0, 12, 52),
    chase: new THREE.Vector3(0, 10, 32),
  },
  animateSurfaces: (model, inputs, dt) => animatePropsOnly(model, inputs, dt),
};
