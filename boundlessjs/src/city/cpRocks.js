// CP33 — every schist outcrop and boulder in Central Park but Vista Rock (the castle part's, city/cpLandmarksKit.js);
// docs/notes/central-park-photoreal.md, "Rocks". The owner, 2026-09-30: "stones ... look really low poly". CP32's outcrops
// were one smooth hump per OSM polygon on a 0.5-1.2 m lattice and its boulders knobbed icosahedra (80 faces), both on a
// procedural colour shader; the reviewers saw "smooth, pale-grey blobs" from the air and "pale, faceted low-poly stones"
// at Gapstow.
//
// Outcrops (OSM natural=bare_rock, 113 here): each a dense displaced heightfield over its own outline, built at three
// levels of detail on the distance to the camera (near ~0.1 m within 35 m, mid 0.3 m to 140 m, far ~1-2 m), the near and
// mid levels built when the camera first comes in range. The shape is Manhattan schist scoured by the ice: the CP32
// whaleback (polished and gentle on the up-ice north-west, plucked steeper on the lee south-east), broken on the lee and
// the flanks into ledges of 0.3-0.6 m, ridged and grooved along its foliation (striking N30E, folded), cut by two sets of
// near-vertical joints (N60W across the grain and N30E along it, 3-5 m apart, opening and closing along their length)
// 7-21 cm wide and up to 28 cm deep, and lumpy at 0.3-1 m, smoother on the polished tops. Its vertices carry their cavity
// (the shader's moss, soil and AO), their height over the ground (the soil and litter at the foot) and the joints' mask.
// Shaded by cpRocksKit.js's schist (scanned PBR, triplanar). Grass tufts line the foot; small scanned blocks lie at it.
// Boulders: CP32's shore runs (the same spots), each now one of 16 photogrammetry scans (Poly Haven, CC0) at three LODs,
// instanced per tile, rotated, tilted and scaled, sunk 30-50 % into the bank and the water, the wet line at the water.
// cpLand.js keeps the API: cpRockTop(x, z) asks cpRocksTop() first (this geometry's surface), and its own build calls
// cpRocksBuild(); `?cpr33=0` restores CP32's rocks.
import * as THREE from 'three';
import { ROCKS } from './cpLandData.js';
import { COLLIDERS } from './colliders.js';
import { CPR33, rockMat, tuftMat, loadRockPieces, rockPieces } from './cpRocksKit.js';

export { CPR33 };
// Vista Rock (OSM way 387216152, under Belvedere Castle): the castle part's
const VISTA = new Set([387216152]);
let _failed = false;   // a tile's build threw: the CP32 outcrops and boulders (cpLand.js) take over from then on
export const cpRocksOwns = (id) => CPR33 && !_failed && !VISTA.has(id);
// cpLand.js's own ground and water (cpRocksInit, from its module body): { groundAt, levelOf, bodies, hardMask, hard,
// nearBridge, hash1, rockCut (ROCK_CUT with floor(x, z)), cpbank }
let L = null;
export function cpRocksInit(helpers) { L = helpers; }

// ---------------------------------------------------------------- noise (the same hash as cpLand's vnoise2)
const hh = (i, j) => { const t = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return t - Math.floor(t); };
function vn(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), u = x - xi, v = z - zi, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
  return (hh(xi, zi) * (1 - su) + hh(xi + 1, zi) * su) * (1 - sv) + (hh(xi, zi + 1) * (1 - su) + hh(xi + 1, zi + 1) * su) * sv;
}
const sst = (a, b, t) => { const u = Math.min(1, Math.max(0, (t - a) / (b - a))); return u * u * (3 - 2 * u); };

// ---------------------------------------------------------------- the outcrops
const unflat = (a) => { const r = []; for (let i = 0; i + 1 < a.length; i += 2) r.push([a[i], a[i + 1]]); return r; };
const RKS = ROCKS.filter((r) => !VISTA.has(r.id)).map((r) => {
  const outer = unflat(r.outer);
  let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9, cx = 0, cz = 0, A = 0, per = 0;
  for (let i = 0; i < outer.length; i++) {
    const p = outer[i], q = outer[(i + 1) % outer.length];
    x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]);
    cx += p[0]; cz += p[1]; A += p[0] * q[1] - q[0] * p[1]; per += Math.hypot(q[0] - p[0], q[1] - p[1]);
  }
  const seed = (r.id % 1000) * 0.37;
  return { id: r.id, name: r.name || '', outer, holes: r.holes.map(unflat), box: [x0, z0, x1, z1], c: [cx / outer.length, cz / outer.length],
    A: Math.abs(A) / 2, per, seed, stepH: 0.32 + 0.3 * hh(seed, 1.7), grid: null, lv: [null, null, null], tufts: null };
});
function ringInsideDist(x, z, R, holes) {
  let d = 1e9, ins = false;
  for (const Rg of [R, ...holes]) {
    for (let i = 0, k = Rg.length - 1; i < Rg.length; k = i++) {
      const a = Rg[k], c = Rg[i], ex = c[0] - a[0], ez = c[1] - a[1], LL = ex * ex + ez * ez;
      let t = LL > 0 ? ((x - a[0]) * ex + (z - a[1]) * ez) / LL : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      d = Math.min(d, Math.hypot(x - a[0] - ex * t, z - a[1] - ez * t));
      if ((a[1] > z) !== (c[1] > z) && x < ((c[0] - a[0]) * (z - a[1])) / (c[1] - a[1]) + a[0]) ins = !ins;
    }
  }
  return ins ? d : -d;
}
// per rock a 0.5 m grid over its box (+1.5 m): the signed distance in from its edge, the ground under it (cpLand's: the
// relief's lawn with the bank offset), the floors of the parts standing on it, and the coarse surface's cavity
const GS = 0.5, GP = 1.5;
// the distance grid (the outline only: cached at once)
function distOf(r) {
  if (r.dg) return r.dg;
  const x0 = r.box[0] - GP, z0 = r.box[1] - GP, nx = Math.ceil((r.box[2] - r.box[0] + 2 * GP) / GS) + 1, nz = Math.ceil((r.box[3] - r.box[1] + 2 * GP) / GS) + 1;
  const D = new Float32Array(nx * nz);
  let R = 0.5;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const d = ringInsideDist(x0 + i * GS, z0 + j * GS, r.outer, r.holes);
    D[j * nx + i] = d; if (d > R) R = d;
  }
  r.R = R;
  r.H = Math.min(Math.min(4.0, Math.max(0.5, 0.8 * Math.pow(r.A / 100, 0.4))), R * 0.9 + 0.3);   // CP32's height rule
  return (r.dg = { x0, z0, nx, nz, D });
}
// ...and the ground's (the relief: cached only once the relief is in, cpLand's reliefReady)
function gridOf(r) {
  if (r.grid) return r.grid;
  const { x0, z0, nx, nz, D } = distOf(r);
  const G = new Float32Array(nx * nz), CAP = new Float32Array(nx * nz).fill(1e9), CAV = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i;
    G[k] = D[k] > -GP ? L.groundAt(x0 + i * GS, z0 + j * GS) : 0;
  }
  r.gy0 = L.groundAt(r.c[0], r.c[1]);
  // other parts' floors on the rock (the Blockhouse's crag, the Boathouse's corner, the Chess & Checkers House): the rock
  // stays 0.3 m under them inside their outline + pad
  for (const C of L.rockCut || []) {
    if (C.bb[0] > r.box[2] + 1 || C.bb[2] < r.box[0] - 1 || C.bb[1] > r.box[3] + 1 || C.bb[3] < r.box[1] - 1) continue;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = x0 + i * GS, z = z0 + j * GS;
      if (x < C.bb[0] || x > C.bb[2] || z < C.bb[1] || z > C.bb[3]) continue;
      if (ringInsideDist(x, z, C.poly, []) < -C.pad) continue;
      CAP[j * nx + i] = Math.min(CAP[j * nx + i], C.floor(x, z) - 0.3);
    }
  }
  const g = { x0, z0, nx, nz, D, G, CAP, CAV };
  if (!L.reliefReady || L.reliefReady()) r.grid = g;
  // the cavity of the mid surface: how far a point lies under the mean of its neighbours 1 m round (m, 0 .. ~0.15)
  const Y = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i; Y[k] = D[k] > 0 ? rockY(r, x0 + i * GS, z0 + j * GS, D[k], 1) : D[k] * 2.5; }
  for (let j = 2; j < nz - 2; j++) for (let i = 2; i < nx - 2; i++) {
    const k = j * nx + i;
    if (D[k] <= 0) continue;
    const m = (Y[k - 2] + Y[k + 2] + Y[k - 2 * nx] + Y[k + 2 * nx] + Y[k - nx - 1] + Y[k - nx + 1] + Y[k + nx - 1] + Y[k + nx + 1]) / 8;
    CAV[k] = Math.max(0, Math.min(1, (m - Y[k]) / 0.12));
  }
  return g;
}
// bilinear on the grid (the nearest for the floors)
function gAt(g, A, x, z, out) {
  const fx = (x - g.x0) / GS, fz = (z - g.z0) / GS;
  const i = Math.max(0, Math.min(g.nx - 2, Math.floor(fx))), j = Math.max(0, Math.min(g.nz - 2, Math.floor(fz)));
  const tx = Math.min(1, Math.max(0, fx - i)), tz = Math.min(1, Math.max(0, fz - j)), k = j * g.nx + i;
  return (A[k] * (1 - tx) + A[k + 1] * tx) * (1 - tz) + (A[k + g.nx] * (1 - tx) + A[k + g.nx + 1] * tx) * tz;
}
function capAt(g, x, z) {
  const i = Math.round((x - g.x0) / GS), j = Math.round((z - g.z0) / GS);
  if (i < 0 || j < 0 || i >= g.nx || j >= g.nz) return 1e9;
  return g.CAP[j * g.nx + i];
}
// Voronoi cells on a jittered unit grid (sites 0.12-0.88 into their cell): the distance from (px, pz) to the border of its
// cell (in cell units: the least distance to the bisector with each neighbouring site, so a triple junction has no spike),
// the cell's id, the point's offset from the cell's site, and a hash of the cell PAIR across the nearest border (the same
// from both sides)
const _c = { e: 1, e2: 1, ax: 0, az: 0, px: 0, pz: 0, pair: 0, pair2: 0 };
const _sx = new Float64Array(9), _sz = new Float64Array(9);
function cell2(px, pz) {
  const ix = Math.floor(px), iz = Math.floor(pz);
  let d1 = 1e9, k1 = 4;
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
    const cx = ix + i - 1, cz = iz + j - 1, k = j * 3 + i;
    const sx = cx + 0.12 + 0.76 * hh(cx * 1.37 + 0.3, cz * 1.91 + 7.1), sz = cz + 0.12 + 0.76 * hh(cx * 2.33 + 11.7, cz * 0.87 + 2.9);
    _sx[k] = sx; _sz[k] = sz;
    const dx = sx - px, dz = sz - pz, dd = dx * dx + dz * dz;
    if (dd < d1) { d1 = dd; k1 = k; }
  }
  const s1x = _sx[k1], s1z = _sz[k1];
  // the two nearest borders (so the joint's parameters can be blended where the nearest one changes: no spike at a junction)
  let e = 1e9, k2 = k1, f = 1e9, k3 = k1;
  for (let k = 0; k < 9; k++) {
    if (k === k1) continue;
    const mx = (_sx[k] + s1x) / 2, mz = (_sz[k] + s1z) / 2, nx = _sx[k] - s1x, nz = _sz[k] - s1z, nl = Math.hypot(nx, nz) || 1;
    const dist = ((mx - px) * nx + (mz - pz) * nz) / nl;   // along the normal from the point to the bisector (>= 0 inside the cell)
    if (dist < e) { f = e; k3 = k2; e = dist; k2 = k; }
    else if (dist < f) { f = dist; k3 = k; }
  }
  const a1 = ix + (k1 % 3) - 1, b1 = iz + Math.floor(k1 / 3) - 1;
  const pr = (k) => { const a2 = ix + (k % 3) - 1, b2 = iz + Math.floor(k / 3) - 1; return hh(Math.min(a1, a2) * 7.3 + Math.max(a1, a2) * 1.1, Math.min(b1, b2) * 5.9 + Math.max(b1, b2) * 3.1); };
  _c.e = Math.max(0, e); _c.e2 = Math.max(0, f);
  _c.ax = a1; _c.az = b1; _c.px = px - s1x; _c.pz = pz - s1z;
  _c.pair = pr(k2); _c.pair2 = pr(k3);
  return _c;
}
// The rock's surface over the ground at (x, z), d metres in from its edge, at detail level lv (0 near, 1 mid, 2 far:
// the coarser levels leave out what their lattice cannot carry). _J: the joints' mask at the last call.
const SE = [0.5, 0.866];   // the ice moved to the south-south-east; x east, z south
let _J = 0;
function rockY(r, x, z, d, lv) {
  _J = 0;
  if (d <= 0) return Math.max(d * 2.5, -0.5);   // the skirt, sunk under the ground past the edge (never more than 0.5 m: a long steep one showed as a dark bevel)
  const s = r.seed;
  const ux = x - r.c[0], uz = z - r.c[1], ul = Math.hypot(ux, uz) || 1;
  const leeD = Math.max(0, (ux * SE[0] + uz * SE[1]) / ul);
  const t = Math.min(1, (d * (1 + 0.45 * leeD)) / Math.max(r.R, 1));
  const hump = 1 - (1 - t) * (1 - t);
  const knob = (vn(x * 0.16 + s, z * 0.16) - 0.5) * 0.45 + (vn(x * 0.55 + 7 + s, z * 0.55 - 3) - 0.5) * 0.16;
  let Y = r.H * hump * (1 + knob) + Math.min(d, 0.6) * 0.15;
  const edge = sst(0, 0.5, d);   // the detail comes in over the first half metre from the edge
  // ledges: the plucked lee and the flanks break in treads and risers of 0.3-0.6 m along the contours
  const f = Y / r.stepH, fl = Math.floor(f), hq = (fl + sst(0.42, 1.0, f - fl)) * r.stepH;
  const ledgeK = (0.3 + 0.7 * leeD) * (1 - sst(0.65, 0.95, t)) * sst(0.4, 1.0, r.H) * (0.35 + 0.65 * vn(x * 0.09 + s, z * 0.09 - s));
  Y += (hq - Y) * ledgeK * 0.9;
  // the foliation: strata of different hardness weather into ridges and grooves along the strike (N30E): broken noise,
  // long along the strike and narrow across it, that comes and goes (not combs), weaker on the polished up-ice tops
  const across = x * 0.866 + z * 0.5, along = -x * 0.5 + z * 0.866;
  const u = across + (vn(along * 0.05 + s, across * 0.03) - 0.5) * 3.0 + (vn(along * 0.15 + 3, across * 0.1 + s) - 0.5) * 0.8;
  const env = 0.3 + 0.9 * vn(u * 0.25 + s, along * 0.04);
  const polish = sst(0.55, 1.0, t) * (1 - leeD);
  // CP34: band-limited to the level's lattice (bl: 1 where the lattice resolves the wavelength, 0 where it cannot): the
  // 0.4 m bands on the mid level's 0.32 m and the far level's 0.4-1 m lattices aliased into a fibrous, hay-like texture
  // from the air (t4Dive, Overlook Rock); broad 1.2 m ridges carry the grain there, the scan's normal map the fine one
  const stp = lv === 0 ? ST[0] : lv === 1 ? ST[1] : farStep(r);
  const bl = (lam) => 1 - sst(lam / 2.6, lam / 1.8, stp);
  let fo = (vn(u * 0.85 + s * 1.3, along * 0.15 + 2.1) - 0.5) * 0.12 * bl(1.2);   // ridges 1.2 m across, +-6 cm
  fo += (vn(u * 2.4 + s, along * 0.32) - 0.5) * 0.15 * bl(0.42);   // bands 0.4 m across, ~3 m along, +-7 cm
  if (lv < 2) fo += (vn(u * 6.3 + 3.7, along * 0.8 + s) - 0.5) * 0.06 * bl(0.16);   // 16 cm bands, +-3 cm
  if (lv < 1) fo += (vn(u * 17 + 9, along * 2.1 + s * 2) - 0.5) * 0.02 * bl(0.06);   // 6 cm streaks, +-1 cm
  Y += fo * env * (1 - 0.7 * polish) * edge;
  // the jointing: blocks elongated along the strike (Voronoi cells) with bevelled borders, some of them open as V-grooves
  // of 4-15 cm and up to 25 cm deep (the joints), the rest closed to a hairline; each block a little higher or lower than
  // its neighbours (more on the plucked lee) and tilted a few degrees. The grooves are widened to the lattice (0.9 step)
  if (lv < 2) {
    const st = ST[lv], cw = 1.5 + 0.9 * hh(s, 7.7) + 0.35 * r.H;   // block width across the strike (m): bigger rocks, bigger blocks
    // the borders wander (a warp of ~0.8 m with a 3 m grain) so no cell is a straight-sided polygon
    const wu = across + (vn(x * 0.31 + s * 3, z * 0.29 - s) - 0.5) * 1.9, wv = along + (vn(x * 0.27 - s, z * 0.33 + s * 2) - 0.5) * 2.6;
    const c = cell2(wu / cw + s, wv / (cw * 2.3));
    const eM = c.e * cw;
    const rag = 0.55 + 0.9 * vn(x * 2.7 + s, z * 2.7);   // a joint opens and closes along its length
    // the groove of the nearest border and of the second nearest, the deeper taken (continuous where the nearest changes)
    let gd = 0, gj = 0;
    for (let q = 0; q < 2; q++) {
      const pr = q ? c.pair2 : c.pair, e = (q ? c.e2 : c.e) * cw, op = sst(0.3, 0.7, pr);
      const wd = Math.max(0.9 * st, (0.04 + 0.11 * hh(pr * 91.7, 3.3)) * (0.45 + 0.55 * op) * rag);
      const dp = Math.min((0.025 + 0.2 * hh(pr * 53.1, 9.1)) * (0.15 + 0.85 * op) * rag, 0.12 * r.H + 0.04);
      const gq = 1 - sst(0, wd, e);
      gd = Math.max(gd, dp * gq * gq + dp * 0.15 * (1 - sst(wd, wd * 3, e)));
      gj = Math.max(gj, gq * (0.35 + 0.65 * op));
    }
    const stepA = 0.03 * (0.5 + 1.5 * leeD) * (1 - 0.65 * polish);
    const hc = (hh(c.ax * 3.1 + s * 0.3, c.az * 5.7 + 1.0) - 0.5) * stepA * 2;
    const gx = (hh(c.ax * 1.7, c.az * 2.3 + s) - 0.5) * 0.12, gz = (hh(c.ax * 4.1 + 2, c.az * 0.7 + s) - 0.5) * 0.12;
    const bev = sst(0, 0.22 + 0.2 * hh(c.ax, c.az), eM);   // the block rises from its border over 20-40 cm
    Y += (hc + gx * c.px * cw + gz * c.pz * cw * 2.3) * bev * edge;
    Y -= gd * edge;   // the groove and its rounded shoulders
    _J = gj * edge;
  }
  // lumps of 5-10 cm at 0.3-1 m, and chips of 1-2 cm at 10 cm in the near field
  if (lv < 2) Y += (vn(x * 1.4 + s, z * 1.4 - s) - 0.5) * 0.075 * (1 - 0.6 * polish) * edge * bl(0.7);
  if (lv < 1) Y += (vn(x * 3.7, z * 3.7 + s) - 0.5) * 0.028 * (1 - 0.8 * polish) * edge * bl(0.27) + (vn(x * 9.3 + s, z * 9.3 - s) - 0.5) * 0.012 * (1 - 0.85 * polish) * edge * bl(0.11);
  return Y;
}
// the surface's world y at (x, z) inside rock r (d in from its edge), at level lv (before the relief is in: the ground
// asked directly, no floors)
function surfY(r, x, z, d, lv) {
  distOf(r);
  if (!r.grid && L.reliefReady && !L.reliefReady()) return L.groundAt(x, z) + rockY(r, x, z, d, lv);
  const g = gridOf(r);
  const gy = gAt(g, g.G, x, z);
  return Math.min(gy + rockY(r, x, z, d, lv), capAt(g, x, z));
}
// cpLand.js cpRockTop: the outcrop's surface y at world (x, z), or undefined where none of these outcrops is
export function cpRocksTop(x, z) {
  if (!CPR33 || !L || _failed) return undefined;
  for (const r of RKS) {
    if (x < r.box[0] || x > r.box[2] || z < r.box[1] || z > r.box[3]) continue;
    const d = ringInsideDist(x, z, r.outer, r.holes);
    if (d < 0) continue;
    return surfY(r, x, z, d, 1);
  }
  return undefined;
}

// The lattices. The near and mid levels are built per 16 m chunk of the world grid (so only the chunks near the camera
// go fine), on world-aligned lattices (x = k st): neighbouring chunks of one level share their edge vertices, and a
// near chunk beside a mid one hides the crack between their edges behind a skirt dropped along its chunk edges. The
// normals come from the height function's central differences (not the triangles), so they run on across the edges.
// The far level is the whole rock at 0.8-2 m.
const CH = 16, ST = [0.125, 0.32];
const farStep = (r) => (r.A > 1500 ? 1.0 : r.A > 300 ? 0.8 : r.A > 60 ? 0.6 : 0.4);
// the chunks of the world grid the rock reaches (any point of its 0.5 m grid inside its skirt)
function chunksOf(r) {
  if (r.chunks) return r.chunks;
  const dg = distOf(r), set = new Map();
  for (let j = 0; j < dg.nz; j++) for (let i = 0; i < dg.nx; i++) {
    if (dg.D[j * dg.nx + i] < -0.45) continue;
    const x = dg.x0 + i * GS, z = dg.z0 + j * GS, ci = Math.floor(x / CH), cj = Math.floor(z / CH), k = ci * 100000 + cj;
    if (!set.has(k)) set.set(k, { ci, cj, box: [ci * CH, cj * CH, ci * CH + CH, cj * CH + CH], lv: [null, null] });
  }
  return (r.chunks = [...set.values()]);
}
// a lattice of level lv over box (world), clipped to the rock's box; skirt: drop the chunk-edge borders by that much
function buildPatch(r, lv, box, skirt) {
  const g = gridOf(r);
  const st = lv < 2 ? ST[lv] : farStep(r);
  const bx0 = Math.max(box[0], r.box[0] - 0.9), bz0 = Math.max(box[1], r.box[1] - 0.9), bx1 = Math.min(box[2], r.box[2] + 0.9), bz1 = Math.min(box[3], r.box[3] + 0.9);
  if (bx1 <= bx0 || bz1 <= bz0) return null;
  const i0 = Math.floor(bx0 / st + 1e-6), i1 = Math.ceil(bx1 / st - 1e-6), j0 = Math.floor(bz0 / st + 1e-6), j1 = Math.ceil(bz1 / st - 1e-6);
  // the lattice with a one-step margin (the normals' differences)
  const nx = i1 - i0 + 3, nz = j1 - j0 + 3, n = nx * nz;
  const Dv = new Float32Array(n), Yw = new Float32Array(n), Yr = new Float32Array(n), Jv = new Float32Array(n);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = (i0 + i - 1) * st, z = (j0 + j - 1) * st, k = j * nx + i;
    const d = gAt(g, g.D, x, z), gy = gAt(g, g.G, x, z);
    let Y = rockY(r, x, z, d, lv);
    Jv[k] = _J;
    const cap = capAt(g, x, z);
    if (gy + Y > cap) Y = cap - gy;
    Dv[k] = d; Yr[k] = Y; Yw[k] = gy + Y;
  }
  const vid = new Int32Array(n).fill(-1);
  const P = [], N = [], A = [], Dd = [];
  const keepD = -(0.45 + (lv === 2 ? st * 1.2 : 0)), skipD = -(0.3 + (lv === 2 ? st * 0.2 : 0));
  const vert = (k, i, j, drop) => {
    const x = (i0 + i - 1) * st, z = (j0 + j - 1) * st;
    const gx = (Yw[k + 1] - Yw[k - 1]) / (2 * st), gz = (Yw[k + nx] - Yw[k - nx]) / (2 * st), l = Math.hypot(gx, 1, gz);
    P.push(x, Yw[k] - drop, z); N.push(-gx / l, 1 / l, -gz / l);
    const cav = Dv[k] > 0 ? gAt(g, g.CAV, x, z) : 0;
    A.push(Math.min(1, Math.max(cav, Jv[k] * 0.85)), Yr[k] - drop, Jv[k]);
    Dd.push(Dv[k]);
    return P.length / 3 - 1;
  };
  for (let j = 1; j < nz - 1; j++) for (let i = 1; i < nx - 1; i++) { const k = j * nx + i; if (Dv[k] >= keepD) vid[k] = vert(k, i, j, 0); }
  const I = [];
  const used = new Uint8Array(n);
  for (let j = 1; j < nz - 2; j++) for (let i = 1; i < nx - 2; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, e = c + 1;
    if (vid[a] < 0 || vid[b] < 0 || vid[c] < 0 || vid[e] < 0) continue;
    if (Dv[a] < skipD && Dv[b] < skipD && Dv[c] < skipD && Dv[e] < skipD) continue;   // all skirt: under the ground
    // split along the diagonal whose ends differ less (follows the ridges, no saw-tooth across them)
    if (Math.abs(Yw[a] - Yw[e]) <= Math.abs(Yw[b] - Yw[c])) I.push(vid[a], vid[c], vid[e], vid[a], vid[e], vid[b]);
    else I.push(vid[a], vid[c], vid[b], vid[b], vid[c], vid[e]);
    used[a] = used[b] = used[c] = used[e] = 1;
  }
  if (!I.length) return null;
  if (skirt > 0) {
    // the chunk's four edges: a strip down from each used border edge (both windings: it is seen from either side)
    const edge = (ka, kb, ia, ja, ib, jb) => {
      if (!used[ka] || !used[kb]) return;
      const a2 = vert(ka, ia, ja, skirt), b2 = vert(kb, ib, jb, skirt);
      I.push(vid[ka], a2, vid[kb], vid[kb], a2, b2, vid[ka], vid[kb], a2, vid[kb], b2, a2);
    };
    for (let i = 1; i < nx - 2; i++) { edge(nx + i, nx + i + 1, i, 1, i + 1, 1); edge((nz - 2) * nx + i, (nz - 2) * nx + i + 1, i, nz - 2, i + 1, nz - 2); }
    for (let j = 1; j < nz - 2; j++) { edge(j * nx + 1, (j + 1) * nx + 1, 1, j, 1, j + 1); edge(j * nx + nx - 2, (j + 1) * nx + nx - 2, nx - 2, j, nx - 2, j + 1); }
  }
  const nv = P.length / 3;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  geo.setAttribute('aRk', new THREE.Float32BufferAttribute(A, 3));
  geo.setAttribute('aRd', new THREE.Float32BufferAttribute(Dd, 1));   // the distance in from the outline (the shader's grass fringe)
  geo.setIndex(nv > 65535 ? new THREE.Uint32BufferAttribute(I, 1) : new THREE.Uint16BufferAttribute(I, 1));
  geo.computeBoundingSphere();
  geo.userData.tris = I.length / 3;
  geo.userData.step = st;
  STATS.tris[lv] += I.length / 3; STATS.built[lv]++;
  return geo;
}
const buildLevel = (r, lv) => buildPatch(r, lv, [r.box[0] - 0.9, r.box[1] - 0.9, r.box[2] + 0.9, r.box[3] + 0.9], 0);
// one grass tuft: three crossed quads at (x, gy, z), Hh high, Wd wide, the tone picked by h2 (greens going to straw)
function pushTuft(P, C, AT, x, gy, z, Hh, Wd, h2, h0, seed, tones) {
  const T = tones || TUFT_TONES, tone = h2 < 0.35 ? T[0] : h2 < 0.75 ? T[1] : T[2];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI + h0 * 3.1, cx = Math.cos(a) * Wd * 0.5, cz = Math.sin(a) * Wd * 0.5;
    const v0 = [x - cx, gy - 0.04, z - cz], v1 = [x + cx, gy - 0.04, z + cz], v2 = [x + cx, gy + Hh, z + cz], v3 = [x - cx, gy + Hh, z - cz];
    for (const [v, uv] of [[v0, [0, 0]], [v1, [1, 0]], [v2, [1, 1]], [v0, [0, 0]], [v2, [1, 1]], [v3, [0, 1]]]) {
      P.push(v[0], v[1], v[2]); C.push(...tone); AT.push(uv[0], uv[1], seed + k * 0.37);
    }
  }
}
function tuftGeo(P, C, AT) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  geo.setAttribute('aRt', new THREE.Float32BufferAttribute(AT, 3));
  const N = new Float32Array(P.length);
  for (let i = 1; i < N.length; i += 3) N[i] = 1;
  geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  geo.computeBoundingSphere();
  return geo;
}
// the grass along the foot (and in the joints' mouths at the edge): tufts of 0.12-0.4 m every ~0.35 m of the outline
function tuftsOf(r) {
  if (r.tufts !== null) return r.tufts;
  const P = [], C = [], AT = [];
  const R = r.outer;
  let run = 0;
  for (let i = 0; i < R.length; i++) {
    const p = R[i], q = R[(i + 1) % R.length], ex = q[0] - p[0], ez = q[1] - p[1], Ls = Math.hypot(ex, ez) || 1;
    // outward: the ring's winding is unknown; test which side is outside
    let nx = ez / Ls, nz = -ex / Ls;
    const mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2;
    if (ringInsideDist(mx + nx * 0.3, mz + nz * 0.3, r.outer, r.holes) > 0) { nx = -nx; nz = -nz; }
    const run0 = run;
    run += Ls;
    for (let s = Math.ceil(run0 / 0.33) * 0.33; s < run; s += 0.33) {
      const h0 = hh(s * 1.31 + r.seed, 3.1), h1 = hh(s * 2.17, r.seed + 1), h2 = hh(s * 3.71, r.seed + 2);
      if (h0 < 0.18) continue;
      const tt = (s - run0) / Ls, off = -0.08 + 0.55 * h1 * h1;   // from just on the rock's foot out onto the lawn
      const x = p[0] + ex * tt + nx * off, z = p[1] + ez * tt + nz * off;
      if (L.inWater && L.inWater(x, z)) continue;
      const gy = L.groundAt(x, z);
      const Hh = 0.12 + 0.3 * h2 * h2 * (0.6 + 0.4 * h0), Wd = 0.22 + 0.25 * h1;
      pushTuft(P, C, AT, x, gy, z, Hh, Wd, h2, h0, (s * 0.37 + r.seed) % 97);
    }
  }
  if (!P.length) return (r.tufts = false);
  const geo = tuftGeo(P, C, AT);
  geo.dispose = () => {};   // shared by the rock's near and mid levels and kept with the rock across tile reloads
  STATS.tufts += P.length / 54;
  return (r.tufts = geo);
}
const TUFT_TONES = [[0.16, 0.24, 0.07], [0.2, 0.27, 0.08], [0.33, 0.31, 0.15]];
// CP34: the boulders' fringe in the lawn's own, darker greens (the outcrops' straw read pale against the light), a few dry
const B_TONES = [[0.05, 0.078, 0.022], [0.066, 0.094, 0.028], [0.08, 0.085, 0.036]];   // (lit from straight up: the bank's shade showed them pale)
// the grass fringe round the boulders: a ring of tufts tight at the foot of each and a looser one past it, the lawn's own
// greens (none on the water side)
function boulderTufts(list) {
  const P = [], C = [], AT = [];
  for (const b of list) {
    if (b.size < 0.3) continue;
    const n = Math.max(4, Math.min(20, Math.round(b.size * 10)));
    for (let k = 0; k < n; k++) {
      const h0 = hh(k * 1.7 + b.x * 0.13, b.z * 0.11 + 5.1), h1 = hh(k * 2.9 + b.z * 0.07, b.x * 0.05 + 1.3), h2 = hh(k * 4.1 + b.x * 0.31, b.z * 0.23 + 9.7);
      if (h0 < 0.12) continue;
      const a = ((k + h1) / n) * 6.2832, rr = b.size * (k % 3 === 2 ? 0.55 + 0.35 * h2 : 0.4 + 0.14 * h2);
      const x = b.x + Math.cos(a) * rr, z = b.z + Math.sin(a) * rr;
      const wet = L.inWater && L.inWater(x, z);
      const gy = drawnY(x, z);
      if (wet || gy < b.water + 0.04) continue;
      pushTuft(P, C, AT, x, gy, z, 0.1 + 0.3 * h2 * h2 * (0.6 + 0.4 * h0), 0.2 + 0.25 * h1, h2, h0, (b.x * 0.37 + k * 1.3) % 97, B_TONES);
    }
  }
  if (!P.length) return null;
  STATS.tufts += P.length / 54;
  return tuftGeo(P, C, AT);
}
export { pushTuft, tuftGeo };
export const STATS = { tris: [0, 0, 0], built: [0, 0, 0], tufts: 0, boulders: 0, rocks: 0 };
if (typeof window !== 'undefined') window.__CPR33 = STATS;

// The rock's levels: three.js calls update(camera) for an isLOD object in every render it reaches (the cube probes too,
// which are skipped). The near and mid lattices are built the first time the camera comes within range (one per
// frame), the near ones dropped again (LRU, six kept) when the camera has gone.
const NEAR_IN = 35, NEAR_OUT = 45, MID_IN = 140, MID_OUT = 155, MID_IN_BIG = 300, MID_OUT_BIG = 330;
const fpPath = () => (typeof window !== 'undefined' && window.__FP37 && window.__FP37.pts ? window.__FP37 : null);   // FP37
let _lastBuild = -1e9;
const _nearLRU = [];
const _v = new THREE.Vector3();
// the frame's own camera only (not a reflection's or a probe's, which would flip the levels every render)
const mainCam = (camera) => {
  if (camera.isOrthographicCamera || (camera.fov === 90 && camera.aspect === 1)) return false;
  const E = typeof window !== 'undefined' && window.__ENGINE;
  return !(E && E.camera && camera !== E.camera);
};
class RockLOD extends THREE.Object3D {
  constructor(r) {
    super();
    this.isLOD = true; this.autoUpdate = true;
    this.rock = r; this.name = 'cpr33:outcrop:' + r.id;
    this.levels = [];   // (three.js's LOD API; this object switches its own children)
    this.mode = 2; this.tuftMesh = null;
    const fg = r.lv[2] || (r.lv[2] = buildLevel(r, 2));
    this.far = fg ? this._m(fg, 'far') : null;
    this.slots = chunksOf(r).map((c) => ({ c, mesh: [null, null], cur: 1 }));
  }
  _m(geo, tag) {
    const m = new THREE.Mesh(geo, rockMat('outcrop'));
    m.name = 'cpr33:outcrop:' + this.rock.id + ':' + tag;
    m.castShadow = true; m.receiveShadow = true;
    this.add(m);
    return m;
  }
  _dist(b) {
    // FP37 (core/engine.js): while recording, the take's nearest approach (the same measure from each point of its path)
    const fp = fpPath();
    if (fp) {
      let d = Infinity;
      for (let j = 0; j < fp.pts.length; j += 3) {
        const x = fp.pts[j], y = fp.pts[j + 1], z = fp.pts[j + 2];
        const dx = Math.max(b[0] - x, 0, x - b[2]), dz = Math.max(b[1] - z, 0, z - b[3]);
        d = Math.min(d, Math.hypot(dx, dz, Math.max(0, y - (this.rock.gy0 ?? y) - this.rock.H - 2) * 0.8));
      }
      return d;
    }
    const dx = Math.max(b[0] - _v.x, 0, _v.x - b[2]), dz = Math.max(b[1] - _v.z, 0, _v.z - b[3]);
    return Math.hypot(dx, dz, Math.max(0, _v.y - (this.rock.gy0 ?? _v.y) - this.rock.H - 2) * 0.8);
  }
  // the chunk's mesh at level lv: built if the frame's budget allows (null: not yet; false: the chunk is empty there)
  _get(s, lv) {
    if (s.mesh[lv]) return s.mesh[lv];
    let g = s.c.lv[lv];
    if (g === false) return false;
    if (!g) {
      // one lattice per ~30 ms (a frame), so a fly-in does not stall on a dozen chunks at once
      if (performance.now() - _lastBuild < 30) return null;
      g = buildPatch(this.rock, lv, s.c.box, lv === 0 ? 0.16 : 0.22);
      _lastBuild = performance.now();
      s.c.lv[lv] = g || false;
      if (!g) return false;
      if (lv === 0) {
        // the near chunks kept: the last 48 built
        _nearLRU.push(s.c);
        if (_nearLRU.length > 48) { const o = _nearLRU.shift(); if (o.lv[0]) { o.lv[0].userData.dropped = true; o.lv[0] = null; } }
      }
    }
    const m = this._m(g, s.c.ci + '_' + s.c.cj + ':' + lv);
    m.visible = false;
    s.mesh[lv] = m;
    return m;
  }
  update(camera) {
    if (!mainCam(camera)) return;
    const r = this.rock;
    _v.setFromMatrixPosition(camera.matrixWorld);
    const dR = this._dist(r.box);
    const big = r.A > 250, mIn = big ? MID_IN_BIG : MID_IN, mOut = big ? MID_OUT_BIG : MID_OUT;
    if (this.mode === 1 ? dR < mOut : dR < mIn) {
      // every chunk at its mid level at least before the rock leaves its far level
      let all = true;
      for (const s of this.slots) if (this._get(s, 1) === null) all = false;
      if (all) this.mode = 1;
    } else this.mode = 2;
    if (this.far) this.far.visible = this.mode === 2 || !this.slots.length;
    if (this.mode === 2) {
      for (const s of this.slots) for (const m of s.mesh) if (m) m.visible = false;
      if (this.tuftMesh) this.tuftMesh.visible = false;
      return;
    }
    for (const s of this.slots) {
      const dc = this._dist(s.c.box);
      let want = dc < NEAR_IN || (s.cur === 0 && dc < NEAR_OUT) ? 0 : 1;
      if (want === 0 && !this._get(s, 0)) want = 1;
      // a near chunk the LRU dropped while the camera was away: forget its mesh
      if (s.mesh[0] && s.mesh[0].geometry.userData.dropped && want !== 0) { const m0 = s.mesh[0]; this.remove(m0); m0.geometry.dispose(); s.mesh[0] = null; }
      for (let k = 0; k < 2; k++) if (s.mesh[k]) s.mesh[k].visible = k === want;
      s.cur = want;
    }
    if (!this.tuftMesh) {
      const tg = tuftsOf(r);
      if (tg) { const t = (this.tuftMesh = new THREE.Mesh(tg, tuftMat())); t.name = 'cpr33:tufts:' + r.id; t.castShadow = false; t.receiveShadow = true; this.add(t); }
      else this.tuftMesh = { visible: false };
    }
    this.tuftMesh.visible = true;
  }
}

// ---------------------------------------------------------------- boulders
// CP34: the ground as the tile draws it (assemble.js's surfY over the tile's own sections, reshaped by cpLand's banks), set
// for the length of a tile's build: cpLand's groundAt is the bank's analytic curve, and the drawn bank (re-meshed at
// 2.5 m) lay 0.1-0.5 m under it in places: boulders and tufts set on groundAt floated (lakeNear_a5)
// (the lower of the two where they disagree: a stone set too deep is buried a little more, one set too high floats; by the
// Lake's north-east bank a section answered over the lawn as drawn there)
let _SY = null;
const SURF_KINDS = ['grass', 'path', 'gravel', 'sidewalk', 'brick', 'plaza'];
function drawnY(x, z) {
  const g = L.groundAt(x, z);
  if (_SY) { try { const y = _SY(x, z, SURF_KINDS, 0.3); if (y !== null && isFinite(y)) return Math.min(y, g); } catch (e) { _SY = null; } }
  return g;
}
// CP34: the shore's boulders in clusters, the way the ice and the builders left them (gap_north.jpg): along every natural
// shore (not the hard edges, not by a bridge), runs of rocky shore (a slow noise along the arc, rockier where the bank is
// narrow, the Pond rockiest) with a cluster site every 2.4 m on a hash: an anchor of 0.75-2.5 m at the waterline (a little
// into the water or up the bank) and 1-4 smaller ones (0.45 m and up) round it, mostly along the shore, never more than
// 1.3 m up the bank (the paths) or 1.8 m out. Each sunk under the LOWEST drawn ground of its footprint (no side floating on
// a sloping bank), the bed under the water held 6 cm + 6 % of its size under the surface so the big ones stand half out
function shoreBoulders(ox, oz, out) {
  for (const b of L.bodies) {
    if (b.kind !== 'lake') continue;
    if (b.box[0] > ox + 512 || b.box[2] < ox || b.box[1] > oz + 512 || b.box[3] < oz) continue;
    const rockiness = b.k === 'pond' ? 0.75 : b.k === 'lake' ? 0.5 : b.k === 'turtle' ? 0.45 : 0.35;
    for (const [ri, R] of [b.outer, ...b.holes].entries()) {
      const bw = ri === 0 ? b.bw : b.hbw[ri - 1] || [];
      const n = R.length;
      let run = 0;
      for (let i = 0; i < n; i++) {
        const p = R[i], q = R[(i + 1) % n];
        const ex = q[0] - p[0], ez = q[1] - p[1], Ls = Math.hypot(ex, ez) || 1, ux = ex / Ls, uz = ez / Ls;
        const run0 = run;
        run += Ls;
        // (the Pond, the rockiest, a site every 1.9 m: gap_north.jpg's banks are rock after rock)
        const SS = b.k === 'pond' ? 1.9 : 2.4;
        for (let s = Math.ceil(run0 / SS) * SS; s < run; s += SS) {
          const h0 = L.hash1(s * 1.73 + b.id % 911 + ri * 13.1);
          const w = bw[i] ?? 3;
          const runOn = vn(s * 0.05 + b.id % 97, ri * 3.3) * 0.9 + (w < 2 ? 0.35 : 0);
          if (runOn < 1 - rockiness || h0 > 0.33 + 0.2 * rockiness) continue;
          const t = (s - run0) / Ls, x0 = p[0] + ex * t, z0 = p[1] + ez * t;
          if (x0 < ox || x0 >= ox + 512 || z0 < oz || z0 >= oz + 512) continue;
          if (L.hard.length && L.hardMask(x0, z0) > 0.01) continue;
          if (L.nearBridge(x0, z0)) continue;
          // (nx, nz) toward the land
          let nx = uz, nz = -ux;
          if (L.inWater && L.inWater(x0 + nx * 1.5, z0 + nz * 1.5)) { nx = -nx; nz = -nz; }
          const h1 = L.hash1(s * 3.11 + 7.7), h2 = L.hash1(s * 5.37 + 2.2), h3 = L.hash1(s * 9.91 + 4.4), h4 = L.hash1(s * 2.29 + 8.8);
          const A = Math.min(2.5, (0.75 + 1.8 * Math.pow(h1, 1.6)) * (0.8 + 0.35 * rockiness));
          const offA = (h2 - 0.55) * 0.7 * A;
          const ax = x0 + nx * offA, az = z0 + nz * offA;
          const put = (x, z, size, hs, land) => {
            if (land > 1.3 || land < -1.8) return;
            if (L.hard.length && L.hardMask(x, z) > 0.01) return;
            if (L.nearBridge(x, z)) return;
            // under the water the bed drops a metre past the bank's cut: the boulder stands on a bed held 6 cm + 6 % of its
            // size under the surface (what lies deeper is never seen through the water), so the big ones stand half out
            const L0 = L.levelOf(b, x, z), bed = L0 - 0.06 - 0.06 * size;
            const gAt = (px, pz) => Math.max(drawnY(px, pz), bed);
            const gy = gAt(x, z);
            let gmin = gy, gland = gy;
            for (const r of [0.25 * size, 0.45 * size]) for (let k = 0; k < 6; k++) { const an = k * 1.0472 + hs * 3.0 + r; gmin = Math.min(gmin, gAt(x + Math.cos(an) * r, z + Math.sin(an) * r)); }
            // none on a bank's steep lip: an elongated scan's downhill end stood out over the drop, its underside showing
            // (lakeNear_final); the drop measured to 0.62 of the size, the water's surface standing in for the bed
            if (gy > L0 + 0.05) {
              for (let k = 0; k < 8; k++) { const an = k * 0.7854 + hs * 3.0, r = 0.62 * size; gland = Math.min(gland, Math.max(drawnY(x + Math.cos(an) * r, z + Math.sin(an) * r), L0 - 0.02)); }
              if ((gy - gland) / (0.62 * size) > 0.55) return;
            }
            // the bank's slope (the water's surface standing in for the bed: a boulder by the water leaned into it)
            const e = Math.max(0.35, 0.35 * size), sAt = (px, pz) => Math.max(drawnY(px, pz), L0);
            const gx = (sAt(x + e, z) - sAt(x - e, z)) / (2 * e), gz = (sAt(x, z + e) - sAt(x, z - e)) / (2 * e);
            out.push({ x, z, gy, gmin, gx, gz, size, water: L0, sink: gmin < L0 ? 0.12 + 0.16 * hs : 0.3 + 0.15 * hs, h: [L.hash1(x * 1.37 + z * 0.71), L.hash1(x * 0.53 - z * 1.91 + 3.3), hs, L.hash1(x * 2.11 + z * 3.07 + 7.1)] });
          };
          const n0 = out.length;
          put(ax, az, A, h4, offA);
          if (out.length > n0) out[n0].big = true;
          const ns = 1 + Math.floor(h3 * 4.2);
          for (let k = 0; k < ns; k++) {
            const g1 = L.hash1(s * 4.7 + k * 1.31 + 0.5), g2 = L.hash1(s * 6.1 + k * 2.17 + 1.5), g3 = L.hash1(s * 7.9 + k * 3.7 + 2.5);
            const S = Math.max(0.45, A * (0.25 + 0.4 * g1 * g1));
            const side = g2 < 0.5 ? -1 : 1, ang = (g3 - 0.5) * 1.5;   // off the shore's line, into the water or up the bank
            const dist = 0.42 * (A + S) + 0.45 * g1 * A + 0.1;
            const dx = (ux * Math.cos(ang) * side + nx * Math.sin(ang)) * dist, dz = (uz * Math.cos(ang) * side + nz * Math.sin(ang)) * dist;
            put(ax + dx, az + dz, S, L.hash1(s * 8.3 + k * 4.1 + 3.5), offA + Math.sin(ang) * dist);
          }
        }
      }
    }
  }
}
function footBlocks(r, out) {
  const R = r.outer;
  let run = 0;
  for (let i = 0; i < R.length; i++) {
    const p = R[i], q = R[(i + 1) % R.length], ex = q[0] - p[0], ez = q[1] - p[1], Ls = Math.hypot(ex, ez) || 1;
    let nx = ez / Ls, nz = -ex / Ls;
    const mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2;
    if (ringInsideDist(mx + nx * 0.3, mz + nz * 0.3, r.outer, r.holes) > 0) { nx = -nx; nz = -nz; }
    const lee = Math.max(0, nx * SE[0] + nz * SE[1]);
    const run0 = run;
    run += Ls;
    for (let s = Math.ceil(run0 / 2.2) * 2.2; s < run; s += 2.2) {
      const h0 = hh(s * 0.91 + r.seed, 5.5);
      if (h0 > 0.12 + 0.45 * lee) continue;
      const h1 = hh(s * 1.7, r.seed + 4), h2 = hh(s * 2.9, r.seed + 5), h3 = hh(s * 4.1, r.seed + 6);
      const t = (s - run0) / Ls, off = 0.1 + 0.9 * h1;
      const x = p[0] + ex * t + nx * off, z = p[1] + ez * t + nz * off;
      if (L.inWater && L.inWater(x, z)) continue;
      out.push({ x, z, gy: drawnY(x, z), size: (0.25 + 0.6 * h2 * h2) * Math.min(1.3, 0.6 + r.H * 0.25), water: -1e4, sink: 0.25 + 0.2 * h3, h: [h1, h2, h3, hh(s * 7.7, r.seed + 9)] });
    }
  }
}
// erratics: glacial blocks resting on the bedrock, about one per 150 m2 of a rock over 120 m2 (0.5-1.6 m), set on the surface
// at the surface's own tilt (a block on a slope must not hang over it), not on the flats the castle's and the houses' floors cap
function topBlocks(r, out) {
  if (r.A < 120) return;
  const g = gridOf(r), step = 7.5;
  for (let z = Math.floor(r.box[1] / step) * step; z < r.box[3]; z += step) for (let x = Math.floor(r.box[0] / step) * step; x < r.box[2]; x += step) {
    if (hh(x * 0.371 + r.seed, z * 0.529 + 3.3) > 0.4) continue;
    const jx = x + (hh(x * 1.7, z * 2.3 + r.seed) - 0.5) * step * 0.8, jz = z + (hh(x * 3.1 + 1.1, z * 0.7) - 0.5) * step * 0.8;
    const d = ringInsideDist(jx, jz, r.outer, r.holes);
    if (d < 1.3 || capAt(g, jx, jz) < 1e8) continue;
    const h1 = hh(jx * 2.9, jz * 1.3 + r.seed), h2 = hh(jx * 4.3 + 2, jz * 3.7), h3 = hh(jx * 5.1, jz * 6.7 + 5);
    const y0 = surfY(r, jx, jz, d, 1), e = 0.6;
    const gx = (surfY(r, jx + e, jz, ringInsideDist(jx + e, jz, r.outer, r.holes), 1) - surfY(r, jx - e, jz, ringInsideDist(jx - e, jz, r.outer, r.holes), 1)) / (2 * e);
    const gz = (surfY(r, jx, jz + e, ringInsideDist(jx, jz + e, r.outer, r.holes), 1) - surfY(r, jx, jz - e, ringInsideDist(jx, jz - e, r.outer, r.holes), 1)) / (2 * e);
    const sl = Math.hypot(gx, gz);
    if (sl > 0.5) continue;   // not on a steep flank
    const nl = Math.hypot(gx, 1, gz);
    out.push({ x: jx, z: jz, gy: y0, size: 0.5 + 1.1 * h2 * h2, water: -1e4, sink: 0.4 + 0.2 * h3, n: [-gx / nl, 1 / nl, -gz / nl], h: [h1, h2, h3, hh(jx * 7.7, jz * 8.1 + r.seed)] });
  }
}
// the instances of a tile, bucketed by LOD on their size on screen (re-bucketed when the camera has moved a metre or its lens
// changed). CP34: the levels went by distance alone (B_LOD = [40, 150] m), so t4Lake's 30 deg lens drew 1 m boulders 60 m
// out with the 1400-triangle level ~70 px tall and the 280 one past 150 m: facets. Now the level by the boulder's projected
// diameter in pixels (the camera's fov, the drawing buffer's height): the 7000-triangle scan from 48 px, the 1400 one from
// 12 px; a recorded take (?record=1) from 20 / 5 px
const QS = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
const REC = !!(QS && QS.get('record') === '1');
const B_PX = REC ? [20, 5] : [48, 12];
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s3 = new THREE.Vector3(), _p3 = new THREE.Vector3();
const _q0 = new THREE.Quaternion(), _q1 = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0), _nv = new THREE.Vector3();
class BoulderSet extends THREE.Object3D {
  constructor(list) {
    super();
    this.isLOD = true; this.autoUpdate = true; this.levels = [];
    this.name = 'cpr33:boulders';
    this.list = list; this.meshes = null; this.last = new THREE.Vector3(1e9, 1e9, 1e9); this.kpx = 0;
    let x0 = 1e9, z0 = 1e9, y0 = 1e9, x1 = -1e9, z1 = -1e9, y1 = -1e9;
    for (const b of list) { x0 = Math.min(x0, b.x); x1 = Math.max(x1, b.x); z0 = Math.min(z0, b.z); z1 = Math.max(z1, b.z); y0 = Math.min(y0, b.gy); y1 = Math.max(y1, b.gy); }
    this.sphere = new THREE.Sphere(new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 + 3);
    this.ready = false;
  }
  _init() {
    const pieces = rockPieces();
    if (!pieces) { loadRockPieces(); return false; }
    if (!pieces.length) return false;
    const np = pieces.length, counts = new Array(np).fill(0);
    // (rock_moss_set_02_rock13 out: square-cut, in the Pond bank's shade it read as a dark box from t4Gapstow's lens)
    this.bulky = pieces.map((P, i) => (P.dims[1] >= 0.44 && !/rock13$/.test(P.piece) ? i : -1)).filter((i) => i >= 0);
    for (const b of this.list) {
      // the anchors from the bulky scans (0.44 and more of their footprint high), the rest from any
      if (b.big && this.bulky.length) b.p = this.bulky[Math.min(this.bulky.length - 1, Math.floor(b.h[3] * this.bulky.length))];
      else b.p = Math.min(np - 1, Math.floor(b.h[3] * np));
      const P = pieces[b.p], d = P.dims;   // dims: the piece on a 1 m footprint (x, height, z)
      // CP34: scale: the footprint's larger side to the boulder's size, stretched or squashed up to 15 %; the flattest scans
      // (rock_moss_set_02's slabs, 0.35-0.45 high) raised a little, so a big one is a block, not a paving slab
      const sc = b.size, yaw = b.h[0] * 6.283;
      const sy = (0.85 + 0.3 * b.h[2]) * (d[1] < 0.45 ? 1.25 : 1.0);
      const hgt = d[1] * sc * sy;
      if (b.gmin === undefined) b.gmin = b.gy;
      if (b.gx === undefined) { b.gx = b.n ? -b.n[0] / b.n[1] : 0; b.gz = b.n ? -b.n[2] / b.n[1] : 0; }
      if (b.n) { _q0.setFromUnitVectors(_up, _nv.set(b.n[0], b.n[1], b.n[2])); _q1.setFromAxisAngle(_up, yaw); _q.copy(_q0).multiply(_q1); }   // on the bedrock: at its tilt
      else {
        // half the bank's slope (at most 11 deg), and a lean of up to 5 deg its own way
        const sl = Math.hypot(b.gx, b.gz), kq = sl > 0.4 ? 0.4 / sl : 1, tl = (b.h[1] - 0.5) * 0.18;
        _q0.setFromUnitVectors(_up, _nv.set(-b.gx * kq * 0.5, 1, -b.gz * kq * 0.5).normalize());
        _e.set(tl, yaw, (b.h[2] - 0.5) * 0.18, 'YXZ'); _q1.setFromEuler(_e);
        _q.copy(_q0).multiply(_q1);
      }
      _s3.set(sc, sc * sy, sc);
      // the base under the lowest ground of the footprint, sunk 12-28 % of the height more in the water, 30-45 % on land (the
      // scans narrow to their base: less, and a boulder on the lawn sat perched on a waist), and on land at least to the
      // scan's waist (P.waist: where it reaches 85 % of its width), never more than 70 %
      const sk = b.gmin < b.water ? b.sink : Math.min(0.7, Math.max(b.sink, (P.waist || 0) + 0.05));
      _p3.set(b.x, Math.min(b.gy, b.gmin) - hgt * sk, b.z);
      _m4.compose(_p3, _q, _s3);
      b.m = _m4.toArray(new Float32Array(16));
      b.rad = sc * 0.55;
      b.cy = _p3.y + hgt * 0.6;
      // the shader's instance data: z = seed (0-99) + 100 (gx + 101 gz), the ground's slope in 0.02 steps from -1
      const gq = (v) => Math.round((Math.min(1, Math.max(-1, v)) + 1) / 0.02);
      b.pk = Math.floor(b.h[3] * 997) % 100 + 100 * (gq(b.gx) + 101 * gq(b.gz));
      counts[b.p]++;
    }
    this.meshes = pieces.map((P, i) => {
      if (!counts[i]) return null;
      return P.lods.map((geo, lv) => {
        if (!geo.userData.keep) { geo.dispose = () => {}; geo.userData.keep = true; }   // shared by every tile: never disposed with one
        const m = new THREE.InstancedMesh(geo, rockMat('boulder'), counts[i]);
        m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(counts[i] * 3), 3);
        m.count = 0;
        m.boundingSphere = this.sphere.clone();
        m.castShadow = lv < 2; m.receiveShadow = true;   // CP34: the 1400 level too (t4Lake's lens draws many at it)
        m.name = `cpr33:boulder:${P.src}/${P.piece}:${lv}`;
        m.visible = false;
        this.add(m);
        return m;
      });
    });
    STATS.boulders += this.list.length;
    this.ready = true;
    return true;
  }
  update(camera) {
    if (!mainCam(camera)) return;
    if (!this.ready && !this._init()) return;
    _v.setFromMatrixPosition(camera.matrixWorld);
    const E = typeof window !== 'undefined' && window.__ENGINE, hpx = (E && E.renderer && E.renderer.domElement.height) || 1080;
    const kpx = hpx / (2 * Math.tan(((camera.fov || 55) * Math.PI) / 360));   // px per metre at 1 m
    // FP37: while recording, each boulder holds the level of its largest size on screen in the take, set once per take
    const fp = fpPath();
    if (fp) { if (this.fpV === fp.v && Math.abs(kpx - this.kpx) < 1) return; this.fpV = fp.v; }
    else { this.fpV = -1; if (_v.distanceToSquared(this.last) < 1.0 && Math.abs(kpx - this.kpx) < 1) return; }
    this.last.copy(_v); this.kpx = kpx;
    for (const row of this.meshes) if (row) for (const m of row) m.count = 0;
    for (const b of this.list) {
      let dd;
      if (fp) {
        let q = Infinity;
        for (let j = 0; j < fp.pts.length; j += 3) q = Math.min(q, Math.hypot(b.x - fp.pts[j], b.cy - fp.pts[j + 1], b.z - fp.pts[j + 2]));
        dd = Math.max(0.5, q - b.rad * 0.5);
      } else dd = Math.max(0.5, Math.hypot(b.x - _v.x, b.cy - _v.y, b.z - _v.z) - b.rad * 0.5);
      const px = (b.rad * 2 * kpx) / dd;
      const lv = px > B_PX[0] ? 0 : px > B_PX[1] ? 1 : 2;
      const m = this.meshes[b.p][lv], i = m.count++;
      m.instanceMatrix.array.set(b.m, i * 16);
      m.instanceColor.array[i * 3] = b.water; m.instanceColor.array[i * 3 + 1] = b.gy; m.instanceColor.array[i * 3 + 2] = b.pk;
    }
    for (const row of this.meshes) if (row) for (const m of row) {
      m.visible = m.count > 0;
      if (m.count) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
    }
  }
}

// CP34: the last-built tile's boulders on a 2 m hash: cpLand's reeds (built right after) keep out of them (a stand of reeds
// stood through a boulder)
let _bh = null;
export function cpRocksClear(x, z) {
  if (!_bh) return true;
  const i = Math.floor(x / 2), j = Math.floor(z / 2);
  for (let a = -1; a <= 1; a++) for (let c = -1; c <= 1; c++) {
    const L2 = _bh.get((i + a) * 100003 + (j + c));
    if (L2) for (const b of L2) if (Math.hypot(x - b.x, z - b.z) < 0.5 * b.size + 0.3) return false;
  }
  return true;
}
// CP34: the contact shade round each boulder's foot: a soft dark disc draped on the drawn ground (the grass under the rock's
// skirt gets no sky and no bounce), multiplied over whatever the ground draws, cut at the water's surface
let _cMat = null;
function contactMat() {
  if (_cMat) return _cMat;
  _cMat = new THREE.ShaderMaterial({
    name: 'cpr34:contact', transparent: true, depthWrite: false, toneMapped: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    // aCk: x the water's level (cut there), y the strength, z the rock's edge in the disc's radius (full strength inside it,
    // fading to nothing at the rim); aCd: the point's place on the disc (-1 .. 1)
    vertexShader: `attribute vec3 aCk; attribute vec2 aCd; varying vec2 vUv; varying float vY; varying vec3 vK;
      void main() {
        vUv = aCd;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vY = wp.y; vK = aCk;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `varying vec2 vUv; varying float vY; varying vec3 vK;
      void main() {
        if (vY < vK.x + 0.01) discard;
        float r = length(vUv), t = 1.0 - smoothstep(vK.z, 1.0, r);
        float a = t * t * vK.y;
        gl_FragColor = vec4(vec3(1.0 - a), 1.0);
      }`,
  });
  return _cMat;
}
// one disc per boulder, a 5 x 5 grid draped on the drawn ground (a flat disc on the slope's plane stood off a curved bank
// as a dark floating tail, lakeNear_a9), 3.5 cm over it
function contactShade(list) {
  const P = [], D = [], K = [], I = [];
  const N = 5;
  for (const b of list) {
    if (b.size < 0.3) continue;
    const R0 = 0.45 * b.size, R = R0 + 0.3 + 0.15 * b.size, k0 = P.length / 3;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const u = (i / (N - 1)) * 2 - 1, v = (j / (N - 1)) * 2 - 1, x = b.x + u * R, z = b.z + v * R;
      P.push(x, drawnY(x, z) + 0.035, z); D.push(u, v); K.push(b.water, 0.5 + 0.15 * b.h[2], R0 / R);
    }
    for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
      const a = k0 + j * N + i;
      I.push(a, a + N, a + 1, a + 1, a + N, a + N + 1);
    }
  }
  if (!I.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('aCd', new THREE.Float32BufferAttribute(D, 2));
  g.setAttribute('aCk', new THREE.Float32BufferAttribute(K, 3));
  g.setIndex(P.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(I, 1) : new THREE.Uint16BufferAttribute(I, 1));
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, contactMat());
  m.castShadow = false; m.receiveShadow = false;
  m.renderOrder = 1;
  m.name = 'cpr34:contact';
  return m;
}

// ---------------------------------------------------------------- the tile's rocks (cpLand.js build)
export function cpRocksBuild(group, ctx) {
  if (!CPR33 || !L || _failed) return false;
  const mark = group.children.length;
  try { buildTile(group, ctx); return true; }
  catch (e) {
    console.warn('[cpr33] the tile build failed, the CP32 rocks take over', e);
    while (group.children.length > mark) group.remove(group.children[group.children.length - 1]);
    _failed = true;
    return false;
  } finally { _SY = null; }
}
function buildTile(group, ctx) {
  const { ox, oz, key } = ctx;
  _SY = typeof ctx.surfY === 'function' ? ctx.surfY : null; _bh = null;
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const blocks = [];
  let n = 0;
  for (const r of RKS) {
    if (r.c[0] < ox || r.c[0] >= ox + 512 || r.c[1] < oz || r.c[1] >= oz + 512) continue;
    gridOf(r);
    const lod = new RockLOD(r);
    if (!lod.far && !lod.slots.length) continue;
    group.add(lod);
    n++;
    footBlocks(r, blocks);
    topBlocks(r, blocks);
    // walkers walk round it (the ring cut to at most 24 points)
    if (r.A > 40) {
      const R = r.outer, stp = Math.max(1, Math.ceil(R.length / 24)), pts = [];
      let minX = 1e9, minZ = 1e9, maxX = -1e9, maxZ = -1e9;
      for (let i = 0; i < R.length; i += stp) { pts.push(R[i][0], R[i][1]); minX = Math.min(minX, R[i][0]); maxX = Math.max(maxX, R[i][0]); minZ = Math.min(minZ, R[i][1]); maxZ = Math.max(maxZ, R[i][1]); }
      const gy = L.groundAt(r.c[0], r.c[1]);
      COLLIDERS.addPrism(key, { pts: new Float32Array(pts), minX, minZ, maxX, maxZ, y0: gy - 2, y1: gy + r.H });
    }
  }
  STATS.rocks += n;
  const list = [];
  shoreBoulders(ox, oz, list);
  for (const b of blocks) if (b.x >= ox && b.x < ox + 512 && b.z >= oz && b.z < oz + 512) list.push(b);
  _bh = new Map();
  for (const b of list) { const k = Math.floor(b.x / 2) * 100003 + Math.floor(b.z / 2); if (!_bh.has(k)) _bh.set(k, []); _bh.get(k).push(b); }
  if (list.length) {
    loadRockPieces();
    group.add(new BoulderSet(list));
    const tg = boulderTufts(list);
    if (tg) { const t = new THREE.Mesh(tg, tuftMat()); t.name = 'cpr33:boulderTufts'; t.castShadow = false; t.receiveShadow = true; group.add(t); }
    const cs = contactShade(list);
    if (cs) group.add(cs);
  }
  if (n || list.length) console.log(`[cpr33] ${ox / 512}_${oz / 512}: ${n} outcrops, ${list.length} boulders in ${t0 ? (performance.now() - t0).toFixed(0) : '?'} ms`);
}

// harness access (tools/cp33/rocks_shade.mjs: hill-shaded height maps of the outcrops, no GPU)
export const CPR33_DBG = { RKS, rockY, distOf, gridOf, surfY, ringInsideDist, buildPatch, tuftsOf, boulderTufts };
