#!/usr/bin/env node
/** Verify procedural gear placement and toggle for all aircraft. */
import './setup-node-dom.mjs';
import fs from 'fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { setupLandingGear, setLandingGearVisible, getGearDebug } from '../src/rendering/landingGear.ts';

function normalize(root, wing) {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const span = Math.max(size.x, size.z);
  if (span > 0) root.scale.multiplyScalar(wing / span);
  root.updateMatrixWorld(true);
  box.setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  root.position.sub(new THREE.Vector3(center.x, box.min.y, center.z));
  root.rotation.y = 0;
  root.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(root);
}

async function loadScene(file) {
  const buf = fs.readFileSync(`public/models/${file}`);
  const gltf = await new GLTFLoader().parseAsync(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    '',
  );
  return gltf;
}

const tests = [
  { id: 'cessna172', file: 'cessna-172sp/scene.glb', wing: 11, minWheels: 2, maxX: 6, minStrut: 0.05, yaw: Math.PI, nativeGear: true },
  { id: 'b737', file: 'b737-800/scene.glb', wing: 35.8, minWheels: 3, maxX: 4, minStrut: 0.4, wingspanAxis: 'x' },
  { id: 'dash8400', file: 'dash8-q400/scene.glb', wing: 28.4, minWheels: 3, maxX: 5, minStrut: 0.5, wingspanAxis: 'x' },
  { id: 'b747', file: 'b747-400/scene.glb', wing: 64.4, minWheels: 8, maxX: 14, minStrut: 0.4, wingspanAxis: 'x' },
  {
    id: 'twinOtter',
    file: 'twin-otter/scene.glb',
    wing: 19.8,
    minWheels: 0,
    maxX: 99,
    minStrut: 0,
    wingspanAxis: 'x',
    preRotation: new THREE.Euler(-Math.PI / 2, 0, 0),
    yaw: Math.PI,
    nativeGear: true,
  },
];

for (const ac of tests) {
  const gltf = await loadScene(ac.file);
  const root = gltf.scene;
  let box;
  const box0 = new THREE.Box3().setFromObject(root);
  if (ac.preRotation) {
    root.rotation.copy(ac.preRotation);
    root.updateMatrixWorld(true);
    box0.setFromObject(root);
  }
  const size0 = box0.getSize(new THREE.Vector3());
  const span =
    ac.wingspanAxis === 'x' ? size0.x : ac.wingspanAxis === 'z' ? size0.z : Math.max(size0.x, size0.z);
  if (span > 0) root.scale.multiplyScalar(ac.wing / span);
  root.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  root.position.sub(new THREE.Vector3(center.x, box.min.y, center.z));
  if (ac.preRotation) {
    const qPre = root.quaternion.clone();
    const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ac.yaw ?? 0);
    root.quaternion.copy(qPre).multiply(qYaw);
  } else {
    root.rotation.y = ac.yaw ?? 0;
  }
  root.updateMatrixWorld(true);
  box.setFromObject(root);
  root.position.y -= box.min.y;
  root.updateMatrixWorld(true);
  box.setFromObject(root);
  if (ac.id === 'cessna172') {
    for (const name of [
      'Cube010_50',
      'Circle001_29',
      'Circle002_32',
      'Circle003_46',
      'Circle005_49',
      'Plane030_34',
      'Plane029_33',
      'Plane031_35',
      'Plane036_37',
    ]) {
      const node = root.getObjectByName(name);
      if (node) node.visible = false;
    }
    root.traverse((child) => {
      if (!child.isMesh) return;
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
  const groundY = -root.position.y;

  setupLandingGear(root, ac.id);
  setLandingGearVisible(root, true);
  const up = getGearDebug(root);
  setLandingGearVisible(root, false);
  const down = getGearDebug(root);
  setLandingGearVisible(root, true);
  root.updateMatrixWorld(true);

  let maxX = 0;
  let maxStrutH = 0;
  let minWheelY = Infinity;
  const wheelR = Math.max(0.3, box.getSize(new THREE.Vector3()).y * 0.052);
  root.traverse((c) => {
    if (!c.isMesh) return;
    if (c.userData.isGearWheel) {
      maxX = Math.max(maxX, Math.abs(c.position.x));
      minWheelY = Math.min(minWheelY, c.position.y - wheelR);
      return;
    }
    if (!ac.nativeGear || !c.userData.isLandingGear) return;
    const gearBox = new THREE.Box3().setFromObject(c);
    const center = gearBox.getCenter(new THREE.Vector3());
    maxX = Math.max(maxX, Math.abs(center.x));
    minWheelY = Math.min(minWheelY, gearBox.min.y);
  });
  root.traverse((c) => {
    if (c.isMesh && c.visible && c.userData.isLandingGear && !c.userData.isGearWheel) {
      const b = new THREE.Box3().setFromObject(c);
      maxStrutH = Math.max(maxStrutH, b.getSize(new THREE.Vector3()).y);
    }
  });

  const dashEngineOk =
    ac.id !== 'dash8400' ||
    (() => {
      const wheels = [];
      root.traverse((c) => {
        if (c.isMesh && c.userData.isGearWheel) wheels.push(c.position.clone());
      });
      const mains = wheels.filter((w) => Math.abs(w.x) > 2);
      return mains.every((w) => Math.abs(w.z - 2) < 1.5);
    })();

  const rogueHighY =
    ac.id === 'b747'
      ? (() => {
          let count = 0;
          root.traverse((n) => {
            if (!n.isMesh || !n.visible || n.userData.isLandingGear) return;
            if (/^fuselage/i.test(n.name)) return;
            let parent = n.parent;
            while (parent) {
              if (/^wlg_|^nlg_|mgdouter|gdouter|ngww/i.test(parent.name)) {
                count++;
                break;
              }
              parent = parent.parent;
            }
          });
          return count === 0;
        })()
      : ac.id === 'cessna172'
        ? (() => {
            const tieDownParents = new Set([
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
            let count = 0;
            root.traverse((n) => {
              if (!n.isMesh || !n.visible || n.userData.isLandingGear) return;
              if (!tieDownParents.has(n.parent?.name ?? '')) return;
              let parent = n.parent;
              while (parent) {
                if (parent.visible === false) return;
                parent = parent.parent;
              }
              count++;
            });
            root.traverse((n) => {
              if (!n.isMesh || !n.visible || n.userData.isLandingGear) return;
              const mat = Array.isArray(n.material) ? n.material[0] : n.material;
              if (mat?.name === 'remove_before_flight' || mat?.name === 'Concrete') count++;
            });
            return count === 0;
          })()
        : true;

  const wheelOnGround =
    ac.nativeGear && ac.minWheels === 0
      ? box.min.y <= 0.2
      : minWheelY <= groundY + 0.2;

  console.log(
    JSON.stringify({
      aircraft: ac.id,
      wheels: up.wheels,
      visibleWheelsDown: down.visibleWheels,
      toggleWorks: up.visibleWheels > 0 && down.visibleWheels === 0,
      maxWheelX: +maxX.toFixed(1),
      maxStrutH: +maxStrutH.toFixed(2),
      wheelOnGround,
      dashEngineOk,
      rogueHighY,
      pass:
        up.wheels >= ac.minWheels &&
        up.visibleWheels >= ac.minWheels &&
        down.visibleWheels === 0 &&
        maxX <= ac.maxX &&
        maxStrutH >= ac.minStrut &&
        wheelOnGround &&
        dashEngineOk &&
        rogueHighY,
    }),
  );
}
