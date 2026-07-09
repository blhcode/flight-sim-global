#!/usr/bin/env node
/** Inspect model orientation after ModelLoader-style normalization. */
import './setup-node-dom.mjs';
import fs from 'fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const AIRCRAFT = [
  { id: 'cessna172', file: 'cessna-172sp/scene.glb', wing: 11, preX: 0, yaw: 0 },
  { id: 'b737', file: 'b737-800/scene.glb', wing: 35.8, preX: 0, yaw: 0 },
  { id: 'b747', file: 'b747-400/scene.glb', wing: 64.4, preX: 0, yaw: 0 },
  { id: 'dash8400', file: 'dash8-q400/scene.glb', wing: 28.4, preX: 0, yaw: 0 },
  { id: 'twinOtter', file: 'twin-otter/scene.glb', wing: 19.8, preX: -Math.PI / 2, yaw: Math.PI, spanAxis: 'x' },
];

const loader = new GLTFLoader();

function normalize(root, wing, preX, yaw, spanAxis = 'auto') {
  if (preX) {
    root.rotation.x = preX;
    root.updateMatrixWorld(true);
  }
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const span = spanAxis === 'x' ? size.x : spanAxis === 'z' ? size.z : Math.max(size.x, size.z);
  if (span > 0) root.scale.multiplyScalar(wing / span);
  root.updateMatrixWorld(true);
  box.setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  root.position.sub(new THREE.Vector3(center.x, box.min.y, center.z));
  root.rotation.y = yaw;
  root.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(root);
}

function noseHint(box) {
  // Cockpit usually at min.z (nose = -Z) in our convention
  const size = box.getSize(new THREE.Vector3());
  return {
    minZ: box.min.z.toFixed(2),
    maxZ: box.max.z.toFixed(2),
    size: `${size.x.toFixed(1)}x${size.y.toFixed(1)}x${size.z.toFixed(1)}`,
    noseAtMinZ: size.z > 2,
  };
}

for (const ac of AIRCRAFT) {
  const buf = fs.readFileSync(`public/models/${ac.file}`);
  const gltf = await loader.parseAsync(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    '',
  );
  const root = gltf.scene.clone(true);
  let meshes = 0;
  let transparent = 0;
  root.traverse((c) => {
    if (c.isMesh) {
      meshes++;
      const mats = Array.isArray(c.material) ? c.material : [c.material];
      for (const m of mats) {
        if (m.transparent || m.alphaTest > 0) transparent++;
      }
    }
  });
  const box = normalize(root, ac.wing, ac.preX, ac.yaw, ac.spanAxis);
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(root.quaternion);
  console.log(
    JSON.stringify({
      id: ac.id,
      meshes,
      transparentMats: transparent,
      box: noseHint(box),
      forward: { x: fwd.x.toFixed(3), y: fwd.y.toFixed(3), z: fwd.z.toFixed(3) },
    }),
  );
}
