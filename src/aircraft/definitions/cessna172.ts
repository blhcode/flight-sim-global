import * as THREE from 'three';
import type { AircraftDefinition, ControlSurfaceInputs } from '../types.ts';

const aeroTables = [
  { alphaDeg: -10, CL: -0.35, CD: 0.045 },
  { alphaDeg: -5, CL: 0.05, CD: 0.032 },
  { alphaDeg: 0, CL: 0.28, CD: 0.03 },
  { alphaDeg: 5, CL: 0.55, CD: 0.035 },
  { alphaDeg: 10, CL: 0.95, CD: 0.05 },
  { alphaDeg: 15, CL: 1.25, CD: 0.085 },
  { alphaDeg: 18, CL: 1.1, CD: 0.12 },
  { alphaDeg: 22, CL: 0.85, CD: 0.18 },
  { alphaDeg: 30, CL: 0.55, CD: 0.28 },
];

let propAngle = 0;

function spinPropellers(model: THREE.Object3D, throttle: number, dt: number): void {
  const speed = 400 + throttle * 2200;
  model.traverse((child) => {
    if (child.userData.isPropeller || child.name === 'propeller' || child.name === 'Circle_6') {
      child.rotation.z += dt * speed;
    }
  });
}

function animateC172(model: THREE.Object3D, inputs: ControlSurfaceInputs, dt: number): void {
  spinPropellers(model, inputs.throttle, dt);

  const elevator = model.getObjectByName('elevator');
  const leftAileron = model.getObjectByName('aileronL');
  const rightAileron = model.getObjectByName('aileronR');
  const rudder = model.getObjectByName('rudder');
  const flapsL = model.getObjectByName('flapL');
  const flapsR = model.getObjectByName('flapR');
  const prop = model.getObjectByName('propeller');

  if (elevator) elevator.rotation.x = inputs.elevator * 0.35;
  if (leftAileron) leftAileron.rotation.x = inputs.aileron * 0.4;
  if (rightAileron) rightAileron.rotation.x = -inputs.aileron * 0.4;
  if (rudder) rudder.rotation.y = inputs.rudder * 0.45;
  const flapAngle = inputs.flaps * 0.55;
  if (flapsL) flapsL.rotation.x = flapAngle;
  if (flapsR) flapsR.rotation.x = flapAngle;

  if (prop) {
    propAngle += dt * (400 + inputs.throttle * 1800);
    prop.rotation.z = propAngle;
  }
}

export const cessna172Definition: AircraftDefinition = {
  id: 'cessna172',
  displayName: 'Cessna 172SP',
  modelUrl: `${import.meta.env.BASE_URL}models/cessna-172sp/scene.glb`,
  massKg: 1043,
  wingAreaM2: 16.2,
  wingSpanM: 11.0,
  chordM: 1.5,
  maxThrustN: 3600,
  aeroTables,
  flapsCL: 0.45,
  stallAlphaDeg: 15,
  controlAuthority: { pitch: 1.15, roll: 0.95, yaw: 0.45 },
  gearOffsetM: 1.2,
  cameraMounts: {
    cockpit: new THREE.Vector3(0, 1.35, 0.35),
    cockpitLook: new THREE.Vector3(0, 1.32, -8),
    gear: new THREE.Vector3(-1.0, 0.3, 0.8),
    gearLook: new THREE.Vector3(0, 0.8, -14),
    outside: new THREE.Vector3(0, 3.5, 16),
    chase: new THREE.Vector3(0, 2.8, 9),
  },
  animateSurfaces: animateC172,
};
