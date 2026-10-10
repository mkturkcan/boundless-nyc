// BX-TREES (AR34 BX, 2026-10-02; docs/notes/ar34-bx-trees.md). The tree asset set shared with the offline target
// (tools/ar34/bxtrees: species trees grown to the twigs, a card per leaf cut from CC0 scans, scanned bark; the same trees
// the USD export swaps in for Cycles) on the web's tree pools, at the web's LOD distances:
//   near (LOD0, to the 90 m swap)  w0: limbs to the tertiaries, at most 9,000 leaf cards (the asset's leaves, thinned and
//                                  scaled up to keep the crown's leaf area)
//   90-150 m (the pool's LOD1)     w1: limbs to the secondaries and ~1,800 cards, bark and leaves in one geometry
//   past 150 m (TR37's far pool)   the impostor: three baked cards (the TR36 forms' far pool only; the other forms keep
//                                  w1 to the horizon, as trees25 keeps its LOD1)
// OFF BY DEFAULT: `?bxtrees=1` turns it on (trees.js calls applyBXTrees after its own trees are up). Without the flag this
// module is never imported. The forms covered: public/models/bxtrees/bxtrees.json (London plane P, honeylocust H, pin oak Q,
// zelkova Z, Callery pear R, littleleaf linden L; mature and young); every other pool keeps the web's tree.
import * as THREE from 'three';
import { applyLightTrim, applyCityAO, applySnowCap } from '../world/materials.js';

const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
export const BXT = !!(Q && Q.get('bxtrees') === '1');
const BASE = 'models/bxtrees/';
// `?bxtgain=<k>`: a gain on the leaves' albedo (the web's own foliage terms are not on this material)
const GAIN = Number(Q?.get('bxtgain')) || 1.0;
const STREET_CAL = [1.94, 1.70, 1.47];   // the props' street light trim (trees.js uses the same for its bark)
const TRI8 = [0, 2, 1, 0, 3, 2, 0, 4, 3, 0, 5, 4, 0, 6, 5, 0, 7, 6];

const inflate = (b) => new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();

function unpack(buf, base, h, leaf) {
  const nv = h.nv, [lo, hi] = h.box;
  const q = new Int16Array(buf, base + h.pos[0], nv * 3);
  const P = new Float32Array(nv * 3);
  for (let i = 0; i < nv * 3; i++) { const c = i % 3; P[i] = lo[c] + ((q[i] + 32768) / 65535) * (hi[c] - lo[c]); }
  const n8 = new Int8Array(buf, base + h.nrm[0], nv * 3), N = new Float32Array(nv * 3);
  for (let i = 0; i < nv * 3; i++) N[i] = n8[i] / 127;
  let UV, C, I;
  if (leaf) {
    const u16 = new Uint16Array(buf, base + h.uv[0], nv * 2); UV = new Float32Array(nv * 2);
    for (let i = 0; i < nv * 2; i++) UV[i] = u16[i] / 65535;
    const s = new Uint8Array(buf, base + h.shade[0], nv); C = new Float32Array(nv * 3);
    for (let i = 0; i < nv; i++) { const v = s[i] / 255; C[i * 3] = C[i * 3 + 1] = C[i * 3 + 2] = v; }
    I = new Uint32Array(h.cards * 18);
    for (let k = 0; k < h.cards; k++) for (let j = 0; j < 18; j++) I[k * 18 + j] = k * 8 + TRI8[j];
  } else {
    UV = new Float32Array(buf.slice(base + h.uv[0], base + h.uv[0] + nv * 8));
    C = new Float32Array(nv * 3).fill(1);
    I = new Uint32Array(buf.slice(base + h.idx[0], base + h.idx[0] + h.ni * 4));
  }
  return { P, N, UV, C, I };
}

function geometry(parts) {
  // one BufferGeometry from one or more unpacked meshes, a draw group each (material index = order)
  const nv = parts.reduce((a, p) => a + p.P.length / 3, 0), ni = parts.reduce((a, p) => a + p.I.length, 0);
  const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), UV = new Float32Array(nv * 2), C = new Float32Array(nv * 3), I = new Uint32Array(ni);
  const g = new THREE.BufferGeometry();
  let v0 = 0, i0 = 0;
  parts.forEach((p, k) => {
    P.set(p.P, v0 * 3); N.set(p.N, v0 * 3); UV.set(p.UV, v0 * 2); C.set(p.C, v0 * 3);
    for (let j = 0; j < p.I.length; j++) I[i0 + j] = p.I[j] + v0;
    if (parts.length > 1) g.addGroup(i0, p.I.length, k);
    v0 += p.P.length / 3; i0 += p.I.length;
  });
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(UV, 2));
  g.setAttribute('color', new THREE.BufferAttribute(C, 3));
  g.setIndex(new THREE.BufferAttribute(I, 1));
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}

async function loadTree(id) {
  const r = await fetch(BASE + id + '.bin');
  if (!r.ok) throw new Error(id + '.bin ' + r.status);
  const buf = await inflate(await r.arrayBuffer());
  const hl = new DataView(buf).getUint32(0, true);
  const head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hl)));
  const base = 4 + hl;
  const b0 = unpack(buf, base, head.w0.bark, false), l0 = unpack(buf, base, head.w0.leaf, true);
  const b1 = unpack(buf, base, head.w1.bark, false), l1 = unpack(buf, base, head.w1.leaf, true);
  const T = { head, bark0: geometry([b0]), leaf0: geometry([l0]), lod1: geometry([l1, b1]), leaf1: geometry([l1]) };
  if (head.imp) T.imp = geometry([unpack(buf, base, head.imp, false)]);
  return T;
}

const _tex = new Map();
function tex(loader, file, srgb) {
  if (_tex.has(file)) return _tex.get(file);
  const t = loader.load(BASE + file);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  _tex.set(file, t);
  return t;
}

function leafMaterial(loader, F) {
  const m = new THREE.MeshStandardMaterial({ map: tex(loader, F + '_leaf_col.webp', true), normalMap: tex(loader, F + '_leaf_nrm.webp', false),
    alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6, metalness: 0, vertexColors: true });
  m.normalScale.set(0.6, 0.6);
  m.color.setScalar(GAIN);
  // the blade passes light: a leaf whose back faces the sun takes a share of the sun through it (unshadowed: a small
  // share, 0.22 of the albedo's direct light)
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      #if NUM_DIR_LIGHTS > 0
      {
        float bxBack = max(0.0, -dot(normal, directionalLights[0].direction));
        reflectedLight.directDiffuse += diffuseColor.rgb * vec3(1.15, 1.2, 0.55) * directionalLights[0].color * bxBack * 0.22;
      }
      #endif`);
  };
  m.customProgramCacheKey = () => 'bxtleaf';
  m.name = 'bxt_leaf_' + F;
  return applyLightTrim(applyCityAO(applySnowCap(m)), STREET_CAL);
}

function barkMaterial(loader, key) {
  const m = new THREE.MeshStandardMaterial({ map: tex(loader, 'bark_' + key + '_col.jpg', true), normalMap: tex(loader, 'bark_' + key + '_nrm.jpg', false),
    roughness: 0.92, metalness: 0 });
  m.normalScale.set(1.2, 1.2);
  // per channel: each scan's linear mean to a bark albedo (plane 0.30 / 0.28 / 0.25, the others ~0.12-0.16), the film's values
  const tint = { plane: [0.88, 0.93, 1.06], willow: [0.49, 0.51, 0.56], oak: [1.15, 1.3, 1.6], zelkova: [0.48, 0.59, 0.74], pear: [0.46, 0.52, 0.9], linden: [0.6, 0.56, 0.54], maple: [1.4, 1.6, 1.6], cherry: [0.59, 0.62, 0.79] }[key] ?? [0.6, 0.6, 0.6];
  m.color.setRGB(tint[0], tint[1], tint[2]);
  m.name = 'bxt_bark_' + key;
  return applyLightTrim(applyCityAO(applySnowCap(m)), STREET_CAL);
}

function impMaterial(loader, id) {
  const m = new THREE.MeshStandardMaterial({ map: tex(loader, 'imp_' + id + '.webp', true), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85, metalness: 0 });
  m.name = 'bxt_imp_' + id;
  return applyLightTrim(applyCityAO(m), STREET_CAL);
}

// pool base ('treeQ9') -> asset tree id ('Q_y'), or null
function treeFor(base, ids) {
  const m = /^tree([A-Z])(\d?)$/.exec(base);
  if (!m) return null;
  const id = m[1] + (m[2] === '9' ? '_y' : m[2] === '2' ? '_m2' : '_m');
  return ids.has(id) ? id : ids.has(m[1] + '_m') ? m[1] + '_m' : null;
}

// ctx (from trees.js): { far: the TR37 far pool entries [{ p, mesh }], lod37: its LOD37 uniform, lodDist: the 90 m swap }
export async function applyBXTrees(instancer, ctx = {}) {
  const t0 = performance.now();
  const man = await (await fetch(BASE + 'bxtrees.json')).json();
  const ids = new Set(Object.keys(man.trees));
  const bases = [...instancer.pools.keys()].filter((k) => k.endsWith('Trunk')).map((k) => k.slice(0, -5)).filter((b) => treeFor(b, ids));
  const need = [...new Set(bases.map((b) => treeFor(b, ids)))];
  const trees = new Map(await Promise.all(need.map(async (id) => [id, await loadTree(id)])));
  const loader = new THREE.TextureLoader();
  const leafM = {}, barkM = {}, impM = {};
  const NOTHING = new THREE.BufferGeometry();
  NOTHING.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
  NOTHING.setIndex([0, 1, 2]);
  const stats = { pools: 0, trees: need.length, tris0: 0, tris1: 0, far: 0 };
  for (const base of bases) {
    const id = treeFor(base, ids), T = trees.get(id), h = T.head;
    const pT = instancer.pools.get(base + 'Trunk'), pC = instancer.pools.get(base + 'Crown');
    if (!pT || !pC) continue;
    const lm = leafM[h.F] || (leafM[h.F] = leafMaterial(loader, h.F));
    const bm = barkM[h.bark] || (barkM[h.bark] = barkMaterial(loader, h.bark));
    pT.mesh.geometry = T.bark0; pT.mesh.material = bm;
    pC.mesh.geometry = T.leaf0; pC.mesh.material = lm;
    if (instancer._sync) { instancer._sync(pT); instancer._sync(pC); }
    const lod = ctx.lodDist || 90;
    instancer.setLOD(base + 'Crown', T.lod1, lod);
    instancer.setLOD(base + 'Trunk', NOTHING, lod);   // past the swap the bark is in the crown's LOD1 geometry
    if (pC.mesh2) pC.mesh2.material = [lm, bm];
    // shadow casters: the LOD1 leaves (a leaf card is finer than a shadow texel) and the near bark
    if (pC.shadow) pC.shadow.geometry = T.leaf1;
    if (pC.shadow2) pC.shadow2.geometry = T.leaf1;
    // TR37's far pool (the TR36 forms): the impostor past 150 m
    const F = (ctx.far || []).find((e) => e.p === pC);
    if (F && T.imp) { F.mesh.geometry = T.imp; F.mesh.material = impM[id] || (impM[id] = impMaterial(loader, id)); stats.far++; }
    stats.pools++;
    stats.tris0 += (T.bark0.index.count + T.leaf0.index.count) / 3;
    stats.tris1 += T.lod1.index.count / 3;
  }
  // hard swaps: the TR37 cross-fade bands dither in the TR36 crown programs, which these materials do not carry
  if (ctx.lod37) { ctx.lod37.value.y = 0; ctx.lod37.value.w = 0; }
  stats.ms = Math.round(performance.now() - t0);
  stats.MB = Math.round(need.reduce((a, id) => a + (man.trees[id]?.bytes || 0), 0) / 1e4) / 100;
  if (typeof window !== 'undefined') window.__BXTREES = stats;
  return stats;
}
