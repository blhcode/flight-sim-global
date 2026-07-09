import * as THREE from 'three';

/** Build a recognizable Cessna 172 when no external GLB is available. */
export function createProceduralCessna172(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'cessna172';

  const white = new THREE.MeshStandardMaterial({ color: 0xf4f6f8, metalness: 0.15, roughness: 0.45 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x1a4f8a, metalness: 0.2, roughness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x222428, metalness: 0.4, roughness: 0.35 });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x8ab4d4,
    metalness: 0.9,
    roughness: 0.05,
    transparent: true,
    opacity: 0.45,
  });

  const fuselage = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 4.2, 8, 16), white);
  fuselage.rotation.x = Math.PI / 2;
  fuselage.position.set(0, 1.1, -0.2);
  fuselage.castShadow = true;
  root.add(fuselage);

  const cowl = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), white);
  cowl.rotation.x = -Math.PI / 2;
  cowl.position.set(0, 1.05, 2.0);
  root.add(cowl);

  const wing = new THREE.Mesh(new THREE.BoxGeometry(11, 0.12, 1.4), white);
  wing.position.set(0, 1.05, 0.1);
  wing.castShadow = true;
  root.add(wing);

  const strutL = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.4), dark);
  strutL.position.set(-2.2, 0.75, 0.2);
  strutL.rotation.z = 0.35;
  root.add(strutL);
  const strutR = strutL.clone();
  strutR.position.x = 2.2;
  strutR.rotation.z = -0.35;
  root.add(strutR);

  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.6, 0.9), white);
  tail.position.set(0, 1.9, -2.3);
  root.add(tail);

  const hStab = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.08, 0.7), white);
  hStab.position.set(0, 1.55, -2.35);
  root.add(hStab);

  const elevator = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.55), blue);
  elevator.name = 'elevator';
  elevator.position.set(0, 1.55, -2.75);
  root.add(elevator);

  const rudder = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 0.55), blue);
  rudder.name = 'rudder';
  rudder.position.set(0, 2.15, -2.75);
  root.add(rudder);

  const aileronL = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.05, 0.35), blue);
  aileronL.name = 'aileronL';
  aileronL.position.set(-4.8, 1.05, 0.35);
  root.add(aileronL);

  const aileronR = aileronL.clone();
  aileronR.name = 'aileronR';
  aileronR.position.x = 4.8;
  root.add(aileronR);

  const flapL = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.05, 0.4), white);
  flapL.name = 'flapL';
  flapL.position.set(-2.8, 1.02, 0.35);
  root.add(flapL);

  const flapR = flapL.clone();
  flapR.name = 'flapR';
  flapR.position.x = 2.8;
  root.add(flapR);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.85, 1.4), glass);
  cabin.position.set(0, 1.55, 0.6);
  root.add(cabin);

  const propHub = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.15, 12), dark);
  propHub.rotation.x = Math.PI / 2;
  propHub.position.set(0, 1.05, 2.35);
  root.add(propHub);

  const propeller = new THREE.Group();
  propeller.name = 'propeller';
  propeller.userData.isPropeller = true;
  propeller.userData.propAxis = 'z';
  propeller.position.set(0, 1.05, 2.42);
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.6, 0.02), dark);
    blade.rotation.z = (i * Math.PI * 2) / 3;
    propeller.add(blade);
  }
  root.add(propeller);

  const gearMat = dark;
  for (const [x, z] of [
    [-0.45, 1.6],
    [0.45, 1.6],
    [0, -1.0],
  ]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9), gearMat);
    leg.position.set(x, 0.45, z);
    root.add(leg);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 16), gearMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.12, z);
    root.add(wheel);
  }

  root.scale.setScalar(1);
  return root;
}
