// AR32 part (city/areas.js): Hunters Point, Queens: the Pepsi-Cola sign, the gantries and Gantry Plaza State Park. Hooks,
// all optional (the contracts are in city/centralPark.js): apply(tile, ox, oz), skipBuilding(cx, cz, h, area),
// dropFurniture(wx, wz, f), furniture(), build(group, ctx), promenades(), seats(). Sub-flag `?ar32s=0`.
//   * the Pepsi-Cola sign (1936, relocated into the park in 2009, an NYC landmark since 2016): its black steel grid on four
//     column lines, the catwalk, the red script letters with their cream edge and neon (lit from dusk), the bottle and
//     the trade-mark plate (hptSignKit.js buildSign; measured facts in hptSignData.js);
//   * the two restored LIRR float-bridge gantries, "LONG" and "ISLAND", their lattice towers, top boxes, the operator's
//     house between them, the aprons with their rails and railings over the river (buildGantries);
//   * the park's benches at their OpenStreetMap places, with seats for the seated people, and a walk along the sign.
import * as THREE from 'three';
import { SIGN, GANTRY, GANTRY_S, GANTRY_FOOTPRINTS, BENCHES, PIER, PIER_WALKS, LAWNS } from './hptSignData.js';
import { buildSign, buildGantries, buildBenches, buildPier } from './hptSignKit.js';
import { buildSignAr33 } from './hptSignBuild.js';
import { buildGantriesAr33, buildSouthGantries, gantryReady } from './hptSignGantryBuild.js';
import { buildPierEdges, buildLamps, buildBenchesAr33, buildPierDeck } from './hptSignPark.js';
import { hpMatsReady } from './hptSignMats.js';
import { shoreApply, shoreDeckTris, buildShore, shorePromenades } from './hptSignShore.js';
import { SOUTH, S_LAWNS, southBedTris, southPathTris, southWalkTris, southWallBedTris, buildSouth } from './hptSignSouth.js';

// AR33: the page waits for the PBR library's module (its textures stream in after); `?hptOld=1` draws the AR32 sign
export const ready = Promise.all([hpMatsReady, gantryReady]);
const OLD = typeof location !== 'undefined' && new URLSearchParams(location.search).get('hptOld') === '1';
// AR34 b4: the seawalls and boardwalks where the compiled city has none (hptSignShore.js); `?hpsw=0` leaves the compiled shore
const SHORE = !OLD && !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('hpsw') === '0');
const SHORE_Y = 3.52;   // the boardwalks' level: the compiled sidewalks' datum (world/assemble.js: sidewalk 3.520, park path 3.540)

export const AR32S = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('ar32s') === '0');
const inTile = (ctx, x, z) => x >= ctx.ox && x < ctx.ox + 512 && z >= ctx.oz && z < ctx.oz + 512;
const [NX, NZ] = SIGN.N, [SX, SZ] = SIGN.S, SL = Math.hypot(SX - NX, SZ - NZ), UX = (SX - NX) / SL, UZ = (SZ - NZ) / SL;
// the sign's frame: u along it from the north end, w toward the river (the face normal (UZ, -UX)... = (-0.936, -0.352))
const WX = UZ, WZ = -UX;
const toSign = (x, z) => { const dx = x - NX, dz = z - NZ; return [dx * UX + dz * UZ, -(dx * WX + dz * WZ)]; };
const signAt = (u, w) => [NX + UX * u - WX * w, NZ + UZ * u - WZ * w];
// the ground under a point: the tile's own walk, lawn or plaza sections, else the carved terrain
function groundY(ctx, x, z) {
  let y = null;
  try { y = ctx.surfY ? ctx.surfY(x, z, ['path', 'sidewalk', 'plaza', 'brick', 'grass', 'grassU'], 2.5) : null; } catch (e) { y = null; }
  if (y === null || !isFinite(y)) { try { y = ctx.padYNear ? ctx.padYNear(x, z) : null; } catch (e) { y = null; } }
  if (y === null || !isFinite(y)) y = ctx.sampleT ? ctx.sampleT(x, z) : 3.5;
  return y;
}

// The piers' deck as the tile's own paving (sidewalk, the concrete flags), before anything samples the ground: the walkers,
// the furniture snap and the camera's ground then stand on it (the compiled terrain under the piers is the river bed,
// y -9). Its level is the tile's own walks' (the median height of its path and sidewalk triangles); each triangle of the
// outline's triangulation goes to the tile holding its centroid, wound to face up.
// The park's lawns and planted beds (OSM, hptSignData.js LAWNS) likewise, as the tile's grass (the beds as grassU) 5 cm
// under its walks (the compiled lawns lie 3 cm under: 3.51 and 3.54 on the city's datum; 5 cm keeps a lawn that laps
// onto a 3.52 sidewalk under it).
let _pierTris = null, _lawnTris = null, _deckY = null, _walkY = null;
const tris = (poly) => THREE.ShapeUtils.triangulateShape(poly.map(([x, z]) => new THREE.Vector2(x, z)), []).map(([a, b, c]) => [poly[a], poly[b], poly[c]]);
function pierTris() { return _pierTris || (_pierTris = tris(PIER)); }
function lawnTris() {
  if (_lawnTris) return _lawnTris;
  _lawnTris = { grass: [], grassU: [] };
  for (const [, kind, poly] of (SOUTH ? LAWNS.concat(S_LAWNS) : LAWNS)) { try { _lawnTris[kind === 'bed' ? 'grassU' : 'grass'].push(...tris(poly)); } catch (e) { /* a degenerate outline is skipped */ } }   // AR34 b5: + the south lawns (hptSignSouth.js)
  return _lawnTris;
}
// append triangles (world [x, z] corners) lying in the tile (by centroid) to its section `name` at height y, wound up
function lay(tile, ox, oz, name, T, y) {
  const add = [];
  for (const [A, B0, C0] of T) {
    const cx = (A[0] + B0[0] + C0[0]) / 3, cz = (A[1] + B0[1] + C0[1]) / 3;
    if (cx < ox || cx >= ox + 512 || cz < oz || cz >= oz + 512) continue;
    const ny = (B0[1] - A[1]) * (C0[0] - A[0]) - (B0[0] - A[0]) * (C0[1] - A[1]);
    const [B, C] = ny >= 0 ? [B0, C0] : [C0, B0];
    add.push(A[0] - ox, y, A[1] - oz, B[0] - ox, y, B[1] - oz, C[0] - ox, y, C[1] - oz);
  }
  if (!add.length) return false;
  const old = tile.S[name];
  tile.S[name] = old && old.length ? Float32Array.from([...old, ...add]) : Float32Array.from(add);
  return true;
}
export function apply(tile, ox, oz) {
  if (!AR32S || ox > 1210 || ox + 512 < 971 || oz > 4330 || oz + 512 < 3900) return;
  const ys = [];
  for (const k of ['path', 'sidewalk']) { const a = tile.S[k]; if (a) for (let i = 1; i < a.length && ys.length < 6000; i += 9) ys.push(a[i]); }
  // a tile of open river with the piers' west end (1_8) has no walks of its own: the level another tile of the park gave,
  // else the city's datum for walks (3.54)
  ys.sort((p, q) => p - q);
  const y = ys.length ? ys[ys.length >> 1] : (_walkY ?? 3.54);
  if (ys.length) _walkY = y;
  if (lay(tile, ox, oz, 'sidewalk', pierTris(), y)) _deckY = y;
  if (SHORE) {
    try {
      const r = shoreApply(tile, ox, oz);
      if (r) { const laid = lay(tile, ox, oz, 'sidewalk', shoreDeckTris(), SHORE_Y); console.log(`[ar34h] shore tile ${ox / 512}_${oz / 512}: ${JSON.stringify(r)}, deck ${laid ? 'laid' : 'none'}`); }
    } catch (e) { console.warn('[ar34h] shore apply', e); }
  }
  const L = lawnTris();
  lay(tile, ox, oz, 'grass', L.grass, y - 0.05);
  lay(tile, ox, oz, 'grassU', L.grassU, y - 0.05);
  // AR34 b5: the park south of the slip (hptSignSouth.js): planted beds on the bare land, 2 cm under the lawns; the paths at the park paths' level
  if (SOUTH) {
    try {
      const nb = lay(tile, ox, oz, 'grassU', southBedTris(tile, ox, oz), y - 0.07);
      lay(tile, ox, oz, 'grassU', southWallBedTris(), y - 0.07);
      lay(tile, ox, oz, 'sidewalk', southWalkTris(), y);
      const np = lay(tile, ox, oz, 'path', southPathTris(), y + 0.02);
      if (nb || np) console.log(`[ar34h] south ground tile ${ox / 512}_${oz / 512}: beds ${nb ? 'laid' : 'none'}, paths ${np ? 'laid' : 'none'}`);
    } catch (e) { console.warn('[ar34h] south ground', e); }
  }
}

// AR34: the compiled city drew the gantries' OSM footprints (LONG ISLAND, tile 2_8 building 97; the south pair, 1_8 building 2) as
// 16-17 m stone blocks round the steel; the steel is built here, so those two footprints are left out
export function skipBuilding(cx, cz, h, area) {
  if (!AR32S || OLD) return false;
  for (const [x, z, a] of GANTRY_FOOTPRINTS) if (Math.abs(cx - x) < 2.5 && Math.abs(cz - z) < 2.5 && area > a * 0.6 && area < a * 1.6) return true;
  return false;
}

// compiled furniture (the scattered trees, lamps) standing in the sign's grid or on the gantries' footprints is dropped
export function dropFurniture(wx, wz) {
  if (!AR32S) return false;
  const [u, w] = toSign(wx, wz);
  if (u > -2 && u < SL + 1.5 && w > -SIGN.DEPTH - 2.5 && w < SIGN.LETTER_W + 2.5) return true;
  for (const G of [GANTRY.LONG, GANTRY.ISLAND]) {
    const dx = wx - G.C[0], dz = wz - G.C[1], t = dx * GANTRY.T[0] + dz * GANTRY.T[1], a = -dx * GANTRY.T[1] + dz * GANTRY.T[0];
    if (Math.abs(a) < G.W / 2 + 1 && t > -GANTRY.APRON - 3 && t < 4) return true;
  }
  return false;
}

// benches: each faces away from its row's line toward the river side (the row from the nearest bench), 2 seats each
let _benches = null;
function benchList() {
  if (_benches) return _benches;
  _benches = BENCHES.map(([x, z], i) => {
    let best = null, bd = 1e9;
    BENCHES.forEach(([x2, z2], j) => { if (j !== i) { const d = (x2 - x) ** 2 + (z2 - z) ** 2; if (d < bd) { bd = d; best = [x2, z2]; } } });
    let ax = 1, az = 0;
    if (best && bd < 100) { const L = Math.hypot(best[0] - x, best[1] - z); ax = (best[0] - x) / L; az = (best[1] - z) / L; }
    let fx = az, fz = -ax;
    if (fx * -0.94 + fz * -0.35 < 0) { fx = -fx; fz = -fz; }   // toward the river (WNW)
    return { x, z, yaw: Math.atan2(fx, fz), y: null };
  });
  return _benches;
}
let _seatsN = 0, _pierY = null, _chairs = [];
export function build(group, ctx) {
  if (!AR32S) return;
  const t0 = performance.now();
  const MX = (NX + SX) / 2, MZ = (NZ + SZ) / 2;
  if (inTile(ctx, MX, MZ)) {
    try {
      // the sign's ground: the lowest of the ground under its column lines (the caps sit on it)
      let y0 = 1e9;
      for (const u of SIGN.COLS) for (const w of [-0.45, -SIGN.DEPTH + 0.4]) { const [x, z] = signAt(u, w); y0 = Math.min(y0, groundY(ctx, x, z)); }
      if (!isFinite(y0) || y0 > 100) y0 = groundY(ctx, MX, MZ);
      let done = false;
      if (!OLD) {
        try { const r = buildSignAr33(group, y0); done = true; console.log('[ar33h] sign', JSON.stringify(r.stats)); } catch (e) { console.warn('[ar33h] sign unavailable, using the AR32 sign', e); }
      }
      if (!done) buildSign(group, y0);
    } catch (e) { console.warn('[ar32] hptSign sign', e); }
  }
  if (inTile(ctx, GANTRY.LONG.C[0], GANTRY.LONG.C[1])) {
    // the piers first (their deck at the park's level behind the bulkhead), then the gantries standing on them
    try {
      _pierY = _deckY ?? groundY(ctx, 1066.0, 4252.0);
      let pdone = false;
      if (!OLD) {
        try {
          const r1 = buildPierEdges(group, _pierY), r2 = buildLamps(group, _pierY, PIER_WALKS, []);
          try { const r3 = buildPierDeck(group, _pierY); console.log('[ar33h] pier deck', JSON.stringify(r3)); } catch (e) { console.warn('[ar33h] pier deck', e); }
          pdone = true; console.log('[ar33h] pier edges', JSON.stringify(r1), 'lamps', JSON.stringify(r2));
        } catch (e) { console.warn('[ar33h] pier edges unavailable, using the AR32 piers', e); }
      }
      const ch = buildPier(group, _pierY, PIER_WALKS, _deckY === null, pdone);
      _chairs = ch.map((c) => ({ ...c, y: _pierY }));
    } catch (e) { console.warn('[ar32] hptSign piers', e); }
    let gdone = false;
    if (!OLD) {
      try { const r = buildGantriesAr33(group); gdone = true; console.log('[ar33h] gantries', JSON.stringify(r)); } catch (e) { console.warn('[ar33h] gantries unavailable, using the AR32 gantries', e); }
    }
    if (!gdone) { try { buildGantries(group); } catch (e) { console.warn('[ar32] hptSign gantries', e); } }
  }
  if (!OLD && inTile(ctx, GANTRY_S.F.C[0], GANTRY_S.F.C[1])) {
    try { const r = buildSouthGantries(group); console.log('[ar33h] south gantry', JSON.stringify(r)); } catch (e) { console.warn('[ar33h] south gantry', e); }
  }
  if (SOUTH) {
    try { const n = buildSouth(group, ctx, _walkY ?? 3.54); if (n) console.log(`[ar34h] south lamps tile ${ctx.key}: ${n} triangles`); } catch (e) { console.warn('[ar34h] south lamps', e); }
  }
  if (SHORE) {
    try { const n = buildShore(group, ctx, SHORE_Y); if (n) console.log(`[ar34h] shore build tile ${ctx.key}: ${n} triangles`); } catch (e) { console.warn('[ar34h] shore build', e); }
  }
  try {
    const list = [];
    for (const b of benchList()) if (inTile(ctx, b.x, b.z)) { b.y = groundY(ctx, b.x, b.z); list.push([b.x, b.y, b.z, b.yaw]); }
    if (list.length) {
      let bdone = false;
      if (!OLD) { try { buildBenchesAr33(group, list); bdone = true; } catch (e) { console.warn('[ar33h] benches unavailable, using the AR32 benches', e); } }
      if (!bdone) buildBenches(group, list);
    }
  } catch (e) { console.warn('[ar32] hptSign benches', e); }
  const dt = performance.now() - t0;
  if (dt > 1) console.log(`[ar32] hptSign tile ${ctx.key}: ${dt.toFixed(1)} ms`);
}

// seats on the benches whose ground is known (the list grows as their tiles are built; sim/peds.js rebuilds on growth)
export function seats() {
  if (!AR32S) return [];
  const out = [];
  benchList().forEach((b, i) => {
    if (b.y === null) return;
    const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw), ax = fz, az = -fx;
    for (const d of [-0.45, 0.45]) out.push({ x: b.x + ax * d + fx * 0.05, y: b.y, z: b.z + az * d + fz * 0.05, yaw: b.yaw, seat: 0.46, kind: 'bench', group: 9600 + i });
  });
  _chairs.forEach((c, i) => out.push({ x: c.x, y: c.y, z: c.z, yaw: c.yaw, seat: 0.4, kind: 'bench', group: 9700 + i }));
  _seatsN = out.length;
  return out;
}
// a walk along the sign's front, between the lawn and the grid (the photographs: people pass under the letters)
export function promenades() {
  if (!AR32S) return [];
  const pts = [];
  for (let u = -4; u <= SL + 4; u += 6) { const [x, z] = signAt(u, 5.5); pts.push([x, 3.5, z]); }
  const out = [{ pts, busy: 2.5 }];   // AR34 b5: 2.5 (was 4): with the boardwalks quieter the walk under the letters drew a single-file
  // line of ~50 (b5_e/hptSignSWW_day.jpg) where the SWW photograph shows ~30 people spread over the walk and the lawn
  // the piers' walks (OSM footways 696508280, 696508281) and the gantry platform, on the deck apply() lays
  for (const [x0, z0, x1, z1] of PIER_WALKS) out.push({ pts: [[x0, 3.5, z0], [(x0 + x1) / 2, 3.5, (z0 + z1) / 2], [x1, 3.5, z1]], busy: 3 });
  if (SHORE) { try { out.push(...shorePromenades(SHORE_Y)); } catch (e) { /* none */ } }
  return out;
}
