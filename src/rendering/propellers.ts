import * as THREE from 'three';

type PropAxis = 'x' | 'y' | 'z';

export function tagPropeller(node: THREE.Object3D, axis: PropAxis = 'z'): void {
  node.userData.isPropeller = true;
  node.userData.propAxis = axis;
}

/** Tag GLB prop nodes after normalization (Dash 8 only — other models use baked static props). */
export function setupPropellers(root: THREE.Object3D, aircraftId: string, _box: THREE.Box3): void {
  if (aircraftId === 'dash8400') {
    for (const name of ['propL', 'propR']) {
      const node = root.getObjectByName(name);
      if (node) tagPropeller(node, 'z');
    }
  }
}

const R22_BLUR = new Set(['Fblade1', 'Fblade2', 'Tdisc', 'flare']);
const R22_MAIN = ['Hub', 'Shaft', 'Mblade1', 'Mblade2', 'Hinge1', 'Hinge2', 'Plink1', 'Plink2'];
const R22_MAIN_BLADE2 = new Set(['Mblade2', 'Hinge2', 'Plink2']);
const R22_TAIL = ['Tblades', 'Tailshaft'];
const R22_GLASS = new Set(['glass', 'Ldoorglass', 'Rdoorglass']);

/**
 * FGAddon R22 stores both main blades in the same parked pose; FlightGear
 * rotates blade 2 by 180°. Parent blades to hubs so they can spin in-engine.
 * Call before normalizeToGround so the rotor disc is in the bounding box.
 */
export function setupR22Rotors(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (R22_BLUR.has(child.name)) child.visible = false;
    if (!(child instanceof THREE.Mesh) || !R22_GLASS.has(child.name)) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const mat of mats) {
      if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
      mat.transparent = true;
      mat.opacity = Math.min(mat.opacity, 0.55);
      mat.roughness = 0.12;
      mat.metalness = 0.15;
      mat.side = THREE.DoubleSide;
    }
  });

  groupR22Rotor(root, R22_MAIN, 'mainRotor', 'y', 'Hub', R22_MAIN_BLADE2);
  groupR22Rotor(root, R22_TAIL, 'tailRotor', 'z', 'Tblades');
}

function collectMeshes(root: THREE.Object3D, names: string[]): THREE.Mesh[] {
  const want = new Set(names);
  const out: THREE.Mesh[] = [];
  root.traverse((child) => {
    if (child instanceof THREE.Mesh && want.has(child.name)) out.push(child);
  });
  return out;
}

function groupR22Rotor(
  root: THREE.Object3D,
  names: string[],
  groupName: string,
  axis: PropAxis,
  hubName: string,
  rotate180?: Set<string>,
): void {
  const meshes = collectMeshes(root, names);
  if (meshes.length === 0) return;

  root.updateMatrixWorld(true);
  const hubMesh = meshes.find((m) => m.name === hubName) ?? meshes[0];
  const hub = new THREE.Box3().setFromObject(hubMesh).getCenter(new THREE.Vector3());
  root.worldToLocal(hub);

  const group = new THREE.Group();
  group.name = groupName;
  group.position.copy(hub);
  tagPropeller(group, axis);
  root.add(group);

  for (const mesh of meshes) {
    const geom = mesh.geometry.clone();
    geom.translate(-hub.x, -hub.y, -hub.z);
    mesh.geometry = geom;
    mesh.position.set(0, 0, 0);
    mesh.rotation.set(0, 0, 0);
    mesh.scale.set(1, 1, 1);
    if (rotate180?.has(mesh.name)) mesh.rotation.y = Math.PI;
    group.add(mesh);
  }
}
