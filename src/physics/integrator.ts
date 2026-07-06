import * as THREE from 'three';

export interface RigidBodyState {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  quaternion: THREE.Quaternion;
  angularVelocity: THREE.Vector3;
}

export function cloneState(s: RigidBodyState): RigidBodyState {
  return {
    position: s.position.clone(),
    velocity: s.velocity.clone(),
    quaternion: s.quaternion.clone(),
    angularVelocity: s.angularVelocity.clone(),
  };
}

export interface BodyDerivatives {
  dPosition: THREE.Vector3;
  dVelocity: THREE.Vector3;
  dQuaternion: THREE.Quaternion;
  dAngularVelocity: THREE.Vector3;
}

export type StateDerivativeFn = (state: RigidBodyState) => BodyDerivatives;

const _dq = new THREE.Quaternion();

export function integrateRK4(
  state: RigidBodyState,
  dt: number,
  fn: StateDerivativeFn,
): RigidBodyState {
  const s0 = cloneState(state);

  const k1 = fn(s0);
  const s1 = applyDerivatives(s0, k1, dt * 0.5);
  const k2 = fn(s1);
  const s2 = applyDerivatives(s0, k2, dt * 0.5);
  const k3 = fn(s2);
  const s3 = applyDerivatives(s0, k3, dt);
  const k4 = fn(s3);

  const out = cloneState(s0);
  out.velocity.addScaledVector(k1.dVelocity, dt / 6);
  out.velocity.addScaledVector(k2.dVelocity, dt / 6);
  out.velocity.addScaledVector(k3.dVelocity, dt / 6);
  out.velocity.addScaledVector(k4.dVelocity, dt / 6);

  out.angularVelocity.addScaledVector(k1.dAngularVelocity, dt / 6);
  out.angularVelocity.addScaledVector(k2.dAngularVelocity, dt / 6);
  out.angularVelocity.addScaledVector(k3.dAngularVelocity, dt / 6);
  out.angularVelocity.addScaledVector(k4.dAngularVelocity, dt / 6);

  out.position.addScaledVector(k1.dPosition, dt / 6);
  out.position.addScaledVector(k2.dPosition, dt / 6);
  out.position.addScaledVector(k3.dPosition, dt / 6);
  out.position.addScaledVector(k4.dPosition, dt / 6);

  const dq = new THREE.Quaternion();
  dq.setFromEuler(
    new THREE.Euler(
      (k1.dQuaternion.x + 2 * k2.dQuaternion.x + 2 * k3.dQuaternion.x + k4.dQuaternion.x) *
        (dt / 6),
      (k1.dQuaternion.y + 2 * k2.dQuaternion.y + 2 * k3.dQuaternion.y + k4.dQuaternion.y) *
        (dt / 6),
      (k1.dQuaternion.z + 2 * k2.dQuaternion.z + 2 * k3.dQuaternion.z + k4.dQuaternion.z) *
        (dt / 6),
      'XYZ',
    ),
  );
  out.quaternion.multiply(dq).normalize();

  return out;
}

function applyDerivatives(
  state: RigidBodyState,
  deriv: BodyDerivatives,
  dt: number,
): RigidBodyState {
  const s = cloneState(state);
  s.position.addScaledVector(deriv.dPosition, dt);
  s.velocity.addScaledVector(deriv.dVelocity, dt);
  s.angularVelocity.addScaledVector(deriv.dAngularVelocity, dt);
  _dq.set(
    deriv.dQuaternion.x * dt * 0.5,
    deriv.dQuaternion.y * dt * 0.5,
    deriv.dQuaternion.z * dt * 0.5,
    deriv.dQuaternion.w * dt * 0.5,
  );
  s.quaternion.multiply(_dq).normalize();
  return s;
}

export function quaternionDerivative(
  q: THREE.Quaternion,
  omega: THREE.Vector3,
): THREE.Quaternion {
  return new THREE.Quaternion(
    omega.x * 0.5,
    omega.y * 0.5,
    omega.z * 0.5,
    0,
  ).multiply(q);
}
