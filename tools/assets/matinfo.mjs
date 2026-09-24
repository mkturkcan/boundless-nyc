// Print the parameters of exported UE material instances (ueextract `export` JSON) by name.
//   node tools/assets/matinfo.mjs [--root <exportDir>] <MI_name|path.json>...
// Looks each name up anywhere under the export root (default $ASSET_TOOLS/carla_export).
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
let root = (process.env.ASSET_TOOLS || `${process.env.USERPROFILE || process.env.HOME}/.tools`) + '/carla_export';
if (args[0] === '--root') { root = args[1]; args.splice(0, 2); }

const index = new Map();
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.json')) index.set(e.name.slice(0, -5).toLowerCase(), p);
  }
})(root);

const short = (v) => String(v).split('/').pop().split('.')[0];
for (const a of args) {
  const file = a.endsWith('.json') ? a : index.get(a.toLowerCase());
  if (!file) { console.log(`===== ${a}: not found`); continue; }
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const p = j.Parameters || {};
  const props = p.Properties || {};
  console.log(`===== ${a}  (${path.relative(root, file)})`);
  console.log('  tex:', Object.entries(j.Textures || {}).map(([k, v]) => `${k}=${short(v)}`).join(', '));
  console.log('  blend', p.BlendMode, 'shading', p.ShadingModel, 'overrides', JSON.stringify(props.BasePropertyOverrides || {}),
    'twoSided', props.TwoSided ?? '-', 'parent', short((props.Parent || {}).ObjectName || '-'));
  const cols = Object.entries(p.Colors || {});
  if (cols.length) console.log('  colors:', cols.map(([k, v]) => `${k}=${v.Hex || JSON.stringify(v)}`).join(', '));
  const sc = Object.entries(p.Scalars || {});
  if (sc.length) console.log('  scalars:', sc.map(([k, v]) => `${k}=${(+v).toFixed(3)}`).join(', '));
  const sw = Object.entries(p.Switches || {});
  if (sw.length) console.log('  switches:', sw.map(([k, v]) => `${k}=${v}`).join(', '));
}
