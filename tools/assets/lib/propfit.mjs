// Fit canonical props (build_props.mjs) onto a walker body in its BIND pose, rigidly skinned to one bone, so the crowd's
// GPU skinning carries them (a prop vertex in bind space moves with that bone's skinning matrix like any body vertex).
// Frames come from the body's own joints (inverse-bind matrices) and mesh (the back surface, the hip width), so kids,
// heavy builds and every proportion get their own fit.
import fs from 'node:fs';
import sharp from 'sharp';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { mul, invert, applyPoint, applyDir, rotAxis, fromBasis } from './mat4.mjs';
import { PROPS, PROP_OUT } from '../build_props.mjs';

// the prop FITS a walker can carry (bit i of the runtime prop mask = FITS[i]); `layer` is filled in by build_peds
export const FITS = [
  { id: 0, prop: 'backpack_herschel', fit: 'back' },
  { id: 1, prop: 'backpack_kanken', fit: 'back', recolor: [0.028, 0.032, 0.045] },   // the scan is red chinoiserie: NYC dark navy
  { id: 2, prop: 'shoulderbag_leather', fit: 'side', side: 'R' },
  { id: 3, prop: 'messenger_feuerwear', fit: 'side', side: 'L' },
  { id: 4, prop: 'handbag_leather', fit: 'hand', side: 'R' },
  { id: 5, prop: 'phone', fit: 'phone', side: 'R' },   // the 100STYLE OnPhoneRight clips hold the RIGHT hand at the ear
  { id: 6, prop: 'phone', fit: 'phone', side: 'L' },
];
const LOD_TRIS = [1, 0.3, 0.09];   // share of the canonical prop's triangles per body LOD

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a, k) => a.map((x) => x * k);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// canonical prop geometry at three LODs + its texture images
export async function loadProps() {
  await MeshoptSimplifier.ready;
  const out = {};
  for (const name of new Set(FITS.map((f) => f.prop))) {
    const doc = await io.read(path.join(PROP_OUT, name + '.glb'));
    const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
    const pos = prim.getAttribute('POSITION').getArray(), nrm = prim.getAttribute('NORMAL').getArray(), uv = prim.getAttribute('TEXCOORD_0').getArray();
    const idx = Uint32Array.from(prim.getIndices().getArray());
    const lods = LOD_TRIS.map((r) => {
      if (r >= 1) return idx;
      // far LODs: hit the triangle target (a 0.05 error cap left LOD2 props at 3x their budget); silhouettes only at 26 m+
      // (UV seams split the scans' vertices, so the position-only simplifier sees borders everywhere: LOD2 goes sloppy)
      const tgt = Math.max(36, Math.floor((idx.length * r) / 3) * 3);
      const [ix] = r < 0.2 ? MeshoptSimplifier.simplifySloppy(idx, pos, 3, null, tgt, 1) : MeshoptSimplifier.simplify(idx, pos, 3, tgt, 1, []);
      return ix;
    });
    const m = prim.getMaterial();
    const img = (t) => (t ? Buffer.from(t.getImage()) : null);
    // strap colour: the UV of a texel near the texture's median luminance (the pack's own fabric), for generated straps
    let strapUV = [0.5, 0.5];
    if (m.getBaseColorTexture()) {
      const { data } = await sharp(img(m.getBaseColorTexture())).removeAlpha().resize(64, 64, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
      const L = []; for (let i = 0; i < 64 * 64; i++) L.push([0.2126 * data[i * 3] + 0.7152 * data[i * 3 + 1] + 0.0722 * data[i * 3 + 2], i]);
      const lit = L.filter(([l]) => l > 12).sort((a, b) => a[0] - b[0]);
      // a darker-than-median fabric texel: straps are usually the pack's darker webbing
      const pick = lit[Math.floor(lit.length * 0.35)] || L[0];
      strapUV = [((pick[1] % 64) + 0.5) / 64, (Math.floor(pick[1] / 64) + 0.5) / 64];
    }
    const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (let i = 0; i < pos.length; i += 3) for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], pos[i + c]); hi[c] = Math.max(hi[c], pos[i + c]); }
    out[name] = { pos, nrm, uv, lods, lo, hi, strapUV, images: { bc: img(m.getBaseColorTexture()), n: img(m.getNormalTexture()), mr: img(m.getMetallicRoughnessTexture()) }, credit: PROPS[name].credit };
  }
  return out;
}

// bind-space frames. B: build_peds body (ibm per canonical bone), boneIdx: name -> canonical index, verts: flat bind
// positions of the body's skin + cloth vertices (no hair)
export function fitProps(B, boneIdx, verts, props) {
  const G = (name) => { const b = boneIdx.get(name); return b == null ? null : invert(B.ibm.slice(b * 16, b * 16 + 16)); };
  const P = (name) => { const g = G(name); return g ? [g[12], g[13], g[14]] : null; };
  const need = ['crl_spine01__C', 'crl_neck__C', 'crl_hips__C', 'crl_arm__L', 'crl_arm__R', 'crl_hand__R', 'crl_handMiddle01__R', 'crl_handThumb01__R'];
  if (need.some((n) => !P(n))) return [];   // GEN3 kids: no fits yet
  const neck = P('crl_neck__C'), hips = P('crl_hips__C'), armL = P('crl_arm__L'), armR = P('crl_arm__R');
  const torso = neck[1] - hips[1];
  const sT = Math.min(1.12, Math.max(0.6, torso / 0.52));   // adult neck-to-hips ~0.52 m
  const yArm = (armL[1] + armR[1]) / 2;
  // back surface: the most posterior skin/cloth point on the centre line between the shoulder blades and the waist
  let zBack = 1e9, hipHalf = 0;
  for (let i = 0; i < verts.length; i += 3) {
    const x = verts[i], y = verts[i + 1], z = verts[i + 2];
    if (Math.abs(x) < 0.09 && y > yArm - 0.32 && y < yArm - 0.04) zBack = Math.min(zBack, z);
    if (y > hips[1] - 0.12 && y < hips[1] + 0.06) hipHalf = Math.max(hipHalf, Math.abs(x));
  }
  const fits = [];
  for (const F of FITS) {
    const pr = props[F.prop];
    const hgt = pr.hi[1] - pr.lo[1], dep = pr.hi[2] - pr.lo[2];
    let T, bone, bone2 = null, straps = null;
    if (F.fit === 'back') {
      // canonical +Z (outer face) -> body -Z; the panel centre on the back, the bag's top at the shoulders
      const s = sT, yc = yArm - 0.06 - (hgt * s) / 2;   // the pack's top at the shoulder blades, not the shoulder joint
      T = mul(mul([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, yc, zBack - 0.012, 1], rotAxis('y', Math.PI)), [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1]);
      bone = 'crl_spine01__C'; bone2 = 'crl_spine__C';   // top on the chest (straps), bottom against the lower back
      straps = strapPaths(verts, { yTop: yc + (hgt * s) / 2, yBot: yc - (hgt * s) / 2, zBack, armL, armR });
    } else if (F.fit === 'side') {
      // strap top on the shoulder, the bag hanging at the hip on the same side, tilted out over the hip and a little back
      const sgn = F.side === 'R' ? (armR[0] < 0 ? -1 : 1) : (armL[0] < 0 ? -1 : 1);
      const arm = F.side === 'R' ? armR : armL;
      const s = Math.min(1.05, Math.max(0.7, sT));
      const top = [arm[0] * 0.72, arm[1] + 0.065 * s, arm[2] - 0.015];
      const want = hipHalf + 0.015 + (dep * s) / 2;              // bag centre's lateral distance that clears the hip
      const drop = hgt * s * 0.72;                                // strap top -> bag centre
      const tilt = Math.atan2(Math.max(0, want - Math.abs(top[0])), drop);
      T = mul(mul(mul(mul([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, top[0], top[1], top[2], 1], rotAxis('z', sgn * tilt)), rotAxis('x', 0.1)), rotAxis('y', sgn * Math.PI / 2)), [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1]);
      bone = 'crl_spine01__C'; bone2 = 'crl_hips__C';    // strap on the chest, the bag riding on the hip
    } else if (F.fit === 'phone') {
      // a phone held to the ear: in the palm, long axis along the fingers, screen turned out of the palm (toward the
      // ear when the hand is up), its back against the palm ~2 cm in front of the hand bone
      const hn = F.side === 'R' ? 'R' : 'L';
      const pH = P('crl_hand__' + hn), pM = P('crl_handMiddle01__' + hn), pT = P('crl_handThumb01__' + hn);
      const A = norm(sub(pM, pH));
      let D = norm(cross(A, sub(pT, pH)));
      if (hn === 'L') D = scl(D, -1);
      D = norm(sub(D, scl(A, dot(D, A))));            // back of the hand
      const Z = scl(D, -1);                             // screen: out of the palm
      const X = norm(cross(A, Z));
      const sH = Math.min(1.1, Math.max(0.6, Math.hypot(...sub(pM, pH)) / 0.095));
      const piv = add(add(pH, scl(A, 0.06 * sH)), scl(Z, 0.022 * sH));
      T = fromBasis(X, A, Z, piv);
      bone = 'crl_hand__' + hn;
    } else {
      // held in the hand: +Y -> back up the arm (-A), +Z -> the back of the hand (lateral when the arm hangs), handle in the palm
      const hn = F.side === 'R' ? 'R' : 'L';
      const pH = P('crl_hand__' + hn), pM = P('crl_handMiddle01__' + hn), pT = P('crl_handThumb01__' + hn);
      const A = norm(sub(pM, pH));
      let D = norm(cross(A, sub(pT, pH)));
      if (hn === 'L') D = scl(D, -1);
      D = norm(sub(D, scl(A, dot(D, A))));
      const X = norm(cross(scl(A, -1), D));
      const sH = Math.min(1.1, Math.max(0.6, Math.hypot(...sub(pM, pH)) / 0.095));
      const s = Math.min(1, Math.max(0.6, B.height / 1.8));
      // handle in the fist (palm centre, ~7.5 cm down the hand), the bag hanging under it with only a slight bias to the
      // back of the hand (a full half-depth offset held the bag 15 cm clear of the leg)
      const piv = add(add(pH, scl(A, 0.075 * sH)), scl(D, dep * s * 0.12));
      T = mul(fromBasis(X, scl(A, -1), D, piv), [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1]);
      bone = 'crl_hand__' + hn;
    }
    fits.push({ ...F, T, bone: boneIdx.get(bone), bone2: bone2 ? boneIdx.get(bone2) : null, straps, strapUV: pr.strapUV });
  }
  return fits;
}

// BACKPACK STRAPS (a pack with no straps is invisible from the front, where real ones show two bands down the chest):
// per side a path from the pack's top edge, over the trapezius, down the chest to armpit height, under the arm and back
// to the pack's lower corner, each point lifted clear of this body's bind-pose surface. Returns [{ pts, nrm }] (bind space).
function strapPaths(verts, { yTop, yBot, zBack, armL, armR }) {
  // nearest-surface probes widen until they find vertices (a coarse jacket has 3-4 cm between vertices), and fall back
  // to a nominal adult torso if even a 10 cm window is empty — a missing hit once returned 1e9 and the quantisation box
  // that followed collapsed the whole body to a point
  const probe = (fx, fy, fz, pick, init, fallback) => {
    for (const r of [0.015, 0.03, 0.05, 0.1]) {
      let v = init, hit = false;
      for (let i = 0; i < verts.length; i += 3) if (fx(verts[i], r) && fy(verts[i + 1], r) && fz(verts[i + 2], r)) { v = pick(v, i); hit = true; }
      if (hit) return v;
    }
    return fallback;
  };
  const paths = [];
  for (const arm of [armL, armR]) {
    const sg = Math.sign(arm[0]) || 1, xs = sg * Math.min(0.115, Math.abs(arm[0]) * 0.65);
    // shoulder top at xs (trapezius), front surface at chest heights, side surface under the arm
    const topI = probe((x, r) => Math.abs(x - xs) < r, () => true, (z) => Math.abs(z) < 0.07, (v, i) => (v < 0 || verts[i + 1] > verts[v + 1] ? i : v), -1, -1);
    const yS = topI >= 0 ? verts[topI + 1] : arm[1] + 0.06, zS = topI >= 0 ? verts[topI + 2] : 0;
    const frontZ = (x, y) => probe((vx, r) => Math.abs(vx - x) < r, (vy, r) => Math.abs(vy - y) < r, (vz) => vz > -0.02, (v, i) => Math.max(v, verts[i + 2]), -1e9, 0.12);
    const backZ = (x, y) => probe((vx, r) => Math.abs(vx - x) < r, (vy, r) => Math.abs(vy - y) < r, (vz) => vz < 0.02, (v, i) => Math.min(v, verts[i + 2]), 1e9, zBack);
    const sideX = (y) => sg * probe((vx) => Math.sign(vx) === sg && Math.abs(vx) < Math.abs(arm[0]) * 0.95, (vy, r) => Math.abs(vy - y) < r, (vz) => Math.abs(vz) < 0.05, (v, i) => Math.max(v, Math.abs(verts[i])), 0, 0.16);
    const yA = Math.min(yS - 0.2, arm[1] - 0.14);
    const P = [
      [[sg * 0.075, yTop - 0.015, zBack - 0.015], [0, 0.3, -1]],
      [[xs, yS - 0.04, backZ(xs, yS - 0.04) - 0.007], [0, 0.8, -0.6]],
      [[xs, yS + 0.007, zS], [0, 1, 0]],
      [[xs * 1.02, yS - 0.07, frontZ(xs, yS - 0.07) + 0.007], [0, 0.4, 1]],
      [[xs * 1.08, yS - 0.15, frontZ(xs * 1.08, yS - 0.15) + 0.007], [0, 0, 1]],
      [[xs * 1.2, yA, frontZ(xs * 1.2, yA) + 0.006], [sg * 0.3, 0, 1]],
      [[sideX(yA - 0.03) + sg * 0.008, yA - 0.03, 0], [sg, 0, 0]],
      [[sg * 0.105, yBot + 0.07, zBack - 0.015], [sg * 0.4, 0, -1]],
    ];
    // a strap is only emitted when every point is finite and within reach of the torso
    const ok = P.every(([p]) => p.every(Number.isFinite) && Math.abs(p[0]) < 0.5 && Math.abs(p[2]) < 0.5 && p[1] > 0.3 && p[1] < 2.2);
    if (ok) paths.push({ pts: P.map((p) => p[0]), nrm: P.map((p) => norm(p[1])) });
  }
  return paths;
}
// a band (outer + inner face) along a strap path, Catmull-Rom sampled; returns flat arrays like propGeometry
function strapBand(path, uv, samples) {
  const cr = (p0, p1, p2, p3, t) => p1.map((_, k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t * t + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t * t * t));
  const lerp = (a, b, t) => a.map((v, k) => v + (b[k] - v) * t);
  const n = path.pts.length, S = [], NN = [];
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < samples; k++) {
    const t = k / samples;
    S.push(cr(path.pts[Math.max(0, i - 1)], path.pts[i], path.pts[i + 1], path.pts[Math.min(n - 1, i + 2)], t));
    NN.push(norm(lerp(path.nrm[i], path.nrm[i + 1], t)));
  }
  S.push(path.pts[n - 1]); NN.push(path.nrm[n - 1]);
  const P = [], N = [], U = [], I = [], half = 0.022, th = 0.003;
  for (let i = 0; i < S.length; i++) {
    const tg = norm(sub(S[Math.min(S.length - 1, i + 1)], S[Math.max(0, i - 1)]));
    const w = norm(cross(tg, NN[i]));
    for (const side of [1, -1]) {   // outer face (along n), inner face (3 mm in)
      const c = side > 0 ? S[i] : sub(S[i], scl(NN[i], th));
      P.push(...add(c, scl(w, half)), ...add(c, scl(w, -half)));
      const nn = scl(NN[i], side); N.push(...nn, ...nn);
      U.push(...uv, ...uv);
    }
  }
  for (let i = 0; i < S.length - 1; i++) {
    const a = i * 4, b = (i + 1) * 4;
    I.push(a, b, a + 1, a + 1, b, b + 1);             // outer
    I.push(a + 2, a + 3, b + 2, a + 3, b + 3, b + 2); // inner (reversed)
  }
  return { P, N, U, I };
}

// the fitted prop's LOD geometry in bind space
export function propGeometry(pr, fit, lod) {
  const ix = pr.lods[lod];
  const used = new Map(), P = [], N = [], U = [], I = [], Wt = [];
  for (let k = 0; k < ix.length; k++) {
    const v = ix[k];
    let o = used.get(v);
    if (o == null) {
      o = used.size; used.set(v, o);
      const p = applyPoint(fit.T, [pr.pos[v * 3], pr.pos[v * 3 + 1], pr.pos[v * 3 + 2]]);
      const n = norm(applyDir(fit.T, [pr.nrm[v * 3], pr.nrm[v * 3 + 1], pr.nrm[v * 3 + 2]]));
      P.push(...p); N.push(...n); U.push(pr.uv[v * 2], pr.uv[v * 2 + 1]);
    }
    I.push(o);
  }
  // two-bone props: the upper bone's weight rises with height across the prop (a rigid pack on the chest joint swung
  // 10 cm sideways on every stride)
  let y0 = 1e9, y1 = -1e9;
  for (let k = 1; k < P.length; k += 3) { y0 = Math.min(y0, P[k]); y1 = Math.max(y1, P[k]); }
  for (let k = 1; k < P.length; k += 3) {
    const t = Math.min(1, Math.max(0, ((P[k] - y0) / Math.max(1e-4, y1 - y0) - 0.15) / 0.7));
    Wt.push(fit.bone2 == null ? 1 : t * t * (3 - 2 * t));
  }
  if (fit.straps && lod < 2) for (const path of fit.straps) {
    const g = strapBand(path, fit.strapUV || [0.5, 0.5], lod === 0 ? 5 : 2);
    const base = P.length / 3;
    P.push(...g.P); N.push(...g.N); U.push(...g.U);
    for (const v of g.I) I.push(base + v);
    for (let k = 0; k < g.P.length / 3; k++) Wt.push(1);   // rigid on the chest bone
  }
  return { P, N, U, I, Wt };
}
