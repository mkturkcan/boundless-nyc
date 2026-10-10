// CP33 LANDSCAPE: the park's own planting kit for city/cpFlora.js (docs/notes/central-park-photoreal.md, LANDSCAPE).
// The owner, 2026-09-30 22:15: "This is meant to be a photorealistic simulator: update all details and objects so that
// nothing looks flat low poly". The teaser 4 v2 review: the Mall's elms "read as a grove of pale, smooth, dark-spotted
// aspens", the Ramble's floor and the Lake's shores are bare soil, there are no shrubs and no willows.
//   * THE AMERICAN ELM (Ulmus americana), the Mall's four rows: a vase that forks at 3-5 m into 3-5 ascending limbs
//     arching outward over the walk, pendulous twigs, 25-30 m tall, a 0.9-1.1 m trunk with root flares and braided
//     furrows modelled in the mesh (not only in the texture), dark grey-brown bark from a photogrammetric scan
//     (Poly Haven "Jolcham Oak Bark 01", CC0: fissured, with lichen and moss);
//   * understory shrubs (2-5 m, multi-stemmed), ferns, weeping willows at the Lake's edge;
//   * every one of them built by the city's own tree generator (city/treeGen.js: crown envelope, skeleton, leaf cards on
//     the TV25 leaf atlas, baked crown AO), drawn with the canopy's own material (the instancer's crownMat: wind, edge
//     fade, crown shading), and set per tile in a per-instance LOD set (full detail near the lens, light beyond, none
//     past the far range).
import * as THREE from 'three';
import { buildTree } from './treeGen.js';
import { cellUV25, LEAF_CELLS } from './treeAtlas.js';
import { applyLightTrim, applyCityAO, applySnowCap } from '../world/materials.js';

const STREET_CAL = [1.94, 1.70, 1.47];   // the street furniture's and the bark's light trim (trees.js mkBark)
const TEX = 'textures/cp33/landscape/';
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- the bark
// 1 x 2 m of bark per texture (the scan's own size), 1024 px a metre; ARM = AO, roughness, metalness
let _bark = null;
export function cpBarkMat() {
  if (_bark) return _bark;
  const L = new THREE.TextureLoader();
  const ld = (f, srgb) => {
    const t = L.load(TEX + f);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const arm = ld('elmbark_arm.jpg');
  const m = new THREE.MeshStandardMaterial({ map: ld('elmbark_col.jpg', true), normalMap: ld('elmbark_nrm.jpg'), roughnessMap: arm, aoMap: arm,
    aoMapIntensity: 0.85, roughness: 1.0, metalness: 0, vertexColors: true });
  m.normalScale.set(1.5, 1.5);
  m.name = 'cp33:bark';
  _bark = applyLightTrim(applyCityAO(applySnowCap(m)), STREET_CAL);
  return _bark;
}

// ---------------------------------------------------------------- the forms (treeGen.js form fields, furnitureKit.js TREE_FORMS)
// American elm: H x W 27 x 22 m at instance scale 1
const ELM = { arch: 'A', profile: 'vase', crownBase: 0.15, lump: 0.1, lopside: 0.05, trunkR: 0.0185, lean: 0.02, wiggle: 0.01,
  leader: 0.05, scaffolds: [3, 5], forkSpread: 0.16, scafAngle: [14, 34], scafReach: [0.9, 0.99], scafRad: 0.68,
  trop: [0, -0.014, -0.06], gnarl: [0.02, 0.07, 0.16], kids2: 1.9, kidStart2: 0.28, kidAngle2: [40, 72], kidReach2: [0.6, 0.98],
  kidLenMax2: 0.3, outBias2: 0.55, upBias2: -0.08, shootsPerM: 2.1, twigsPerM: 2.7, clump: [3, 6], shootLen: [0.75, 1.05],
  shootAngle: [40, 85], shootUp: -0.32, twigUp: -0.05, scafShoots: 0.4, cards0: 4400, cards1: 760, shell: 0.6, cell: [8],
  opacity: 0.5, roll: 60, barkTint: [1, 1, 1], barkSegs: [24, 14, 6], barkSecLen: [0.4, 0.55, 1.0], barkU: 1.0, minR2: 0.03 };
export const ELM_H = 27, ELM_W = 22;
// weeping willow (Salix babylonica): a short trunk, 3-5 limbs, the twigs hanging in a curtain to the bank; 14 x 15 m
const WILLOW = { arch: 'A', profile: 'broad', crownBase: 0.1, lump: 0.12, lopside: 0.1, trunkR: 0.03, lean: 0.07, wiggle: 0.03,
  leader: 0.1, scaffolds: [3, 5], forkSpread: 0.15, scafAngle: [28, 58], scafReach: [0.85, 0.98], scafRad: 0.62,
  trop: [0, -0.01, -0.22], gnarl: [0.03, 0.14, 0.12], kids2: 2.4, kidStart2: 0.2, kidAngle2: [55, 95], kidReach2: [0.7, 1.0],
  kidLenMax2: 0.42, outBias2: 0.5, upBias2: -0.35, shootsPerM: 2.6, twigsPerM: 3.0, clump: [3, 6], shootLen: [0.8, 1.2],
  shootAngle: [5, 25], shootUp: -1.2, twigUp: -0.6, scafShoots: 0.4, cards0: 3600, cards1: 620, shell: 0.55, cell: [5, 13],
  opacity: 0.42, roll: 15, barkTint: [1, 1, 1], barkSegs: [20, 12, 5], barkSecLen: [0.5, 0.7, 1.2], barkU: 1.0, minR2: 0.03 };
export const WILLOW_H = 14, WILLOW_W = 15;
// understory shrubs (spicebush, viburnum, witch hazel, young maples): multi-stemmed from a fork just over the ground; 3.2 x 3.4 m
const SHRUB = [
  { arch: 'A', profile: 'round', crownBase: 0.06, lump: 0.22, lopside: 0.14, trunkR: 0.012, lean: 0.08, wiggle: 0.03, leader: 0.05,
    scaffolds: [5, 8], forkSpread: 0.05, scafAngle: [18, 62], scafReach: [0.7, 0.98], scafRad: 0.75, trop: [0, 0.02, 0.0],
    gnarl: [0.05, 0.2, 0.3], kids2: 2.2, kidStart2: 0.15, kidAngle2: [30, 65], kidReach2: [0.5, 0.95], kidLenMax2: 0.45,
    outBias2: 0.4, upBias2: 0.1, shootsPerM: 3.0, twigsPerM: 3.4, clump: [3, 5], shootLen: [0.34, 0.5], shootAngle: [25, 70],
    shootUp: 0.1, scafShoots: 0.9, scafFrom: 0.15, cards0: 720, cards1: 120, shell: 0.5, cell: [4, 12], opacity: 0.55, roll: 60,
    barkTint: [0.55, 0.5, 0.45], barkSegs: [6, 5, 0], barkSecLen: [0.6, 0.6, 1], minR2: 0.03 },
  { arch: 'A', profile: 'spreading', crownBase: 0.05, lump: 0.25, lopside: 0.16, trunkR: 0.011, lean: 0.1, wiggle: 0.04, leader: 0.04,
    scaffolds: [6, 9], forkSpread: 0.04, scafAngle: [30, 72], scafReach: [0.7, 0.98], scafRad: 0.75, trop: [0, -0.02, -0.04],
    gnarl: [0.05, 0.22, 0.3], kids2: 2.0, kidStart2: 0.15, kidAngle2: [30, 70], kidReach2: [0.5, 0.95], kidLenMax2: 0.45,
    outBias2: 0.45, upBias2: 0.0, shootsPerM: 3.0, twigsPerM: 3.4, clump: [3, 5], shootLen: [0.32, 0.46], shootAngle: [30, 75],
    shootUp: 0.0, scafShoots: 0.9, scafFrom: 0.15, cards0: 700, cards1: 120, shell: 0.5, cell: [2, 6], opacity: 0.55, roll: 60,
    barkTint: [0.5, 0.46, 0.42], barkSegs: [6, 5, 0], barkSecLen: [0.6, 0.6, 1], minR2: 0.03 },
  { arch: 'A', profile: 'oval', crownBase: 0.08, lump: 0.2, lopside: 0.12, trunkR: 0.013, lean: 0.06, wiggle: 0.03, leader: 0.06,
    scaffolds: [4, 7], forkSpread: 0.06, scafAngle: [12, 45], scafReach: [0.75, 0.98], scafRad: 0.75, trop: [0, 0.03, 0.01],
    gnarl: [0.05, 0.18, 0.28], kids2: 2.2, kidStart2: 0.18, kidAngle2: [30, 60], kidReach2: [0.5, 0.95], kidLenMax2: 0.42,
    outBias2: 0.35, upBias2: 0.12, shootsPerM: 3.0, twigsPerM: 3.4, clump: [3, 5], shootLen: [0.34, 0.5], shootAngle: [25, 65],
    shootUp: 0.12, scafShoots: 0.9, scafFrom: 0.15, cards0: 720, cards1: 120, shell: 0.5, cell: [9, 0], opacity: 0.55, roll: 60,
    barkTint: [0.55, 0.5, 0.46], barkSegs: [6, 5, 0], barkSecLen: [0.6, 0.6, 1], minR2: 0.03 },
];
export const SHRUB_H = 3.2, SHRUB_W = 3.4;
// ferns (hay-scented, Christmas, cinnamon fern): a rosette of arching fronds, no wood; 0.8 x 1.3 m
const FERN = { arch: 'A', profile: 'spreading', crownBase: 0.0, lump: 0.15, lopside: 0.1, trunkR: 0.004, lean: 0, wiggle: 0,
  leader: 0.02, scaffolds: [8, 12], forkSpread: 0.02, scafAngle: [42, 74], scafReach: [0.85, 1.0], scafRad: 0.5,
  trop: [0, -0.3, -0.3], gnarl: [0, 0.06, 0.06], kids2: 0.2, kidAngle2: [20, 40], kidReach2: [0.4, 0.8], kidLenMax2: 0.2,
  shootsPerM: 7, twigsPerM: 0.01, clump: [1, 2], shootLen: [0.2, 0.3], shootAngle: [4, 18], shootUp: -0.05, scafShoots: 1.0,
  scafFrom: 0.2, cards0: 110, cards1: 26, shell: 0.3, cell: [1], opacity: 0.62, roll: 12, barkSegs: [0, 0, 0] };
export const FERN_H = 0.8, FERN_W = 1.3;
// ground cover (wild ginger = the linden cell's hearts, mayapple = the plane's palmate leaves, ivy and vinca = the pear's glossy ovals): a
// low flat mound of broad leaf cards, 0.4 x 1.1 m (CP33 LANDSCAPE: the woodland floor's green cover)
const GCOVER = (cell, seed) => ({ ...FERN, scaffolds: [9, 13], scafAngle: [58, 84], scafReach: [0.8, 1.0], scafRad: 0.62, trop: [0, -0.12, -0.12],
  shootsPerM: 6, shootLen: [0.14, 0.24], shootAngle: [2, 14], scafFrom: 0.1, cards0: 84, cards1: 22, cell: [cell], opacity: 0.7, roll: 22, seed });
export const GC_H = 0.4, GC_W = 1.1;

// ---------------------------------------------------------------- the trunk, modelled
// treeGen's trunk is the first tube of the bark mesh: 10 rings (a fork form's trunk has 9 sections) of seg0 + 1 vertices.
// It is re-made here from those rings' centres and radii: a smooth spline, 96 sides, a ring every 8 cm, sunk 0.3 m into
// the ground; 5-7 root flares spreading into the soil; braided furrows 2-3.5 cm deep between flat-topped ridges
// ~16 cm apart (the elm's interlacing diamond pattern), darker in the furrows and at the foot.
function remeshTrunk(g, seg0, seed, o = {}) {
  const P = g.getAttribute('position'), C = g.getAttribute('color'), I = g.index.array;
  const RW = seg0 + 1;
  // the trunk's ring count (its sections: min(9, length / section length)): the first index of the next tube is its base
  let NR = 0;
  for (let k = 2; k <= 12; k++) if (I.length > (k - 1) * seg0 * 6 && I[(k - 1) * seg0 * 6] === k * RW) { NR = k; break; }
  if (!NR || P.count < NR * RW + 1) return g;
  const cen = [], rad = [], ao = [];
  for (let i = 0; i < NR; i++) {
    let x = 0, y = 0, z = 0;
    for (let j = 0; j < seg0; j++) { const k = i * RW + j; x += P.getX(k); y += P.getY(k); z += P.getZ(k); }
    x /= seg0; y /= seg0; z /= seg0;
    let r = 0;
    for (let j = 0; j < seg0; j++) { const k = i * RW + j; r += Math.hypot(P.getX(k) - x, P.getY(k) - y, P.getZ(k) - z); }
    cen.push([x, y, z]); rad.push(r / seg0); ao.push(C ? C.getY(i * RW) : 1);
  }
  // the sanity of the assumption: the rings climb, the radius is a trunk's
  for (let i = 1; i < NR; i++) if (!(cen[i][1] > cen[i - 1][1]) || !(rad[i] > 0.02)) return g;
  const yTop = cen[NR - 1][1];
  const at = (y) => {   // centre, radius, AO at height y (Catmull-Rom through the ring centres, linear radius)
    const f = clamp(((y - cen[0][1]) / (yTop - cen[0][1])) * (NR - 1), 0, NR - 1.0001), i = Math.floor(f), t = f - i;
    const p0 = cen[Math.max(0, i - 1)], p1 = cen[i], p2 = cen[i + 1], p3 = cen[Math.min(NR - 1, i + 2)];
    const cr = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
    return [[cr(p0[0], p1[0], p2[0], p3[0]), y, cr(p0[2], p1[2], p2[2], p3[2])], rad[i] + (rad[i + 1] - rad[i]) * t, ao[i] + (ao[i + 1] - ao[i]) * t];
  };
  const SEG = o.seg || 96, DY = o.dy || 0.08, Y0 = -0.3;
  const nR = Math.max(4, Math.ceil((yTop - Y0) / DY));
  const r0 = rad[1];
  const uRep = Math.max(1, Math.round((2 * Math.PI * r0) / 1.0));
  const rnd = (k) => { const s = Math.sin(k * 127.1 + seed * 311.7) * 43758.5453; return s - Math.floor(s); };
  const nFl = 5 + Math.floor(rnd(1) * 3), flPh = rnd(2) * 6.283, flA = [];
  for (let k = 0; k < nFl; k++) flA.push(flPh + (k / nFl) * 6.283 + (rnd(10 + k) - 0.5) * 0.6);
  const lam = o.lam || 0.16, depth = o.depth || 0.03;
  const pos = new Float32Array((nR + 1) * (SEG + 1) * 3), uv = new Float32Array((nR + 1) * (SEG + 1) * 2), col = new Float32Array((nR + 1) * (SEG + 1) * 3);
  let vAcc = 0, prev = null;
  for (let i = 0; i <= nR; i++) {
    const y = Y0 + (i / nR) * (yTop - Y0);
    const [c, rr, a0] = at(Math.max(cen[0][1], y));
    if (prev) vAcc += Math.hypot(c[0] - prev[0], y - prev[1], c[2] - prev[2]);
    prev = [c[0], y, c[2]];
    const base = rr * (1 + 0.3 * Math.pow(clamp(1 - (y + 0.1) / 1.2, 0, 1), 2));   // the foot's swell
    for (let j = 0; j <= SEG; j++) {
      const a = (j / SEG) * Math.PI * 2;
      // root flares: a ridge per root, rising out of the ground and dying away by 1.4-1.8 m
      let fl = 0;
      for (const q of flA) { const d = Math.cos(a - q); fl += Math.pow(Math.max(0, d), 10); }
      const fh = Math.pow(clamp(1 - (y + 0.3) / 1.7, 0, 1), 2.2);
      // braided furrows: ridges along the trunk that wander and cross (two phase fields), deeper low down
      const u = a * r0;
      const ph = 1.1 * Math.sin((y / 1.3) * 6.283 + u * 2.2 + seed) + 0.6 * Math.sin((y / 0.47) * 6.283 - u * 3.7);
      const s = 0.5 + 0.5 * Math.cos((u / lam) * 6.283 + ph);
      const furrow = Math.pow(s, 5);
      const r = base * (1 + 0.62 * fl * fh) - depth * furrow * (0.75 + 0.5 * fh) * Math.min(1, rr / 0.25);
      const k = i * (SEG + 1) + j;
      pos[k * 3] = c[0] + Math.cos(a) * r; pos[k * 3 + 1] = y; pos[k * 3 + 2] = c[2] + Math.sin(a) * r;
      uv[k * 2] = (j / SEG) * uRep; uv[k * 2 + 1] = vAcc / 2.0 + (y < 0 ? y / 2.0 : 0);
      const dk = (1 - 0.42 * furrow) * (0.62 + 0.38 * smooth(-0.1, 0.9, y)) * a0;
      col[k * 3] = dk; col[k * 3 + 1] = dk; col[k * 3 + 2] = dk;
    }
  }
  const idx = [];
  for (let i = 0; i < nR; i++) for (let j = 0; j < SEG; j++) {
    const a = i * (SEG + 1) + j, b = a + 1, c = a + SEG + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const T = new THREE.BufferGeometry();
  T.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  T.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  T.setAttribute('color', new THREE.BufferAttribute(col, 3));
  T.setIndex(idx);
  T.computeVertexNormals();
  {   // the seam's two columns share one normal
    const N = T.getAttribute('normal');
    for (let i = 0; i <= nR; i++) {
      const a = i * (SEG + 1), b = a + SEG;
      const nx = N.getX(a) + N.getX(b), ny = N.getY(a) + N.getY(b), nz = N.getZ(a) + N.getZ(b), l = Math.hypot(nx, ny, nz) || 1;
      N.setXYZ(a, nx / l, ny / l, nz / l); N.setXYZ(b, nx / l, ny / l, nz / l);
    }
  }
  // the rest of the bark (the limbs, the secondaries) as it was, after the trunk's block
  const v0 = NR * RW, i0 = (NR - 1) * seg0 * 6;
  const rest = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv', 'color']) {
    const A = g.getAttribute(name);
    if (!A) continue;
    rest.setAttribute(name, new THREE.BufferAttribute(A.array.slice(v0 * A.itemSize), A.itemSize));
  }
  const ri = new Uint32Array(I.length - i0);
  for (let k = i0; k < I.length; k++) ri[k - i0] = I[k] - v0;
  rest.setIndex(new THREE.BufferAttribute(ri, 1));
  // the limbs' v runs 1 m a repeat: the scan is 2 m tall
  { const U = rest.getAttribute('uv'); for (let k = 0; k < U.count; k++) U.setY(k, U.getY(k) * 0.5); }
  const out = mergeIndexed([T, rest]);
  out.computeBoundingSphere(); out.computeBoundingBox();
  return out;
}
function mergeIndexed(list) {
  let nv = 0, ni = 0;
  for (const g of list) { nv += g.getAttribute('position').count; ni += g.index.count; }
  const out = new THREE.BufferGeometry();
  for (const [name, sz] of [['position', 3], ['normal', 3], ['uv', 2], ['color', 3]]) {
    const A = new Float32Array(nv * sz);
    let o = 0;
    for (const g of list) { const a = g.getAttribute(name); if (a) A.set(a.array.subarray(0, a.count * sz), o); o += g.getAttribute('position').count * sz; }
    out.setAttribute(name, new THREE.BufferAttribute(A, sz));
  }
  const I = new Uint32Array(ni);
  let oi = 0, ov = 0;
  for (const g of list) { const a = g.index.array; for (let k = 0; k < g.index.count; k++) I[oi + k] = a[k] + ov; oi += g.index.count; ov += g.getAttribute('position').count; }
  out.setIndex(new THREE.BufferAttribute(I, 1));
  return out;
}

// ---------------------------------------------------------------- building the forms (cached; a few hundred ms in all)
const OPTS = { cellUV: cellUV25, barkCell: LEAF_CELLS.bark };
const _forms = new Map();
function form(key, make) { let f = _forms.get(key); if (!f) _forms.set(key, (f = make())); return f; }
const stats = (r) => ({ trunk: r.trunk ? r.trunk.index.count / 3 : 0, leaves0: r.leaves0.index.count / 3, leaves1: r.leaves1.index.count / 3 });
export function elmForms() {
  return form('elm', () => [5101, 5309].map((seed) => {
    const r = buildTree(ELM, ELM_H, ELM_W, seed, OPTS);
    const o = { trunk: remeshTrunk(r.trunk0, ELM.barkSegs[0], seed), trunkMid: remeshTrunk(r.trunk0, ELM.barkSegs[0], seed, { seg: 20, dy: 0.5, depth: 0.0005 }), leaves0: r.leaves0, leaves1: r.leaves1 };
    o.stats = stats(o);
    return o;
  }));
}
export function willowForms() {
  return form('willow', () => [6203].map((seed) => {
    const r = buildTree(WILLOW, WILLOW_H, WILLOW_W, seed, OPTS);
    const o = { trunk: remeshTrunk(r.trunk0, WILLOW.barkSegs[0], seed, { lam: 0.13, depth: 0.035, seg: 80 }), trunkMid: remeshTrunk(r.trunk0, WILLOW.barkSegs[0], seed, { seg: 20, dy: 0.5, depth: 0.0005 }), leaves0: r.leaves0, leaves1: r.leaves1 };
    o.stats = stats(o);
    return o;
  }));
}
export function shrubForms() {
  return form('shrub', () => SHRUB.map((F, k) => {
    const r = buildTree(F, SHRUB_H, SHRUB_W, 7001 + k * 97, OPTS);
    const o = { trunk: r.trunk0.index.count ? r.trunk0 : null, leaves0: r.leaves0, leaves1: r.leaves1 };
    if (o.trunk) { const U = o.trunk.getAttribute('uv'); for (let i = 0; i < U.count; i++) U.setY(i, U.getY(i) * 0.5); }
    o.stats = stats(o);
    return o;
  }));
}
export function groundForms() {
  return form('gcover', () => [[2, 9101], [3, 9203], [6, 9307]].map(([cell, seed]) => {
    const r = buildTree(GCOVER(cell, seed), GC_H, GC_W, seed, OPTS);
    const o = { trunk: null, leaves0: r.leaves0, leaves1: r.leaves1 };
    o.stats = stats(o);
    return o;
  }));
}
export function fernForms() {
  return form('fern', () => [8101, 8263].map((seed) => {
    const r = buildTree(FERN, FERN_H, FERN_W, seed, OPTS);
    const o = { trunk: null, leaves0: r.leaves0, leaves1: r.leaves1 };
    o.stats = stats(o);
    return o;
  }));
}

// FP37 (core/engine.js, the film policy): while recording, main.js publishes the take's path (window.__FP37: pts x, y, z
// triples along the path, v its version); a LOD set bins each instance by its nearest approach to the path, once per take,
// so nothing switches form, appears or drops its shadow mid-take. null when not recording or `?fp37=0`.
export const filmPath = () => (typeof window !== 'undefined' && window.__FP37 && window.__FP37.pts ? window.__FP37 : null);
export function fpNear2(pts, x, z) {
  let d = Infinity;
  for (let j = 0; j < pts.length; j += 3) { const dx = x - pts[j], dz = z - pts[j + 2], q = dx * dx + dz * dz; if (q < d) d = q; }
  return d;
}

// ---------------------------------------------------------------- the per-instance LOD set
// list: [{ x, y, z, yaw, sx, sy, sz, c: [r, g, b] (linear multiplier) }]; parts: [{ near, mid (or null), mat, cast }].
// Instances within R1 of the lens draw `near`, within R2 `mid`, beyond nothing. Re-binned when the lens has moved 4 m
// (in the main pass: the shadow passes reuse the choice; a cube probe's faces are skipped).
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0);
export function lodSet(name, list, parts, R1, R2, meshes = null, onFrame = null) {
  const G = new THREE.Group();
  G.name = name;
  if (!list.length) return G;
  const n = list.length;
  const M = new Float32Array(n * 16), Cc = new Float32Array(n * 3);
  list.forEach((t, i) => {
    _m4.compose(_p.set(t.x, t.y, t.z), _q.setFromAxisAngle(_Y, t.yaw || 0), _s.set(t.sx ?? 1, t.sy ?? 1, t.sz ?? t.sx ?? 1));
    _m4.toArray(M, i * 16);
    const c = t.c || [1, 1, 1];
    Cc[i * 3] = c[0]; Cc[i * 3 + 1] = c[1]; Cc[i * 3 + 2] = c[2];
  });
  let bb = new THREE.Box3();
  for (const t of list) bb.expandByPoint(_p.set(t.x, t.y, t.z));
  const sphere = bb.getBoundingSphere(new THREE.Sphere());
  const mk = (geo, mat, cast, tag) => {
    const m = new THREE.InstancedMesh(geo, mat, n);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.instanceColor.setUsage(THREE.DynamicDrawUsage);
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    m.boundingSphere = sphere.clone(); m.boundingSphere.radius += geo.boundingSphere.radius * 1.6 + 4;
    m.count = 0; m.castShadow = cast; m.receiveShadow = true; m.name = name + ':' + tag;
    G.add(m);
    if (meshes) meshes.add(m);
    return m;
  };
  const P = parts.map((q, k) => ({ near: mk(q.near, q.mat, q.cast, 'near' + k), mid: q.mid ? mk(q.mid, q.mat, q.castMid ?? q.cast, 'mid' + k) : null }));
  let lx = 1e12, lz = 1e12, fpV = -1;
  const R1s = R1 * R1, R2s = R2 * R2;
  // dist(i): the squared distance that bins instance i (from the lens, or FP37's nearest approach of the take's path)
  const bins = new Int8Array(n).fill(-2);   // FP37 telemetry: each instance's last bin (0 near, 1 mid, -1 none, -2 never binned)
  const rebinD = (dist) => {
    let a = 0, b = 0, changed = 0;
    const E = typeof window !== 'undefined' ? window.__ENGINE : null;
    for (let i = 0; i < n; i++) {
      const d = dist(i);
      const nb = d < R1s ? 0 : d < R2s ? 1 : -1;
      if (bins[i] !== -2 && bins[i] !== nb && E && E.inView && E.inView(list[i].x, list[i].y + 3, list[i].z, 8)) changed++;
      bins[i] = nb;
      if (d < R1s) {
        for (const q of P) { q.near.instanceMatrix.array.set(M.subarray(i * 16, i * 16 + 16), a * 16); q.near.instanceColor.array.set(Cc.subarray(i * 3, i * 3 + 3), a * 3); }
        a++;
      } else if (d < R2s) {
        for (const q of P) if (q.mid) { q.mid.instanceMatrix.array.set(M.subarray(i * 16, i * 16 + 16), b * 16); q.mid.instanceColor.array.set(Cc.subarray(i * 3, i * 3 + 3), b * 3); }
        b++;
      }
    }
    for (const q of P) {
      q.near.count = a; q.near.instanceMatrix.needsUpdate = true; q.near.instanceColor.needsUpdate = true;
      if (q.mid) { q.mid.count = b; q.mid.instanceMatrix.needsUpdate = true; q.mid.instanceColor.needsUpdate = true; }
    }
    if (changed && E && E.popEvents) E.popEvents.lod += changed;   // in-view form switches (the recorder's QA fails a take on them)
  };
  const rebin = (cx, cz) => rebinD((i) => { const dx = list[i].x - cx, dz = list[i].z - cz; return dx * dx + dz * dz; });
  const rebinPath = (pts) => rebinD((i) => fpNear2(pts, list[i].x, list[i].z));
  // the trigger: an always-drawn empty mesh (its material draws nothing; onBeforeRender runs in every main pass)
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
  const sm = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false });
  const trig = new THREE.Mesh(sg, sm);
  trig.frustumCulled = false; trig.name = name + ':lod'; trig.renderOrder = -1000;
  trig.onBeforeRender = (r, s, cam) => {
    if (onFrame) onFrame();
    if (!cam.isPerspectiveCamera || (cam.parent && cam.parent.isCubeCamera)) return;
    // FP37 (core/engine.js): while recording, each instance holds the form its nearest approach to the take's path needs
    const fp = filmPath();
    if (fp) { if (fp.v !== fpV) { fpV = fp.v; lx = 1e12; rebinPath(fp.pts); } return; }
    fpV = -1;
    const cx = cam.position.x, cz = cam.position.z;
    if ((cx - lx) * (cx - lx) + (cz - lz) * (cz - lz) < 16) return;
    lx = cx; lz = cz;
    rebin(cx, cz);
  };
  G.add(trig);
  return G;
}

// ---------------------------------------------------------------- the lawn's grass (the Sheep Meadow at 1.5-4.6 m)
// The review of teaser 4 v2: "the Sheep Meadow from 1.5-4.6 m is a flat noise carpet: instanced 3D grass blades and clumps
// within ~30 m of the lens, fading into the texture". A clump is 12 curved, tapered, twisted blades (4 segments, 84
// triangles) on a 0.17 m disc, 9-19 cm tall (the meadow is mown, with tufts); past ~10 m the same clump is 6 blades of 2
// segments (18 triangles). The clumps are laid on 1.1 m cells over the open lawn (cpFlora.js decides which cells are lawn),
// four a cell near the lens and one beyond, evaluated a 32 m chunk at a time as the lens comes within range, and drawn as
// two instanced meshes per tile re-binned when the lens has moved 2.5 m. The blades shrink to nothing between 22 and 33 m
// in the vertex shader, so the lawn's own texture takes over without a line. The normals lean up (the lawn's own shading),
// both faces lit alike. `?cp33g=0` leaves the lawn as it was.
const mulberry = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const GR_COL = { base: [0.085, 0.165, 0.04], tip: [0.21, 0.33, 0.075] };
function clumpGeo(o) {
  const rnd = mulberry(o.seed);
  const pos = [], nor = [], col = [], idx = [];
  for (let b = 0; b < o.blades; b++) {
    const ra = o.spread * Math.sqrt(rnd()), aa = rnd() * 6.2832;
    const bx = Math.cos(aa) * ra, bz = Math.sin(aa) * ra;
    const ph = aa + (rnd() - 0.5) * 1.8;
    const h = o.hMin + (o.hMax - o.hMin) * Math.pow(rnd(), 1.4);
    const bend = 0.25 + 0.8 * rnd();
    const w = o.w0 * (0.75 + 0.5 * rnd());
    const tw = (rnd() - 0.5) * 1.4;
    const shade = 0.82 + 0.36 * rnd();
    const cx = Math.cos(ph), cz = Math.sin(ph);
    const f = (s) => [bx + cx * bend * h * s * s, h * (s - 0.25 * bend * s * s), bz + cz * bend * h * s * s];
    const v0 = pos.length / 3;
    for (let k = 0; k <= o.rows; k++) {
      const s = k / o.rows;
      const P = f(s), A = f(Math.max(0, s - 0.05)), B = f(Math.min(1, s + 0.05));
      let tx = B[0] - A[0], ty = B[1] - A[1], tz = B[2] - A[2];
      const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      const psi = tw * s;
      let wx = -cz * Math.cos(psi), wy = Math.sin(psi) * 0.55, wz = cx * Math.cos(psi);
      const wl = Math.hypot(wx, wy, wz) || 1; wx /= wl; wy /= wl; wz /= wl;
      let nx = ty * wz - tz * wy, ny = tz * wx - tx * wz, nz = tx * wy - ty * wx;
      if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
      let mx = nx * 0.5, my = ny * 0.5 + 0.85, mz = nz * 0.5;
      const ml = Math.hypot(mx, my, mz) || 1; mx /= ml; my /= ml; mz /= ml;
      const t01 = Math.pow(s, 0.85);
      const c = [0, 1, 2].map((i) => (GR_COL.base[i] + (GR_COL.tip[i] - GR_COL.base[i]) * t01) * shade);
      if (k < o.rows) {
        const hw = 0.5 * w * (1 - 0.88 * Math.pow(s, 1.8));
        pos.push(P[0] - wx * hw, P[1] - wy * hw, P[2] - wz * hw, P[0] + wx * hw, P[1] + wy * hw, P[2] + wz * hw);
        nor.push(mx, my, mz, mx, my, mz); col.push(...c, ...c);
      } else { pos.push(P[0], P[1], P[2]); nor.push(mx, my, mz); col.push(...c); }
    }
    for (let k = 0; k < o.rows - 1; k++) { const a = v0 + 2 * k; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const a = v0 + 2 * (o.rows - 1);
    idx.push(a, a + 1, v0 + 2 * o.rows);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}
let _gGeo = null, _gMat = null;
export function grassGeos() {
  if (_gGeo) return _gGeo;
  return (_gGeo = {
    near: clumpGeo({ blades: 12, rows: 4, spread: 0.17, hMin: 0.09, hMax: 0.19, w0: 0.010, seed: 4177 }),
    far: clumpGeo({ blades: 6, rows: 2, spread: 0.2, hMin: 0.1, hMax: 0.2, w0: 0.02, seed: 9311 }),
  });
}
const GFADE0 = 22, GFADE1 = 33;
export function grassMat() {
  if (_gMat) return _gMat;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, side: THREE.DoubleSide });
  m.name = 'cp33:grass';
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        vec4 gP = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          gP = instanceMatrix * gP;
        #endif
        gP = modelMatrix * gP;
        transformed *= 1.0 - smoothstep(${GFADE0.toFixed(1)}, ${GFADE1.toFixed(1)}, length(gP.xz - cameraPosition.xz));
      }`);
    // a blade is lit alike on both faces (the normals lean up: the lawn's own shading)
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
      #ifdef DOUBLE_SIDED
        normal *= faceDirection;
      #endif`);
  };
  m.customProgramCacheKey = () => 'cp33grass1';
  _gMat = applyLightTrim(applyCityAO(applySnowCap(m)), 1.0);
  return _gMat;
}
const GCH = 32, GCELL = 1.1, GN = Math.ceil(GCH / GCELL), GR_NEAR = 14, GR_FAR = 35, NEAR_CAP = 5200, FAR_CAP = 3200;
const gh = (a, b, k) => { const s = Math.sin(a * 12.9898 + b * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s); };
// A grass field for one tile (its origin ox, oz): lawnY(x, z) answers the ground height where (x, z) is open lawn, else null.
// Returns a Group (add it to the tile's group); `meshes`, if given, collects its meshes for the part's A/B switch.
export function grassField(name, ox, oz, lawnY, meshes = null) {
  const G = new THREE.Group();
  G.name = name;
  const geos = grassGeos(), mat = grassMat();
  const chunks = new Map();     // key -> { f: Float32Array of records [x, y, z, yaw, scale, r, g, b, k, rNear], n } (null: nothing here)
  const todo = [];              // chunk keys waiting to be evaluated
  let near = null, far = null, dead = false, lx = 1e12, lz = 1e12, pend = false;
  const make = (geo, cap, tag) => {
    const m = new THREE.InstancedMesh(geo, mat, cap);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.instanceColor.setUsage(THREE.DynamicDrawUsage);
    m.count = 0; m.frustumCulled = false; m.castShadow = false; m.receiveShadow = true; m.name = name + ':' + tag;
    G.add(m);
    if (meshes) meshes.add(m);
    return m;
  };
  // the dry/lush mottling of a meadow: broad patches (tens of metres) and tufts (a few metres)
  const patch = (x, z) => 0.5 + 0.25 * Math.sin(x * 0.045 + Math.sin(z * 0.031) * 2.1) + 0.25 * Math.sin(z * 0.052 + Math.sin(x * 0.04) * 1.7);
  const evalChunk = (ci, cj) => {
    const x0 = ox + ci * GCH, z0 = oz + cj * GCH, rec = [];
    for (let i = 0; i < GN; i++) for (let j = 0; j < GN; j++) {
      const cx = x0 + (i + 0.5) * GCELL, cz = z0 + (j + 0.5) * GCELL;
      if (cx >= ox + 512 || cz >= oz + 512 || (i + 0.5) * GCELL >= GCH || (j + 0.5) * GCELL >= GCH) continue;
      const y = lawnY(cx, cz);
      if (y === null || y === undefined) continue;
      const pt = patch(cx, cz), tuft = gh(Math.floor(cx / 3), Math.floor(cz / 3), 5);
      // a cell's four clumps (the first is also the far set's); a rank-grass patch is taller and yellower
      for (let k = 0; k < 4; k++) {
        const x = x0 + (i + gh(cx, cz, k * 3 + 1)) * GCELL, z = z0 + (j + gh(cx, cz, k * 3 + 2)) * GCELL;
        const hs = gh(x, z, 17);
        if (k > 0 && hs > 0.55 + 0.45 * pt) continue;     // the lawn is thinner in places
        const tall = tuft > 0.86 && hs < 0.35;
        const s = (tall ? 1.7 + 0.8 * hs : 0.78 + 0.5 * gh(x, z, 19)) * (0.9 + 0.2 * pt);
        const dry = Math.max(0, (0.45 - pt) * 1.6) + (tall ? 0.25 : 0);
        const v = 0.82 + 0.34 * gh(x, z, 23);
        rec.push(x, y - 0.012, z, gh(x, z, 29) * 6.2832, s, v * (1 + 0.55 * dry), v * (1 + 0.04 * (pt - 0.5)), v * (1 - 0.55 * dry), k, k === 0 ? 8 + 5 * gh(x, z, 31) : 4 + 9.5 * gh(x, z, 37));
      }
    }
    chunks.set(ci * 4096 + cj, { f: Float32Array.from(rec), n: rec.length / 10 });
  };
  const rebin = (cx, cz) => {
    if (!near) { near = make(geos.near, NEAR_CAP, 'near'); far = make(geos.far, FAR_CAP, 'far'); }
    const nM = near.instanceMatrix.array, nC = near.instanceColor.array, fM = far.instanceMatrix.array, fC = far.instanceColor.array;
    let a = 0, b = 0;
    const R = GR_FAR + 2, i0 = Math.floor((cx - R - ox) / GCH), i1 = Math.floor((cx + R - ox) / GCH), j0 = Math.floor((cz - R - oz) / GCH), j1 = Math.floor((cz + R - oz) / GCH);
    for (let ci = i0; ci <= i1; ci++) for (let cj = j0; cj <= j1; cj++) {
      const C = chunks.get(ci * 4096 + cj);
      if (!C) continue;
      const f = C.f;
      for (let q = 0; q < C.n; q++) {
        const o = q * 10, dx = f[o] - cx, dz = f[o + 2] - cz, d2 = dx * dx + dz * dz;
        if (d2 > GR_FAR * GR_FAR) continue;
        const k = f[o + 8], rn = f[o + 9], s = f[o + 4], c = Math.cos(f[o + 3]), sn = Math.sin(f[o + 3]);
        if (d2 < rn * rn) {
          if (a >= NEAR_CAP) continue;
          const e = a * 16;
          nM[e] = c * s; nM[e + 1] = 0; nM[e + 2] = -sn * s; nM[e + 3] = 0; nM[e + 4] = 0; nM[e + 5] = s; nM[e + 6] = 0; nM[e + 7] = 0;
          nM[e + 8] = sn * s; nM[e + 9] = 0; nM[e + 10] = c * s; nM[e + 11] = 0; nM[e + 12] = f[o]; nM[e + 13] = f[o + 1]; nM[e + 14] = f[o + 2]; nM[e + 15] = 1;
          nC[a * 3] = f[o + 5]; nC[a * 3 + 1] = f[o + 6]; nC[a * 3 + 2] = f[o + 7];
          a++;
        } else if (k === 0) {
          if (b >= FAR_CAP) continue;
          const e = b * 16, s2 = s * 1.3;
          fM[e] = c * s2; fM[e + 1] = 0; fM[e + 2] = -sn * s2; fM[e + 3] = 0; fM[e + 4] = 0; fM[e + 5] = s2; fM[e + 6] = 0; fM[e + 7] = 0;
          fM[e + 8] = sn * s2; fM[e + 9] = 0; fM[e + 10] = c * s2; fM[e + 11] = 0; fM[e + 12] = f[o]; fM[e + 13] = f[o + 1]; fM[e + 14] = f[o + 2]; fM[e + 15] = 1;
          fC[b * 3] = f[o + 5]; fC[b * 3 + 1] = f[o + 6]; fC[b * 3 + 2] = f[o + 7];
          b++;
        }
      }
    }
    near.count = a; far.count = b;
    near.instanceMatrix.needsUpdate = true; near.instanceColor.needsUpdate = true; far.instanceMatrix.needsUpdate = true; far.instanceColor.needsUpdate = true;
  };
  // the trigger: an always-drawn empty mesh whose onBeforeRender (the main pass) queues the chunks in range, evaluates a few
  // inside a 4 ms budget and re-bins when the lens has moved 2.5 m or a chunk has landed
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
  const trig = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false }));
  trig.frustumCulled = false; trig.name = name + ':lod'; trig.renderOrder = -1000;
  sg.addEventListener('dispose', () => { dead = true; chunks.clear(); todo.length = 0; });
  trig.onBeforeRender = (r, s, cam) => {
    if (dead || !cam.isPerspectiveCamera || (cam.parent && cam.parent.isCubeCamera)) return;
    const cx = cam.position.x, cz = cam.position.z;
    if (cx < ox - GR_FAR - 2 || cx > ox + 512 + GR_FAR + 2 || cz < oz - GR_FAR - 2 || cz > oz + 512 + GR_FAR + 2 || cam.position.y > 90) {
      if (near && (near.count || far.count)) { near.count = 0; far.count = 0; lx = 1e12; }
      return;
    }
    // the chunks within reach of the lens not yet evaluated
    const R = GR_FAR + 2, i0 = Math.max(0, Math.floor((cx - R - ox) / GCH)), i1 = Math.min(15, Math.floor((cx + R - ox) / GCH)), j0 = Math.max(0, Math.floor((cz - R - oz) / GCH)), j1 = Math.min(15, Math.floor((cz + R - oz) / GCH));
    for (let ci = i0; ci <= i1; ci++) for (let cj = j0; cj <= j1; cj++) { const key = ci * 4096 + cj; if (!chunks.has(key) && !todo.includes(key)) todo.push(key); }
    let landed = false;
    const t0 = performance.now();
    while (todo.length && performance.now() - t0 < 4) {
      const key = todo.shift();
      if (chunks.has(key)) continue;
      try { evalChunk(Math.floor(key / 4096), key % 4096); } catch (e) { chunks.set(key, { f: new Float32Array(0), n: 0 }); console.warn('[cp33] grass chunk', e); }
      landed = true;
    }
    if (landed || (cx - lx) * (cx - lx) + (cz - lz) * (cz - lz) >= 6.25) { lx = cx; lz = cz; rebin(cx, cz); }
  };
  G.add(trig);
  return G;
}
