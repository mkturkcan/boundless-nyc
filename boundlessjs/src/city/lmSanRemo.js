// lmSanRemo.js: The San Remo (Emery Roth, 1930; 145-146 Central Park West), built on its compiled footprint ring.
// CP33 landmarks round (owner 2026-09-30, "Central Park ... nothing flat or low poly"): the old builder was three boxes and
// two cones; the teaser frames the building from Bow Bridge and the Lake at 250-500 m, so what reads is the 17-storey
// limestone-and-buff-brick base with its cornice, the two 27-storey towers at the ends of the park front, their stepped
// upper stage and the Corinthian temple (a copy of the Choragic Monument of Lysicrates) with its lantern roof and finial.
// Facade tiles with recessed panes and a bump map, mouldings swept round the ring, a fluted peristyle: lmFacadeKit.js.
import * as THREE from 'three';
import { KIT } from './landmarkKit.js';
import {
  Acc, wallRing, capRing, loft, box, cyl, lathe, facadeTex, facadeMat, punchedPainter, offsetRing, addMeshes, triCount,
} from './lmFacadeKit.js';

const { mat } = KIT;

// ---- the frame of a front-facing ring: A along the longest edge, S out of it (toward the park), M its midpoint
export function frameOf(ring) {
  let li = 0, ll = -1;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L > ll) { ll = L; li = i; }
  }
  const a = ring[li], b = ring[(li + 1) % ring.length];
  const A = [(b[0] - a[0]) / ll, (b[1] - a[1]) / ll];
  let S = [A[1], -A[0]];
  // S must point out of the building: away from the ring's centroid
  let cx = 0, cz = 0;
  for (const p of ring) { cx += p[0]; cz += p[1]; }
  cx /= ring.length; cz /= ring.length;
  const M = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  if ((M[0] - cx) * S[0] + (M[1] - cz) * S[1] < 0) S = [-S[0], -S[1]];
  const P = (u, v) => [M[0] + A[0] * u + S[0] * v, M[1] + A[1] * u + S[1] * v];
  let a0 = 1e9, a1 = -1e9, s0 = 1e9;
  for (const p of ring) {
    const u = (p[0] - M[0]) * A[0] + (p[1] - M[1]) * A[1], v = (p[0] - M[0]) * S[0] + (p[1] - M[1]) * S[1];
    a0 = Math.min(a0, u); a1 = Math.max(a1, u); s0 = Math.min(s0, v);
  }
  return { A, S, M, P, a0, a1, s0, rot: Math.atan2(-A[1], A[0]) };
}
export function inRing(ring, x, z) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], zi = ring[i][1], xj = ring[j][0], zj = ring[j][1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
// a rectangle in the frame: u0..u1 along A, v0..v1 along S (v0 < v1 <= 0 behind the front line); the ring of its corners
export const frameRect = (F, u0, u1, v0, v1) => [F.P(u0, v0), F.P(u1, v0), F.P(u1, v1), F.P(u0, v1)];
// the deepest rectangle (u0..u1, front line at v1) that still lies inside the ring, up to dMax
function fitDepth(ring, F, u0, u1, v1, dMax) {
  for (let d = dMax; d > 5; d -= 0.5) {
    const v0 = v1 - d;
    let ok = true;
    for (const [u, v] of [[u0 + 0.3, v0 + 0.3], [u1 - 0.3, v0 + 0.3], [(u0 + u1) / 2, v0 + 0.3], [u0 + 0.3, (v0 + v1) / 2], [u1 - 0.3, (v0 + v1) / 2]]) {
      const [x, z] = F.P(u, v);
      if (!inRing(ring, x, z)) { ok = false; break; }
    }
    if (ok) return d;
  }
  return 6;
}

/* -------------------------------------------------------------- materials */
let _M = null;
function mats() {
  if (_M) return _M;
  const paintShaft = punchedPainter({ wall: [206, 190, 156], trim: [230, 222, 202], win: [0.44, 0.58], winY: 0.15, bars: 'dh', brick: 5, tone: 0.045 });
  const texShaft = facadeTex('sr-shaft', { nx: 4, ny: 4, cw: 160, ch: 176, seed: 7, base: [206, 190, 156], paint: paintShaft });
  // the base: rusticated limestone, the street floor with taller lights
  const pUp = punchedPainter({ wall: [214, 206, 186], trim: [234, 228, 212], win: [0.46, 0.56], winY: 0.16, bars: 'dh', brick: 0, rustic: 30, tone: 0.035, keystone: 1 });
  const pStreet = punchedPainter({ wall: [214, 206, 186], trim: [234, 228, 212], win: [0.50, 0.70], winY: 0.08, bars: 'tri', brick: 0, rustic: 30, tone: 0.035, keystone: 1 });
  const texBase = facadeTex('sr-base', { nx: 4, ny: 3, cw: 160, ch: 184, seed: 11, base: [214, 206, 186],
    paint: (g, gb, x, y, w, h, i, j, r) => (j === 2 ? pStreet : pUp)(g, gb, x, y, w, h, i, j, r) });
  const stone = { set: 'climestone', amt: 0.55, nrm: 0.6, rgh: 0.3, ashlar: 0.8 };
  _M = {
    tx: { shaft: texShaft, base: texBase },
    shaft: facadeMat('sr-shaft', texShaft, { rough: 0.88, bump: 2.0 }),
    base: facadeMat('sr-base', texBase, { rough: 0.85, bump: 2.2 }),
    stone: mat(0xdcd3be, { rough: 0.84, flat: false, stone }),
    stoneDk: mat(0x9a917e, { rough: 0.9, flat: false, stone: { ...stone, amt: 0.4 } }),
    granite: mat(0x8f8a80, { rough: 0.9, flat: false }),
    roof: mat(0x45464a, { rough: 0.92, flat: false }),
    cone: mat(0xc9bfa6, { rough: 0.8, flat: false, stone: { ...stone, amt: 0.4, scale: 0.7 } }),
    bronze: mat(0x4a4036, { rough: 0.5, metal: 0.7, flat: false }),
  };
  return _M;
}

/* -------------------------------------------------------------- the tholos */
// the Corinthian lantern crowning each tower: a plinth, eight fluted columns carrying an entablature round a dark cella, a
// stepped lead-and-stone roof and a finial. y0 is the platform; returns its height
export function tholos(S, cx, y0, cz, R, rot = 0) {
  const sq = 2 * R + 2.6;
  box(S.stone, cx, y0, cz, sq, 0.7, sq, rot);
  box(S.stone, cx, y0 + 0.7, cz, sq - 1.0, 0.45, sq - 1.0, rot);
  cyl(S.stone, cx, y0 + 1.15, cz, R + 0.75, R + 0.9, 0.5, 28);
  const yc = y0 + 1.65, Hc = 5.5;
  cyl(S.dark, cx, yc, cz, R - 0.85, R - 0.85, Hc + 0.3, 28);                                       // the cella
  const n = 8, rc = 0.46;
  for (let k = 0; k < n; k++) {
    const a = rot + (k + 0.5) * Math.PI * 2 / n, x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R;
    cyl(S.stone, x, yc, z, rc * 1.22, rc * 1.3, 0.32, 14);                                         // base
    cyl(S.stone, x, yc + 0.32, z, rc * 0.82, rc, Hc - 1.18, 16, 0, false, true);                    // fluted shaft (faceted)
    cyl(S.stone, x, yc + Hc - 0.86, z, rc * 1.12, rc * 0.84, 0.28, 14);                            // astragal and bell
    cyl(S.stone, x, yc + Hc - 0.58, z, rc * 1.5, rc * 1.12, 0.46, 14);
    for (let q = 0; q < 8; q++) {                                                                   // acanthus tips
      const b = q * Math.PI / 4;
      box(S.stone, x + Math.cos(b) * rc * 1.25, yc + Hc - 0.78, z + Math.sin(b) * rc * 1.25, 0.2, 0.34, 0.2, -b);
    }
    box(S.stone, x, yc + Hc - 0.13, z, rc * 3.0, 0.14, rc * 3.0, a);                                // abacus
  }
  const ye = yc + Hc;                                                                               // the entablature
  lathe(S.stone, cx, ye, cz, [[R - 1.1, 0], [R + 0.7, 0], [R + 0.7, 0.55], [R - 1.1, 0.55], [R - 1.1, 0]], 28);
  lathe(S.stone, cx, ye + 0.55, cz, [[R - 1.1, 0], [R + 0.55, 0], [R + 0.55, 0.7], [R - 1.1, 0.7], [R - 1.1, 0]], 28);
  lathe(S.stone, cx, ye + 1.25, cz, [[R - 1.1, 0], [R + 1.15, 0], [R + 1.15, 0.22], [R + 0.95, 0.30], [R + 0.95, 0.5], [R - 1.1, 0.5], [R - 1.1, 0]], 28);
  // the roof: a stepped, concave cone of leaf scales, an urn and a finial
  const yr = ye + 1.75;
  lathe(S.cone, cx, yr, cz, [[R + 0.85, 0], [R + 0.85, 0.25], [R + 0.5, 0.4], [R * 0.78, 1.5], [R * 0.52, 2.5], [R * 0.34, 3.2], [R * 0.22, 3.6], [0.55, 3.8], [0.55, 4.0], [0, 4.0]], 28);
  lathe(S.bronze, cx, yr + 4.0, cz, [[0.35, 0], [0.5, 0.25], [0.42, 0.6], [0.25, 0.9], [0.32, 1.1], [0.1, 2.0], [0, 2.3]], 12);
  return 1.65 + Hc + 1.75 + 4.0 + 2.3;
}

/* ----------------------------------------------------------------- builder */
const PROF = {
  cornice: [[0, 0], [0.3, 0], [0.3, 0.14], [0.66, 0.14], [0.66, 0.3], [1.02, 0.3], [1.02, 0.56], [1.2, 0.64], [1.2, 0.98], [0.9, 0.98], [0.9, 1.12], [0, 1.12]],
  corniceS: [[0, 0], [0.22, 0], [0.22, 0.12], [0.5, 0.12], [0.5, 0.26], [0.78, 0.26], [0.78, 0.46], [0.9, 0.52], [0.9, 0.8], [0.68, 0.8], [0.68, 0.9], [0, 0.9]],
  string: [[0, 0], [0.22, 0], [0.22, 0.1], [0.34, 0.1], [0.34, 0.42], [0, 0.42]],
  parapet: [[0, 0], [0, 1.0], [-0.4, 1.0], [-0.4, 0]],
  cap: [[0.12, 0], [0.12, 0.14], [-0.5, 0.14], [-0.5, 0]],
  plinth: [[0, -2.6], [0.25, -2.6], [0.25, 0], [0, 0]],
};

export function buildSanRemo(ctx) {
  const g = new THREE.Group();
  let ring = ctx.footprint;
  if (!ring || ring.length < 4) {
    const w = (ctx.obb?.w || 60) / 2, d = (ctx.obb?.h || 40) / 2;
    ring = [[-w, -d], [w, -d], [w, d], [-w, d]];
  }
  const M = mats();
  const H = Math.max(80, ctx.height || 120);
  const k = H / 120.5;
  const F = frameOf(ring);
  const yG = 11.0 * k, yB = 60.7 * k, tholosH = 15.75, st2H = 8.2 * k, yT = H - tholosH - st2H - 1.3 * k;
  const FL = 3.55 * k;

  const W_base = new Acc(), W_shaft = new Acc(), S = { stone: new Acc(), dark: new Acc(), cone: new Acc(), bronze: new Acc() };
  const ROOF = new Acc(), GR = new Acc();

  // ---- the base: a water table, rusticated limestone to the third floor, buff brick and limestone above, the cornice
  loft(GR, ring, 0, PROF.plinth, false);
  wallRing(W_base, ring, 0, yG, M.tx.base, { bayW: 3.2, floorH: yG / 3, vRef: 0 });
  wallRing(W_shaft, ring, yG, yB, M.tx.shaft, { bayW: 3.2, floorH: FL, vRef: yG });
  loft(S.stone, ring, yG - 0.05, PROF.string, false);
  loft(S.stone, ring, yB, PROF.cornice, false);
  loft(S.stone, ring, yB + 1.12, PROF.parapet, false);
  loft(S.stone, ring, yB + 2.12, PROF.cap, false);
  capRing(ROOF, offsetRing(ring, -0.45), yB + 1.2);

  // ---- the two towers at the ends of the park front, and the penthouse between them
  const front = 0;
  const wT = Math.min(18, 0.3 * (F.a1 - F.a0));
  const towers = [[F.a0, F.a0 + wT], [F.a1 - wT, F.a1]];
  const colliders = [];
  for (const [u0, u1] of towers) {
    const d = fitDepth(ring, F, u0, u1, front, 21);
    const r1 = frameRect(F, u0, u1, front - d, front);
    wallRing(W_shaft, r1, yB, yT, M.tx.shaft, { bayW: 3.2, floorH: FL, vRef: yG });
    loft(S.stone, r1, yT, PROF.corniceS, false);
    // quoins up each corner, on both faces
    for (const [su, sv] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const uc = su > 0 ? u1 : u0, vc = sv > 0 ? front : front - d;
      const [qx, qz] = F.P(uc - su * 0.45, vc + sv * 0.07);
      box(S.stone, qx, yB + 1.1, qz, 0.9, yT - yB - 1.1, 0.14, F.rot);
      const [px, pz] = F.P(uc + su * 0.07, vc - sv * 0.45);
      box(S.stone, px, yB + 1.1, pz, 0.14, yT - yB - 1.1, 0.9, F.rot);
    }
    // the upper stage, set in from the shaft, with its own cornice and the platform of the lantern
    const r2 = offsetRing(r1, -1.35);
    const y2 = yT + 1.12;
    capRing(ROOF, offsetRing(r1, -0.1), y2);
    wallRing(W_shaft, r2, y2, y2 + st2H, M.tx.shaft, { bayW: 2.6, floorH: FL, vRef: yG });
    loft(S.stone, r2, y2 + st2H, PROF.corniceS, false);
    capRing(ROOF, offsetRing(r2, 0.2), y2 + st2H + 0.9);
    const [cx, cz] = F.P((u0 + u1) / 2, front - d / 2);
    tholos(S, cx, y2 + st2H + 0.9, cz, Math.min(4.8, wT * 0.26), F.rot);
    const [bx, bz] = [cx, cz];
    colliders.push({ x: bx, y: H / 2, z: bz, w: wT, h: H, d, rotY: F.rot });
  }
  // the penthouse: two storeys over the middle of the base, set back from the front
  const mu0 = towers[0][1] + 6.0, mu1 = towers[1][0] - 6.0;
  if (mu1 - mu0 > 8) {
    const dP = fitDepth(ring, F, mu0, mu1, -3.0, 12);
    const rp = frameRect(F, mu0, mu1, -3.0 - dP, -3.0);
    const yp = yB + 1.12, hp = 3 * FL;
    wallRing(W_shaft, rp, yp, yp + hp, M.tx.shaft, { bayW: 3.2, floorH: FL, vRef: yG });
    loft(S.stone, rp, yp + hp, PROF.corniceS, false);
    capRing(ROOF, offsetRing(rp, 0.1), yp + hp + 0.9);
  }
  // collider: the base slab
  const baseD = Math.abs(F.s0);
  colliders.push({ x: F.P((F.a0 + F.a1) / 2, -baseD / 2)[0], y: yB / 2, z: F.P((F.a0 + F.a1) / 2, -baseD / 2)[1], w: F.a1 - F.a0, h: yB, d: baseD, rotY: F.rot });

  addMeshes(g, [
    [GR, M.granite, 'sr-plinth'], [W_base, M.base, 'sr-base'], [W_shaft, M.shaft, 'sr-shaft'],
    [S.stone, M.stone, 'sr-stone'], [S.dark, M.stoneDk, 'sr-cella'], [S.cone, M.cone, 'sr-roof'], [S.bronze, M.bronze, 'sr-finial'], [ROOF, M.roof, 'sr-deck'],
  ]);
  g.userData.colliderBoxes = colliders;
  g.userData.tris = triCount([[GR], [W_base], [W_shaft], [S.stone], [S.dark], [S.cone], [S.bronze], [ROOF]]);
  return g;
}
