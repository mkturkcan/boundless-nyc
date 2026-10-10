// AR33 sk: the granite kerb. A kerb chain (skField.kerbChains: points [x, z, yTop, yBot], the road on the left of travel)
// becomes a row of stones, each with its own length (4 to 8 ft), a rounded arris, a 6 mm joint, a tone and sometimes a
// chipped corner; the face stands 12 mm proud of the compiled curb face (which it hides) and the top sits 10 mm over the
// compiled walk, so nothing z-fights. Pure (no three): docs/notes/ar33-street.md.
import { hash2 } from './skGeom.js';
import { chainFrames } from './skField.js';

const W_FACE = 0.012, W_BACK = -0.17, R_ARRIS = 0.022, JOINT = 0.0035;
// profile vertices (index: position, normal, grime factor): face bottom, face 5 cm under the arris, face top, arris 30,
// arris 60, top start, top back, back top (same place, the back face's normal), back bottom
const ARC = [Math.PI / 6, Math.PI / 3].map((t) => [Math.cos(t), Math.sin(t)]);
function profile(T, B, chip, steel) {
  const cw = W_FACE - R_ARRIS, cy = T - R_ARRIS, ym = Math.max(B + 0.01, cy - 0.05);
  const P = [
    [W_FACE, B, 1, 0, 0.7], [W_FACE, ym, 1, 0, 0.93], [W_FACE, cy, 1, 0, 0.95],
    [cw + R_ARRIS * ARC[0][0], cy + R_ARRIS * ARC[0][1], ARC[0][0], ARC[0][1], 1.0],
    [cw + R_ARRIS * ARC[1][0], cy + R_ARRIS * ARC[1][1], ARC[1][0], ARC[1][1], 1.02],
    [cw, T, 0, 1, 1.0], [W_BACK, T, 0, 1, 0.9],
    [W_BACK, T, -1, 0, 0.55], [W_BACK, T - 0.03, -1, 0, 0.5],
  ];
  // a steel-faced kerb: the angle iron over the stone's front edge (the top 5 cm of the face, the arris and the first 4 cm of
  // the top), dark and worn bright at the crown; the face under it stays stone (b3_mid 2026-08: a dark line over a grey face)
  if (steel) { P[2][4] = 0.34; P[3][4] = 0.42; P[4][4] = 0.46; P[5][4] = 0.40; }
  if (chip) for (const k of [2, 3, 4, 5]) { P[k] = P[k].slice(); P[k][1] -= chip.dy * (k === 2 ? 0.7 : 1); P[k][0] -= chip.dw * (k === 2 ? 1 : 0.8); }
  return P;
}
const SEG = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [7, 8]];
const CAP = [0, 1, 2, 3, 4, 5, 6, 8];

// station on a sub-chain: point, mitre normal, scale, top and bottom y at arc length s
function stationAt(F, pts, s, edgeHint) {
  let e = Math.max(0, Math.min(F.U.length - 1, edgeHint));
  while (e + 1 < F.U.length && s > F.S[e + 1] + 1e-9) e++;
  while (e > 0 && s < F.S[e] - 1e-9) e--;
  const t = Math.max(0, Math.min(1, (s - F.S[e]) / Math.max(1e-9, F.S[e + 1] - F.S[e])));
  const A = pts[e], B = pts[e + 1];
  let nx = F.N[e][0], nz = F.N[e][1], sc = 1;
  const atStart = s - F.S[e] < 1e-6, atEnd = F.S[e + 1] - s < 1e-6;
  const nb = atStart && e > 0 ? F.N[e - 1] : atEnd && e + 1 < F.N.length ? F.N[e + 1] : null;
  if (nb) {
    const mx = nx + nb[0], mz = nz + nb[1], L = Math.hypot(mx, mz);
    if (L > 0.3) { const m0 = mx / L, m1 = mz / L; const d = m0 * nx + m1 * nz; sc = 1 / Math.max(0.5, d); nx = m0; nz = m1; }
  }
  return { x: A[0] + (B[0] - A[0]) * t, z: A[1] + (B[1] - A[1]) * t, nx, nz, sc, yTop: A[2] + (B[2] - A[2]) * t, yBot: A[3] + (B[3] - A[3]) * t, e, s };
}

// Corner arcs are compiled as chords 1-2 m long. A Catmull-Rom curve THROUGH the compiled vertices rounds them off and only ever
// bulges toward the road (by L^2 / 8R, 2 cm on a 1 m chord at R 6 m), so the compiled curb face stays hidden behind the stones.
export function smoothArcs(pts) {
  const n = pts.length;
  if (n < 3) return pts;
  const len = (i) => Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  const out = [pts[0]];
  for (let i = 0; i + 1 < n; i++) {
    const p1 = pts[i], p2 = pts[i + 1], p0 = pts[Math.max(0, i - 1)], p3 = pts[Math.min(n - 1, i + 2)], L = len(i);
    // an arc piece: short, and turning (>= 6 degrees) at one end or the other
    const turn = (a, b, c) => { const ux = b[0] - a[0], uz = b[1] - a[1], vx = c[0] - b[0], vz = c[1] - b[1]; return (ux * vx + uz * vz) / ((Math.hypot(ux, uz) * Math.hypot(vx, vz)) || 1); };
    const t0 = i > 0 ? turn(p0, p1, p2) : 1, t1 = i + 2 < n ? turn(p1, p2, p3) : 1;
    const arc = L < 6 && L > 0.25 && (t0 < 0.9945 || t1 < 0.9945);
    if (!arc) { out.push(p2); continue; }
    const k = Math.max(1, Math.ceil(L / 0.4));
    // a Hermite curve through p1 and p2 whose tangents point along p0 -> p2 and p1 -> p3 but are only as long as this edge (a
    // Catmull-Rom tangent swings wildly when the next edge is 20 m long)
    const d1 = Math.hypot(p2[0] - p0[0], p2[1] - p0[1]) || 1, d2 = Math.hypot(p3[0] - p1[0], p3[1] - p1[1]) || 1;
    const m1x = ((p2[0] - p0[0]) / d1) * L, m1z = ((p2[1] - p0[1]) / d1) * L, m2x = ((p3[0] - p1[0]) / d2) * L, m2z = ((p3[1] - p1[1]) / d2) * L;
    for (let j = 1; j <= k; j++) {
      const t = j / k, t2 = t * t, t3 = t2 * t, h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
      if (j === k) out.push(p2);
      else out.push([h00 * p1[0] + h10 * m1x + h01 * p2[0] + h11 * m2x, h00 * p1[1] + h10 * m1z + h01 * p2[1] + h11 * m2z, p1[2] + (p2[2] - p1[2]) * t, p1[3] + (p2[3] - p1[3]) * t]);
    }
  }
  return out;
}

// chain: { pts }, opt: { seed, skip: [[s0, s1], ...] (arc lengths of the whole chain), lift (0.0105), tone }
export function buildKerb(chain, getBuf, opt = {}) {
  const pts = opt.smooth === false ? chain.pts : smoothArcs(chain.pts);
  if (pts.length < 2) return 0;
  const lift = opt.lift ?? 0.0105, seed = opt.seed || 5, tone0 = opt.tone ?? 1.0;
  const Fall = chainFrames(pts);
  // split at corners sharper than 40 degrees
  const cuts = [0];
  for (let i = 1; i < Fall.U.length; i++) { const d = Fall.U[i - 1][0] * Fall.U[i][0] + Fall.U[i - 1][1] * Fall.U[i][1]; if (d < 0.766) cuts.push(i); }
  cuts.push(pts.length - 1);
  // the stretches between the skipped intervals
  const skip = (opt.skip || []).slice().sort((a, b) => a[0] - b[0]);
  let nStones = 0;
  for (let c = 0; c + 1 < cuts.length; c++) {
    const i0 = cuts[c], i1 = cuts[c + 1];
    const sub = pts.slice(i0, i1 + 1);
    if (sub.length < 2) continue;
    const F = chainFrames(sub), base = Fall.S[i0];
    // free intervals of this sub-chain (local arc length)
    let free = [[0, F.L]];
    for (const [k0, k1] of skip) {
      const a = k0 - base, b = k1 - base, nf = [];
      for (const [f0, f1] of free) {
        if (b <= f0 || a >= f1) nf.push([f0, f1]);
        else { if (a > f0 + 0.05) nf.push([f0, a]); if (b < f1 - 0.05) nf.push([b, f1]); }
      }
      free = nf;
    }
    for (const [f0, f1] of free) {
      // stones of 4-8 ft, laid out along the free interval
      let s = f0, k = 0, hint = 0;
      while (s < f1 - 0.02) {
        const hh = hash2(Math.round((sub[0][0] + s) * 37) + seed, Math.round((sub[0][1] + s) * 41) + k);
        let len = 1.25 + hh * 1.25;
        if (f1 - (s + len) < 0.6) len = f1 - s;   // no sliver stone at the end
        const a = s + (s > f0 ? JOINT : 0), b = Math.min(f1, s + len) - (s + len < f1 - 0.01 ? JOINT : 0);
        if (b - a > 0.05) { nStones += stone(F, sub, a, b, getBuf, { lift, hh, k, tone0, seed, steel: !!opt.steel }); }
        s += len; k++;
      }
    }
  }
  return nStones;
}

function stone(F, sub, s0, s1, getBuf, o) {
  const hh = o.hh, tone = o.tone0 * (0.86 + 0.22 * hash2(Math.round(hh * 1e6) + o.k, o.seed));
  // stations: the two ends and every chain vertex strictly inside
  const st = [];
  let hint = 0;
  st.push(stationAt(F, sub, s0, hint));
  for (let i = 1; i < sub.length - 1; i++) if (F.S[i] > s0 + 1e-6 && F.S[i] < s1 - 1e-6) st.push(stationAt(F, sub, F.S[i], i - 1));
  st.push(stationAt(F, sub, s1, sub.length - 2));
  // a chipped corner on one end of about one stone in five
  const chipEnd = hh < 0.11 ? 0 : hh < 0.22 ? st.length - 1 : -1;
  const chip = { dy: 0.008 + 0.014 * hash2(o.k * 3, Math.round(hh * 1e5)), dw: 0.006 + 0.012 * hash2(o.k * 5, Math.round(hh * 1e5) + 1) };
  const buf = getBuf(st[0].x + (st[st.length - 1].x - st[0].x) / 2, st[0].z + (st[st.length - 1].z - st[0].z) / 2);
  const rings = [];
  const uo = hash2(o.k * 11, Math.round(hh * 1e5) + 9) * 3;
  for (let q = 0; q < st.length; q++) {
    const S = st[q], T = S.yTop + o.lift, B = S.yBot - 0.02;
    const P = profile(T, B, q === chipEnd ? chip : null, o.steel);
    const ids = [];
    let v = 0;
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      if (i > 0 && !(i === 7)) v += Math.hypot(p[0] - P[i - 1][0], p[1] - P[i - 1][1]);
      const w = p[0] * S.sc;
      // the normal rotates with the profile: (nw, ny) -> world (nx * nw, ny, nz * nw)
      ids.push(buf.v(S.x + S.nx * w, p[1], S.z + S.nz * w, S.nx * p[2], p[3], S.nz * p[2], S.s + uo, v + 0.3, tone * p[4], tone * p[4] * 0.995, tone * p[4] * 0.985));
    }
    rings.push(ids);
  }
  for (let q = 0; q + 1 < rings.length; q++) for (const [a, b] of SEG) buf.quad(rings[q][a], rings[q + 1][a], rings[q + 1][b], rings[q][b]);
  // end caps (dark joint filler): fan of the profile polygon, wound to face along the chain
  for (const [q, dir] of [[0, -1], [rings.length - 1, 1]]) {
    const S = st[q], ids = CAP.map((i) => {
      const P = buf.p, k = rings[q][i] * 3;
      return buf.v(P[k], P[k + 1], P[k + 2], -S.nz * 0 + (F.U[Math.min(S.e, F.U.length - 1)][0]) * dir, 0, F.U[Math.min(S.e, F.U.length - 1)][1] * dir, 0, 0, 0.16, 0.155, 0.15);
    });
    // orient: the polygon's (Newell) normal must agree with dir * tangent
    const U = F.U[Math.min(S.e, F.U.length - 1)], P = buf.p;
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < ids.length; i++) {
      const p = ids[i] * 3, q = ids[(i + 1) % ids.length] * 3;
      nx += (P[p + 1] - P[q + 1]) * (P[p + 2] + P[q + 2]); ny += (P[p + 2] - P[q + 2]) * (P[p] + P[q]); nz += (P[p] - P[q]) * (P[p + 1] + P[q + 1]);
    }
    const d = nx * U[0] * dir + nz * U[1] * dir;
    if (d >= 0) buf.fan(ids); else buf.fan(ids.slice().reverse());
  }
  return 1;
}
