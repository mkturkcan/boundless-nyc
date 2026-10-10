// AR33 sk: geometry helpers for the street surface (docs/notes/ar33-street.md). World x = east, z = south, y up.
// Frames: 125th Street runs along U (ESE); N points south across it. The corridor is the CSCL centreline
// (docs/notes/ar33-corridor.json), chained west to east: station s in metres from Marginal Street, offset b south.

// the corridor centreline (world x, z), a copy of ar33-corridor.json "line" (so the part needs no fetch)
export const LINE = [[852.63, -3961.22], [859.82, -3951.95], [863.56, -3947.48], [867.19, -3942.2], [875.29, -3930.42],
  [901.37, -3892.84], [913.82, -3874.88], [986.65, -3769.12], [1079.23, -3634.59], [1082.5, -3630.03], [1087.7, -3622.8],
  [1093.41, -3614.05], [1095.7, -3610.53], [1127.0, -3563.37], [1182.54, -3479.7], [1187.8, -3471.77], [1190.38, -3467.66],
  [1259.28, -3367.04], [1323.07, -3267.38], [1367.84, -3199.51], [1373.86, -3190.39], [1379.33, -3182.1], [1448.76, -3142.6],
  [1568.42, -3075.42], [1688.6, -3009.58], [1805.25, -2944.55], [1921.23, -2879.87], [1927.9, -2876.16], [1935.74, -2871.79],
  [2047.62, -2809.59], [2162.86, -2745.51], [2167.67, -2742.84], [2174.76, -2738.9], [2306.01, -2665.95], [2438.99, -2592.04],
  [2575.31, -2516.58], [2698.0, -2448.23], [2711.09, -2440.98], [2722.99, -2434.2], [2847.34, -2365.22], [2982.4, -2290.23],
  [3171.19, -2184.9], [3193.31, -2172.97], [3356.07, -2082.53], [3371.37, -2074.03]];
// avenue crossings: station, world x/z (ar33-corridor.json "crossings")
export const CROSS = {
  marginal: [0.0, 852.63, -3961.22], twelfth: [98.6, 909.67, -3880.87], riverside: [105.9, 913.82, -3874.88],
  stclair: [234.3, 986.65, -3769.12], broadway: [412.4, 1087.63, -3622.39], oldbway: [483.3, 1127.0, -3563.37],
  amsterdam: [720.1, 1259.28, -3367.04], morningside: [1020.5, 1448.76, -3142.6], stnicholas: [1157.7, 1568.42, -3075.42],
  fdb: [1294.7, 1688.6, -3009.58], acp: [1569.4, 1928.49, -2875.83], lenox: [1844.3, 2168.81, -2742.2],
  fifth: [2153.5, 2438.99, -2592.04], madison: [2309.3, 2575.31, -2516.58], park: [2464.1, 2710.49, -2441.22],
  lexington: [2620.6, 2847.34, -2365.22], third: [2775.1, 2982.4, -2290.23], second: [2991.2, 3171.19, -2184.9],
  first: [3214.3, 3366.27, -2076.86],
};
const SEG = [];   // [x0, z0, ux, uz, len, s0]
{
  let s = 0;
  for (let i = 1; i < LINE.length; i++) {
    const [x0, z0] = LINE[i - 1], [x1, z1] = LINE[i], L = Math.hypot(x1 - x0, z1 - z0);
    if (L < 1e-6) continue;
    SEG.push([x0, z0, (x1 - x0) / L, (z1 - z0) / L, L, s]);
    s += L;
  }
}
// station and signed offset (south = +) of a world point against the centreline, or null past its ends / 60 m away
export function corridorSB(x, z) {
  let best = null, bd = 60;
  for (const [x0, z0, ux, uz, L, s0] of SEG) {
    const dx = x - x0, dz = z - z0, t = dx * ux + dz * uz;
    if (t < -2 || t > L + 2) continue;
    const b = dx * -uz + dz * ux;   // left normal of (ux, uz) in x-east z-south is (-uz, ux): that points south here
    if (Math.abs(b) < bd) { bd = Math.abs(b); best = [s0 + Math.max(0, Math.min(L, t)), b]; }
  }
  return best;
}

// ---- convex polygon clipping ([[x, z, ...extra], ...]); keep the side where f(p) <= 0
export function clipHalf(poly, f) {
  const out = [], n = poly.length;
  if (!n) return out;
  for (let i = 0; i < n; i++) {
    const P = poly[i], Q = poly[(i + 1) % n], p = f(P), q = f(Q);
    if (p <= 0) out.push(P);
    if ((p < 0 && q > 0) || (p > 0 && q < 0)) {
      const t = p / (p - q), I = new Array(P.length);
      for (let k = 0; k < P.length; k++) I[k] = P[k] + (Q[k] - P[k]) * t;
      out.push(I);
    }
  }
  return out;
}
// polygon ∩ axis-aligned rectangle in a frame: fa(p) -> a, fb(p) -> b (both linear in p)
export function clipRect(poly, fa, fb, a0, a1, b0, b1) {
  let q = clipHalf(poly, (p) => a0 - fa(p));
  q = clipHalf(q, (p) => fa(p) - a1);
  q = clipHalf(q, (p) => b0 - fb(p));
  return clipHalf(q, (p) => fb(p) - b1);
}
export function polyArea(poly, ix = 0, iz = 1) {
  let A = 0;
  for (let i = 0, n = poly.length; i < n; i++) { const P = poly[i], Q = poly[(i + 1) % n]; A += P[ix] * Q[iz] - Q[ix] * P[iz]; }
  return A / 2;
}
// polygon minus rectangle (the four convex pieces round it), in the same frame
export function subtractRect(poly, fa, fb, a0, a1, b0, b1) {
  const out = [];
  const L = clipHalf(poly, (p) => fa(p) - a0); if (L.length > 2) out.push(L);
  const R = clipHalf(poly, (p) => a1 - fa(p)); if (R.length > 2) out.push(R);
  let M = clipHalf(poly, (p) => a0 - fa(p)); M = clipHalf(M, (p) => fa(p) - a1);
  const B = clipHalf(M, (p) => fb(p) - b0); if (B.length > 2) out.push(B);
  const T = clipHalf(M, (p) => b1 - fb(p)); if (T.length > 2) out.push(T);
  return out;
}

// ---- a tile section's triangles as world [x, y, z] triples; and back
export function sectionTris(tile, name, ox, oz) {
  const a = tile.S[name], out = [];
  if (!a) return out;
  for (let o = 0; o + 8 < a.length; o += 9) out.push([[a[o] + ox, a[o + 1], a[o + 2] + oz], [a[o + 3] + ox, a[o + 4], a[o + 5] + oz], [a[o + 6] + ox, a[o + 7], a[o + 8] + oz]]);
  return out;
}
// fan a convex world polygon ([x, y, z]) into tile-local up-facing triangles
export function fanUp(poly, ox, oz, out) {
  for (let i = 1; i + 1 < poly.length; i++) {
    const p = poly[0], q = poly[i], r = poly[i + 1];
    const up = (q[2] - p[2]) * (r[0] - p[0]) - (q[0] - p[0]) * (r[2] - p[2]) > 0;
    const [A, B, C] = up ? [p, q, r] : [p, r, q];
    if (Math.abs((B[0] - A[0]) * (C[2] - A[2]) - (B[2] - A[2]) * (C[0] - A[0])) < 1e-7) continue;
    out.push(A[0] - ox, A[1], A[2] - oz, B[0] - ox, B[1], B[2] - oz, C[0] - ox, C[1], C[2] - oz);
  }
}
// the plane of a world triangle: y(x, z)
export function triPlane(T) {
  const [[x0, y0, z0], [x1, y1, z1], [x2, y2, z2]] = T;
  const d = (z1 - z2) * (x0 - x2) + (x2 - x1) * (z0 - z2);
  if (Math.abs(d) < 1e-9) return () => (y0 + y1 + y2) / 3;
  return (x, z) => {
    const l0 = ((z1 - z2) * (x - x2) + (x2 - x1) * (z - z2)) / d, l1 = ((z2 - z0) * (x - x2) + (x0 - x2) * (z - z2)) / d;
    return l0 * y0 + l1 * y1 + (1 - l0 - l1) * y2;
  };
}

// ---- kerb lines of a tile: the compiled curb faces (matId 2, vertical, two-sided), merged into unique top edges
// { ax, az, bx, bz, len, ux, uz, nx, nz (unit normal into the ROAD), yTop, yBot }
export function tileKerbs(tile, ox, oz, isSidewalk) {
  const a = tile.S.curb, seen = new Set(), out = [];
  if (!a) return out;
  for (let o = 0; o + 8 < a.length; o += 9) {
    const P = [0, 1, 2].map((i) => [a[o + i * 3] + ox, a[o + i * 3 + 1], a[o + i * 3 + 2] + oz]);
    const yMax = Math.max(P[0][1], P[1][1], P[2][1]), yMin = Math.min(P[0][1], P[1][1], P[2][1]);
    if (yMax - yMin < 0.05) continue;
    const top = P.filter((p) => p[1] > yMax - 0.01);
    if (top.length !== 2) continue;
    const [p, q] = top, L = Math.hypot(q[0] - p[0], q[2] - p[2]);
    if (L < 0.05) continue;
    const k1 = `${p[0].toFixed(2)},${p[2].toFixed(2)}`, k2 = `${q[0].toFixed(2)},${q[2].toFixed(2)}`;
    const key = k1 < k2 ? k1 + '|' + k2 : k2 + '|' + k1;
    if (seen.has(key)) continue;
    seen.add(key);
    const ux = (q[0] - p[0]) / L, uz = (q[2] - p[2]) / L;
    let nx = -uz, nz = ux;
    // the side 0.35 m off the midpoint that is NOT sidewalk is the road
    const mx = (p[0] + q[0]) / 2, mz = (p[2] + q[2]) / 2;
    const sA = isSidewalk(mx + nx * 0.35, mz + nz * 0.35), sB = isSidewalk(mx - nx * 0.35, mz - nz * 0.35);
    if (sA && !sB) { nx = -nx; nz = -nz; } else if (sA === sB) continue;   // no sidewalk on either side / both: not a kerb we dress
    out.push({ ax: p[0], az: p[2], bx: q[0], bz: q[2], len: L, ux, uz, nx, nz, yTop: yMax, yBot: yMin });
  }
  return out;
}

// ---- deterministic hash
export function hash2(a, b) {
  let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}
