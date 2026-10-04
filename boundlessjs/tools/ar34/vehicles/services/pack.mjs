// Blender GLB -> the fleet's runtime GLB (sim/fleet24.js contract, the same as tools/assets/build_vehicle.mjs writes):
// KTX2 textures (Basis UASTC, 2K maximum), meshopt geometry, and the vehicle node's build metadata (size, hubs,
// wheelbase) that fleet24.js reads from the node carrying `hubs`.
//   node boundlessjs/tools/ar34/vehicles/services/pack.mjs <kind> <raw.glb> [--out <dir>]
// The raw GLB comes from build_<kind>.py (Blender 4.5); <raw.glb>.json beside it carries the hubs and the source note.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../../..');
// the asset toolchain's packages live in tools/assets/node_modules
const rq = createRequire(path.join(ROOT, 'tools/assets/package.json'));
const imp = (p) => import(pathToFileURL(rq.resolve(p)).href);
const { NodeIO } = await imp('@gltf-transform/core');
const { ALL_EXTENSIONS, KHRTextureBasisu } = await imp('@gltf-transform/extensions');
const { prune, dedup, meshopt } = await imp('@gltf-transform/functions');
const { MeshoptEncoder } = await imp('meshoptimizer');
const { makeTexture } = await import(pathToFileURL(path.join(ROOT, 'tools/assets/lib/tex.mjs')).href);

const args = process.argv.slice(2);
const kind = args[0], raw = args[1];
const oi = args.indexOf('--out');
const OUT = oi >= 0 ? args[oi + 1] : path.join(ROOT, 'boundlessjs/public/models/fleet24');
const HERE = path.dirname(new URL(import.meta.url).pathname);
const meta = JSON.parse(fs.readFileSync(raw + '.json', 'utf8'));

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(raw);
const root = doc.getRoot();
const veh = root.listNodes().find((n) => n.getName() === kind);
if (!veh) throw new Error('no node named ' + kind);

// envelope of LOD0 (world space; Blender writes identity node transforms, but apply them anyway)
const lod0 = veh.listChildren().find((n) => n.getName() === 'LOD0');
const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
lod0.traverse((n) => {
  const m = n.getMesh();
  if (!m) return;
  const M = n.getWorldMatrix();
  for (const p of m.listPrimitives()) {
    const P = p.getAttribute('POSITION');
    const v = [0, 0, 0];
    for (let i = 0; i < P.getCount(); i++) {
      P.getElement(i, v);
      const w = [0, 1, 2].map((r) => M[r] * v[0] + M[4 + r] * v[1] + M[8 + r] * v[2] + M[12 + r]);
      for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], w[k]); mx[k] = Math.max(mx[k], w[k]); }
    }
  }
});
const size = [mx[0] - mn[0], mx[1], mx[2] - mn[2]].map((v) => +v.toFixed(3));
const hubs = meta.hubs;
const wheelbase = +Math.abs(hubs[0].p[2] - hubs[2].p[2]).toFixed(3);
veh.setExtras({ kind, size, hubs, wheelbase, lights: [], source: meta.source, built: new Date().toISOString(), ...(meta.extra || {}) });
console.log(`${kind}: envelope ${size.join(' x ')} m (y from ${mn[1].toFixed(3)}), x ${mn[0].toFixed(3)}..${mx[0].toFixed(3)}, z ${mn[2].toFixed(3)}..${mx[2].toFixed(3)}, wheelbase ${wheelbase}`);

// textures: the PNG each image was made from (tex/<name>.png) -> KTX2
doc.createExtension(KHRTextureBasisu).setRequired(true);
for (const t of root.listTextures()) {
  const name = (t.getName() || t.getURI() || '').replace(/\.png$/i, '');
  const src = path.join(HERE, 'tex', name + '.png');
  if (!fs.existsSync(src)) throw new Error('texture source missing: ' + src);
  const size = /livery/.test(name) ? 2048 : /detail/.test(name) ? 1024 : 256;
  const r = await makeTexture(src, { kind: 'color', size, mode: 'uastc' });
  t.setImage(r.bytes).setMimeType('image/ktx2').setURI(`${name}.ktx2`);
  console.log(`  texture ${name}: ${(r.bytes.length / 1024).toFixed(0)} KB ktx2`);
}

// triangles per LOD and part
for (const n of veh.listChildren()) {
  let t = 0;
  const parts = [];
  n.traverse((c) => { const m = c.getMesh(); if (m) for (const p of m.listPrimitives()) { const k = p.getIndices().getCount() / 3; t += k; parts.push(`${p.getMaterial().getExtras().cls}:${p.getMaterial().getName()}=${k}`); } });
  console.log(`  ${n.getName()}: ${t} tris (${parts.length} parts) ${parts.join(' ')}`);
}

await doc.transform(prune(), dedup());
await MeshoptEncoder.ready;
await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
io.registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
fs.mkdirSync(OUT, { recursive: true });
const outFile = path.join(OUT, kind + '.glb');
fs.writeFileSync(outFile, await io.writeBinary(doc));
console.log(`-> ${path.relative(ROOT, outFile)} ${(fs.statSync(outFile).size / 1048576).toFixed(2)} MB`);
