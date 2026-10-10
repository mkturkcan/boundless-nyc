// TAXI kinds: Blender export -> the fleet GLB format (sim/fleet24.js): root extras (kind, size, hubs, wheelbase, source),
// KTX2 textures (2K livery, 1K atlases), meshopt geometry. The packages resolve from tools/assets (its node_modules).
//   node client/tools/ar34/vehicles/taxi/finish.mjs <raw.glb> <meta.json> <out.glb>
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../..');
const req = createRequire(path.join(ROOT, 'tools/assets/package.json'));
const load = async (n) => import(pathToFileURL(req.resolve(n)).href);
const { NodeIO } = await load('@gltf-transform/core');
const { ALL_EXTENSIONS, KHRTextureBasisu } = await load('@gltf-transform/extensions');
const { prune, dedup, meshopt } = await load('@gltf-transform/functions');
const { MeshoptEncoder } = await load('meshoptimizer');
const { makeTexture } = await import(pathToFileURL(path.join(ROOT, 'tools/assets/lib/tex.mjs')).href);

const [inGlb, metaFile, outGlb] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inGlb);
const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
const root = doc.getRoot();
const node = root.listNodes().find((n) => n.getName() === meta.kind);
if (!node) throw new Error('no root node ' + meta.kind);
node.setExtras({ ...meta, built: new Date().toISOString() });
for (const m of root.listMaterials()) if (!m.getExtras()?.cls) console.warn('material without cls:', m.getName());
doc.createExtension(KHRTextureBasisu).setRequired(true);
for (const t of root.listTextures()) {
  const name = t.getName() || path.basename(t.getURI() || '', '.png');
  const src = path.join(HERE, 'tex', name + '.png');
  if (!fs.existsSync(src)) { console.warn('texture source missing', name); continue; }
  const kind = /_mr$/.test(name) ? 'data' : 'color';
  const size = /livery/.test(name) ? 2048 : 1024;
  const r = await makeTexture(src, { kind, size, mode: 'uastc' });
  t.setImage(r.bytes).setMimeType('image/ktx2').setURI(`${name}_${size}.ktx2`);
}
await doc.transform(prune(), dedup());
await MeshoptEncoder.ready;
await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
io.registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
fs.writeFileSync(outGlb, await io.writeBinary(doc));
const lods = node.listChildren().map((c) => `${c.getName()} ${c.getMesh()?.listPrimitives().reduce((s, p) => s + (p.getIndices()?.getCount() || 0) / 3, 0)}`);
console.log(`[finish] ${path.relative(ROOT, outGlb)} ${(fs.statSync(outGlb).size / 1048576).toFixed(2)} MB  ${lods.join(' | ')}  mats ${root.listMaterials().map((m) => m.getName() + ':' + m.getExtras()?.cls).join(',')}`);
