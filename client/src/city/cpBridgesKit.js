// CPB33 bridges kit (city/cpBridges.js builds with it): the park's bridges and arches modelled stone by stone (owner
// 2026-09-30 22:15: "stones, parts of bridges, and the castle area look really low poly"). What is here:
//   * the materials: rock-faced Manhattan schist (Poly Haven's lichen_rock scan, CC0, triplanar in world space: albedo
//     as a ratio to its mean over the stone's own tone, the scan's normals, roughness and occlusion), dressed granite (the
//     city's cgranite set), painted cast iron, weathered timber boards (Poly Haven's weathered_planks, CC0);
//   * MB, an indexed mesh bin in a structure's frame: every patch it takes is one smooth surface (its normals averaged
//     over its own vertices), so a stone is rounded where it is rounded and stones are separate;
//   * stone(): one rock-faced stone on a surface (a planar face, a barrel's soffit, an arch ring): its outline conformed
//     to curved boundaries (an arch's extrados, a sloping deck), a rounded arris falling into a recessed joint, a pitched
//     face (two octaves of noise, a dome, a tilt out of the wall's plane), cavity occlusion baked into its colour;
//   * wall(): coursed rubble between two boundary curves (courses 0.22-0.5 m, stones 0.3-1.0 m, staggered, each its own
//     tone), backing(): the recessed mortar behind them;
//   * rbox(): a rounded block (coping slabs, piers, quoins, posts), sweep(): a moulding swept along a path.
// Frames as in cpLandmarksKit.js: world(u, y, w) = (x0 + ax u - az w, y0 + y, z0 + az u + ax w).
import * as THREE from 'three';
import { ENV, applyLightTrim, applyCityAO, applyStoneDetail } from '../world/materials.js';

// ---- noise and a seeded random stream --------------------------------------------------------------------------------
const HT = new Float32Array(65536); { let q = 12345; for (let i = 0; i < 65536; i++) { q = (Math.imul(q, 1664525) + 1013904223) >>> 0; HT[i] = (q >>> 8) / 16777216; } }   // a lattice of random values (a table: 6 times quicker than a sine hash)
const h2 = (x, y) => HT[(x & 255) | ((y & 255) << 8)];
const vn = (x, y) => { const i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j, a = h2(i, j), b = h2(i + 1, j), c = h2(i, j + 1), d = h2(i + 1, j + 1), su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v); return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv; };
export const fbm = (x, y) => vn(x, y) * 0.5 + vn(x * 2.13 + 3.1, y * 2.13 + 1.7) * 0.3 + vn(x * 4.7 + 7.3, y * 4.7 + 5.9) * 0.2;   // 0..1
let _s = 1;
export const seed = (s) => { _s = 1 + Math.abs(Math.floor(s * 7919)) % 2147483640; };
export const rnd = () => { _s = (_s * 16807) % 2147483647; return (_s - 1) / 2147483646; };
export const lin = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
export const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
export const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---- the mesh bin ----------------------------------------------------------------------------------------------------
export class MB {
  constructor(f, uv = false) { this.P = []; this.C = []; this.T = uv ? [] : null; this.I = []; this.f = f; }
  v(u, y, w, c, t) {
    const f = this.f;
    this.P.push(f.x0 + f.ax * u - f.az * w, f.y0 + y, f.z0 + f.az * u + f.ax * w);
    this.C.push(c[0], c[1], c[2]);
    if (this.T) this.T.push(t ? t[0] : 0, t ? t[1] : 0);
    return this.P.length / 3 - 1;
  }
  // (ni + 1) x (nj + 1) vertices from fn(i, j) -> { p: [u, y, w], c: [r, g, b], t?: [s, t] }, one smooth patch
  grid(ni, nj, fn) {
    const b = this.P.length / 3;
    for (let j = 0; j <= nj; j++) for (let i = 0; i <= ni; i++) { const q = fn(i, j); this.v(q.p[0], q.p[1], q.p[2], q.c, q.t); }
    for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) { const a = b + j * (ni + 1) + i, c = a + ni + 2; this.I.push(a, a + 1, c, a, c, a + ni + 1); }
    return this;
  }
  get tris() { return this.I.length / 3; }
  geometry() {
    if (!this.I.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.P), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.C), 3));
    if (this.T) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(this.T), 2));
    g.setIndex(new THREE.BufferAttribute(this.P.length / 3 > 65535 ? new Uint32Array(this.I) : new Uint16Array(this.I), 1));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
  mesh(mat, name, cast = true) {
    const g = this.geometry(); if (!g) return null;
    const m = new THREE.Mesh(g, mat); m.name = name; m.castShadow = cast; m.receiveShadow = true;
    return m;
  }
}

// ---- one stone ---------------------------------------------------------------------------------------------------------
// map(s, t, z) -> [u, y, w]: the surface the stone lies on (s along, t up or across, z out of it); the stone covers
// s0..s1 and tb(s)..tt(s); its face stands o.depth over the mortar plane (z 0), its rim dips 1.2 cm into the mortar
const FR = { L: [0, 0.03, 0.1, 0.22, 0.36, 0.5, 0.64, 0.78, 0.9, 0.97, 1], M: [0, 0.045, 0.15, 0.32, 0.5, 0.68, 0.85, 0.955, 1], S: [0, 0.08, 0.27, 0.5, 0.73, 0.92, 1], T: [0, 0.2, 0.5, 0.8, 1] };
const frOf = (L) => (L > 0.62 ? FR.L : L > 0.32 ? FR.M : L > 0.16 ? FR.S : FR.T);
// the grid fractions by absolute distance: a tight band at each edge (the arris, the drafted margin), then even steps of `step`
function frAbs(L, step, m0, ne = 5) {
  const e = ne > 3 ? [0, m0 * 0.3, m0 * 0.65, m0, m0 + 0.012] : [0, m0 * 0.45, m0 + 0.008], e4 = e[e.length - 1];
  if (L < 2 * e4 + step * 0.9) return null;
  const mid = L - 2 * e4, n = Math.max(1, Math.round(mid / step)), a = e.slice();
  for (let k = 1; k < n; k++) a.push(e4 + mid * k / n);
  for (let k = e.length - 1; k >= 0; k--) a.push(L - e[k]);
  return a.map((v) => v / L);
}
// o: depth (m, the boss over the mortar), rough, dome, rim (the rounded arris), tilt, freq, ao0, toneVar, weather(col, q, z, p),
// and the rock-face options: draft (m, a chisel-drafted margin lower than the boss), step (m, an even grid of that pitch),
// facets (n tilted planes, joined smoothly: the cleft face), crag (m, their relief), wobble (m, the outline wandering inward)
export function stone(B, map, s0, s1, tb, tt, o) {
  const tbf = typeof tb === 'function' ? tb : () => tb, ttf = typeof tt === 'function' ? tt : () => tt;
  const L = s1 - s0, sm = (s0 + s1) / 2, Hm = ttf(sm) - tbf(sm);
  if (L < 0.04 || Hm < 0.03) return 0;
  const rs = o.res ?? 1, dr = o.draft ?? 0, stp = (o.step ?? 0) / rs;
  let fs = null, ft = null;
  if (stp > 0) { fs = frAbs(L, stp, dr || 0.022, dr ? 5 : 3); ft = frAbs(Hm, stp, dr || 0.022, dr ? 5 : 3); }
  fs = fs || frOf(L * rs); ft = ft || frOf(Hm * rs);                      // res < 1: a coarser grid (soffits, hidden faces)
  const rim0 = Math.min(o.rim ?? 0.035, 0.32 * Math.min(L, Hm)), dep = o.depth ?? 0.04, rough = o.rough ?? 0.022, dome = o.dome ?? 0.02;
  const sd = rnd() * 977, tiltS = (rnd() - 0.5) * 2 * (o.tilt ?? 0.025), tiltT = (rnd() - 0.5) * 2 * (o.tilt ?? 0.025), fq = o.freq ?? 5.5;
  const ao0 = o.ao0 ?? 0.42, c = o.col, tone = 1 + (rnd() - 0.5) * (o.toneVar ?? 0.0);
  const nf = o.facets ?? 0, crag = o.crag ?? 0, fa = [], fb = [], fc = [], wob = o.wobble ?? 0, zm = Math.min(0.012, dep * 0.3);
  for (let k = 0; k < nf; k++) { fa.push((rnd() - 0.5) * 1.7); fb.push((rnd() - 0.5) * 1.7); fc.push((rnd() - 0.5) * 1.1); }
  const facet = (ds, dt) => { let a = 0; for (let k = 0; k < nf; k++) a += Math.exp(6 * (fa[k] * ds + fb[k] * dt + fc[k])); return Math.log(a / nf) / 6; };
  B.grid(fs.length - 1, ft.length - 1, (i, j) => {
    let s = s0 + L * fs[i];
    if (wob && (i === 0 || i === fs.length - 1)) { const b0 = tbf(s); s += (i === 0 ? 1 : -1) * wob * vn((b0 + Math.max(0.02, ttf(s) - b0) * ft[j]) * 11 + sd, sd * 0.3 + (i ? 5.1 : 0)); }
    const b = tbf(s), t1 = ttf(s), H = Math.max(0.02, t1 - b);
    let t = b + H * ft[j];
    if (wob && (j === 0 || j === ft.length - 1)) t += (j === 0 ? 1 : -1) * wob * vn(s * 11 + sd, sd * 0.2 + (j ? 4.3 : 0));
    const tm = (b + t1) / 2;
    const d = Math.min(s - s0, s1 - s, t - b, t1 - t);
    const rim = rim0 * (0.7 + 0.6 * vn(s * 9 + sd, t * 9 - sd));
    const e = Math.min(1, d / Math.max(1e-4, rim)), p = Math.sqrt(Math.max(0, 1 - (1 - e) * (1 - e)));
    const n = fbm(s * fq + sd, t * fq + sd * 1.7) - 0.5, n2 = fbm(s * fq * 3.3 + 11.1, t * fq * 3.3 + sd) - 0.5;
    const ds = (s - sm) / (L / 2), dt = (t - tm) / (H / 2);
    let boss = dep + dome * Math.max(0, 1 - 0.5 * (ds * ds + dt * dt)) + rough * (n + 0.4 * n2) + tiltS * (s - sm) + tiltT * (t - tm);
    if (nf) boss += crag * facet(Math.max(-1.2, Math.min(1.2, ds)), Math.max(-1.2, Math.min(1.2, dt)));
    const dm = dr > 0 ? sstep(dr, dr + 0.02, d) : 1;                        // 0 on the chisel-drafted margin, 1 on the boss
    const zz = zm + dm * Math.max(0.004 - zm, boss - zm);
    const z = -0.012 + p * zz;
    const q = map(s, t, z);
    const k = (ao0 + (1 - ao0) * Math.pow(p, 0.6)) * tone * (1 + 0.16 * n) * (dr > 0 ? 0.84 + 0.16 * dm : 1);
    let col = [c[0] * k, c[1] * k, c[2] * k];
    if (o.weather) col = o.weather(col, q, z, p);
    return { p: q, c: col };
  });
  return 1;
}

// the largest run of s in [a, b] where ok(s) holds (sampled), or null
function validRun(a, b, ok, n = 10) {
  let best = null, cur = null;
  for (let k = 0; k <= n; k++) {
    const s = a + (b - a) * k / n;
    if (ok(s)) { if (!cur) cur = [s, s]; else cur[1] = s; } else if (cur) { if (!best || cur[1] - cur[0] > best[1] - best[0]) best = cur; cur = null; }
  }
  if (cur && (!best || cur[1] - cur[0] > best[1] - best[0])) best = cur;
  return best;
}
// coursed rubble on a face between low(s) and high(s), s in [sa, sb]: o { joint, hmin, hmax, lmin, lmax, cols: [[r,g,b]..],
// pick(s, t) -> index (optional), stone options (depth, rough, dome, rim, tilt, weather) }; returns the stones laid
export function wall(B, map, sa, sb, low, high, o) {
  const j = o.joint ?? 0.025, hmin = o.hmin ?? 0.24, hmax = o.hmax ?? 0.46, lmin = o.lmin ?? 0.32, lmax = o.lmax ?? 0.95;
  const lvl = o.lvl ?? 0.09;                                     // each stone's bed and top out of level over its length (m per m)
  let t0 = 1e9, t1 = -1e9;
  for (let k = 0; k <= 40; k++) { const s = sa + (sb - sa) * k / 40; t0 = Math.min(t0, low(s)); t1 = Math.max(t1, high(s)); }
  let t = o.tStart ?? t0, n = 0;
  while (t < t1 - 0.05) {
    let ch = hmin + rnd() * (hmax - hmin);
    if (t1 - (t + ch) < hmin * 0.6) ch = t1 - t;                    // the last course takes what is left
    const c0 = t, c1 = t + ch;
    let s = sa - rnd() * lmax * 0.6;
    while (s < sb) {
      let len = lmin + rnd() * (lmax - lmin);
      if (rnd() < 0.18) len *= 0.55;                                  // a closer between longer stones
      const a = Math.max(sa, s + j / 2), b = Math.min(sb, s + len - j / 2);
      s += len;
      if (b - a < 0.08) continue;
      const xm = (a + b) / 2, sB = (rnd() - 0.5) * lvl, sT = (rnd() - 0.5) * lvl, gB = rnd() < 0.3 ? rnd() * (o.gap ?? 0.035) : 0, gT = rnd() < 0.3 ? rnd() * (o.gap ?? 0.035) : 0;   // each stone's bed and top a little out of level, some short of the course
      const tb = (x) => Math.max(c0, low(x)) + j / 2 + gB + sB * (x - xm), tt = (x) => Math.min(c1, high(x)) - j / 2 - gT + sT * (x - xm);
      const run = validRun(a, b, (x) => tt(x) - tb(x) > Math.min(0.09, ch * 0.4));
      if (!run || run[1] - run[0] < 0.08) continue;
      const pickC = () => o.cols[o.pick ? o.pick((run[0] + run[1]) / 2, (c0 + c1) / 2) : Math.floor(rnd() * o.cols.length) % o.cols.length];
      if (ch > (o.stackMin ?? 0.34) && rnd() < (o.stack ?? 0.3)) {                // two stones stacked in the course, the joint between them out of level
        const sp = 0.38 + rnd() * 0.24, sl = (rnd() - 0.5) * 0.06, jm = (x) => (tb(x) + (tt(x) - tb(x)) * sp + sl * (x - xm));
        n += stone(B, map, run[0], run[1], tb, (x) => jm(x) - j / 2, { toneVar: 0.3, ...o, col: pickC() });
        n += stone(B, map, run[0], run[1], (x) => jm(x) + j / 2, tt, { toneVar: 0.3, ...o, col: pickC() });
        continue;
      }
      n += stone(B, map, run[0], run[1], tb, tt, { toneVar: 0.3, ...o, col: pickC() });
    }
    t = c1;
  }
  return n;
}
// the mortar behind a face: a patch at z = o.z (default 0) from low(s) to high(s), ns columns
export function backing(B, map, sa, sb, low, high, col, ns = 24, z = 0, nt = 2) {          // nt rows across t: many where t runs round an arch
  B.grid(ns, nt, (i, j) => { const s = sa + (sb - sa) * i / ns, a = low(s), b = high(s); return { p: map(s, a + (b - a) * j / nt, z), c: col }; });
}

// ---- a rounded block ---------------------------------------------------------------------------------------------------
// centre (u, y, w), half extents (hu, hy, hw), arris radius r; faces: 'all' or a set of '+u -u +y -y +w -w'; the face
// pitched by o.rough (m) away from the arrises; o.yaw turns it about y. Its edges are welded, so it shades as one solid.
const AX = { '+u': [0, 1], '-u': [0, -1], '+y': [1, 1], '-y': [1, -1], '+w': [2, 1], '-w': [2, -1] };
export function rbox(B, u, y, w, hu, hy, hw, r, col, o = {}) {
  const H = [hu, hy, hw], rr = Math.min(r, 0.45 * Math.min(hu, hy, hw)), faces = o.faces || ['+u', '-u', '+y', '+w', '-w', '-y'];
  const ca = Math.cos(o.yaw || 0), sa = Math.sin(o.yaw || 0), cp = Math.cos(o.pitch || 0), sp = Math.sin(o.pitch || 0), rough = o.rough ?? 0, sd = rnd() * 911, ao0 = o.ao0 ?? 0.8;
  const coords = (h) => {
    const inner = Math.max(1, Math.round((2 * h - 2 * rr) / (o.step ?? 0.3)));
    const a = [-h, -h + 0.59 * rr, -h + rr];
    for (let k = 1; k < inner; k++) a.push(-h + rr + (2 * h - 2 * rr) * k / inner);
    a.push(h - rr, h - 0.59 * rr, h);
    return a;
  };
  const C = H.map(coords);
  const base = B.P.length / 3, key = new Map(), idx = [];
  const put = (p) => {
    // the rounded-box projection, then the pitched face along its normal
    const q = [Math.min(H[0] - rr, Math.max(-(H[0] - rr), p[0])), Math.min(H[1] - rr, Math.max(-(H[1] - rr), p[1])), Math.min(H[2] - rr, Math.max(-(H[2] - rr), p[2]))];
    let d = [p[0] - q[0], p[1] - q[1], p[2] - q[2]], l = Math.hypot(d[0], d[1], d[2]);
    let x = p;
    if (l > 1e-9) { d = [d[0] / l, d[1] / l, d[2] / l]; x = [q[0] + d[0] * rr, q[1] + d[1] * rr, q[2] + d[2] * rr]; }
    const ed = Math.min(H[0] - Math.abs(p[0]), H[1] - Math.abs(p[1]), H[2] - Math.abs(p[2])) + 0;   // 0 on the face's plane edges
    let nrm = d;
    const k = `${x[0].toFixed(5)},${x[1].toFixed(5)},${x[2].toFixed(5)}`;
    let id = key.get(k);
    if (id === undefined) {
      // distance to the nearest arris along the face (the larger two of the three slack distances)
      const sl = [H[0] - Math.abs(p[0]), H[1] - Math.abs(p[1]), H[2] - Math.abs(p[2])].sort((a, b) => a - b);
      const fade = sstep(rr, rr * 3 + 0.02, sl[1]);
      const nz = rough ? rough * (fbm(x[0] * 7 + sd, x[1] * 7 + x[2] * 5.3) - 0.5) * fade : 0;
      if (l < 1e-9) nrm = [0, 0, 0];
      const X = [x[0] + nrm[0] * nz, x[1] + nrm[1] * nz, x[2] + nrm[2] * nz];
      const pu = X[0] * cp - X[1] * sp, py = X[0] * sp + X[1] * cp;           // pitched about w (a slab on a slope)
      const lu = pu * ca + X[2] * sa, lw = -pu * sa + X[2] * ca;
      const kk = ao0 + (1 - ao0) * sstep(0, rr * 2 + 0.01, sl[1] + ed * 0);
      let tv; if (B.T) { const g = o.grain ?? 1, ga = (g + 1) % 3, gb = (g + 2) % 3; tv = [(X[g] + sd) / 2.0, (X[ga] + X[gb] + sd * 0.37) * 0.45]; }   // grain along o.grain (0 u, 1 y, 2 w)
      id = B.v(u + lu, y + py, w + lw, o.colAt ? o.colAt(col, X, kk) : [col[0] * kk, col[1] * kk, col[2] * kk], tv);
      key.set(k, id);
    }
    return id;
  };
  for (const f of faces) {
    const [a, sg] = AX[f], b = (a + 1) % 3, c = (a + 2) % 3, A = C[b], Bc = C[c];
    const ids = [];
    for (let jj = 0; jj < Bc.length; jj++) for (let ii = 0; ii < A.length; ii++) { const p = [0, 0, 0]; p[a] = sg * H[a]; p[b] = A[ii]; p[c] = Bc[jj]; ids.push(put(p)); }
    const ni = A.length;
    for (let jj = 0; jj + 1 < Bc.length; jj++) for (let ii = 0; ii + 1 < ni; ii++) {
      const p0 = ids[jj * ni + ii], p1 = ids[jj * ni + ii + 1], p2 = ids[(jj + 1) * ni + ii + 1], p3 = ids[(jj + 1) * ni + ii];
      if (sg > 0) idx.push(p0, p1, p2, p0, p2, p3); else idx.push(p0, p2, p1, p0, p3, p2);
    }
  }
  for (const i of idx) B.I.push(i);
  return B.P.length / 3 - base;
}

// ---- a moulding swept along a path -------------------------------------------------------------------------------------
// path: [[u, y, nu, ny]] (a point and the path's in-plane normal: up for a rail, outward for an arch rib), w0 its offset
// across; prof: polylines [[dn, dw], ...] (dn along the normal, dw across), each a smooth surface, hard edges between them
export function sweep(B, path, w0, prof, col, mirror = false) {
  const s = mirror ? -1 : 1;
  for (const pl of prof) {
    const sp = [0]; for (let i = 1; i < pl.length; i++) sp.push(sp[i - 1] + Math.hypot(pl[i][0] - pl[i - 1][0], pl[i][1] - pl[i - 1][1]));
    B.grid(pl.length - 1, path.length - 1, (i, j) => {
      const [u, y, nu, ny] = path[j], [dn, dw] = pl[i];
      return { p: [u + nu * dn, y + ny * dn, s * (w0 + dw)], c: typeof col === 'function' ? col(i, j) : col, t: B.T ? [u / 2.0, sp[i] * 0.45 + w0 * 0.31] : undefined };
    });
  }
}
// a path along u following y(u) with up normals (the normal tilted by the slope so a moulding keeps its section)
export function upPath(us, yf) {
  return us.map((u, k) => {
    const a = us[Math.max(0, k - 1)], b = us[Math.min(us.length - 1, k + 1)], dy = (yf(b) - yf(a)) / Math.max(1e-6, b - a), l = Math.hypot(1, dy);
    return [u, yf(u), -dy / l, 1 / l];
  });
}
export const steps = (a, b, n) => { const o = []; for (let i = 0; i <= n; i++) o.push(a + (b - a) * i / n); return o; };
// a body of revolution about the vertical axis at (u, w): prof [[r, dy]...] from y0 up, n sides, colour c or c(i, j); one smooth
// surface (a finial, a baluster, an urn); mod(th, j) optionally scales the radius (gadroons, flutes)
export function lathe(B, u, y0, w, prof, n, c, mod, rot = 0) {
  B.grid(n, prof.length - 1, (i, j) => {
    const th = i / n * Math.PI * 2 + rot, r = prof[j][0] * (mod ? mod(th, j) : 1);
    return { p: [u + Math.cos(th) * r, y0 + prof[j][1], w + Math.sin(th) * r], c: typeof c === 'function' ? c(i, j) : c };
  });
}

// ---- materials ---------------------------------------------------------------------------------------------------------
// The scans load as KTX2 (tools: scratchpad cpb/pack.cjs, the AR33 basisu settings) once the renderer is known; until then
// 1 px stand-ins (the mean, a flat normal, rough and unoccluded), so the stones draw their own tones meanwhile.
const TEXDIR = 'textures/cp33/bridges/';
export const SETS = {
  schist: { mean: [0.0716, 0.0573, 0.0414], size: 1.6 },   // Poly Haven lichen_rock (Rico Cilliers, CC0), 2 x 2 m scan
  planks: { mean: [0.0821, 0.0582, 0.0441], size: 2.0 },   // Poly Haven weathered_planks (Dario Barresi, Dimitrios Savva, CC0)
};
const _tex = {};
let _loader = null, _renderer = null, _pending = [];
const px = (r, g, b, a = 255, srgb = false) => { const t = new THREE.DataTexture(new Uint8Array([r, g, b, a]), 1, 1); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t; };
function texSet(name) {
  if (_tex[name]) return _tex[name];
  const S = SETS[name], enc = (v) => Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
  const T = _tex[name] = { alb: { value: px(enc(S.mean[0]), enc(S.mean[1]), enc(S.mean[2]), 255, true) }, nrm: { value: px(128, 128, 255) }, orm: { value: px(255, 200, 0, 128) }, mats: [] };
  _pending.push(name);
  pump();
  return T;
}
function pump() {
  if (typeof window === 'undefined') return;
  const r = _renderer || (window.__ENGINE && window.__ENGINE.renderer);
  if (!r) return;
  if (!_loader) {
    _loader = import('./mat/ktx2.js').then(({ ktx2Loader }) => ktx2Loader(r));   // the app's one KTX2 loader (MATS 06:15)
  }
  const names = _pending; _pending = [];
  _loader.then((L) => {
    for (const name of names) {
      const T = _tex[name];
      for (const [k, srgb] of [['alb', true], ['nrm', false], ['orm', false]]) {
        L.load(`${TEXDIR}${name}_${k}.ktx2`, (t) => {
          t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = srgb ? 16 : 8;
          T[k].value = t;
          for (const m of T.mats) if (m.userData.cpbMaps) { m.userData.cpbMaps(T); m.needsUpdate = true; }
        }, undefined, (e) => console.warn('[cpb33] texture failed', name, k, e && e.message));
      }
    }
  });
}
if (typeof window !== 'undefined') { const iv = setInterval(() => { if (_loader || (window.__ENGINE && window.__ENGINE.renderer)) { pump(); clearInterval(iv); } }, 500); }
const ownKey = (m, k) => { const f = m.customProgramCacheKey.bind(m); m.customProgramCacheKey = () => f() + '|cpb33' + k; return m; };

// triplanar scan detail in world space over the vertex colour: albedo as a ratio to the scan's mean, its normals
// (whiteout blend), roughness (G) and cavity occlusion (R) on the indirect light and a little on the direct
function applyScan(mat, name, o = {}) {
  const T = texSet(name), S = SETS[name], size = (S.size * (o.scale ?? 1)).toFixed(3), amt = (o.amt ?? 0.9).toFixed(3), nAmt = (o.nrm ?? 1.0).toFixed(3), rmin = (o.rmin ?? 0.7).toFixed(3), bnc = o.bounce, abias = (o.albBias ?? 0).toFixed(2);
  // o.bounce: the water's level (m): light thrown up from the water onto what faces it (an arch's soffit, a quay wall), in the
  // surface's own colour, with a net of caustics crawling over it; strongest at the waterline, gone by 4.5 m over it
  const bounceGlsl = bnc === undefined ? '' : `{
          vec3 bxNw = inverseTransformDirection( normal, viewMatrix );
          float bxH = vBxW.y - ${Number(bnc).toFixed(3)};
          float bxFace = clamp( 0.35 - bxNw.y * 0.65, 0.0, 1.0 );
          float bxFade = 1.0 - smoothstep( 0.2, 4.6, bxH );
          vec2 cq = vBxW.xz * 1.9 + vec2( bxH * 0.9, 0.0 );
          float c1 = sin( cq.x * 2.1 + bxTime * 0.9 + sin( cq.y * 1.7 + bxTime * 0.6 ) * 1.6 );
          float c2 = sin( cq.y * 2.6 - bxTime * 0.75 + sin( cq.x * 1.3 - bxTime * 0.5 ) * 1.4 );
          float cs = pow( clamp( 0.5 + 0.25 * ( c1 + c2 ), 0.0, 1.0 ), 5.0 );
          vec3 bxL = vec3( 0.72, 0.8, 0.8 ) * ( 0.5 + 2.0 * cs ) * bxFace * bxFade;
          totalEmissiveRadiance += diffuseColor.rgb * bxL * ${(o.bounceK ?? 2.4).toFixed(2)};
        }`;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    if (r && !_renderer) { _renderer = r; pump(); }
    sh.uniforms.bxAlb = T.alb; sh.uniforms.bxNrm = T.nrm; sh.uniforms.bxOrm = T.orm;
    sh.uniforms.bxMean = { value: new THREE.Vector3(...S.mean) };
    if (bnc !== undefined) sh.uniforms.bxTime = ENV.time;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBxW; varying vec3 vBxN;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        {
          vec4 bp = vec4( transformed, 1.0 ); vec3 bn = objectNormal;
          #ifdef USE_INSTANCING
            bp = instanceMatrix * bp; bn = mat3( instanceMatrix ) * bn;
          #endif
          vBxW = ( modelMatrix * bp ).xyz; vBxN = mat3( modelMatrix ) * bn;
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D bxAlb; uniform sampler2D bxNrm; uniform sampler2D bxOrm; uniform vec3 bxMean;
        varying vec3 vBxW; varying vec3 vBxN;${bnc !== undefined ? '\nuniform float bxTime;' : ''}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 bxP = vBxW / ${size};
        vec3 bxN3 = normalize( vBxN );
        vec3 bxWt = pow( abs( bxN3 ), vec3( 4.0 ) ); bxWt /= max( bxWt.x + bxWt.y + bxWt.z, 1e-4 );
        vec2 bxUx = bxP.zy, bxUy = bxP.xz + 0.37, bxUz = bxP.xy + 0.71;
        vec3 bxC = texture2D( bxAlb, bxUx, ${abias} ).rgb * bxWt.x + texture2D( bxAlb, bxUy, ${abias} ).rgb * bxWt.y + texture2D( bxAlb, bxUz, ${abias} ).rgb * bxWt.z;
        vec3 bxR = bxC / max( bxMean, vec3( 1e-3 ) );
        float bxLm = dot( bxR, vec3( 0.2126, 0.7152, 0.0722 ) );
        bxR = clamp( mix( vec3( bxLm ), bxR, 0.25 ), vec3( 0.4 ), vec3( 1.9 ) );
        diffuseColor.rgb *= mix( vec3( 1.0 ), bxR, ${amt} );
        vec4 bxO = texture2D( bxOrm, bxUx ) * bxWt.x + texture2D( bxOrm, bxUy ) * bxWt.y + texture2D( bxOrm, bxUz ) * bxWt.z;
        float bxAO = mix( 1.0, bxO.r, 0.85 );`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp( mix( roughnessFactor, bxO.g, 0.5 ), ${rmin}, 1.0 );`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec3 tx = texture2D( bxNrm, bxUx ).xyz * 2.0 - 1.0, ty = texture2D( bxNrm, bxUy ).xyz * 2.0 - 1.0, tz = texture2D( bxNrm, bxUz ).xyz * 2.0 - 1.0;
          vec3 n3 = bxN3;
          tx = vec3( tx.xy + n3.zy, abs( tx.z ) * n3.x );
          ty = vec3( ty.xy + n3.xz, abs( ty.z ) * n3.y );
          tz = vec3( tz.xy + n3.xy, abs( tz.z ) * n3.z );
          vec3 pn = normalize( tx.zyx * bxWt.x + ty.xzy * bxWt.y + tz.xyz * bxWt.z );
          vec3 vn = normalize( ( viewMatrix * vec4( pn, 0.0 ) ).xyz );
          normal = normalize( mix( normal, vn * sign( dot( vn, normal ) + 1e-4 ), ${nAmt} ) );
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        ${bounceGlsl}`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        reflectedLight.indirectDiffuse *= bxAO; reflectedLight.indirectSpecular *= bxAO;
        reflectedLight.directDiffuse *= mix( 1.0, bxAO, 0.45 );`);
  };
  T.mats.push(mat);
  return ownKey(mat, 'scan' + name + size + amt + nAmt + rmin + abias + (bnc === undefined ? '' : 'b' + bnc + (o.bounceK ?? 2.4)));
}
const MATS = {};
const std = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, ...o });
export function bxMats() {
  if (MATS.schist) return MATS;
  // rock-faced Manhattan schist (Gapstow, the arches, Balcony Bridge's walls)
  MATS.schist = applyLightTrim(applyCityAO(applyScan(std({ roughness: 0.92, metalness: 0.0 }), 'schist', { amt: 0.5, nrm: 1.0, scale: 1.7, rmin: 0.74, albBias: 1.2 })));
  // the same rock, finer and paler: dressed sandstone and granite trim (voussoirs, copings)
  MATS.dressed = applyLightTrim(applyCityAO(applyScan(std({ roughness: 0.88, metalness: 0.0 }), 'schist', { amt: 0.45, nrm: 1.0, scale: 1.8, rmin: 0.72, albBias: 0.8 })));
  // dressed granite ashlar (Bow Bridge's abutments, Oak Bridge's): the city's speckled granite set over modelled blocks
  MATS.granite = ownKey(applyLightTrim(applyCityAO(applyStoneDetail(std({ roughness: 0.84, metalness: 0.0 }), 'cgranite', { amt: 0.6, nrm: 0.6, rgh: 0.35, scale: 0.7 }))), 'granite');
  // the mortar: lime and cement, a fine grain
  MATS.mortar = applyLightTrim(applyCityAO(applyScan(std({ roughness: 0.96, metalness: 0.0 }), 'schist', { amt: 0.35, nrm: 0.35, scale: 0.6, rmin: 0.9 })));
  // painted cast iron: an enamel over the casting, a dielectric sheen
  MATS.iron = ownKey(applyLightTrim(applyCityAO(std({ roughness: 0.48, metalness: 0.1 }))), 'iron');
  // the boards: the scan by uv (along the board, across it), tinted by the vertex colour over the scan's mean
  const T = texSet('planks');
  const wood = std({ roughness: 1.0, metalness: 0.0, map: T.alb.value, normalMap: T.nrm.value, roughnessMap: T.orm.value, aoMap: T.orm.value, aoMapIntensity: 0.8 });
  wood.userData.cpbMaps = (S) => { wood.map = S.alb.value; wood.normalMap = S.nrm.value; wood.roughnessMap = S.orm.value; wood.aoMap = S.orm.value; };
  T.mats.push(wood);
  const pw = wood.onBeforeCompile;
  wood.onBeforeCompile = (sh, r) => { pw?.call(wood, sh, r); if (r && !_renderer) { _renderer = r; pump(); } };
  wood.onBeforeCompile = ((prev) => (sh, r) => {                     // the scan's pink out of the product with the vertex tone
    prev?.(sh, r);
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        { float wl = dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ); diffuseColor.rgb = mix( vec3( wl ), diffuseColor.rgb, 0.55 ) * vec3( 1.04, 1.0, 0.92 ); }`);
  })(wood.onBeforeCompile);
  MATS.wood = ownKey(applyLightTrim(applyCityAO(wood)), 'wood2');
  MATS.matte = ownKey(applyLightTrim(applyCityAO(std({ roughness: 0.93, metalness: 0.0 }))), 'matte');
  // the paths over the bridges: worn asphalt, the city's worn-slab set as the aggregate and its patching
  MATS.path = ownKey(applyLightTrim(applyCityAO(applyStoneDetail(std({ roughness: 0.94, metalness: 0.0 }), 'cpave', { amt: 0.5, nrm: 0.9, rgh: 0.45, scale: 0.3 }))), 'bxpath');
  MATS.leaf = ownKey(applyLightTrim(applyCityAO(std({ roughness: 0.75, metalness: 0.0 }))), 'leaf');
  return MATS;
}
// the same rock under an arch or on a quay: lit from the water below (caustics, bounce), W the water's level
const SOFF = {};
export function bxSoffit(W) {
  const k = W.toFixed(2);
  if (!SOFF[k]) SOFF[k] = applyLightTrim(applyCityAO(applyScan(std({ roughness: 0.92, metalness: 0.0 }), 'schist', { amt: 0.5, nrm: 1.0, scale: 1.7, rmin: 0.74, albBias: 1.2, bounce: W })));
  return SOFF[k];
}
export const PLANK_MEAN = SETS.planks.mean;

// ---- the near / far switch -----------------------------------------------------------------------------------------------
// THREE.LOD on the structure's centre (its children shifted back, the geometry is in world coordinates): the modelled
// structure inside `dist` m, the light one beyond
export function nearFar(group, name, c, near, far, dist) {
  const lod = new THREE.LOD();
  lod.name = name;
  lod.position.set(c[0], c[1], c[2]);
  near.position.set(-c[0], -c[1], -c[2]); far.position.set(-c[0], -c[1], -c[2]);
  lod.addLevel(near, 0);
  lod.addLevel(far, dist);
  lod.updateMatrixWorld(true);
  group.add(lod);
  return lod;
}
export const trisOf = (obj) => { let n = 0; obj.traverse((m) => { if (m.isMesh && m.geometry) { const g = m.geometry, k = g.index ? g.index.count / 3 : g.attributes.position.count / 3; n += m.isInstancedMesh ? k * m.count : k; } }); return Math.round(n); };
export { ENV, sstep };
