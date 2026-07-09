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
