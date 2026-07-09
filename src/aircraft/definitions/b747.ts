import * as THREE from 'three';
import type { AircraftDefinition } from '../types.ts';
import { lightAeroTable, scaleAeroTable } from '../aeroCommon.ts';
import { animatePropsOnly } from '../animateCommon.ts';

export const b747Definition: AircraftDefinition = {
  id: 'b747',
  displayName: 'Boeing 747-400',
  modelUrl: `${import.meta.env.BASE_URL}models/b747-400/scene.glb`,
  proceduralModelId: 'b747',
  engineType: 'jet',
  massKg: 370000,
  wingAreaM2: 525,
  wingSpanM: 64.4,
  chordM: 8.2,
  maxThrustN: 1104000,
  aeroTables: scaleAeroTable(lightAeroTable, 1.25, 0.8),
  flapsCL: 0.38,
  stallAlphaDeg: 10,
  rotateSpeedMs: 82,
  stallSpeedMs: 86,
  groundRollLiftScale: 0.55,
  controlAuthority: { pitch: 0.22, roll: 0.18, yaw: 0.18 },
  gearOffsetM: 5.5,
  cameraMounts: {
    cockpit: new THREE.Vector3(0, 9.5, 10),
    cockpitLook: new THREE.Vector3(0, 9, -42),
    gear: new THREE.Vector3(-8, 2, 6),
    gearLook: new THREE.Vector3(0, 7, -68),
    outside: new THREE.Vector3(0, 22, 95),
    chase: new THREE.Vector3(0, 18, 58),
  },
  animateSurfaces: (model, inputs, dt) => animatePropsOnly(model, inputs, dt),
};
