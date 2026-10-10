// CP33 Vista Rock's surface (city/cpCastle.js hands it the rock's macro field; docs/notes/central-park-photoreal.md, castle).
// The macro field (the benches, the terraces' footprints, the ridge along the pond's west shore, the shore sunk to the water)
// is a smooth height field; a heightfield cliff reads as a smooth heap, so the fracture is put back on it here, in three
// planes at once (triplanar, as the schist shader samples its scan): bedding (bands of different hardness, ridges and
// grooves along the strike), jointing (Voronoi blocks, thin across the bedding and long along it, with open V-grooves of 8-35 cm,
// each block a little higher or lower and tilted), lumps and chips; displaced vertically on a 0.22 m lattice laid only over
// the cells that have rock (a 1 m pre-pass finds them). The vertices carry what cpRocksKit.js's schist shader wants: their
// cavity (moss, soil, AO), their height over the ground (the soil and litter at the foot) and the joints' mask.
import * as THREE from 'three';

const fr = (v) => v - Math.floor(v);
const hh = (i, j) => fr(Math.sin(i * 127.1 + j * 311.7) * 43758.5453);
function vn(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), u = x - xi, v = z - zi, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
  return (hh(xi, zi) * (1 - su) + hh(xi + 1, zi) * su) * (1 - sv) + (hh(xi, zi + 1) * (1 - su) + hh(xi + 1, zi + 1) * su) * sv;
}
const sst = (a, b, t) => { const u = Math.min(1, Math.max(0, (t - a) / (b - a))); return u * u * (3 - 2 * u); };

// Voronoi cells on a jittered unit grid: the distance to the cell's nearest border (cell units), the second nearest, the
// cell's id, the offset from its site and a hash of the cell PAIR across each of the two nearest borders (cpRocks.js cell2)
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
  let e = 1e9, k2 = k1, f = 1e9, k3 = k1;
  for (let k = 0; k < 9; k++) {
    if (k === k1) continue;
    const mx = (_sx[k] + s1x) / 2, mz = (_sz[k] + s1z) / 2, nx = _sx[k] - s1x, nz = _sz[k] - s1z, nl = Math.hypot(nx, nz) || 1;
    const dist = ((mx - px) * nx + (mz - pz) * nz) / nl;
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

// One plane's displacement (metres, signed, + outward) at the plane coordinates (f, g): f across the bedding, g along it; s the
// rock's seed, K the gain (the cliff takes more than a whaleback), st the lattice step (the grooves are widened to it)
let _J = 0;
function planeD(f, g, s, K, st) {
  _J = 0;
  // bedding: bands of different hardness weather into ridges and grooves along the strike, broken and folded
  const u = f + (vn(g * 0.05 + s, f * 0.03) - 0.5) * 2.6 + (vn(g * 0.15 + 3, f * 0.1 + s) - 0.5) * 0.8;
  const env = 0.35 + 0.9 * vn(u * 0.22 + s, g * 0.045);
  let d = ((vn(u * 2.3 + s, g * 0.3) - 0.5) * 0.2 + (vn(u * 6.1 + 3.7, g * 0.8 + s) - 0.5) * 0.07 + (vn(u * 16 + 9, g * 2.1 + s * 2) - 0.5) * 0.024) * env * K;
  // jointing
  const cw = 2.1 + 1.2 * hh(s, 7.7);   // (CP34: bigger blocks, the schist's slabs)
  const wu = f + (vn(g * 0.31 + s * 3, f * 0.29 - s) - 0.5) * 1.5, wv = g + (vn(g * 0.27 - s, f * 0.33 + s * 2) - 0.5) * 2.4;
  const c = cell2(wu / (cw * 0.62) + s, wv / (cw * 1.7));
  const eM = c.e * cw * 0.62;
  const rag = 0.55 + 0.9 * vn(g * 2.4 + s, f * 2.4);
  let gd = 0, gj = 0;
  for (let q = 0; q < 2; q++) {
    const pr = q ? c.pair2 : c.pair, e = (q ? c.e2 : c.e) * cw * 0.62, op = sst(0.45, 0.8, pr);   // (CP34: 0.25-0.65, fewer open joints)
    const wd = Math.max(0.95 * st, (0.07 + 0.2 * hh(pr * 91.7, 3.3)) * (0.5 + 0.5 * op) * rag);
    const dp = (0.05 + 0.3 * hh(pr * 53.1, 9.1)) * (0.2 + 0.8 * op) * rag * K;
    const gq = 1 - sst(0, wd, e);
    gd = Math.max(gd, dp * gq * gq + dp * 0.15 * (1 - sst(wd, wd * 3, e)));
    gj = Math.max(gj, gq * (0.35 + 0.65 * op));
  }
  const hc = (hh(c.ax * 3.1 + s * 0.3, c.az * 5.7 + 1.0) - 0.5) * 0.1 * K;
  const gx = (hh(c.ax * 1.7, c.az * 2.3 + s) - 0.5) * 0.08, gz = (hh(c.ax * 4.1 + 2, c.az * 0.7 + s) - 0.5) * 0.08;
  // (CP34: sharper arrises, flatter faces: a block reads as a cleft slab, not a pillow)
  const bev = sst(0, 0.1 + 0.08 * hh(c.ax, c.az), eM);
  d += (hc + gx * c.px * cw * 0.62 + gz * c.pz * cw * 1.7) * bev - gd;
  _J = gj;
  // lumps of 4-12 cm at 0.3-1 m and chips
  d += (vn(f * 1.5 + s, g * 1.5 - s) - 0.5) * 0.035 * K + (vn(f * 4.1, g * 4.1 + s) - 0.5) * 0.026 * K;
  return d;
}

// the three planes blended by the macro normal's weights; the top plane runs with the strike (N30E), the walls with the
// bedding (f = y). Returns the displacement; `joint` is set to the joints' mask.
let joint = 0;
function detailAt(x, y, z, n, s, K, st) {
  let wx = Math.pow(Math.abs(n[0]), 3.5), wy = Math.pow(Math.abs(n[1]), 3.5), wz = Math.pow(Math.abs(n[2]), 3.5);
  const ws = wx + wy + wz || 1;
  wx /= ws; wy /= ws; wz /= ws;
  let d = 0, j = 0;
  if (wy > 0.02) { d += wy * planeD(x * 0.866 + z * 0.5, -x * 0.5 + z * 0.866, s, K, st); j = Math.max(j, _J * wy); }
  if (wx > 0.02) { d += wx * planeD(y * 0.92 + z * 0.12, z, s + 5.3, K, st); j = Math.max(j, _J * wx); }
  if (wz > 0.02) { d += wz * planeD(y * 0.92 + x * 0.12, x, s + 11.9, K, st); j = Math.max(j, _J * wz); }
  joint = Math.min(1, j * 1.2);
  return d;
}

// The rock's mesh: ctx = { field(u, w) -> macro y, ground(u, w) -> the lawn's y, toW(u, w) -> [x, z], U0, U1, W0, W1 (the frame
// box), flat(u, w) -> 0..1 how much of a terrace's footprint is here (no detail), seed, cell }
export function buildVistaRock(ctx) {
  const { field, ground, toW, U0, U1, W0, W1, flat } = ctx, cell = ctx.cell || 0.22, seed = ctx.seed || 4.7, K = ctx.K || 1.5;
  const [AX, AZ] = ctx.rot;   // the frame's axes in the world: (u, w) -> x = AX u - AZ w, z = AZ u + AX w
  const toWn = (a, b, c) => [AX * a - AZ * c, b, AZ * a + AX * c];
  const nu = Math.ceil((U1 - U0) / cell), nw = Math.ceil((W1 - W0) / cell), N1 = nu + 1;
  // the 1 m pre-pass: which 1 m blocks have rock (a corner of the block over the ground - 0.8 m)
  const B1 = 1.0, mu = Math.ceil((U1 - U0) / B1), mw = Math.ceil((W1 - W0) / B1), M1 = mu + 1;
  const live1 = new Uint8Array(mu * mw), H1 = new Float32Array(M1 * (mw + 1));
  for (let j = 0; j <= mw; j++) for (let i = 0; i <= mu; i++) { const u = U0 + i * B1, w = W0 + j * B1; H1[j * M1 + i] = field(u, w) - ground(u, w); }
  for (let j = 0; j < mw; j++) for (let i = 0; i < mu; i++) {
    const m = Math.max(H1[j * M1 + i], H1[j * M1 + i + 1], H1[(j + 1) * M1 + i], H1[(j + 1) * M1 + i + 1]);
    if (m > -0.8) live1[j * mu + i] = 1;
  }
  const liveCell = (i, j) => {
    const bi = Math.min(mu - 1, Math.floor((i * cell) / B1)), bj = Math.min(mw - 1, Math.floor((j * cell) / B1));
    return live1[bj * mu + bi] === 1;
  };
  // macro heights memoised
  const Ym = new Float32Array(N1 * (nw + 1)).fill(NaN), Gm = new Float32Array(N1 * (nw + 1)).fill(NaN);
  const YM = (i, j) => {
    i = Math.max(0, Math.min(nu, i)); j = Math.max(0, Math.min(nw, j));
    const k = j * N1 + i;
    if (Ym[k] !== Ym[k]) { const u = U0 + i * cell, w = W0 + j * cell; Ym[k] = field(u, w); Gm[k] = ground(u, w); }
    return Ym[k];
  };
  const GM = (i, j) => { YM(i, j); return Gm[Math.max(0, Math.min(nw, j)) * N1 + Math.max(0, Math.min(nu, i))]; };
  // the vertices of the live cells
  const vid = new Int32Array(N1 * (nw + 1)).fill(-1);
  const P = [], Yf = [], Hg = [], Jm = [], IJ = [];
  const need = (i, j) => {
    const k = j * N1 + i;
    if (vid[k] >= 0) return vid[k];
    const u = U0 + i * cell, w = W0 + j * cell, [x, z] = toW(u, w);
    const ym = YM(i, j), g = GM(i, j), h = ym - g;
    let y = ym, jn = 0;
    const fl = flat(u, w);
    if (h > -0.5 && fl < 0.999) {
      const nm = ((a, c) => { const l = Math.hypot(a, 1, c); return toWn(a / l, 1 / l, c / l); })(-(YM(i + 1, j) - YM(i - 1, j)) / (2 * cell), -(YM(i, j + 1) - YM(i, j - 1)) / (2 * cell));
      const e = sst(-0.1, 1.2, h) * (1 - fl);
      if (e > 0) { const d = detailAt(x, ym, z, nm, seed, K, cell); y = ym + d * e; jn = joint * e; }
    }
    vid[k] = P.length / 3;
    P.push(x, y, z); Yf.push(y); Hg.push(y - g); Jm.push(jn); IJ.push(i, j);
    return vid[k];
  };
  const I = [];
  for (let j = 0; j < nw; j++) for (let i = 0; i < nu; i++) {
    if (!liveCell(i, j)) continue;
    // fully under the ground (all four corners 0.3 m under): no triangle
    const hs = [YM(i, j) - GM(i, j), YM(i + 1, j) - GM(i + 1, j), YM(i, j + 1) - GM(i, j + 1), YM(i + 1, j + 1) - GM(i + 1, j + 1)];
    if (Math.max(...hs) < -0.3) continue;
    const a = need(i, j), b = need(i + 1, j), c = need(i, j + 1), d = need(i + 1, j + 1);
    // the diagonal along the smaller height difference
    if (Math.abs(Yf[a] - Yf[d]) <= Math.abs(Yf[b] - Yf[c])) I.push(a, c, d, a, d, b); else I.push(a, c, b, b, c, d);
  }
  const nv = P.length / 3;
  // normals from the displaced lattice's central differences (the neighbours that exist), the cavity from a 3-cell ring
  const at = (i, j, fb) => { if (i < 0 || j < 0 || i > nu || j > nw) return fb; const v = vid[j * N1 + i]; return v >= 0 ? Yf[v] : fb; };
  const N = new Float32Array(nv * 3), A = new Float32Array(nv * 3), D = new Float32Array(nv);
  for (let v = 0; v < nv; v++) {
    const i = IJ[v * 2], j = IJ[v * 2 + 1], y0 = Yf[v];
    const gx = (at(i + 1, j, y0) - at(i - 1, j, y0)) / (2 * cell), gz = (at(i, j + 1, y0) - at(i, j - 1, y0)) / (2 * cell), l = Math.hypot(gx, 1, gz);
    { const nw3 = toWn(-gx / l, 1 / l, -gz / l); N[v * 3] = nw3[0]; N[v * 3 + 1] = nw3[1]; N[v * 3 + 2] = nw3[2]; }
    const m = (at(i - 3, j, y0) + at(i + 3, j, y0) + at(i, j - 3, y0) + at(i, j + 3, y0) + at(i - 2, j - 2, y0) + at(i + 2, j - 2, y0) + at(i - 2, j + 2, y0) + at(i + 2, j + 2, y0)) / 8;
    const cav = Math.max(0, Math.min(1, (m - y0) / 0.28));
    A[v * 3] = Math.min(1, Math.max(cav, Jm[v] * 0.85)); A[v * 3 + 1] = Hg[v]; A[v * 3 + 2] = Jm[v];
    D[v] = 9;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  geo.setAttribute('aRk', new THREE.BufferAttribute(A, 3));
  geo.setAttribute('aRd', new THREE.BufferAttribute(D, 1));
  geo.setIndex(nv > 65535 ? new THREE.Uint32BufferAttribute(I, 1) : new THREE.Uint16BufferAttribute(I, 1));
  geo.computeBoundingSphere();
  geo.userData.tris = I.length / 3;
  // the displaced surface at frame (u, w): bilinear on the lattice (NaN where the cell has no rock)
  geo.userData.surface = (u, w) => {
    const fi = (u - U0) / cell, fj = (w - W0) / cell, i = Math.floor(fi), j = Math.floor(fj);
    if (i < 0 || j < 0 || i >= nu || j >= nw) return NaN;
    const a0 = vid[j * N1 + i], b0 = vid[j * N1 + i + 1], c0 = vid[(j + 1) * N1 + i], d0 = vid[(j + 1) * N1 + i + 1];
    if (a0 < 0 || b0 < 0 || c0 < 0 || d0 < 0) return NaN;
    const tx = fi - i, tz = fj - j;
    return (Yf[a0] * (1 - tx) + Yf[b0] * tx) * (1 - tz) + (Yf[c0] * (1 - tx) + Yf[d0] * tx) * tz;
  };
  return geo;
}
