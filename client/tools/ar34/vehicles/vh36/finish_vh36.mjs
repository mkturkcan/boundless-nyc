// VH36: a Blender export -> the fleet GLB format (sim/fleet24.js): the root node's extras from the build's meta JSON
// (kind, size, hubs, wheelbase, source), its embedded PNG textures as KTX2 (UASTC; *_mr and *_n as linear data), meshopt.
// The packages resolve from tools/assets (its node_modules).
//   node client/tools/ar34/vehicles/vh36/finish_vh36.mjs <raw.glb> <meta.json> <out.glb>
import fs from 'node:fs';
import os from 'node:os';
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
const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'vh36tex-'));
doc.createExtension(KHRTextureBasisu).setRequired(true);
for (const t of root.listTextures()) {
  const name = (t.getName() || path.basename(t.getURI() || 'tex', path.extname(t.getURI() || ''))).replace(/[^\w-]/g, '_');
  const src = path.join(tmp, name + '.png');
  fs.writeFileSync(src, Buffer.from(t.getImage()));
  const kind = /_(mr|orm|n)$/.test(name) ? 'data' : 'color';
  const sz = t.getSize() ? Math.max(...t.getSize()) : 1024;
  const r = await makeTexture(src, { kind, size: sz, mode: 'uastc', tag: 'vh36' });
  t.setImage(r.bytes).setMimeType('image/ktx2').setURI(`${name}.ktx2`);
}
await doc.transform(prune(), dedup());
await MeshoptEncoder.ready;
await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
io.registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
fs.writeFileSync(outGlb, await io.writeBinary(doc));
fs.rmSync(tmp, { recursive: true, force: true });
const lods = node.listChildren().map((c) => `${c.getName()} ${c.getMesh()?.listPrimitives().reduce((s, p) => s + (p.getIndices()?.getCount() || 0) / 3, 0)}`);
console.log(`[finish] ${path.basename(outGlb)} ${(fs.statSync(outGlb).size / 1048576).toFixed(2)} MB  ${lods.join(' | ')}  mats ${root.listMaterials().map((m) => m.getName() + ':' + m.getExtras()?.cls).join(',')}`);
