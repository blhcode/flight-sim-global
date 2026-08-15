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
  // Explicit body-space anchors — FR24 GLB only has gear doors (no legs).
  // attachY is metres above the model floor (nacelle bottoms). X/Z are root-local.
  // Inner engines sit near |x|≈13 — wing gear must stay inboard (~6–7 m) or struts
  // pierce the nacelles and disappear from the rear outside view.
  b747: [
    { x: 0, z: -28.5, attachY: 2.2 },
    { x: -3.2, z: -3.2, dual: true, attachY: 1.8 },
    { x: 3.2, z: -3.2, dual: true, attachY: 1.8 },
    { x: -6.4, z: -5.8, dual: true, attachY: 3.0 },
    { x: 6.4, z: -5.8, dual: true, attachY: 3.0 },
  ],
};

/** Minimum exposed strut length (model units) so gear reads under the belly. */
const MIN_STRUT_M: Record<string, number> = {
  b737: 1.6,
  b747: 3.4,
  dash8400: 1.2,
};

/**
 * How far the wheels hang below the model's lowest geometry.
 * The FR24 747 has no gear legs and its nacelles sit on the model floor, so the
 * airframe has to ride up on the procedural gear. GLBs that ship their own gear
 * already define the floor at wheel height and need no drop.
 */
const GEAR_DROP_M: Record<string, number> = {
  // Tall enough that legs clear the nacelles from the rear outside camera.
  b747: 3.0,
};

/** Strut radius as a fraction of wheel radius (747 needs chunky visible legs). */
const STRUT_RADIUS_FRAC: Record<string, number> = {
  b747: 0.48,
  b737: 0.18,
  dash8400: 0.16,
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
  const ground = sceneGroundY(root);
  let attachY = ground;
  let found = false;

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.visible) return;
    if (child.userData.isLandingGear) return;
    if (/engine|nacelle|nozzle|reverser|chrome|door/i.test(child.name)) return;
    const box = boundsInRootLocal(root, child);
    const center = box.getCenter(new THREE.Vector3());
    if (Math.abs(center.x - x) > searchX || Math.abs(center.z - z) > searchZ) return;
    // Skip geometry that sits on the runway plane (pods / antennas).
    if (box.min.y < ground + 0.45) return;
    attachY = Math.max(attachY, box.min.y);
    found = true;
  });

  // Near centerline, fall back to the fuselage belly if nothing nearby matched.
  if (!found && Math.abs(x) < 6) {
    const fuselage = root.getObjectByName('fuselage');
    if (fuselage) {
      const fBox = boundsInRootLocal(root, fuselage);
      if (Number.isFinite(fBox.min.y)) {
        return Math.max(ground + 0.35, fBox.min.y);
      }
    }
  }
  return found ? attachY : Math.max(ground + 1.2, attachY);
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
    const belly = bellyAttachY(root, spec.x, spec.z, 5.5, 6);
    const ground = sceneGroundY(root);
    const sizeY = box.getSize(new THREE.Vector3()).y;
    return {
      x: spec.x,
      z: spec.z,
      // Floor-relative attachY is applied later in world space; keep a local fallback.
      attachY: belly || ground + sizeY * 0.12,
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
      // Prefer fuselage/belly height — door max.y sits nearly on the wheel tops.
      let attachY = Math.max(belly, merged.min.y);
      if (/mesh_13|mesh_21/.test(spec.node ?? '')) {
        attachY = Math.max(merged.min.y + 0.1, belly, merged.max.y - 0.25);
      } else if (/mgdouter|gdouter/.test(spec.node ?? '')) {
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
    new THREE.CylinderGeometry(wheelR, wheelR, wheelR * 0.45, 16),
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
): number {
  const specs = GEAR_LEG_ANCHORS[aircraftId];
  if (!specs) return 0;

  root.updateMatrixWorld(true);
  const size = box.getSize(new THREE.Vector3());
  // After ModelLoader normalize, the model sits on world Y = box.min.y (≈ 0).
  const floorY = box.min.y;
  const wheelR =
    aircraftId === 'b747'
      ? 0.72
      : Math.min(0.5, Math.max(0.28, size.y * 0.028));
  const minStrut = MIN_STRUT_M[aircraftId] ?? Math.max(0.7, size.y * 0.08);
  const drop = GEAR_DROP_M[aircraftId] ?? 0;
  const strutFrac = STRUT_RADIUS_FRAC[aircraftId] ?? 0.14;
  const maxStrut = aircraftId === 'b747' ? 5.0 : size.y * 0.35;
  const wheelMat = new THREE.MeshStandardMaterial({
    color: aircraftId === 'b747' ? 0x1a1a1e : 0x22252c,
    metalness: 0.25,
    roughness: 0.65,
    side: THREE.DoubleSide,
  });
  const strutMat = new THREE.MeshStandardMaterial({
    // Brighter on 747 so legs read against the dark belly from outside cam.
    color: aircraftId === 'b747' ? 0xe4e8f0 : 0x6a6e78,
    metalness: 0.7,
    roughness: 0.28,
    side: THREE.DoubleSide,
  });
  const bogieMat = new THREE.MeshStandardMaterial({
    color: 0xa8adb8,
    metalness: 0.65,
    roughness: 0.35,
    side: THREE.DoubleSide,
  });

  const group = new THREE.Group();
  group.name = 'proceduralLandingGear';
  const refs: THREE.Mesh[] = [];
  const seen = new Set<string>();
  const tmpWorld = new THREE.Vector3();
  const tmpLocal = new THREE.Vector3();

  const toLocal = (wx: number, wy: number, wz: number): THREE.Vector3 => {
    tmpWorld.set(wx, wy, wz);
    return root.worldToLocal(tmpLocal.copy(tmpWorld)).clone();
  };

  for (const spec of specs) {
    const leg = resolveAnchor(root, box, spec);
    if (!leg || leg.x === undefined || leg.z === undefined) continue;

    const key = `${leg.x.toFixed(2)}:${leg.z.toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Prefer authored floor-relative attachY (stable); else use resolved local attach.
    let attachWorldY: number;
    if (spec.attachY !== undefined) {
      attachWorldY = floorY + spec.attachY;
    } else if (leg.attachY !== undefined) {
      const p = root.localToWorld(new THREE.Vector3(leg.x, leg.attachY, leg.z));
      attachWorldY = p.y;
    } else {
      attachWorldY = floorY + minStrut + drop;
    }

    const wheelWorldY = floorY - drop + wheelR;
    const desiredTop = Math.max(attachWorldY, wheelWorldY + minStrut);
    const strutHeight = Math.min(maxStrut, Math.max(minStrut, desiredTop - wheelWorldY));
    const strutCenterWorldY = wheelWorldY + strutHeight / 2;
    const strutR = Math.max(0.08, wheelR * strutFrac);

    const legWorld = root.localToWorld(new THREE.Vector3(leg.x, 0, leg.z));
    const wx = legWorld.x;
    const wz = legWorld.z;

    // Convert height in world Y back to root-local, but keep span/fore-aft in local
    // space so dual bogies stay left/right of the aircraft (not world-X skewed).
    const strutPos = toLocal(wx, strutCenterWorldY, wz);
    strutPos.x = leg.x;
    strutPos.z = leg.z;
    const strut = new THREE.Mesh(
      new THREE.CylinderGeometry(strutR * 0.85, strutR, strutHeight, 10),
      strutMat,
    );
    strut.position.copy(strutPos);
    strut.userData.isLandingGear = true;
    group.add(strut);
    refs.push(strut);

    if (leg.dual) {
      const offset = wheelR * 0.85;
      const axlePos = toLocal(wx, wheelWorldY + wheelR * 0.15, wz);
      axlePos.x = leg.x;
      axlePos.z = leg.z;
      const axle = new THREE.Mesh(
        new THREE.CylinderGeometry(strutR * 0.55, strutR * 0.55, offset * 2.1, 8),
        bogieMat,
      );
      axle.rotation.z = Math.PI / 2;
      axle.position.copy(axlePos);
      axle.userData.isLandingGear = true;
      group.add(axle);
      refs.push(axle);

      const wheelPos = toLocal(wx, wheelWorldY, wz);
      addWheel(group, refs, leg.x - offset, wheelPos.y, leg.z, wheelR, wheelMat);
      addWheel(group, refs, leg.x + offset, wheelPos.y, leg.z, wheelR, wheelMat);
    } else {
      const wheelPos = toLocal(wx, wheelWorldY, wz);
      addWheel(group, refs, leg.x, wheelPos.y, leg.z, wheelR, wheelMat);
    }
  }

  root.add(group);
  root.userData.landingGearMeshes = refs;
  return drop;
}

/**
 * Mark landing-gear meshes after ModelLoader normalization.
 * @returns how far the wheels sit below the model's lowest geometry, so the
 * caller can place the airframe with its wheels on the runway.
 */
export function setupLandingGear(root: THREE.Object3D, aircraftId: string): number {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  if (PROCEDURAL_GEAR_AIRCRAFT.has(aircraftId)) {
    hideEmbeddedGearMeshes(root, aircraftId);
    return attachProceduralLandingGear(root, aircraftId, box);
  }
  tagLandingGearMeshes(root, aircraftId);
  return 0;
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
