// BRIDGES (AR34): the RFK Bridge's Manhattan approach ramps and the Harlem River Drive's viaduct round Second Avenue and
// 125th-129th St, as smooth alignments with a solved vertical profile, written to client/src/city/rfkData.js.
//
//   node client/tools/ar34/bridges/rfk_data.mjs [--report]
//
// Source: NYC DCP / DoITT CSCL centrelines (client/data/raw/streets_*.geojson; the city's LION base): every segment in the
// east end's box with a level code over 13 at either end (13 = grade, 17 = the first level over it, 21 = the second), its
// roadway width (streetwidth, ft) and travel lanes. The CSCL level codes give which roadway is on structure and which passes
// over which; they carry no heights. Heights:
//   * the lift span's road at y 18.9: 55 ft (16.8 m) over mean high water to the span's low steel closed (Wikipedia, "Robert
//     F. Kennedy Bridge"; the "CLEARANCE 55 FEET ABOVE M.H.W." lettering on the span's fascia), plus the floor system (floor
//     beams 1.8 m and the deck, 0.3 m); the twin's water plane (y 0) is taken as mean high water;
//   * grade (level 13) at the twin's street datum, y 3.4;
//   * between them each roadway's profile is the smoothest one (a graph Laplacian, i.e. constant grades between fixed points)
//     under the constraints the levels imply: a roadway with the higher level code clears the lower one where they cross by
//     6.0 m (4.6 m clear, 15 ft, the NYSDOT minimum over a highway, plus 1.4 m of structure), and a deck clears a grade road
//     the same 6.0 m; then vertical curves: a 60 m moving average along each roadway (a parabola over 60 m at every grade
//     change), its ends pinned.
// Plan: each CSCL polyline resampled at 1 m and smoothed with a Gaussian (sigma 7 m) along its length, the ends pinned, so the
// centre line's curvature is continuous; superelevation from that curvature (40 km/h ramp speed, half the side friction
// demand carried by the cross slope, at most 6 %).
// Not measured: the ramps' real profiles (no survey or DEM of the structures was available here); see docs/notes/ar34-bridges.md.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const LAT0 = 40.7831, LON0 = -73.9712, M_LAT = 111132.0, M_LON = 111320.0 * Math.cos((LAT0 * Math.PI) / 180);
const P = (lon, lat) => [(lon - LON0) * M_LON, -(lat - LAT0) * M_LAT];
const BOX = [3150, -2720, 3760, -1580];
const GROUND = 3.4, DECK = 18.9, CLEAR = 6.0;
// the lift bridge's frame (city/rfkHarlem.js): the span's Manhattan bearing, the axis toward Randall's Island
const O = [3585.85, -1955.45], U = [0.87397, 0.48601];
const sOf = (x, z) => (x - O[0]) * U[0] + (z - O[1]) * U[1];

const segs = [];
for (const fn of [1, 2, 3, 4]) {
  const f = path.join(ROOT, `data/raw/streets_${fn}.geojson`);
  if (!fs.existsSync(f)) continue;
  const J = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const F of J.features) {
    const g = F.geometry; if (!g) continue;
    const lines = g.type === 'MultiLineString' ? g.coordinates : [g.coordinates];
    const pts = lines.flat().map((c) => P(c[0], c[1]));
    if (!pts.some(([x, z]) => x >= BOX[0] && x <= BOX[2] && z >= BOX[1] && z <= BOX[3])) continue;
    const p = F.properties;
    segs.push({ pid: p.physicalid, name: p.full_street_name || '', rw: +p.rw_type, fl: +p.from_level_code, tl: +p.to_level_code,
      w: +p.streetwidth || 0, lanes: +p.number_travel_lanes || 0, dir: p.trafdir, pts });
  }
}
// de-duplicate (the bbox exports overlap)
const seen = new Set();
const all = segs.filter((s) => { const k = s.pid + ':' + s.pts.map((q) => q.map((v) => v.toFixed(1)).join(',')).join(';'); if (seen.has(k)) return false; seen.add(k); return true; });
// the elevated roadways this part draws: a level over grade at either end, not the Willis Avenue Bridge (city/bridgeKit.js),
// the Third Avenue Bridge, paths, nor the Bronx / Randall's Island side, nor the bridge proper (city/rfkHarlem.js)
const EXCL = /WILLIS|3 AVE|3 AV |BIKE|PED|PATH|MAJOR DEEGAN|MDE|BRUCKNER|QUEENS EN|BRONX|RANDALLS|GREENWAY|ROBERT F KENNEDY BRG/;
const elev = all.filter((s) => (s.fl > 13 || s.tl > 13) && !EXCL.test(s.name) && s.pts.every(([x]) => x < 3600) && s.rw !== 6);
// the grade roads (for the clearances)
const grade = all.filter((s) => s.fl === 13 && s.tl === 13 && s.rw !== 6 && !/BIKE|PED|PATH|GREENWAY/.test(s.name));

// ---- graph: a node is a point and its level (CSCL connects two segments only where the node AND the level agree) ----------
const key = (x, z, l) => `${x.toFixed(1)},${z.toFixed(1)},${l}`;
const nodes = new Map();
const node = (x, z, l) => {
  for (const n of nodes.values()) if (n.l === l && Math.hypot(n.x - x, n.z - z) < 3.0) return n;   // CSCL's 1-3 m gaps between some segments
  const k = key(x, z, l); const n = { k, x, z, l, segs: [] }; nodes.set(k, n); return n;
};
for (const s of elev) {
  s.a = node(s.pts[0][0], s.pts[0][1], s.fl); s.b = node(s.pts[s.pts.length - 1][0], s.pts[s.pts.length - 1][1], s.tl);
  s.a.segs.push(s); s.b.segs.push(s);
}
// chains: maximal runs through nodes joining exactly two segments of the same name
const used = new Set(), chains = [];
const other = (s, n) => (s.a === n ? s.b : s.a);
const ordered = (s, from) => (s.a === from ? s.pts.slice() : s.pts.slice().reverse());
for (const s0 of elev) {
  if (used.has(s0)) continue;
  used.add(s0);
  let run = [s0];
  // extend forward from b and backward from a
  for (const dirEnd of ['b', 'a']) {
    let cur = s0, n = s0[dirEnd];
    for (;;) {
      if (n.segs.length !== 2) break;
      const nx = n.segs.find((t) => t !== cur);
      if (!nx || used.has(nx) || nx.name !== cur.name) break;
      used.add(nx);
      if (dirEnd === 'b') run.push(nx); else run.unshift(nx);
      cur = nx; n = other(nx, n);
    }
  }
  // stitch the points in order
  let start = run.length > 1 ? (run[0].a === run[1].a || run[0].a === run[1].b ? run[0].b : run[0].a) : run[0].a;
  const pts = [], lv = [];
  let n = start;
  for (const s of run) {
    const q = ordered(s, n), la = n.l, lb = other(s, n).l;
    const L = q.reduce((acc, p, i) => acc + (i ? Math.hypot(p[0] - q[i - 1][0], p[1] - q[i - 1][1]) : 0), 0);
    let acc = 0;
    q.forEach((p, i) => {
      if (i) acc += Math.hypot(p[0] - q[i - 1][0], p[1] - q[i - 1][1]);
      if (pts.length && i === 0) return;
      pts.push(p); lv.push(i === 0 ? la : i === q.length - 1 ? lb : la + (lb - la) * (acc / (L || 1)));
    });
    n = other(s, n);
  }
  chains.push({ name: run[0].name, w: Math.max(...run.map((s) => s.w)) * 0.3048, lanes: Math.max(...run.map((s) => s.lanes)), pts, lv,
    a: start, b: n, pids: run.map((s) => s.pid) });
}

// ---- plan: resample at 1 m, Gaussian smoothing (sigma 7 m) with the ends pinned, resample at 3 m -------------------------
function resample(pts, step) {
  const out = [pts[0]], cum = [0];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const [x0, z0] = pts[i - 1], [x1, z1] = pts[i], L = Math.hypot(x1 - x0, z1 - z0);
    if (L < 1e-6) continue;
    let t = (Math.ceil(acc / step) * step - acc) / L;
    if (t <= 1e-9) t += step / L;
    for (; t < 1 - 1e-9; t += step / L) out.push([x0 + (x1 - x0) * t, z0 + (z1 - z0) * t]);
    acc += L;
    out.push([x1, z1]);
  }
  // drop near-duplicates
  const o2 = [out[0]];
  for (let i = 1; i < out.length; i++) {
    const far = Math.hypot(out[i][0] - o2[o2.length - 1][0], out[i][1] - o2[o2.length - 1][1]) > step * 0.5;
    if (far) o2.push(out[i]); else if (i === out.length - 1) o2[o2.length - 1] = out[i];   // the end point replaces a near neighbour
  }
  return o2;
}
function smoothPlan(pts, sigma) {
  const q = resample(pts, 1.0), n = q.length, out = [];
  const R = Math.ceil(sigma * 3);
  for (let i = 0; i < n; i++) {
    const r = Math.min(R, i, n - 1 - i);   // a shrinking window pins the ends
    let sx = 0, sz = 0, sw = 0;
    for (let k = -r; k <= r; k++) { const w = Math.exp(-(k * k) / (2 * sigma * sigma)); sx += q[i + k][0] * w; sz += q[i + k][1] * w; sw += w; }
    out.push([sx / sw, sz / sw]);
  }
  return out;
}
for (const c of chains) {
  const sm = smoothPlan(c.pts, 7);
  const q = resample(sm, 3.0);
  // levels along the smoothed line: nearest original vertex's interpolated level
  const lvAt = ([x, z]) => {
    let best = 0, bd = 1e9;
    for (let i = 0; i + 1 < c.pts.length; i++) {
      const [ax, az] = c.pts[i], [bx, bz] = c.pts[i + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)), px = ax + dx * t - x, pz = az + dz * t - z, d = px * px + pz * pz;
      if (d < bd) { bd = d; best = c.lv[i] + (c.lv[i + 1] - c.lv[i]) * t; }
    }
    return best;
  };
  c.q = q; c.ql = q.map(lvAt);
  c.qs = [0]; for (let i = 1; i < q.length; i++) c.qs.push(c.qs[i - 1] + Math.hypot(q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]));
}

// ---- profile -------------------------------------------------------------------------------------------------------------
// unknown heights at every resampled point; shared ends are one unknown; fixed: grade ends (level 13) and the gores at the
// bridge's west end (the chains' ends within 12 m of s -65 on the axis)
const H = new Map();   // node key -> { h, fixed }
const endKey = (n) => n.k;
const isGore = (n) => Math.abs(sOf(n.x, n.z) + 65) < 12 && Math.abs((n.x - O[0]) * -U[1] + (n.z - O[1]) * U[0]) < 25 && n.l >= 21;
for (const c of chains) for (const n of [c.a, c.b]) {
  if (H.has(endKey(n))) continue;
  if (n.l === 13) H.set(endKey(n), { h: GROUND, fixed: true });
  else if (isGore(n)) H.set(endKey(n), { h: DECK, fixed: true });
  else H.set(endKey(n), { h: GROUND + (n.l - 13) * 1.6, fixed: false });
}
for (const c of chains) {
  c.h = c.q.map((_, i) => GROUND + (c.ql[i] - 13) * 1.6);
  c.fix = c.q.map(() => false);
  c.h[0] = H.get(endKey(c.a)).h; c.h[c.h.length - 1] = H.get(endKey(c.b)).h;
  c.fix[0] = c.fix[c.h.length - 1] = true;   // ends: from the node table
}
// crossings in plan: each pair of resampled edges from different chains (or a chain and a grade road) that intersect
function segX(a, b, c, d) {
  const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]], den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [t, u] : null;
}
const cross = [];
for (let i = 0; i < chains.length; i++) {
  const A = chains[i];
  for (let j = i + 1; j < chains.length; j++) {
    const B = chains[j];
    for (let a = 0; a + 1 < A.q.length; a++) for (let b = 0; b + 1 < B.q.length; b++) {
      const r = segX(A.q[a], A.q[a + 1], B.q[b], B.q[b + 1]);
      if (!r) continue;
      const la = A.ql[a] + (A.ql[a + 1] - A.ql[a]) * r[0], lb = B.ql[b] + (B.ql[b + 1] - B.ql[b]) * r[1];
      // shared junction points are not crossings
      const px = A.q[a][0] + (A.q[a + 1][0] - A.q[a][0]) * r[0], pz = A.q[a][1] + (A.q[a + 1][1] - A.q[a][1]) * r[0];
      const nearEnd = [A.a, A.b, B.a, B.b].some((n) => Math.hypot(n.x - px, n.z - pz) < 8 && (n === A.a || n === A.b) && (n === B.a || n === B.b));
      if (nearEnd || Math.abs(la - lb) < 2) continue;
      const up = la > lb ? [A, a, r[0]] : [B, b, r[1]], lo = la > lb ? [B, b, r[1]] : [A, a, r[0]];
      cross.push({ up, lo, x: px, z: pz, grade: false });
    }
  }
  for (const g of grade) for (let a = 0; a + 1 < A.q.length; a++) for (let b = 0; b + 1 < g.pts.length; b++) {
    const r = segX(A.q[a], A.q[a + 1], g.pts[b], g.pts[b + 1]);
    if (!r) continue;
    const la = A.ql[a] + (A.ql[a + 1] - A.ql[a]) * r[0];
    if (la < 15) continue;   // the ramp is still at grade there (its own approach)
    cross.push({ up: [A, a, r[0]], lo: null, x: A.q[a][0], z: A.q[a][1], grade: true, gname: g.name });
  }
}
// the profile: per chain, the heights minimising  sum w_i (h_i - t_i)^2 + lam * sum (h_{i-1} - 2 h_i + h_{i+1})^2  (a smoothing
// spline: grades change gradually, i.e. vertical curves everywhere), the ends fixed (grade, the bridge's gores) or shared with
// the chains they join; t_i the level's height (13: 3.4, 17: 10.0, 21: 16.6; 6.6 m a level: 4.6 m clear + 2.0 m of
// structure) with a weak weight, raised where a crossing's 6.0 m clearance is short
const LVH = (l) => GROUND + (l - 13) * 1.65;
chains.forEach((c, i) => (c.idx = i));
for (const c of chains) { c.t = c.ql.map(() => -1e9); c.wt = c.ql.map(() => 0); }   // targets only where a constraint sets one
const LAM = 1.0;
// a global sparse system: every chain point an unknown, shared ends one unknown, fixed ends eliminated; conjugate gradients
const gid = new Map(); let NU = 0;
const vfix = [], fixedMask = [];
for (const c of chains) {
  c.g = c.h.map((_, i) => {
    if (i === 0 || i === c.h.length - 1) {
      const n = i === 0 ? c.a : c.b, k = 'n:' + endKey(n);
      if (!gid.has(k)) { const rec = H.get(endKey(n)); gid.set(k, NU); vfix[NU] = rec.fixed ? rec.h : 0; fixedMask[NU] = rec.fixed; NU++; }
      return gid.get(k);
    }
    vfix[NU] = 0; fixedMask[NU] = false; return NU++;
  });
}
// a fixed end is met at zero grade: a ghost point beyond it at its height, so the curvature term (h_g - 2 h_0 + h_1)
// reads (h_1 - h_0): the bridge's level deck runs on into the ramp, a ramp lands tangent to the street
// (full strength at the bridge's gores; a tenth at a touchdown, where the CSCL level change often leaves the ramp under 70 m to
// climb its first clearance and a level landing would steepen the rest)
const ghost = (c, end) => { const n = end === 0 ? c.a : c.b; const rec = H.get(endKey(n)); return rec && rec.fixed ? (n.l === 13 ? 0.1 : isGore(n) ? 1 : 0) : 0; };
function applyA(x, y) {
  y.fill(0);
  for (const c of chains) {
    const g = c.g, n = g.length;
    for (let i = 0; i < n; i++) y[g[i]] += c.wt[i] * x[g[i]];
    if (n > 2 && ghost(c, 0)) y[g[1]] += LAM * ghost(c, 0) * x[g[1]];
    if (n > 2 && ghost(c, 1)) y[g[n - 2]] += LAM * ghost(c, 1) * x[g[n - 2]];
    for (let j = 1; j + 1 < n; j++) {
      const d = x[g[j - 1]] - 2 * x[g[j]] + x[g[j + 1]];
      y[g[j - 1]] += LAM * d; y[g[j]] -= 2 * LAM * d; y[g[j + 1]] += LAM * d;
    }
  }
}
function solve() {
  const hc = new Float64Array(NU), b = new Float64Array(NU), t1 = new Float64Array(NU);
  for (let k = 0; k < NU; k++) if (fixedMask[k]) hc[k] = vfix[k];
  for (const c of chains) {
    for (let i = 0; i < c.g.length; i++) b[c.g[i]] += c.wt[i] * c.t[i];
    const n = c.g.length;
    if (n > 2 && ghost(c, 0)) b[c.g[1]] += LAM * ghost(c, 0) * vfix[c.g[0]];
    if (n > 2 && ghost(c, 1)) b[c.g[n - 2]] += LAM * ghost(c, 1) * vfix[c.g[n - 1]];
  }
  applyA(hc, t1);
  for (let k = 0; k < NU; k++) b[k] = fixedMask[k] ? 0 : b[k] - t1[k];
  // CG on the free unknowns (warm start from the current heights)
  const x = new Float64Array(NU);
  for (const c of chains) for (let i = 0; i < c.g.length; i++) if (!fixedMask[c.g[i]]) x[c.g[i]] = c.h[i];
  const r = new Float64Array(NU), pv = new Float64Array(NU), Ap = new Float64Array(NU);
  applyA(x, Ap);
  for (let k = 0; k < NU; k++) r[k] = fixedMask[k] ? 0 : b[k] - Ap[k];
  pv.set(r);
  let rr = r.reduce((a, v) => a + v * v, 0);
  for (let it = 0; it < 20000 && rr > 1e-14; it++) {
    applyA(pv, Ap);
    for (let k = 0; k < NU; k++) if (fixedMask[k]) Ap[k] = 0;
    let pAp = 0; for (let k = 0; k < NU; k++) pAp += pv[k] * Ap[k];
    const al = rr / pAp;
    let rr2 = 0;
    for (let k = 0; k < NU; k++) { x[k] += al * pv[k]; r[k] -= al * Ap[k]; rr2 += r[k] * r[k]; }
    const be = rr2 / rr; rr = rr2;
    for (let k = 0; k < NU; k++) pv[k] = r[k] + be * pv[k];
  }
  for (const c of chains) for (let i = 0; i < c.g.length; i++) c.h[i] = fixedMask[c.g[i]] ? vfix[c.g[i]] : x[c.g[i]];
}
const hAt = ([c, i, t]) => c.h[i] + (c.h[i + 1] - c.h[i]) * t;
solve();
for (let round = 0; round < 8; round++) {
  let bad = 0;
  for (const X of cross) {
    const hu = hAt(X.up), hl = X.lo ? hAt(X.lo) : GROUND;
    if (hu - hl >= CLEAR - 0.05) continue;
    bad++;
    const [c, i] = X.up, need = hl + CLEAR + 0.3;
    for (let k = 0; k < c.h.length; k++) if (Math.abs(c.qs[k] - c.qs[i]) < 12) { c.t[k] = Math.max(c.t[k], need); c.wt[k] = 0.5; }
  }
  // a junction CSCL carries on structure (level 17 or 21) stands at least 5.5 m over the ground: where the solve let one sag
  // under that, it is fixed there (the Harlem River Drive's viaduct meeting the RFK ramp at 129th St had come down to 3.6 m)
  for (const [k, rec] of H) {
    if (rec.fixed) continue;
    const n = nodes.get(k.replace(/^n:/, '')) || [...nodes.values()].find((q) => endKey(q) === k);
    if (!n || n.l < 17) continue;
    const gidk = gid.get('n:' + k);
    const cur = chains.flatMap((c) => [endKey(c.a) === k ? c.h[0] : null, endKey(c.b) === k ? c.h[c.h.length - 1] : null]).find((v) => v !== null);
    if (cur !== undefined && cur < GROUND + 5.5 - 0.05) { bad++; rec.fixed = true; rec.h = GROUND + 5.5; if (gidk !== undefined) { fixedMask[gidk] = true; vfix[gidk] = rec.h; } }
  }
  if (!bad) break;
  solve();
}
// superelevation from the plan's curvature
for (const c of chains) {
  c.e = c.q.map((p, i) => {
    const a = c.q[Math.max(0, i - 2)], b = c.q[Math.min(c.q.length - 1, i + 2)];
    const ax = p[0] - a[0], az = p[1] - a[1], bx = b[0] - p[0], bz = b[1] - p[1];
    const cr = ax * bz - az * bx, la = Math.hypot(ax, az), lb = Math.hypot(bx, bz), lc = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const k = la && lb && lc ? (2 * cr) / (la * lb * lc) : 0;   // signed curvature, 1/m
    return Math.max(-0.06, Math.min(0.06, 0.5 * (11.1 * 11.1 / 9.81) * k));
  });
}

// ---- report and write ----------------------------------------------------------------------------------------------------
const report = process.argv.includes('--report');
let maxG = 0;
for (const c of chains) {
  let g = 0; for (let i = 1; i < c.h.length; i++) g = Math.max(g, Math.abs(c.h[i] - c.h[i - 1]) / (c.qs[i] - c.qs[i - 1]));
  c.maxGrade = g; maxG = Math.max(maxG, g);
  if (report) console.log(`${c.name.padEnd(36)} w ${c.w.toFixed(1)} m lanes ${c.lanes} L ${c.qs[c.qs.length - 1].toFixed(0)} m h ${c.h[0].toFixed(1)}..${Math.max(...c.h).toFixed(1)}..${c.h[c.h.length - 1].toFixed(1)} max grade ${(g * 100).toFixed(1)} % levels ${c.a.l}->${c.b.l} pids ${c.pids.join(',')}`);
}
let worst = Infinity;
for (const X of cross) { const d = hAt(X.up) - (X.lo ? hAt(X.lo) : GROUND); worst = Math.min(worst, d); if (report && d < CLEAR - 0.1) console.log('clearance short', X.x.toFixed(1), X.z.toFixed(1), d.toFixed(2), X.gname || ''); }
console.log(`chains ${chains.length}, crossings ${cross.length}, least clearance (deck to the road under) ${worst.toFixed(2)} m, max grade ${(maxG * 100).toFixed(1)} %`);
const r1 = (v) => Math.round(v * 100) / 100;
const outC = chains.map((c) => ({ n: c.name, w: r1(c.w > 3 ? c.w : 3.66 * Math.max(2, c.lanes) + 1.2), l: c.lanes, a: c.a.l, b: c.b.l,
  p: c.q.flatMap((p, i) => [r1(p[0]), r1(c.h[i]), r1(p[1])]), e: c.e.map((v) => Math.round(v * 1000) / 1000) }));
const head = `// BRIDGES (AR34) data, written by client/tools/ar34/bridges/rfk_data.mjs (do not edit by hand): the RFK Bridge's Manhattan
// approach ramps and the Harlem River Drive's viaduct round 125th-129th St. Plan: NYC CSCL centrelines (the elevated segments of
// the east end, their roadway widths and levels), smoothed; heights: solved from the levels, the lift span's documented 55 ft
// clearance and a 6.0 m clearance over every road crossed (see the tool's header). Each chain: n name, w deck width (m), l lanes,
// a / b the CSCL level codes at its ends, p [x, y, z, ...] every ~3 m (world metres; y the road surface), e superelevation per point.
`;
fs.writeFileSync(path.join(ROOT, 'src/city/rfkData.js'), head + `export const RFK_CHAINS = ${JSON.stringify(outC)};\n`);
console.log('wrote src/city/rfkData.js', outC.length, 'chains', outC.reduce((a, c) => a + c.p.length / 3, 0), 'points');
if (process.argv.includes('--debug')) {
  for (const c of chains) {
    let g = 0, at = 0; for (let i = 1; i < c.h.length; i++) { const v = Math.abs(c.h[i] - c.h[i - 1]) / (c.qs[i] - c.qs[i - 1]); if (v > g) { g = v; at = i; } }
    console.log('steepest', c.name, (g * 100).toFixed(1) + '%', 'at', c.q[at].map((v) => v.toFixed(0)).join(','), 's', c.qs[at].toFixed(0), '/', c.qs[c.qs.length - 1].toFixed(0), 'lvl', c.ql[at].toFixed(1));
  }
  for (const X of cross) console.log('cross', X.grade ? 'grade ' + X.gname : X.lo[0].name, 'under', X.up[0].name, 'at', X.x.toFixed(0), X.z.toFixed(0), 'up s', X.up[0].qs[X.up[1]].toFixed(0), 'lvl', X.up[0].ql[X.up[1]].toFixed(1), 'dh', (hAt(X.up) - (X.lo ? hAt(X.lo) : GROUND)).toFixed(1));
}
