// lmSteinway.js: 111 West 57th Street (SHoP Architects, 2021; 435 m, 84 floors, 1:24) on its compiled lot, with the Steinway Hall
// base (Warren & Wetmore, 1925). CP33 landmarks round (2026-10-01; review of teaser 4: "an untextured flat grey prism at the
// centre of t4Dive and t4Sheep, with no windows, piers, setbacks or crown").
//
// What reads at the 400-900 m the teaser sees it from: the slenderness, the warm terracotta-and-bronze east and west faces with
// their tall piers, the cool glass north and south faces the park looks at, the feathered setbacks stepping in from both
// sides, the bronze crown, and the pale limestone hall at the foot. The lot is the whole 30 x 61 m block-through lot between
// W 57th and W 58th Streets: the hall takes the south (57th Street) end, the tower stands on the north part of the lot.
// Facade tiles with recessed panes and a bump map come from lmFacadeKit.js; everything is merged per material.
import * as THREE from 'three';
import { KIT } from './landmarkKit.js';
import {
  Acc, capRing, loft, box, cyl, plane, facadeTex, facadeMat, punchedPainter, addMeshes, triCount, rgbs, speckle, streaks,
} from './lmFacadeKit.js';

const { mat } = KIT;

// ---- the lot frame: N along the long edge (the avenue direction, pointing north), E 90 deg clockwise from above (east-south-east)
export function lotFrame(ring) {
  // N: the longest edge that runs along the avenue axis (Manhattan north is (0.4848, -0.8746) in (x east, z south)), else the axis itself
  let N = [0.4848, -0.8746], ll = -1;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1) continue;
    const d = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], dt = d[0] * 0.4848 - d[1] * 0.8746;
    if (Math.abs(dt) > 0.9 && L > ll) { ll = L; N = dt > 0 ? d : [-d[0], -d[1]]; }
  }
  const E = [-N[1], N[0]];
  let e0 = 1e9, e1 = -1e9, n0 = 1e9, n1 = -1e9;
  for (const p of ring) {
    const e = p[0] * E[0] + p[1] * E[1], n = p[0] * N[0] + p[1] * N[1];
    e0 = Math.min(e0, e); e1 = Math.max(e1, e); n0 = Math.min(n0, n); n1 = Math.max(n1, n);
  }
  const P = (e, n) => [E[0] * e + N[0] * n, E[1] * e + N[1] * n];
  const rect = (ea, eb, na, nb) => [P(ea, na), P(eb, na), P(eb, nb), P(ea, nb)];
  return { N, E, e0, e1, n0, n1, P, rect, rot: Math.atan2(-E[1], E[0]) };
}

/* ------------------------------------------------------------------ painters */
const TC = [214, 186, 148];          // terracotta, as authored for applyLightTrim (0.30 by day)
const BZ = [84, 62, 42];             // bronze

// a tower bay on the east and west faces: two terracotta piers, a bronze-framed pane, a bronze spandrel
function paintTerra(g, gb, x, y, w, h, i, j, r) {
  const tone = 1 + (r() - 0.5) * 0.06;
  g.fillStyle = rgbs(TC, tone); g.fillRect(x, y, w, h);
  gb.fillStyle = 'rgb(140,140,140)'; gb.fillRect(x, y, w, h);
  speckle(g, x, y, w, h, r, Math.round(w * h / 70), 0.07);
  const pw = w * 0.2;
  for (const px of [x, x + w - pw]) {                                  // the piers: a pilaster with three shallow flutes
    g.fillStyle = rgbs(TC, tone * 1.05); g.fillRect(px, y, pw, h);
    gb.fillStyle = 'rgb(158,158,158)'; gb.fillRect(px, y, pw, h);
    for (let f = 1; f <= 3; f++) {
      const fx = px + pw * f / 4 - 1;
      g.fillStyle = 'rgba(70,44,24,0.24)'; g.fillRect(fx, y, 2, h);
      gb.fillStyle = 'rgb(92,92,92)'; gb.fillRect(fx, y, 3, h);
      g.fillStyle = 'rgba(255,238,210,0.14)'; g.fillRect(fx + 2, y, 1.5, h);
    }
  }
  const wx = x + pw, ww = w - 2 * pw, wy = y + h * 0.06, wh = h * 0.70;
  const gl = g.createLinearGradient(0, wy, 0, wy + wh);
  gl.addColorStop(0, 'rgb(128,152,172)'); gl.addColorStop(0.5, 'rgb(70,92,112)'); gl.addColorStop(1, 'rgb(40,54,68)');
  g.fillStyle = gl; g.fillRect(wx, wy, ww, wh);
  gb.fillStyle = 'rgb(56,56,56)'; gb.fillRect(wx, wy, ww, wh);          // the reveal: the pane sits deep in the frame
  const c = r();                                                       // a blind or a curtain in a few of them
  if (c < 0.16) { g.fillStyle = 'rgba(205,196,176,0.78)'; g.fillRect(wx, wy, ww, wh * (0.3 + r() * 0.5)); }
  else if (c < 0.22) { g.fillStyle = 'rgba(255,220,160,0.34)'; g.fillRect(wx, wy, ww, wh); }
  g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(wx, wy, ww, Math.max(3, wh * 0.045)); g.fillRect(wx, wy, Math.max(3, ww * 0.06), wh);
  g.fillStyle = rgbs(BZ, 1.15);                                        // the bronze frame
  g.fillRect(wx, wy + wh * 0.5 - 1.5, ww, 3); g.fillRect(wx + ww / 2 - 1.5, wy, 3, wh);
  gb.fillStyle = 'rgb(176,176,176)'; gb.fillRect(wx, wy + wh * 0.5 - 1.5, ww, 3); gb.fillRect(wx + ww / 2 - 1.5, wy, 3, wh);
  const sy = wy + wh, sh = y + h - sy;                                 // the bronze spandrel, a raised panel with a groove round it
  g.fillStyle = rgbs(BZ, 1 + (r() - 0.5) * 0.08); g.fillRect(wx, sy, ww, sh);
  g.fillStyle = 'rgba(255,214,160,0.20)'; g.fillRect(wx, sy, ww, 3);
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(wx + 3, sy + sh * 0.3, ww - 6, 2); g.fillRect(wx + 3, sy + sh * 0.7, ww - 6, 2);
  gb.fillStyle = 'rgb(168,168,168)'; gb.fillRect(wx, sy, ww, sh);
  gb.fillStyle = 'rgb(96,96,96)'; gb.fillRect(wx + 3, sy + sh * 0.3, ww - 6, 3); gb.fillRect(wx + 3, sy + sh * 0.7, ww - 6, 3);
  g.fillStyle = 'rgba(30,18,8,0.22)'; g.fillRect(x, y, w, 3);           // the slab edge shadow
  streaks(g, x, y, w, h, r, 2, 0.06);
}

// a bay of the north and south glass faces: slim bronze mullions, a floor-to-ceiling pane, a bronze spandrel strip
function paintGlass(g, gb, x, y, w, h, i, j, r) {
  const tone = 1 + (r() - 0.5) * 0.10;
  g.fillStyle = rgbs(BZ, 1.0); g.fillRect(x, y, w, h);
  gb.fillStyle = 'rgb(150,150,150)'; gb.fillRect(x, y, w, h);
  const m = Math.max(3, w * 0.04);
  const wx = x + m, ww = w - 2 * m, wy = y + h * 0.04, wh = h * 0.74;
  const gl = g.createLinearGradient(0, wy, 0, wy + wh);
  gl.addColorStop(0, rgbs([150, 178, 198], tone)); gl.addColorStop(0.55, rgbs([84, 112, 134], tone)); gl.addColorStop(1, rgbs([52, 72, 92], tone));
  g.fillStyle = gl; g.fillRect(wx, wy, ww, wh);
  gb.fillStyle = 'rgb(112,112,112)'; gb.fillRect(wx, wy, ww, wh);
  const c = r();
  if (c < 0.14) { g.fillStyle = 'rgba(210,204,188,0.72)'; g.fillRect(wx, wy, ww, wh * (0.25 + r() * 0.6)); }
  else if (c < 0.19) { g.fillStyle = 'rgba(255,222,168,0.34)'; g.fillRect(wx, wy, ww, wh); }
  g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(wx + ww * 0.15, wy, ww * 0.07, wh);   // a reflection stripe
  g.fillStyle = 'rgba(0,0,0,0.40)'; g.fillRect(wx, wy, ww, Math.max(2, wh * 0.03));
  g.fillStyle = rgbs(BZ, 1.25); g.fillRect(wx, wy + wh * 0.5 - 1, ww, 2);                      // a transom
  const sy = wy + wh;
  g.fillStyle = 'rgba(255,214,160,0.18)'; g.fillRect(x, sy, w, 2);
  g.fillStyle = 'rgba(0,0,0,0.30)'; g.fillRect(x + m, sy + (y + h - sy) * 0.5, w - 2 * m, 2);
}

/* ------------------------------------------------------------------ materials */
let _M = null;
function mats() {
  if (_M) return _M;
  const tTerra = facadeTex('st-terra', { nx: 4, ny: 2, cw: 128, ch: 256, seed: 21, base: TC, paint: paintTerra });
  const tGlass = facadeTex('st-glass', { nx: 4, ny: 2, cw: 144, ch: 256, seed: 22, base: BZ, paint: paintGlass });
  const pHall = punchedPainter({ wall: [224, 216, 196], trim: [238, 232, 216], win: [0.44, 0.60], winY: 0.14, bars: 'dh', brick: 0, rustic: 36, tone: 0.03, keystone: 1, arch: 0 });
  const pHallLo = punchedPainter({ wall: [224, 216, 196], trim: [238, 232, 216], win: [0.54, 0.74], winY: 0.06, bars: 'tri', brick: 0, rustic: 36, tone: 0.03, keystone: 1 });
  const tHall = facadeTex('st-hall', { nx: 4, ny: 3, cw: 150, ch: 200, seed: 23, base: [224, 216, 196],
    paint: (g, gb, x, y, w, h, i, j, r) => (j === 2 ? pHallLo : pHall)(g, gb, x, y, w, h, i, j, r) });
  _M = {
    tx: { terra: tTerra, glass: tGlass, hall: tHall },
    terra: facadeMat('st-terra', tTerra, { rough: 0.82, bump: 2.4 }),
    glass: facadeMat('st-glass', tGlass, { rough: 0.5, metal: 0.1, bump: 1.4,
      skyGlass: { f0: 0.18, rough: 0.05, tint: [0.92, 0.98, 1.04], aureole: 1.6, mullion: 1 } }),
    hall: facadeMat('st-hall', tHall, { rough: 0.84, bump: 2.2 }),
    stone: mat(0xded6c0, { rough: 0.84, flat: false, stone: { set: 'climestone', amt: 0.5, nrm: 0.6, rgh: 0.3, ashlar: 0.8 } }),
    bronze: mat(0x3a2e22, { rough: 0.5, metal: 0.5, flat: false, skyMetal: { tint: [0.40, 0.30, 0.20], rough: 0.26, brush: 0.4, gain: 0.5 } }),
    deck: mat(0x4a4a4c, { rough: 0.94, flat: false }),
    granite: mat(0x8f8a80, { rough: 0.9, flat: false }),
  };
  return _M;
}

// a facade quad from A to B (local x, z) between y0 and y1 with the tile mapped to whole bays and absolute floors
function wall(acc, A, B, y0, y1, nrm, tex, bayW, floorH, vRef = 0) {
  const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
  if (L < 0.05) return;
  const nb = Math.max(1, Math.round(L / bayW));
  const v0 = (y0 - vRef) / (floorH * tex.ny), v1 = (y1 - vRef) / (floorH * tex.ny);
  acc.quad([A[0], y0, A[1]], [B[0], y0, B[1]], [B[0], y1, B[1]], [A[0], y1, A[1]], nrm, [0, v0], [nb / tex.nx, v0], [nb / tex.nx, v1], [0, v1]);
}

const PROF = {
  cornice: [[0, 0], [0.3, 0], [0.3, 0.14], [0.7, 0.14], [0.7, 0.32], [1.1, 0.32], [1.1, 0.6], [1.3, 0.7], [1.3, 1.1], [0.95, 1.1], [0.95, 1.25], [0, 1.25]],
  coping: [[0.1, 0], [0.1, 0.16], [-0.45, 0.16], [-0.45, 0]],
  parapet: [[0, 0], [0, 1.1], [-0.35, 1.1], [-0.35, 0]],
  belt: [[0, 0], [0.32, 0.0], [0.32, 2.0], [0.12, 2.0], [0.12, 2.3], [0, 2.3]],
  plinth: [[0, -2.2], [0.22, -2.2], [0.22, 0], [0, 0]],
};

/* ------------------------------------------------------------------- builder */
export function buildSteinway(ctx) {
  const g = new THREE.Group();
  let ring = ctx.footprint;
  if (!ring || ring.length < 4) {
    const w = (ctx.obb?.w || 30) / 2, d = (ctx.obb?.h || 60) / 2;
    ring = [[-w, -d], [w, -d], [w, d], [-w, d]];
  }
  const M = mats();
  const F = lotFrame(ring);
  const H = Math.max(120, ctx.height || 435);
  const k = H / 435;
  const FL = 5.2 * k;                                     // the tower's floor-to-floor
  const ce = (F.e0 + F.e1) / 2;
  const W_hall = new Acc(), W_terra = new Acc(), W_glass = new Acc(), STN = new Acc(), BRZ = new Acc(), DECK = new Acc(), GR = new Acc();

  // ---- Steinway Hall: the limestone base on W 57th Street (the lot's south end), 15 storeys under a deep cornice
  const hallN1 = F.n0 + 27.5, hallH = 58.5;
  const hr = F.rect(F.e0, F.e1, F.n0, hallN1);
  // outward normals of a rect's four faces: south, east, north, west
  const nS = [-F.N[0], 0, -F.N[1]], nE = [F.E[0], 0, F.E[1]], nN = [F.N[0], 0, F.N[1]], nW = [-F.E[0], 0, -F.E[1]];
  const faces = (r4, y0, y1, texS, texE, texN, texW, bayW, flH, vRef, accS, accE, accN, accW) => {
    wall(accS, r4[0], r4[1], y0, y1, nS, texS, bayW, flH, vRef);        // south face: P(ea, na) -> P(eb, na)
    wall(accE, r4[1], r4[2], y0, y1, nE, texE, bayW, flH, vRef);        // east face
    wall(accN, r4[2], r4[3], y0, y1, nN, texN, bayW, flH, vRef);        // north face
    wall(accW, r4[3], r4[0], y0, y1, nW, texW, bayW, flH, vRef);        // west face
  };
  faces(hr, 0, hallH, M.tx.hall, M.tx.hall, M.tx.hall, M.tx.hall, 3.4, hallH / 15, 0, W_hall, W_hall, W_hall, W_hall);
  loft(STN, hr, hallH - 0.05, PROF.cornice, false);
  loft(STN, hr, hallH + 1.2, PROF.parapet, false);
  loft(STN, hr, hallH + 2.3, PROF.coping, false);
  loft(GR, hr, 0, PROF.plinth, false);
  loft(STN, hr, 4.2, [[0, 0], [0.2, 0], [0.2, 0.1], [0.3, 0.1], [0.3, 0.4], [0, 0.4]], false);   // the string course over the rusticated floor
  capRing(DECK, F.rect(F.e0 + 0.4, F.e1 - 0.4, F.n0 + 0.4, hallN1 - 0.4), hallH + 1.3);

  // ---- the tower: 18.4 m across (east-west), 32 m deep, on the lot's north part; setbacks step in from both sides
  const tW = Math.min(18.4, (F.e1 - F.e0) * 0.62);
  const tE0 = ce - tW / 2, tE1 = ce + tW / 2;
  const tN0 = hallN1, tN1 = F.n1 - 1.5;
  // [top y, west inset, east inset, north inset]
  const TIERS = [[150, 0, 0, 0], [215, 0, 1.5, 0], [265, 1.7, 1.5, 0], [310, 1.7, 3.0, 2.5], [345, 3.1, 3.0, 2.5],
    [375, 3.1, 4.6, 5.0], [398, 4.4, 4.6, 5.0], [414, 4.4, 5.4, 7.0], [428, 5.0, 5.0, 7.0]];
  let yPrev = 0;
  const tierRect = (t) => F.rect(tE0 + t[1], tE1 - t[2], tN0, tN1 - t[3]);
  const rects = [];
  for (const t of TIERS) {
    const top = Math.min(t[0] * k, H - 8 * k);
    if (top <= yPrev + 1) continue;
    const r4 = tierRect(t);
    rects.push({ r4, y0: yPrev, y1: top });
    // east and west faces: terracotta and bronze; south and north faces: glass. The south face above the hall is bare glass.
    faces(r4, yPrev, top, M.tx.glass, M.tx.terra, M.tx.glass, M.tx.terra, 2.6, FL, 0, W_glass, W_terra, W_glass, W_terra);
    // a roof deck and a bronze parapet on this tier's top; the next tier stands inside it
    capRing(DECK, r4, top + 0.02);
    loft(BRZ, r4, top, PROF.coping, false);
    yPrev = top;
  }
  // bronze louvre belts at the mechanical floors, round whichever tier stands there
  for (const yb of [92, 168, 232, 292, 338, 372].map((v) => v * k)) {
    const tier = rects.find((q) => yb >= q.y0 + 3 && yb + 2.4 <= q.y1);
    if (tier) loft(BRZ, tier.r4, yb, PROF.belt, false);
  }
  // the crown: a bronze-clad lantern in three steps with fins, over the last tier
  const lastT = TIERS[TIERS.length - 1];
  const yC = yPrev, hC = Math.max(4, H - yC);
  const cE0 = tE0 + lastT[1] + 0.5, cE1 = tE1 - lastT[2] - 0.5, cN0 = tN0 + 0.5, cN1 = tN1 - lastT[3] - 0.5;
  const crownSteps = [[0, 0.5, 0, 0], [0.5, 0.8, 0.8, 2.0], [0.8, 1.0, 1.5, 4.5]];
  for (const [a, b, ie, inn] of crownSteps) {
    const r4 = F.rect(cE0 + ie, cE1 - ie, cN0 + inn * 0.4, cN1 - inn);
    faces(r4, yC + a * hC, yC + b * hC, M.tx.glass, M.tx.terra, M.tx.glass, M.tx.terra, 2.4, FL, 0, W_glass, W_terra, W_glass, W_terra);
    capRing(DECK, r4, yC + b * hC + 0.02);
    loft(BRZ, r4, yC + b * hC, PROF.coping, false);
  }
  // fins: slim bronze blades up the crown's east and west edges, tallest toward the middle, inside the architectural top
  for (let i = 0; i < 7; i++) {
    const nn = cN0 + 1.5 + (cN1 - cN0 - 3) * (i / 6);
    const hh = (0.55 + 0.5 * Math.sin(Math.PI * (i / 6))) * hC * 0.5;
    for (const ee of [cE0 + 0.4, cE1 - 0.4]) {
      const [px, pz] = F.P(ee, nn);
      box(BRZ, px, yC + hC * 0.5 - 0.4, pz, 0.4, hh, 0.4, F.rot);
    }
  }

  addMeshes(g, [
    [GR, M.granite, 'st-plinth'], [W_hall, M.hall, 'st-hall'], [W_terra, M.terra, 'st-terra'], [W_glass, M.glass, 'st-glass'],
    [STN, M.stone, 'st-stone'], [BRZ, M.bronze, 'st-bronze'], [DECK, M.deck, 'st-deck'],
  ]);
  const hc = F.P(ce, (F.n0 + hallN1) / 2), tc = F.P(ce, (tN0 + tN1) / 2);
  g.userData.colliderBoxes = [
    { x: hc[0], y: hallH / 2, z: hc[1], w: F.e1 - F.e0, h: hallH, d: hallN1 - F.n0, rotY: F.rot },
    { x: tc[0], y: H / 2, z: tc[1], w: tW, h: H, d: tN1 - tN0, rotY: F.rot },
  ];
  g.userData.tris = triCount([[GR], [W_hall], [W_terra], [W_glass], [STN], [BRZ], [DECK]]);
  return g;
}
