// Blender export -> the fleet GLB format of sim/fleet24.js (see tools/assets/build_vehicle.mjs): the root node's extras
// carry size / hubs / wheelbase, each material's extras its runtime class (from its "<cls>:<label>" name), every
// detail material gets a base-colour map (the runtime forces a detail colour to white and multiplies its map: a flat
// part carries its colour as a tiny solid map), textures become KTX2 (Basis UASTC), geometry is meshopt-compressed.
//   node finish.mjs <kind> <raw.glb> <meta.json> <out.glb>
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
// the asset tool chain's packages live in tools/assets/node_modules (the repo's asset pipeline)
const ASSETS = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../../../tools/assets');
const req = createRequire(path.join(ASSETS, 'package.json'));
const imp = (m) => import(pathToFileURL(req.resolve(m)).href);
const { NodeIO } = await imp('@gltf-transform/core');
const { ALL_EXTENSIONS, KHRTextureBasisu, KHRMaterialsClearcoat } = await imp('@gltf-transform/extensions');
const { meshopt, prune, dedup } = await imp('@gltf-transform/functions');
const { MeshoptEncoder } = await imp('meshoptimizer');
const sharp = (await imp('sharp')).default;
const { makeTexture } = await import(pathToFileURL(path.join(ASSETS, 'lib/tex.mjs')).href);

const [kind, rawFile, metaFile, outFile] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(rawFile);
const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
const root = doc.getRoot();
doc.createExtension(KHRTextureBasisu).setRequired(true);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dlv-'));

const node = root.listNodes().find((n) => n.getName() === kind);
if (!node) throw new Error('no root node ' + kind);
node.setExtras({ kind, size: meta.size, hubs: meta.hubs, wheelbase: meta.wheelbase, lights: [], source: 'procedural, BoundlessNYC (tools/ar34/vehicles/delivery)', built: new Date().toISOString() });
for (const n of ['LOD0', 'LOD1', 'LOD2']) if (!root.listNodes().some((x) => x.getName() === n)) throw new Error('missing ' + n);

const srgb = (v) => Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(0, v), 1 / 2.4) - 0.055));
const solids = new Map();
async function solid(lin) {
  const rgb = [0, 1, 2].map((k) => Math.max(0, Math.min(255, srgb(lin[k]))));
  const key = rgb.join(',');
  if (solids.has(key)) return solids.get(key);
  const f = path.join(TMP, `solid_${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}.png`);
  await sharp(Buffer.from(Array(64).fill(rgb).flat()), { raw: { width: 8, height: 8, channels: 3 } }).png().toFile(f);
  const r = await makeTexture(f, { kind: 'color', size: 8, mode: 'uastc' });
  const t = doc.createTexture('solid_' + rgb.join('_')).setImage(r.bytes).setMimeType('image/ktx2').setURI(`solid_${rgb.join('_')}.ktx2`);
  solids.set(key, t);
  return t;
}
async function toKtx(tex, kindTex, size) {
  if (tex.getMimeType() === 'image/ktx2') return tex;
  const f = path.join(TMP, (tex.getName() || 'tex').replace(/[^\w.-]/g, '_') + '.png');
  fs.writeFileSync(f, Buffer.from(tex.getImage()));
  const r = await makeTexture(f, { kind: kindTex, size, mode: 'uastc' });
  tex.setImage(r.bytes).setMimeType('image/ktx2').setURI(path.basename(f, '.png') + '.ktx2');
  return tex;
}
const counts = {};
for (const m of root.listMaterials()) {
  const name = m.getName();
  const cls = name.split(':')[0];
  if (!['paint', 'detail', 'glass', 'lens', 'lamp', 'lampInner', 'siren'].includes(cls)) throw new Error('material without a class: ' + name);
  m.setExtras({ cls });
  counts[cls] = (counts[cls] || 0) + 1;
  if (cls === 'detail' || cls === 'paint') {
    const t = m.getBaseColorTexture();
    if (t) await toKtx(t, 'color', 2048);
    else if (cls === 'detail') m.setBaseColorTexture(await solid(m.getBaseColorFactor())).setBaseColorFactor([1, 1, 1, 1]);
    const n = m.getNormalTexture();
    if (n) await toKtx(n, 'normal', 1024);
    if (cls === 'paint') m.setExtension('KHR_materials_clearcoat', doc.createExtension(KHRMaterialsClearcoat).createClearcoat().setClearcoatFactor(1).setClearcoatRoughnessFactor(0.05));
  }
  if (cls === 'glass' || cls === 'lens') m.setAlphaMode('BLEND').setBaseColorFactor(cls === 'glass' ? [0.02, 0.025, 0.03, 0.35] : [0.9, 0.9, 0.9, 0.12]);
}
// attribute check: every LOD primitive carries _WHEEL and _LAMP
let tris = {};
for (const mesh of root.listMeshes()) {
  let t = 0;
  for (const p of mesh.listPrimitives()) {
    for (const a of ['_WHEEL', '_LAMP']) if (!p.getAttribute(a)) throw new Error(`${mesh.getName()} primitive without ${a}`);
    t += p.getIndices().getCount() / 3;
  }
  tris[mesh.getName()] = t;
}
await doc.transform(prune(), dedup());
await MeshoptEncoder.ready;
await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
io.registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
fs.writeFileSync(outFile, await io.writeBinary(doc));
fs.rmSync(TMP, { recursive: true, force: true });
console.log(`${kind}: ${JSON.stringify(tris)} materials ${JSON.stringify(counts)} -> ${outFile} ${(fs.statSync(outFile).size / 1048576).toFixed(2)} MB`);
