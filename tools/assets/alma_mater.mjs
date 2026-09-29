// Alma Mater (Daniel Chester French, 1903) from the photogrammetry scan by M. K. Turkcan (CC BY 4.0,
// https://doi.org/10.5281/zenodo.10312053, also Sketchfab mkturkcan): the scan's node transforms baked, the model moved
// into the frame campus.js places it in (+Z her front, +X her left, y = 0 where the stepped granite base meets the
// landing, the base centred on x = z = 0), levelled (LEVEL below), the Low steps and ground the capture took in cut
// away, the bronze (above the marble cap) and the stone given their own materials, the mesh simplified.
//   --level: tread heights round and inside the base once levelled (sets YL); --measure: the base block's extent
//   node tools/assets/alma_mater.mjs <scan.glb> [out.glb] [--measure]
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, dedup, prune } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';

const [src, outArg] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const MEASURE = process.argv.includes('--measure');
const out = outArg || 'boundlessjs/public/models/landmarks/alma_mater.glb';
// the scan's frame -> hers: the stepped base is square to axes turned -15 deg about y; its centre and underside
const A = (-15 * Math.PI) / 180, cA = Math.cos(A), sA = Math.sin(A), UC = -0.745, VC = 0.695, YB = -1.52;
// what is kept: the base's footprint (measured, --measure) and nothing under it
const BOX = { x0: -1.05, x1: 1.05, z0: -1.20, z1: 1.20, y0: 0.0 };   // levelled, the base meets the landing at YL: cut there, so it stands on the campus landing
const BRONZE_Y = 1.47;   // the marble cap's top: above it, bronze (1.50 over the old reference, less YL)

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(src);
const mul = (m, v) => [m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]];
const rot = (m, v) => [m[0] * v[0] + m[4] * v[1] + m[8] * v[2], m[1] * v[0] + m[5] * v[1] + m[9] * v[2], m[2] * v[0] + m[6] * v[1] + m[10] * v[2]];
// LEVEL (2026-09-29, the owner: "slightly tilted towards back"): the capture's +Y is 5.6 deg off the vertical, her top
// leaning back, and 0.9 deg to her left. tools/assets/alma_tilt.mjs measures the true up from the stone base's treads
// (level) and risers (plumb), each iterated in its own levelled frame: (0.0163, 0.9951, -0.0975) and (0.0151, 0.9950,
// -0.0987). Their mean is rotated onto +Y about her base's centre. The tilt was also the capture's "uneven underside": a
// 5.6 deg lean over the base's 2.4 m depth is 0.24 m between its front and back edges.
const UP = (() => { const u = [0.0157, 0.99505, -0.0981], l = Math.hypot(...u); return u.map((x) => x / l); })();
const LV = (() => {   // the rotation taking UP to +Y (Rodrigues), as rows
  const k = [UP[2], 0, -UP[0]], kl = Math.hypot(...k), c = UP[1], s = kl;
  if (kl < 1e-9) return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const x = k[0] / kl, y = k[1] / kl, z = k[2] / kl, t = 1 - c;
  return [[t * x * x + c, t * x * y - s * z, t * x * z + s * y], [t * x * y + s * z, t * y * y + c, t * y * z - s * x], [t * x * z - s * y, t * y * z + s * x, t * z * z + c]];
})();
const lv = (v) => [LV[0][0] * v[0] + LV[0][1] * v[1] + LV[0][2] * v[2], LV[1][0] * v[0] + LV[1][1] * v[1] + LV[1][2] * v[2], LV[2][0] * v[0] + LV[2][1] * v[1] + LV[2][2] * v[2]];
// her frame, levelled, then lifted so the landing the base stands on is y = 0 (YL, measured with --level)
const YL = 0.03;   // --level: the landing's treads round the base peak at y 0.00-0.04 once levelled
const toHer = (w) => { const q = lv([cA * w[0] + sA * w[2] - UC, w[1] - YB, -sA * w[0] + cA * w[2] - VC]); q[1] -= YL; return q; };
const toHerN = (w) => { const n = lv([cA * w[0] + sA * w[2], w[1], -sA * w[0] + cA * w[2]]); const l = Math.hypot(...n) || 1; return n.map((x) => x / l); };
const LEVEL = process.argv.includes('--level');

// gather: per source texture, the triangles (positions, normals, uvs) in her frame
const groups = new Map();   // texture -> { stone: [], bronze: [] } of [p0,n0,t0,p1,n1,t1,p2,n2,t2]
const ext = { x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9 };
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh(); if (!mesh) continue;
  const M = node.getWorldMatrix();
  for (const prim of mesh.listPrimitives()) {
    const P = prim.getAttribute('POSITION'), N = prim.getAttribute('NORMAL'), T = prim.getAttribute('TEXCOORD_0'), I = prim.getIndices();
    const tex = prim.getMaterial()?.getBaseColorTexture() || null;
    if (!groups.has(tex)) groups.set(tex, { stone: [], bronze: [] });
    const g = groups.get(tex);
    const v = [0, 0, 0], n = [0, 0, 0], t = [0, 0];
    const vert = (i) => { P.getElement(i, v); N.getElement(i, n); T.getElement(i, t); return [toHer(mul(M, v)), toHerN(rot(M, n)), [t[0], t[1]]]; };
    const cnt = I ? I.getCount() : P.getCount();
    for (let k = 0; k < cnt; k += 3) {
      const a = vert(I ? I.getScalar(k) : k), b = vert(I ? I.getScalar(k + 1) : k + 1), c = vert(I ? I.getScalar(k + 2) : k + 2);
      const inside = (q) => q[0][0] >= BOX.x0 && q[0][0] <= BOX.x1 && q[0][2] >= BOX.z0 && q[0][2] <= BOX.z1 && q[0][1] >= BOX.y0;
      if (MEASURE) for (const q of [a, b, c]) if (q[0][1] > 0.1 && q[0][1] < 0.6 && Math.abs(q[0][0]) < 1.6 && Math.abs(q[0][2]) < 1.6) {
        ext.x0 = Math.min(ext.x0, q[0][0]); ext.x1 = Math.max(ext.x1, q[0][0]); ext.z0 = Math.min(ext.z0, q[0][2]); ext.z1 = Math.max(ext.z1, q[0][2]);
      }
      if (!(inside(a) && inside(b) && inside(c))) continue;
      const cy = (a[0][1] + b[0][1] + c[0][1]) / 3;
      g[cy > BRONZE_Y ? 'bronze' : 'stone'].push(a, b, c);
    }
  }
}
if (MEASURE) { console.log('base block (y 0.1-0.6) extent in her frame:', JSON.stringify(ext, (k, x) => (typeof x === 'number' ? +x.toFixed(3) : x))); }
if (LEVEL) {
  const H = { inside: new Map(), ring: new Map() };
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue;
    const M = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const P = prim.getAttribute('POSITION'), I = prim.getIndices(), v = [0, 0, 0];
      const get = (i) => { P.getElement(i, v); return toHer(mul(M, v)); };
      const cnt = I ? I.getCount() : P.getCount();
      for (let k = 0; k < cnt; k += 3) {
        const a = get(I ? I.getScalar(k) : k), b = get(I ? I.getScalar(k + 1) : k + 1), c = get(I ? I.getScalar(k + 2) : k + 2);
        const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], l = Math.hypot(...n);
        if (l < 1e-12 || n[1] / l < Math.cos((8 * Math.PI) / 180)) continue;
        const cx = (a[0] + b[0] + c[0]) / 3, cy = (a[1] + b[1] + c[1]) / 3, cz = (a[2] + b[2] + c[2]) / 3;
        if (cy > 2.2 || cy < -1.0) continue;
        const r = Math.max(Math.abs(cx) - 1.05, Math.abs(cz) - 1.2), key = Math.round(cy * 50) / 50;   // 2 cm bins
        const T = r <= 0 ? H.inside : r < 0.8 ? H.ring : null; if (!T) continue;
        T.set(key, (T.get(key) || 0) + l / 2);
      }
    }
  }
  for (const [name, T] of Object.entries(H)) {
    console.log(`tread area by height (levelled, before YL), ${name}:`);
    for (const [y, ar] of [...T.entries()].sort((p, q) => p[0] - q[0])) if (ar > 0.01) console.log(`  y ${y.toFixed(2)}  ${ar.toFixed(3)} m2`);
  }
  process.exit(0);
}

// the output document
const outDoc = new Document();
const buffer = outDoc.createBuffer();
const scene = outDoc.createScene('Scene');
const root = outDoc.createNode('almaMater');
scene.addChild(root);
const meshOut = outDoc.createMesh('almaMater');
root.setMesh(meshOut);
const texOut = new Map();
let tris = 0;
for (const [tex, g] of groups) {
  let t2 = null;
  if (tex) {
    if (!texOut.has(tex)) texOut.set(tex, outDoc.createTexture(tex.getName() || 'scan').setImage(tex.getImage()).setMimeType(tex.getMimeType()));
    t2 = texOut.get(tex);
  }
  for (const part of ['stone', 'bronze']) {
    const L = g[part]; if (!L.length) continue;
    const pos = new Float32Array(L.length * 3), nor = new Float32Array(L.length * 3), uv = new Float32Array(L.length * 2);
    L.forEach((q, i) => { pos.set(q[0], 3 * i); nor.set(q[1], 3 * i); uv.set(q[2], 2 * i); });
    const mat = outDoc.createMaterial(part)
      .setBaseColorFactor([1, 1, 1, 1])
      .setMetallicFactor(part === 'bronze' ? 0.35 : 0.0)
      .setRoughnessFactor(part === 'bronze' ? 0.52 : 0.86)
      .setDoubleSided(false);
    if (t2) mat.setBaseColorTexture(t2);
    const prim = outDoc.createPrimitive()
      .setAttribute('POSITION', outDoc.createAccessor().setType('VEC3').setArray(pos).setBuffer(buffer))
      .setAttribute('NORMAL', outDoc.createAccessor().setType('VEC3').setArray(nor).setBuffer(buffer))
      .setAttribute('TEXCOORD_0', outDoc.createAccessor().setType('VEC2').setArray(uv).setBuffer(buffer))
      .setMaterial(mat);
    meshOut.addPrimitive(prim);
    tris += L.length / 3;
  }
}
console.log('kept triangles', tris);
await MeshoptSimplifier.ready;
await outDoc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: 0.55, error: 0.0008 }), dedup(), prune());
let after = 0; for (const p of meshOut.listPrimitives()) after += p.getIndices() ? p.getIndices().getCount() / 3 : p.getAttribute('POSITION').getCount() / 3;
console.log('after simplify', after);
await io.write(out, outDoc);
console.log('wrote', out);
