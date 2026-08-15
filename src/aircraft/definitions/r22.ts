import * as THREE from 'three';
import type { AircraftDefinition } from '../types.ts';
import { lightAeroTable } from '../aeroCommon.ts';
import { spinNamedPropellers } from '../animateCommon.ts';

export const r22Definition: AircraftDefinition = {
  id: 'r22',
  displayName: 'Robinson R22',
  modelUrl: `${import.meta.env.BASE_URL}models/r22/scene.glb`,
  proceduralModelId: 'r22',
  category: 'helicopter',
  engineType: 'heli',
  massKg: 620,
  wingAreaM2: 46.2,
  wingSpanM: 7.67,
  chordM: 0.22,
  // Hover ~62% collective: maxThrust ≈ weight / 0.62
  maxThrustN: 9800,
  aeroTables: lightAeroTable,
  flapsCL: 0,
  stallAlphaDeg: 90,
  controlAuthority: { pitch: 1.15, roll: 1.35, yaw: 1.55 },
  gearOffsetM: 0.38,
  cameraMounts: {
    cockpit: new THREE.Vector3(0.28, 1.15, 0.9),
    cockpitLook: new THREE.Vector3(0.28, 1.05, -6),
    gear: new THREE.Vector3(-2.2, 0.4, 1.8),
    gearLook: new THREE.Vector3(0, 0.7, -1.5),
    outside: new THREE.Vector3(0, 4.8, 11),
    chase: new THREE.Vector3(0, 3.4, 9),
  },
  animateSurfaces: (model, inputs, dt) => {
    spinNamedPropellers(model, ['mainRotor'], inputs.throttle, dt, 36, 28);
    spinNamedPropellers(model, ['tailRotor'], inputs.throttle, dt, 160, 110);
  },
};
