// CP32 part (city/centralPark.js): Bethesda Terrace (Calvert Vaux and Jacob Wrey Mould, 1859-64), the Angel of the
// Waters (Emma Stebbins, 1873), the Arcade and the lake front, to the plan measured from OpenStreetMap and the NYS
// orthoimagery (docs/notes/central-park-bethesda.md; frame, plan and builders in city/cpBethesdaKit.js).
// The compiled city had the terrace's footprint as one 7 m building box on the park's lawn. Here:
//   * apply(): the drive and the ground round the upper terrace are lifted onto the upper level, the measured drop over
//     the lower terrace (the 3DEP's 14 m grid averages the drive with the pit beside it), every ground section under the
//     terrace's footprint
//     is cut out, the terrain grid lowered under and round the sunk parts (and the holes that opens in the compiled lawn
//     filled), and walk sections laid 0.30 m inside the masonry for the walkers' samplers (the drawn floors are the
//     kit's slabs; each floor and tread is a `deck` collider the walkers stand on);
//   * build(): the lower terrace with its paving, the fountain, the two grand staircases, the Arcade with its tiled
//     ceiling, the upper terrace, the stair down from the Mall, the lake front, the balustrades and piers, the lamps;
//   * promenades() and seats(): walkers round the fountain, down the stairs and through the Arcade, people on the pool's
//     rim; and the Cherry Hill Fountain on its concourse (built from its own tile).
// `?cp32b=0` leaves the compiled park here.
import * as THREE from 'three';
import { FURN } from '../shared/geo.js';
import { COLLIDERS } from './colliders.js';
import { mkConvex, tpSplit } from './tsqPlaza.js';
import { cpRelief, cpDemToWorld, cpReliefReady, CP_DATUM } from './cpRelief.js';
import * as LAND from './cpLand.js';
import { PLAN, TH, C0, wld, loc, yawAB, buildTerrace, buildFountain, buildCherry, CHERRY, mats } from './cpBethesdaKit.js';

export const CP32B = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('cp32b') === '0');
// `?cpbpad=17`: the terrain pit's old 17 m margin round the sunk parts, for an A/B (CPZ34)
const Q_PAD = typeof location !== 'undefined' && new URLSearchParams(location.search).get('cpbpad') ? +new URLSearchParams(location.search).get('cpbpad') : null;

// ---- levels ---------------------------------------------------------------------------------------------------------
// The lower terrace's paving 0.95 m over the Lake (LAND's surface, 3DEP 16.6 m NAVD88; the 1 m LiDAR: the Lake 54.4 ft, the
// lower terrace 57.5 ft), the upper terrace and the drive 19'0" over it (the stair drawing; the LiDAR 19.2 ft), the Arcade's
// floor and the forecourt 0.24 m over the lower terrace (the north elevation: 18'3" from its floor to the cornice's top).
// Before the relief lands: the flat compile's level for the upper terrace and the same drop under it.
const LAKE_DEM = 16.6, FREE = 0.95, DROP = 5.79, SOUTH_UP = 0.24;
let _lv = null;
export function cpbLevels() {
  const ready = cpReliefReady();
  if (_lv && _lv.ready === ready) return _lv;
  let up, low, lake = null;
  if (!ready) { up = CP_DATUM + 0.01; low = up - DROP; lake = low - FREE; }
  else {
    const [fx, fz] = wld(PLAN.lakeA + 1.5, 0);
    try { if (typeof LAND.cpWaterLevelY === 'function') lake = LAND.cpWaterLevelY('lake', fx, fz); } catch (e) { lake = null; }
    if (lake == null || !isFinite(lake)) lake = cpDemToWorld(LAKE_DEM, fx, fz);
    low = lake + FREE;
    up = low + DROP;
  }
  _lv = { ready, up, low, lake, south: low + SOUTH_UP, drop: up - low };
  // the Mall's ground at the head of the Mall stair (lifted like the rest round the upper terrace)
  const [hx, hz] = wld(PLAN.mallTopA - 0.8, 0);
  _lv.mall = ready ? CP_DATUM + 0.01 + cpRelief(hx, hz) + liftWith(_lv, hx, hz) : up;
  if (typeof window !== 'undefined') window.__CP32B = { ..._lv };
  return _lv;
}

// The lift of the ground round the upper terrace (metres to add to the relief-heighted ground at world x, z): the
// difference between the upper level and the ground under it, full inside the core (the upper terrace and the drive over
// the Arcade: a -82..-51.8, |b| <= 30) and fading out over 45 m (the 3DEP's 14 m grid puts the drive 1.8 m under the
// LiDAR's 76.7-77.2 ft there, averaging it with the pit). Other parts that set heights
// from cpRelief() directly can add it (exported).
const CORE = { a0: -82, a1: -51.8, b: 30 }, FADE = 45;
const LIFT_BOX = (() => { const r = [1e9, 1e9, -1e9, -1e9]; for (const [a, b] of [[CORE.a0 - FADE, -CORE.b - FADE], [CORE.a0 - FADE, CORE.b + FADE], [CORE.a1 + FADE, -CORE.b - FADE], [CORE.a1 + FADE, CORE.b + FADE]]) { const [x, z] = wld(a, b); r[0] = Math.min(r[0], x); r[1] = Math.min(r[1], z); r[2] = Math.max(r[2], x); r[3] = Math.max(r[3], z); } return r; })();
export function cpbLift(x, z) {
  if (!CP32B) return 0;
  return liftWith(cpbLevels(), x, z);
}
function liftWith(L, x, z) {
  if (!L.ready) return 0;
  const [a, b] = loc(x, z);
  const da = a > CORE.a1 ? a - CORE.a1 : a < CORE.a0 ? CORE.a0 - a : 0, db = Math.max(0, Math.abs(b) - CORE.b), d = Math.hypot(da, db);
  if (d >= FADE) return 0;
  const t = d / FADE, w = 1 - t * t * (3 - 2 * t);
  return (L.up - (CP_DATUM + 0.01 + cpRelief(x, z))) * w;
}

// ---- the footprint --------------------------------------------------------------------------------------------------
// boxes in the frame { a0, a1, b0, b1 }: what the terrace replaces (sections cut, compiled things dropped)
export const BAY_OUT = PLAN.bay.c + PLAN.bay.r, BAY_HALF = Math.sqrt(PLAN.bay.r ** 2 - (PLAN.sideB - PLAN.bay.c) ** 2);   // 27.51, 9.41
const CUT = [
  { a0: PLAN.stairFootA, a1: PLAN.lakeA + 0.7, b0: -PLAN.wallOut[1], b1: PLAN.wallOut[1] },            // the lower terrace
  { a0: PLAN.lakeA, a1: BAY_OUT + 0.7, b0: -BAY_HALF - 0.7, b1: BAY_HALF + 0.7 },                     // the lake bay
  { a0: -BAY_HALF - 0.7, a1: BAY_HALF + 0.7, b0: -BAY_OUT - 0.9, b1: BAY_OUT + 0.9 },                  // the side bays
  { a0: PLAN.upperA1, a1: PLAN.stairFootA, b0: -PLAN.wallOut[1] - 0.2, b1: PLAN.wallOut[1] + 0.2 },   // stairs, forecourt, upper terrace
  { a0: PLAN.mallTopA - 0.45, a1: PLAN.tunnelA1 + 0.3, b0: -PLAN.mallB - PLAN.mallWall - 0.2, b1: PLAN.mallB + PLAN.mallWall + 0.2 },   // the Mall stair
];
// the sunk parts (the terrain is lowered under them and 17 m round them)
const SUNK = [
  { a0: PLAN.arcadeA, a1: BAY_OUT + 0.7, b0: -BAY_OUT - 0.9, b1: BAY_OUT + 0.9 },
  { a0: PLAN.stairTopA, a1: PLAN.stairFootA, b0: -PLAN.wallOut[1] - 0.2, b1: PLAN.wallOut[1] + 0.2 },
  { a0: PLAN.tunnelA1, a1: PLAN.arcadeA, b0: -PLAN.arcadeB - 1.0, b1: PLAN.arcadeB + 1.0 },
  { a0: PLAN.mallTopA - 0.3, a1: PLAN.tunnelA1, b0: -PLAN.mallB - PLAN.mallWall - 0.2, b1: PLAN.mallB + PLAN.mallWall + 0.2 },
];
// the structure as built (the plaza's outline with its walls, the bays, the stairs, the upper terrace, the Mall stair)
function onStructure(a, b) {
  const ab = Math.abs(b);
  if (a > PLAN.stairFootA - 0.1 && a < PLAN.lakeA + 0.7 && ab < PLAN.wallOut[1] + 0.1) return true;
  if (a > PLAN.lakeA - 0.1 && Math.hypot(a - PLAN.bay.c, b) < PLAN.bay.r + 0.75) return true;
  if (ab > PLAN.sideB - 0.1 && Math.hypot(a, ab - PLAN.bay.c) < PLAN.bay.r + 0.75) return true;
  if (a > PLAN.upperA1 - 0.1 && a <= PLAN.stairFootA && ab < PLAN.wallOut[1] + 0.3) return true;
  if (a > PLAN.mallTopA - 0.6 && a < PLAN.tunnelA1 + 0.4 && ab < PLAN.mallB + PLAN.mallWall + 0.3) return true;
  return false;
}
const inBox = (a, b, B, pad = 0) => a > B.a0 - pad && a < B.a1 + pad && b > B.b0 - pad && b < B.b1 + pad;
const boxDist = (a, b, B) => Math.hypot(Math.max(0, B.a0 - a, a - B.a1), Math.max(0, B.b0 - b, b - B.b1));
// is world (x, z) on the terrace's structure (pad metres of margin)? For the other parts' trees, lamps and benches
export function cpbInside(x, z, pad = 0) {
  if (!CP32B) return false;
  const [a, b] = loc(x, z);
  return CUT.some((B) => inBox(a, b, B, pad));
}
const quadOf = (B) => mkConvex([wld(B.a0, B.b0), wld(B.a0, B.b1), wld(B.a1, B.b1), wld(B.a1, B.b0)]);

// ---- the walk surfaces (hidden 0.30 m inside the masonry; the walkers stand on the deck colliders over them) ---------
// [a0, a1, b0, b1, y(a) at a0, y at a1] pieces, planar along a
function walkPieces(L) {
  const P = [], H = 0.30, s = L.south, up = L.up;
  const fl = (a0, a1, b0, b1, y0, y1 = y0) => P.push([a0, a1, b0, b1, y0 - H, y1 - H]);
  const lo = L.low;   // every floor's walk section under the plaza's level (the decks lift the walkers onto the floors)
  fl(PLAN.southA, PLAN.lakeA, -PLAN.sideB, PLAN.sideB, lo);                          // the plaza (the basin is walked round)
  fl(-BAY_HALF + 1, BAY_HALF - 1, -BAY_OUT + 0.6, -PLAN.sideB, lo);
  fl(-BAY_HALF + 1, BAY_HALF - 1, PLAN.sideB, BAY_OUT - 0.6, lo);
  fl(PLAN.lakeA, BAY_OUT - 0.6, -BAY_HALF + 1, BAY_HALF - 1, lo);
  fl(PLAN.stairFootA, PLAN.southA, -PLAN.sideB, PLAN.sideB, lo);                     // the south terrace
  fl(PLAN.tunnelA1, PLAN.stairFootA, -PLAN.arcadeB, PLAN.arcadeB, lo);               // forecourt, Arcade, passage
  // the grand staircases: two flights and the landing, the ramp under the nosings
  const h1 = (up - s) / 2;
  for (const sg of [-1, 1]) {
    const b0 = sg < 0 ? -PLAN.stairB1 : PLAN.stairB0, b1 = sg < 0 ? -PLAN.stairB0 : PLAN.stairB1;
    P.push([PLAN.landA0, PLAN.stairFootA, b0, b1, s + h1 - H - 0.05, s - H]);
    fl(PLAN.landA1, PLAN.landA0, b0, b1, s + h1);
    P.push([PLAN.stairTopA, PLAN.landA1, b0, b1, up - H - 0.05, s + h1 - H]);
  }
  fl(PLAN.upperA1 - 0.4, PLAN.stairTopA, -PLAN.wallOut[1], PLAN.wallOut[1], up);       // the upper terrace
  fl(PLAN.stairTopA, PLAN.arcadeA - PLAN.arcadeT, -PLAN.arcadeB, PLAN.arcadeB, up);   // over the Arcade
  // the Mall stair: the landing below the drive, the flight up to the Mall
  fl(PLAN.mallLandA, PLAN.tunnelA1, -PLAN.mallB, PLAN.mallB, lo);
  const mt = L.mall ?? up;
  P.push([PLAN.mallLandA - PLAN.mallFl, PLAN.mallLandA, -PLAN.mallB, PLAN.mallB, s + (mt - s) / 2 - H - 0.05, s - H]);
  fl(PLAN.mallTopA + PLAN.mallFl, PLAN.mallLandA - PLAN.mallFl, -PLAN.mallB, PLAN.mallB, s + (mt - s) / 2);
  P.push([PLAN.mallTopA - 0.6, PLAN.mallTopA + PLAN.mallFl, -PLAN.mallB, PLAN.mallB, mt - H, s + (mt - s) / 2 - H - 0.05]);
  return P;
}

// ---- apply: the ground ----------------------------------------------------------------------------------------------
const SECTIONS = ['asphalt', 'sidewalk', 'curb', 'paintW', 'paintY', 'grass', 'path', 'paintG', 'brick', 'gutter', 'busred', 'warn', 'warnIron', 'grassU', 'plaza', 'gravel'];
export function apply(tile, ox, oz) {
  if (!CP32B) return;
  const L = cpbLevels();
  // the tile's reach into the terrace (world box of everything this touches, with the lift's fade)
  const reach = [...CUT, ...SUNK].reduce((r, B) => { for (const [x, z] of [wld(B.a0 - 80, B.b0 - 80), wld(B.a0 - 80, B.b1 + 80), wld(B.a1 + 80, B.b0 - 80), wld(B.a1 + 80, B.b1 + 80)]) { r[0] = Math.min(r[0], x); r[1] = Math.min(r[1], z); r[2] = Math.max(r[2], x); r[3] = Math.max(r[3], z); } return r; }, [1e9, 1e9, -1e9, -1e9]);
  if (reach[2] < ox || reach[0] > ox + 512 || reach[3] < oz || reach[1] > oz + 512) return;
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  // 1. the lift round the upper terrace, on every section vertex and the terrain grid
  let lifted = 0;
  if (L.ready) {
    const LB = LIFT_BOX;   // the lift's reach in world x, z: most of a tile's vertices are rejected on it
    for (const name of SECTIONS) {
      const a = tile.S[name];
      if (!a || a.length < 9) continue;
      let arr = a;
      for (let i = 0; i + 2 < a.length; i += 3) {
        const x = a[i] + ox, z = a[i + 2] + oz;
        if (x < LB[0] || x > LB[2] || z < LB[1] || z > LB[3]) continue;
        const d = cpbLift(x, z);
        if (d !== 0) { if (arr === a) arr = Float32Array.from(a); arr[i + 1] += d; lifted++; }
      }
      if (arr !== a) tile.S[name] = arr;
    }
  }
  // 2. every section cut out of the footprint
  const R = { ped: CUT.map(quadOf), car: [] };
  const bb = R.ped.reduce((r, C) => [Math.min(r[0], C.bb[0]), Math.min(r[1], C.bb[1]), Math.max(r[2], C.bb[2]), Math.max(r[3], C.bb[3])], [1e9, 1e9, -1e9, -1e9]);
  let cutN = 0;
  const fan = (poly, out) => { for (let k = 1; k + 1 < poly.length; k++) for (const p of [poly[0], poly[k], poly[k + 1]]) out.push(p[0] - ox, p[1], p[2] - oz); };
  if (!(bb[2] < ox || bb[0] > ox + 512 || bb[3] < oz || bb[1] > oz + 512)) {
    for (const name of SECTIONS) {
      const a = tile.S[name];
      if (!a || a.length < 9) continue;
      const out = [];
      let changed = false;
      for (let i = 0; i + 8 < a.length; i += 9) {
        const x0 = a[i] + ox, z0 = a[i + 2] + oz, x1 = a[i + 3] + ox, z1 = a[i + 5] + oz, x2 = a[i + 6] + ox, z2 = a[i + 8] + oz;
        if (Math.max(x0, x1, x2) < bb[0] || Math.min(x0, x1, x2) > bb[2] || Math.max(z0, z1, z2) < bb[1] || Math.min(z0, z1, z2) > bb[3]) { for (let k = 0; k < 9; k++) out.push(a[i + k]); continue; }
        // in the frame: a triangle whose (a, b) box meets none of the boxes is kept as it is
        { const [pa, pb] = loc(x0, z0), [qa, qb] = loc(x1, z1), [ra, rb] = loc(x2, z2), A0 = Math.min(pa, qa, ra), A1 = Math.max(pa, qa, ra), B0 = Math.min(pb, qb, rb), B1 = Math.max(pb, qb, rb);
          if (!CUT.some((B) => A1 > B.a0 && A0 < B.a1 && B1 > B.b0 && B0 < B.b1)) { for (let k = 0; k < 9; k++) out.push(a[i + k]); continue; } }
        const S = tpSplit([[x0, a[i + 1], z0], [x1, a[i + 4], z1], [x2, a[i + 7], z2]], R);
        if (!S.plaza.length) { for (let k = 0; k < 9; k++) out.push(a[i + k]); continue; }
        changed = true; cutN++;
        for (const p of S.road) fan(p, out);
      }
      if (changed) tile.S[name] = Float32Array.from(out);
    }
  }
  // 3. the walk sections (sidewalk kind), in 1.5 m cells clipped to the tile, the basin left out
  const walk = [];
  for (const [a0, a1, b0, b1, y0, y1] of walkPieces(L)) {
    const na = Math.max(1, Math.ceil((a1 - a0) / 1.5)), nb = Math.max(1, Math.ceil((b1 - b0) / 1.5));
    for (let i = 0; i < na; i++) for (let j = 0; j < nb; j++) {
      const A0 = a0 + ((a1 - a0) * i) / na, A1 = a0 + ((a1 - a0) * (i + 1)) / na, B0 = b0 + ((b1 - b0) * j) / nb, B1 = b0 + ((b1 - b0) * (j + 1)) / nb;
      const am = (A0 + A1) / 2, bm = (B0 + B1) / 2;
      if (Math.hypot(am, bm) < PLAN.basinR - 0.6) continue;
      const [cx, cz] = wld(am, bm);
      if (cx < ox - 2 || cx > ox + 514 || cz < oz - 2 || cz > oz + 514) continue;
      const yA = (a) => y0 + ((y1 - y0) * (a - a0)) / (a1 - a0 || 1);
      const q = [[A0, B0], [A1, B0], [A1, B1], [A0, B1]].map(([a, b]) => { const [x, z] = wld(a, b); return [x - ox, yA(a), z - oz]; });
      // wound like the compiled ground (counter-clockwise seen from above in x, z)
      for (const t of [[0, 2, 1], [0, 3, 2]]) for (const k of t) walk.push(q[k][0], q[k][1], q[k][2]);
    }
  }
  if (walk.length) tile.S.sidewalk = cat(tile.S.sidewalk, walk);
  // 4. the terrain grid: lifted with the ground, lowered under the sunk parts and 17 m round them
  const res = tile.header.res, n = res + 1, cw = 512 / res, T = tile.S.terrain;
  const SUNK_PAD = Q_PAD ?? Math.max(6, cw * 1.5);
  let lowered = 0;
  if (T) {
    const Tn = Float32Array.from(T);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = ox + i * cw, z = oz + j * cw, k = j * n + i;
      if (L.ready) Tn[k] += cpbLift(x, z);
      const [a, b] = loc(x, z);
      // CPZ34: a cell and a half round the sunk parts, enough that no grid cell under them keeps a raised corner; the old
      // 17 m pit showed through every sliver between the lawn's sections as dark wedges east and west of the terrace
      // (teaser 4 v2 review, t4Crane; fillHoles leaves gaps under a metre bare)
      if (SUNK.some((B) => boxDist(a, b, B) < SUNK_PAD)) { const y = L.low - 0.45; if (Tn[k] > y) { Tn[k] = y; lowered++; } }
    }
    tile.S.terrain = Tn;
    // 5. the lawn over the lowered cells: every 1 m cell of a lowered terrain cell that no drawn section covers and the
    //    terrace does not, filled with grass at the ground's level
    if (lowered) fillHoles(tile, ox, oz, Tn, res, L);
  }
  if (lifted || cutN || walk.length || lowered) console.log(`[cp32b] tile ${ox / 512}_${oz / 512}: ${lifted} vertices lifted, ${cutN} section triangles cut, ${walk.length / 9} walk triangles, ${lowered} terrain nodes lowered (${((typeof performance !== 'undefined' ? performance.now() : 0) - t0).toFixed(1)} ms)`);
}

// a section's array with more triangles appended
const cat = (A, add) => { const n = A ? A.length : 0, r = new Float32Array(n + add.length); if (n) r.set(A, 0); r.set(add, n); return r; };
// rasterise the drawn sections at 1 m over the lowered cells; fill what is bare with grass
function fillHoles(tile, ox, oz, Tn, res, L) {
  const n = res + 1, cw = 512 / res;
  // the lowered cells' box (tile-local)
  let i0 = 1e9, i1 = -1, j0 = 1e9, j1 = -1;
  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
    const k = j * n + i;
    if (Math.min(Tn[k], Tn[k + 1], Tn[k + n], Tn[k + n + 1]) < L.low + 0.5) { i0 = Math.min(i0, i); i1 = Math.max(i1, i); j0 = Math.min(j0, j); j1 = Math.max(j1, j); }
  }
  if (i1 < 0) return;
  const X0 = i0 * cw, Z0 = j0 * cw, W = (i1 + 1 - i0) * cw, H = (j1 + 1 - j0) * cw, G = new Uint8Array(W * H);
  const GY = new Float32Array(W * H).fill(1e9);   // CPZ34: the lowest drawn section at each covered cell's centre
  for (const name of SECTIONS) {
    const a = tile.S[name];
    if (!a) continue;
    for (let t = 0; t + 8 < a.length; t += 9) {
      const p0 = a[t] - X0, p1 = a[t + 3] - X0, p2 = a[t + 6] - X0, q0 = a[t + 2] - Z0, q1 = a[t + 5] - Z0, q2 = a[t + 8] - Z0;
      const mnx = p0 < p1 ? (p0 < p2 ? p0 : p2) : (p1 < p2 ? p1 : p2), mxx = p0 > p1 ? (p0 > p2 ? p0 : p2) : (p1 > p2 ? p1 : p2);
      if (mxx < 0 || mnx > W) continue;
      const mnz = q0 < q1 ? (q0 < q2 ? q0 : q2) : (q1 < q2 ? q1 : q2), mxz = q0 > q1 ? (q0 > q2 ? q0 : q2) : (q1 > q2 ? q1 : q2);
      if (mxz < 0 || mnz > H) continue;
      const xs = [p0, p1, p2], zs = [q0, q1, q2];
      const cx0 = Math.max(0, Math.floor(mnx)), cx1 = Math.min(W - 1, Math.ceil(mxx)), cz0 = Math.max(0, Math.floor(mnz)), cz1 = Math.min(H - 1, Math.ceil(mxz));
      if (cx1 < cx0 || cz1 < cz0) continue;
      const d = (zs[1] - zs[2]) * (xs[0] - xs[2]) + (xs[2] - xs[1]) * (zs[0] - zs[2]);
      if (Math.abs(d) < 1e-9) continue;
      for (let z = cz0; z <= cz1; z++) for (let x = cx0; x <= cx1; x++) {
        // a cell counts as covered when its centre is within 0.4 m of the triangle (slivers between sections stay bare)
        const px = x + 0.5, pz = z + 0.5;
        const l0 = ((zs[1] - zs[2]) * (px - xs[2]) + (xs[2] - xs[1]) * (pz - zs[2])) / d, l1 = ((zs[2] - zs[0]) * (px - xs[2]) + (xs[0] - xs[2]) * (pz - zs[2])) / d, l2 = 1 - l0 - l1;
        if (l0 > -0.08 && l1 > -0.08 && l2 > -0.08) G[z * W + x] = 1;
        // the triangle's plane at the cell's corners and centre, where it touches the cell: the backing below goes under
        // its lowest point (a 1 m cell of a sloping bank must not poke through on the downhill side)
        let touch = false, ymin = 1e9;
        for (const [qx, qz] of [[x, z], [x + 1, z], [x, z + 1], [x + 1, z + 1], [px, pz]]) {
          const m0 = ((zs[1] - zs[2]) * (qx - xs[2]) + (xs[2] - xs[1]) * (qz - zs[2])) / d, m1 = ((zs[2] - zs[0]) * (qx - xs[2]) + (xs[0] - xs[2]) * (qz - zs[2])) / d, m2 = 1 - m0 - m1;
          if (m0 > -0.08 && m1 > -0.08 && m2 > -0.08) touch = true;
          const yq = m0 * a[t + 1] + m1 * a[t + 4] + m2 * a[t + 7];
          if (yq < ymin) ymin = yq;
        }
        if (touch && ymin < GY[z * W + x]) GY[z * W + x] = ymin;
      }
    }
  }
  const out = [];
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    const lx = X0 + x, lz = Z0 + z, wx = lx + ox + 0.5, wz = lz + oz + 0.5;
    const [a, b] = loc(wx, wz);
    if (onStructure(a, b)) continue;                                                     // the terrace's own
    if (a > PLAN.lakeA - 4) { try { if (typeof LAND.cpWaterY === 'function' && LAND.cpWaterY(wx, wz) !== null) continue; } catch (e) { /* no water data */ } }   // the Lake's
    const yG = L.ready ? CP_DATUM + cpRelief(wx, wz) + cpbLift(wx, wz) : CP_DATUM;
    // CPZ34: a covered cell gets a backing 6 cm under its lowest section, so the slivers between the sections (under a
    // metre, which the centre test counts as covered) close over the lowered grid instead of opening onto the 6 m pit and
    // the river plane under it (the teaser's "dark blue shards" on the lawns beside the terrace)
    const gy = GY[z * W + x];
    const y = G[z * W + x] ? Math.min(yG, gy) - 0.06 : gy < 1e8 ? Math.min(yG - 0.005, gy - 0.06) : yG - 0.005;
    out.push(lx, y, lz, lx, y, lz + 1, lx + 1, y, lz + 1, lx, y, lz, lx + 1, y, lz + 1, lx + 1, y, lz);
  }
  if (out.length) tile.S.grass = cat(tile.S.grass, out);
}

// ---- the compiled things the terrace replaces -----------------------------------------------------------------------
export function skipBuilding(cx, cz, h, area) {
  if (!CP32B) return false;
  const [a, b] = loc(cx, cz);
  return CUT.some((B) => inBox(a, b, B, 2));
}
export function dropFurniture(wx, wz, f) {
  if (!CP32B) return false;
  return cpbInside(wx, wz, 0.8) || Math.hypot(wx - CHERRY.x, wz - CHERRY.z) < CHERRY.R + 0.8;
}

// ---- build: everything from the tile holding the fountain -----------------------------------------------------------
let _built = 0, _cherry = 0;
export function build(group, ctx) {
  if (!CP32B) return;
  const { ox, oz } = ctx;
  if (CHERRY.x >= ox && CHERRY.x < ox + 512 && CHERRY.z >= oz && CHERRY.z < oz + 512) buildCherryHill(group, ctx);
  if (!(C0[0] >= ox && C0[0] < ox + 512 && C0[1] >= oz && C0[1] < oz + 512)) return;
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const L = cpbLevels();
  const G = new THREE.Group();
  G.name = 'cp32b:terrace';
  G.position.set(C0[0], 0, C0[1]);
  G.rotation.y = -TH;
  group.add(G);
  const outside = (a, b) => { const [x, z] = wld(a, b); return (L.ready ? CP_DATUM + cpRelief(x, z) + cpbLift(x, z) : CP_DATUM); };
  const info = buildTerrace(G, L, { outside, colliders: !_built, addBox, addPrism });
  const F = buildFountain(G, L, { colliders: !_built, addBox });
  _built++;
  G.updateMatrixWorld(true);
  if (typeof window !== 'undefined') {
    let tris = 0; G.traverse((o) => { if (o.isMesh && o.geometry) { const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); } });
    window.__CP32B = { ...(window.__CP32B || {}), ...L, tris: tris | 0, meshes: G.children.length, ms: +((typeof performance !== 'undefined' ? performance.now() : 0) - t0).toFixed(1), info, fountain: F };
  }
}
// the Cherry Hill Fountain on its concourse: at the paving's level round the basin
function buildCherryHill(group, ctx) {
  const ys = [];
  for (const [dx, dz] of [[4.2, 0], [-4.2, 0], [0, 4.2], [0, -4.2]]) { const y = ctx.padYNear ? ctx.padYNear(CHERRY.x + dx, CHERRY.z + dz) : null; if (y !== null && isFinite(y)) ys.push(y); }
  const y = ys.length ? ys.reduce((p, q) => p + q, 0) / ys.length : CP_DATUM + 0.03 + cpRelief(CHERRY.x, CHERRY.z);
  const G = buildCherry(mats());
  G.position.set(CHERRY.x, y, CHERRY.z);
  group.add(G);
  if (!_cherry) {
    const pts = new Float32Array(32);
    for (let i = 0; i < 16; i++) { const t = (i / 16) * Math.PI * 2; pts[i * 2] = CHERRY.x + Math.cos(t) * (CHERRY.R + 0.08); pts[i * 2 + 1] = CHERRY.z + Math.sin(t) * (CHERRY.R + 0.08); }
    COLLIDERS.addPrism('kit31', { pts, minX: CHERRY.x - CHERRY.R - 0.1, minZ: CHERRY.z - CHERRY.R - 0.1, maxX: CHERRY.x + CHERRY.R + 0.1, maxZ: CHERRY.z + CHERRY.R + 0.1, y0: y, y1: y + 0.58, deck: false });
  }
  _cherry++;
}
// colliders in the frame: a box over a0..a1, b0..b1, y0..y1 (deck: stood on)
function addBox(a0, a1, b0, b1, y0, y1, deck = false) {
  const [x, z] = wld((a0 + a1) / 2, (b0 + b1) / 2);
  COLLIDERS.addBox('kit31', { x, y: (y0 + y1) / 2, z, hw: Math.abs(b1 - b0) / 2, hh: Math.abs(y1 - y0) / 2, hd: Math.abs(a1 - a0) / 2, rotY: TH, deck });
}
// a prism over a polygon of [a, b] points
function addPrism(poly, y0, y1, deck = false) {
  const pts = new Float32Array(poly.length * 2);
  let minX = 1e9, minZ = 1e9, maxX = -1e9, maxZ = -1e9;
  poly.forEach(([a, b], i) => { const [x, z] = wld(a, b); pts[i * 2] = x; pts[i * 2 + 1] = z; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); });
  COLLIDERS.addPrism('kit31', { pts, minX, minZ, maxX, maxZ, y0, y1, deck });
}

// ---- walkers --------------------------------------------------------------------------------------------------------
const P3 = (a, b) => { const [x, z] = wld(a, b); return [x, 0, z]; };
export function promenades() {
  if (!CP32B) return [];
  const out = [];
  // round the fountain, two rings. CP33 (review t4Angel: walkers stood shin-deep in the pool): the pool's coping ends at
  // PLAN.basinR + 0.45 = 15.1 m and peds.js lets a promenade walker spread 2.2 m off its line wherever the ground is paved, so
  // the inner ring sits at 18.2 m (its inner edge 16.0 m, a metre clear of the coping and of the people seated on it)
  for (const [r, busy] of [[18.2, 4], [19.5, 3]]) {
    const pts = [];
    for (let k = 0; k <= 36; k++) { const t = (k / 36) * Math.PI * 2; pts.push(P3(Math.cos(t) * r, Math.sin(t) * r)); }
    out.push({ pts, busy });
  }
  // the axis: the lake front to the fountain, the fountain to the Arcade, through it and up the Mall stair to the Mall
  out.push({ pts: [P3(PLAN.lakeA + 2.5, 0), P3(17, 0)], busy: 3 });
  out.push({ pts: [P3(-16.6, 0), P3(-30, 0), P3(-45, 0), P3(-58, 0), P3(-72, 0), P3(PLAN.mallLandA + 0.5, 0), P3(-95, 0), P3(PLAN.mallTopA - 4, 0)], busy: 5 });
  out.push({ pts: [P3(-16.6, 2.4), P3(-30, 3.0), P3(-45, 3.0), P3(-60, 2.4), P3(-74, 2.2), P3(PLAN.mallLandA + 0.5, 2.6), P3(-95, 2.6), P3(PLAN.mallTopA - 4, 2.6)], busy: 4 });
  out.push({ pts: [P3(-16.6, -2.4), P3(-30, -3.0), P3(-45, -3.0), P3(-60, -2.4), P3(-74, -2.2), P3(PLAN.mallLandA + 0.5, -2.6), P3(-95, -2.6), P3(PLAN.mallTopA - 4, -2.6)], busy: 4 });
  // through the loggias either side of the passage
  for (const sg of [-1, 1]) out.push({ pts: [P3(-44, sg * 8), P3(-58, sg * 8), P3(-64.5, sg * 8), P3(-64.5, sg * 5)], busy: 2 });
  // the grand staircases: from the plaza's side up to the upper terrace
  for (const sg of [-1, 1]) {
    out.push({ pts: [P3(-12, sg * 15.5), P3(-30, sg * 18.1), P3(PLAN.stairFootA + 0.5, sg * 18.1), P3(PLAN.landA0 - 2.4, sg * 18.1), P3(PLAN.stairTopA - 1.5, sg * 18.1), P3(-63.5, sg * 12)], busy: 4 });
    out.push({ pts: [P3(-26, sg * 15.0), P3(PLAN.stairFootA + 0.5, sg * 15.0), P3(PLAN.stairTopA - 1.5, sg * 15.0), P3(-64.5, sg * 20)], busy: 3 });
  }
  // along the upper terrace and the lake front
  out.push({ pts: [P3(-63.2, -22.5), P3(-63.2, 0), P3(-63.2, 22.5)], busy: 4 });
  out.push({ pts: [P3(-55.3, -9.8), P3(-55.3, 9.8)], busy: 2 });
  out.push({ pts: [P3(PLAN.lakeA - 1.4, -21.5), P3(PLAN.lakeA - 1.4, -9), P3(BAY_OUT - 2.2, 0), P3(PLAN.lakeA - 1.4, 9), P3(PLAN.lakeA - 1.4, 21.5)], busy: 3 });
  // across the plaza's corners
  for (const sg of [-1, 1]) out.push({ pts: [P3(21, sg * 20.5), P3(12, sg * 21.5), P3(0, sg * 21.8), P3(-12, sg * 21.5), P3(-19.8, sg * 20.8)], busy: 2 });
  return out;
}
// people on the pool's rim, facing out with their backs to the water, and on the lake wall's parapet (0.54 m), facing the
// fountain with the Lake at their backs
let _seats = null;
export function seats() {
  if (!CP32B) return [];
  if (_seats && _seats.ready === cpReliefReady()) return _seats.list;
  const L = cpbLevels(), list = [];
  const rimY = L.low, rimH = 0.45, r = PLAN.basinR + 0.14;
  let g = 0;
  for (let k = 0; k < 110; k++) {
    const t = (k / 110) * Math.PI * 2, a = Math.cos(t) * r, b = Math.sin(t) * r;
    const [x, z] = wld(a, b);
    if (k % 3 === 0) g++;
    list.push({ x: +x.toFixed(3), y: +rimY.toFixed(3), z: +z.toFixed(3), yaw: +yawAB(t).toFixed(4), seat: rimH, kind: 'bench', group: 1000 + g });
  }
  for (let b = -21.6; b <= 21.6; b += 0.9) {
    if (Math.abs(b) < BAY_HALF + 0.8) continue;
    const [x, z] = wld(PLAN.lakeA + 0.1, b);
    list.push({ x: +x.toFixed(3), y: +L.low.toFixed(3), z: +z.toFixed(3), yaw: +yawAB(Math.PI).toFixed(4), seat: 0.54, kind: 'bench', group: 2000 + Math.floor((b + 30) / 2.7) });
  }
  _seats = { ready: cpReliefReady(), list };
  return list;
}
