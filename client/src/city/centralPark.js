// CP32 — Central Park as it is laid out (owner 2026-09-30: "recreate Central Park and the central fountain area ... I need
// accurate and high quality"). The compiled city had the park as the NYC Parks polygon: one lawn over the 3DEP ground, the
// OSM paths and drives on it, and park trees scattered at random (compile.mjs, one per 260 m2) over the lawns and the lakes
// alike. The park is rebuilt here from maps, aerial imagery and measured references, in four parts, each its own module
// with its own notes (docs/notes/central-park.md):
//   * cpLand.js: the water bodies (the Lake, the Reservoir, Turtle Pond, the Pond, Harlem Meer, Conservatory Water, the
//     Pool) cut out of the lawn and drawn at their surveyed levels, the ground cover (woodland floor, meadows, ballfields),
//     the schist outcrops, the perimeter wall;
//   * cpFlora.js: the trees where the canopy is (orthoimagery), by species and size, the Mall's four rows of elms, the
//     park's lamps, benches and litter baskets along its paths;
//   * cpBethesda.js: Bethesda Terrace and the Angel of the Waters, the Arcade, the stairs and balustrades, the lake front;
//   * cpLandmarks.js: Bow Bridge, Belvedere Castle, the Loeb Boathouse, Gapstow Bridge, Cleopatra's Needle and the others.
// This module only gathers them for world/assemble.js and sim/peds.js. Every hook is optional in a part, and a part that
// throws is logged and skipped, never taking the tile down with it. `?cp32=0` restores the compiled park.
import * as land from './cpLand.js';
import * as flora from './cpFlora.js';
import * as bethesda from './cpBethesda.js';
import * as landmarks from './cpLandmarks.js';
import { cpRelief, cpReliefReady, CP_RELIEF_BOX, cpBridgeRelief } from './cpRelief.js';

export const CP32 = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('cp32') === '0');
// the order matters for apply(): the water is cut out of the lawn first, then the terrace and the landmarks re-kind what
// is left under them
const PARTS = [['land', land], ['flora', flora], ['bethesda', bethesda], ['landmarks', landmarks]];
const warn = (part, hook, e) => console.warn(`[cp32] ${part}.${hook}`, e);

// The park's extent (world x, z; the NYC Parks polygon's box with 60 m of margin): a tile outside it is not asked
const BOX = { x0: -960, x1: 1900, z0: -2000, z1: 2150 };
export const cpTileHit = (ox, oz) => CP32 && ox < BOX.x1 && ox + 512 > BOX.x0 && oz < BOX.z1 && oz + 512 > BOX.z0;
const inBox = (x, z) => x > BOX.x0 && x < BOX.x1 && z > BOX.z0 && z < BOX.z1;

// Before anything samples or draws the tile's ground (right after BP28's walks): re-kind, clip or re-height the tile's
// sections (tile.S.grass / path / asphalt ... as flat xyz triangle lists, tile-local x/z, world y) and terrain grid
// (tile.S.terrain, (res+1)^2 heights over the 512 m tile). See bryantPark.js bpApply for the pattern. The relief goes
// first (cpRelief.js), so every part's apply() sees the park's real ground.
export function cpApply(tile, ox, oz) {
  if (!cpTileHit(ox, oz)) return;
  try { reliefApply(tile, ox, oz); } catch (e) { warn('relief', 'apply', e); }
  try { mallApply(tile, ox, oz); } catch (e) { warn('mall', 'apply', e); }
  for (const [n, P] of PARTS) { if (P.apply) try { P.apply(tile, ox, oz); } catch (e) { warn(n, 'apply', e); } }
}

// The relief (cpRelief.js) laid onto the flat compile: every ground section's triangle that the park's relief reaches is
// cut along the relief grid's own lines and cell diagonals (14 m cells, the relief linear on each half cell) and each
// piece fanned back into triangles, each vertex raised by the relief under it: every piece lies flat on its patch, so
// sections that meet along a line still meet after the lift; the terrain grid and the road lines likewise, so the
// camera's ground (streamer.terrainAt), the walkers (surfaceAt), the furniture's ground snap and the buildings'
// foundations all see the same ground. (Splitting the longest edge instead cut the lawn's 64 x 2 m needles into ~80
// pieces each: 3,793 -> 308,958 lawn triangles in one tile.) Vertical faces (the curbs) are halved along their length
// down to 7 m. A triangle the relief does not reach (the city round the park, the transverse roads, which stay on the
// city's datum) is left as it is.
const GROUND = ['asphalt', 'sidewalk', 'curb', 'paintW', 'paintY', 'grass', 'path', 'paintG', 'brick', 'gutter', 'busred', 'warn', 'warnIron', 'grassU', 'plaza', 'gravel'];
export const cpLift = (x, z) => (CP32 ? cpRelief(x, z) : 0);   // world/assemble.js: a compiled building's base in the park
// a convex polygon [[x, y, z]...] cut by the plane (axis ax) = c into its low and high sides
function cut(poly, ax, c) {
  const lo = [], hi = [];
  for (let k = 0; k < poly.length; k++) {
    const P = poly[k], Q = poly[(k + 1) % poly.length], p = P[ax] - c, q = Q[ax] - c;
    if (p <= 0) lo.push(P);
    if (p >= 0) hi.push(P);
    if ((p < 0 && q > 0) || (p > 0 && q < 0)) {
      const t = p / (p - q), I = [P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t, P[2] + (Q[2] - P[2]) * t];
      lo.push(I); hi.push(I);
    }
  }
  return [lo, hi];
}
// the same by the plane x - z = c (the cells' diagonals)
function cutD(poly, c) {
  const lo = [], hi = [];
  for (let k = 0; k < poly.length; k++) {
    const P = poly[k], Q = poly[(k + 1) % poly.length], p = P[0] - P[2] - c, q = Q[0] - Q[2] - c;
    if (p <= 0) lo.push(P);
    if (p >= 0) hi.push(P);
    if ((p < 0 && q > 0) || (p > 0 && q < 0)) {
      const t = p / (p - q), I = [P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t, P[2] + (Q[2] - P[2]) * t];
      lo.push(I); hi.push(I);
    }
  }
  return [lo, hi];
}
// the polygon cut into strips along one axis at the grid's lines (origin g0, step st, tile-local offset o)
function strips(poly, ax, g0, st, o) {
  let lo = 1e9, hi = -1e9;
  for (const P of poly) { lo = Math.min(lo, P[ax]); hi = Math.max(hi, P[ax]); }
  const out = [];
  let rest = poly;
  for (let k = Math.floor((lo + o - g0) / st) + 1; g0 + k * st - o < hi; k++) {
    const [a, b] = cut(rest, ax, g0 + k * st - o);
    if (a.length >= 3) out.push(a);
    rest = b;
    if (rest.length < 3) return out;
  }
  if (rest.length >= 3) out.push(rest);
  return out;
}
function reliefApply(tile, ox, oz) {
  if (!cpReliefReady()) return;
  const [bx0, bz0, bx1, bz1] = CP_RELIEF_BOX;
  if (ox > bx1 || ox + 512 < bx0 || oz > bz1 || oz + 512 < bz0) return;
  const R0 = (x, z) => cpRelief(x + ox, z + oz);
  // the hard sections on a bridge keep to its deck (cpRelief.js cpBridgeRelief); the lawn and the terrain stay on the ground
  const RB = (x, z) => { const r = cpRelief(x + ox, z + oz), b = cpBridgeRelief(x + ox, z + oz); return b !== null && b > r ? b : r; };
  let R = R0;
  const G0x = bx0, G0z = bz0, ST = 14, EPS = 0.004;
  let tin = 0, tout = 0;
  const emit = (out, A, B, C) => {
    out.push(A[0], A[1] + R(A[0], A[2]), A[2], B[0], B[1] + R(B[0], B[2]), B[2], C[0], C[1] + R(C[0], C[2]), C[2]);
    tout++;
  };
  for (const name of GROUND) {
    const a = tile.S[name];
    if (!a || a.length < 9) continue;
    const out = [];
    let changed = false;
    // the lawn: its pieces gathered by cell, and a cell the lawn fills from edge to edge (the paths are drawn over it,
    // not cut out of it) laid again as its two halves. The compiled lawn is 64 x 2 m needles, and cut by the grid they
    // came back as ~100k triangles a tile.
    const lawn = name === 'grass' || name === 'grassU', cells = lawn ? new Map() : null;
    R = lawn ? R0 : RB;
    let wind = 0;
    for (let i = 0; i + 8 < a.length; i += 9) {
      tin++;
      const A = [a[i], a[i + 1], a[i + 2]], B = [a[i + 3], a[i + 4], a[i + 5]], C = [a[i + 6], a[i + 7], a[i + 8]];
      // does the relief reach it? its corners, middle and edge midpoints
      if (Math.abs(R(A[0], A[2])) < EPS && Math.abs(R(B[0], B[2])) < EPS && Math.abs(R(C[0], C[2])) < EPS
        && Math.abs(R((A[0] + B[0] + C[0]) / 3, (A[2] + B[2] + C[2]) / 3)) < EPS && Math.abs(R((A[0] + B[0]) / 2, (A[2] + B[2]) / 2)) < EPS
        && Math.abs(R((B[0] + C[0]) / 2, (B[2] + C[2]) / 2)) < EPS && Math.abs(R((C[0] + A[0]) / 2, (C[2] + A[2]) / 2)) < EPS) {
        for (let k = 0; k < 9; k++) out.push(a[i + k]);
        tout++;
        continue;
      }
      changed = true;
      const area2 = Math.abs((B[0] - A[0]) * (C[2] - A[2]) - (C[0] - A[0]) * (B[2] - A[2]));
      if (area2 < 1e-3) {
        // a vertical face: halve its longest edge down to 7 m
        const stack = [[A, B, C]];
        while (stack.length) {
          const [P, Q, S] = stack.pop();
          const d = (U, V) => (U[0] - V[0]) ** 2 + (U[2] - V[2]) ** 2, m01 = d(P, Q), m12 = d(Q, S), m20 = d(S, P), m = Math.max(m01, m12, m20);
          if (m <= 49) { emit(out, P, Q, S); continue; }
          const mid = (U, V) => [(U[0] + V[0]) / 2, (U[1] + V[1]) / 2, (U[2] + V[2]) / 2];
          if (m === m01) { const M = mid(P, Q); stack.push([P, M, S], [M, Q, S]); }
          else if (m === m12) { const M = mid(Q, S); stack.push([P, Q, M], [P, M, S]); }
          else { const M = mid(S, P); stack.push([P, Q, M], [M, Q, S]); }
        }
        continue;
      }
      for (const col of strips([A, B, C], 0, G0x, ST, ox)) {
        for (const cell of strips(col, 2, G0z, ST, oz)) {
          // the cell's diagonal: x - z = (x0 + i st) - (z0 + j st) in world terms, i, j the cell this piece is in
          let cx = 0, cz = 0;
          for (const P of cell) { cx += P[0]; cz += P[2]; }
          const ci = Math.floor((cx / cell.length + ox - G0x) / ST), cj = Math.floor((cz / cell.length + oz - G0z) / ST);
          // a cell whose two halves are all but coplanar (its twist under 3 cm) is not cut: a straight edge across it
          // leaves the surface by at most half the twist
          const X0 = G0x + ci * ST - ox, Z0 = G0z + cj * ST - oz;
          const tw = R(X0, Z0) + R(X0 + ST, Z0 + ST) - R(X0 + ST, Z0) - R(X0, Z0 + ST);
          for (const half of (Math.abs(tw) < 0.03 ? [cell] : cutD(cell, G0x - G0z + (ci - cj) * ST - (ox - oz)))) {
            if (half.length < 3) continue;
            for (let k = 1; k + 1 < half.length; k++) {
              const P = half[0], Q = half[k], S = half[k + 1];
              const cr = (Q[0] - P[0]) * (S[2] - P[2]) - (S[0] - P[0]) * (Q[2] - P[2]);
              if (Math.abs(cr) < 1e-7) continue;
              if (lawn) {
                const key = ci * 65536 + cj;
                let c = cells.get(key);
                if (!c) cells.set(key, (c = { ci, cj, area: 0, y: 0, n: 0, tris: [] }));
                c.area += Math.abs(cr) / 2; c.y += P[1] + Q[1] + S[1]; c.n += 3; c.tris.push(P, Q, S);
                if (!wind) wind = Math.sign(cr);
              } else emit(out, P, Q, S);
            }
          }
        }
      }
    }
    if (lawn) for (const c of cells.values()) {
      if (Math.abs(c.area - ST * ST) < 0.5) {
        const X0 = G0x + c.ci * ST - ox, Z0 = G0z + c.cj * ST - oz, y = c.y / c.n;
        const p00 = [X0, y, Z0], p10 = [X0 + ST, y, Z0], p11 = [X0 + ST, y, Z0 + ST], p01 = [X0, y, Z0 + ST];
        // the halves along the cell's diagonal, wound as the lawn is ((p10 - p00) x (p11 - p00) has the sign +1)
        if (wind > 0) { emit(out, p00, p10, p11); emit(out, p00, p11, p01); } else { emit(out, p00, p11, p10); emit(out, p00, p01, p11); }
      } else for (let k = 0; k < c.tris.length; k += 3) emit(out, c.tris[k], c.tris[k + 1], c.tris[k + 2]);
    }
    if (changed) tile.S[name] = Float32Array.from(out);
  }
  // the terrain grid (the camera's ground, the foundations) and the road lines (walk edges, the drives), as copies: the
  // parsed sections are views into the tile's buffer, which a re-assembly would otherwise raise twice
  const res = tile.header.res, n = res + 1;
  if (tile.S.terrain) {
    const g = (tile.S.terrain = Float32Array.from(tile.S.terrain));
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) g[j * n + i] += R0((i / res) * 512, (j / res) * 512);
  }
  if (tile.S.roadVerts) {
    const rv = (tile.S.roadVerts = Float32Array.from(tile.S.roadVerts));
    for (let k = 0; k + 2 < rv.length; k += 3) rv[k + 1] += RB(rv[k], rv[k + 2]);
  }
  if (tout !== tin) console.log(`[cp32] relief ${ox / 512}_${oz / 512}: ${tin} -> ${tout} ground triangles`);
}

// A compiled building footprint a part builds itself (or that is not a building): (cx, cz) its centroid, h its height
// (CP33 LANDSCAPE, teaser 4 v2 review: "two four-storey red-brick apartment houses inside the park behind Bow Bridge's
// west end"): the park's small structures that no part builds came through the compiler with no height or style, so it
// drew them as 12 m tenements (punched windows, fire escapes, quoins). A footprint inside the park at that default
// height and under 300 m2 is dropped, and so are the other unclaimed tenement-styled ones of the probe (tools/
// probe_buildings.mjs over the park's tiles, 2026-09-30: comfort stations, kiosks, shelters); the Met, the zoo, the
// rinks and the other civic-stone buildings stay.
const CP_UNCLAIMED = [[791.1, -652.5], [21.0, 690.3], [-203.5, 796.0], [-223.2, 827.4], [-444.2, 1798.4], [1257.0, -1731.3],
  [535.8, -36.9], [-122.9, 1660.7], [-147.1, 603.3]];   // (the last: a 28 m2 one-storey "tenement" in the Ramble, 07:55)
export function cpSkipBuilding(cx, cz, h, area) {
  if (!CP32 || !inBox(cx, cz)) return false;
  for (const [n, P] of PARTS) { if (P.skipBuilding) try { if (P.skipBuilding(cx, cz, h, area)) return true; } catch (e) { warn(n, 'skipBuilding', e); } }
  if (CP_UNCLAIMED.some(([x, z]) => Math.abs(cx - x) < 3 && Math.abs(cz - z) < 3)) return true;
  try { if (Math.abs(h - 12) < 0.05 && area < 300 && flora.cpInPark && flora.cpInPark(cx, cz)) return true; } catch (e) { warn('flora', 'cpInPark', e); }
  return false;
}

// A compiled furniture record to drop (f: {k, x, y, z, rot, p0, p1, p2}, tile-local; wx, wz its world position): the
// compiler's scattered park trees (f.k === FURN.TREE), a lamp in a lake ...
export function cpDropFurniture(wx, wz, f) {
  if (!CP32 || !inBox(wx, wz)) return false;
  for (const [n, P] of PARTS) { if (P.dropFurniture) try { if (P.dropFurniture(wx, wz, f)) return true; } catch (e) { warn(n, 'dropFurniture', e); } }
  return false;
}

// The parts' own furniture records for the tile at (ox, oz), in the compiler's format: a part's furniture() returns WORLD
// records { k (FURN kind), x, z, y? (world; left out = the ground under it), rot, p0, p1, p2 } for the whole park (cache
// it: this runs per tile), and the ones in this tile come back tile-local, y filled by the caller from the ground
export function cpFurniture(ox, oz) {
  if (!cpTileHit(ox, oz)) return [];
  const out = [];
  for (const [n, P] of PARTS) {
    if (!P.furniture) continue;
    let recs;
    try { recs = P.furniture() || []; } catch (e) { warn(n, 'furniture', e); continue; }
    for (const r of recs) {
      if (r.x < ox || r.x >= ox + 512 || r.z < oz || r.z >= oz + 512) continue;
      out.push({ k: r.k, x: r.x - ox, y: r.y ?? null, z: r.z - oz, rot: r.rot || 0, p0: r.p0 || 0, p1: r.p1 || 0, p2: r.p2 || 0, cp: true });
    }
  }
  return out;
}

// Meshes for the tile at (ox, oz), added to its group (disposed with it). ctx: { ox, oz, key, tile, sampleT(x, z) (the
// carved terrain), sectionY(name, x, z, tol), surfY(x, z, kinds, tol), padYNear(x, z) } — world x, z throughout. A part
// builds what lies in this tile, or a whole structure from the one tile that owns its anchor point (build it once).
export function cpBuild(group, ctx) {
  if (!cpTileHit(ctx.ox, ctx.oz)) return;
  for (const [n, P] of PARTS) { if (P.build) try { P.build(group, ctx); } catch (e) { warn(n, 'build', e); } }
}

// The Mall: CSCL carries it as a roadway (THE MALL), so the compiled city laid it as a 20 m carriageway with a double
// yellow line, gutters and 14 cm kerbs between the elms (lead t4Mall probe). The Mall is one paved promenade: inside its
// strip (the Literary Walk's south end to the terrace, 10.5 m either side of the axis at bearing 16.8 deg) the yellow
// line and the kerb faces go, and the carriageway and gutters are raised 0.14 m, flush with the walks either side, into
// the park path kind. sim/traffic.js keeps cars off it (cpDrive).
const MALL_O = [-110, 1455], MALL_U = [0.2756, -0.9613], MALL_R = [0.9613, 0.2756];
function mallApply(tile, ox, oz) {
  if (ox > 60 || ox + 512 < -140 || oz > 1470 || oz + 512 < 1030) return;
  const inMall = (x, z) => {
    const dx = x + ox - MALL_O[0], dz = z + oz - MALL_O[1];
    const s = dx * MALL_U[0] + dz * MALL_U[1], off = dx * MALL_R[0] + dz * MALL_R[1];
    return s > -10 && s < 432 && Math.abs(off) < 10.5;
  };
  const cen = (a, i) => [(a[i] + a[i + 3] + a[i + 6]) / 3, (a[i + 2] + a[i + 5] + a[i + 8]) / 3];
  const moved = [];
  let n = 0;
  for (const name of ['paintY', 'curb', 'asphalt', 'gutter']) {
    const a = tile.S[name];
    if (!a || a.length < 9) continue;
    const keep = [];
    for (let i = 0; i + 8 < a.length; i += 9) {
      const [cx, cz] = cen(a, i);
      if (!inMall(cx, cz)) { for (let k = 0; k < 9; k++) keep.push(a[i + k]); continue; }
      n++;
      if (name === 'asphalt' || name === 'gutter') for (let k = 0; k < 9; k++) moved.push(a[i + k] + (k % 3 === 1 ? 0.14 : 0));
    }
    if (keep.length !== a.length) tile.S[name] = Float32Array.from(keep);
  }
  if (moved.length) tile.S.path = tile.S.path && tile.S.path.length ? Float32Array.from([...tile.S.path, ...moved]) : Float32Array.from(moved);
  if (n) console.log(`[cp32] the Mall ${ox / 512}_${oz / 512}: ${n} street triangles laid as the promenade`);
}

// Over one of the park's water bodies, pad m inside its shore (cpLand.js): sim/peds.js cuts the park's footpaths there
// (they cross the Lake on Bow Bridge and Oak Bridge and the Pond on Gapstow; the ground under them is now the lake bed,
// and each bridge carries its own walker line over its deck)
export const cpWater = (x, z, pad = 0) => (CP32 && land.cpOnWater ? land.cpOnWater(x, z, pad) : false);
// Ground a part has raised or built over the compiled paths (Belvedere Castle's plateau on its own Vista Rock, 6.4 m over
// the 3DEP ground): the footpaths are cut there too (cpLandmarks.js cpLmKeepOut)
export const cpKeepOut = (x, z) => (CP32 && landmarks.cpLmKeepOut ? landmarks.cpLmKeepOut(x, z) : false);

// Walker lines (sim/peds.js campus todo): [{ pts: [[x, y, z], ...] (world; y is re-sampled from the ground), busy }]
// across plazas and terraces that the path network does not cover (the Mall, Bethesda's lower terrace, the bridges)
export function cpPromenades() {
  if (!CP32) return [];
  const out = [];
  for (const [n, P] of PARTS) { if (P.promenades) try { out.push(...(P.promenades() || [])); } catch (e) { warn(n, 'promenades', e); } }
  return out;
}

// Seats for the seated people (sim/peds.js SW31): [{ x, y, z, yaw, seat (the seat's top above y), kind ('bench' ...),
// group }] — the same records as bryantPark.js bpSeats
export function cpSeats() {
  if (!CP32) return [];
  const out = [];
  for (const [n, P] of PARTS) { if (P.seats) try { out.push(...(P.seats() || [])); } catch (e) { warn(n, 'seats', e); } }
  return out;
}
