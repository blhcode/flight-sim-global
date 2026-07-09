import './setup-node-dom.mjs';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

globalThis.ProgressEvent = class ProgressEvent extends Event {
  constructor(type, init = {}) {
    super(type);
    this.lengthComputable = init.lengthComputable ?? false;
    this.loaded = init.loaded ?? 0;
    this.total = init.total ?? 0;
  }
};

const loader = new GLTFLoader();
for (const m of ['b737-800', 'b747-400', 'dash8-q400', 'twin-otter']) {
  const buf = fs.readFileSync(`public/models/${m}/scene.glb`);
  const gltf = await loader.parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
  const box = new THREE.Box3().setFromObject(gltf.scene);
  const size = box.getSize(new THREE.Vector3());
  let meshes = 0;
  gltf.scene.traverse((c) => { if (c.isMesh) meshes++; });
  console.log(`${m}: OK meshes=${meshes} size ${size.x.toFixed(1)} x ${size.y.toFixed(1)} x ${size.z.toFixed(1)}`);
}
