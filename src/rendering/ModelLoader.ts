import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createProceduralCessna172 } from './ProceduralCessna172.ts';

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

const WINGSPAN_M = 11;

function enableShadows(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
}

function normalizeToGround(object: THREE.Object3D, targetWingspanM: number): THREE.Box3 {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const wingspan = Math.max(size.x, size.z);
  if (wingspan > 0) {
    object.scale.multiplyScalar(targetWingspanM / wingspan);
  }

  object.updateMatrixWorld(true);
  box.setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  object.position.sub(new THREE.Vector3(center.x, box.min.y, center.z));
  object.rotation.y = Math.PI;

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

function cleanupSketchfabArtifacts(root: THREE.Object3D): void {
  const hiddenMaterialNames = new Set([
    'remove_before_flight',
    'material',
    'material_19',
    'material_20',
    'Material.006',
    'Material.007',
    'Material.009',
  ]);
  const hiddenNodeNames = new Set([
    'Circle.001_29',
    'Circle.002_32',
    'Circle.003_46',
    'Circle.004_48',
    'Circle.005_49',
    'Plane.006_5',
    'Plane.009_11',
    'Plane.010_12',
    'Plane.020_18',
    'Plane.021_19',
    'Plane.022_20',
    'Plane.036_37',
    'Plane.040_45',
    'Plane.029_33',
    'Plane.030_34',
    'Plane.031_35',
    'Cube.010_50',
  ]);

  root.traverse((child) => {
    if (hiddenNodeNames.has(child.name)) {
      child.visible = false;
      return;
    }

    if (!(child instanceof THREE.Mesh)) return;

    const materials = Array.isArray(child.material) ? child.material : [child.material];
    const hide = materials.some((material) => {
      if (!material) return false;
      if (hiddenMaterialNames.has(material.name)) return true;
      const standard = material as THREE.MeshStandardMaterial;
      if (standard.emissive) {
        const e = standard.emissive;
        return e.r + e.g + e.b > 2.5;
      }
      return false;
    });

    if (hide) child.visible = false;
  });
}

function prepareSketchfabCessna(gltf: GLTF): LoadedAircraftModel {
  const root = gltf.scene;
  cleanupSketchfabArtifacts(root);
  enableShadows(root);
  const box = normalizeToGround(root, WINGSPAN_M);
  const mounts = cameraMountsFromBounds(box);

  let mixer: THREE.AnimationMixer | null = null;
  // Sketchfab export includes a door animation — do not play it.
  // Prop spin is handled manually in animateC172 via userData.isPropeller.

  // Sketchfab export: Circle_6 is the propeller assembly.
  const prop = root.getObjectByName('Circle_6');
  if (prop) prop.userData.isPropeller = true;

  return {
    root,
    mixer,
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

function prepareProcedural(model: THREE.Object3D): LoadedAircraftModel {
  return {
    root: model,
    mixer: null,
    cameraMounts: {
      cockpit: new THREE.Vector3(0, 1.35, 0.35),
      cockpitLook: new THREE.Vector3(0, 1.32, -8),
      gear: new THREE.Vector3(-1.0, 0.3, 0.8),
      gearLook: new THREE.Vector3(0, 0.8, -14),
      outside: new THREE.Vector3(0, 3.5, 16),
      chase: new THREE.Vector3(0, 2.8, 9),
    },
    gearOffsetM: 1.2,
  };
}

export async function loadAircraftModel(url: string | null): Promise<LoadedAircraftModel> {
  if (!url) {
    return prepareProcedural(createProceduralCessna172());
  }

  const loader = new GLTFLoader();
  try {
    const gltf = await loader.loadAsync(url);
    return prepareSketchfabCessna(gltf);
  } catch (err) {
    console.warn(`Failed to load ${url}, using procedural Cessna 172`, err);
    return prepareProcedural(createProceduralCessna172());
  }
}
