/**
 * Convert Flightradar24 GLB v1 (glTF 1.0) to glTF 2.0 GLB for Three.js.
 * Usage: node scripts/convert-fr24-glb.mjs <input.glb> <output.glb>
 */
import fs from 'node:fs';
import gltfPipeline from 'gltf-pipeline';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('Usage: node scripts/convert-fr24-glb.mjs <input.glb> <output.glb>');
  process.exit(1);
}

const data = fs.readFileSync(input);
const { gltf } = await gltfPipeline.glbToGltf(data);
const processed = await gltfPipeline.processGltf(gltf);
const { glb } = await gltfPipeline.gltfToGlb(processed.gltf);

fs.mkdirSync(output.split('/').slice(0, -1).join('/'), { recursive: true });
fs.writeFileSync(output, glb);
console.log(
  `Converted ${input} → ${output} (${(glb.length / 1024 / 1024).toFixed(2)} MB, ${processed.gltf.meshes.length} meshes)`,
);
