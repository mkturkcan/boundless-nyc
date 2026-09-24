// Survey exported CARLA walker meshes: per material, its class guess and main texture maps with their sizes.
//   node tools/assets/pedsurvey.mjs [SK_name...]
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { readMaterial, findTexture, EXPORT_ROOT } from './lib/ue.mjs';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const PED = path.join(EXPORT_ROOT, 'CarlaUnreal/Content/Carla/Static/Pedestrian');
const want = process.argv.slice(2);
const files = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/^SK_.*\.glb$/.test(e.name)) files.push(p); } })(PED);
const dims = async (name) => { const f = name && findTexture(name); if (!f) return '-'; const m = await sharp(f).metadata(); return `${m.width}`; };
const KEYS = ['Diffuse', 'Diffuse Texture', 'Color_MAIN_UDIM', 'PM_Diffuse', 'Normal', 'Normalmap', 'Normal_MAIN_UDIM', 'PM_Normals', 'ORC', 'ORM_MatC', 'PM_SpecularMasks', 'Masks', 'Roughness_MAIN_UDIM', 'Alpha', 'Root', 'IrisBaseColor'];
for (const f of files) {
  const name = path.basename(f, '.glb');
  if (want.length && !want.includes(name)) continue;
  const doc = await io.read(f);
  console.log(`\n=== ${name}`);
  for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) {
    const mn = p.getMaterial()?.getName() || '-';
    const tris = p.getIndices().getCount() / 3;
    const mi = readMaterial(mn);
    const t = mi?.textures || {};
    const out = [];
    for (const k of KEYS) if (t[k] && !/Flat_|DefaultTexture|T_black|BlankWhite/.test(t[k])) out.push(`${k}=${t[k]}(${await dims(t[k])})`);
    console.log(`  ${mn.padEnd(40)} tris ${String(tris).padStart(6)} shading ${mi?.shading || '?'} ${mi?.blend || ''} | ${out.join(' ')}`);
  }
}
