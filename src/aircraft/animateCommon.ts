import * as THREE from 'three';
import type { ControlSurfaceInputs } from './types.ts';

/** Prop spin only — skips GLB control surfaces (FR24 rudder meshes pivot at the wrong point). */
export function animatePropsOnly(
  model: THREE.Object3D,
  inputs: ControlSurfaceInputs,
  dt: number,
  propNames: string[] = [],
): void {
  spinNamedPropellers(model, propNames, inputs.throttle, dt);
}

export function spinNamedPropellers(
  model: THREE.Object3D,
  names: string[],
  throttle: number,
  dt: number,
  base = 400,
  range = 2200,
): void {
  const speed = base + throttle * range;
  model.traverse((child) => {
    if (!names.includes(child.name) && !child.userData.isPropeller) return;
    const axis = (child.userData.propAxis as 'x' | 'y' | 'z' | undefined) ?? 'z';
    child.rotation[axis] += dt * speed;
  });
}

export function animateControlSurfaces(
  model: THREE.Object3D,
  inputs: ControlSurfaceInputs,
  dt: number,
  opts: {
    propNames?: string[];
    elevator?: number;
    aileron?: number;
    rudder?: number;
    flaps?: number;
  } = {},
): void {
  const elevatorGain = opts.elevator ?? 0.35;
  const aileronGain = opts.aileron ?? 0.4;
  const rudderGain = opts.rudder ?? 0.45;
  const flapGain = opts.flaps ?? 0.55;

  spinNamedPropellers(model, opts.propNames ?? [], inputs.throttle, dt);

  const elevator = model.getObjectByName('elevator');
  const leftAileron = model.getObjectByName('aileronL');
  const rightAileron = model.getObjectByName('aileronR');
  const rudder = model.getObjectByName('rudder');
  const flapsL = model.getObjectByName('flapL');
  const flapsR = model.getObjectByName('flapR');

  if (elevator) elevator.rotation.x = inputs.elevator * elevatorGain;
  if (leftAileron) leftAileron.rotation.x = inputs.aileron * aileronGain;
  if (rightAileron) rightAileron.rotation.x = -inputs.aileron * aileronGain;
  if (rudder) rudder.rotation.y = inputs.rudder * rudderGain;
  const flapAngle = inputs.flaps * flapGain;
  if (flapsL) flapsL.rotation.x = flapAngle;
  if (flapsR) flapsR.rotation.x = flapAngle;
}
