// AR32 part (city/areas.js): E 125th St, the east: Lenox Avenue to the East River (the Park Avenue viaduct and
// Metro-North station, Lexington, the RFK Bridge's approaches). Hooks, all optional (the contracts are in
// city/centralPark.js): apply(tile, ox, oz), skipBuilding(cx, cz, h, area), dropFurniture(wx, wz, f), furniture(),
// build(group, ctx), promenades(), seats(). Flag `?ar32e=0`. Notes: docs/notes/area-w125e.md.
//
// The Park Avenue Viaduct (the New York Central's four-track steel viaduct of 1893-97 over the median of Park Avenue,
// 106th St to the Harlem River at 132nd St; rebuilt piece by piece in the 1990s and north of 99th St in 2023-26) and
// the Harlem-125th Street station (opened 15 October 1897, Morgan O'Brien architect): a waiting room at street level
// under the viaduct between 125th and 126th Streets, and two 10-car high-level island platforms on the viaduct, the local
// tracks curving outward round them (Wikipedia, "Park Avenue main line" and "Harlem-125th Street station").
// Positions: the four tracks, the platforms and the station house's footprint from OpenStreetMap (city/w125eData.js).
// Heights: the compiled footprint of the station (NYC building footprints, heightroof 12.0 m) is the platform canopies'
// top; with the platforms 4 ft (1.22 m) over the rail (OSM) and a 3.5 m canopy, the rail stands 7.0 m over the street.
import { COLLIDERS } from './colliders.js';
import { mkConvex, tpSplit } from './tsqPlaza.js';
import { buildingsOf } from '../world/tiledata.js';
import { Bag, mats, COL, toUV, toXZ } from './w125eKit.js';
import { TRACKS, PLATFORMS, STATION, LEX, RAMPS } from './w125eData.js';
// AR34 BRIDGES: the RFK Bridge's Harlem River crossing and its Manhattan ramps, rebuilt (city/rfkHarlem.js; `?rfk34=0` = the AR32
// pieces below, rfkBuild)
import { RFK34, apply as rfkApply, build as rfkBuild34 } from './rfkHarlem.js';

export const AR32E = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('ar32e') === '0');
const TILE = 512;
const owns = (ox, oz, x, z) => x >= ox && x < ox + TILE && z >= oz && z < oz + TILE;
const ROADS = ['asphalt', 'busred', 'gutter', 'paintW', 'paintY', 'curb', 'sidewalk', 'brick'];   // the tiles' street sections

// ---- the viaduct's frame ------------------------------------------------------------------------------------------
// tracks in the grid frame, west to east, each [[u, v]...] with v rising northward; south of the OSM ways (v 3229,
// between 122nd and 123rd St) the four tracks run straight on at the same spacing (ways 794487280-83), so u holds
const TUV = TRACKS.map((t) => t.map(([x, z]) => toUV(x, z)));
const tU = (i, v) => {
  const T = TUV[i];
  if (v <= T[0][1]) return T[0][0];
  for (let k = 0; k + 1 < T.length; k++) {
    const a = T[k], b = T[k + 1];
    if (v <= b[1]) return a[0] + ((b[0] - a[0]) * (v - a[1])) / (b[1] - a[1]);
  }
  return T[T.length - 1][0];
};
// the viaduct from 110th St (the south end this part's tiles reach; the steel continues south to 106th St on the old
// masonry walls) to the lift bridge's abutment
const V_S = 2100, V_N = Math.min(...TUV.map((t) => t[t.length - 1][1])) - 1;
const RAIL = 3.38 + 7.0;                              // top of rail (world y): 7.0 m over the street's asphalt
const DECK_T = RAIL - 0.62, DECK_B = RAIL - 0.95;     // the ballast deck's plate
const GIRD_B = RAIL - 2.55;                           // the longitudinal plate girders' bottom flange (4.5 m clear of 125th St)
const XG_B = GIRD_B - 1.05;                           // the bents' cross girders
const EDGE = 2.1;                                     // deck edge outside the outer track centres
const PLAT_Y = RAIL + 1.22;                           // the platforms' surface, 4 ft over the rail (OSM)
const CAN_Y = PLAT_Y + 3.35;                          // the canopy roof's underside
// the station house (way 814296538) in the grid frame
const SUV = STATION.map(([x, z]) => toUV(x, z));
const SH = { u0: Math.min(...SUV.map((p) => p[0])), u1: Math.max(...SUV.map((p) => p[0])), v0: Math.min(...SUV.map((p) => p[1])), v1: Math.max(...SUV.map((p) => p[1])) };
// the platforms' length (OSM ways 180750913/14): their edges are laid 1.65 m off the adjacent track centres
const PUV = PLATFORMS.map((p) => p.map(([x, z]) => toUV(x, z)));
const P_V0 = Math.min(...PUV.flat().map((p) => p[1])), P_V1 = Math.max(...PUV.flat().map((p) => p[1]));
const CAN_V0 = P_V0 + 38, CAN_V1 = P_V1 - 36;         // the canopies over the middle 185 m of the 259 m platforms

const inHouse = (u, v, pad = 0) => u > SH.u0 - pad && u < SH.u1 + pad && v > SH.v0 - pad && v < SH.v1 + pad;
const midXZ = (va, vb) => { const vm = (va + vb) / 2; return toXZ((tU(0, vm) + tU(3, vm)) / 2, vm); };

// ---- the viaduct: deck, tracks, girders, fascia, railings (the intervals whose centre lies in this tile) -------------
function viaductBuild(B, ctx) {
  const M = mats();
  const DV = 6.0;
  let n = 0;
  for (let va = V_S; va < V_N; va += DV) {
    const vb = Math.min(V_N, va + DV), [mx, mz] = midXZ(va, vb);
    if (!owns(ctx.ox, ctx.oz, mx, mz)) continue;
    n++;
    const uLa = tU(0, va) - EDGE, uLb = tU(0, vb) - EDGE, uRa = tU(3, va) + EDGE, uRb = tU(3, vb) + EDGE;
    const Q = (ua, ub, wa, wb) => [toXZ(ua, va), toXZ(ub, vb), toXZ(wb, vb), toXZ(wa, va)];   // a strip between two u lines
    // the deck plate
    B.ext(M.matte, Q(uLa, uLb, uRa, uRb), DECK_B, DECK_T, COL.slab, { botCol: COL.slabU });
    for (let i = 0; i < 4; i++) {
      const ca = tU(i, va), cb = tU(i, vb);
      B.ext(M.matte, Q(ca - 1.55, cb - 1.55, ca + 1.55, cb + 1.55), DECK_T, RAIL - 0.3, COL.ballast, { bot: false });   // ballast
      for (const s of [-0.75, 0.75]) B.ext(M.rail, Q(ca + s - 0.036, cb + s - 0.036, ca + s + 0.036, cb + s + 0.036), RAIL - 0.3, RAIL, COL.rail, { bot: false });
      // the under-running third rail and its cover board, outside the running rails (west side of the west pair,
      // east side of the east pair)
      const t3 = i < 2 ? -1.42 : 1.42;
      B.ext(M.rail, Q(ca + t3 - 0.05, cb + t3 - 0.05, ca + t3 + 0.05, cb + t3 + 0.05), RAIL - 0.3, RAIL - 0.08, COL.third, { bot: false });
      B.ext(M.matte, Q(ca + t3 - 0.12, cb + t3 - 0.12, ca + t3 + 0.12, cb + t3 + 0.12), RAIL - 0.02, RAIL + 0.02, COL.cover, { bot: false });
      // two plate girders under each track
      for (const s of [-0.95, 0.95]) B.ext(M.steel, Q(ca + s - 0.2, cb + s - 0.2, ca + s + 0.2, cb + s + 0.2), GIRD_B, DECK_B, COL.steelD, { top: false });
    }
    // ties at the station and a block either side (the teaser's close views): 0.23 m oak ties at 0.61 m (24 in)
    if (vb > P_V0 - 80 && va < P_V1 + 80) {
      for (let v = Math.ceil(va / 0.61) * 0.61; v < vb; v += 0.61) {
        for (let i = 0; i < 4; i++) { const c = tU(i, v); B.box(M.matte, c - 1.3, c + 1.3, v - 0.115, v + 0.115, RAIL - 0.33, RAIL - 0.17, COL.tie, { bot: false }); }
      }
    }
    // the fascia girders along both edges: 2.3 m deep plate girders, their top flange a curb over the deck, with
    // stiffener angles every 1.5 m on the outer face
    for (const [ea, eb, sgn] of [[uLa, uLb, -1], [uRa, uRb, 1]]) {
      B.ext(M.steel, Q(ea - 0.18, eb - 0.18, ea + 0.18, eb + 0.18), GIRD_B - 0.25, DECK_T + 0.32, COL.steel);
      B.ext(M.steel, Q(ea + sgn * 0.18, eb + sgn * 0.18, ea + sgn * 0.34, eb + sgn * 0.34), DECK_T + 0.18, DECK_T + 0.32, COL.steel);   // top flange lip
      B.ext(M.steel, Q(ea + sgn * 0.18, eb + sgn * 0.18, ea + sgn * 0.34, eb + sgn * 0.34), GIRD_B - 0.25, GIRD_B - 0.1, COL.steel);    // bottom flange lip
      for (let v = Math.ceil(va / 1.5) * 1.5; v < vb; v += 1.5) {
        const e = ea + ((eb - ea) * (v - va)) / (vb - va);
        B.box(M.steel, Math.min(e + sgn * 0.18, e + sgn * 0.3), Math.max(e + sgn * 0.18, e + sgn * 0.3), v - 0.07, v + 0.07, GIRD_B - 0.1, DECK_T + 0.18, COL.steelD, { top: false, bot: false });
      }
      // the walkway railing: posts every 2 m, a top rail and a mid rail
      const ra = ea - sgn * 0.1, rb = eb - sgn * 0.1;
      for (let v = Math.ceil(va / 2) * 2; v < vb; v += 2) { const e = ra + ((rb - ra) * (v - va)) / (vb - va); B.box(M.steel, e - 0.04, e + 0.04, v - 0.04, v + 0.04, DECK_T + 0.32, DECK_T + 1.37, COL.steelD, { bot: false }); }
      B.ext(M.steel, Q(ra - 0.04, rb - 0.04, ra + 0.04, rb + 0.04), DECK_T + 1.3, DECK_T + 1.38, COL.steelD);
      B.ext(M.steel, Q(ra - 0.025, rb - 0.025, ra + 0.025, rb + 0.025), DECK_T + 0.82, DECK_T + 0.86, COL.steelD);
    }
  }
  // the bents: every 50 ft (15.24 m) three columns in the avenue's median (6.5 m either side of the middle and the
  // middle; the deck cantilevers over the roadways) under a cross girder the deck's width; none where a street or its
  // sidewalk crosses under the viaduct (the spans there are carried by the girders) nor in the station house (its walls
  // carry the deck)
  const sy = (x, z) => ctx.surfY(x, z, ROADS, 0.25);
  for (let k = Math.ceil(V_S / 15.24); k * 15.24 < V_N; k++) {
    const v = k * 15.24, uM = (tU(1, v) + tU(2, v)) / 2, uL = uM - 6.5, uR = uM + 6.5, dL = tU(0, v) - EDGE, dR = tU(3, v) + EDGE;
    const [cx, cz] = toXZ(uM, v);
    if (!owns(ctx.ox, ctx.oz, cx, cz)) continue;
    if (inHouse(uM, v, 1.0)) continue;
    let street = false;
    for (const u of [uL, uM, uR]) for (const dv of [-2.2, 0, 2.2]) { const [x, z] = toXZ(u, v + dv); if (sy(x, z) !== null) street = true; }
    if (street) continue;
    B.box(M.steel, dL + 0.2, dR - 0.2, v - 0.3, v + 0.3, XG_B, GIRD_B, COL.steelD);
    for (const u of [uL, uM, uR]) {
      const [x, z] = toXZ(u, v), g = ctx.sampleT(x, z);
      B.box(M.steel, u - 0.32, u + 0.32, v - 0.32, v + 0.32, g, XG_B, COL.steel, { bot: false });            // built-up column
      B.box(M.steel, u - 0.18, u + 0.18, v - 0.42, v + 0.42, g, XG_B - 0.2, COL.steelD, { bot: false, top: false });   // its flange plates
      B.box(M.steel, u - 0.55, u + 0.55, v - 0.55, v + 0.55, g, g + 0.18, COL.steelD, { bot: false });      // base plate
      B.box(M.matte, u - 0.75, u + 0.75, v - 0.75, v + 0.75, g - 0.05, g + 0.06, COL.conc, { bot: false }); // footing
      B.box(M.steel, u - 0.5, u + 0.5, v - 0.5, v + 0.5, XG_B - 0.35, XG_B, COL.steelD);                    // capital
    }
    COLLIDERS.addBox('kit31', { x: cx, y: (ctx.sampleT(cx, cz) + XG_B) / 2, z: cz, hw: 0.4, hh: (XG_B - ctx.sampleT(cx, cz)) / 2, hd: 0.4, rotY: 0 });
  }
  // the south end at 110th St: the steel runs on south onto the 1870s masonry; the part stops on a stone abutment
  { const v = V_S, uL = tU(0, v) - EDGE, uR = tU(3, v) + EDGE, [x, z] = toXZ((uL + uR) / 2, v);
    if (owns(ctx.ox, ctx.oz, x, z)) B.box(M.matte, uL, uR, v - 12, v + 0.2, ctx.sampleT(x, z) - 0.1, DECK_T, COL.granite); }
  return n;
}

// ---- the platforms and their canopies -----------------------------------------------------------------------------
// island 0 between the west local and west express (tracks 0, 1), island 1 between the east express and east local (2, 3)
function platformsBuild(B, ctx) {
  const M = mats();
  const [px, pz] = toXZ((SH.u0 + SH.u1) / 2, (P_V0 + P_V1) / 2);
  if (!owns(ctx.ox, ctx.oz, px, pz)) return 0;
  const DV = 5.0;
  for (const [ia, ib] of [[0, 1], [2, 3]]) {
    for (let va = P_V0; va < P_V1 - 0.01; va += DV) {
      const vb = Math.min(P_V1, va + DV);
      const a0 = tU(ia, va) + 1.65, a1 = tU(ia, vb) + 1.65, b0 = tU(ib, va) - 1.65, b1 = tU(ib, vb) - 1.65;
      const F = [toXZ(a0, va), toXZ(a1, vb), toXZ(b1, vb), toXZ(b0, va)];
      B.ext(M.matte, F, DECK_T, PLAT_Y, COL.plat, { bot: false, sideCol: COL.concD });
      // the yellow warning strips (24 in) along both edges
      B.ext(M.matte, [toXZ(a0, va), toXZ(a1, vb), toXZ(a1 + 0.61, vb), toXZ(a0 + 0.61, va)], PLAT_Y, PLAT_Y + 0.012, COL.platEdge, { bot: false });
      B.ext(M.matte, [toXZ(b0 - 0.61, va), toXZ(b1 - 0.61, vb), toXZ(b1, vb), toXZ(b0, va)], PLAT_Y, PLAT_Y + 0.012, COL.platEdge, { bot: false });
    }
    // the canopy: columns on the island's axis every 25 ft (7.62 m), a roof 1.0 m in from the edges with a fascia
    for (let v = CAN_V0; v <= CAN_V1 + 0.01; v += 7.62) {
      const c = (tU(ia, v) + tU(ib, v)) / 2;
      B.box(M.steel, c - 0.13, c + 0.13, v - 0.13, v + 0.13, PLAT_Y, CAN_Y, COL.canopy, { bot: false });
      B.box(M.steel, c - 0.25, c + 0.25, v - 0.25, v + 0.25, PLAT_Y, PLAT_Y + 0.35, COL.canopy, { bot: false });   // base shoe
      B.box(M.steel, c - 1.6, c + 1.6, v - 0.09, v + 0.09, CAN_Y - 0.45, CAN_Y, COL.canopy, { top: false });       // cross beam
      // a bench every other bay
      if (Math.round((v - CAN_V0) / 7.62) % 2 === 1) {
        B.box(M.matte, c - 0.3, c + 0.3, v + 1.2, v + 3.0, PLAT_Y + 0.42, PLAT_Y + 0.47, COL.door);
        for (const dv of [1.35, 2.85]) B.box(M.steel, c - 0.25, c + 0.25, v + dv - 0.04, v + dv + 0.04, PLAT_Y, PLAT_Y + 0.42, COL.canopy, { bot: false });
      }
    }
    for (let va = CAN_V0; va < CAN_V1 - 0.01; va += DV) {
      const vb = Math.min(CAN_V1, va + DV);
      const a0 = tU(ia, va) + 1.65 + 0.35, a1 = tU(ia, vb) + 1.65 + 0.35, b0 = tU(ib, va) - 1.65 - 0.35, b1 = tU(ib, vb) - 1.65 - 0.35;
      const F = [toXZ(a0, va), toXZ(a1, vb), toXZ(b1, vb), toXZ(b0, va)];
      B.ext(M.matte, F, CAN_Y, CAN_Y + 0.14, COL.roof, { botCol: COL.roofU });
      // fascia boards and the ridge beam
      B.ext(M.steel, [toXZ(a0 - 0.08, va), toXZ(a1 - 0.08, vb), toXZ(a1 + 0.04, vb), toXZ(a0 + 0.04, va)], CAN_Y - 0.25, CAN_Y + 0.22, COL.canopy);
      B.ext(M.steel, [toXZ(b0 - 0.04, va), toXZ(b1 - 0.04, vb), toXZ(b1 + 0.08, vb), toXZ(b0 + 0.08, va)], CAN_Y - 0.25, CAN_Y + 0.22, COL.canopy);
      const c0 = (a0 + b0) / 2, c1 = (a1 + b1) / 2;
      B.ext(M.steel, [toXZ(c0 - 0.1, va), toXZ(c1 - 0.1, vb), toXZ(c1 + 0.1, vb), toXZ(c0 + 0.1, va)], CAN_Y - 0.4, CAN_Y, COL.canopy, { top: false });
      // the lamps under the roof, a strip along the axis
      B.ext(M.lamp, [toXZ(c0 - 0.07, va + 0.4), toXZ(c1 - 0.07, vb - 0.4), toXZ(c1 + 0.07, vb - 0.4), toXZ(c0 + 0.07, va + 0.4)], CAN_Y - 0.46, CAN_Y - 0.41, COL.globeW, { top: false });
    }
    // the platform ends: a railing across each end
    for (const v of [P_V0 + 0.1, P_V1 - 0.1]) {
      const a = tU(ia, v) + 1.65, b = tU(ib, v) - 1.65;
      B.box(M.steel, a, b, v - 0.03, v + 0.03, PLAT_Y + 1.0, PLAT_Y + 1.07, COL.canopy);
      for (let u = a; u <= b + 0.01; u += (b - a) / 3) B.box(M.steel, u - 0.03, u + 0.03, v - 0.03, v + 0.03, PLAT_Y, PLAT_Y + 1.0, COL.canopy, { bot: false });
    }
  }
  return 1;
}

// ---- the station house (1897): the waiting room at street level under the viaduct, 125th to 126th St -----------------
// Buff brick over a granite base, limestone trim, tall round-arched windows in every bay of the Park Avenue sides and
// three arches on the 125th St front (the doors in the middle one), a limestone cornice under the viaduct's deck.
function arch(B, mat, face, a, b, y0, ySpring, rise, col, off) {
  // a window of width |b - a| along the face: the rectangle to the springing, a semicircular head of `rise`, `off` out
  // of the wall; face(s, y) -> [x, y, z] maps a position along the face and a height to world
  const N = 8, pts = [face(a, y0, off), face(b, y0, off), face(b, ySpring, off)];
  for (let i = 1; i < N; i++) { const t = (i / N) * Math.PI; pts.push(face((a + b) / 2 + Math.cos(t) * (b - a) / 2, ySpring + Math.sin(t) * rise, off)); }
  pts.push(face(a, ySpring, off));
  return pts;
}
function houseBuild(B, ctx) {
  const M = mats();
  const [cx, cz] = toXZ((SH.u0 + SH.u1) / 2, (SH.v0 + SH.v1) / 2);
  if (!owns(ctx.ox, ctx.oz, cx, cz)) return 0;
  const g = ctx.sampleT(cx, cz), top = DECK_B;
  const { u0, u1, v0, v1 } = SH;
  B.box(M.matte, u0 - 0.08, u1 + 0.08, v0 - 0.08, v1 + 0.08, g - 0.1, g + 0.95, COL.granite);                      // base
  B.box(M.matte, u0, u1, v0, v1, g + 0.95, top - 0.75, COL.brick);                                                   // walls
  B.box(M.matte, u0 - 0.12, u1 + 0.12, v0 - 0.12, v1 + 0.12, g + 4.0, g + 4.25, COL.lime);                          // string course
  B.box(M.matte, u0 - 0.28, u1 + 0.28, v0 - 0.28, v1 + 0.28, top - 0.75, top - 0.35, COL.lime, { botCol: COL.limeD }); // cornice
  B.box(M.matte, u0 - 0.1, u1 + 0.1, v0 - 0.1, v1 + 0.1, top - 0.35, top, COL.brickD);                              // frieze to the deck
  const W = (x, y, z) => [x, y, z];
  // the long sides: twelve bays of 5.0 m, each an arched window 2.5 m wide, its sill at 1.3 m
  const nb = 12, bay = (v1 - v0) / nb;
  for (const [u, sgn] of [[u0, -1], [u1, 1]]) {
    const face = (s, y, off) => { const [x, z] = toXZ(u + sgn * off, s); return W(x, y, z); };
    const n = [toXZ(sgn, 0)[0] - toXZ(0, 0)[0], 0, toXZ(sgn, 0)[1] - toXZ(0, 0)[1]];
    for (let k = 0; k < nb; k++) {
      const s = v0 + (k + 0.5) * bay;
      B.face(M.matte, arch(B, M.matte, face, s - 1.45, s + 1.45, g + 1.15, g + 4.0, 1.45, COL.lime, 0.05), n, COL.lime);   // limestone surround
      B.face(M.glass, arch(B, M.glass, face, s - 1.2, s + 1.2, g + 1.3, g + 4.0, 1.2, COL.glass, 0.07), n, COL.glass);
      // the mullion and transom of the sash (dark green frames)
      B.box(M.steel, u + sgn * 0.07 - 0.03, u + sgn * 0.07 + 0.05, s - 0.05, s + 0.05, g + 1.3, g + 5.2, COL.frame);
      B.box(M.steel, u + sgn * 0.07 - 0.03, u + sgn * 0.07 + 0.05, s - 1.2, s + 1.2, g + 3.95, g + 4.05, COL.frame);
      B.box(M.matte, u + sgn * 0.08 - 0.06, u + sgn * 0.08 + 0.06, s - 0.25, s + 0.25, g + 5.15, g + 5.55, COL.lime);     // keystone
      // brick pilasters between the bays
      B.box(M.matte, Math.min(u, u + sgn * 0.14), Math.max(u, u + sgn * 0.14), v0 + k * bay - 0.4, v0 + k * bay + 0.4, g + 0.95, top - 0.75, COL.brickD, { top: false, bot: false });
    }
  }
  // the ends: 125th St (v0, the front) and 126th St (v1): three arches, the middle one the doors
  for (const [v, sgn] of [[v0, -1], [v1, 1]]) {
    const face = (s, y, off) => { const [x, z] = toXZ(s, v + sgn * off); return W(x, y, z); };
    const n = [toXZ(0, sgn)[0] - toXZ(0, 0)[0], 0, toXZ(0, sgn)[1] - toXZ(0, 0)[1]];
    const w = (u1 - u0) / 3;
    for (let k = 0; k < 3; k++) {
      const s = u0 + (k + 0.5) * w, door = k === 1;
      // (springing at 3.3 m: the surround's crown, 5.4 m, stays under the cornice)
      B.face(M.matte, arch(B, M.matte, face, s - 2.1, s + 2.1, door ? g + 0.02 : g + 1.15, g + 3.3, 2.1, COL.lime, 0.05), n, COL.lime);
      B.face(door ? M.matte : M.glass, arch(B, M.glass, face, s - 1.8, s + 1.8, door ? g + 0.02 : g + 1.3, g + 3.3, 1.8, COL.glass, 0.07), n, door ? COL.door : COL.glass);
      if (door) {
        // the doors' glazed upper panels and the fanlight over the transom
        B.face(M.glass, arch(B, M.glass, face, s - 1.6, s + 1.6, g + 2.85, g + 3.3, 1.6, COL.glass, 0.09), n, COL.glass);
        for (const d of [-0.9, 0.9]) B.face(M.glass, [face(s + d - 0.55, g + 1.2, 0.09), face(s + d + 0.55, g + 1.2, 0.09), face(s + d + 0.55, g + 2.6, 0.09), face(s + d - 0.55, g + 2.6, 0.09)], n, COL.glass);
      }
    }
  }
  COLLIDERS.addBox('kit31', { x: cx, y: g + 3, z: cz, hw: (u1 - u0) / 2 + 0.2, hh: 3, hd: (v1 - v0) / 2 + 0.2, rotY: Math.atan2(toXZ(1, 0)[1] - toXZ(0, 0)[1], toXZ(1, 0)[0] - toXZ(0, 0)[0]) });
  return 1;
}

// ---- the RFK (Triborough) Bridge at the street's East River end -----------------------------------------------------
// The Harlem River lift span (OSM ways 801411751 and 801411754: the two 3-lane decks, 94 m, the 310 ft span) with a
// steel tower at each corner, and the Manhattan approach decks down to Second Avenue and 125th St (the ways tagged
// Robert F. Kennedy Triborough Bridge and the unnamed ramps between them; not the Willis Avenue Bridge's nor the Harlem
// River Drive's). Heights (Wikipedia, "Robert F. Kennedy Bridge"): the span stands 55 ft (17 m) over mean high water
// closed and lifts to 135 ft (41 m); the towers are 210 ft (64 m) over mean high water. The road stands at y 18.4; the
// approach falls from there at 5.5 % to the street 275 m back (a height field on the distance to the span's Manhattan
// end), and a deck is drawn only where it stands 0.8 m or more over the compiled at-grade road it replaces.
const RFK_END = [3585.8, -1955.5], RFK_Y = 18.4, RFK_RUN = 275;   // the span's Manhattan end (the two ways' ends' mean)
const SPAN_IDS = [801411751, 801411754];
const rfkY = (x, z) => 3.38 + Math.max(0, Math.min(1, 1 - Math.hypot(x - RFK_END[0], z - RFK_END[1]) / RFK_RUN)) * (RFK_Y - 3.38);
const RFK_WAYS = RAMPS.filter((r) => !/Willis|Harlem River/.test(r.name) && !SPAN_IDS.includes(r.id) && r.layer >= 1);
function rfkBuild(B, ctx) {
  const M = mats();
  let n = 0;
  for (const w of RFK_WAYS) {
    const hw = (w.lanes * 3.65 + 1.6) / 2;
    for (let i = 0; i + 1 < w.pts.length; i++) {
      const A = w.pts[i], Bp = w.pts[i + 1], L = Math.hypot(Bp[0] - A[0], Bp[1] - A[1]);
      const steps = Math.max(1, Math.ceil(L / 8));
      for (let k = 0; k < steps; k++) {
        const t0 = k / steps, t1 = (k + 1) / steps;
        const P0 = [A[0] + (Bp[0] - A[0]) * t0, A[1] + (Bp[1] - A[1]) * t0], P1 = [A[0] + (Bp[0] - A[0]) * t1, A[1] + (Bp[1] - A[1]) * t1];
        const mx = (P0[0] + P1[0]) / 2, mz = (P0[1] + P1[1]) / 2;
        if (!owns(ctx.ox, ctx.oz, mx, mz)) continue;
        const y = rfkY(mx, mz), g = ctx.sampleT(mx, mz);
        if (y - 3.38 < 0.8) continue;
        n++;
        const E0 = [P0[0] - (P1[0] - P0[0]) * 0.02, P0[1] - (P1[1] - P0[1]) * 0.02], E1 = [P1[0] + (P1[0] - P0[0]) * 0.02, P1[1] + (P1[1] - P0[1]) * 0.02];
        // the deck follows the height field end to end (sloped pieces, no steps), its asphalt top, the parapets
        // (concrete safety shape, 0.82 m)
        const y0 = rfkY(E0[0], E0[1]), y1 = rfkY(E1[0], E1[1]);
        B.slope(M.matte, [E0[0], y0 - 1.1, E0[1]], [E1[0], y1 - 1.1, E1[1]], hw, 1.08, COL.conc);
        B.slope(M.matte, [E0[0], y0 - 0.03, E0[1]], [E1[0], y1 - 0.03, E1[1]], hw - 0.3, 0.04, COL.asph);
        const dx = (P1[0] - P0[0]) / L * steps, dz = (P1[1] - P0[1]) / L * steps, px = -dz, pz = dx;
        for (const s of [-1, 1]) {
          const o = s * (hw - 0.2);
          B.slope(M.matte, [E0[0] + px * o, y0, E0[1] + pz * o], [E1[0] + px * o, y1, E1[1] + pz * o], 0.22, 0.82, COL.barrier);
        }
        // a pier every 24 m where the ground under is not a street: a column and a hammerhead cap
        if (k % 3 === 0 && y - g > 3.0 && ctx.surfY(mx, mz, ROADS, 0.25) === null) {
          B.bar(M.matte, [mx - dx * 0.8, mz - dz * 0.8], [mx + dx * 0.8, mz + dz * 0.8], 1.1, g - 0.05, y - 1.1 - 1.2, COL.pier, { bot: false });
          B.bar(M.matte, [mx - dx * 1.0, mz - dz * 1.0], [mx + dx * 1.0, mz + dz * 1.0], hw - 0.6, y - 2.3, y - 1.1, COL.pier);
          COLLIDERS.addBox('kit31', { x: mx, y: (g + y) / 2, z: mz, hw: 1.2, hh: (y - g) / 2, hd: 1.2, rotY: 0 });
        }
      }
    }
  }
  // the lift span and its towers, from the tile that owns the span's middle
  const S = RAMPS.filter((r) => SPAN_IDS.includes(r.id));
  if (S.length === 2) {
    const [a0, a1] = [S[0].pts[0], S[0].pts[S[0].pts.length - 1]], [b0, b1] = [S[1].pts[S[1].pts.length - 1], S[1].pts[0]];
    const c = [(a0[0] + a1[0] + b0[0] + b1[0]) / 4, (a0[1] + a1[1] + b0[1] + b1[1]) / 4];
    if (owns(ctx.ox, ctx.oz, c[0], c[1])) {
      n++;
      // the span's axis and its two ends (the 801411751 way runs Randall's Island -> Manhattan)
      const e0 = [(a1[0] + b1[0]) / 2, (a1[1] + b1[1]) / 2], e1 = [(a0[0] + b0[0]) / 2, (a0[1] + b0[1]) / 2];   // e0 the Manhattan end
      const ax = e1[0] - e0[0], az = e1[1] - e0[1], L = Math.hypot(ax, az), ux = ax / L, uz = az / L, px = -uz, pz = ux;
      const half = Math.hypot(a0[0] - b0[0], a0[1] - b0[1]) / 2 + 7.5;   // the decks' centres apart / 2 + a deck's half width
      const at = (s, o) => [e0[0] + ux * s + px * o, e0[1] + uz * s + pz * o];
      B.bar(M.matte, at(-2, 0), at(L + 2, 0), half, RFK_Y - 1.2, RFK_Y, COL.conc, { topCol: COL.asph });
      const TS = COL.rfk;
      // the trusses each side: chords and verticals, a Warren web
      for (const sgn of [-1, 1]) {
        const o = sgn * (half + 0.4);
        B.bar(M.steel, at(0, o), at(L, o), 0.45, RFK_Y - 2.4, RFK_Y - 0.6, TS);                 // bottom chord
        B.bar(M.steel, at(0, o), at(L, o), 0.45, RFK_Y + 9.6, RFK_Y + 10.6, TS);                // top chord
        const nP = 10;
        for (let k = 0; k <= nP; k++) {
          const s = (k / nP) * L;
          B.bar(M.steel, at(s - 0.35, o), at(s + 0.35, o), 0.4, RFK_Y - 0.6, RFK_Y + 9.6, TS);   // vertical
          if (k < nP) {
            const sA = s, sB = ((k + 1) / nP) * L, up = k % 2 === 0;
            B.slope(M.steel, [at(sA, o)[0], up ? RFK_Y - 0.6 : RFK_Y + 9.6, at(sA, o)[1]], [at(sB, o)[0], up ? RFK_Y + 9.6 : RFK_Y - 0.6, at(sB, o)[1]], 0.3, 0.6, TS);
          }
        }
      }
      // portal struts over the road at each end and the middle
      for (const s of [0.6, L / 2, L - 0.6]) B.bar(M.steel, at(s, -half - 0.4), at(s, half + 0.4), 0.3, RFK_Y + 9.2, RFK_Y + 10.4, TS);
      // the four towers: 210 ft (64 m) over the water, two legs braced every 8 m, a machinery house on top
      for (const s of [-3.2, L + 3.2]) for (const sgn of [-1, 1]) {
        const o = sgn * (half + 3.2);
        for (const d of [-2.2, 2.2]) {
          const [x, z] = at(s + d, o);
          B.post(M.steel, x, z, 0.75, 1.5, 59.5, TS);
        }
        for (let y = 10; y < 58; y += 8) { const P0 = at(s - 2.2, o), P1 = at(s + 2.2, o); B.bar(M.steel, P0, P1, 0.35, y, y + 0.7, TS); }
        B.bar(M.steel, at(s - 3.2, o), at(s + 3.2, o), 2.8, 59.5, 64.0, COL.rfkD);                // machinery house
        const [x, z] = at(s, o);
        B.post(M.matte, x, z, 3.4, -2, 1.6, COL.pier);                                         // the pier in the river
      }
      // the counterweights hung in the towers
      for (const s of [-3.2, L + 3.2]) for (const sgn of [-1, 1]) { const [x, z] = at(s, sgn * (half + 3.2)); B.post(M.matte, x, z, 1.6, 44, 52, COL.concD); }
    }
  }
  return n;
}

// ---- 125th St (4/5/6) at Lexington Avenue: the corner stairs ---------------------------------------------------------
// OSM's four stair nodes and the elevator (w125eData.js LEX): each stair a 1.7 m x 5.8 m opening along the avenue with
// the standard NYCT railing (1.07 m, painted green) round three sides, and at its head the two lamp posts with globes,
// green for an entrance open at all hours. The stair itself goes down under the sidewalk: its well is drawn as dark
// treads falling to 3 m under the sidewalk, inside the railing.
const LEX_HW = 0.85, LEX_LEN = 5.8;
const lexRect = (e) => { const [u, v] = toUV(e.p[0], e.p[1]), dir = /N[EW] corner/.test(e.d) ? 1 : -1, v1 = v + dir * LEX_LEN; return { u, v0: v, v1, dir, Q: mkConvex([toXZ(u - LEX_HW, v), toXZ(u + LEX_HW, v), toXZ(u + LEX_HW, v1), toXZ(u - LEX_HW, v1)]) }; };
// the wells: the walk kinds' triangles inside each stair's opening are cut away (tsqPlaza.js tpSplit), so the treads show
function lexApply(tile, ox, oz) {
  const R = { ped: LEX.filter((e) => e.p[0] > ox - 10 && e.p[0] < ox + TILE + 10 && e.p[1] > oz - 10 && e.p[1] < oz + TILE + 10).map((e) => lexRect(e).Q), car: [] };
  if (!R.ped.length) return 0;
  let n = 0;
  const fan = (poly, out) => { for (let k = 1; k + 1 < poly.length; k++) for (const p of [poly[0], poly[k], poly[k + 1]]) out.push(p[0] - ox, p[1], p[2] - oz); };
  for (const name of ['sidewalk', 'curb', 'gutter', 'brick', 'warn', 'warnIron', 'paintW']) {
    const a = tile.S[name];
    if (!a || a.length < 9) continue;
    const out = [];
    let changed = false;
    for (let i = 0; i + 8 < a.length; i += 9) {
      const x0 = a[i] + ox, z0 = a[i + 2] + oz, x1 = a[i + 3] + ox, z1 = a[i + 5] + oz, x2 = a[i + 6] + ox, z2 = a[i + 8] + oz;
      const S = tpSplit([[x0, a[i + 1], z0], [x1, a[i + 4], z1], [x2, a[i + 7], z2]], R);
      if (!S.plaza.length) { for (let k = 0; k < 9; k++) out.push(a[i + k]); continue; }
      changed = true; n++;
      for (const poly of S.road) fan(poly, out);
    }
    if (changed) tile.S[name] = Float32Array.from(out);
  }
  // the terrain grid (4 m cells) under each well is lowered to the stair's foot, or its surface (0.28 m under the
  // sidewalk) would close the well over the second tread; a copy, as centralPark.js does (the parsed sections are views)
  const res = tile.header.res, N = res + 1;
  if (n && tile.S.terrain) {
    const g = (tile.S.terrain = Float32Array.from(tile.S.terrain)), cell = 512 / res;
    for (const Q of R.ped) {
      const [x0, z0, x1, z1] = Q.bb;
      for (let j = Math.max(0, Math.floor((z0 - oz) / cell)); j <= Math.min(res, Math.ceil((z1 - oz) / cell)); j++)
        for (let i = Math.max(0, Math.floor((x0 - ox) / cell)); i <= Math.min(res, Math.ceil((x1 - ox) / cell)); i++) g[j * N + i] = Math.min(g[j * N + i], 3.52 - 3.3);
    }
  }
  return n;
}
function lexBuild(B, ctx) {
  const M = mats();
  let n = 0;
  for (const e of LEX) {
    const [x, z] = e.p;
    if (!owns(ctx.ox, ctx.oz, x, z)) continue;
    const y = ctx.padYNear(x, z);
    const [u, v] = toUV(x, z);
    // the stair descends away from the corner: north-side corners descend north, south-side ones south
    const { dir, v0, v1 } = lexRect(e), hw = LEX_HW, len = LEX_LEN, vl = Math.min(v0, v1), vh = Math.max(v0, v1);
    // the well: side walls and treads (0.28 m going, 0.18 m rise)
    B.box(M.matte, u - hw - 0.12, u - hw, vl, vh, y - 3.0, y + 0.02, COL.concD, { top: false, bot: false });
    B.box(M.matte, u + hw, u + hw + 0.12, vl, vh, y - 3.0, y + 0.02, COL.concD, { top: false, bot: false });
    for (let k = 0; k < 17; k++) {
      const s = v0 + dir * (0.2 + k * 0.33), ty = y - 0.18 * (k + 1);
      B.box(M.matte, u - hw, u + hw, Math.min(s, s + dir * 0.33), Math.max(s, s + dir * 0.33), ty - 0.18, ty, k % 2 ? COL.slabU : COL.slab, { bot: false });
    }
    // the railing: top rail, mid rail and pickets on three sides (open at the head)
    const rails = [[[u - hw - 0.06, v0], [u - hw - 0.06, v1]], [[u + hw + 0.06, v0], [u + hw + 0.06, v1]], [[u - hw - 0.06, v1], [u + hw + 0.06, v1]]];
    for (const [a, b] of rails) {
      const A = toXZ(a[0], a[1]), Bp = toXZ(b[0], b[1]);
      B.bar(M.steel, A, Bp, 0.03, y + 1.02, y + 1.09, COL.green);
      B.bar(M.steel, A, Bp, 0.02, y + 0.12, y + 0.17, COL.green);
      const L = Math.hypot(Bp[0] - A[0], Bp[1] - A[1]), np = Math.max(2, Math.round(L / 0.14));
      for (let k = 0; k <= np; k++) { const t = k / np; B.post(M.steel, A[0] + (Bp[0] - A[0]) * t, A[1] + (Bp[1] - A[1]) * t, 0.011, y + 0.12, y + 1.02, COL.green); }
    }
    // the two lamp posts at the head with their globes
    for (const s of [-1, 1]) {
      const [lx, lz] = toXZ(u + s * (hw + 0.06), v0);
      B.post(M.steel, lx, lz, 0.045, y, y + 2.35, COL.green);
      B.post(M.steel, lx, lz, 0.09, y + 2.3, y + 2.42, COL.green);
      B.ball(M.lamp, lx, y + 2.62, lz, 0.2, COL.globe);
    }
    // the station's name plate on the railing's far end
    B.bar(M.matte, toXZ(u - 0.6, v1 + dir * 0.03), toXZ(u + 0.6, v1 + dir * 0.03), 0.015, y + 0.55, y + 0.95, COL.sign);
    const [kx, kz] = toXZ(u, (v0 + v1) / 2);
    COLLIDERS.addBox('kit31', { x: kx, y: y + 0.5, z: kz, hw: hw + 0.15, hh: 0.6, hd: len / 2 + 0.1, rotY: Math.atan2(toXZ(1, 0)[1] - toXZ(0, 0)[1], toXZ(1, 0)[0] - toXZ(0, 0)[0]) });
    n++;
  }
  return n;
}

// ---- hooks ----------------------------------------------------------------------------------------------------------
// the compiled station footprint (drawn as a 12 m brick tenement) is built here
export function apply(tile, ox, oz) {
  if (!AR32E) return;
  try { const n = lexApply(tile, ox, oz); if (n) console.log(`[ar32] w125e: ${n} sidewalk triangles cut for the Lexington Avenue stairs`); } catch (e) { console.warn('[ar32] w125e lex apply', e); }
  try { rfkApply(tile, ox, oz); } catch (e) { console.warn('[rfk34] apply', e); }
}
// site's shed
const GONE_TREES = [[2875.12, -2336.81], [2883.80, -2333.02], [2892.04, -2328.45], [2899.81, -2323.04], [2907.95, -2319.62], [2915.13, -2314.49],
  [2923.06, -2310.07], [2930.51, -2305.92]];
// compiled street furniture standing in a stair's well, and those trees
export function dropFurniture(wx, wz, f) {
  if (!AR32E) return false;
  if (f && f.k === 1 && GONE_TREES.some(([x, z]) => Math.abs(wx - x) < 0.8 && Math.abs(wz - z) < 0.8)) return true;
  for (const e of LEX) {
    if (Math.abs(wx - e.p[0]) > 9 || Math.abs(wz - e.p[1]) > 9) continue;
    const r = lexRect(e), [u, v] = toUV(wx, wz);
    if (Math.abs(u - r.u) < LEX_HW + 0.5 && v > Math.min(r.v0, r.v1) - 0.8 && v < Math.max(r.v0, r.v1) + 0.5) return true;
  }
  return false;
}
// and the compiled footprints under the viaduct's deck that stand through it (La Marqueta's market halls, 111th-116th
// St, compiled 11-12.2 m: their heightroof is the viaduct over them): built under the girders (underBuild)
const underDeck = (u, v) => v > V_S && v < V_N && u > tU(0, v) - EDGE - 0.5 && u < tU(3, v) + EDGE + 0.5;
// AR34 BRIDGES: the compiled 14.3 m CIVIC_STONE footprint at First Avenue and 125th St's north-east corner (centroid 3395.5,
// the RFK approach's steel bents, and the rebuilt ramps pass over it at 10-17 m: it is left out
const GONE_BLDG = [[3395.5, -2052.5]];
export function skipBuilding(cx, cz, h) {
  if (!AR32E) return false;
  if (RFK34 && GONE_BLDG.some(([x, z]) => Math.abs(cx - x) < 2 && Math.abs(cz - z) < 2)) return true;
  const [u, v] = toUV(cx, cz);
  return inHouse(u, v, 0.5) || (underDeck(u, v) && 3.52 + (h || 0) > GIRD_B - 0.3);
}
// those halls: their footprints' extent in the grid frame, brick to 0.25 m under the girders, a band of clerestory
// windows, a granite plinth
function underBuild(B, ctx) {
  const M = mats(), XZ = ctx.tile.S.bldgXZ;
  if (!XZ) return 0;
  let n = 0;
  for (const b of buildingsOf(ctx.tile)) {
    let cx = 0, cz = 0; const R = [];
    for (let k = 0; k < b.len; k++) { const x = XZ[(b.start + k) * 2] + ctx.ox, z = XZ[(b.start + k) * 2 + 1] + ctx.oz; R.push(toUV(x, z)); cx += x / b.len; cz += z / b.len; }
    const [u, v] = toUV(cx, cz);
    if (inHouse(u, v, 0.5) || !underDeck(u, v) || 3.52 + b.height <= GIRD_B - 0.3) continue;
    const u0 = Math.min(...R.map((p) => p[0])), u1 = Math.max(...R.map((p) => p[0])), v0 = Math.min(...R.map((p) => p[1])), v1 = Math.max(...R.map((p) => p[1]));
    const g = ctx.sampleT(cx, cz), top = GIRD_B - 0.25;
    B.box(M.matte, u0 - 0.05, u1 + 0.05, v0 - 0.05, v1 + 0.05, g - 0.1, g + 0.6, COL.granite);
    B.box(M.matte, u0, u1, v0, v1, g + 0.6, top, COL.brick, { topCol: COL.slabU });
    B.box(M.glass, u0 - 0.04, u1 + 0.04, v0 - 0.04, v1 + 0.04, top - 1.3, top - 0.45, COL.glass, { top: false, bot: false });
    B.box(M.matte, u0 - 0.1, u1 + 0.1, v0 - 0.1, v1 + 0.1, top - 0.3, top, COL.lime);
    COLLIDERS.addBox('kit31', { x: cx, y: (g + top) / 2, z: cz, hw: (u1 - u0) / 2, hh: (top - g) / 2, hd: (v1 - v0) / 2, rotY: Math.atan2(toXZ(1, 0)[1] - toXZ(0, 0)[1], toXZ(1, 0)[0] - toXZ(0, 0)[0]) });
    n++;
  }
  return n;
}
// AR33: the structures the viaduct part (vk/viaducts.js) has taken over ('park': the viaduct, its platforms and the
// station house) are left to it
const vkHas = (k) => !!(globalThis.__AR33VK && globalThis.__AR33VK.has(k));
export function build(group, ctx) {
  if (!AR32E) return;
  const B = new Bag();
  const parts = [];
  if (!vkHas('park')) {
    try { parts.push(['viaduct', viaductBuild(B, ctx)]); } catch (e) { console.warn('[ar32] w125e viaduct', e); }
    try { parts.push(['platforms', platformsBuild(B, ctx)]); } catch (e) { console.warn('[ar32] w125e platforms', e); }
    try { parts.push(['house', houseBuild(B, ctx)]); } catch (e) { console.warn('[ar32] w125e station house', e); }
  }
  try { parts.push(['under', underBuild(B, ctx)]); } catch (e) { console.warn('[ar32] w125e under the viaduct', e); }
  if (!RFK34) try { parts.push(['rfk', rfkBuild(B, ctx)]); } catch (e) { console.warn('[ar32] w125e RFK', e); }
  try { rfkBuild34(group, ctx); } catch (e) { console.warn('[rfk34] build', e); }
  try { parts.push(['lex', lexBuild(B, ctx)]); } catch (e) { console.warn('[ar32] w125e Lexington stairs', e); }
  const r = B.flush(group, ctx.key);
  if (r.meshes) console.log(`[ar32] w125e tile ${ctx.key}: ${parts.filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(', ')}; ${r.meshes} meshes, ${r.tris | 0} triangles`);
}
