import * as THREE from 'three';

/** FR24 GLB gear is embedded in the fuselage — use visible procedural struts + wheels. */
const PROCEDURAL_GEAR_AIRCRAFT = new Set(['b737', 'b747', 'dash8400']);

/** Hide embedded GLB gear so it does not z-fight with procedural legs. */
const HIDDEN_EMBEDDED_GEAR: Record<string, string[]> = {
  b737: [
    'lhww',
    'rhww',
    'ngww',
    'lhmgdouter',
    'lhmgdouter_001',
    'rhgdouter',
    'rhwtobfairing',
    'Mesh013',
    'Mesh013_1',
    'doorLR',
    'doorRF',
    'doorRR',
    'doorLF',
  ],
  b747: [
    'nlg_large_door_left',
    'nlg_large_door_right',
    'nlg_small_door_left',
    'nlg_small_door_left_0',
    'nlg_small_door_right',
    'nlg_left_large_door',
    'nlg_small_door_le',
    'wlg_inner_door_left',
    'wlg_inner_door_right',
    'wlg_left_door_003',
    'wlg_left_door_003_0',
    'wlg_outer_door_left',
    'wlg_outer_door_right',
  ],
  dash8400: [
    'rootNode_mesh_2',
    'rootNode_mesh_3',
    'rootNode_mesh_4',
    'rootNode_mesh_5',
    'rootNode_mesh_6',
    'rootNode_mesh_13',
    'rootNode_mesh_14',
    'rootNode_mesh_15',
    'rootNode_mesh_16',
    'rootNode_mesh_17',
    'rootNode_mesh_18',
    'rootNode_mesh_19',
    'rootNode_mesh_20',
    'rootNode_mesh_21',
    'rootNode_mesh_22',
    'rootNode_mesh_23',
    'rootNode_mesh_24',
    'rootNode_mesh_27',
    'rootNode_mesh_28',
  ],
};

interface GearLegAnchor {
  /** Named GLB node — leg attaches to the bottom of its bounds. */
  node?: string;
  /** Average several nodes (e.g. dual nose wheels). */
  nodes?: string[];
  /** Fraction of bounding box (x from center, z from nose/min.z). */
  xFrac?: number;
  zFrac?: number;
  attachYFrac?: number;
  /** Explicit body-space position after normalization. */
  x?: number;
  z?: number;
  attachY?: number;
  /** Dual-wheel bogie. */
  dual?: boolean;
}

const GEAR_LEG_ANCHORS: Record<string, GearLegAnchor[]> = {
  b737: [
    { node: 'ngww' },
    { node: 'lhmgdouter' },
    { node: 'rhgdouter' },
  ],
  dash8400: [
    { nodes: ['rootNode_mesh_17', 'rootNode_mesh_18'] },
    { node: 'rootNode_mesh_13' },
    { node: 'rootNode_mesh_21' },
  ],
  b747: [
    { nodes: ['nlg_large_door_left', 'nlg_large_door_right'] },
    { nodes: ['wlg_inner_door_left', 'wlg_outer_door_left'], dual: true },
    { nodes: ['wlg_inner_door_right', 'wlg_outer_door_right'], dual: true },
    { x: -12, z: -6.5, dual: true },
    { x: 12, z: -6.5, dual: true },
  ],
};

/** Mesh node names that are landing gear (per aircraft), matched on the object or any descendant. */
const GEAR_MESH_NAMES: Record<string, string[]> = {
  cessna172: ['Cube002_8', 'Cube009_47', 'Cube003_9', 'Plane007_10', 'Plane017_51'],
};

function collectGearMeshes(node: THREE.Object3D, refs: THREE.Mesh[]): void {
  node.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.userData.isLandingGear = true;
      refs.push(child);
    }
  });
}

function hideEmbeddedGearMeshes(root: THREE.Object3D, aircraftId: string): void {
  const names = HIDDEN_EMBEDDED_GEAR[aircraftId];
  if (!names) return;
  for (const name of names) {
    const node = root.getObjectByName(name);
    if (!node) continue;
    node.traverse((child) => {
      if (child instanceof THREE.Mesh && /^fuselage/i.test(child.name)) return;
      child.visible = false;
    });
  }
}

function boundsInRootLocal(root: THREE.Object3D, object: THREE.Object3D): THREE.Box3 {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  box.applyMatrix4(new THREE.Matrix4().copy(root.matrixWorld).invert());
  return box;
}

/** Scene-local Y where the model touches the ground after ModelLoader normalization. */
function sceneGroundY(root: THREE.Object3D): number {
  return -root.position.y;
}

function bellyAttachY(
  root: THREE.Object3D,
  x: number,
  z: number,
  searchX: number,
  searchZ: number,
): number {
  let attachY = sceneGroundY(root);
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.visible) return;
    if (child.userData.isLandingGear) return;
    const box = boundsInRootLocal(root, child);
    const center = box.getCenter(new THREE.Vector3());
    if (Math.abs(center.x - x) > searchX || Math.abs(center.z - z) > searchZ) return;
    attachY = Math.max(attachY, box.min.y);
  });
  return attachY;
}

function resolveFractionAnchor(
  root: THREE.Object3D,
  box: THREE.Box3,
  spec: GearLegAnchor,
): GearLegAnchor | null {
  if (spec.xFrac === undefined || spec.zFrac === undefined) return null;
  const size = box.getSize(new THREE.Vector3());
  const x = spec.xFrac * size.x;
  const z = box.min.z + spec.zFrac * size.z;
  const belly = bellyAttachY(root, x, z, 3.5, 4);
  const ground = sceneGroundY(root);
  const attachY =
    spec.attachYFrac !== undefined
      ? ground + spec.attachYFrac * size.y
      : belly;
  return {
    x,
    z,
    attachY: Math.max(attachY, belly, ground + size.y * 0.08),
    dual: spec.dual,
  };
}

function resolveAnchor(
  root: THREE.Object3D,
  box: THREE.Box3,
  spec: GearLegAnchor,
): GearLegAnchor | null {
  if (spec.x !== undefined && spec.z !== undefined) {
    const belly = bellyAttachY(root, spec.x, spec.z, 4, 5);
    const ground = sceneGroundY(root);
    return {
      x: spec.x,
      z: spec.z,
      attachY: Math.max(belly, spec.attachY ?? ground + box.getSize(new THREE.Vector3()).y * 0.1),
      dual: spec.dual,
    };
  }

  const nodeNames = spec.nodes ?? (spec.node ? [spec.node] : []);
  if (nodeNames.length) {
    const boxes: THREE.Box3[] = [];
    for (const name of nodeNames) {
      const node = root.getObjectByName(name);
      if (!node) continue;
      boxes.push(boundsInRootLocal(root, node));
    }
    if (boxes.length) {
      const merged = new THREE.Box3();
      for (const b of boxes) merged.union(b);
      const center = merged.getCenter(new THREE.Vector3());
      const belly = bellyAttachY(root, center.x, center.z, 2.5, 3.5);
      let attachY = Math.max(merged.min.y, belly);
      if (spec.nodes) {
        attachY = Math.max(merged.max.y - 0.05, belly);
      } else if (/mesh_13|mesh_21/.test(spec.node ?? '')) {
        attachY = Math.max(merged.min.y + 0.1, belly, merged.max.y - 0.25);
      } else if (/mgdouter|gdouter|wlg_|nlg_/.test(spec.node ?? '')) {
        attachY = Math.max(merged.min.y + 0.05, belly);
      } else {
        attachY = Math.max(merged.min.y + 0.05, belly);
      }
      return {
        x: center.x,
        z: center.z,
        attachY,
        dual: spec.dual,
      };
    }
  }

  return resolveFractionAnchor(root, box, spec);
}

function addWheel(
  group: THREE.Group,
  refs: THREE.Mesh[],
  x: number,
  y: number,
  z: number,
  wheelR: number,
  mat: THREE.MeshStandardMaterial,
): void {
  const wheel = new THREE.Mesh(
    new THREE.CylinderGeometry(wheelR, wheelR, wheelR * 0.34, 14),
    mat,
  );
  // Vertical disc, axle along X (spanwise) — rolls along fuselage Z.
  wheel.rotation.z = Math.PI / 2;
  wheel.position.set(x, y, z);
  wheel.userData.isLandingGear = true;
  wheel.userData.isGearWheel = true;
  group.add(wheel);
  refs.push(wheel);
}

function attachProceduralLandingGear(
  root: THREE.Object3D,
  aircraftId: string,
  box: THREE.Box3,
): void {
  const specs = GEAR_LEG_ANCHORS[aircraftId];
  if (!specs) return;

  const size = box.getSize(new THREE.Vector3());
  const groundY = sceneGroundY(root);
  const wheelR = Math.max(0.32, size.y * 0.052);
  const wheelMat = new THREE.MeshStandardMaterial({
    color: 0x1a1c22,
    metalness: 0.45,
    roughness: 0.55,
    side: THREE.DoubleSide,
  });
  const strutMat = new THREE.MeshStandardMaterial({
    color: 0x3a3d44,
    metalness: 0.5,
    roughness: 0.45,
    side: THREE.DoubleSide,
  });

  const group = new THREE.Group();
  group.name = 'proceduralLandingGear';
  const refs: THREE.Mesh[] = [];
  const seen = new Set<string>();

  for (const spec of specs) {
    const leg = resolveAnchor(root, box, spec);
    if (!leg || leg.x === undefined || leg.z === undefined || leg.attachY === undefined) continue;

    const key = `${leg.x.toFixed(2)}:${leg.z.toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const wheelY = groundY + wheelR;
    const attachY = Math.min(leg.attachY, groundY + size.y * 0.35);
    const topY = Math.max(attachY, wheelY + wheelR * 0.15);
    const strutHeight = Math.max(wheelR * 0.55, topY - wheelY);
    const strutCenterY = wheelY + strutHeight / 2;

    const strut = new THREE.Mesh(
      new THREE.CylinderGeometry(wheelR * 0.09, wheelR * 0.12, strutHeight, 8),
      strutMat,
    );
    strut.position.set(leg.x, strutCenterY, leg.z);
    strut.userData.isLandingGear = true;
    group.add(strut);
    refs.push(strut);

    if (leg.dual) {
      const offset = wheelR * 0.72;
      addWheel(group, refs, leg.x - offset, wheelY, leg.z, wheelR, wheelMat);
      addWheel(group, refs, leg.x + offset, wheelY, leg.z, wheelR, wheelMat);
    } else {
      addWheel(group, refs, leg.x, wheelY, leg.z, wheelR, wheelMat);
    }
  }

  root.add(group);
  root.userData.landingGearMeshes = refs;
}

/** Mark landing-gear meshes after ModelLoader normalization. */
export function setupLandingGear(root: THREE.Object3D, aircraftId: string): void {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  if (PROCEDURAL_GEAR_AIRCRAFT.has(aircraftId)) {
    hideEmbeddedGearMeshes(root, aircraftId);
    attachProceduralLandingGear(root, aircraftId, box);
    return;
  }
  tagLandingGearMeshes(root, aircraftId);
}

/** Mark landing-gear meshes from GLB node names (procedural fleet). */
export function tagLandingGearMeshes(root: THREE.Object3D, aircraftId: string): void {
  const names = GEAR_MESH_NAMES[aircraftId];
  const refs: THREE.Mesh[] = [];
  if (names) {
    for (const name of names) {
      const node = root.getObjectByName(name);
      if (node) collectGearMeshes(node, refs);
    }
  }

  root.traverse((child) => {
    if (
      child instanceof THREE.Mesh &&
      child.userData.isLandingGear &&
      !refs.includes(child)
    ) {
      refs.push(child);
    }
  });

  root.userData.landingGearMeshes = refs;
}

export function setLandingGearVisible(root: THREE.Object3D, gearDown: boolean): void {
  const group = root.getObjectByName('proceduralLandingGear');
  if (group) group.visible = gearDown;

  const refs = root.userData.landingGearMeshes as THREE.Mesh[] | undefined;
  if (refs?.length) {
    for (const mesh of refs) {
      mesh.visible = gearDown;
    }
    return;
  }

  root.traverse((child) => {
    if (child instanceof THREE.Mesh && child.userData.isLandingGear) {
      child.visible = gearDown;
    }
  });
}

/** Test / automation — gear leg count and toggle state. */
export function getGearDebug(root: THREE.Object3D): {
  refs: number;
  wheels: number;
  visibleWheels: number;
  groupVisible: boolean;
} {
  const group = root.getObjectByName('proceduralLandingGear');
  const refs = (root.userData.landingGearMeshes as THREE.Mesh[] | undefined)?.length ?? 0;
  let wheels = 0;
  let visibleWheels = 0;
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.userData.isGearWheel) return;
    wheels++;
    if (child.visible) visibleWheels++;
  });
  if (wheels === 0) {
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !child.userData.isLandingGear) return;
      wheels++;
      if (child.visible) visibleWheels++;
    });
  }
  return {
    refs,
    wheels,
    visibleWheels,
    groupVisible: group?.visible ?? false,
  };
}
