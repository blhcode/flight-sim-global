import * as THREE from 'three';

/** Recognizable R22: bubble cabin, boom, skids, two-blade main + tail rotor. */
export function createProceduralR22(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'r22';

  const white = new THREE.MeshStandardMaterial({
    color: 0xf4f1ea,
    metalness: 0.12,
    roughness: 0.48,
  });
  const blue = new THREE.MeshStandardMaterial({
    color: 0x1e4b8c,
    metalness: 0.18,
    roughness: 0.42,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x222428,
    metalness: 0.4,
    roughness: 0.45,
  });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x8ec4e8,
    metalness: 0.2,
    roughness: 0.15,
    transparent: true,
    opacity: 0.45,
    side: THREE.DoubleSide,
  });
  const chrome = new THREE.MeshStandardMaterial({
    color: 0xb8bcc4,
    metalness: 0.7,
    roughness: 0.3,
  });

  const cabin = new THREE.Mesh(new THREE.SphereGeometry(0.72, 16, 12), glass);
  cabin.scale.set(1.05, 0.92, 1.25);
  cabin.position.set(0, 1.15, 0.55);
  root.add(cabin);

  const floor = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.12, 1.7), white);
  floor.position.set(0, 0.72, 0.4);
  root.add(floor);

  const cowling = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.7, 1.15), white);
  cowling.position.set(0, 1.05, -0.55);
  root.add(cowling);

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.97, 0.16, 1.1), blue);
  stripe.position.set(0, 1.05, -0.55);
  root.add(stripe);

  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 4.4, 8), white);
  boom.rotation.x = Math.PI / 2;
  boom.position.set(0, 1.15, -2.7);
  root.add(boom);

  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.85, 0.55), white);
  fin.position.set(0, 1.45, -4.85);
  root.add(fin);

  const stab = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.05, 0.32), white);
  stab.position.set(0, 1.05, -4.55);
  root.add(stab);

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.55, 8), chrome);
  mast.position.set(0, 1.72, -0.15);
  root.add(mast);

  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.1, 10), dark);
  hub.position.set(0, 2.02, -0.15);
  root.add(hub);

  const mainRotor = new THREE.Group();
  mainRotor.name = 'mainRotor';
  mainRotor.userData.isPropeller = true;
  mainRotor.userData.propAxis = 'y';
  mainRotor.position.set(0, 2.08, -0.15);
  const mainBlade = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.035, 0.22), dark);
  mainRotor.add(mainBlade);
  root.add(mainRotor);

  const tailRotor = new THREE.Group();
  tailRotor.name = 'tailRotor';
  tailRotor.userData.isPropeller = true;
  tailRotor.userData.propAxis = 'x';
  tailRotor.position.set(0.18, 1.55, -4.9);
  const tailBlade = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.05, 0.08), dark);
  tailRotor.add(tailBlade);
  root.add(tailRotor);

  const skidY = 0.12;
  for (const x of [-0.72, 0.72]) {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 2.35, 8), dark);
    tube.rotation.x = Math.PI / 2;
    tube.position.set(x, skidY, 0.15);
    root.add(tube);
    for (const z of [-0.55, 0.75]) {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.62, 6), chrome);
      strut.position.set(x, 0.42, z);
      root.add(strut);
    }
  }

  const seatL = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.42, 0.38), blue);
  seatL.position.set(-0.28, 0.95, 0.45);
  root.add(seatL);
  const seatR = seatL.clone();
  seatR.position.x = 0.28;
  root.add(seatR);

  return root;
}
