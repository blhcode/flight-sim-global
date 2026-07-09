import * as THREE from 'three';
import type { ProceduralModelId } from './types.ts';
import { createProceduralCessna172 } from '../ProceduralCessna172.ts';

function addSurfaces(
  root: THREE.Group,
  wingspan: number,
  opts: { highWing?: boolean; twinTail?: boolean } = {},
): void {
  const y = opts.highWing ? 0.55 : 0.35;
  const wingY = opts.highWing ? 0.62 : 0.42;

  const aileronL = new THREE.Mesh(
    new THREE.BoxGeometry(wingspan * 0.12, 0.05, wingspan * 0.04),
    new THREE.MeshStandardMaterial({ color: 0x1a4f8a }),
  );
  aileronL.name = 'aileronL';
  aileronL.position.set(-wingspan * 0.38, wingY, y);
  root.add(aileronL);

  const aileronR = aileronL.clone();
  aileronR.name = 'aileronR';
  aileronR.position.x = wingspan * 0.38;
  root.add(aileronR);

  const flapL = new THREE.Mesh(
    new THREE.BoxGeometry(wingspan * 0.14, 0.05, wingspan * 0.045),
    new THREE.MeshStandardMaterial({ color: 0xf4f6f8 }),
  );
  flapL.name = 'flapL';
  flapL.position.set(-wingspan * 0.22, wingY - 0.02, y);
  root.add(flapL);

  const flapR = flapL.clone();
  flapR.name = 'flapR';
  flapR.position.x = wingspan * 0.22;
  root.add(flapR);

  const elevator = new THREE.Mesh(
    new THREE.BoxGeometry(wingspan * 0.14, 0.06, wingspan * 0.05),
    new THREE.MeshStandardMaterial({ color: 0x1a4f8a }),
  );
  elevator.name = 'elevator';
  elevator.position.set(0, wingY + 0.08, -wingspan * 0.22);
  root.add(elevator);

  const rudder = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, wingspan * 0.12, wingspan * 0.05),
    new THREE.MeshStandardMaterial({ color: 0x1a4f8a }),
  );
  rudder.name = 'rudder';
  rudder.position.set(0, wingY + 0.18, -wingspan * 0.24);
  root.add(rudder);
}

function addPropeller(root: THREE.Group, x: number, z: number, name: string): void {
  const prop = new THREE.Group();
  prop.name = name;
  prop.userData.isPropeller = true;
  prop.userData.propAxis = 'z';
  prop.position.set(x, 0.42, z);
  for (let i = 0; i < 4; i++) {
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 1.4, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x222428 }),
    );
    blade.rotation.z = (i * Math.PI * 2) / 4;
    prop.add(blade);
  }
  root.add(prop);
}

function createTwinOtter(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'twinOtter';
  const white = new THREE.MeshStandardMaterial({ color: 0xf0f2f4, metalness: 0.15, roughness: 0.5 });
  const stripe = new THREE.MeshStandardMaterial({ color: 0xc41e3a, metalness: 0.1, roughness: 0.55 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2c30, metalness: 0.35, roughness: 0.4 });

  const fuse = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.4, 5.8), white);
  fuse.position.set(0, 1.5, 0);
  root.add(fuse);
  const stripeMesh = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.35, 5.2), stripe);
  stripeMesh.position.set(0, 1.35, 0.1);
  root.add(stripeMesh);

  const wing = new THREE.Mesh(new THREE.BoxGeometry(19.8, 0.14, 2.2), white);
  wing.position.set(0, 2.35, 0.2);
  root.add(wing);

  const nacelleL = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 1.6, 10), white);
  nacelleL.rotation.x = Math.PI / 2;
  nacelleL.position.set(-3.2, 2.2, 0.8);
  root.add(nacelleL);
  const nacelleR = nacelleL.clone();
  nacelleR.position.x = 3.2;
  root.add(nacelleR);

  addPropeller(root, -3.2, 1.55, 'propellerL');
  addPropeller(root, 3.2, 1.55, 'propellerR');

  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.4, 1.2), white);
  tail.position.set(0, 2.8, -2.6);
  root.add(tail);

  addSurfaces(root, 19.8, { highWing: true });

  for (const [x, z] of [
    [-2.8, 0.5],
    [2.8, 0.5],
    [0, 2.4],
  ] as const) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.1), dark);
    leg.position.set(x, 0.55, z);
    leg.userData.isLandingGear = true;
    root.add(leg);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.14, 14), dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.14, z);
    wheel.userData.isLandingGear = true;
    root.add(wheel);
  }

  return root;
}

function createDash8400(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'dash8400';
  const white = new THREE.MeshStandardMaterial({ color: 0xe8eaee, metalness: 0.2, roughness: 0.45 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x003366, metalness: 0.15, roughness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1c20, metalness: 0.4, roughness: 0.35 });

  const fuse = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 18, 12), white);
  fuse.rotation.x = Math.PI / 2;
  fuse.position.set(0, 2.2, -1);
  root.add(fuse);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.4, 12), blue);
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, 2.2, 8.2);
  root.add(nose);

  const wing = new THREE.Mesh(new THREE.BoxGeometry(28.4, 0.18, 2.8), white);
  wing.position.set(0, 3.4, 0.5);
  root.add(wing);

  for (const x of [-4.5, 4.5]) {
    const nacelle = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 2.4, 10), white);
    nacelle.rotation.x = Math.PI / 2;
    nacelle.position.set(x, 3.1, 1.2);
    root.add(nacelle);
    addPropeller(root, x, 2.1, x < 0 ? 'propellerL' : 'propellerR');
  }

  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.15, 4.5, 2.2), white);
  tail.position.set(0, 4.2, -9.5);
  root.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.2, 1.8), blue);
  fin.position.set(0, 5.2, -9.8);
  root.add(fin);

  addSurfaces(root, 28.4, { highWing: true });

  for (const [x, z] of [
    [-3.5, 1],
    [3.5, 1],
    [0, -7],
  ] as const) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.4), dark);
    leg.position.set(x, 0.7, z);
    leg.userData.isLandingGear = true;
    root.add(leg);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.18, 14), dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.18, z);
    wheel.userData.isLandingGear = true;
    root.add(wheel);
  }

  return root;
}

function createB737(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'b737';
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f4f7, metalness: 0.25, roughness: 0.4 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x1c3f94, metalness: 0.2, roughness: 0.45 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.7, roughness: 0.25 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1c20, metalness: 0.4, roughness: 0.35 });

  const fuse = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.2, 22, 14), white);
  fuse.rotation.x = Math.PI / 2;
  fuse.position.set(0, 3.2, -2);
  root.add(fuse);

  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(1.9, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), blue);
  cockpit.rotation.x = -Math.PI / 2;
  cockpit.position.set(0, 3.1, 9.5);
  root.add(cockpit);

  const wing = new THREE.Mesh(new THREE.BoxGeometry(35.8, 0.22, 4.2), metal);
  wing.position.set(0, 3.0, 1);
  root.add(wing);

  const engL = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 2.8, 12), metal);
  engL.rotation.x = Math.PI / 2;
  engL.position.set(-5.5, 2.4, 1.2);
  root.add(engL);
  const engR = engL.clone();
  engR.position.x = 5.5;
  root.add(engR);

  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 6.5, 3.5), white);
  tail.position.set(0, 6.8, -11);
  root.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.15, 5.5, 3.2), blue);
  fin.position.set(0, 8.5, -10.5);
  root.add(fin);

  addSurfaces(root, 35.8);

  for (const [x, z] of [
    [-4, 3],
    [4, 3],
    [0, -9],
  ] as const) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 2.0), dark);
    leg.position.set(x, 1.0, z);
    leg.userData.isLandingGear = true;
    root.add(leg);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.35, 16), dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.28, z);
    wheel.userData.isLandingGear = true;
    root.add(wheel);
  }

  return root;
}

function createB747(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'b747';
  const white = new THREE.MeshStandardMaterial({ color: 0xf0f2f5, metalness: 0.22, roughness: 0.42 });
  const red = new THREE.MeshStandardMaterial({ color: 0xb81d24, metalness: 0.15, roughness: 0.5 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x8e959e, metalness: 0.75, roughness: 0.22 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1c20, metalness: 0.4, roughness: 0.35 });

  const fuse = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 3.4, 38, 14), white);
  fuse.rotation.x = Math.PI / 2;
  fuse.position.set(0, 5.5, -4);
  root.add(fuse);

  const hump = new THREE.Mesh(new THREE.SphereGeometry(2.6, 14, 10), white);
  hump.scale.set(1, 0.85, 1.8);
  hump.position.set(0, 7.2, 6);
  root.add(hump);
  const cheat = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.5, 12), red);
  cheat.position.set(0, 5.8, 2);
  root.add(cheat);

  const wing = new THREE.Mesh(new THREE.BoxGeometry(64.4, 0.28, 6.5), metal);
  wing.position.set(0, 4.8, 0);
  root.add(wing);

  for (const x of [-12, -4.5, 4.5, 12]) {
    const eng = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.35, 3.6, 12), metal);
    eng.rotation.x = Math.PI / 2;
    eng.position.set(x, 3.6, 0.8);
    root.add(eng);
  }

  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.25, 10, 5), white);
  tail.position.set(0, 10.5, -18);
  root.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 8, 4.5), red);
  fin.position.set(0, 12.5, -17);
  root.add(fin);

  addSurfaces(root, 64.4);

  for (const [x, z] of [
    [-8, 5],
    [8, 5],
    [-8, -12],
    [8, -12],
    [0, -16],
  ] as const) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 2.8), dark);
    leg.position.set(x, 1.4, z);
    leg.userData.isLandingGear = true;
    root.add(leg);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.45, 16), dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.38, z);
    wheel.userData.isLandingGear = true;
    root.add(wheel);
  }

  return root;
}

export function createProceduralAircraft(id: ProceduralModelId): THREE.Group {
  switch (id) {
    case 'cessna172':
      return createProceduralCessna172();
    case 'twinOtter':
      return createTwinOtter();
    case 'dash8400':
      return createDash8400();
    case 'b737':
      return createB737();
    case 'b747':
      return createB747();
  }
}
