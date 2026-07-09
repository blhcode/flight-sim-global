/**
 * Convert FlightGear AC3D aircraft mesh(es) to GLB (Three.js Y-up).
 * Usage: node scripts/convert-ac3d-to-glb.mjs <input.ac> [more.ac ...] <output.glb> [textureDir]
 */
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { Document, NodeIO } from '@gltf-transform/core';

const args = process.argv.slice(2);
const glbIdx = args.findIndex((a) => a.endsWith('.glb'));
if (glbIdx < 1) {
  console.error('Usage: node scripts/convert-ac3d-to-glb.mjs <input.ac> [more.ac ...] <output.glb> [textureDir]');
  process.exit(1);
}

const outputGlb = args[glbIdx];
const inputAcs = args.slice(0, glbIdx);
const textureDirArg = args[glbIdx + 1];
const textureDir = textureDirArg ?? path.dirname(inputAcs[0]);

function acToThree(x, y, z) {
  return new THREE.Vector3(x, y, -z);
}

function parseMaterials(lines, startIdx) {
  const materials = [];
  let i = startIdx;
  while (i < lines.length && lines[i].startsWith('MATERIAL ')) {
    const line = lines[i];
    const nameMatch = line.match(/MATERIAL "([^"]+)"/);
    const rgbMatch = line.match(/rgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
    const transMatch = line.match(/trans\s+([\d.]+)/);
    materials.push({
      name: nameMatch?.[1] ?? `mat${materials.length}`,
      color: rgbMatch
        ? new THREE.Color(+rgbMatch[1], +rgbMatch[2], +rgbMatch[3])
        : new THREE.Color(0.85, 0.85, 0.88),
      transparent: transMatch ? +transMatch[1] > 0.01 : false,
      opacity: transMatch ? 1 - +transMatch[1] : 1,
    });
    i++;
  }
  return { materials, index: i };
}

function parsePolyObject(lines, i, materials) {
  let name = 'mesh';
  let loc = [0, 0, 0];
  let texture = null;
  i++;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (line.startsWith('OBJECT ')) break;
    if (line.startsWith('name ')) name = line.slice(6).replace(/^"|"$/g, '');
    else if (line.startsWith('loc ')) loc = line.slice(4).split(/\s+/).map(Number);
    else if (line.startsWith('texture ')) texture = line.slice(9).replace(/^"|"$/g, '');
    else if (line.startsWith('numvert ')) break;
    i++;
  }

  const numVert = parseInt(lines[i].split(/\s+/)[1], 10);
  i++;
  const verts = [];
  for (let v = 0; v < numVert; v++) {
    const [x, y, z] = lines[i++].trim().split(/\s+/).map(Number);
    verts.push(acToThree(x + loc[0], y + loc[1], z + loc[2]));
  }

  const numSurf = parseInt(lines[i].split(/\s+/)[1], 10);
  i++;
  const groups = new Map();

  for (let s = 0; s < numSurf; s++) {
    const surfFlags = parseInt(lines[i++].split(/\s+/)[1], 16);
    const matLine = lines[i++];
    const matIdx = parseInt(matLine.split(/\s+/)[1], 10);
    const refsCount = parseInt(lines[i++].split(/\s+/)[1], 10);
    const refs = [];
    for (let r = 0; r < refsCount; r++) {
      refs.push(lines[i++].trim().split(/\s+/).map(Number));
    }

    const textured = (surfFlags & 0x20) !== 0 || refs[0].length >= 3;
    const tris =
      refsCount === 3
        ? [[0, 1, 2]]
        : [
            [0, 1, 2],
            [0, 2, 3],
          ];

    let group = groups.get(matIdx);
    if (!group) {
      group = { positions: [], normals: [], uvs: [], indices: [] };
      groups.set(matIdx, group);
    }
    const base = group.positions.length / 3;

    for (const [a, b, c] of tris) {
      const triVerts = [refs[a], refs[b], refs[c]];
      const p0 = verts[triVerts[0][0]];
      const p1 = verts[triVerts[1][0]];
      const p2 = verts[triVerts[2][0]];
      const n = new THREE.Vector3().crossVectors(
        new THREE.Vector3().subVectors(p1, p0),
        new THREE.Vector3().subVectors(p2, p0),
      );
      if (n.lengthSq() > 0) n.normalize();
      else n.set(0, 1, 0);

      for (const ref of triVerts) {
        group.positions.push(verts[ref[0]].x, verts[ref[0]].y, verts[ref[0]].z);
        group.normals.push(n.x, n.y, n.z);
        if (textured && ref.length >= 3) group.uvs.push(ref[1], 1 - ref[2]);
        else group.uvs.push(0, 0);
      }
      group.indices.push(base, base + 1, base + 2);
    }
  }

  return { name, texture, groups, index: i };
}

function parseAcFile(inputAc) {
  const text = fs.readFileSync(inputAc, 'utf8');
  const lines = text.split(/\r?\n/);
  const { materials, index: matEnd } = parseMaterials(lines, 1);
  const meshParts = [];
  let i = matEnd;

  while (i < lines.length) {
    const line = lines[i]?.trim() ?? '';
    if (!line.startsWith('OBJECT poly')) {
      i++;
      continue;
    }
    const poly = parsePolyObject(lines, i, materials);
    i = poly.index;

    if (/hotspot|remove-hotspot|add-hotspot|fasteningpoint|LHLNDlight|RHLNDlight|beacon-lit|sphere-lit/i.test(poly.name)) {
      continue;
    }
    if (/prop\.disk/i.test(poly.name)) {
      continue;
    }

    for (const [matIdx, g] of poly.groups) {
      if (g.indices.length === 0) continue;
      const matDef = materials[matIdx] ?? materials[0];
      meshParts.push({
        name: poly.name,
        positions: g.positions,
        normals: g.normals,
        uvs: g.uvs,
        indices: g.indices,
        color: matDef.color,
        opacity: matDef.opacity,
        transparent: matDef.transparent,
        textureFile: poly.texture,
      });
    }
  }

  return meshParts;
}

const meshParts = [];
for (const inputAc of inputAcs) {
  meshParts.push(...parseAcFile(inputAc));
}

const textureCache = new Map();

function loadTexture(file) {
  if (!file || textureCache.has(file)) return textureCache.get(file) ?? null;
  const full = path.join(textureDir, file);
  if (!fs.existsSync(full)) return null;
  const data = fs.readFileSync(full);
  const mime = file.toLowerCase().endsWith('.jpg') || file.toLowerCase().endsWith('.jpeg')
    ? 'image/jpeg'
    : 'image/png';
  const entry = { data, mime };
  textureCache.set(file, entry);
  return entry;
}

let minX = Infinity;
let minY = Infinity;
let minZ = Infinity;
for (const part of meshParts) {
  for (let p = 0; p < part.positions.length; p += 3) {
    minX = Math.min(minX, part.positions[p]);
    minY = Math.min(minY, part.positions[p + 1]);
    minZ = Math.min(minZ, part.positions[p + 2]);
  }
}
const offset = new THREE.Vector3(minX, minY, minZ);
for (const part of meshParts) {
  for (let p = 0; p < part.positions.length; p += 3) {
    part.positions[p] -= offset.x;
    part.positions[p + 1] -= offset.y;
    part.positions[p + 2] -= offset.z;
  }
}

const document = new Document();
const buffer = document.createBuffer();
const scene = document.createScene();
const texMap = new Map();

for (const part of meshParts) {
  const posAcc = document
    .createAccessor()
    .setArray(new Float32Array(part.positions))
    .setType('VEC3')
    .setBuffer(buffer);
  const normAcc = document
    .createAccessor()
    .setArray(new Float32Array(part.normals))
    .setType('VEC3')
    .setBuffer(buffer);
  const uvAcc = document
    .createAccessor()
    .setArray(new Float32Array(part.uvs))
    .setType('VEC2')
    .setBuffer(buffer);
  const idxAcc = document
    .createAccessor()
    .setArray(new Uint32Array(part.indices))
    .setType('SCALAR')
    .setBuffer(buffer);

  const mat = document
    .createMaterial()
    .setBaseColorFactor([part.color.r, part.color.g, part.color.b, part.opacity])
    .setMetallicFactor(0.15)
    .setRoughnessFactor(0.55)
    .setDoubleSided(part.transparent);

  if (part.textureFile) {
    let tex = texMap.get(part.textureFile);
    if (!tex) {
      const loaded = loadTexture(part.textureFile);
      if (loaded) {
        tex = document
          .createTexture(loaded.mime === 'image/jpeg' ? 'jpg' : 'png')
          .setMimeType(loaded.mime)
          .setImage(loaded.data);
        texMap.set(part.textureFile, tex);
      }
    }
    if (tex) mat.setBaseColorTexture(tex);
  }

  const prim = document
    .createPrimitive()
    .setMode(4)
    .setAttribute('POSITION', posAcc)
    .setAttribute('NORMAL', normAcc)
    .setAttribute('TEXCOORD_0', uvAcc)
    .setIndices(idxAcc)
    .setMaterial(mat);

  const mesh = document.createMesh(part.name).addPrimitive(prim);
  scene.addChild(document.createNode(part.name).setMesh(mesh));
}

const io = new NodeIO();
fs.mkdirSync(path.dirname(outputGlb), { recursive: true });
await io.write(outputGlb, document);

const outSize = fs.statSync(outputGlb).size;
console.log(`Wrote ${outputGlb} (${(outSize / 1024 / 1024).toFixed(2)} MB, ${meshParts.length} meshes from ${inputAcs.length} file(s))`);
