// CP33 BETHESDA: shared helpers for the scan builds (angel.mjs, cherub.mjs). gltf-transform, meshoptimizer and sharp come
// from tools/assets/node_modules (one copy of each on this machine).
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/mehme/projectnyc/tools/assets/package.json');
export const { Document, NodeIO } = require('@gltf-transform/core');
export const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
export const sharp = require('sharp');
export const { MeshoptSimplifier } = require('meshoptimizer');

// every triangle of the scan in its world frame: { pos Float32Array, nrm, uv, idx Uint32Array, image Buffer, mime }
export async function readScan(file) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(file);
  const P = [], N = [], U = [], I = [];
  let base = 0, image = null, mime = null;
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue;
    const m = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const pa = prim.getAttribute('POSITION'), na = prim.getAttribute('NORMAL'), ua = prim.getAttribute('TEXCOORD_0'), ia = prim.getIndices();
      const n = pa.getCount(), v = [0, 0, 0], q = [0, 0, 0], t = [0, 0];
      for (let i = 0; i < n; i++) {
        pa.getElement(i, v);
        P.push(m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]);
        if (na) { na.getElement(i, q); const x = m[0] * q[0] + m[4] * q[1] + m[8] * q[2], y = m[1] * q[0] + m[5] * q[1] + m[9] * q[2], z = m[2] * q[0] + m[6] * q[1] + m[10] * q[2], l = Math.hypot(x, y, z) || 1; N.push(x / l, y / l, z / l); } else N.push(0, 1, 0);
        if (ua) { ua.getElement(i, t); U.push(t[0], t[1]); } else U.push(0, 0);
      }
      if (ia) for (let i = 0; i < ia.getCount(); i++) I.push(base + ia.getScalar(i)); else for (let i = 0; i < n; i++) I.push(base + i);
      base += n;
      const mat = prim.getMaterial(), tex = mat && mat.getBaseColorTexture();
      if (tex && !image) { image = Buffer.from(tex.getImage()); mime = tex.getMimeType(); }
    }
  }
  return { pos: new Float32Array(P), nrm: new Float32Array(N), uv: new Float32Array(U), idx: new Uint32Array(I), image, mime };
}

// the scan's slices: per dy band the vertex count and the x / z extents
export function profile(S, dy = 0.02) {
  let y0 = 1e9, y1 = -1e9;
  for (let i = 1; i < S.pos.length; i += 3) { y0 = Math.min(y0, S.pos[i]); y1 = Math.max(y1, S.pos[i]); }
  const nb = Math.ceil((y1 - y0) / dy) + 1, B = Array.from({ length: nb }, () => ({ n: 0, x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9 }));
  for (let i = 0; i < S.pos.length; i += 3) {
    const b = B[Math.floor((S.pos[i + 1] - y0) / dy)];
    b.n++; b.x0 = Math.min(b.x0, S.pos[i]); b.x1 = Math.max(b.x1, S.pos[i]); b.z0 = Math.min(b.z0, S.pos[i + 2]); b.z1 = Math.max(b.z1, S.pos[i + 2]);
  }
  return { y0, y1, dy, B };
}

// compact arrays to the vertices the index uses
export function compact(S) {
  const map = new Int32Array(S.pos.length / 3).fill(-1);
  const P = [], N = [], U = [], I = new Uint32Array(S.idx.length);
  let k = 0;
  for (let i = 0; i < S.idx.length; i++) {
    const v = S.idx[i];
    if (map[v] < 0) { map[v] = k++; P.push(S.pos[v * 3], S.pos[v * 3 + 1], S.pos[v * 3 + 2]); N.push(S.nrm[v * 3], S.nrm[v * 3 + 1], S.nrm[v * 3 + 2]); U.push(S.uv[v * 2], S.uv[v * 2 + 1]); }
    I[i] = map[v];
  }
  return { ...S, pos: new Float32Array(P), nrm: new Float32Array(N), uv: new Float32Array(U), idx: I };
}
// simplify to a target triangle count (meshoptimizer; UV seams are borders it keeps), compacted
export async function simplifyTo(S, target, err = 0.02) {
  await MeshoptSimplifier.ready;
  // CP33: the UVs are an attribute (their seams are not locked borders), so a scan with hundreds of texture islands still reaches the target
  const r = S.uv ? MeshoptSimplifier.simplifyWithAttributes(S.idx, S.pos, 3, S.uv, 2, [0.5, 0.5], null, Math.min(S.idx.length, Math.round(target) * 3), err, []) : MeshoptSimplifier.simplify(S.idx, S.pos, 3, Math.min(S.idx.length, Math.round(target) * 3), err, []);
  const idx = Array.isArray(r) ? r[0] : r;
  return compact({ ...S, idx: new Uint32Array(idx) });
}
// welded position ids (photogrammetry exports split vertices at UV seams)
function welded(S, eps) {
  const nv = S.pos.length / 3, key = new Map(), rep = new Int32Array(nv);
  for (let i = 0; i < nv; i++) {
    const k = `${Math.round(S.pos[i * 3] / eps)},${Math.round(S.pos[i * 3 + 1] / eps)},${Math.round(S.pos[i * 3 + 2] / eps)}`;
    let r = key.get(k); if (r === undefined) { r = i; key.set(k, i); } rep[i] = r;
  }
  return rep;
}
// smooth vertex normals from the faces (area weighted) over welded positions, so UV seams do not crease
export function smoothNormals(S, eps = 1e-5) {
  const nv = S.pos.length / 3, rep = welded(S, eps), acc = new Float64Array(nv * 3);
  for (let t = 0; t < S.idx.length; t += 3) {
    const a = S.idx[t], b = S.idx[t + 1], c = S.idx[t + 2];
    const ax = S.pos[a * 3], ay = S.pos[a * 3 + 1], az = S.pos[a * 3 + 2];
    const ux = S.pos[b * 3] - ax, uy = S.pos[b * 3 + 1] - ay, uz = S.pos[b * 3 + 2] - az, vx = S.pos[c * 3] - ax, vy = S.pos[c * 3 + 1] - ay, vz = S.pos[c * 3 + 2] - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const v of [a, b, c]) { const r = rep[v]; acc[r * 3] += nx; acc[r * 3 + 1] += ny; acc[r * 3 + 2] += nz; }
  }
  const nrm = new Float32Array(nv * 3);
  for (let i = 0; i < nv; i++) { const r = rep[i], x = acc[r * 3], y = acc[r * 3 + 1], z = acc[r * 3 + 2], l = Math.hypot(x, y, z) || 1; nrm[i * 3] = x / l; nrm[i * 3 + 1] = y / l; nrm[i * 3 + 2] = z / l; }
  return { ...S, nrm };
}
// keep the triangles whose three vertices pass keep(x, y, z)
export function cutTris(S, keep) {
  const I = [];
  for (let t = 0; t < S.idx.length; t += 3) {
    let ok = true;
    for (let j = 0; j < 3 && ok; j++) { const v = S.idx[t + j]; ok = keep(S.pos[v * 3], S.pos[v * 3 + 1], S.pos[v * 3 + 2]); }
    if (ok) I.push(S.idx[t], S.idx[t + 1], S.idx[t + 2]);
  }
  return compact({ ...S, idx: new Uint32Array(I) });
}
// keep the connected components (over welded positions) with at least minTris triangles
export function keepBig(S, minTris, eps = 1e-5) {
  const nv = S.pos.length / 3, rep = welded(S, eps), par = new Int32Array(nv).map((_, i) => i);
  const f = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  const un = (a, b) => { a = f(a); b = f(b); if (a !== b) par[b] = a; };
  for (let t = 0; t < S.idx.length; t += 3) { un(rep[S.idx[t]], rep[S.idx[t + 1]]); un(rep[S.idx[t]], rep[S.idx[t + 2]]); }
  const cnt = new Map();
  for (let t = 0; t < S.idx.length; t += 3) { const r = f(rep[S.idx[t]]); cnt.set(r, (cnt.get(r) || 0) + 1); }
  const I = [];
  for (let t = 0; t < S.idx.length; t += 3) if (cnt.get(f(rep[S.idx[t]])) >= minTris) I.push(S.idx[t], S.idx[t + 1], S.idx[t + 2]);
  return { S: compact({ ...S, idx: new Uint32Array(I) }), comps: [...cnt.values()].sort((a, b) => b - a).slice(0, 8) };
}
// transform positions and normals by f(x, y, z) -> [x, y, z] (normals recomputed after)
export function mapPos(S, f) {
  const pos = new Float32Array(S.pos.length);
  for (let i = 0; i < S.pos.length; i += 3) { const q = f(S.pos[i], S.pos[i + 1], S.pos[i + 2]); pos[i] = q[0]; pos[i + 1] = q[1]; pos[i + 2] = q[2]; }
  return { ...S, pos };
}
// write LODs (each { name, S }) into one GLB with a shared material holding the texture (JPEG buffer)
export async function writeGLB(file, lods, jpg, matName) {
  const doc = new Document(), buf = doc.createBuffer(), scene = doc.createScene();
  const tex = jpg ? doc.createTexture('cav').setImage(jpg).setMimeType('image/jpeg') : null;
  const mat = doc.createMaterial(matName).setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.6).setMetallicFactor(0);
  if (tex) mat.setBaseColorTexture(tex);
  for (const { name, S } of lods) {
    const prim = doc.createPrimitive()
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(S.pos).setBuffer(buf))
      .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(S.nrm).setBuffer(buf))
      .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(S.uv).setBuffer(buf))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(S.idx).setBuffer(buf))
      .setMaterial(mat);
    scene.addChild(doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim)));
  }
  await new NodeIO().write(file, doc);
}
