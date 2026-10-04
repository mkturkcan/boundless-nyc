// CP33 BETHESDA: the four cherubs round the stem of the Bethesda Fountain from a photogrammetry scan of a bronze putto.
// Source: "Putto auf Fisch" by noe-3d.at (Sketchfab, a bronze fountain figure in Vienna with its verdigris; CC0), via the
// Objaverse 1.0 index (tools/refs/objaverse_search.mjs get 8ba656b736a54a24904d163c7097c3c9).
// The scan loses its round base (the bottom 8.5 cm), is moved to the origin (y 0 = the underside of the fish, x = z = 0 under
// the putto's centre), turned so that the fish's head points along +z (the cherub "faces out" when it is rotated to face
// outward), scaled to ~1.1 m (the Bethesda cherubs are 4 ft) and simplified to three LODs, each in two hands (B is the mirror
// image, so the four cherubs on the rock are not four copies). The photo texture is sampled at every vertex into a grey
// level (COLOR_0), which the patina shader in city/cpBethesdaKit.js reads as the bronze's cavity map; the vertices are welded
// across the texture seams first (a scan with hundreds of UV islands cannot be decimated otherwise: the seams lock it at 25k).
//   node cherub.mjs <scan.glb> [out.glb]
import fs from 'node:fs';
import { readScan, cutTris, keepBig, mapPos, MeshoptSimplifier, smoothNormals, Document, NodeIO, sharp } from './scanlib.mjs';

const [src, outArg] = process.argv.slice(2);
const out = outArg || 'C:/Users/mehme/projectnyc/boundlessjs/public/models/cp33/bethesda/cherub.glb';
const S0 = await readScan(src);
let y0 = 1e9, y1 = -1e9;
for (let i = 1; i < S0.pos.length; i += 3) { y0 = Math.min(y0, S0.pos[i]); y1 = Math.max(y1, S0.pos[i]); }
const CUT = y0 + 0.085;
console.log('scan', S0.pos.length / 3, 'verts', S0.idx.length / 3, 'tris; y', y0.toFixed(3), y1.toFixed(3));
let S = cutTris(S0, (x, y) => y > CUT);
const kb = keepBig(S, 1500); S = kb.S;
console.log('after cut', S.idx.length / 3, 'tris; components', kb.comps.join(' '));

// the photo texture as a grey raster, sampled at each vertex's UV (bilinear)
const tex = await sharp(S0.image).removeAlpha().greyscale().raw().toBuffer({ resolveWithObject: true });
const TW = tex.info.width, TH = tex.info.height, TD = tex.data;
const sample = (u, v) => {
  const x = Math.min(TW - 1.001, Math.max(0, u * (TW - 1))), y = Math.min(TH - 1.001, Math.max(0, v * (TH - 1))), xi = x | 0, yi = y | 0, fx = x - xi, fy = y - yi;
  const a = TD[yi * TW + xi], b = TD[yi * TW + xi + 1], c = TD[(yi + 1) * TW + xi], d = TD[(yi + 1) * TW + xi + 1];
  return (a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy) / 255;
};
const grey0 = new Float32Array(S.pos.length / 3);
for (let i = 0; i < grey0.length; i++) grey0[i] = sample(S.uv[i * 2], S.uv[i * 2 + 1]);

// weld by position (the grey levels averaged over the seam's wedges)
function weld(S, grey, eps = 2e-5) {
  const nv = S.pos.length / 3, key = new Map(), rep = new Int32Array(nv), sum = [], cnt = [], P = [];
  for (let i = 0; i < nv; i++) {
    const k = `${Math.round(S.pos[i * 3] / eps)},${Math.round(S.pos[i * 3 + 1] / eps)},${Math.round(S.pos[i * 3 + 2] / eps)}`;
    let r = key.get(k);
    if (r === undefined) { r = P.length / 3; key.set(k, r); P.push(S.pos[i * 3], S.pos[i * 3 + 1], S.pos[i * 3 + 2]); sum.push(0); cnt.push(0); }
    rep[i] = r; sum[r] += grey[i]; cnt[r]++;
  }
  const idx = new Uint32Array(S.idx.length);
  for (let i = 0; i < idx.length; i++) idx[i] = rep[S.idx[i]];
  const g = new Float32Array(cnt.length); for (let i = 0; i < g.length; i++) g[i] = sum[i] / cnt[i];
  return { pos: new Float32Array(P), idx, grey: g };
}
// only the vertices the index uses
function compact(T) {
  const map = new Int32Array(T.pos.length / 3).fill(-1), P = [], G = [], I = new Uint32Array(T.idx.length);
  let k = 0;
  for (let i = 0; i < T.idx.length; i++) { const v = T.idx[i]; if (map[v] < 0) { map[v] = k++; P.push(T.pos[v * 3], T.pos[v * 3 + 1], T.pos[v * 3 + 2]); G.push(T.grey[v]); } I[i] = map[v]; }
  return { pos: new Float32Array(P), idx: I, grey: new Float32Array(G) };
}
await MeshoptSimplifier.ready;
const W0 = weld(S, grey0);
console.log('welded', W0.pos.length / 3, 'verts');
const simp = (T, target, err) => {
  const r = MeshoptSimplifier.simplify(T.idx, T.pos, 3, Math.min(T.idx.length, Math.round(target) * 3), err, []);
  return compact({ ...T, idx: new Uint32Array(Array.isArray(r) ? r[0] : r) });
};
const withNormals = (T) => { const R = smoothNormals({ pos: T.pos, idx: T.idx, uv: new Float32Array(T.pos.length / 3 * 2), nrm: new Float32Array(T.pos.length) }); return { ...T, nrm: R.nrm }; };

// the fish's head direction: the long axis of the lowest 25 cm of the figure; the head is the blunter end (the shorter reach)
let cx = 0, cz = 0, n = 0;
for (let i = 0; i < W0.pos.length; i += 3) { if (W0.pos[i + 1] < CUT + 0.1) { cx += W0.pos[i]; cz += W0.pos[i + 2]; n++; } }
cx /= n; cz /= n;
let sxx = 0, szz = 0, sxz = 0;
for (let i = 0; i < W0.pos.length; i += 3) { if (W0.pos[i + 1] < CUT + 0.3) { const dx = W0.pos[i] - cx, dz = W0.pos[i + 2] - cz; sxx += dx * dx; szz += dz * dz; sxz += dx * dz; } }
const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz);
let ax = Math.cos(ang), az = Math.sin(ang), reachP = 0, reachN = 0;
for (let i = 0; i < W0.pos.length; i += 3) { if (W0.pos[i + 1] < CUT + 0.3) { const d = (W0.pos[i] - cx) * ax + (W0.pos[i + 2] - cz) * az; if (d > 0) reachP = Math.max(reachP, d); else reachN = Math.max(reachN, -d); } }
if (reachP > reachN) { ax = -ax; az = -az; }          // the tail fin reaches further: the head is the other way
console.log('fish axis reach', reachP.toFixed(3), reachN.toFixed(3), 'head along', ax.toFixed(3), az.toFixed(3));
const th = Math.atan2(ax, az), c = Math.cos(th), s = Math.sin(th);
const SC = Number(process.env.CHERUB_H || 1.12) / (y1 - CUT);
const fit = (T, mir) => {
  const pos = new Float32Array(T.pos.length);
  for (let i = 0; i < T.pos.length; i += 3) {
    const dx = T.pos[i] - cx, dz = T.pos[i + 2] - cz, rx = dx * c - dz * s, rz = dx * s + dz * c;
    pos[i] = (mir ? -rx : rx) * SC; pos[i + 1] = (T.pos[i + 1] - CUT) * SC; pos[i + 2] = rz * SC;
  }
  const idx = new Uint32Array(T.idx);
  if (mir) for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  return { pos, idx, grey: T.grey };
};
const lods = [];
for (const [k, mir] of [['A', false], ['B', true]]) {
  const T = fit(W0, mir);
  const L0 = withNormals(simp(T, 70000, 0.004)), L1 = withNormals(simp(T, 12000, 0.03)), L2 = withNormals(simp(T, 2500, 0.1));
  for (const [i, L] of [L0, L1, L2].entries()) {
    let ymax = -1e9, x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let j = 0; j < L.pos.length; j += 3) { ymax = Math.max(ymax, L.pos[j + 1]); x0 = Math.min(x0, L.pos[j]); x1 = Math.max(x1, L.pos[j]); z0 = Math.min(z0, L.pos[j + 2]); z1 = Math.max(z1, L.pos[j + 2]); }
    console.log(k + i, L.idx.length / 3, 'tris', L.pos.length / 3, 'verts', 'top', ymax.toFixed(3), 'x', x0.toFixed(2), x1.toFixed(2), 'z', z0.toFixed(2), z1.toFixed(2));
    lods.push({ name: k + i, L });
  }
}
// the GLB: POSITION, NORMAL, COLOR_0 (the grey as an RGB triple), one grey material
const doc = new Document(), buf = doc.createBuffer(), scene = doc.createScene();
const mat = doc.createMaterial('cherubBronze').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.6).setMetallicFactor(0);
for (const { name, L } of lods) {
  const col = new Float32Array(L.grey.length * 3);
  for (let i = 0; i < L.grey.length; i++) col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = L.grey[i];
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(L.pos).setBuffer(buf))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(L.nrm).setBuffer(buf))
    .setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(col).setBuffer(buf))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(L.idx).setBuffer(buf))
    .setMaterial(mat);
  scene.addChild(doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim)));
}
await new NodeIO().write(out, doc);
console.log('wrote', out, (fs.statSync(out).size / 1048576).toFixed(1), 'MB');
