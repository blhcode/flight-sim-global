import './setup-node-dom.mjs';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { setupPropellers, setupTwinOtterProps } from '../src/rendering/propellers.ts';
import { spinNamedPropellers } from '../src/aircraft/animateCommon.ts';

globalThis.ProgressEvent = class ProgressEvent extends Event {
  constructor(type, init = {}) {
    super(type);
    this.lengthComputable = init.lengthComputable ?? false;
    this.loaded = init.loaded ?? 0;
    this.total = init.total ?? 0;
  }
};

function normalizeToGround(object, targetWingspanM, options = {}) {
  const { preRotation, yawRad = 0, wingspanAxis = 'auto' } = options;
  if (preRotation) {
    object.rotation.copy(preRotation);
    object.updateMatrixWorld(true);
  }
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const wingspan =
    wingspanAxis === 'x' ? size.x : wingspanAxis === 'z' ? size.z : Math.max(size.x, size.z);
  if (wingspan > 0) object.scale.multiplyScalar(targetWingspanM / wingspan);
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
  object.updateMatrixWorld(true);
  box.setFromObject(object);
  object.position.y -= box.min.y;
  object.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(object);
}

async function loadCase(label, relPath, wingspan, normalizeOptions, aircraftId, extraSetup) {
  const file = path.join('public', relPath);
  const buf = fs.readFileSync(file);
  const gltf = await new GLTFLoader().parseAsync(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    '',
  );
  const root = gltf.scene;
  const box = normalizeToGround(root, wingspan, normalizeOptions);
  if (extraSetup) {
    await extraSetup(root, box);
  } else {
    setupPropellers(root, aircraftId, box);
  }

  const props = [];
  root.traverse((c) => {
    if (c.userData.isPropeller) props.push(c);
  });
  const before = props.map((p) => p.rotation.z);
  for (let i = 0; i < 60; i++) spinNamedPropellers(root, [], 0.5, 0.016);
  const deltas = props.map((p, i) => Math.abs(p.rotation.z - before[i]));
  console.log(
    `${label}: props=${props.map((p) => p.name).join(',')} deltas=${deltas.map((d) => d.toFixed(2)).join(',')}`,
  );
  return props.length > 0 && deltas.every((d) => d > 0.1);
}

const cessnaOk = await loadCase(
  'Cessna',
  'models/cessna-172sp/scene.glb',
  11,
  { yawRad: Math.PI, wingspanAxis: 'auto' },
  'cessna172',
);
const twinOk = await loadCase(
  'Twin Otter',
  'models/twin-otter/scene.glb',
  19.8,
  { preRotation: new THREE.Euler(-Math.PI / 2, 0, 0), yawRad: Math.PI, wingspanAxis: 'x' },
  'twinOtter',
  (root, box) => setupTwinOtterProps(root, box, '/'),
);
console.log(cessnaOk && twinOk ? 'PASS' : 'FAIL');
