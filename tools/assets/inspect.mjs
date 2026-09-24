// Inspect glTF/GLB files: nodes, meshes, primitives (material, tris, attributes), skins, bounds.
//   node tools/assets/inspect.mjs <file.glb> [...]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const file of process.argv.slice(2)) {
  const doc = await io.read(file);
  const root = doc.getRoot();
  console.log(`\n=== ${file.split(/[\\/]/).slice(-2).join('/')}`);
  const scene = root.getDefaultScene() || root.listScenes()[0];
  const b = getBounds(scene);
  const size = b.max.map((v, i) => +(v - b.min[i]).toFixed(3));
  console.log(`bounds min ${b.min.map((v) => v.toFixed(3))} max ${b.max.map((v) => v.toFixed(3))} size ${size}`);
  for (const mesh of root.listMeshes()) {
    let tris = 0;
    for (const p of mesh.listPrimitives()) {
      const idx = p.getIndices();
      const pos = p.getAttribute('POSITION');
      const t = idx ? idx.getCount() / 3 : pos.getCount() / 3;
      tris += t;
      const attrs = p.listSemantics().join(',');
      console.log(`  prim mat='${p.getMaterial()?.getName() ?? '-'}' tris=${t} verts=${pos.getCount()} attrs=${attrs}`);
    }
    console.log(`  mesh '${mesh.getName()}' total tris ${tris}`);
  }
  for (const skin of root.listSkins()) {
    const joints = skin.listJoints();
    console.log(`  skin: ${joints.length} joints: ${joints.slice(0, 40).map((j) => j.getName()).join(' ')}${joints.length > 40 ? ' ...' : ''}`);
  }
  console.log(`  materials: ${root.listMaterials().map((m) => m.getName()).join(' | ')}`);
  console.log(`  textures: ${root.listTextures().length}, animations: ${root.listAnimations().length}, nodes: ${root.listNodes().length}`);
}
