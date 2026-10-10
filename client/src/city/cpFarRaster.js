// CP33 FAR PARK, the rasters (pure data, no three.js: tools/cp/farpark_probe.mjs runs it in node). Teaser 4 review: "everything
// more than ~900 m from the lens renders as a flat grey plane with no trees and a straight edge across the park ... the
// Reservoir shows as a darker grey slab". Past the near tiles (~1.3 km) the city is the far LoD, and the far LoD's park is the
// NAIP photo laid flat on the ground (materials.js, matId 8): no canopy, no relief, no water. This module bakes the park again
// from the same data the near tiles plant from: every measured crown (cpFloraData CP_TREES, 16,951), the woodland lattice
// inside the OSM woods (the near tiles' fillWoods, same positions), the ground's relief, the lakes, the transverse roads, on
// the park's own rectangle (the grid's bearing, centre (447.2, 82.2), 4168 x 902 m; the same frame as cp32_park_far.jpg) at 2 m
// a texel. cpFar.js turns them into a displaced mesh and two textures.
//
//   S      surface height (ground + canopy, or the water level), m
//   col    RGBA8: albedo of the canopy / open ground (sRGB bytes), alpha 255 inside the park outline
//   nrm    RGBA8: R, G = the surface normal's x and z (0.5 + 0.5 n), B = canopy coverage, A = water coverage
import { CP_TREES, CP_FORMS, CP_PARK, CP_TRANSVERSE, CP_SP37, CP_SPCH, CP_SPECIES, CP_WOODMIX } from './cpFloraData.js';
import { WATER, WOODS } from './cpLandData.js';
import { cpRelief, CP_DATUM } from './cpRelief.js';
import { cpWaterLevelY } from './cpLand.js';

export const FAR = { CX: 447.2, CZ: 82.2, UX: 0.4848, UZ: -0.8746, VX: 0.8746, VZ: 0.4848, HU: 2084, HV: 451, RES: 2, NU: 2084, NV: 451 };
const { CX, CZ, UX, UZ, VX, VZ, HU, HV, RES, NU, NV } = FAR;
const toIJ = (x, z) => { const dx = x - CX, dz = z - CZ; return [(dx * UX + dz * UZ + HU) / RES, (dx * VX + dz * VZ + HV) / RES]; };
export const farXZ = (i, j) => { const u = i * RES - HU, v = j * RES - HV; return [CX + u * UX + v * VX, CZ + u * UZ + v * VZ]; };

const frac = (v) => v - Math.floor(v);
const hh = (x, z, k) => frac(Math.sin(x * (12.9898 + k) + z * (78.233 - k * 0.7) + k * 3.1) * 43758.5453);   // cpFlora.js hh
const h2 = (i, j) => frac(Math.sin(i * 127.1 + j * 311.7) * 43758.5453);
const vn = (x, z) => {
  const i = Math.floor(x), j = Math.floor(z), u = x - i, v = z - j, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
  return (h2(i, j) * (1 - su) + h2(i + 1, j) * su) * (1 - sv) + (h2(i, j + 1) * (1 - su) + h2(i + 1, j + 1) * su) * sv;
};
const enc = (c) => Math.max(0, Math.min(255, Math.round(255 * Math.pow(Math.max(0, c), 1 / 2.2))));   // linear -> sRGB byte (the texture is decoded as sRGB)

// ---- the trees: cpFlora.js's sizes (heightOf, heightOpen, CW_K, CW_WOOD)
const CW_K = 1.3, CW_WOOD = 1.55;
const HK = { P: 1.05, H: 1.0, R: 0.9, Q: 1.12, M: 0.95, L: 1.0, G: 1.15, Y: 0.72, Z: 1.1, S: 1.0, X: 0.8, W: 0.8 };
const heightOf = (F, cw) => Math.min(30, 5.0 + 1.15 * Math.min(cw, 22) + 0.3 * Math.max(0, cw - 22)) * (HK[F] || 1);
const heightOpen = (F, cw) => Math.min(30, 3.0 + 1.25 * Math.min(cw, 22) + 0.3 * Math.max(0, cw - 22)) * (HK[F] || 1);
const WOOD_MIX = ['Q', 'Q', 'M', 'S', 'Z', 'W', 'P', 'L', 'M', 'W'];
// (SP37: the lattice's woodland mix by species, cpFloraData CP_WOODMIX; the CP32 letters above under ?sp37=0)
const WOOD_SP = CP_SP37 ? [...CP_WOODMIX].map((ch) => CP_SPECIES[CP_SPCH.indexOf(ch)]) : null;
// the leaf colour by form (linear albedo of a sunlit crown before the light), calibrated against the near crowns' tone in the
// t4Out probe (docs/notes/central-park-photoreal.md); the conifers dark blue-green
const LEAF = {
  P: [0.058, 0.100, 0.030], H: [0.066, 0.112, 0.034], R: [0.050, 0.086, 0.026], Q: [0.046, 0.080, 0.024], M: [0.054, 0.092, 0.028],
  L: [0.056, 0.098, 0.030], G: [0.064, 0.108, 0.028], Y: [0.060, 0.100, 0.034], Z: [0.050, 0.090, 0.028], S: [0.056, 0.094, 0.030],
  X: [0.050, 0.080, 0.030], W: [0.064, 0.104, 0.036],
};
const CONIFER = [0.026, 0.050, 0.034];

// ---- scanline fill of rings (flat world [x, z, ...] arrays, even-odd across all of them) into a byte mask
function fillRings(mask, rings, val) {
  const R = rings.map((r) => { const o = new Float64Array(r.length); for (let k = 0; k + 1 < r.length; k += 2) { const [i, j] = toIJ(r[k], r[k + 1]); o[k] = i; o[k + 1] = j; } return o; });
  let j0 = 1e9, j1 = -1e9;
  for (const o of R) for (let k = 1; k < o.length; k += 2) { j0 = Math.min(j0, o[k]); j1 = Math.max(j1, o[k]); }
  const xs = [];
  for (let j = Math.max(0, Math.floor(j0)); j <= Math.min(NV - 1, Math.ceil(j1)); j++) {
    const yc = j + 0.5;
    xs.length = 0;
    for (const o of R) {
      const n = o.length / 2;
      for (let k = 0, p = n - 1; k < n; p = k++) {
        const y0 = o[p * 2 + 1], y1 = o[k * 2 + 1];
        if ((y0 > yc) !== (y1 > yc)) xs.push(o[p * 2] + ((yc - y0) / (y1 - y0)) * (o[k * 2] - o[p * 2]));
      }
    }
    xs.sort((a, b) => a - b);
    for (let q = 0; q + 1 < xs.length; q += 2) {
      const a = Math.max(0, Math.ceil(xs[q] - 0.5)), b = Math.min(NU - 1, Math.floor(xs[q + 1] - 0.5));
      for (let i = a; i <= b; i++) mask[j * NU + i] = val;
    }
  }
}
// a polyline thickened to +-w metres
function strokeLine(mask, pts, w, val) {
  const rt = Math.ceil(w / RES) + 1;
  for (let k = 0; k + 3 < pts.length; k += 2) {
    const ax = pts[k], az = pts[k + 1], bx = pts[k + 2], bz = pts[k + 3], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9;
    const [ai, aj] = toIJ(ax, az), [bi, bj] = toIJ(bx, bz);
    for (let j = Math.max(0, Math.floor(Math.min(aj, bj)) - rt); j <= Math.min(NV - 1, Math.ceil(Math.max(aj, bj)) + rt); j++) {
      for (let i = Math.max(0, Math.floor(Math.min(ai, bi)) - rt); i <= Math.min(NU - 1, Math.ceil(Math.max(ai, bi)) + rt); i++) {
        const [x, z] = farXZ(i + 0.5, j + 0.5), t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
        if (Math.hypot(x - ax - dx * t, z - az - dz * t) <= w) mask[j * NU + i] = val;
      }
    }
  }
}

export function farRasters() {
  const N = NU * NV;
  const inside = new Uint8Array(N), woods = new Uint8Array(N), water = new Uint8Array(N), road = new Uint8Array(N);
  // the outline (decimetres), the woods, the water bodies that read from the air, the transverse roads
  fillRings(inside, [Array.from(CP_PARK, (v) => v / 10)], 1);
  for (const w of WOODS) fillRings(woods, [w.outer, ...(w.holes || [])], 1);
  const levels = [], lvByKey = new Map();
  for (const b of WATER) {
    if (b.kind === 'stream' || b.kind === 'basin' || b.dem == null) continue;
    let cx = 0, cz = 0;
    for (let k = 0; k < b.outer.length; k += 2) { cx += b.outer[k]; cz += b.outer[k + 1]; }
    cx /= b.outer.length / 2; cz /= b.outer.length / 2;
    const lv = cpWaterLevelY(b.k, cx, cz);
    levels.push({ k: b.k, level: lv });
    fillRings(water, [b.outer, ...(b.holes || [])], 1);
    lvByKey.set(b.k, lv);
  }
  // per-texel water level: bodies painted again by their own level (a small byte index into `levels`)
  const lvIdx = new Uint8Array(N);
  {
    let n = 0;
    for (const b of WATER) {
      if (b.kind === 'stream' || b.kind === 'basin' || b.dem == null) continue;
      n++;
      fillRings(lvIdx, [b.outer, ...(b.holes || [])], n);
    }
  }
  for (const L of CP_TRANSVERSE) strokeLine(road, Array.from(L, (v) => v / 10), 9, 1);

  // ---- the ground
  const G = new Float32Array(N);
  for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
    const [x, z] = farXZ(i + 0.5, j + 0.5);
    G[j * NU + i] = Math.max(3.6, CP_DATUM + cpRelief(x, z));
  }
  {
    // water: its level where the body is (n-th body in WATER order with a dem); the transverse roads on the city's datum
    const lv = [0];
    for (const b of WATER) { if (b.kind === 'stream' || b.kind === 'basin' || b.dem == null) continue; lv.push(lvByKey.get(b.k)); }
    for (let k = 0; k < N; k++) {
      if (water[k] && lvIdx[k]) G[k] = Math.max(3.6, lv[lvIdx[k]]);
      else if (road[k]) G[k] = 3.6;
    }
  }

  // ---- the canopy: crowns by height, the highest wins
  const H = new Float32Array(N);
  const rgb = new Uint8Array(N * 3);     // sRGB bytes of the crown on top
  const hs = new Map();                  // 8 m hash of the measured crowns (the lattice fill keeps 8 m clear of them)
  const keyOf = (x, z) => Math.floor(x / 8) * 8192 + Math.floor(z / 8);
  const crowns = [];
  for (let i = 0; i < CP_TREES.length; i += 4) {
    const x = CP_TREES[i] / 10, z = CP_TREES[i + 1] / 10, cw = CP_TREES[i + 2] / 10, code = CP_TREES[i + 3];
    const F = CP_FORMS[code & 15], con = (code >> 6) & 1, wood = (code >> 7) & 1;
    crowns.push([x, z, cw, F, con, wood]);
    const k = keyOf(x, z); let a = hs.get(k); if (!a) hs.set(k, (a = [])); a.push(x, z);
  }
  const nearTree = (x, z, r) => {
    for (let a = Math.floor((x - r) / 8); a <= Math.floor((x + r) / 8); a++) for (let b = Math.floor((z - r) / 8); b <= Math.floor((z + r) / 8); b++) {
      const q = hs.get(a * 8192 + b);
      if (q) for (let m = 0; m < q.length; m += 2) if ((q[m] - x) ** 2 + (q[m + 1] - z) ** 2 < r * r) return true;
    }
    return false;
  };
  // the woodland lattice (cpFlora.js fillWoods): an 8 m jittered lattice, a woodland-mix tree wherever no measured crown stands
  // within 8 m inside an OSM wood (not on the water)
  let fillN = 0;
  {
    const x0 = -1000, x1 = 1900, z0 = -2050, z1 = 2200;
    for (let gx = x0 + 4 - (x0 % 8); gx < x1; gx += 8) for (let gz = z0 + 4 - (z0 % 8); gz < z1; gz += 8) {
      const x = gx + (hh(gx, gz, 1) - 0.5) * 5, z = gz + (hh(gx, gz, 2) - 0.5) * 5;
      const [i, j] = toIJ(x, z);
      const ii = Math.floor(i), jj = Math.floor(j);
      if (ii < 0 || jj < 0 || ii >= NU || jj >= NV || !woods[jj * NU + ii] || water[jj * NU + ii] || road[jj * NU + ii]) continue;
      if (nearTree(x, z, 8)) continue;
      const sp = WOOD_SP && WOOD_SP[Math.floor(hh(x, z, 3) * WOOD_SP.length)];
      const F = sp ? sp[3] : WOOD_MIX[Math.floor(hh(x, z, 3) * WOOD_MIX.length)];
      crowns.push([x, z, 9 + 5 * hh(x, z, 4), F, sp ? sp[4] : 0, 1]);
      fillN++;
    }
  }
  for (const [x, z, cw, F, con, wood] of crowns) {
    const [ci, cj] = toIJ(x, z);
    const ii0 = Math.floor(ci), jj0 = Math.floor(cj);
    if (ii0 < 0 || jj0 < 0 || ii0 >= NU || jj0 >= NV || water[jj0 * NU + ii0] || road[jj0 * NU + ii0]) continue;
    const cwD = Math.min(26, cw * (wood ? CW_WOOD : CW_K));
    const h1 = hh(x, z, 9);
    const hD = (wood ? heightOf(F, cwD) : heightOpen(F, cwD)) * (0.92 + 0.16 * h1);
    const R = cwD / 2, Dc = Math.min(hD * 0.62, cwD * 0.78);
    const base = con ? CONIFER : LEAF[F] || LEAF.S;
    const GAIN = 1.25;   // (the far crowns read darker than the near ones through the haze: probe 07:50)
    const v = 0.86 + 0.28 * hh(x, z, 10), hj = (hh(x, z, 11) - 0.5) * 0.12;
    const tr = base[0] * v * GAIN * (1 + hj), tg = base[1] * v * GAIN, tb = base[2] * v * GAIN * (1 - hj * 0.6);
    const rt = R / RES + 1;
    for (let j = Math.max(0, Math.floor(cj - rt)); j <= Math.min(NV - 1, Math.ceil(cj + rt)); j++) {
      for (let i = Math.max(0, Math.floor(ci - rt)); i <= Math.min(NU - 1, Math.ceil(ci + rt)); i++) {
        const k = j * NU + i;
        if (water[k] || road[k]) continue;
        const r = Math.hypot((i + 0.5 - ci) * RES, (j + 0.5 - cj) * RES);
        if (r >= R) continue;
        const q = r / R;
        const [wx, wz] = farXZ(i + 0.5, j + 0.5);
        // a crown is a dome of clumps: the profile lifted and dropped by 0-2 m noise at 3 m, a cone for a conifer
        const dome = con ? 1 - q : Math.sqrt(1 - q * q);
        const bump = (vn(wx * 0.33, wz * 0.33) - 0.5) * 2.6 * (con ? 0.3 : 1) * dome;
        const h = hD - Dc * (1 - dome) + bump;
        if (h <= H[k]) continue;
        H[k] = h;
        // lit crown tops, the rims in their own shade; leaf clusters at 1 m
        const sh = (0.62 + 0.38 * Math.pow(dome, 0.55)) * (0.86 + 0.28 * vn(wx * 0.9 + 4.0, wz * 0.9 + 9.0));
        rgb[k * 3] = enc(tr * sh); rgb[k * 3 + 1] = enc(tg * sh); rgb[k * 3 + 2] = enc(tb * sh);
      }
    }
  }

  // ---- the surface, the normals, the colour
  const S = new Float32Array(N);
  for (let k = 0; k < N; k++) S[k] = G[k] + H[k];
  // a 7 x 7 mean of the surface (separable): the crevices between crowns are darker than the tops
  const tmp = new Float32Array(N), Sb = new Float32Array(N);
  for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
    let s = 0, c = 0;
    for (let d = -3; d <= 3; d++) { const ii = i + d; if (ii >= 0 && ii < NU) { s += S[j * NU + ii]; c++; } }
    tmp[j * NU + i] = s / c;
  }
  for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
    let s = 0, c = 0;
    for (let d = -3; d <= 3; d++) { const jj = j + d; if (jj >= 0 && jj < NV) { s += tmp[jj * NU + i]; c++; } }
    Sb[j * NU + i] = s / c;
  }
  const col = new Uint8Array(N * 4), nrm = new Uint8Array(N * 4);
  const asph = [enc(0.060), enc(0.062), enc(0.064)];
  let nCan = 0, nWat = 0, nIn = 0, nLawn = 0;
  for (let j = 0; j < NV; j++) {
    for (let i = 0; i < NU; i++) {
      const k = j * NU + i;
      const iL = Math.max(0, i - 1), iR = Math.min(NU - 1, i + 1), jD = Math.max(0, j - 1), jU = Math.min(NV - 1, j + 1);
      const dSu = (S[j * NU + iR] - S[j * NU + iL]) / ((iR - iL) * RES), dSv = (S[jU * NU + i] - S[jD * NU + i]) / ((jU - jD) * RES);
      const gx = dSu * UX + dSv * VX, gz = dSu * UZ + dSv * VZ;
      const il = 1 / Math.hypot(gx, 1, gz);
      nrm[k * 4] = Math.round(255 * (0.5 - 0.5 * gx * il)); nrm[k * 4 + 1] = Math.round(255 * (0.5 - 0.5 * gz * il));
      const can = H[k] > 1.5;
      const wat = water[k] === 1 && lvIdx[k] > 0;
      nrm[k * 4 + 2] = can ? 255 : 0; nrm[k * 4 + 3] = wat ? 255 : 0;
      col[k * 4 + 3] = inside[k] ? 255 : 0;
      if (!inside[k]) continue;
      nIn++;
      const [wx, wz] = farXZ(i + 0.5, j + 0.5);
      if (can) {
        nCan++;
        const ao = Math.max(0.5, Math.min(1.0, 1 - 0.07 * (Sb[k] - S[k])));
        col[k * 4] = Math.round(rgb[k * 3] * Math.pow(ao, 1 / 2.2)); col[k * 4 + 1] = Math.round(rgb[k * 3 + 1] * Math.pow(ao, 1 / 2.2)); col[k * 4 + 2] = Math.round(rgb[k * 3 + 2] * Math.pow(ao, 1 / 2.2));
      } else if (wat) {
        nWat++;
        col[k * 4] = enc(0.014); col[k * 4 + 1] = enc(0.034); col[k * 4 + 2] = enc(0.030);
      } else if (road[k]) {
        col[k * 4] = asph[0]; col[k * 4 + 1] = asph[1]; col[k * 4 + 2] = asph[2];
      } else {
        // open ground: the lawn (the ground shader's own palette), drier in patches; cpFar.js's fragment shader puts the aerial
        // photo's bare ground (ballfields, paths, courts) over it
        nLawn++;
        const n1 = vn(wx * 0.04 + 17.0, wz * 0.04 + 3.0), n2 = vn(wx * 0.5, wz * 0.5), n3 = vn(wx * 0.011 + 5.0, wz * 0.011 + 31.0);
        const lr = 0.085 + 0.067 * n1, lg = 0.160 + 0.078 * n1, lb = 0.050 + 0.026 * n1;
        const dry = Math.max(0, Math.min(1, (n3 - 0.58) * 4)) * 0.5;
        const v = 0.84 + 0.32 * n2;
        col[k * 4] = enc((lr + (0.205 - lr) * dry) * v); col[k * 4 + 1] = enc((lg + (0.208 - lg) * dry) * v); col[k * 4 + 2] = enc((lb + (0.086 - lb) * dry) * v);
      }
    }
  }
  return { NU, NV, S, G, H, col, nrm, inside, stats: { crowns: crowns.length, fill: fillN, canopy: nCan, water: nWat, lawn: nLawn, inside: nIn, levels } };
}
