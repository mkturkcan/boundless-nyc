// TP28 — the Times Square plaza (owner 2026-09-27: "Work on some new areas like Times Square and Bryant Park for the
// new teaser"). Broadway from 42nd to 47th St has been a pedestrian plaza since 2009 (rebuilt flush in precast pavers in
// 2017). The compiler already takes its traffic away (CSCL non-vehicular, compile.mjs pedStreet: bit 7 of rclass) but
// keeps the street's ground, so the bowtie still drew as an asphalt avenue with gutters down both kerbs. Here the
// ground build re-kinds that asphalt: every asphalt, gutter or bus-lane triangle is cut exactly against the plaza (the
// pedestrianised Broadway ribbons) minus the carriageways that still cross it (Seventh Avenue and the cross streets,
// bridged across the plaza where CSCL leaves a gap), and the plaza part becomes matId 16, the paver branch of the
// ground shader (materials.js). Paint inside the plaza goes. `?tp28=0` restores the compiled ground.
import * as THREE from 'three';
import { ENV, applyLightTrim as LT } from '../world/materials.js';
export const TP28 = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('tp28') === '0');
export const TP_MAT = 16;

// Broadway's pedestrian pieces between 42nd and 47th lie in this box (world x, z)
const BOX = { x0: -1330, x1: -1120, z0: 2600, z1: 3070 };

// a convex quad for the ribbon piece p -> q, half width hw, extended e0 / e1 metres past its ends
function ribbonQuad(p, q, hw, e0, e1) {
  const dx = q[0] - p[0], dz = q[2] - p[2], L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L, nx = -uz, nz = ux;
  const ax = p[0] - ux * e0, az = p[2] - uz * e0, bx = q[0] + ux * e1, bz = q[2] + uz * e1;
  return mkConvex([[ax + nx * hw, az + nz * hw], [bx + nx * hw, bz + nz * hw], [bx - nx * hw, bz - nz * hw], [ax - nx * hw, az - nz * hw]]);
}
export function mkConvex(q) {
  let a = 0, x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
  for (let i = 0; i < q.length; i++) {
    const p = q[i], r = q[(i + 1) % q.length];
    a += p[0] * r[1] - r[0] * p[1];
    x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]);
  }
  return { q, s: a >= 0 ? 1 : -1, bb: [x0, z0, x1, z1] };
}

// The plaza and the carriageways across it, for one tile, from the tile's own road records (world pts). null when the
// tile holds no piece of the plaza.
export function tpRegions(roads) {
  if (!TP28) return null;
  const ped = [], car = [], ends = [];
  let bb = [1e9, 1e9, -1e9, -1e9];
  for (const r of roads) {
    if (r.level > 0 || r.pts.length < 2) continue;
    const inBox = r.pts.some((p) => p[0] > BOX.x0 && p[0] < BOX.x1 && p[2] > BOX.z0 && p[2] < BOX.z1);
    if (!inBox) continue;
    const hw = r.width / 2, last = r.pts.length - 2;
    if (r.noTraffic) {
      if (!/BROADWAY/.test(r.name || '')) continue;
      for (let k = 0; k <= last; k++) {
        const Q = ribbonQuad(r.pts[k], r.pts[k + 1], hw + 0.5, k === 0 ? 0 : 0.8, k === last ? 0 : 0.8);   // + 0.5: the gutter strips to the kerb (only asphalt is re-kinded, so nothing past the kerb is touched)
        ped.push(Q);
        bb = [Math.min(bb[0], Q.bb[0]), Math.min(bb[1], Q.bb[1]), Math.max(bb[2], Q.bb[2]), Math.max(bb[3], Q.bb[3])];
      }
    } else if (r.rclass <= 4) {
      for (let k = 0; k <= last; k++) car.push(ribbonQuad(r.pts[k], r.pts[k + 1], hw, k === 0 ? 3 : 0.8, k === last ? 3 : 0.8));
      const P = r.pts, n = P.length;
      const d0 = [P[0][0] - P[1][0], P[0][2] - P[1][2]], d1 = [P[n - 1][0] - P[n - 2][0], P[n - 1][2] - P[n - 2][2]];
      const l0 = Math.hypot(d0[0], d0[1]) || 1, l1 = Math.hypot(d1[0], d1[1]) || 1;
      ends.push({ p: P[0], d: [d0[0] / l0, d0[1] / l0], hw, name: r.name, r });
      ends.push({ p: P[n - 1], d: [d1[0] / l1, d1[1] / l1], hw, name: r.name, r });
    }
  }
  if (!ped.length) return null;
  // CSCL stops a cross street at both edges of the plaza (W 43rd: 19 m apart, W 44th 16, W 45th 13, W 46th 10), and the
  // junction asphalt between them is still that street's carriageway: bridge each such pair (same name, the gap running
  // on with both ends, facing each other) with the narrower street's width.
  for (const a of ends) for (const b of ends) {
    if (a === b || a.r === b.r || a.name !== b.name) continue;
    const gx = b.p[0] - a.p[0], gz = b.p[2] - a.p[2], g = Math.hypot(gx, gz);
    if (g < 1 || g > 32) continue;
    if ((gx * a.d[0] + gz * a.d[1]) / g < 0.96 || a.d[0] * b.d[0] + a.d[1] * b.d[1] > -0.9) continue;
    car.push(ribbonQuad(a.p, b.p, Math.min(a.hw, b.hw), 0.5, 0.5));
  }
  return { ped, car, bb };
}

// ---- convex clipping (vertices [x, y, z]; y interpolates with the plane it lies on)
function clipHalf(poly, ax, az, bx, bz, s, inside) {
  const out = [], n = poly.length, ex = bx - ax, ez = bz - az;
  let P = poly[n - 1], sp = s * (ex * (P[2] - az) - ez * (P[0] - ax));
  if (!inside) sp = -sp;
  for (let i = 0; i < n; i++) {
    const Q = poly[i];
    let sq = s * (ex * (Q[2] - az) - ez * (Q[0] - ax));
    if (!inside) sq = -sq;
    if ((sp >= 0) !== (sq >= 0)) {
      const t = sp / (sp - sq);
      out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t, P[2] + (Q[2] - P[2]) * t]);
    }
    if (sq >= 0) out.push(Q);
    P = Q; sp = sq;
  }
  return out.length >= 3 ? out : null;
}
function area(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p[0] * q[2] - q[0] * p[2]; }
  return Math.abs(a) / 2;
}
function hits(poly, C) {
  let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
  for (const p of poly) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[2] < z0) z0 = p[2]; if (p[2] > z1) z1 = p[2]; }
  return !(x1 < C.bb[0] || x0 > C.bb[2] || z1 < C.bb[1] || z0 > C.bb[3]);
}
function cut(poly, C) {
  // [inside C, [convex pieces outside C]]
  const outs = [];
  let cur = poly;
  for (let i = 0; i < C.q.length && cur; i++) {
    const a = C.q[i], b = C.q[(i + 1) % C.q.length];
    const o = clipHalf(cur, a[0], a[1], b[0], b[1], C.s, false);
    if (o && area(o) > 1e-4) outs.push(o);
    cur = clipHalf(cur, a[0], a[1], b[0], b[1], C.s, true);
  }
  return [cur && area(cur) > 1e-4 ? cur : null, outs];
}
// split one triangle (world [x, y, z] x 3) into { plaza: [polys], road: [polys] }
export function tpSplit(tri, R) {
  let rest = [tri];
  const inPed = [];
  for (const C of R.ped) {
    const nr = [];
    for (const p of rest) {
      if (!hits(p, C)) { nr.push(p); continue; }
      const [i, outs] = cut(p, C);
      if (i) inPed.push(i);
      nr.push(...outs);
    }
    rest = nr;
    if (!rest.length) break;
  }
  let plaza = inPed;
  for (const C of R.car) {
    if (!plaza.length) break;
    const np = [];
    for (const p of plaza) {
      if (!hits(p, C)) { np.push(p); continue; }
      const [i, outs] = cut(p, C);
      if (i) rest.push(i);
      np.push(...outs);
    }
    plaza = np;
  }
  return { plaza, road: rest };
}
// is (x, z) on the plaza (for the paint that goes)
export function tpOnPlaza(x, z, R) {
  const inside = (C) => {
    if (x < C.bb[0] || x > C.bb[2] || z < C.bb[1] || z > C.bb[3]) return false;
    for (let i = 0; i < C.q.length; i++) {
      const a = C.q[i], b = C.q[(i + 1) % C.q.length];
      if (C.s * ((b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0])) < 0) return false;
    }
    return true;
  };
  return R.ped.some(inside) && !R.car.some(inside);
}

// ---- the tile's ground, re-kinded (world/assemble.js, before anything samples the sections)
export function tpTileHit(ox, oz) {
  return TP28 && !(ox + 512 < BOX.x0 || ox > BOX.x1 || oz + 512 < BOX.z0 || oz > BOX.z1);
}
// Cuts the asphalt, gutter and bus-lane triangles of `tile` (local coords, origin ox, oz) against the plaza, drops the
// paint on it, and puts the plaza's triangles in a new section `plaza` (a WALK kind to every sampler: the walkers and the
// parking check see pavement, not carriageway). Returns the plaza's area in m2 (0: no plaza in this tile).
export function tpApply(tile, ox, oz, roadsW) {
  const R = tpRegions(roadsW);
  if (!R) return 0;
  const [bx0, bz0, bx1, bz1] = R.bb;
  const plaza = [];
  let m2 = 0;
  const fan = (poly, out) => {
    for (let k = 1; k + 1 < poly.length; k++) for (const p of [poly[0], poly[k], poly[k + 1]]) out.push(p[0] - ox, p[1], p[2] - oz);
  };
  for (const name of ['asphalt', 'gutter', 'busred']) {
    const a = tile.S[name];
    if (!a || a.length < 9) continue;
    const out = [];
    let changed = false;
    for (let i = 0; i + 8 < a.length; i += 9) {
      const x0 = a[i] + ox, z0 = a[i + 2] + oz, x1 = a[i + 3] + ox, z1 = a[i + 5] + oz, x2 = a[i + 6] + ox, z2 = a[i + 8] + oz;
      const keep = () => { for (let k = 0; k < 9; k++) out.push(a[i + k]); };
      if (Math.max(x0, x1, x2) < bx0 || Math.min(x0, x1, x2) > bx1 || Math.max(z0, z1, z2) < bz0 || Math.min(z0, z1, z2) > bz1) { keep(); continue; }
      const S = tpSplit([[x0, a[i + 1], z0], [x1, a[i + 4], z1], [x2, a[i + 7], z2]], R);
      if (!S.plaza.length) { keep(); continue; }
      changed = true;
      for (const poly of S.road) fan(poly, out);
      for (const poly of S.plaza) { fan(poly, plaza); m2 += area(poly); }
    }
    if (changed) tile.S[name] = Float32Array.from(out);
  }
  for (const name of ['paintW', 'paintY', 'paintG']) {
    const a = tile.S[name];
    if (!a || a.length < 9) continue;
    const out = [];
    let dropped = 0;
    for (let i = 0; i + 8 < a.length; i += 9) {
      const cx = (a[i] + a[i + 3] + a[i + 6]) / 3 + ox, cz = (a[i + 2] + a[i + 5] + a[i + 8]) / 3 + oz;
      if (cx > bx0 && cx < bx1 && cz > bz0 && cz < bz1 && tpOnPlaza(cx, cz, R)) { dropped++; continue; }
      for (let k = 0; k < 9; k++) out.push(a[i + k]);
    }
    if (dropped) tile.S[name] = Float32Array.from(out);
  }
  // Duffy Square's lawn strip (the Parks polygon) and the island's walk are paved like the plaza round it
  for (const name of ['sidewalk']) {
    const a = tile.S[name];
    if (!a || a.length < 9) continue;
    const out = [];
    let moved = 0;
    for (let i = 0; i + 8 < a.length; i += 9) {
      const cx = (a[i] + a[i + 3] + a[i + 6]) / 3 + ox, cz = (a[i + 2] + a[i + 5] + a[i + 8]) / 3 + oz;
      if (tpInIsland(cx, cz)) { for (let k = 0; k < 9; k++) plaza.push(a[i + k]); moved++; continue; }
      for (let k = 0; k < 9; k++) out.push(a[i + k]);
    }
    if (moved) tile.S[name] = Float32Array.from(out);
  }
  for (const name of ['grass', 'grassU']) {
    const a = tile.S[name];
    if (!a || a.length < 9) continue;
    const out = [];
    let moved = 0;
    for (let i = 0; i + 8 < a.length; i += 9) {
      const cx = (a[i] + a[i + 3] + a[i + 6]) / 3 + ox, cz = (a[i + 2] + a[i + 5] + a[i + 8]) / 3 + oz;
      if (tpDuffyIn(cx, cz)) { for (let k = 0; k < 9; k++) plaza.push(a[i + k]); moved++; continue; }
      for (let k = 0; k < 9; k++) out.push(a[i + k]);
    }
    if (moved) tile.S[name] = Float32Array.from(out);
  }
  if (!plaza.length) return 0;
  tile.S.plaza = Float32Array.from(plaza);
  if (typeof window !== 'undefined') window.__TP28 = (window.__TP28 || 0) + m2;
  console.log(`[tp28] ${m2.toFixed(0)} m2 of the Broadway plaza in this tile (${R.ped.length} plaza pieces, ${R.car.length} carriageway pieces)`);
  return m2;
}

// ---- walkers on the plaza (sim/peds.js): promenade lines along each pedestrian Broadway piece, 4.3 m apart across its
// 18 m, like College Walk's; the walk builder cuts them where a carriageway crosses and at anything built on the plaza
export function tpPromenades(roads) {
  if (!TP28) return [];
  const out = [];
  for (const r of roads) {
    if (!r.noTraffic || r.level > 0 || r.pts.length < 2 || !/BROADWAY/.test(r.name || '')) continue;
    if (!r.pts.some((p) => p[0] > BOX.x0 && p[0] < BOX.x1 && p[2] > BOX.z0 && p[2] < BOX.z1)) continue;
    const half = r.width / 2 - 2.6;
    for (const f of [-1, -1 / 3, 1 / 3, 1]) out.push({ pts: r.pts, off: f * half });
  }
  return out;
}

// ---- Duffy Square (46th-47th St, between Broadway and Seventh Avenue) --------------------------------------------------
// The compiled island is an NYC Parks lawn strip; the real one is paved like the rest of the plaza and carries the TKTS
// booth under its red steps (2008): 27 red glass steps rising north to 4.9 m, seats for the view down the bowtie, the
// risers lit red from inside. The island's grass goes to the plaza pavers (tpApply), and the steps are built here, on the
// booth's own footprint (tile -3_5 building 93: a 17.4 m wedge, 10.5 m wide at the south end and 14.5 m at the north,
// 4.9 m tall, its axis between Broadway's and Seventh Avenue's), which the assembler no longer builds as a shop box.
const DUFFY = { c: [-1157.65, 2661.15], a: [0.374, -0.927], halfW: 5.75, run: 13.5, land: 3.9, n: 27, top: 4.9 };
// buildings that are not there: the booth (its footprint carries the steps) and the 3 m storefront box the footprints put
// on the Broadway plaza between 46th and 47th (centroid -1179.2, 2671.5)
export function tpSkipBuilding(cx, cz, h, area) {
  if (!TP28 || h > 6 || area > 400) return false;
  return Math.hypot(cx - DUFFY.c[0], cz - DUFFY.c[1]) < 3 || Math.hypot(cx + 1179.2, cz - 2671.5) < 2.5;
}
export function tpDuffyIn(x, z) {
  const dx = x - DUFFY.c[0], dz = z - DUFFY.c[1];
  return Math.hypot(dx, dz) < 32;
}
// The island itself, 46th to 47th between the Broadway plaza and Seventh Avenue: inside all four street lines (the
// compiled centre lines, each moved out by its half width), on the side of each that holds the booth. Its concrete walk
// goes to the pavers too, so the whole square is one surface (the lawn strip alone read as a dark carpet on a pale walk).
const ISLAND = (() => {
  const L = [
    [[-1191.9, 2711.4], [-1172.4, 2633.8], 9.15],   // Broadway (the plaza's east edge)
    [[-1167.5, 2724.7], [-1139.7, 2671.6], 7.6],    // Seventh Avenue (its west kerb)
    [[-1131.2, 2655.2], [-1166.2, 2635.7], 4.55],   // W 47th St (its south kerb)
    [[-1167.5, 2724.7], [-1191.9, 2711.4], 5.2],    // W 46th St (its north kerb)
  ];
  const [bx, bz] = DUFFY.c;
  return L.map(([a, b, hw]) => {
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz), ux = dx / l, uz = dz / l;
    const sd = (x, z) => (x - a[0]) * -uz + (z - a[1]) * ux;          // signed distance from the centre line
    const side = Math.sign(sd(bx, bz));
    return (x, z) => side * sd(x, z) > hw;
  });
})();
export function tpInIsland(x, z) {
  return Math.hypot(x - DUFFY.c[0], z - DUFFY.c[1]) < 60 && ISLAND.every((f) => f(x, z));
}
export function tpStepsOwner(ox, oz) {
  return TP28 && DUFFY.c[0] >= ox && DUFFY.c[0] < ox + 512 && DUFFY.c[1] >= oz && DUFFY.c[1] < oz + 512;
}
let _stepMats = null;
function stepMats() {
  if (_stepMats) return _stepMats;
  // the risers: red glass lit from behind, a light source after dark (the board material's night lift, redder)
  const riser = new THREE.MeshBasicMaterial({ color: 0xa00b08 });
  riser.onBeforeCompile = (sh) => {
    sh.uniforms.bbNight = ENV.night;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float bbNight;')
      .replace('#include <fog_fragment>', 'gl_FragColor.rgb *= mix(0.55, 2.2, bbNight);\n#include <fog_fragment>');
  };
  riser.customProgramCacheKey = () => 'tkts-riser';
  // the treads and the sides: dark red glass, glossy
  const tread = LT(new THREE.MeshStandardMaterial({ color: 0x5a0a08, roughness: 0.16, metalness: 0.0, emissive: 0x3a0402, emissiveIntensity: 0.0 }));
  tread.onBeforeCompile = (sh) => {
    sh.uniforms.bbNight = ENV.night;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float bbNight;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(0.30, 0.012, 0.008) * bbNight;');
  };
  tread.customProgramCacheKey = () => 'tkts-tread';
  const steel = LT(new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.35, metalness: 0.85 }));
  const booth = new THREE.MeshBasicMaterial({ color: 0xf2efe6 });   // the lit ticket windows on the north face
  booth.onBeforeCompile = (sh) => {
    sh.uniforms.bbNight = ENV.night;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float bbNight;')
      .replace('#include <fog_fragment>', 'gl_FragColor.rgb *= mix(0.9, 2.2, bbNight);\n#include <fog_fragment>');
  };
  booth.customProgramCacheKey = () => 'tkts-booth';
  return (_stepMats = { riser, tread, steel, booth });
}
// the steps into `group` (world coords), standing on the ground at height y0
export function tpBuildSteps(group, y0) {
  if (!TP28) return;
  const M = stepMats();
  const [cx, cz] = DUFFY.c, [ax, az] = DUFFY.a, bx = -az, bz = ax;   // a: up the steps (north), b: across (east)
  const W = DUFFY.halfW, n = DUFFY.n, dRun = DUFFY.run / n, dRise = DUFFY.top / n, s0 = -(DUFFY.run + DUFFY.land) / 2;
  const P = (s, t, y) => [cx + ax * s + bx * t, y0 + y, cz + az * s + bz * t];
  const rise = [], tread = [], steel = [], booth = [];
  // a quad (A, B, C, D counter-clockwise seen from its front) as two triangles
  const quad = (arr, A, B, C, D) => arr.push(...A, ...B, ...C, ...A, ...C, ...D);
  for (let i = 0; i < n; i++) {
    const sA = s0 + i * dRun, sB = sA + dRun, yL = i * dRise, yH = (i + 1) * dRise;
    // riser: the vertical face at sA from yL to yH, facing south (-a)
    quad(rise, P(sA, -W, yL), P(sA, W, yL), P(sA, W, yH), P(sA, -W, yH));
    // tread: the horizontal face at yH from sA to sB, facing up
    quad(tread, P(sA, -W, yH), P(sA, W, yH), P(sB, W, yH), P(sB, -W, yH));
  }
  // the top landing, over the booth's north end
  const sL = s0 + DUFFY.run, sT = sL + DUFFY.land, yT = DUFFY.top;
  quad(tread, P(sL, -W, yT), P(sL, W, yT), P(sT, W, yT), P(sT, -W, yT));
  quad(tread, P(sL, W, 0), P(sT, W, 0), P(sT, W, yT), P(sL, W, yT));
  quad(tread, P(sT, -W, 0), P(sL, -W, 0), P(sL, -W, yT), P(sT, -W, yT));
  // the two sides: the sawtooth profile, a strip per step down to the ground (east side faces +b, west side faces -b)
  for (let i = 0; i < n; i++) {
    const sA = s0 + i * dRun, sB = sA + dRun, yH = (i + 1) * dRise;
    quad(tread, P(sA, W, 0), P(sB, W, 0), P(sB, W, yH), P(sA, W, yH));
    quad(tread, P(sB, -W, 0), P(sA, -W, 0), P(sA, -W, yH), P(sB, -W, yH));
  }
  // the north face (the booth): a dark glass wall with a band of lit ticket windows
  quad(tread, P(sT, W, 0), P(sT, -W, 0), P(sT, -W, yT), P(sT, W, yT));
  for (let k = 0; k < 6; k++) {
    const t0 = -W + 0.7 + k * ((2 * W - 1.4) / 6), t1 = t0 + (2 * W - 1.4) / 6 - 0.35;
    quad(booth, P(sT + 0.02, t1, 1.05), P(sT + 0.02, t0, 1.05), P(sT + 0.02, t0, 2.35), P(sT + 0.02, t1, 2.35));
  }
  // glass balustrades read as their steel: a handrail 1.0 m over the nosings each side, posts every 4 steps
  const bar = (A, B, r) => {
    const dx = B[0] - A[0], dy = B[1] - A[1], dz = B[2] - A[2], L = Math.hypot(dx, dy, dz);
    const g = new THREE.BoxGeometry(r, r, L).toNonIndexed();
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), new THREE.Vector3(dx, dy, dz), new THREE.Vector3(0, 1, 0));
    m.setPosition((A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2);
    g.applyMatrix4(m);
    steel.push(...g.getAttribute('position').array);
  };
  for (const t of [W - 0.08, -W + 0.08]) {
    bar(P(s0, t, 1.0 + dRise), P(sL, t, yT + 1.0), 0.06);
    bar(P(sL, t, yT + 1.0), P(sT, t, yT + 1.0), 0.06);
    for (let i = 0; i <= n; i += 4) { const s = s0 + Math.min(i, n) * dRun; bar(P(s, t, Math.min(i + 1, n) * dRise), P(s, t, Math.min(i + 1, n) * dRise + 1.0), 0.05); }
  }
  const mk = (arr, mat, name, shadow) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    g.computeVertexNormals(); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat);
    m.name = name; m.castShadow = shadow; m.receiveShadow = true;
    group.add(m);
  };
  mk(rise, M.riser, 'tp28:tktsRisers', false);
  mk(tread, M.tread, 'tp28:tktsSteps', true);
  mk(steel, M.steel, 'tp28:tktsRails', true);
  mk(booth, M.booth, 'tp28:tktsWindows', false);
  if (typeof window !== 'undefined') window.__TKTS = { c: DUFFY.c, y0 };
}
