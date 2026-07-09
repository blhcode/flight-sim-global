import * as THREE from 'three';
import type { AircraftDefinition } from '../types.ts';
import { lightAeroTable, scaleAeroTable } from '../aeroCommon.ts';
import { animatePropsOnly } from '../animateCommon.ts';

export const dash8400Definition: AircraftDefinition = {
  id: 'dash8400',
  displayName: 'Dash 8 Q400',
  modelUrl: `${import.meta.env.BASE_URL}models/dash8-q400/scene.glb`,
  proceduralModelId: 'dash8400',
  engineType: 'turboprop',
  massKg: 18000,
  wingAreaM2: 43,
  wingSpanM: 28.4,
  chordM: 1.5,
  maxThrustN: 110000,
  rotateSpeedMs: 34,
  stallSpeedMs: 38,
  groundRollLiftScale: 1.15,
  aeroTables: scaleAeroTable(lightAeroTable, 1.22, 0.82),
  flapsCL: 0.5,
  stallAlphaDeg: 12,
  controlAuthority: { pitch: 0.55, roll: 0.45, yaw: 0.35 },
  gearOffsetM: 2.2,
  cameraMounts: {
    cockpit: new THREE.Vector3(0, 3.8, 4),
    cockpitLook: new THREE.Vector3(0, 3.6, -18),
    gear: new THREE.Vector3(-3.5, 0.8, 2),
    gearLook: new THREE.Vector3(0, 2.5, -28),
    outside: new THREE.Vector3(0, 8, 38),
    chase: new THREE.Vector3(0, 6.5, 24),
  },
  animateSurfaces: (model, inputs, dt) =>
    animatePropsOnly(model, inputs, dt, ['propL', 'propR']),
};
