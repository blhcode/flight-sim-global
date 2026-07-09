import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { AircraftDefinition } from '../aircraft/types.ts';
import { createProceduralAircraft } from './procedural/Fleet.ts';
import { setLandingGearVisible, setupLandingGear } from './landingGear.ts';
import { setupPropellers } from './propellers.ts';

interface NormalizeOptions {
  preRotation?: THREE.Euler;
  /** Applied after yaw, before final grounding pass. */
  postRotation?: THREE.Euler;
  /** Yaw after grounding. GLB imports use 0; procedural fallbacks use PI. */
  yawRad?: number;
  /** Use X or Z span for wingspan scaling when fuselage length dominates max(x,z). */
  wingspanAxis?: 'auto' | 'x' | 'z';
}

export interface LoadedAircraftModel {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer | null;
  cameraMounts: {
    cockpit: THREE.Vector3;
    cockpitLook: THREE.Vector3;
    gear: THREE.Vector3;
    gearLook: THREE.Vector3;
    outside: THREE.Vector3;
    chase: THREE.Vector3;
  };
  gearOffsetM: number;
}

function enableShadows(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
}

function normalizeToGround(
  object: THREE.Object3D,
  targetWingspanM: number,
  options: NormalizeOptions = {},
): THREE.Box3 {
  const { preRotation, postRotation, yawRad = 0, wingspanAxis = 'auto' } = options;
  if (preRotation) {
    object.rotation.copy(preRotation);
    object.updateMatrixWorld(true);
  }
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const wingspan =
    wingspanAxis === 'x' ? size.x : wingspanAxis === 'z' ? size.z : Math.max(size.x, size.z);
  if (wingspan > 0) {
    object.scale.multiplyScalar(targetWingspanM / wingspan);
  }

  object.updateMatrixWorld(true);
  box.setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  object.position.sub(new THREE.Vector3(center.x, box.min.y, center.z));

  if (preRotation) {
    const qPre = object.quaternion.clone();
    const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawRad);
    object.quaternion.copy(qPre).multiply(qYaw);
  } else {
    object.rotation.y = yawRad;
  }

  if (postRotation) {
    object.quaternion.multiply(new THREE.Quaternion().setFromEuler(postRotation));
  }

  object.updateMatrixWorld(true);
  box.setFromObject(object);
  const centerAfter = box.getCenter(new THREE.Vector3());
  object.position.sub(new THREE.Vector3(centerAfter.x, box.min.y, centerAfter.z));

  object.updateMatrixWorld(true);
  box.setFromObject(object);
  object.position.y -= box.min.y;
  object.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(object);
}

function cameraMountsFromBounds(box: THREE.Box3): LoadedAircraftModel['cameraMounts'] & { gearOffsetM: number } {
  const size = box.getSize(new THREE.Vector3());
  const cockpit = new THREE.Vector3(
    size.x * 0.02,
    box.max.y * 0.82,
    box.min.z + size.z * 0.42,
  );
  const cockpitLook = new THREE.Vector3(
    size.x * 0.02,
    box.max.y * 0.72,
    box.min.z - size.z * 0.32,
  );
  const gear = new THREE.Vector3(
    -size.x * 0.22,
    box.min.y + Math.max(0.25, size.y * 0.06),
    box.min.z + size.z * 0.12,
  );
  const gearLook = new THREE.Vector3(
    0,
    box.min.y + size.y * 0.25,
    box.min.z - size.z * 0.65,
  );
  const outside = new THREE.Vector3(
    0,
    box.max.y + size.y * 0.25,
    box.max.z + size.z * 1.15,
  );
  const chase = new THREE.Vector3(0, box.max.y + size.y * 0.5, box.max.z + size.z * 0.85);
  return {
    cockpit,
    cockpitLook,
    gear,
    gearLook,
    outside,
    chase,
    gearOffsetM: Math.max(0.8, box.max.y * 0.12),
  };
}

function fixImportedMaterials(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (!material) continue;
      material.side = THREE.DoubleSide;
      if (material instanceof THREE.MeshStandardMaterial) {
        material.metalness = Math.min(material.metalness, 0.35);
        material.roughness = Math.max(material.roughness, 0.45);
      }
    }
  });
}

function cleanupCessnaTieDown(root: THREE.Object3D): void {
  const tieDownNodes = new Set([
    'Cube010_50',
    'Circle001_29',
    'Circle002_32',
    'Circle003_46',
    'Circle005_49',
    'Plane030_34',
    'Plane029_33',
    'Plane031_35',
    'Plane036_37',
  ]);

  root.traverse((child) => {
    if (tieDownNodes.has(child.name)) {
      child.visible = false;
      return;
    }
    if (!(child instanceof THREE.Mesh)) return;

    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (!material) continue;
      if (material.name === 'remove_before_flight' || material.name === 'Concrete') {
        child.visible = false;
        break;
      }
    }
  });
}

function gltfNormalizeOptions(aircraftId: string): NormalizeOptions {
  // Sketchfab Cessna is authored nose +Z; sim body frame is nose −Z.
  if (aircraftId === 'cessna172') {
    return { yawRad: Math.PI, wingspanAxis: 'auto' };
  }
  // Sketchfab Twin Otter: fuselage along +Y in file; lay flat upright with nose −Z.
  if (aircraftId === 'twinOtter') {
    return {
      preRotation: new THREE.Euler(-Math.PI / 2, 0, 0),
      yawRad: Math.PI,
      wingspanAxis: 'x',
    };
  }
  return { yawRad: 0, wingspanAxis: 'x' };
}

function prepareLoadedGltf(
  gltf: GLTF,
  wingSpanM: number,
  aircraftId: string,
): LoadedAircraftModel {
  const root = gltf.scene;
  if (aircraftId === 'cessna172') {
    cleanupCessnaTieDown(root);
  }
  fixImportedMaterials(root);

  enableShadows(root);

  const normalizeOptions = gltfNormalizeOptions(aircraftId);
  const box = normalizeToGround(root, wingSpanM, normalizeOptions);
  setupLandingGear(root, aircraftId);
  setLandingGearVisible(root, true);
  setupPropellers(root, aircraftId, box);
  const mounts = cameraMountsFromBounds(box);

  return {
    root,
    mixer: null,
    cameraMounts: {
      cockpit: mounts.cockpit,
      cockpitLook: mounts.cockpitLook,
      gear: mounts.gear,
      gearLook: mounts.gearLook,
      outside: mounts.outside,
      chase: mounts.chase,
    },
    gearOffsetM: mounts.gearOffsetM,
  };
}

function prepareProcedural(
  proceduralModelId: AircraftDefinition['proceduralModelId'],
  wingSpanM: number,
): LoadedAircraftModel {
  const model = createProceduralAircraft(proceduralModelId);
  enableShadows(model);
  const box = normalizeToGround(model, wingSpanM, { yawRad: Math.PI });
  setupLandingGear(model, proceduralModelId);
  setLandingGearVisible(model, true);
  setupPropellers(model, proceduralModelId, box);
  const mounts = cameraMountsFromBounds(box);

  return {
    root: model,
    mixer: null,
    cameraMounts: {
      cockpit: mounts.cockpit,
      cockpitLook: mounts.cockpitLook,
      gear: mounts.gear,
      gearLook: mounts.gearLook,
      outside: mounts.outside,
      chase: mounts.chase,
    },
    gearOffsetM: mounts.gearOffsetM,
  };
}

export async function loadAircraftModel(def: AircraftDefinition): Promise<LoadedAircraftModel> {
  if (!def.modelUrl) {
    return prepareProcedural(def.proceduralModelId, def.wingSpanM);
  }

  const loader = new GLTFLoader();
  try {
    const gltf = await loader.loadAsync(def.modelUrl);
    return prepareLoadedGltf(gltf, def.wingSpanM, def.id);
  } catch (err) {
    console.warn(`Failed to load ${def.modelUrl}, using procedural ${def.displayName}`, err);
    return prepareProcedural(def.proceduralModelId, def.wingSpanM);
  }
}
