// CP33 lakeside: seated photoreal people for the Lake's rowboats, baked from the crowd's own assets (peds24: CARLA 0.10
// bodies, CC BY 4.0). For each person type (a body, an outfit variant, a seated pose) the body's three LOD meshes are
// skinned once into the seated pose with the crowd's own pose pass (crowdSit.js synthSitClips and the walker's solved arms,
// sit31_arms.json) and written as static geometry: client/public/models/cp33/lakeside/people/<type>.bin. The texture
// layer of every vertex is resolved from the variant (slot -> layer), a per-vertex weight says how much of it belongs to
// the upper body (spine up, arms, head: the page leans that part about the hip joint for the rowing stroke), and the file
// carries the hip pivot, the two hands, the seat point and the bounding box.
//   node tools/assets/lakeside_people.mjs --list
//   node tools/assets/lakeside_people.mjs --types rowA=SK_euroM_v2_:30:1,... [--sheet out.png]
// type spec: name=body:variantIndex:pose  (pose ids: 1 sit_a upright, 2 sit_b relaxed, 6 phone)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = path.join(ROOT, 'client/public/models/peds24') + '/';
const OUT = (process.argv.includes('--out') ? path.resolve(process.argv[process.argv.indexOf('--out') + 1]) : path.join(ROOT, 'client/public/models/cp33/lakeside/people')) + '/';
const args = process.argv.slice(2);
const opt = (n, d = null) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const SIT = await import(pathToFileURL(path.join(ROOT, 'client/src/sim/crowdSit.js')).href);
const m = JSON.parse(fs.readFileSync(BASE + 'manifest.json', 'utf8'));
const ci = JSON.parse(fs.readFileSync(BASE + 'clips.json', 'utf8'));
const bake = JSON.parse(fs.readFileSync(BASE + 'sit31_arms.json', 'utf8'));
const SK = m.skeletons.gen2, nb = SK.bones.length, W = nb * 8;
const data0 = new Float32Array(fs.readFileSync(BASE + 'clips_gen2.bin').buffer.slice(0));
const clips = ci.clips.filter((c) => c.skeleton === 'gen2'), hips = SK.bones.findIndex((b) => /hips/i.test(b));
// crowd.js fixLoop: the hips' mean horizontal offset removed from every loop
for (const c of clips) {
  if (!c.loop || !(c.frames > 3)) continue;
  const F = c.frames, r0 = c.row, at = (r, b, t) => r0 * W + r * W + b * 8 + (t ? 4 : 0);
  let mx = 0, my = 0;
  for (let r = 0; r < F; r++) { const o = at(r, hips, 1); mx += data0[o]; my += data0[o + 1]; }
  mx /= F; my /= F;
  for (let r = 0; r < F; r++) { const o = at(r, hips, 1); data0[o] -= mx; data0[o + 1] -= my; }
}
const bodies = Object.entries(m.bodies).filter(([, B]) => B.skeleton === 'gen2').map(([name, B], index) => ({ name, ...B, index }));
for (const B of bodies) B.hipsH = Math.hypot(B.refT[hips * 3], B.refT[hips * 3 + 1], B.refT[hips * 3 + 2]);
const variants = m.variants;
const TARGET_H = { m: 1.77, f: 1.65, child: 1.22 };
const meanScale = (B, V) => { const key = V.age === 'child' ? 'child' : V.gender; return Math.max(0.7, Math.min(1.1, TARGET_H[key] / (B.height * (V.scale || 1)))) * (V.scale || 1); };

if (args.includes('--list')) {
  variants.forEach((v, i) => { if (bodies.find((b) => b.name === v.body)) console.log(i, v.name, v.body, v.gender, v.age, v.uniform || '-', v.build, 'scale', meanScale(bodies.find((b) => b.name === v.body), v).toFixed(3)); });
  process.exit(0);
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
await MeshoptDecoder.ready;
const S = { name: 'gen2', nb, bones: SK.bones, parents: SK.parents, hips, clips, clipData: data0, bodies };
const r = SIT.synthSitClips(S, null, bake, { sit32: true });
S.clipData = r.data; S.clips = [...clips, ...r.clips];
console.log('sit clips', r.clips.map((c) => `${c.sitPose}:${c.name}`).join(' '));
const slotOf = new Int16Array(nb).fill(-1);
SIT.ARM_SLOTS.forEach((n, k) => { const b = SK.bones.indexOf(n); if (b >= 0) slotOf[b] = k; });
const bi = (n) => SK.bones.indexOf(n);

// the pose pass in JS (crowd.js POSE_FS, as crowd_sitqa.mjs poseMats): skinning matrices and the bones' positions
function poseMats(B, D, c, f, k, ovr) {
  const lq = [], lt = [];
  for (let b = 0; b < nb; b++) {
    const o = (c.row + f) * W + b * 8, ok = D[o + 7] > 0.5;
    let q = ok ? [D[o], D[o + 1], D[o + 2], D[o + 3]] : B.refR.slice(b * 4, b * 4 + 4);
    const s = slotOf[b];
    if (ovr && s >= 0 && ovr[s * 4 + 3] < 1.5) q = Array.from(ovr.slice(s * 4, s * 4 + 4));
    lq[b] = q;
    lt[b] = b === hips && ok ? [D[o + 4] * k, D[o + 5] * k, D[o + 6] * k] : B.refT.slice(b * 3, b * 3 + 3);
  }
  const { G, P } = SIT.sitFK({ nb, parents: SK.parents }, lq, lt);
  return { Sm: G.map((g, b) => SIT.SIT_M4.mul(SIT.SIT_M4.of(g, P[b]), B.ibm.slice(b * 16, b * 16 + 16))), P };
}
// one LOD's primitive ('opaque' or 'hair') in model space
function meshOf(doc, lod, prim) {
  const P = [], N = [], J = [], Wt = [], UV = [], SL = [], CL = [], PT = [], I = [];
  for (const n of doc.getRoot().listNodes()) {
    if (n.getName() !== 'LOD' + lod || !n.getMesh()) continue;
    const Mw = n.getWorldMatrix();
    for (const p of n.getMesh().listPrimitives()) {
      if ((p.getMaterial()?.getName() === 'hair' ? 'hair' : 'opaque') !== prim) continue;
      const pa = p.getAttribute('POSITION'), na = p.getAttribute('NORMAL'), ja = p.getAttribute('JOINTS_0'), wa = p.getAttribute('WEIGHTS_0'), ua = p.getAttribute('TEXCOORD_0');
      const sa = p.getAttribute('_SLOT'), ca = p.getAttribute('_CLS'), ta = p.getAttribute('_PART');
      const base = P.length / 3, v = [0, 0, 0], nv = [0, 0, 1], j = [0, 0, 0, 0], w = [0, 0, 0, 0], uv = [0, 0];
      for (let i = 0; i < pa.getCount(); i++) {
        pa.getElement(i, v);
        P.push(Mw[0] * v[0] + Mw[4] * v[1] + Mw[8] * v[2] + Mw[12], Mw[1] * v[0] + Mw[5] * v[1] + Mw[9] * v[2] + Mw[13], Mw[2] * v[0] + Mw[6] * v[1] + Mw[10] * v[2] + Mw[14]);
        if (na) na.getElement(i, nv);
        N.push(Mw[0] * nv[0] + Mw[4] * nv[1] + Mw[8] * nv[2], Mw[1] * nv[0] + Mw[5] * nv[1] + Mw[9] * nv[2], Mw[2] * nv[0] + Mw[6] * nv[1] + Mw[10] * nv[2]);
        ja.getElement(i, j); wa.getElement(i, w); ua.getElement(i, uv);
        J.push(...j); Wt.push(...w); UV.push(uv[0], uv[1]);
        SL.push(sa ? Math.round(sa.getScalar(i)) : 0); CL.push(ca ? Math.round(ca.getScalar(i)) : 1); PT.push(ta ? Math.round(ta.getScalar(i)) : 0);
      }
      const ia = p.getIndices().getArray();
      for (let k = 0; k < ia.length; k += 3) I.push(base + ia[k], base + ia[k + 1], base + ia[k + 2]);
    }
  }
  return { P: new Float32Array(P), N: new Float32Array(N), J: new Int16Array(J), W: new Float32Array(Wt), UV: new Float32Array(UV), SL, CL, PT, I, n: P.length / 3 };
}
function skin(M, Sm, s) {
  const n = M.n, O = new Float32Array(n * 3), NO = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = M.P[i * 3], y = M.P[i * 3 + 1], z = M.P[i * 3 + 2], nx = M.N[i * 3], ny = M.N[i * 3 + 1], nz = M.N[i * 3 + 2];
    let ox = 0, oy = 0, oz = 0, qx = 0, qy = 0, qz = 0;
    for (let k = 0; k < 4; k++) {
      const w = M.W[i * 4 + k]; if (!w) continue;
      const A = Sm[M.J[i * 4 + k]];
      ox += w * (A[0] * x + A[4] * y + A[8] * z + A[12]); oy += w * (A[1] * x + A[5] * y + A[9] * z + A[13]); oz += w * (A[2] * x + A[6] * y + A[10] * z + A[14]);
      qx += w * (A[0] * nx + A[4] * ny + A[8] * nz); qy += w * (A[1] * nx + A[5] * ny + A[9] * nz); qz += w * (A[2] * nx + A[6] * ny + A[10] * nz);
    }
    const l = Math.hypot(qx, qy, qz) || 1;
    O[i * 3] = ox * s; O[i * 3 + 1] = oy * s; O[i * 3 + 2] = oz * s; NO[i * 3] = qx / l; NO[i * 3 + 1] = qy / l; NO[i * 3 + 2] = qz / l;
  }
  return { O, NO };
}
// the upper body: the spine from the hips up, the neck, head, eyes and everything on the arms
const UPPER = new Set(SK.bones.map((n, i) => (/spine|neck|Head|eye|shoulder|arm|hand|jaw|tongue|teeth/i.test(n) && !/hips/i.test(n) ? i : -1)).filter((i) => i >= 0));

async function bakeType(name, bodyName, vi, pose, o = {}) {
  const B = bodies.find((b) => b.name === bodyName), V = variants[vi];
  if (!B || !V || V.body !== bodyName) throw new Error(`${name}: variant ${vi} is not on ${bodyName}`);
  const c = S.clips.find((x) => x.kind === 'sit' && x.sitPose === pose);
  const be = bake.bodies[B.name];
  const ovr = be && be.poses[pose] ? Float32Array.from(be.poses[pose][c.spec.table ? 2 : 0]) : null;
  const s = meanScale(B, V), k = c.kBody[B.index], f = o.frame ?? 0;
  const { Sm, P } = poseMats(B, S.clipData, c, f, k, ovr);
  const doc = await io.read(BASE + B.file);
  const th = [bi('crl_thigh__L'), bi('crl_thigh__R')], hd = [bi('crl_hand__L'), bi('crl_hand__R')], fa = [bi('crl_foreArm__L'), bi('crl_foreArm__R')];
  const pivot = [0, 1, 2].map((a) => ((P[th[0]][a] + P[th[1]][a]) / 2) * s);
  const hand = hd.map((b, sd) => { const w = P[b], e = P[fa[sd]], d = [w[0] - e[0], w[1] - e[1], w[2] - e[2]], l = Math.hypot(...d) || 1; return [0, 1, 2].map((a) => (w[a] + d[a] / l * 0.07) * s); });
  const meta = { name, body: bodyName, variant: vi, pose, scale: s, seat: [c.seat[B.index][0] * s, c.seat[B.index][1] * s], pivot, hand, lods: [] };
  const chunks = [];
  let off = 0;
  const put = (arr) => { const buf = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength); const pad = (4 - (off % 4)) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); off += pad; } const at = off; chunks.push(buf); off += buf.length; return at; };
  let bmin = [1e9, 1e9, 1e9], bmax = [-1e9, -1e9, -1e9];
  for (let lod = 0; lod < 3; lod++) {
    const L = { prims: {} };
    for (const prim of ['opaque', 'hair']) {
      const M = meshOf(doc, lod, prim);
      if (!M.n) continue;
      const { O, NO } = skin(M, Sm, s);
      // layer per vertex from the variant (slot -> layer); triangles on a slot with no layer (-1) are dropped; props (_PART >= 10) too
      const lay = new Int16Array(M.n);
      for (let i = 0; i < M.n; i++) lay[i] = M.SL[i] >= 100 ? M.SL[i] - 100 : (V.layers[M.SL[i]] ?? -1);
      const keep = [];
      for (let t = 0; t < M.I.length; t += 3) { const a = M.I[t], b2 = M.I[t + 1], c2 = M.I[t + 2]; if (lay[a] < 0 || lay[b2] < 0 || lay[c2] < 0 || M.PT[a] >= 10 || M.PT[b2] >= 10 || M.PT[c2] >= 10) continue; keep.push(a, b2, c2); }
      // compact the vertices in use
      const remap = new Int32Array(M.n).fill(-1); let nn = 0; for (const i of keep) if (remap[i] < 0) remap[i] = nn++;
      const pos = new Float32Array(nn * 3), nrm = new Int8Array(nn * 4), uv = new Float32Array(nn * 2), mt = new Uint8Array(nn * 4), idx = nn > 65535 ? new Uint32Array(keep.length) : new Uint16Array(keep.length);
      for (let i = 0; i < M.n; i++) {
        const j = remap[i]; if (j < 0) continue;
        pos.set(O.subarray(i * 3, i * 3 + 3), j * 3);
        nrm[j * 4] = Math.round(NO[i * 3] * 127); nrm[j * 4 + 1] = Math.round(NO[i * 3 + 1] * 127); nrm[j * 4 + 2] = Math.round(NO[i * 3 + 2] * 127);
        uv[j * 2] = M.UV[i * 2]; uv[j * 2 + 1] = M.UV[i * 2 + 1];
        let up = 0; for (let q = 0; q < 4; q++) if (UPPER.has(M.J[i * 4 + q])) up += M.W[i * 4 + q];
        mt[j * 4] = lay[i]; mt[j * 4 + 1] = M.CL[i]; mt[j * 4 + 2] = M.PT[i]; mt[j * 4 + 3] = Math.round(Math.min(1, Math.max(0, up)) * 255);
        if (lod === 0 && prim === 'opaque') for (let a = 0; a < 3; a++) { bmin[a] = Math.min(bmin[a], pos[j * 3 + a]); bmax[a] = Math.max(bmax[a], pos[j * 3 + a]); }
      }
      keep.forEach((v, q) => { idx[q] = remap[v]; });
      L.prims[prim] = { n: nn, tris: keep.length / 3, pos: put(pos), nrm: put(nrm), uv: put(uv), meta: put(mt), idx: put(idx), idx32: idx instanceof Uint32Array };
    }
    meta.lods.push(L);
  }
  meta.bbox = [bmin, bmax];
  const head = Buffer.from(JSON.stringify(meta)), hp = (4 - ((head.length + 4) % 4)) % 4;
  const lenb = Buffer.alloc(4); lenb.writeUInt32LE(head.length + hp);
  fs.mkdirSync(OUT, { recursive: true });
  const file = OUT + name + '.bin';
  fs.writeFileSync(file, Buffer.concat([lenb, head, Buffer.alloc(hp, 32), ...chunks]));
  const tris = meta.lods.map((l) => Object.values(l.prims).reduce((a, p) => a + p.tris, 0));
  console.log(`${name}: ${bodyName} v${vi} pose ${pose} scale ${s.toFixed(3)} seat up ${meta.seat[0].toFixed(3)} back ${meta.seat[1].toFixed(3)} tris ${tris.join('/')} bbox y ${bmin[1].toFixed(2)}..${bmax[1].toFixed(2)} z ${bmin[2].toFixed(2)}..${bmax[2].toFixed(2)} -> ${(fs.statSync(file).size / 1e6).toFixed(2)} MB`);
  return { meta, file };
}

const specs = (opt('types') || '').split(',').filter(Boolean);
for (const sp of specs) {
  const mm = /^(\w+)=(\w+):(\d+):(\d+)$/.exec(sp);
  if (!mm) { console.log('bad spec', sp); continue; }
  await bakeType(mm[1], mm[2], Number(mm[3]), Number(mm[4]));
}
