// Survey CARLA vehicle blueprints: components, their meshes (exported? tris) and the materials each mesh uses.
//   node tools/assets/vehsurvey.mjs [BP_name...]      (default: every BP dump in carla_json/vehicles)
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const JSON_DIR = (process.env.ASSET_TOOLS || `${process.env.USERPROFILE || process.env.HOME}/.tools`) + '/carla_json/vehicles';
const EXPORT = (process.env.ASSET_TOOLS || `${process.env.USERPROFILE || process.env.HOME}/.tools`) + '/carla_export';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const want = process.argv.slice(2);
const pkgPath = (o) => (o && o.ObjectPath ? String(o.ObjectPath).replace(/\.\d+$/, '') : null);

for (const f of fs.readdirSync(JSON_DIR).filter((f) => f.startsWith('BP_') && !/_(FLW|FRW|RLW|RRW)\.json$/.test(f))) {
  const bp = f.replace('.json', '');
  if (want.length && !want.includes(bp)) continue;
  const j = JSON.parse(fs.readFileSync(path.join(JSON_DIR, f), 'utf8'));
  console.log(`\n##### ${bp}`);
  const seen = new Set();
  for (const e of j) {
    const p = e.Properties || {};
    const mesh = pkgPath(p.StaticMesh || p.SkeletalMesh || p.SkinnedAsset);
    if (!mesh || seen.has(mesh + e.Name)) continue;
    seen.add(mesh + e.Name);
    const glb = path.join(EXPORT, mesh + '.glb');
    let info = 'NOT EXPORTED';
    if (fs.existsSync(glb)) {
      const doc = await io.read(glb);
      const mats = new Map();
      for (const m of doc.getRoot().listMeshes()) for (const pr of m.listPrimitives()) {
        const n = pr.getMaterial()?.getName() || '-';
        const t = (pr.getIndices()?.getCount() ?? pr.getAttribute('POSITION').getCount()) / 3;
        mats.set(n, (mats.get(n) || 0) + t);
      }
      info = [...mats].map(([n, t]) => `${n}:${t}`).join(' ');
    }
    const over = (p.OverrideMaterials || []).map((m) => (m ? pkgPath(m).split('/').pop() : '_')).join(' ');
    console.log(`  ${e.Name.replace('_GEN_VARIABLE', '')} <- ${mesh.split('/').pop()}  [${info}]${over ? '  override: ' + over : ''}`);
  }
}
