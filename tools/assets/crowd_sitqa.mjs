// SIT31 CPU QA (no GPU): the seated clips of client/src/sim/crowdSit.js on every GEN2 body, with the pose pass's rules
// re-implemented here (clip rotations, each body's own bone offsets, the clip's per-body hips scale, the per-walker arm
// overrides), linear-blend skinning of each body's LOD0 mesh, and per body the worst of:
//   torso   how far arm vertices (upper arm + forearm dominated, beyond 10 cm from the shoulder joint) are inside the torso:
//           the signed distance to the nearest torso vertex along its skinned normal (torso = hips / spine / spine01
//           dominated, no hair, no groin / buttock transition with a fifth or more of its weight on a thigh)
//   thigh   forearm + hand vertices inside a thigh, the same way against the thigh-dominated vertices
//   table   (table poses) each resting forearm's underside over the table against the top: > 0 floats, < 0 sinks
// The torso number is per vertex the EXCESS over the same vertex in the body's standing pose (s_neutral_idle frame 0, arms
// hanging): the armpit overlaps itself by construction and heavy builds' arms lie against the flank standing; the check is
// that no arm sinks into the torso deeper seated than standing. The standing overlap itself is reported (armpit).
// BEFORE: sit_a / sit_b as round 1 shipped them (--v1 <module>: the first solver, shared arms solved on the reference body),
// the new poses with their shared reference arms; AFTER: the arms the page applies, the bake's sample at the body's NYC
// mean height scale (crowd.js TARGET_H; --fresh: a new solve instead). Frames 0, 25, 50, 75 of each 100-frame clip.
// SIT32: a pose with a second arm pose (spec.keys 2: talk, eat, read, laptop and the cup's sip) is checked in both, 'after1'
// being key 1 from the bake's keys1 at the same scale sample; which forearms rest on the top in each key is RESTING. The
// crossed-legs pose also reports how far the upper (right) thigh is inside the lower one (legs). --write bakes keys1 and
// the props (crowdSit.js sitProps, per scale sample from the key-0 arms) as version 3; with --poses it re-solves only those
// poses into the existing bake.
// --consistent also waives a vertex whose nearest torso vertex lies well off that vertex's normal (the solver's own test).
//   node tools/assets/crowd_sitqa.mjs [--v1 crowdSit_v1.mjs] [--poses 1,3] [--bodies a,b] [--sheet out.png] [--json out.json] [--scale 1.08] [--fresh] [--consistent]
//   node tools/assets/crowd_sitqa.mjs --write     (only solve and write client/public/models/peds24/sit31_arms.json)
// sit31_arms.json holds each GEN2 body's arm rotations per seated pose (the override slots of crowdSit.js ARM_SLOTS, w = 2
// = keep the clip's): at a table, per pose and scale sample, the body's own solve or the clip's reference arms, whichever
// this check scores better (scoreOf); away from a table the same choice per ARM, then that arm's elbow swung 10 / 20 deg
// either way round its shoulder-wrist line where it scores better still (scoreSides, swivelQ). --out <file> writes a trial
// bake elsewhere and --bake <file> judges one. The table poses depend on the walker's world scale (the table top is 0.275 m over the seat in
// METRES), so those carry five solutions at 0.88 / 0.94 / 1 / 1.06 / 1.12 of the body's NYC mean scale, which crowd.js
// blends by the walker's scale; the others one. Solving is ~0.15-0.3 s a pose, too slow to run for walkers spawned seated.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = path.join(ROOT, 'client/public/models/peds24') + '/';
const args = process.argv.slice(2);
const opt = (n, d = null) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
// --sit <file>: another copy of crowdSit.js (a trial of the solver) in place of client/src/sim/crowdSit.js
const SIT = await import(pathToFileURL(opt('sit') ? path.resolve(opt('sit')) : path.join(ROOT, 'client/src/sim/crowdSit.js')).href);
const m = JSON.parse(fs.readFileSync(BASE + 'manifest.json', 'utf8'));
const rb = fs.existsSync(BASE + 'rb27/manifest.json') ? JSON.parse(fs.readFileSync(BASE + 'rb27/manifest.json', 'utf8')) : { bodies: {}, variants: [] };
const ci = JSON.parse(fs.readFileSync(BASE + 'clips.json', 'utf8'));
const SK = m.skeletons.gen2, nb = SK.bones.length, W = nb * 8;
const data = new Float32Array(fs.readFileSync(BASE + 'clips_gen2.bin').buffer.slice(0));
const clips = ci.clips.filter((c) => c.skeleton === 'gen2'), hips = SK.bones.findIndex((b) => /hips/i.test(b));
const onlyB = opt('bodies') ? new Set(opt('bodies').split(',')) : null;
const bodies = [...Object.entries(m.bodies), ...Object.entries(rb.bodies)].filter(([, B]) => B.skeleton === 'gen2').map(([name, B], index) => ({ name, ...B, index, set: rb.bodies[name] ? 'rb27' : undefined }));
for (const B of bodies) B.hipsH = Math.hypot(B.refT[hips * 3], B.refT[hips * 3 + 1], B.refT[hips * 3 + 2]);
const variants = [...m.variants, ...rb.variants];
const TARGET_H = { m: 1.77, f: 1.65, child: 1.22 };
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
await MeshoptDecoder.ready;

// ---- meshes: LOD0 opaque + hair primitives, model space; props (_PART >= 10) dropped
async function meshOf(B) {
  const doc = await io.read(path.join(BASE, B.set ? '' : '', B.file));
  const P = [], N = [], J = [], Wt = [], part = [], I = [], cls = [];
  for (const n of doc.getRoot().listNodes()) {
    if (n.getName() !== 'LOD0' || !n.getMesh()) continue;
    const Mw = n.getWorldMatrix();
    for (const p of n.getMesh().listPrimitives()) {
      const pa = p.getAttribute('POSITION'), na = p.getAttribute('NORMAL'), ja = p.getAttribute('JOINTS_0'), wa = p.getAttribute('WEIGHTS_0'), pr = p.getAttribute('_PART'), ca = p.getAttribute('_CLS');
      const base = P.length / 3, v = [0, 0, 0], nv = [0, 0, 1], j = [0, 0, 0, 0], w = [0, 0, 0, 0];
      for (let i = 0; i < pa.getCount(); i++) {
        pa.getElement(i, v);
        P.push(Mw[0] * v[0] + Mw[4] * v[1] + Mw[8] * v[2] + Mw[12], Mw[1] * v[0] + Mw[5] * v[1] + Mw[9] * v[2] + Mw[13], Mw[2] * v[0] + Mw[6] * v[1] + Mw[10] * v[2] + Mw[14]);
        if (na) na.getElement(i, nv);
        N.push(Mw[0] * nv[0] + Mw[4] * nv[1] + Mw[8] * nv[2], Mw[1] * nv[0] + Mw[5] * nv[1] + Mw[9] * nv[2], Mw[2] * nv[0] + Mw[6] * nv[1] + Mw[10] * nv[2]);
        ja.getElement(i, j); wa.getElement(i, w);
        J.push(...j); Wt.push(...w);
        part.push(pr ? Math.round(pr.getScalar(i)) : 0);
        cls.push(ca ? Math.round(ca.getScalar(i)) : 1);
      }
      const ia = p.getIndices().getArray();
      for (let k = 0; k < ia.length; k += 3) { const a = base + ia[k], b = base + ia[k + 1], c = base + ia[k + 2]; if (part[a] >= 10 || part[b] >= 10 || part[c] >= 10) continue; I.push(a, b, c); }
    }
  }
  return { P: new Float32Array(P), N: new Float32Array(N), J: new Int16Array(J), W: new Float32Array(Wt), part: new Int16Array(part), cls: new Int8Array(cls), I: new Uint32Array(I), n: P.length / 3 };
}

// ---- the pose pass in JS (crowd.js POSE_FS), with the per-walker overrides
const slotOf = new Int16Array(nb).fill(-1);
SIT.ARM_SLOTS.forEach((n, k) => { const b = SK.bones.indexOf(n); if (b >= 0) slotOf[b] = k; });
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
function skin(M, Sm) {
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
    O[i * 3] = ox; O[i * 3 + 1] = oy; O[i * 3 + 2] = oz; NO[i * 3] = qx / l; NO[i * 3 + 1] = qy / l; NO[i * 3 + 2] = qz / l;
  }
  O.normals = NO;
  return O;
}
// signed distance field of a vertex set (nearest vertex, along its normal): inside(p) > 0 = p is that far inside
function fieldOf(X, idx) {
  const NX = X.normals, C = 0.04, grid = new Map(), keyOf = (ix, iy, iz) => (ix + 512) * 1048576 + (iy + 512) * 1024 + (iz + 512);
  for (const i of idx) { const k = keyOf(Math.floor(X[i * 3] / C), Math.floor(X[i * 3 + 1] / C), Math.floor(X[i * 3 + 2] / C)); let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(i); }
  return (p, withDist = false) => {
    const ix = Math.floor(p[0] / C), iy = Math.floor(p[1] / C), iz = Math.floor(p[2] / C);
    let best = 1e9, bi = -1;
    for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) for (let dz = -3; dz <= 3; dz++) {
      const a = grid.get(keyOf(ix + dx, iy + dy, iz + dz)); if (!a) continue;
      for (const i of a) { const ex = p[0] - X[i * 3], ey = p[1] - X[i * 3 + 1], ez = p[2] - X[i * 3 + 2], d2 = ex * ex + ey * ey + ez * ez; if (d2 < best) { best = d2; bi = i; } }
    }
    if (bi < 0) return withDist ? { depth: -1, dist: 1e9 } : -1;
    const depth = -((p[0] - X[bi * 3]) * NX[bi * 3] + (p[1] - X[bi * 3 + 1]) * NX[bi * 3 + 1] + (p[2] - X[bi * 3 + 2]) * NX[bi * 3 + 2]);
    if (withDist) return { depth, dist: Math.sqrt(best) };
    // a point truly d inside has its nearest surface point about d away (plus the vertex spacing); a far point whose nearest
    // vertex's normal happens to face away from it is not inside (a vertex 16.6 cm from the torso read as 6.4 cm deep, an
    // outer-deltoid vertex as 14 cm, without this)
    return depth > 0 && Math.sqrt(best) > 1.15 * depth + 0.015 ? -1 : depth;
  };
}
// radial slab hull along an axis (origin o, unit direction u), slab size h, nbin bins, of the points idx of X
function hullAlong(X, idx, o, u, h = 0.01, nbin = 48) {
  const ref = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const e1 = SIT.SIT_V.perp(ref, u), e2 = SIT.SIT_V.cross(u, e1);
  let t0 = 1e9, t1 = -1e9;
  const T = new Float32Array(idx.length), A = new Float32Array(idx.length), Bc = new Float32Array(idx.length);
  idx.forEach((i, k) => { const d = [X[i * 3] - o[0], X[i * 3 + 1] - o[1], X[i * 3 + 2] - o[2]]; T[k] = d[0] * u[0] + d[1] * u[1] + d[2] * u[2]; A[k] = d[0] * e1[0] + d[1] * e1[1] + d[2] * e1[2]; Bc[k] = d[0] * e2[0] + d[1] * e2[1] + d[2] * e2[2]; if (T[k] < t0) t0 = T[k]; if (T[k] > t1) t1 = T[k]; });
  const NS = Math.max(1, Math.ceil((t1 - t0) / h) + 1), ca = new Float32Array(NS), cb = new Float32Array(NS), cn = new Float32Array(NS), r = new Float32Array(NS * nbin);
  const sOf = (t) => Math.min(NS - 1, Math.max(0, Math.floor((t - t0) / h)));
  for (let k = 0; k < idx.length; k++) { const s = sOf(T[k]); ca[s] += A[k]; cb[s] += Bc[k]; cn[s]++; }
  for (let s = 0; s < NS; s++) if (cn[s]) { ca[s] /= cn[s]; cb[s] /= cn[s]; } else if (s) { ca[s] = ca[s - 1]; cb[s] = cb[s - 1]; }
  for (let k = 0; k < idx.length; k++) {
    const s = sOf(T[k]), da = A[k] - ca[s], db = Bc[k] - cb[s], rr = Math.hypot(da, db);
    const bin = ((Math.round((Math.atan2(db, da) / (2 * Math.PI)) * nbin) % nbin) + nbin) % nbin;
    if (rr > r[s * nbin + bin]) r[s * nbin + bin] = rr;
  }
  for (let s = 0; s < NS; s++) for (let pass = 0; pass < 3; pass++) for (let b = 0; b < nbin; b++) { const kk = s * nbin + b; if (r[kk] > 0) continue; r[kk] = Math.min(r[s * nbin + ((b + 1) % nbin)] || 1e9, r[s * nbin + ((b + nbin - 1) % nbin)] || 1e9); if (r[kk] > 1e8) r[kk] = 0; }
  return (p) => {
    const d = [p[0] - o[0], p[1] - o[1], p[2] - o[2]], t = d[0] * u[0] + d[1] * u[1] + d[2] * u[2];
    if (t < t0 || t > t1) return -1;
    const s = sOf(t), da = d[0] * e1[0] + d[1] * e1[1] + d[2] * e1[2] - ca[s], db = d[0] * e2[0] + d[1] * e2[1] + d[2] * e2[2] - cb[s];
    const a = ((Math.atan2(db, da) / (2 * Math.PI)) * nbin + nbin) % nbin, b0 = Math.floor(a) % nbin, b1 = (b0 + 1) % nbin, w = a - Math.floor(a);
    const R = r[s * nbin + b0] * (1 - w) + r[s * nbin + b1] * w;
    return R > 0 ? R - Math.hypot(da, db) : -1;
  };
}
const bi = (n) => SK.bones.indexOf(n);
const G = {
  torso: new Set([bi('crl_hips__C'), bi('crl_spine__C'), bi('crl_spine01__C')]),
  arm: [new Set([bi('crl_arm__L'), bi('crl_foreArm__L')]), new Set([bi('crl_arm__R'), bi('crl_foreArm__R')])],
  lower: [new Set([bi('crl_foreArm__L'), bi('crl_hand__L'), ...SK.bones.map((n, i) => (/hand.*__L/.test(n) ? i : -1)).filter((i) => i >= 0)]), new Set([bi('crl_foreArm__R'), bi('crl_hand__R'), ...SK.bones.map((n, i) => (/hand.*__R/.test(n) ? i : -1)).filter((i) => i >= 0)])],
  fore: [bi('crl_foreArm__L'), bi('crl_foreArm__R')],
  thigh: [bi('crl_thigh__L'), bi('crl_thigh__R')], knee: [bi('crl_leg__L'), bi('crl_leg__R')], shoulder: [bi('crl_arm__L'), bi('crl_arm__R')],
};
// torso vertices: hips / spine / spine01 dominated, no hair, above the hip joints in the bind pose and less than half on a
// thigh (the same definition as crowdSit.js bodyOutline)
function torsoSet(M) {
  if (M._torso) return M._torso;
  const out = [];
  for (let i = 0; i < M.n; i++) {
    if (M.part[i] >= 10 || M.domW[i] < 0.5 || M.cls[i] === 3 || !G.torso.has(M.dom[i])) continue;
    let wt = 0; for (let k = 0; k < 4; k++) if (M.J[i * 4 + k] === G.thigh[0] || M.J[i * 4 + k] === G.thigh[1]) wt += M.W[i * 4 + k];
    if (wt < 0.5 && M.P[i * 3 + 1] > M.hj[1] - 0.01) out.push(i);
  }
  return (M._torso = out);
}
// inside a vertex set: the nearest vertex's signed distance along its normal when that vertex is within 6 cm; a point
// further than that from every vertex counts as outside. A radial slab hull as the fallback filled concavities (between
// a heavy chest and an arm swung forward) and called points outside the body 10 cm inside. A real penetration still
// registers through the vertices near where the arm enters; depths read 6 cm at most.
// --consistent: also the rule fieldOf applies (and crowdSit.js torsoField.depth, the solver's own test): a point whose
// nearest vertex is much further away than its depth along that vertex's normal is not inside (the normal's sign says
// nothing about a point off to its side, e.g. in the crease between an arm and the chest)
const CONSISTENT = args.includes('--consistent');
function insideOf(X, idx) {
  const near = fieldOf(X, idx);
  return (p) => { const r = near(p, true); if (r.dist > 0.06) return -1; return CONSISTENT && r.depth > 0 && r.dist > 1.15 * r.depth + 0.015 ? -1 : r.depth; };
}
const RESTING = { table: [[1, 1]], chin: [[1, 0]], cup: [[1, 1], [1, 0]], talk: [[1, 1], [1, 0]], eat: [[1, 0], [1, 0]], read: [[1, 1], [1, 0]], laptop: [[1, 1], [1, 1]], lean: [[1, 0]], cross: [[1, 0]] };
function metrics(M, X, Pj, c, s, skip = null, key = 0) {
  const dom = M.dom;
  const torsoIdx = [], armIdx = [[], []], lowIdx = [[], []], thighIdx = [[], []], foreIdx = [[], []];
  torsoIdx.push(...torsoSet(M));
  for (let i = 0; i < M.n; i++) {
    if (M.part[i] >= 10 || M.domW[i] < 0.5 || M.cls[i] === 3) continue;
    const d = dom[i];
    for (let sd = 0; sd < 2; sd++) {
      if (G.arm[sd].has(d)) armIdx[sd].push(i);
      if (G.lower[sd].has(d)) lowIdx[sd].push(i);
      if (d === G.thigh[sd]) thighIdx[sd].push(i);
      if (d === G.fore[sd]) foreIdx[sd].push(i);
    }
  }
  const torsoIn = insideOf(X, torsoIdx);
  let torso = -1, where = null, worstAt = null;
  const torsoS = [-1, -1], thighS = [-1, -1], tableS = [null, null];
  for (let sd = 0; sd < 2; sd++) {
    const S0 = Pj[G.shoulder[sd]];
    for (const i of armIdx[sd]) {
      const p = [X[i * 3], X[i * 3 + 1], X[i * 3 + 2]];
      if (Math.hypot(p[0] - S0[0], p[1] - S0[1], p[2] - S0[2]) < 0.1) continue;
      const v = torsoIn(p) - (skip ? skip[i] : 0);   // deeper than the same vertex standing
      if (v > torsoS[sd]) torsoS[sd] = v;
      if (v > torso) { torso = v; where = sd ? 'R' : 'L'; worstAt = { bone: SK.bones[dom[i]], p: p.map((x) => +x.toFixed(3)), std: skip ? +skip[i].toFixed(3) : 0, sh: S0.map((x) => +x.toFixed(3)) }; }
    }
  }
  let thigh = -1;
  for (let sd = 0; sd < 2; sd++) {
    const inT = fieldOf(X, thighIdx[sd]);
    for (let s2 = 0; s2 < 2; s2++) for (const i of lowIdx[s2]) { const v = inT([X[i * 3], X[i * 3 + 1], X[i * 3 + 2]]); if (v > thigh) thigh = v; if (v > thighS[s2]) thighS[s2] = v; }
  }
  let table = null;
  if (c.spec.table) {
    const hm = SIT.SIT_V.mul(SIT.SIT_V.add(Pj[G.thigh[0]], Pj[G.thigh[1]]), 0.5);
    const seatY = hm[1] - 0.085, seatZ = hm[2], yTop = seatY + SIT.TABLE31.h / s, zEdge = seatZ + 0.26 / s;
    table = [];
    const rest = (RESTING[c.spec.arms] || [[1, 1]])[Math.min(key, (RESTING[c.spec.arms] || [[1, 1]]).length - 1)];
    for (let sd = 0; sd < 2; sd++) {
      if (!rest[sd]) continue;   // a forearm off the top (raised, holding, over the chair's back)
      let mn = 1e9;
      for (const i of foreIdx[sd]) if (X[i * 3 + 2] > zEdge && X[i * 3 + 1] < mn) mn = X[i * 3 + 1];
      table.push(mn < 1e8 ? (mn - yTop) * s : null);   // world metres
      tableS[sd] = table[table.length - 1];
    }
  }
  // crossed legs: the upper (right) thigh's vertices inside the lower (left) one
  let legs = null;
  // (past 18 cm from the right hip joint: nearer, the two thighs meet at the groin whether crossed or not)
  if (c.spec.cross) { const inL = fieldOf(X, thighIdx[0]), H = Pj[G.thigh[1]]; legs = -1; for (const i of thighIdx[1]) { if (Math.hypot(X[i * 3] - H[0], X[i * 3 + 1] - H[1], X[i * 3 + 2] - H[2]) < 0.18) continue; const v = inL([X[i * 3], X[i * 3 + 1], X[i * 3 + 2]]); if (v > legs) legs = v; } }
  return { torso, where, thigh, table, worstAt, torsoS, thighS, tableS, legs };
}
// the arm vertices inside the torso in the standing idle (per body)
function standingSkip(B, M) {
  const idle = clips.find((c) => c.name === 's_neutral_idle');
  const { Sm } = poseMats(B, data, idle, 0, B.hipsH / idle.hipsH, null);
  const X = skin(M, Sm), torsoIdx = torsoSet(M);
  const inside = insideOf(X, torsoIdx), skip = new Float32Array(M.n);
  let n = 0, worst = 0;
  for (let i = 0; i < M.n; i++) {
    if (M.part[i] >= 10 || M.domW[i] < 0.5 || !(M.dom[i] === G.shoulder[0] || M.dom[i] === G.shoulder[1])) continue;   // upper arms only
    const v = inside([X[i * 3], X[i * 3 + 1], X[i * 3 + 2]]);
    if (v > 0) { skip[i] = v; if (v > 0.005) n++; if (v > worst) worst = v; }
  }
  return { skip, n, worst };
}

// ---- a small orthographic raster for review sheets (3/4 front view)
function raster(img, W2, H2, x0, y0, X, M, scale, yaw) {
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  const pr = (i) => { const x = X[i * 3], y = X[i * 3 + 1], z = X[i * 3 + 2]; return [x * cs + z * sn, y, -x * sn + z * cs]; };
  for (let t = 0; t < M.I.length; t += 3) {
    const a = pr(M.I[t]), b = pr(M.I[t + 1]), c = pr(M.I[t + 2]);
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const nz = e1[0] * e2[1] - e1[1] * e2[0], nl = Math.hypot(e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], nz) || 1;
    const shade = 0.25 + 0.75 * Math.abs(nz / nl);
    const d = M.dom[M.I[t]];
    const col = G.torso.has(d) ? [200, 170, 150] : (G.arm[0].has(d) || G.arm[1].has(d)) ? [90, 150, 230] : (G.lower[0].has(d) || G.lower[1].has(d)) ? [240, 200, 60] : [150, 150, 160];
    const sx = (p) => x0 + p[0] * scale, sy = (p) => y0 - p[1] * scale;
    const A2 = [sx(a), sy(a), a[2]], B2 = [sx(b), sy(b), b[2]], C2 = [sx(c), sy(c), c[2]];
    const minX = Math.max(0, Math.floor(Math.min(A2[0], B2[0], C2[0]))), maxX = Math.min(W2 - 1, Math.ceil(Math.max(A2[0], B2[0], C2[0])));
    const minY = Math.max(0, Math.floor(Math.min(A2[1], B2[1], C2[1]))), maxY = Math.min(H2 - 1, Math.ceil(Math.max(A2[1], B2[1], C2[1])));
    const den = (B2[1] - C2[1]) * (A2[0] - C2[0]) + (C2[0] - B2[0]) * (A2[1] - C2[1]);
    if (Math.abs(den) < 1e-9) continue;
    for (let py = minY; py <= maxY; py++) for (let px = minX; px <= maxX; px++) {
      const l1 = ((B2[1] - C2[1]) * (px - C2[0]) + (C2[0] - B2[0]) * (py - C2[1])) / den, l2 = ((C2[1] - A2[1]) * (px - C2[0]) + (A2[0] - C2[0]) * (py - C2[1])) / den, l3 = 1 - l1 - l2;
      if (l1 < 0 || l2 < 0 || l3 < 0) continue;
      const z = l1 * A2[2] + l2 * B2[2] + l3 * C2[2], k = py * W2 + px;
      if (z <= img.zb[k]) continue;
      img.zb[k] = z; img.px[k * 3] = col[0] * shade; img.px[k * 3 + 1] = col[1] * shade; img.px[k * 3 + 2] = col[2] * shade;
    }
  }
}

// ---- run
const t0 = performance.now();
const meshes = new Map(), outlines = {};
for (const B of bodies) {
  if (onlyB && !onlyB.has(B.name) && B.name !== 'SK_Afro02W_B_MHv3') continue;
  const M = await meshOf(B);
  M.dom = new Int16Array(M.n); M.domW = new Float32Array(M.n);
  for (let i = 0; i < M.n; i++) { let bw = -1, bb = -1; for (let k = 0; k < 4; k++) if (M.W[i * 4 + k] > bw) { bw = M.W[i * 4 + k]; bb = M.J[i * 4 + k]; } M.dom[i] = bb; M.domW[i] = bw; }
  { const hjOf = (b) => { const m2 = B.ibm.slice(b * 16, b * 16 + 16), r = [m2[0], m2[1], m2[2], m2[4], m2[5], m2[6], m2[8], m2[9], m2[10]], t = [m2[12], m2[13], m2[14]]; return [-(r[0] * t[0] + r[1] * t[1] + r[2] * t[2]), -(r[3] * t[0] + r[4] * t[1] + r[5] * t[2]), -(r[6] * t[0] + r[7] * t[1] + r[8] * t[2])]; };
    const a = hjOf(G.thigh[0]), b = hjOf(G.thigh[1]); M.hj = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]; }
  meshes.set(B.name, M);
  outlines[B.name] = SIT.bodyOutline({ ...SK, nb, hips }, B, M.P, M.J, M.W, M.part, M.n, M.N, M.cls);
}
const V1 = opt('v1') ? await import(pathToFileURL(path.resolve(opt('v1'))).href) : null;
const S1 = V1 ? { name: 'gen2', nb, bones: SK.bones, parents: SK.parents, hips, clips, clipData: data, bodies } : null;
const r1 = V1 ? V1.synthSitClipsV1(S1) : null;
const skips = new Map();
const S = { name: 'gen2', nb, bones: SK.bones, parents: SK.parents, hips, clips, clipData: data, bodies };
const r = SIT.synthSitClips(S, outlines);
S.clipData = r.data; S.clips = [...clips, ...r.clips];
const meanScale = (B) => { const V = variants.find((v) => v.body === B.name) || { gender: 'm', age: 'adult' }; const key = V.age === 'child' ? 'child' : V.gender; return Math.max(0.7, Math.min(1.1, TARGET_H[key] / (B.height * (V.scale || 1)))) * (V.scale || 1); };
// the QA's own verdict on one set of arms (override slots q) at world scale s: the worst frame's torso excess over 5 mm,
// plus a quarter of the hands' thigh intrusion over 1 cm (capped at 5 cm: that test misreads hands between the thighs),
// plus each resting forearm's distance from the top over 1 cm
function scoreOf(B, M, c, s, q, sk) {
  let worst = 0;
  for (const f of [0, 25, 50, 75]) {
    const { Sm, P } = poseMats(B, S.clipData, c, f, c.kBody[B.index], q);
    const mt = metrics(M, skin(M, Sm), P, c, s, sk.skip);
    let v = Math.max(0, mt.torso - 0.005) + 0.25 * Math.min(0.05, Math.max(0, mt.thigh - 0.01));
    if (mt.table) for (const g of mt.table) if (g != null) v += Math.max(0, Math.abs(g) - 0.01);
    if (v > worst) worst = v;
  }
  return worst;
}
// the same per arm: [left, right], each arm's torso excess, its hand in a thigh, its forearm on the top
function scoreSides(B, M, c, s, q, sk) {
  const w = [0, 0];
  for (const f of [0, 25, 50, 75]) {
    const { Sm, P } = poseMats(B, S.clipData, c, f, c.kBody[B.index], q);
    const mt = metrics(M, skin(M, Sm), P, c, s, sk.skip);
    for (let sd = 0; sd < 2; sd++) {
      let v = Math.max(0, mt.torsoS[sd] - 0.005) + 0.25 * Math.min(0.05, Math.max(0, mt.thighS[sd] - 0.01));
      if (mt.tableS[sd] != null) v += Math.max(0, Math.abs(mt.tableS[sd]) - 0.01);
      if (v > w[sd]) w[sd] = v;
    }
  }
  return w;
}
// arm side of q turned by ang about the line from its shoulder joint to its wrist: the elbow swings round that line,
// the wrist and the hand's world orientation stay (the forearm's local rotation is unchanged, the hand's re-derived)
function swivelQ(B, c, q, side, ang) {
  const Q = SIT.SIT_Q, V = SIT.SIT_V, fr = SIT.sitFrame(S, S.clipData, c, 0, B, c.kBody[B.index]);
  const lq = fr.lq.map((x) => x.slice());
  SIT.ARM_SLOTS.forEach((n, k) => { const o = k * 4; if (q[o + 3] < 1.5) lq[SK.bones.indexOf(n)] = [q[o], q[o + 1], q[o + 2], q[o + 3]]; });
  const { G, P } = SIT.sitFK({ nb, parents: SK.parents }, lq, fr.lt);
  const sx = side ? 'R' : 'L', bA = bi('crl_arm__' + sx), bF = bi('crl_foreArm__' + sx), bH = bi('crl_hand__' + sx), bC = bi('crl_shoulder__' + sx);
  const R = Q.axis(V.norm(V.sub(P[bH], P[bA])), ang), GA = Q.norm(Q.mul(R, G[bA])), GF = Q.norm(Q.mul(R, G[bF]));
  const out = Float32Array.from(q), put = (b, v) => out.set(Q.norm(v), SIT.ARM_SLOTS.indexOf(SK.bones[b]) * 4);
  put(bA, Q.mul(Q.inv(G[bC]), GA));
  put(bF, Q.mul(Q.inv(GA), GF));
  put(bH, Q.mul(Q.inv(GF), G[bH]));
  return out;
}
if (args.includes('--write')) {
  const SC = [0.88, 0.94, 1, 1.06, 1.12], out = { version: 3, built: new Date().toISOString(), slots: SIT.ARM_SLOTS, scales: SC, bodies: {} };
  const tw = performance.now();
  const rnd = (a) => Array.from(a, (v) => +v.toFixed(5));
  const picks = {};
  // --poses with --write: only those poses are solved, and written over the existing bake's entries (the rest kept)
  const onlyPw = opt('poses') ? new Set(opt('poses').split(',').map(Number)) : null, prev = onlyPw && fs.existsSync(BASE + 'sit31_arms.json') ? JSON.parse(fs.readFileSync(BASE + 'sit31_arms.json', 'utf8')) : null;
  if (prev) for (const [n, e] of Object.entries(prev.bodies)) out.bodies[n] = e;
  for (const B of bodies) {
    if (!outlines[B.name]) continue;
    const s0 = meanScale(B), e = (prev && prev.bodies[B.name]) || { s0: +s0.toFixed(5), poses: {}, pen: {}, pick: {} };
    e.pick = e.pick || {};
    const M = meshes.get(B.name);
    if (!skips.has(B.name)) skips.set(B.name, standingSkip(B, M));
    const sk = skips.get(B.name);
    for (const c of r.clips) {
      if (onlyPw && !onlyPw.has(c.sitPose)) continue;
      // SELECTED BY THE QA'S OWN METRIC: the body's own solve, or the clip's reference arms (solved once on the reference
      // body) written out as rotations, whichever this check scores better on this body at this scale. The solver works on
      // 2-2.5 cm samples of torso and arm and waives a vertex whose nearest torso sample lies well off its normal; on heavy
      // builds it kept poses the full-mesh check measured 5-6 cm deep, where the reference arms measured 3.
      const fr0 = SIT.sitFrame(S, S.clipData, c, 0, B, c.kBody[B.index]);
      const refQ = (x) => { const q = new Float32Array(x.q.length); SIT.ARM_SLOTS.forEach((n, k) => { const o = k * 4; if (x.q[o + 3] > 1.5) { q[o + 3] = 2; return; } q.set(fr0.lq[SK.bones.indexOf(n)], o); }); return q; };
      const list = (c.spec.table ? SC : [1]).map((k) => {
        const s = s0 * k, x = SIT.solveSitArms(S, B, outlines[B.name], c, s);
        if (c.spec.table) {
          const own = scoreOf(B, M, c, s, x.q, sk), rq = refQ(x), ref = scoreOf(B, M, c, s, rq, sk);
          return ref < own - 0.002 ? { q: rq, info: x.info, pick: 'ref', own, ref } : { q: x.q, info: x.info, pick: 'own', own, ref };
        }
        // away from a table, per ARM: the body's own or the reference arm, then the elbow swung 10 / 20 deg either way
        // round the shoulder-wrist line (the hand stays where it rests) where that scores better
        const rq = refQ(x), so = scoreSides(B, M, c, s, x.q, sk), sr = scoreSides(B, M, c, s, rq, sk);
        let q = Float32Array.from(x.q);
        const pick = ['o', 'o'];
        for (const sd of [0, 1]) if (sr[sd] < so[sd] - 0.002) { q.set(rq.subarray(sd * 16, sd * 16 + 16), sd * 16); pick[sd] = 'r'; }
        let cur = scoreSides(B, M, c, s, q, sk);
        for (const sd of [0, 1]) {
          let best = null;
          for (const ang of [-0.35, -0.17, 0.17, 0.35]) { const t = swivelQ(B, c, q, sd, ang), sc = scoreSides(B, M, c, s, t, sk); if (sc[sd] < (best ? best.sc : cur[sd]) - 0.002) best = { q: t, sc: sc[sd], ang }; }
          if (best) { q = best.q; cur = scoreSides(B, M, c, s, q, sk); pick[sd] += (best.ang > 0 ? '+' : '-') + Math.round(Math.abs(best.ang) * 57.3); }
        }
        return { q, info: x.info, pick: pick.join('|'), own: Math.max(...so), ref: Math.max(...sr), fin: Math.max(...cur) };
      });
      e.pick[c.sitPose] = c.spec.table ? list.map((x) => x.pick[0]).join('') : list[0].pick;
      for (const x of list) { const pk = (picks[c.name] = picks[c.name] || {}); for (const t of x.pick.split('|')) { const key = t === 'own' || t === 'o' ? 'own' : t === 'ref' || t === 'r' ? 'ref' : (t[0] === 'r' ? 'ref' : 'own') + ' + swivel'; pk[key] = (pk[key] || 0) + 1; } }
      // a slot some scale samples override (a walker leaning in to reach the top) and others keep: the keepers get the
      // clip's own frame-0 rotation written out, so crowd.js blends between real rotations instead of switching at a sample
      if (list.length > 1) {
        const fr = SIT.sitFrame(S, S.clipData, c, 0, B, c.kBody[B.index]);
        SIT.ARM_SLOTS.forEach((n, k) => {
          const o = k * 4, some = list.some((x) => x.q[o + 3] < 1.5), all = list.every((x) => x.q[o + 3] < 1.5);
          if (some && !all) for (const x of list) if (x.q[o + 3] > 1.5) x.q.set(fr.lq[SK.bones.indexOf(n)], o);
        });
      }
      // SIT32 key 1 (a gesture, a bite, a sip, a page, the hands across the keys): the body's own solve at each sample
      const list1 = c.spec.keys === 2 ? (c.spec.table ? SC : [1]).map((k) => ({ q: SIT.solveSitArms(S, B, outlines[B.name], c, s0 * k, null, 1).q })) : null;
      if (list1) {
        const fr = SIT.sitFrame(S, S.clipData, c, 0, B, c.kBody[B.index]), both = [...list, ...list1];
        SIT.ARM_SLOTS.forEach((n, k) => {
          const o = k * 4, some = both.some((x) => x.q[o + 3] < 1.5), all = both.every((x) => x.q[o + 3] < 1.5);
          if (some && !all) for (const x of both) if (x.q[o + 3] > 1.5) x.q.set(fr.lq[SK.bones.indexOf(n)], o);
        });
        (e.keys1 || (e.keys1 = {}))[c.sitPose] = list1.map((x) => rnd(x.q));
      }
      e.poses[c.sitPose] = list.map((x) => rnd(x.q));
      e.pen[c.sitPose] = +Math.max(...list.map((x) => x.info.pen)).toFixed(4);
      // SIT32 legs crossed: how deep the upper thigh lies in the lower one on this body (frame 0, this check's legs metric);
      // crowd.js gives the pose to no body past 5 cm
      if (c.spec.cross) { const { Sm, P } = poseMats(B, S.clipData, c, 0, c.kBody[B.index], list[list.length >> 1].q); (e.legs || (e.legs = {}))[c.sitPose] = +metrics(M, skin(M, Sm), P, c, s0, sk.skip).legs.toFixed(4); }
      // SIT32 props, placed from each sample's key-0 arms
      const pr = list.map((x, j) => SIT.sitProps(S, B, c, x.q, s0 * (c.spec.table ? SC[j] : 1)));
      if (pr.some((a) => a.length)) (e.props || (e.props = {}))[c.sitPose] = pr.map((a) => a.map((p) => ({ k: p.k, b: p.b, m: rnd(p.m) })));
    }
    out.bodies[B.name] = e;
  }
  const file = opt('out') || path.join(BASE, 'sit31_arms.json');   // --out: a trial bake elsewhere (with --bodies it holds only those)
  fs.writeFileSync(file + '.tmp', JSON.stringify(out));
  fs.renameSync(file + '.tmp', file);   // a page loading meanwhile reads the old file or the new one, never half of one
  console.log(`wrote ${file}: ${Object.keys(out.bodies).length} bodies, ${(fs.statSync(file).size / 1024).toFixed(0)} KB in ${((performance.now() - tw) / 1000).toFixed(0)} s; picked (own solve / reference arms, per scale sample): ${JSON.stringify(picks)}`);
  process.exit(0);
}
console.log(`${meshes.size} bodies loaded + outlined, clips ${r.clips.map((c) => c.name).join(', ')} from ${r.ref} in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
const BAKEF = opt('bake') || BASE + 'sit31_arms.json';   // --bake: judge a trial bake
const BAKE = !args.includes('--fresh') && fs.existsSync(BAKEF) ? JSON.parse(fs.readFileSync(BAKEF, 'utf8')) : null;
if (BAKE) console.log(`AFTER = the bake (${BAKE.built}, version ${BAKE.version || 1})`);
const onlyP = opt('poses') ? new Set(opt('poses').split(',').map(Number)) : null;
const sclK = Number(opt('scale', '1'));
const rows = [], sheet = [];
const tS = performance.now();
let solveMs = 0, nSolve = 0;
for (const c of r.clips) {
  if (onlyP && !onlyP.has(c.sitPose)) continue;
  for (const B of bodies) {
    const M = meshes.get(B.name);
    if (!M || (onlyB && !onlyB.has(B.name))) continue;
    const V = variants.find((v) => v.body === B.name) || { gender: 'm', age: 'adult' };
    const age = V.age === 'child' ? 'child' : 'adult';
    const s = meanScale(B) * sclK;
    const k = c.kBody[B.index];
    const ts = performance.now();
    // AFTER = the arms the page applies: the bake's own sample at the NYC mean scale (--fresh: a new solve instead)
    const be = BAKE && sclK === 1 ? BAKE.bodies[B.name] : null;
    const sol = be && be.poses[c.sitPose] ? { q: Float32Array.from(be.poses[c.sitPose][c.spec.table ? 2 : 0]), info: { pen: be.pen[c.sitPose], pick: be.pick ? be.pick[c.sitPose] : null } } : SIT.solveSitArms(S, B, outlines[B.name], c, s);
    solveMs += performance.now() - ts; nSolve++;
    const res = { body: B.name, age, pose: c.name };
    if (!skips.has(B.name)) skips.set(B.name, standingSkip(B, M));
    const sk = skips.get(B.name);
    res.armpit = { n: sk.n, worst: sk.worst };
    const c1 = r1 && r1.clips.find((x) => x.name === c.name);
    // SIT32 key 1: the bake's second arm pose (or a fresh solve of it), checked the same way
    const q1 = c.spec.keys === 2 ? (be && be.keys1 && be.keys1[c.sitPose] ? Float32Array.from(be.keys1[c.sitPose][c.spec.table ? 2 : 0]) : (!be ? SIT.solveSitArms(S, B, outlines[B.name], c, s, null, 1).q : null)) : null;
    for (const [tag, ovr] of [['before', null], ['after', sol && sol.q], ...(q1 ? [['after1', q1]] : [])]) {
      let worst = { torso: -1, thigh: -1, table: null, where: null };
      const cc = tag === 'before' && c1 ? c1 : c, DD = tag === 'before' && c1 ? r1.data : S.clipData, kk = tag === 'before' && c1 ? c1.kBody[B.index] : k;
      for (const f of [0, 25, 50, 75]) {
        const { Sm, P } = poseMats(B, DD, cc, f, kk, ovr);
        const X = skin(M, Sm);
        const mt = metrics(M, X, P, c, s, sk.skip, tag === 'after1' ? 1 : 0);
        if (mt.legs != null) worst.legs = Math.max(worst.legs ?? -1, mt.legs);
        if (mt.torso > worst.torso) { worst.torso = mt.torso; worst.where = mt.where; worst.at = { f, ...mt.worstAt }; }
        worst.thigh = Math.max(worst.thigh, mt.thigh);
        if (mt.table) worst.table = mt.table.map((v, i) => (worst.table && worst.table[i] != null && Math.abs(worst.table[i]) > Math.abs(v ?? 0) ? worst.table[i] : v));
        if (tag === 'after' && f === 0 && opt('sheet') && (!onlyB || onlyB.has(B.name))) sheet.push({ B: B.name, c: c.name, X, M });
      }
      res[tag] = worst;
    }
    res.solve = sol ? sol.info : null;
    rows.push(res);
  }
}
// ---- report
const cm = (v) => (v == null ? '   -  ' : (v * 100).toFixed(1).padStart(6));
const byPose = new Map();
for (const x of rows) { if (!byPose.has(x.pose)) byPose.set(x.pose, []); byPose.get(x.pose).push(x); }
console.log(`\nworst per body over frames 0/25/50/75, cm (torso / thigh: > 0 = vertices inside by that much; table: forearm underside minus top, world)`);
for (const [p, xs] of byPose) {
  console.log(`\n== ${p}`);
  console.log('body'.padEnd(30) + ' torso before  after | thigh before  after | table after (L R) | armpit baseline (verts, worst)');
  for (const x of xs) console.log(`${x.body.padEnd(30)} ${cm(x.before.torso)} ${x.before.where || ' '} ${cm(x.after.torso)} ${x.after.where || ' '} | ${cm(x.before.thigh)} ${cm(x.after.thigh)} | ${x.after.table ? x.after.table.map(cm).join(' ') : '             '} | ${String(x.armpit.n).padStart(4)} ${cm(x.armpit.worst)}`);
  const ad = xs.filter((x) => x.age === 'adult');
  const mx = (k, t) => Math.max(...ad.map((x) => x[t][k]));
  const over = (t) => ad.filter((x) => x[t].torso > 0.01).length;
  const tb = ad.flatMap((x) => (x.after.table || []).filter((v) => v != null));
  const k1 = ad.filter((x) => x.after1), tb1 = k1.flatMap((x) => (x.after1.table || []).filter((v) => v != null)), lg = ad.filter((x) => x.after.legs != null);
  console.log(`-- ${p} adults ${ad.length}: torso worst before ${cm(mx('torso', 'before'))} after ${cm(mx('torso', 'after'))}; bodies over 1 cm before ${over('before')} after ${over('after')}; thigh worst after ${cm(mx('thigh', 'after'))}` + (tb.length ? `; table gap after ${cm(Math.min(...tb))}..${cm(Math.max(...tb))}` : '') + (k1.length ? `; KEY 1 torso worst ${cm(Math.max(...k1.map((x) => x.after1.torso)))}, over 1 cm ${k1.filter((x) => x.after1.torso > 0.01).length}, thigh worst ${cm(Math.max(...k1.map((x) => x.after1.thigh)))}` + (tb1.length ? `, table gap ${cm(Math.min(...tb1))}..${cm(Math.max(...tb1))}` : '') : '') + (lg.length ? `; crossed thighs worst ${cm(Math.max(...lg.map((x) => x.after.legs)))}` : ''));
}
// SIT32 crossed knee against the park's tables (city/bryantParkKit.js tableGeo31), each adult fitted to a 0.452 m seat: the
// least clearance of the crossed thigh's top (its hip-knee joint line, frame 0, + 6.5 cm) under the top (underside 0.7025 m)
// or in the apron (round: 0.29 m from the centre, its bottom 0.655 m, the chairs 0.62 m out; square: 0.31-0.35 m, bottom
// 0.645 m, chairs 0.64 m); < 0 = into the table
{
  const cx = r.clips.find((c) => c.spec && c.spec.cross);
  const TT = { round: { under: (x, z) => Math.hypot(x, z - 0.62) < 0.3, apron: (x, z) => Math.abs(Math.hypot(x, z - 0.62) - 0.29) < 0.02, bottom: 0.655 },
    square: { under: (x, z) => Math.abs(x) < 0.35 && Math.abs(z - 0.64) < 0.35, apron: (x, z) => { const d = Math.max(Math.abs(x), Math.abs(z - 0.64)); return d > 0.31 && d < 0.35; }, bottom: 0.645 } };
  const kn = [];
  if (cx) for (const B of bodies) {
    const Vb = variants.find((v) => v.body === B.name);
    if (!outlines[B.name] || (Vb && Vb.age === 'child')) continue;
    const P = poseMats(B, S.clipData, cx, 0, cx.kBody[B.index], null).P, a = P[G.thigh[0]], b = P[G.thigh[1]];
    const hm = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], k = 0.452 / (hm[1] - 0.085);
    const rel = (p) => [(p[0] - hm[0]) * k, p[1] * k, (p[2] - hm[2]) * k], H = rel(b), K = rel(P[G.knee[1]]);
    const o = { top: K[1] + 0.05, side: K[0], fwd: K[2] };
    for (const [tn, T] of Object.entries(TT)) {
      let w = 1;
      for (let t = 0.2; t <= 1.0001; t += 0.05) {
        const x = H[0] + (K[0] - H[0]) * t, y = H[1] + (K[1] - H[1]) * t + 0.065, z = H[2] + (K[2] - H[2]) * t;
        if (T.apron(x, z)) w = Math.min(w, T.bottom - y); else if (T.under(x, z)) w = Math.min(w, 0.7025 - y);
      }
      o[tn] = w;
    }
    kn.push(o);
  }
  if (kn.length) {
    const rg = (f) => { const v = kn.map(f).sort((p, q) => p - q); return `${v[0].toFixed(3)}..${v[v.length - 1].toFixed(3)} (median ${v[v.length >> 1].toFixed(3)})`; };
    console.log(`-- crossed knee (${cx.name}, ${kn.length} adults at a 0.452 m seat, m): top ${rg((x) => x.top)}, side ${rg((x) => x.side)}, fwd ${rg((x) => x.fwd)}; into the round park table ${kn.filter((x) => x.round < 0).length}, the square one ${kn.filter((x) => x.square < 0).length} (least clearance ${rg((x) => Math.min(x.round, x.square))})`);
  }
}
if (args.includes('--why')) for (const x of rows) { const Bx = bodies.find((b) => b.name === x.body), cx = r.clips.find((q) => q.name === x.pose); const tf = SIT.sitTorsoProbe(S, Bx, outlines[x.body], cx); const pp = x.after.at && x.after.at.p; console.log('why', x.pose, x.body, 'after', (x.after.torso * 100).toFixed(1), 'solver pen', x.solve ? (x.solve.pen * 100).toFixed(1) : '-', 'solver model at that vertex (f0)', pp ? (tf.pen(pp, 0) * 100).toFixed(1) : '-', JSON.stringify(x.after.at)); }
console.log(`\nsolves: ${nSolve}, mean ${(solveMs / Math.max(1, nSolve)).toFixed(2)} ms; checks ${((performance.now() - tS) / 1000).toFixed(1)} s`);
if (opt('json')) fs.writeFileSync(opt('json'), JSON.stringify(rows, null, 1));
if (opt('sheet') && sheet.length) {
  const cols = Math.min(8, sheet.length), rowsN = Math.ceil(sheet.length / cols), CW = 260, CH = 300;
  const img = { px: new Float32Array(cols * CW * rowsN * CH * 3).fill(235), zb: new Float32Array(cols * CW * rowsN * CH).fill(-1e9) };
  sheet.forEach((e, i) => {
    const cx = (i % cols) * CW, cy = Math.floor(i / cols) * CH;
    // each cell: its own z-buffer region; 3/4 front view from the walker's front-left
    raster(img, cols * CW, rowsN * CH, cx + CW * 0.5, cy + CH - 12, e.X, e.M, 190, -0.6);
  });
  const buf = Buffer.alloc(cols * CW * rowsN * CH * 3);
  for (let i = 0; i < buf.length; i++) buf[i] = Math.max(0, Math.min(255, img.px[i]));
  await sharp(buf, { raw: { width: cols * CW, height: rowsN * CH, channels: 3 } }).png().toFile(opt('sheet'));
  console.log('sheet', opt('sheet'), sheet.map((e) => e.B + ':' + e.c).join(' '));
}
