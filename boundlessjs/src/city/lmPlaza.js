// lmPlaza.js: the Plaza Hotel's roofline (Henry J. Hardenbergh, 1907; 768 Fifth Avenue), CP33 landmarks round (2026-10-01).
// Review of teaser 4 (t4Dive, t4Gapstow): "the Plaza has its green mansard but a dirty grey facade; in reality it is white glazed
// brick and marble". The facade colour comes from the read-time override in shared/landmarkSpec.js (cp33Plaza); this builder is
// the roof it stands under: the old one was an OBB-sized slab of copper that hung past the real walls. Here the roof follows
// the compiled ring (notches collapsed): a limestone cornice, a steep verdigris copper mansard with a dormer every 5.4 m, a
// shallower upper slope with bronze cresting at the break, tall hipped pavilions on the main corners, brick chimneys.
// 'decorate' mode: the compiled extrusion stays and this is added at ctx.height.
import * as THREE from 'three';
import { KIT } from './landmarkKit.js';
import { Acc, box, cyl, loft, capRing, offsetRing, ringOutSign, addMeshes, triCount, rng, facadeTex, facadeMat, speckle } from './lmFacadeKit.js';

const { mat } = KIT;

/* ------------------------------------------------------------------ ring helpers */
function area2(r) { let A = 0; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; A += a[0] * b[1] - b[0] * a[1]; } return A; }
export function insideRing(ring, x, z) {
  let ins = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) ins = !ins;
  }
  return ins;
}
// replace every edge shorter than minLen by the intersection of its neighbours (a 2.5 m jog is not a roof edge)
export function collapseShort(ring, minLen) {
  let r = ring.map((p) => p.slice());
  for (let guard = 0; guard < 60 && r.length > 4; guard++) {
    let bi = -1, bl = minLen;
    for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < bl) { bl = L; bi = i; } }
    if (bi < 0) break;
    const n = r.length, A = r[bi], B = r[(bi + 1) % n], P = r[(bi - 1 + n) % n], Q = r[(bi + 2) % n];
    const d1 = [A[0] - P[0], A[1] - P[1]], d2 = [Q[0] - B[0], Q[1] - B[1]];
    const den = d1[0] * d2[1] - d1[1] * d2[0];
    const mid = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
    let X = mid;
    if (Math.abs(den) > 1e-6) {
      const t = ((B[0] - P[0]) * d2[1] - (B[1] - P[1]) * d2[0]) / den;
      const Xi = [P[0] + d1[0] * t, P[1] + d1[1] * t];
      if (Math.hypot(Xi[0] - mid[0], Xi[1] - mid[1]) <= 3 * minLen) X = Xi;
    }
    const out = [];
    for (let i = 0; i < n; i++) { if (i === bi) out.push(X); else if (i !== (bi + 1) % n) out.push(r[i]); }
    r = out;
  }
  return r;
}
// the ring moved inward by d with the same vertex count, or null when it folds (an edge reverses, the area grows, a vertex leaves)
export function insetRing(ring, d) {
  const off = offsetRing(ring, -Math.abs(d));
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n], c = off[i], e = off[(i + 1) % n];
    if ((b[0] - a[0]) * (e[0] - c[0]) + (b[1] - a[1]) * (e[1] - c[1]) <= 0) return null;
  }
  const A0 = area2(ring), A1 = area2(off);
  if (A0 * A1 <= 0 || Math.abs(A1) >= Math.abs(A0)) return null;
  for (const p of off) if (!insideRing(ring, p[0], p[1])) return null;
  return off;
}

/* ------------------------------------------------------------------ materials */
let _PM = null;
export function plazaMats() {
  if (_PM) return _PM;
  // standing-seam copper gone to verdigris: vertical seams with a raised bead, a flashing course, mottled patina
  const paintCu = (g, gb, x, y, w, h, i, j, r) => {
    g.fillStyle = 'rgb(118,166,146)'; g.fillRect(x, y, w, h);
    gb.fillStyle = 'rgb(140,140,140)'; gb.fillRect(x, y, w, h);
    for (let k = 0; k < 90; k++) {
      const dark = r() < 0.5, ww = 4 + r() * 18, hh = 6 + r() * 40;
      g.fillStyle = dark ? `rgba(40,86,70,${(0.05 + r() * 0.12).toFixed(3)})` : `rgba(190,226,204,${(0.04 + r() * 0.1).toFixed(3)})`;
      g.fillRect(x + r() * w, y + r() * h, ww, hh);
    }
    const sp = w / 4;
    for (let s = 0; s < 4; s++) {
      const sx = x + s * sp;
      g.fillStyle = 'rgba(30,64,52,0.55)'; g.fillRect(sx, y, 2.2, h);
      g.fillStyle = 'rgba(206,236,220,0.30)'; g.fillRect(sx + 2.2, y, 1.6, h);
      gb.fillStyle = 'rgb(214,214,214)'; gb.fillRect(sx, y, 3.4, h);
      gb.fillStyle = 'rgb(96,96,96)'; gb.fillRect(sx + 3.4, y, 1.6, h);
    }
    g.fillStyle = 'rgba(30,64,52,0.45)'; g.fillRect(x, y + h * 0.5, w, 2);
    gb.fillStyle = 'rgb(190,190,190)'; gb.fillRect(x, y + h * 0.5, w, 3);
    g.fillStyle = 'rgba(70,40,24,0.10)'; for (let k = 0; k < 6; k++) g.fillRect(x + r() * w, y, 1 + r() * 2, h);
  };
  const tCu = facadeTex('pl-copper', { nx: 1, ny: 1, cw: 256, ch: 256, seed: 31, base: [118, 166, 146], paint: paintCu });
  const paintBrick = (g, gb, x, y, w, h, i, j, r) => {
    g.fillStyle = 'rgb(176,150,128)'; g.fillRect(x, y, w, h);
    gb.fillStyle = 'rgb(140,140,140)'; gb.fillRect(x, y, w, h);
    for (let yy = 0; yy < h; yy += 8) { g.fillStyle = 'rgba(40,30,20,0.26)'; g.fillRect(x, y + yy, w, 1); gb.fillStyle = 'rgb(100,100,100)'; gb.fillRect(x, y + yy, w, 1.5); }
    speckle(g, x, y, w, h, r, 120, 0.12);
  };
  const tBr = facadeTex('pl-brick', { nx: 1, ny: 1, cw: 128, ch: 128, seed: 32, base: [176, 150, 128], paint: paintBrick });
  _PM = {
    copper: facadeMat('pl-copper', tCu, { rough: 0.55, metal: 0.25, bump: 1.4 }),
    brick: facadeMat('pl-brick', tBr, { rough: 0.9, bump: 1.6 }),
    stone: mat(0xeae4d4, { rough: 0.82, flat: false, stone: { set: 'climestone', amt: 0.45, nrm: 0.5, rgh: 0.3, ashlar: 0.6 } }),
    glass: mat(0x1c2a36, { rough: 0.15, metal: 0.4, flat: true }),
    bronze: mat(0x4a3d30, { rough: 0.5, metal: 0.6, flat: false }),
  };
  return _PM;
}

const COR = [[0, 0], [0.35, 0], [0.35, 0.18], [0.8, 0.18], [0.8, 0.4], [1.25, 0.4], [1.25, 0.7], [1.5, 0.8], [1.5, 1.2], [1.1, 1.2], [1.1, 1.4], [0, 1.4]];
const CREST = [[0.12, 0], [0.12, 0.5], [0.4, 0.8], [0, 1.1], [-0.4, 0.8], [-0.12, 0.5], [-0.12, 0]];

// a sloped band between two rings of the same vertex count, from y0 to y1; UV in metres / 2
function slopeBand(acc, R0, y0, R1, y1) {
  const n = R0.length, out = ringOutSign(R0);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const a = [R0[i][0], y0, R0[i][1]], b = [R0[j][0], y0, R0[j][1]], c = [R1[j][0], y1, R1[j][1]], d = [R1[i][0], y1, R1[i][1]];
    const e1 = [b[0] - a[0], 0, b[2] - a[2]], e2 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    const Lc = Math.hypot(e1[0], e1[2]); if (Lc < 0.05) continue;
    const Ls = Math.hypot(e2[0], e2[1], e2[2]);
    // the outward-facing normal of the sloped plane: horizontal part along the edge's outward side, the rise gives y
    const ox = out * e1[2] / Lc, oz = -out * e1[0] / Lc;
    const run = (d[0] - a[0]) * -ox + (d[2] - a[2]) * -oz;            // how far the top sits inward of the foot, along the edge normal
    const rise = d[1] - a[1];
    let nn = [ox * rise, Math.max(run, 0.2), oz * rise];
    const nl = Math.hypot(...nn); nn = [nn[0] / nl, nn[1] / nl, nn[2] / nl];
    acc.quad(a, b, c, d, nn, [0, 0], [Lc / 2, 0], [Lc / 2, Ls / 2], [0, Ls / 2]);
  }
}
// a square hip roof (a pavilion) of half-width hw about (cx, cz), top half-width hwTop at y0 + h, eave turned by rot
function hipSquare(acc, cx, cz, y0, hw, h, rot, hwTop = 0.6) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const P = (u, v, y) => [cx + u * c + v * s, y, cz - u * s + v * c];
  const base = [[-hw, -hw], [hw, -hw], [hw, hw], [-hw, hw]], top = [[-hwTop, -hwTop], [hwTop, -hwTop], [hwTop, hwTop], [-hwTop, hwTop]];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4, a = P(base[i][0], base[i][1], y0), b = P(base[j][0], base[j][1], y0);
    const cc = P(top[j][0], top[j][1], y0 + h), d = P(top[i][0], top[i][1], y0 + h);
    const mu = (base[i][0] + base[j][0]) / 2, mv = (base[i][1] + base[j][1]) / 2, m = Math.hypot(mu, mv) || 1;
    const dir = P(mu / m, mv / m, 0), dx = dir[0] - cx, dz = dir[2] - cz;
    const nrm = [dx * h, hw - hwTop, dz * h], nl = Math.hypot(...nrm);
    acc.quad(a, b, cc, d, [nrm[0] / nl, nrm[1] / nl, nrm[2] / nl], [0, 0], [hw, 0], [hwTop, h / 1.5], [0, h / 1.5]);
  }
  acc.quad(P(top[0][0], top[0][1], y0 + h), P(top[1][0], top[1][1], y0 + h), P(top[2][0], top[2][1], y0 + h), P(top[3][0], top[3][1], y0 + h), [0, 1, 0]);
}

/* ------------------------------------------------------------------- builder */
// o: { rise1, d1 (inset of the steep slope), rise2, d2add, dormerSpacing, dormerF, pavilions, chimneys, chimH: [min, spread], pitchNote }
export function buildCopperRoof(ctx, o = {}) {
  const O = Object.assign({ rise1: 9.0, d1: 3.3, rise2: 3.0, d2add: 3.0, dormerSpacing: 5.4, dormerF: 0.42, pavilions: 4, chimneys: 8, chimH: [6.5, 2.5], seed: 7, h: 76 }, o);
  const g = new THREE.Group();
  const src = ctx.footprint;
  if (!src || src.length < 4) return null;
  const M = plazaMats();
  const H = ctx.height || O.h;
  const c0 = collapseShort(src, 6.5);
  const ring = c0.length >= 4 && insetRing(c0, 0.3) ? c0 : src;
  const COP = new Acc(), STN = new Acc(), BRK = new Acc(), BRZ = new Acc(), WIN = new Acc();
  // the cornice crowns the wall; the mansard foot stands behind its parapet
  loft(STN, ring, H - 1.2, COR, false);
  const yF = H + 1.0, yM = yF + O.rise1;
  const R0 = insetRing(ring, 0.3) || ring;
  let R1 = null;
  let d1 = 0;
  for (let d = O.d1; d >= 1.0 && !R1; d -= 0.5) { R1 = insetRing(ring, d); d1 = d; }
  if (!R1) return null;
  let R2 = null;
  for (let d = d1 + O.d2add; d >= d1 + 0.5 && !R2; d -= 0.5) R2 = insetRing(ring, d);
  slopeBand(COP, R0, yF, R1, yM);
  loft(STN, R0, yF - 0.4, [[0.15, 0], [0.15, 0.5], [0, 0.5]], false);
  let yTop = yM, deckR = R1;
  if (R2) { slopeBand(COP, R1, yM, R2, yM + O.rise2); yTop = yM + O.rise2; deckR = R2; }
  capRing(COP, deckR, yTop + 0.02, 0.5);
  loft(BRZ, R1, yM - 0.05, CREST, false);                      // the bronze cresting at the break of the slopes
  loft(BRZ, deckR, yTop, CREST, false);

  // dormers along the steep slope: a copper-cheeked box with a gabled cap, a stone frame and a dark pane on its face
  const s = ringOutSign(R0), n = R0.length;
  let dormers = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, A = R0[i], B = R0[j], A1 = R1[i], B1 = R1[j];
    const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
    if (L < 5.5) continue;
    const ux = (B[0] - A[0]) / L, uz = (B[1] - A[1]) / L, nx = s * uz, nz = -s * ux;
    const cnt = O.dormerSpacing > 0 ? Math.floor((L - 1.5) / O.dormerSpacing) : 0;
    const rot = Math.atan2(-uz, ux);
    for (let k = 0; k < cnt; k++) {
      const tt = 0.5 + (k - (cnt - 1) / 2) * (O.dormerSpacing / L), f = O.dormerF;
      const px = (A[0] + (B[0] - A[0]) * tt) * (1 - f) + (A1[0] + (B1[0] - A1[0]) * tt) * f;
      const pz = (A[1] + (B[1] - A[1]) * tt) * (1 - f) + (A1[1] + (B1[1] - A1[1]) * tt) * f;
      const py = yF + f * (yM - yF);
      const bw = 1.9, bh = 2.5, bd = 1.7, q = 0.22;
      box(COP, px - nx * (bd / 2 - q), py - 0.65, pz - nz * (bd / 2 - q), bw, bh, bd, rot);
      const ty = py - 0.65 + bh, ry = ty + 1.0;                 // the gabled cap, its ridge running back into the slope
      const fl = [px + nx * (q + 0.1) - ux * (bw / 2 + 0.15), pz + nz * (q + 0.1) - uz * (bw / 2 + 0.15)];
      const fr = [px + nx * (q + 0.1) + ux * (bw / 2 + 0.15), pz + nz * (q + 0.1) + uz * (bw / 2 + 0.15)];
      const bl = [fl[0] - nx * (bd + 0.3), fl[1] - nz * (bd + 0.3)], br = [fr[0] - nx * (bd + 0.3), fr[1] - nz * (bd + 0.3)];
      const rf = [(fl[0] + fr[0]) / 2, (fl[1] + fr[1]) / 2], rb = [(bl[0] + br[0]) / 2, (bl[1] + br[1]) / 2];
      COP.quad([fl[0], ty, fl[1]], [rf[0], ry, rf[1]], [rb[0], ry, rb[1]], [bl[0], ty, bl[1]], [-ux * 0.8, 0.6, -uz * 0.8], [0, 0], [0.5, 0], [0.5, 1], [0, 1]);
      COP.quad([fr[0], ty, fr[1]], [rf[0], ry, rf[1]], [rb[0], ry, rb[1]], [br[0], ty, br[1]], [ux * 0.8, 0.6, uz * 0.8], [0, 0], [0.5, 0], [0.5, 1], [0, 1]);
      COP.tri([fl[0], ty, fl[1]], [fr[0], ty, fr[1]], [rf[0], ry, rf[1]], [nx, 0.2, nz], [0, 0], [1, 0], [0.5, 0.6]);
      const fx = px + nx * (q + 0.02), fz = pz + nz * (q + 0.02);
      STN.quad([fx - ux * 0.82, py - 0.55, fz - uz * 0.82], [fx + ux * 0.82, py - 0.55, fz + uz * 0.82], [fx + ux * 0.82, py + 1.72, fz + uz * 0.82], [fx - ux * 0.82, py + 1.72, fz - uz * 0.82], [nx, 0, nz]);
      const gx = px + nx * (q + 0.035), gz = pz + nz * (q + 0.035);
      WIN.quad([gx - ux * 0.55, py - 0.4, gz - uz * 0.55], [gx + ux * 0.55, py - 0.4, gz + uz * 0.55], [gx + ux * 0.55, py + 1.45, gz + uz * 0.55], [gx - ux * 0.55, py + 1.45, gz - uz * 0.55], [nx, 0, nz]);
      dormers++;
    }
  }

  // the pavilions: tall hipped copper roofs on the main block's right-angled corners (both neighbours long)
  const corners = [];
  for (let i = 0; i < ring.length; i++) {
    const P = ring[(i - 1 + ring.length) % ring.length], C = ring[i], Q = ring[(i + 1) % ring.length];
    const l1 = Math.hypot(C[0] - P[0], C[1] - P[1]), l2 = Math.hypot(Q[0] - C[0], Q[1] - C[1]);
    const dp = [(P[0] - C[0]) / l1, (P[1] - C[1]) / l1], dq = [(Q[0] - C[0]) / l2, (Q[1] - C[1]) / l2];
    const cosA = dp[0] * dq[0] + dp[1] * dq[1];
    const px = C[0] + (dp[0] + dq[0]) * 6.0, pz = C[1] + (dp[1] + dq[1]) * 6.0;
    if (Math.abs(cosA) < 0.3 && Math.min(l1, l2) > 14 && insideRing(ring, px, pz)) corners.push({ C, dp, dq, w: Math.min(l1, l2), px, pz });
  }
  corners.sort((a, b) => b.w - a.w);
  for (const c of corners.slice(0, O.pavilions)) {
    hipSquare(COP, c.px, c.pz, yF - 0.2, 5.6, 12.5, Math.atan2(-c.dq[1], c.dq[0]), 1.1);
    cyl(BRZ, c.px, yF - 0.2 + 12.5, c.pz, 0.08, 0.22, 3.4, 6);
  }

  // chimneys on the deck: brick shafts with stone caps, inboard of the long deck edges
  const rand = rng(O.seed), dn = deckR.length, sD = ringOutSign(deckR);
  let chim = 0;
  for (let i = 0; i < dn && chim < O.chimneys; i++) {
    const j = (i + 1) % dn, A = deckR[i], B = deckR[j], L = Math.hypot(B[0] - A[0], B[1] - A[1]);
    if (L < 14) continue;
    const ux = (B[0] - A[0]) / L, uz = (B[1] - A[1]) / L, nx = sD * uz, nz = -sD * ux;
    const m = Math.floor(L / 17);
    for (let k = 0; k < m && chim < O.chimneys; k++) {
      const tt = (k + 0.5) / m, px = A[0] + (B[0] - A[0]) * tt - nx * 1.8, pz = A[1] + (B[1] - A[1]) * tt - nz * 1.8;
      if (!insideRing(deckR, px, pz)) continue;
      const rot = Math.atan2(-uz, ux);
      const chH = O.chimH[0] + rand() * O.chimH[1];
      box(BRK, px, yTop, pz, 1.5, chH, 1.5, rot);
      box(STN, px, yTop + chH - 0.2, pz, 1.9, 0.45, 1.9, rot);
      chim++;
    }
  }
  const list = [[COP, M.copper, 'pl-copper'], [STN, M.stone, 'pl-stone'], [BRK, M.brick, 'pl-brick'], [BRZ, M.bronze, 'pl-bronze'], [WIN, M.glass, 'pl-panes']];
  addMeshes(g, list);
  g.userData.tris = triCount(list.map((m) => [m[0]]));
  g.userData.dormers = dormers;
  return g;
}

export const buildPlazaRoof = (ctx) => buildCopperRoof(ctx, {});
// Hampshire House (150 Central Park South, 1937): a steep verdigris hip over the top storeys, small dormers, tall chimney stacks
export const buildHampshireRoof = (ctx) => buildCopperRoof(ctx, { rise1: 14, d1: 7, rise2: 3.5, d2add: 2.6, dormerSpacing: 6.4, dormerF: 0.36, pavilions: 0, chimneys: 6, chimH: [8, 5], seed: 11, h: 130 });
