// VH36 (AR34 vehicle models, 2026-10-02): a fleet GLB lengthened at two cuts across its length, every LOD alike (the
// sim's 26 ft box truck from the CARLA 0.10 box truck: the owner's "too low poly" box truck in teaser 7 was the NV34
// procedural boxtruck26). Vertices behind cut 1 (between the cab and the rear axle) move back by d1, which lengthens the
// wheelbase; vertices behind cut 2 (behind the rear wheels) move back by d2 more, which lengthens the rear overhang.
// Faces across a cut (box panels, frame and guard rails) stretch; everything else keeps its shape. Positions are
// dequantised and the LOD node transforms baked, then meshopt re-encodes as tools/assets/build_vehicle.mjs does.
//   node tools/assets/vh36/stretch_truck.mjs <in.glb> <out.glb> <kind> <cut1> <d1> <cut2> <d2> [source note]
// (cuts in the model frame: +Z forward, metres; e.g. boxtruck -> boxtruck26: -1.0 1.105 -3.375 1.10)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const req = createRequire(path.resolve(HERE, '../package.json'));
const load = async (n) => import(pathToFileURL(req.resolve(n)).href);
const { NodeIO } = await load('@gltf-transform/core');
const { ALL_EXTENSIONS } = await load('@gltf-transform/extensions');
const { dequantize, meshopt, prune } = await load('@gltf-transform/functions');
const { MeshoptDecoder, MeshoptEncoder } = await load('meshoptimizer');
await MeshoptDecoder.ready; await MeshoptEncoder.ready;

const [inGlb, outGlb, kind, c1s, d1s, c2s, d2s, note] = process.argv.slice(2);
const cut1 = +c1s, d1 = +d1s, cut2 = +c2s, d2 = +d2s;
if (!(cut1 > cut2) || !(d1 >= 0) || !(d2 >= 0)) throw new Error('need cut1 > cut2 and d1, d2 >= 0');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(inGlb);
const root = doc.getRoot();
await doc.transform(dequantize());
const veh = root.listNodes().find((n) => n.getExtras()?.hubs);
if (!veh) throw new Error('no vehicle node (extras.hubs)');
const shift = (z) => (z < cut2 ? d1 + d2 : z < cut1 ? d1 : 0);
const done = new Set();
let moved = 0, total = 0;
for (const lod of veh.listChildren()) {
  const M = lod.getMatrix();   // column-major 4x4 (the dequantisation transform of build_vehicle.mjs)
  const walk = (n) => {
    const me = n.getMesh();
    if (me) for (const p of me.listPrimitives()) {
      const pos = p.getAttribute('POSITION');
      if (done.has(pos)) continue;   // an accessor shared by two primitives is moved once
      done.add(pos);
      const a = pos.getArray(), out = new Float32Array(a.length);
      for (let i = 0; i < a.length; i += 3) {
        const x = a[i], y = a[i + 1], z = a[i + 2];
        const wx = M[0] * x + M[4] * y + M[8] * z + M[12], wy = M[1] * x + M[5] * y + M[9] * z + M[13], wz = M[2] * x + M[6] * y + M[10] * z + M[14];
        const s = shift(wz);
        if (s) moved++;
        total++;
        out[i] = wx; out[i + 1] = wy; out[i + 2] = wz - s;
      }
      pos.setArray(out);
      const nrm = p.getAttribute('NORMAL');
      if (nrm && !done.has(nrm)) {   // a uniform-scale + translate transform: normals keep their direction
        done.add(nrm);
        const b = nrm.getArray(), o2 = new Float32Array(b.length);
        for (let i = 0; i < b.length; i += 3) { const l = Math.hypot(b[i], b[i + 1], b[i + 2]) || 1; o2[i] = b[i] / l; o2[i + 1] = b[i + 1] / l; o2[i + 2] = b[i + 2] / l; }
        nrm.setArray(o2).setNormalized(false);
      }
    }
    n.listChildren().forEach(walk);
  };
  walk(lod);
  lod.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
}
const ex = { ...veh.getExtras() };
const L0 = ex.size[2];
ex.size = [ex.size[0], ex.size[1], +(L0 + d1 + d2).toFixed(3)];
ex.hubs = ex.hubs.map((h) => ({ ...h, p: [h.p[0], h.p[1], +(h.p[2] - shift(h.p[2])).toFixed(4)] }));
const fz = Math.max(...ex.hubs.map((h) => h.p[2])), rz = Math.min(...ex.hubs.map((h) => h.p[2]));
ex.wheelbase = +(fz - rz).toFixed(3);
// the origin stays at the ground centre: centre the lengthened body on z = 0 (everything moves forward by half the gain)
const dz = (d1 + d2) / 2;
for (const lod of veh.listChildren()) lod.setTranslation([0, 0, dz]);
ex.hubs = ex.hubs.map((h) => ({ ...h, p: [h.p[0], h.p[1], +(h.p[2] + dz).toFixed(4)] }));
ex.kind = kind;
ex.stretch = { from: ex.bp || null, cut1, d1, cut2, d2, length0: L0 };
ex.source = `${ex.source || 'CARLA 0.10.0 (CC-BY 4.0)'}${note ? '; ' + note : ''}`;
ex.built = new Date().toISOString();
veh.setExtras(ex).setName(kind);
await doc.transform(prune());
await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
fs.writeFileSync(outGlb, await io.writeBinary(doc));
console.log(`[stretch] ${path.basename(outGlb)} ${(fs.statSync(outGlb).size / 1048576).toFixed(2)} MB; ${moved}/${total} vertices moved; size ${ex.size.join(' x ')}; wheelbase ${ex.wheelbase}; hubs ${ex.hubs.map((h) => h.id + ':' + h.p[2]).join(' ')}`);
