// AR33 sk: the street surface of one tile as plain buffers, chunked 128 m (streetscape.js turns them into meshes). Pure (no
// three, no DOM), so tools can run it in node (docs/notes/ar33-street.md).
import { LINE, hash2 } from './skGeom.js';
import { Field, kerbChains, lawnChains } from './skField.js';
import { Buf } from './skBuf.js';
import { makeFrame, buildFlags, FLAG } from './skWalk.js';
import { buildKerb } from './skKerb.js';
import { buildPads } from './skPads.js';
import { buildCovers } from './skCovers.js';
import { paintPieces, buildWear, buildMarks, crossingEnds } from './skPaint.js';

export const ZONE_D = 78;                             // metres either side of the 125th Street centreline that get dressed
export const HPT_BOX = [350, 3250, 1850, 5350];
export const MANHATTAN = Math.atan2(0.4853, 0.8744);  // the commissioners' grid (MG_A in the ground shader)
export const CH = 128;                                // chunk size (m): one LOD each

// distance from the corridor centreline (LINE), with a box reject
const SEGS = [];
for (let i = 1; i < LINE.length; i++) {
  const [x0, z0] = LINE[i - 1], [x1, z1] = LINE[i];
  SEGS.push({ x0, z0, dx: x1 - x0, dz: z1 - z0, L2: (x1 - x0) ** 2 + (z1 - z0) ** 2, bx0: Math.min(x0, x1) - ZONE_D, bx1: Math.max(x0, x1) + ZONE_D, bz0: Math.min(z0, z1) - ZONE_D, bz1: Math.max(z0, z1) + ZONE_D });
}
export function corridorDist(x, z) {
  let best = 1e9;
  for (const s of SEGS) {
    if (x < s.bx0 || x > s.bx1 || z < s.bz0 || z > s.bz1) continue;
    const t = Math.max(0, Math.min(1, ((x - s.x0) * s.dx + (z - s.z0) * s.dz) / s.L2));
    const d = Math.hypot(x - (s.x0 + s.dx * t), z - (s.z0 + s.dz * t));
    if (d < best) best = d;
  }
  return best;
}
// the same without the box reject, for the tile test: a tile's centre can lie outside every segment's box while its square
// holds a stretch of the corridor (tiles 1_-8, 2_-8 and 6_-5, the 12th Avenue and Second Avenue ends, were dropped whole)
function corridorDistAll(x, z) {
  let best = 1e9;
  for (const s of SEGS) {
    const t = Math.max(0, Math.min(1, ((x - s.x0) * s.dx + (z - s.z0) * s.dz) / s.L2));
    best = Math.min(best, Math.hypot(x - (s.x0 + s.dx * t), z - (s.z0 + s.dz * t)));
  }
  return best;
}
// Hunters Point: the Pepsi-Cola sign, Gantry Plaza and the Center Boulevard towers (within 520 m of the sign's waterfront)
export const HPT_C = [1150, 4550, 520];
export const inHptBox = (x, z) => x > HPT_BOX[0] && x < HPT_BOX[2] && z > HPT_BOX[1] && z < HPT_BOX[3];
export const inHpt = (x, z) => Math.hypot(x - HPT_C[0], z - HPT_C[1]) < HPT_C[2];
export const inZone = (x, z) => inHpt(x, z) || corridorDist(x, z) <= ZONE_D;

// the orientation of a tile's streets (mod 90 deg) from its kerb lines, weighted by length
function dominantAngle(chains) {
  let sc = 0, ss = 0;
  for (const c of chains) for (let i = 1; i < c.pts.length; i++) {
    const dx = c.pts[i][0] - c.pts[i - 1][0], dz = c.pts[i][1] - c.pts[i - 1][1], L = Math.hypot(dx, dz), phi = Math.atan2(dz, dx);
    sc += L * Math.cos(4 * phi); ss += L * Math.sin(4 * phi);
  }
  return Math.atan2(ss, sc) / 4;
}

// The flag frame of a sidewalk triangle: anchored to the nearest kerb edge that has the walk behind it, so the first row of flags
// starts at the kerb and the joints run square to it; kerbs along a grid axis snap to the grid, corner arcs take the plain grid.
function makeFrameFn(chains, theta, seedBase) {
  const C = Math.cos(theta), S = Math.sin(theta), gA = [C, S], gB = [-S, C];
  const edges = [];
  chains.forEach((c, ci) => {
    if (c.raised !== 'sidewalk') return;
    for (let i = 0; i + 1 < c.pts.length; i++) {
      const ax = c.pts[i][0], az = c.pts[i][1], bx = c.pts[i + 1][0], bz = c.pts[i + 1][1], L = Math.hypot(bx - ax, bz - az);
      if (L < 0.2) continue;
      const ux = (bx - ax) / L, uz = (bz - az) / L;
      edges.push({ ax, az, bx, bz, L, ux, uz, nx: uz, nz: -ux, ci, x0: Math.min(ax, bx) - 26, x1: Math.max(ax, bx) + 26, z0: Math.min(az, bz) - 26, z1: Math.max(az, bz) + 26, frame: null });
    }
  });
  const global = { ax: C, az: S, bx: -S, bz: C, a0: 0, b0: 0, seed: seedBase };
  return (T) => {
    const cx = (T[0][0] + T[1][0] + T[2][0]) / 3, cz = (T[0][2] + T[1][2] + T[2][2]) / 3;
    let best = null, bd = 26;
    for (const e of edges) {
      if (cx < e.x0 || cx > e.x1 || cz < e.z0 || cz > e.z1) continue;
      const dx = e.bx - e.ax, dz = e.bz - e.az, t = Math.max(0, Math.min(1, ((cx - e.ax) * dx + (cz - e.az) * dz) / (e.L * e.L)));
      const d = Math.hypot(cx - (e.ax + dx * t), cz - (e.az + dz * t));
      if (d >= bd || (cx - e.ax) * e.nx + (cz - e.az) * e.nz < -0.3) continue;
      bd = d; best = e;
    }
    if (!best) return global;
    const e = best;
    if (e.frame) return e.frame;
    const dotA = Math.abs(e.ux * gA[0] + e.uz * gA[1]);
    let axv, bxv;
    if (e.L <= 2.5) return (e.frame = global);
    if (dotA > 0.9903) { axv = gA; const sb = e.nx * gB[0] + e.nz * gB[1] >= 0 ? 1 : -1; bxv = [gB[0] * sb, gB[1] * sb]; }
    else if (dotA < 0.1392) { axv = gB; const sa = e.nx * gA[0] + e.nz * gA[1] >= 0 ? 1 : -1; bxv = [gA[0] * sa, gA[1] * sa]; }
    else { axv = [e.ux, e.uz]; bxv = [e.nx, e.nz]; }
    return (e.frame = { ax: axv[0], az: axv[1], bx: bxv[0], bz: bxv[1], a0: hash2(e.ci + 3, seedBase) * FLAG, b0: e.ax * bxv[0] + e.az * bxv[1] + 0.176, seed: seedBase + e.ci * 7, kerb: true });
  };
}

const chunkKey = (x, z) => Math.floor(x / CH) + '_' + Math.floor(z / CH);

// the compiled warn / warnIron sections are 2-triangle rectangles: centre, size, the long side's direction, compiled y
export function padCentres(tile, ox, oz) {
  const out = [];
  for (const [name, kind] of [['warn', 'red'], ['warnIron', 'iron']]) {
    const a = tile.S[name]; if (!a) continue;
    for (let o = 0; o + 17 < a.length; o += 18) {
      const P = [];
      for (let t = 0; t < 2; t++) for (let i = 0; i < 3; i++) P.push([a[o + t * 9 + i * 3] + ox, a[o + t * 9 + i * 3 + 1], a[o + t * 9 + i * 3 + 2] + oz]);
      const uniq = [];
      for (const p of P) if (!uniq.some((q) => Math.hypot(q[0] - p[0], q[2] - p[2]) < 0.02)) uniq.push(p);
      if (uniq.length !== 4) continue;
      const cx = uniq.reduce((s, p) => s + p[0], 0) / 4, cz = uniq.reduce((s, p) => s + p[2], 0) / 4, y = uniq.reduce((s, p) => s + p[1], 0) / 4;
      let best = null;
      for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) { const d = Math.hypot(uniq[i][0] - uniq[j][0], uniq[i][2] - uniq[j][2]); if (!best || d > best.d) best = { d, i, j }; }
      const rest = [0, 1, 2, 3].filter((k) => k !== best.i && k !== best.j);
      const sides = [[uniq[best.i], uniq[rest[0]]], [uniq[best.i], uniq[rest[1]]]].map(([p, q]) => ({ L: Math.hypot(p[0] - q[0], p[2] - q[2]), dx: q[0] - p[0], dz: q[2] - p[2] }));
      const s = sides[0].L >= sides[1].L ? sides[0] : sides[1], t = sides[0].L >= sides[1].L ? sides[1] : sides[0];
      if (s.L < 0.3 || s.L > 4) continue;
      out.push({ x: cx, z: cz, y, w: s.L, d: t.L, ux: s.dx / s.L, uz: s.dz / s.L, kind });
    }
  }
  return out;
}
// arc-length intervals of a kerb chain to leave open at the ramps
function rampSkips(chain, pads) {
  const skip = [], pts = chain.pts, S = [0];
  for (let i = 1; i < pts.length; i++) S.push(S[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  for (const p of pads) {
    let bestD = 1.5, bestS = null;
    for (let i = 0; i + 1 < pts.length; i++) {
      const ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0], bz = pts[i + 1][1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.z - az) * dz) / L2));
      const d = Math.hypot(p.x - (ax + dx * t), p.z - (az + dz * t));
      if (d < bestD) { bestD = d; bestS = S[i] + Math.sqrt(L2) * t; }
    }
    if (bestS !== null) skip.push([bestS - 1.0, bestS + 1.0]);
  }
  return skip;
}

// opt: { walk, kerb, pads, cov, wear } (all true by default)
export function buildChunks(tile, ox, oz, opt = {}) {
  const WALK = opt.walk !== false, KERB = opt.kerb !== false, PADS = opt.pads !== false, COV = opt.cov !== false, WEAR = opt.wear !== false;
  // a tile whose square cannot touch the zone is skipped before anything is indexed
  const cx0 = ox + 256, cz0 = oz + 256;
  if (corridorDistAll(cx0, cz0) > 256 * 1.42 + ZONE_D && Math.hypot(cx0 - HPT_C[0], cz0 - HPT_C[1]) > 256 * 1.42 + HPT_C[2]) return new Map();
  const field = new Field(tile, ox, oz);
  const chains = kerbChains(tile, ox, oz, field);
  const sw = tile.S.sidewalk, tris = [];
  if (sw) for (let o = 0; o + 8 < sw.length; o += 9) {
    const cx = (sw[o] + sw[o + 3] + sw[o + 6]) / 3 + ox, cz = (sw[o + 2] + sw[o + 5] + sw[o + 8]) / 3 + oz;
    if (!inZone(cx, cz)) continue;
    tris.push([0, 1, 2].map((i) => [sw[o + i * 3] + ox, sw[o + i * 3 + 1], sw[o + i * 3 + 2] + oz]));
  }
  const chunks = new Map();
  if (!tris.length && !chains.length) return chunks;
  const theta = inHpt(ox + 256, oz + 256) ? dominantAngle(chains) : MANHATTAN;
  const at = (x, z) => {
    const k = chunkKey(x, z);
    let c = chunks.get(k);
    if (!c) { const ix = Math.floor(x / CH), iz = Math.floor(z / CH); c = { cx: (ix + 0.5) * CH, cz: (iz + 0.5) * CH, flags: new Buf(), kerb: new Buf(), padred: new Buf(), padiron: new Buf(), cov: new Buf(), patch: new Buf(), repave: new Buf(true), wear: new Buf(), xmask: new Buf(), xpaint: new Buf(), padwhite: new Buf() }; chunks.set(k, c); }
    return c;
  };
  const seed = Math.abs(Math.round(ox / 512) * 31 + Math.round(oz / 512) * 17) + 11;
  const stats = { flags: 0, stones: 0, pads: 0, cov: null };
  if (WALK) {
    const frame = makeFrameFn(chains, theta, seed), byChunk = new Map();
    for (const T of tris) {
      const cx = (T[0][0] + T[1][0] + T[2][0]) / 3, cz = (T[0][2] + T[1][2] + T[2][2]) / 3, k = chunkKey(cx, cz);
      let l = byChunk.get(k); if (!l) byChunk.set(k, (l = { cx, cz, tris: [] }));
      l.tris.push(T);
    }
    for (const l of byChunk.values()) stats.flags += buildFlags(l.tris, frame, at(l.cx, l.cz).flags, { seed });
  }
  const padSpots = (PADS || KERB || COV) ? padCentres(tile, ox, oz).filter((p) => inZone(p.x, p.z)) : [];
  // the compiled paint as pieces (crosswalk bars, stop lines), once: the crossings' ends get the pads the compiled ground lacks
  const pieces = paintPieces(tile, ox, oz, 'paintW', inZone);
  if (PADS || KERB) { const add = crossingEnds(pieces, field, padSpots).filter((p) => inZone(p.x, p.z)); stats.padsAdded = add.length; padSpots.push(...add); }
  if (KERB) {
    const lawn = lawnChains(tile, ox, oz, field);
    stats.lawn = lawn.length;
    chains.concat(lawn).forEach((c, n) => {
      if (!inZone(c.pts[0][0], c.pts[0][1]) && !inZone(c.pts[c.pts.length - 1][0], c.pts[c.pts.length - 1][1])) return;
      stats.stones += buildKerb(c, (x, z) => at(x, z).kerb, { seed: seed + n, skip: rampSkips(c, padSpots.filter((p) => !p.added)), steel: c.raised === 'sidewalk' && hash2(n * 5 + 1, seed) < 0.2 });
    });
  }
  if (PADS) for (const p of padSpots) { buildPads(p, at(p.x, p.z)[p.kind === 'red' ? 'padred' : 'padiron']); stats.pads++; }
  if (COV) stats.cov = buildCovers({ field, chains, padSpots, tile, ox, oz, getBuf: (x, z, part = 'cov') => at(x, z)[part], seed, inZone, theta });
  // (not on the bus lane: the legends' strokes are bar-sized, and asphalt blotches in red letters read as holes, w2r1_b/b4_mid)
  if (WEAR) stats.wear = buildWear(pieces.filter((p) => !field.has('busred', p.x, p.z)), (x, z) => at(x, z).wear, seed);
  if (WEAR) {
    const mp = [];
    stats.marks = buildMarks(field, tile, ox, oz, (x, z, part) => at(x, z)[part], (x, z) => x >= ox && x < ox + 512 && z >= oz && z < oz + 512, mp);
    if (PADS) for (const p of mp) { buildPads(p, at(p.x, p.z).padwhite); stats.pads++; }
  }
  if (opt.fx36 !== false) { stats.wet = 0; for (const c of chunks.values()) for (const b of Object.values(c)) if (b instanceof Buf) stats.wet += dropWet(b); }
  chunks.stats = stats;
  return chunks;
}

// FX36 (AR34 fixes, QA round 4, 2026-10-02; `?fx36=0` as before): at the Hudson end the compiled sidewalk and kerb faces follow the
// 16 m terrain grid down into the river, and the flags and kerb stones laid on them stepped into the water (sk_flags pieces at
// x ~832-838 reaching y -4.6 where the ground is grass at 2.41). West of WET_X (Manhattan's z < 0 only: Hunters Point is low
// ground) a piece (the triangles that share vertices: a flag, a joint floor triangle, a kerb stone) with any vertex under WET_Y
// is dropped whole; the corridor's walks lie at 2.1-3.6 m there. The shoreline itself is the compiled ground's.
const WET_X = 900, WET_Y = 1.5;
function dropWet(b) {
  const n = b.verts, P = b.p;
  let any = false;
  for (let k = 0; k < n && !any; k++) any = P[k * 3] < WET_X && P[k * 3 + 2] < 0 && P[k * 3 + 1] < WET_Y;
  if (!any) return 0;
  const par = new Int32Array(n);
  for (let k = 0; k < n; k++) par[k] = k;
  const find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  const I = b.i;
  for (let t = 0; t + 2 < I.length; t += 3) for (const o of [1, 2]) { const ra = find(I[t]), rb = find(I[t + o]); if (ra !== rb) par[rb] = ra; }
  const wet = new Uint8Array(n);
  for (let k = 0; k < n; k++) if (P[k * 3] < WET_X && P[k * 3 + 2] < 0 && P[k * 3 + 1] < WET_Y) wet[find(k)] = 1;
  const map = new Int32Array(n).fill(-1), p = [], nn = [], t = [], c = [], al = b.al ? [] : null;
  let m = 0;
  for (let k = 0; k < n; k++) {
    if (wet[find(k)]) continue;
    map[k] = m++;
    p.push(P[k * 3], P[k * 3 + 1], P[k * 3 + 2]); nn.push(b.n[k * 3], b.n[k * 3 + 1], b.n[k * 3 + 2]); t.push(b.t[k * 2], b.t[k * 2 + 1]);
    c.push(b.c[k * 3], b.c[k * 3 + 1], b.c[k * 3 + 2]);
    if (al) al.push(b.al[k]);
  }
  const ii = [];
  let dropped = 0;
  for (let q = 0; q + 2 < I.length; q += 3) {
    const a = map[I[q]], bb = map[I[q + 1]], cc = map[I[q + 2]];
    if (a < 0 || bb < 0 || cc < 0) { dropped++; continue; }
    ii.push(a, bb, cc);
  }
  b.p = p; b.n = nn; b.t = t; b.c = c; b.i = ii; if (al) b.al = al;
  return dropped;
}
