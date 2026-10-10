// VG36 tree pits (GROUND, docs/notes/ar35-veg.md): what grows and lies in a street tree's pit. `?vg36=0` / `?vg36p=0` off.
//
// A street tree stood in a flat 1.5 m box of one dark brown (furnitureKit treeFence, 55 % of the trees, with the picket
// guard) or straight out of the flags. Every street tree the tiles place on the flags (world/assemble.js lists them as
// data.vgPits) now gets a pit: an open one where the tree has no guard, and in every pit the fill a Harlem pit shows:
// soil crowned toward the trunk, bare and dry in most, under shredded-bark mulch in some (chips a few cm across, drawn per
// pixel: a cellular chip field with its own relief), weedy grass and broad-leaved weeds (plantain, dandelion) along the
// edges, in some a planted ground cover (liriope tufts, ivy), litter (a cup, a wrapper, butts) in about half, fallen
// leaflets. Six pit kinds, each one instanced geometry (with and without the frame); the pits within PIT_R of the lens draw
// them (re-binned as the lens moves 3 m), all one material, no shadow casting. An unguarded pit is open: 2.2 x 1.24 m, laid
// along its kerb and moved onto the flags (layPit), its soil inside a low concrete edge; a guarded one fills its guard's
// 1.48 m box.
import * as THREE from 'three';
import { applyLightTrim, applyCityAO } from './materials.js';

const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams('');
export const VG36P = Q.get('vg36') !== '0' && Q.get('vg36p') !== '0';
const PIT_R = 70;                 // pit fills drawn within this range of the lens
const HALF = 0.74;                // a guarded pit's soil, half width (inside the guard's granite frame)
const KINDS = 6;

const mulberry = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const lin = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };   // three's Color takes sRGB hex to linear

// one geometry part: positions, normals, colours, kind (0 soil, 1 plant, 2 litter, 3 stone)
class Part {
  constructor() { this.p = []; this.n = []; this.c = []; this.k = []; this.i = []; }
  v(x, y, z, nx, ny, nz, c, k) { this.p.push(x, y, z); this.n.push(nx, ny, nz); this.c.push(c[0], c[1], c[2]); this.k.push(k); return this.p.length / 3 - 1; }
  tri(a, b, c) { this.i.push(a, b, c); }
  geo() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('aK', new THREE.Float32BufferAttribute(this.k, 1));
    g.setIndex(this.i);
    return g;
  }
}
// the soil: a grid (~7 cm) crowned toward the trunk, its edge just over the guard's soil box (guarded) or the flags (open)
function soil(P, rnd, o, hx, hz, lift) {
  const NX = Math.max(10, Math.round(20 * hx / HALF)), NZ = Math.max(10, Math.round(20 * hz / HALF)), base = P.p.length / 3;
  const crown = o.crown, dip = 0.004 + 0.01 * rnd();
  const ph = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28];
  const hAt = (x, z) => {
    const r = Math.hypot(x, z), e = Math.max(Math.abs(x) / hx, Math.abs(z) / hz);
    let h = lift + crown * Math.max(0, 1 - r / 0.62) ** 1.5 - dip * e * e;
    h += 0.006 * Math.sin(x * 9.1 + ph[0]) * Math.sin(z * 7.7 + ph[1]) + 0.004 * Math.sin(x * 23.0 + z * 17.0 + ph[2]);
    return Math.max(h, lift - 0.003);
  };
  const cS = lin(o.soil), cM = lin(o.mulch);
  for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
    const x = -hx + (2 * hx * i) / NX, z = -hz + (2 * hz * j) / NZ;
    const y = hAt(x, z), e = 0.01;
    const dx = (hAt(x + e, z) - hAt(x - e, z)) / (2 * e), dz = (hAt(x, z + e) - hAt(x, z - e)) / (2 * e);
    const nl = Math.hypot(dx, 1, dz);
    // mulch over most of it, the soil showing at the edges and where it has been kicked away
    const m = Math.min(1, Math.max(0, o.mulchK - 0.55 * Math.max(Math.abs(x) / hx, Math.abs(z) / hz) + 0.25 * Math.sin(x * 5.3 + ph[1]) * Math.cos(z * 4.1 + ph[2])));
    const c = [0, 1, 2].map((q) => cS[q] + (cM[q] - cS[q]) * m);
    P.v(x, y, z, -dx / nl, 1 / nl, -dz / nl, c, 0.4 * m);   // kind 0 soil, its mulch cover in 0..0.4
  }
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const a = base + j * (NX + 1) + i;
    P.tri(a, a + NX + 1, a + 1); P.tri(a + 1, a + NX + 1, a + NX + 2);
  }
  return hAt;
}
// the edge of an open pit: a low concrete border 6 cm wide, 4.5 cm proud (the flags round a pit sit over the soil box's level:
// soil laid flush with them disappeared under STREET's flags, a5 / a9 vgPit158)
function frame(P, hx, hz) {
  const c = lin('#8a857b'), w = 0.06, h = 0.045;
  const boxXZ = (cx, cz, sx, sz) => {
    const x0 = cx - sx / 2, x1 = cx + sx / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
    const quads = [
      [[x0, h, z0], [x0, h, z1], [x1, h, z1], [x1, h, z0], [0, 1, 0]],
      [[x0, 0, z1], [x1, 0, z1], [x1, h, z1], [x0, h, z1], [0, 0, 1]],
      [[x1, 0, z0], [x0, 0, z0], [x0, h, z0], [x1, h, z0], [0, 0, -1]],
      [[x1, 0, z1], [x1, 0, z0], [x1, h, z0], [x1, h, z1], [1, 0, 0]],
      [[x0, 0, z0], [x0, 0, z1], [x0, h, z1], [x0, h, z0], [-1, 0, 0]],
    ];
    for (const [a, b, cc, d, n] of quads) {
      const ia = P.v(...a, ...n, c, 3), ib = P.v(...b, ...n, c, 3), ic = P.v(...cc, ...n, c, 3), id = P.v(...d, ...n, c, 3);
      P.tri(ia, ib, ic); P.tri(ia, ic, id);
    }
  };
  const ox = hx + w / 2, oz = hz + w / 2;
  boxXZ(0, oz, 2 * (hx + w), w); boxXZ(0, -oz, 2 * (hx + w), w); boxXZ(ox, 0, w, 2 * hz); boxXZ(-ox, 0, w, 2 * hz);
}
// a tapered, bent blade (grass) from (x, y, z): 3 segments
function blade(P, x, y, z, h, w, yaw, bend, c0, c1, k = 1) {
  const fx = Math.cos(yaw), fz = Math.sin(yaw), wx = -fz, wz = fx;
  const R = 3, ids = [];
  for (let s = 0; s <= R; s++) {
    const t = s / R, ww = w * (1 - 0.85 * t ** 1.5) * 0.5;
    const cx = x + fx * bend * h * t * t, cy = y + h * (t - 0.3 * bend * t * t), cz = z + fz * bend * h * t * t;
    const c = [0, 1, 2].map((q) => c0[q] + (c1[q] - c0[q]) * t);
    const nx = fx * 0.4, ny = 0.9, nz = fz * 0.4;
    if (s < R) ids.push([P.v(cx - wx * ww, cy, cz - wz * ww, nx, ny, nz, c, k), P.v(cx + wx * ww, cy, cz + wz * ww, nx, ny, nz, c, k)]);
    else ids.push([P.v(cx, cy, cz, nx, ny, nz, c, k)]);
  }
  for (let s = 0; s < R - 1; s++) { const [a, b] = ids[s], [c, d] = ids[s + 1]; P.tri(a, b, d); P.tri(a, d, c); }
  const [a, b] = ids[R - 1]; P.tri(a, b, ids[R][0]);
}
// a broad leaf (plantain, dandelion, ivy, a fallen leaflet): an ovate blade of 6 vertices, folded along its midrib
function leaf(P, x, y, z, len, wid, yaw, lift, c, k = 1, fold = 0.25) {
  const fx = Math.cos(yaw), fz = Math.sin(yaw), wx = -fz, wz = fx;
  const pt = (t, s) => {
    const up = lift * t * len - 0.5 * lift * t * t * len;
    return [x + fx * t * len + wx * s, y + up + Math.abs(s) * fold * 0.4 * -1 + fold * 0.012, z + fz * t * len + wz * s];
  };
  const w = wid / 2;
  const V = [pt(0, 0), pt(0.3, -w * 0.9), pt(0.3, w * 0.9), pt(0.7, -w * 0.75), pt(0.7, w * 0.75), pt(1, 0)];
  const ids = V.map((p) => P.v(p[0], p[1], p[2], 0, 1, 0, c, k));
  P.tri(ids[0], ids[1], ids[2]); P.tri(ids[1], ids[3], ids[2]); P.tri(ids[2], ids[3], ids[4]); P.tri(ids[3], ids[5], ids[4]);
}
// a pit's fill, one of KINDS: 0 bare mulched, 1 weedy, 2 liriope, 3 ivy, 4 mulch + litter, 5 trodden dry soil, weeds and litter
// (open pits 45 % bare dry soil and 30 % weedy, as on most 125th Street captures; guarded ones more often mulched or planted)
// an open (unguarded) pit is 2.2 x 1.24 m, its long side along the kerb, its soil inside a low edge; a guarded one fills the
// guard's 1.48 m box
const OPEN = { hx: 1.1, hz: 0.62 };
function pitKind(kind, seed, framed) {
  const rnd = mulberry(seed);
  const P = new Part();
  const hx = framed ? OPEN.hx : HALF, hz = framed ? OPEN.hz : HALF;
  const o = [
    { soil: '#3a3129', mulch: '#3f3229', mulchK: 1.15, crown: 0.05 },
    { soil: '#3b332a', mulch: '#3d3129', mulchK: 0.75, crown: 0.035 },
    { soil: '#342c25', mulch: '#41332a', mulchK: 1.2, crown: 0.045 },
    { soil: '#342c25', mulch: '#3a2e26', mulchK: 0.9, crown: 0.04 },
    { soil: '#3a3129', mulch: '#43342a', mulchK: 1.0, crown: 0.05 },
    { soil: '#7a6a55', mulch: '#5a4b3c', mulchK: 0.15, crown: 0.02 },
  ][kind];
  const hAt = soil(P, rnd, o, hx, hz, framed ? 0.034 : 0.039);
  if (framed) frame(P, hx, hz);
  const inner = (m = 0.06) => [(rnd() * 2 - 1) * (hx - m), (rnd() * 2 - 1) * (hz - m)];
  const nearEdge = () => {
    if (rnd() < 0.5) return [(rnd() * 2 - 1) * (hx - 0.05), (hz - 0.04 - rnd() * 0.16) * (rnd() < 0.5 ? -1 : 1)];
    return [(hx - 0.04 - rnd() * 0.16) * (rnd() < 0.5 ? -1 : 1), (rnd() * 2 - 1) * (hz - 0.05)];
  };
  const off = (x, z) => Math.hypot(x, z) < 0.2;   // the trunk
  const gDark = lin('#2c3a16'), gTip = lin('#6f8a34'), gDry = lin('#9a8f55');
  const clump = (x, z, n, hMin, hMax, dry = 0) => {
    for (let b = 0; b < n; b++) {
      const a = rnd() * 6.283, r = 0.04 * Math.sqrt(rnd());
      const bx = x + Math.cos(a) * r, bz = z + Math.sin(a) * r;
      const h = hMin + (hMax - hMin) * rnd();
      const tip = dry > rnd() ? gDry : gTip;
      blade(P, bx, hAt(bx, bz) - 0.005, bz, h, 0.006 + 0.004 * rnd(), a + (rnd() - 0.5), 0.3 + 0.9 * rnd(), gDark, tip);
    }
  };
  const rosette = (x, z, n, len, wid, col) => {
    const y = hAt(x, z);
    for (let l = 0; l < n; l++) {
      const yaw = (l / n) * 6.283 + rnd() * 0.5, L = len * (0.7 + 0.5 * rnd());
      const c = col.map((q) => q * (0.85 + 0.3 * rnd()));
      leaf(P, x, y + 0.004, z, L, wid * (0.8 + 0.4 * rnd()), yaw, 0.35 + 0.4 * rnd(), c, 1, 0.2);
    }
  };
  // weeds: grass clumps along the edges, broad-leaved rosettes
  const weedy = kind === 1 ? 1 : kind === 5 ? 0.8 : kind === 4 ? 0.25 : kind === 0 ? 0.15 : 0.1;
  const nClumps = Math.round(weedy * 14 * (0.6 + 0.8 * rnd()));
  for (let q = 0; q < nClumps; q++) { const [x, z] = nearEdge(); clump(x, z, 5 + Math.floor(rnd() * 8), 0.06, 0.26, kind === 5 ? 0.5 : 0.15); }
  const nRos = Math.round(weedy * 4 * rnd() + (kind === 1 ? 2 : 0));
  for (let q = 0; q < nRos; q++) {
    const [x, z] = inner(0.12); if (off(x, z)) continue;
    if (rnd() < 0.55) rosette(x, z, 5 + Math.floor(rnd() * 3), 0.10, 0.05, lin('#3f5a22'));    // plantain
    else rosette(x, z, 7 + Math.floor(rnd() * 4), 0.12, 0.028, lin('#46612a'));                // dandelion
  }
  // a planted ground cover: liriope tufts in rows, or an ivy mat
  if (kind === 2) {
    for (let gx = -0.55; gx <= 0.56; gx += 0.27) for (let gz = -0.55; gz <= 0.56; gz += 0.27) {
      const x = gx + (rnd() - 0.5) * 0.06, z = gz + (rnd() - 0.5) * 0.06;
      if (off(x, z) || rnd() < 0.12) continue;
      const y = hAt(x, z);
      for (let b = 0; b < 34; b++) {
        const a = rnd() * 6.283;
        blade(P, x + Math.cos(a) * 0.03 * rnd(), y - 0.004, z + Math.sin(a) * 0.03 * rnd(), 0.22 + 0.16 * rnd(), 0.010, a, 0.8 + 0.9 * rnd(), lin('#18240f'), lin('#34501d'));
      }
    }
  }
  if (kind === 3) {
    const n = 260 + Math.floor(rnd() * 120);
    for (let q = 0; q < n; q++) {
      const [x, z] = inner(0.02); if (off(x, z)) continue;
      const c = lin(rnd() < 0.2 ? '#355225' : '#243d18').map((v) => v * (0.85 + 0.35 * rnd()));
      leaf(P, x, hAt(x, z) + 0.01 + 0.03 * rnd(), z, 0.045 + 0.025 * rnd(), 0.045, rnd() * 6.283, 0.15 + 0.3 * rnd(), c, 1, 0.1);
    }
  }
  // fallen honeylocust leaflets and small leaves (early autumn), on every pit
  const nFall = 10 + Math.floor(rnd() * 25);
  for (let q = 0; q < nFall; q++) {
    const [x, z] = inner(0.02);
    const c = lin(rnd() < 0.5 ? '#a08a32' : rnd() < 0.5 ? '#7d6a2c' : '#5d6b2a');
    leaf(P, x, hAt(x, z) + 0.003, z, 0.022 + 0.02 * rnd(), 0.009 + 0.006 * rnd(), rnd() * 6.283, 0.02, c, 1, 0.02);
  }
  // litter
  if (kind === 4 || kind === 5 || (kind === 1 && rnd() < 0.5)) {
    const items = 1 + Math.floor(rnd() * 3);
    for (let q = 0; q < items; q++) {
      const [x, z] = inner(0.12); if (off(x, z)) continue;
      const y = hAt(x, z) + 0.003, r = rnd();
      if (r < 0.35) {
        // a paper cup on its side: a short tapered tube
        const yaw = rnd() * 6.283, L = 0.09, r0 = 0.03, r1 = 0.04, ca = Math.cos(yaw), sa = Math.sin(yaw), seg = 10;
        const cw = lin(rnd() < 0.5 ? '#e8e4da' : '#c9b9a0'), cb = lin('#7a4a2a');
        const ring = [];
        for (let e = 0; e <= 1; e++) {
          const rr = e ? r1 : r0, u = (e - 0.5) * L, row = [];
          for (let s = 0; s <= seg; s++) {
            const a = (s / seg) * 6.283, py = Math.cos(a) * rr + rr, pz = Math.sin(a) * rr;
            const px = x + ca * u - sa * pz, pzz = z + sa * u + ca * pz;
            row.push(P.v(px, y + py, pzz, -sa * Math.sin(a), Math.cos(a), ca * Math.sin(a), s % 5 === 0 ? cb : cw, 2));
          }
          ring.push(row);
        }
        for (let s = 0; s < seg; s++) { P.tri(ring[0][s], ring[1][s], ring[1][s + 1]); P.tri(ring[0][s], ring[1][s + 1], ring[0][s + 1]); }
      } else if (r < 0.7) {
        // a crumpled wrapper: a small creased quad pair in a strong colour
        const c = lin(['#c8202a', '#e0e0e0', '#2050a0', '#f0c020', '#202020'][Math.floor(rnd() * 5)]);
        const s = 0.04 + 0.04 * rnd(), yaw = rnd() * 6.283;
        leaf(P, x, y + 0.01, z, s * 1.6, s, yaw, 0.4, c, 2, 0.6);
        leaf(P, x, y + 0.012, z, s * 1.2, s * 0.9, yaw + 2.2, 0.5, c.map((v) => v * 0.8), 2, 0.5);
      } else {
        // cigarette butts
        for (let b = 0; b < 2 + Math.floor(rnd() * 4); b++) {
          const bx = x + (rnd() - 0.5) * 0.2, bz = z + (rnd() - 0.5) * 0.2;
          leaf(P, bx, hAt(bx, bz) + 0.004, bz, 0.03, 0.008, rnd() * 6.283, 0.0, lin(rnd() < 0.5 ? '#d8c8a0' : '#e8e2d8'), 2, 0.0);
        }
      }
    }
  }
  const g = P.geo();
  g.computeBoundingSphere();
  return g;
}

let _mat = null;
export function pitMat() {   // (exported for the planted beds' soil, world/vg37.js)
  if (_mat) return _mat;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
  m.name = 'vg36:pit';
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aK;\nvarying float vPK;\nvarying vec3 vPW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPK = aK;')
      .replace('#include <project_vertex>', `#include <project_vertex>
      {
        vec4 pw = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          pw = instanceMatrix * pw;
        #endif
        vPW = (modelMatrix * pw).xyz;
      }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
      varying float vPK;
      varying vec3 vPW;
      vec2 pkH2(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
      // shredded bark: a cellular field of elongated chips (the nearest and second-nearest seed), each chip its own tone
      vec3 pkChips(vec2 p, out float hgt) {
        vec2 i = floor(p), f = fract(p);
        float d1 = 8.0, d2 = 8.0; vec2 id = vec2(0.0);
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
          vec2 g = vec2(float(x), float(y)), o = pkH2(i + g);
          vec2 r = g + o - f;
          float a = o.x * 6.283; vec2 ax = vec2(cos(a), sin(a));
          float d = length(vec2(dot(r, ax) * 0.55, dot(r, vec2(-ax.y, ax.x)) * 1.6));
          if (d < d1) { d2 = d1; d1 = d; id = i + g; } else if (d < d2) d2 = d;
        }
        hgt = smoothstep(0.0, 0.18, d2 - d1);
        vec2 h = pkH2(id + 7.7);
        return vec3(h, hgt);
      }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      float pkSoil = 1.0 - step(0.45, vPK);
      if (pkSoil > 0.5) {
        float fwP = length(fwidth(vPW.xz));
        float near = 1.0 - smoothstep(0.004, 0.02, fwP);
        float hg; vec3 ch = pkChips(vPW.xz * 22.0, hg);
        // the chip's own tone (bark from straw-brown to near-black), the gaps soil-dark; the mulch cover rides in aK (0..0.4)
        float mul = clamp(vPK / 0.4, 0.0, 1.0);
        vec3 chipC = mix(vec3(0.55, 0.50, 0.46), vec3(1.45, 1.22, 1.0), ch.x) * mix(0.35, 1.35, ch.y);
        vec3 tex = mix(vec3(0.28, 0.27, 0.26), chipC, hg);
        // the soil: fine crumbs (a finer, flatter field than the chips: bare soil read as cobbles at 22 a metre)
        float pkHs; vec3 pkCs = pkChips(vPW.xz * 55.0 + 3.1, pkHs);
        vec3 crumb = vec3(0.9 + 0.2 * pkCs.y) * mix(0.93, 1.05, pkHs);
        diffuseColor.rgb *= mix(vec3(1.0), mix(crumb, tex, mul), near);
      }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      if (vPK < 0.45) {
        float fwP2 = length(fwidth(vPW.xz));
        float near2 = 1.0 - smoothstep(0.004, 0.02, fwP2);
        if (near2 > 0.01) {
          float hg2; pkChips(vPW.xz * 22.0, hg2);
          normal = normalize(normal + vec3(-dFdx(hg2), -dFdy(hg2), 0.0) * 0.6 * near2 * clamp(vPK / 0.4, 0.15, 1.0));   // the chips' relief where mulched
        }
      }`)
      // the leaves and blades lit alike on both faces
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n#ifdef DOUBLE_SIDED\n  if (vPK > 0.5 && vPK < 1.5) normal *= faceDirection;\n#endif');
  };
  m.customProgramCacheKey = () => 'vg36pit1';
  _mat = applyLightTrim(applyCityAO(m), [1.94, 1.70, 1.47]);   // the street's calibration (props on the flags)
  return _mat;
}

// ---------------------------------------------------------------- the registry and the draw
export function initPits36(engine, streamer) {
  if (!VG36P || !engine || !streamer) return null;
  const scene = engine.scene;
  const pits = new Map();           // tile key -> [{ x, y, z, rot, framed, kind }]
  const mat = pitMat();
  const geos = [];
  for (let k = 0; k < KINDS; k++) geos.push([pitKind(k, 7001 + k * 37, false), pitKind(k, 9001 + k * 41, true)]);
  const G = new THREE.Group();
  G.name = 'vg36:pits';
  const CAP = 400;
  const meshes = geos.map((pair, k) => pair.map((g, f) => {
    const m = new THREE.InstancedMesh(g, mat, CAP);
    m.count = 0; m.frustumCulled = false; m.castShadow = false; m.receiveShadow = true; m.name = `vg36:pit${k}${f ? 'f' : ''}`;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    G.add(m);
    return m;
  }));
  scene.add(G);
  let lx = 1e12, lz = 1e12, dirty = true;
  const stats = { pits: 0, drawn: 0, ivy: 0 };
  // VG37 (session 2): the ivy pits (kind 3) under a dense mat of scanned English ivy (world/vg37.js's atlas), within 40 m;
  // loaded late (a dynamic import: vg37.js takes this file's pitMat), until then the pit's own ivy scatter alone
  let ivyMesh = null;
  import('./vg37.js').then((m) => {
    if (!m.VG37) return;
    const F = m.vg37Form('ivyMat');
    ivyMesh = new THREE.InstancedMesh(F.lod0, m.vg37LeafMat(), CAP * 2);
    ivyMesh.count = 0; ivyMesh.frustumCulled = false; ivyMesh.castShadow = false; ivyMesh.receiveShadow = true; ivyMesh.name = 'vg37:pitIvy';
    ivyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    G.add(ivyMesh);
    dirty = true;
  }).catch((e) => console.warn('[vg36] pit ivy', e));
  // an unguarded pit is laid along its kerb and moved off it onto the flags (the compiled roadway runs ~1.5 m past the real
  // kerb, so many trunks stand at the kerb's edge: a pit centred on them hung over the gutter); a guarded one follows its guard
  const WALK = new Set(['sidewalk', 'brick', 'plaza']);
  const onWalk = (x, z) => { const s = streamer.surfaceInfoAt ? streamer.surfaceInfoAt(x, z, 0.05) : null; return !!(s && !s.road && WALK.has(s.kind)); };
  const AXES = [[0.8744, 0.4853], [-0.4853, 0.8744]];   // the grid's cross-town and avenue bearings
  const layPit = (x, z) => {
    for (const [ax, az] of AXES) {
      const nx = -az, nz = ax;   // across the kerb
      const a = onWalk(x + nx * 2.2, z + nz * 2.2), b = onWalk(x - nx * 2.2, z - nz * 2.2);
      if (!a && !b) continue;
      const sx = a ? nx : -nx, sz = a ? nz : -nz;   // toward the flags (both sides flags: a wide walk, the pit stays centred)
      for (const o of (a && b ? [0] : [0, 0.15, 0.3, 0.45])) {
        const cx = x + sx * o, cz = z + sz * o, eu = OPEN.hx + 0.1, ev = OPEN.hz + 0.1;
        let ok = true;
        for (const [u, v] of [[1, 1], [1, -1], [-1, 1], [-1, -1], [0, 1], [0, -1]]) if (!onWalk(cx + ax * u * eu + nx * v * ev, cz + az * u * eu + nz * v * ev)) { ok = false; break; }
        if (ok) return { x: cx, z: cz, rot: Math.atan2(-az, ax) };
      }
    }
    return null;
  };
  // world/assemble.js lists each tile's street trees on the flags as data.vgPits: [x, y, z, rot (the guard's), guarded 0 / 1, ...]
  streamer.onTile((key, data) => {
    const L = data && data.vgPits;
    if (!L || !L.length) return;
    const a = [];
    for (let i = 0; i + 4 < L.length; i += 5) {
      const x = L[i], y = L[i + 1], z = L[i + 2], rot = L[i + 3], fenced = L[i + 4] > 0.5;
      const h = Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
      // which kind: a guarded pit is tended more often (mulch, ground cover); an open one is mostly bare, trodden soil and weeds
      if (fenced) {
        const kind = h < 0.2 ? 0 : h < 0.42 ? 1 : h < 0.57 ? 2 : h < 0.7 ? 3 : h < 0.8 ? 4 : 5;
        a.push({ x, y, z, rot, framed: false, kind });
        continue;
      }
      const kind = h < 0.45 ? 5 : h < 0.75 ? 1 : h < 0.84 ? 0 : h < 0.89 ? 2 : h < 0.94 ? 3 : 4;
      const p = layPit(x, z);
      if (p) a.push({ x: p.x, y, z: p.z, rot: p.rot, framed: true, kind });
    }
    pits.set(key, a);
    dirty = true;
  }, (key) => { if (pits.delete(key)) dirty = true; });
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _Y = new THREE.Vector3(0, 1, 0);
  // FP37 (core/engine.js, the film policy): while recording, a pit (and its ivy) is drawn for the whole take when the take's
  // path comes within reach of it at any point, set once per take (fpNear2: the squared distance of the nearest approach)
  const fpNear2 = (P, x, z) => { let d = Infinity; for (let j = 0; j < P.length; j += 3) { const ax = x - P[j], az = z - P[j + 2], q = ax * ax + az * az; if (q < d) d = q; } return d; };
  const rebin = (cx, cz, fp = null) => {
    const n = meshes.map((pair) => pair.map(() => 0));
    let all = 0, drawn = 0, ni = 0;
    for (const a of pits.values()) for (const t of a) {
      all++;
      const d2 = fp ? fpNear2(fp.pts, t.x, t.z) : (t.x - cx) ** 2 + (t.z - cz) ** 2;
      const dx = Math.sqrt(d2), dz = 0;
      if (dx * dx + dz * dz > PIT_R * PIT_R) continue;
      const f = t.framed ? 1 : 0, m = meshes[t.kind][f];
      const i = n[t.kind][f];
      if (i >= CAP) continue;
      _m.compose(_p.set(t.x, t.y, t.z), _q.setFromAxisAngle(_Y, t.rot), _s);
      m.setMatrixAt(i, _m);
      n[t.kind][f] = i + 1; drawn++;
      if (t.kind === 3 && ivyMesh && dx * dx + dz * dz < 1600 && ni + 2 <= CAP * 2) {
        // one mat (1.1 m round at scale 1) in a guard's 1.48 m box, two along an open 2.2 x 1.24 m pit; low, spilling a little over the edge
        const offs = t.framed ? [-0.5, 0.5] : [0];
        const c = Math.cos(t.rot), sn = Math.sin(t.rot);
        for (const o of offs) {
          _m.compose(_p.set(t.x + c * o, t.y + 0.03, t.z - sn * o), _q.setFromAxisAngle(_Y, t.rot + o * 2.1), _s.set(t.framed ? 1.05 : 1.3, 0.5, t.framed ? 1.05 : 1.3));
          ivyMesh.setMatrixAt(ni++, _m);
        }
        _s.set(1, 1, 1);
      }
    }
    meshes.forEach((pair, k) => pair.forEach((m, f) => { m.count = n[k][f]; m.instanceMatrix.needsUpdate = true; m.visible = m.count > 0; }));
    if (ivyMesh) { ivyMesh.count = ni; ivyMesh.instanceMatrix.needsUpdate = true; ivyMesh.visible = ni > 0; }
    stats.pits = all; stats.drawn = drawn; stats.ivy = ni;
  };
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
  const trig = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false }));
  trig.frustumCulled = false; trig.name = 'vg36:pits:lod'; trig.renderOrder = -1000;
  let fpV = -1;
  trig.onBeforeRender = (r, s, cam) => {
    if (!cam.isPerspectiveCamera || (cam.parent && cam.parent.isCubeCamera) || cam !== engine.camera) return;
    const fp = typeof window !== 'undefined' && window.__FP37 && window.__FP37.pts ? window.__FP37 : null;
    if (fp) {
      if (!dirty && fp.v === fpV) return;
      dirty = false; fpV = fp.v; lx = 1e12;
      try { rebin(0, 0, fp); } catch (e) { console.warn('[vg36] pits', e); }
      return;
    }
    fpV = -1;
    const cx = cam.position.x, cz = cam.position.z;
    if (!dirty && (cx - lx) ** 2 + (cz - lz) ** 2 < 9) return;
    dirty = false; lx = cx; lz = cz;
    try { rebin(cx, cz); } catch (e) { console.warn('[vg36] pits', e); }
  };
  G.add(trig);
  const api = { stats, pits, group: G };
  if (typeof window !== 'undefined') window.__VG36P = api;
  console.log(`[vg36] tree pits on: ${KINDS} kinds, drawn within ${PIT_R} m`);
  return api;
}
