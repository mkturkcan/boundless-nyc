// TRAINS (AR34, docs/notes/ar34-trains.md): a small geometry kit for the rail cars. Everything is built in a car frame:
// x along the car (+x = the car's "A" end), y up from the top of rail, z across (+z = the car's right looking toward +x
// ... the sign does not matter, both sides are built). Faces are collected per material key ("bucket") and flushed to one
// BufferGeometry per bucket: position, normal, uv (planar, 1 unit = 1 m), color (vertex weathering), aux (a float tag the
// shaders read: lamp ids, decal kinds).
import * as THREE from 'three';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const TV = { sub, crs, dot, nrm, add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s] };

// a plane for 2D work: origin O, in-plane axes U (right) and V (up); its normal is U x V
export const plane = (O, U, V) => ({ O, U, V, N: nrm(crs(U, V)), at(u, v, d = 0) { return [O[0] + U[0] * u + V[0] * v + this.N[0] * d, O[1] + U[1] * u + V[1] * v + this.N[1] * d, O[2] + U[2] * u + V[2] * v + this.N[2] * d]; } });

// rounded rectangle outline (CCW in the plane), `n` points per corner arc
export function rrect(cx, cy, w, h, r, n = 4) {
  r = Math.max(0, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4));
  const out = [], x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2;
  const arc = (ax, ay, a0) => { for (let i = 0; i <= n; i++) { const a = a0 + (Math.PI / 2) * (i / n); out.push([ax + Math.cos(a) * r, ay + Math.sin(a) * r]); } };
  if (r <= 1e-4) return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  arc(x1 - r, y0 + r, -Math.PI / 2); arc(x1 - r, y1 - r, 0); arc(x0 + r, y1 - r, Math.PI / 2); arc(x0 + r, y0 + r, Math.PI);
  return out;
}

export class TKit {
  constructor() { this.B = new Map(); this.weather = null; }
  _b(k) { let o = this.B.get(k); if (!o) this.B.set(k, (o = { p: [], n: [], uv: [], c: [], a: [] })); return o; }
  _col(col, p, n) { const c = typeof col === 'function' ? col(p, n) : col || [1, 1, 1]; return this.weather ? this.weather(c, p, n) : c; }
  // one triangle; `n` = a face normal hint (the winding is fixed to match it) or per-vertex normals [na, nb, nc]
  tri(k, a, b, c, n, col, aux = 0) {
    const f = crs(sub(b, a), sub(c, a));
    const hint = Array.isArray(n?.[0]) ? nrm([n[0][0] + n[1][0] + n[2][0], n[0][1] + n[1][1] + n[2][1], n[0][2] + n[1][2] + n[2][2]]) : n || nrm(f);
    let A = a, Bv = b, C = c, ns = Array.isArray(n?.[0]) ? n : [hint, hint, hint];
    if (dot(f, hint) < 0) { Bv = c; C = b; ns = [ns[0], ns[2], ns[1]]; }
    const o = this._b(k);
    const fn = nrm(hint), ax = Math.abs(fn[0]), ay = Math.abs(fn[1]), az = Math.abs(fn[2]);
    const uvOf = (p) => (ay >= ax && ay >= az ? [p[0], p[2]] : az >= ax ? [p[0], p[1]] : [p[2], p[1]]);
    [[A, ns[0]], [Bv, ns[1]], [C, ns[2]]].forEach(([p, nn]) => {
      o.p.push(p[0], p[1], p[2]); o.n.push(nn[0], nn[1], nn[2]);
      const uv = uvOf(p); o.uv.push(uv[0], uv[1]);
      const cc = this._col(col, p, nn); o.c.push(cc[0], cc[1], cc[2]); o.a.push(aux);
    });
  }
  quad(k, a, b, c, d, n, col, aux = 0) {
    if (!n) n = nrm(crs(sub(b, a), sub(d, a)));
    this.tri(k, a, b, c, n, col, aux); this.tri(k, a, c, d, n, col, aux);
  }
  // axis-aligned box in the car frame; `skip` a string of faces to leave out: 'xXyYzZ' (x = -x face, X = +x face ...)
  box(k, x0, x1, y0, y1, z0, z1, col, aux = 0, skip = '') {
    const P = (x, y, z) => [x, y, z];
    if (!skip.includes('X')) this.quad(k, P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1), [1, 0, 0], col, aux);
    if (!skip.includes('x')) this.quad(k, P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0), P(x0, y0, z0), [-1, 0, 0], col, aux);
    if (!skip.includes('Y')) this.quad(k, P(x0, y1, z0), P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), [0, 1, 0], col, aux);
    if (!skip.includes('y')) this.quad(k, P(x0, y0, z1), P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), [0, -1, 0], col, aux);
    if (!skip.includes('Z')) this.quad(k, P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1), [0, 0, 1], col, aux);
    if (!skip.includes('z')) this.quad(k, P(x1, y0, z0), P(x0, y0, z0), P(x0, y1, z0), P(x1, y1, z0), [0, 0, -1], col, aux);
  }
  // a cylinder from A to B (any direction), `seg` sides, smooth sides, flat caps
  cyl(k, A, B, r, seg, col, aux = 0, caps = true, r2 = r) {
    const ax = nrm(sub(B, A)), ref = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const e1 = nrm(crs(ax, ref)), e2 = crs(ax, e1);
    const ring = (C, rr, i) => { const t = (2 * Math.PI * i) / seg, c = Math.cos(t), s = Math.sin(t); return [C[0] + (e1[0] * c + e2[0] * s) * rr, C[1] + (e1[1] * c + e2[1] * s) * rr, C[2] + (e1[2] * c + e2[2] * s) * rr]; };
    const nAt = (i) => { const t = (2 * Math.PI * i) / seg; return nrm([e1[0] * Math.cos(t) + e2[0] * Math.sin(t), e1[1] * Math.cos(t) + e2[1] * Math.sin(t), e1[2] * Math.cos(t) + e2[2] * Math.sin(t)]); };
    for (let i = 0; i < seg; i++) {
      const a0 = ring(A, r, i), a1 = ring(A, r, i + 1), b0 = ring(B, r2, i), b1 = ring(B, r2, i + 1), n0 = nAt(i), n1 = nAt(i + 1);
      this.tri(k, a0, a1, b1, [n0, n1, n1], col, aux); this.tri(k, a0, b1, b0, [n0, n1, n0], col, aux);
      if (caps) { this.tri(k, B, b0, b1, ax, col, aux); this.tri(k, A, a1, a0, [-ax[0], -ax[1], -ax[2]], col, aux); }
    }
  }
  disc(k, C, N, r, seg, col, aux = 0) {
    const n = nrm(N), ref = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], e1 = nrm(crs(n, ref)), e2 = crs(n, e1);
    for (let i = 0; i < seg; i++) {
      const t0 = (2 * Math.PI * i) / seg, t1 = (2 * Math.PI * (i + 1)) / seg;
      const p0 = [C[0] + (e1[0] * Math.cos(t0) + e2[0] * Math.sin(t0)) * r, C[1] + (e1[1] * Math.cos(t0) + e2[1] * Math.sin(t0)) * r, C[2] + (e1[2] * Math.cos(t0) + e2[2] * Math.sin(t0)) * r];
      const p1 = [C[0] + (e1[0] * Math.cos(t1) + e2[0] * Math.sin(t1)) * r, C[1] + (e1[1] * Math.cos(t1) + e2[1] * Math.sin(t1)) * r, C[2] + (e1[2] * Math.cos(t1) + e2[2] * Math.sin(t1)) * r];
      this.tri(k, C, p0, p1, n, col, aux);
    }
  }
  // a convex polygon (2D points in plane `pl`) as a fan, raised d along the normal
  fan(k, pl, pts, col, aux = 0, d = 0) {
    let cx = 0, cy = 0; for (const p of pts) { cx += p[0]; cy += p[1]; } cx /= pts.length; cy /= pts.length;
    const C = pl.at(cx, cy, d);
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; this.tri(k, C, pl.at(a[0], a[1], d), pl.at(b[0], b[1], d), pl.N, col, aux); }
  }
  // a band between two outlines with the same point count (a window gasket, a frame), at d0 (outer edge) .. d1 (inner)
  // raised h along the normal, with its outer and inner walls
  band(k, pl, outer, inner, col, aux = 0, h = 0.01, d = 0) {
    const n = outer.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const o0 = pl.at(outer[i][0], outer[i][1], d + h), o1 = pl.at(outer[j][0], outer[j][1], d + h), i0 = pl.at(inner[i][0], inner[i][1], d + h), i1 = pl.at(inner[j][0], inner[j][1], d + h);
      this.quad(k, o0, o1, i1, i0, pl.N, col, aux);
      if (h > 0) {
        const ob0 = pl.at(outer[i][0], outer[i][1], d), ob1 = pl.at(outer[j][0], outer[j][1], d);
        const ib0 = pl.at(inner[i][0], inner[i][1], d), ib1 = pl.at(inner[j][0], inner[j][1], d);
        const eo = nrm(sub(o1, o0)), no = nrm(crs(eo, pl.N));        // outward (the outline is CCW)
        this.quad(k, ob0, ob1, o1, o0, no, col, aux);
        this.quad(k, ib1, ib0, i0, i1, [-no[0], -no[1], -no[2]], col, aux);
      }
    }
  }
  // a wall rectangle u0..u1 x v0..v1 in plane `pl` with rectangular holes (rounded corners filled back with fillets);
  // extra cut lines (cu / cv) subdivide it so the vertex weathering has vertices to live on
  wall(k, pl, u0, u1, v0, v1, holes, col, aux = 0, cu = [], cv = [], d = 0) {
    const xs = new Set([u0, u1, ...cu.filter((x) => x > u0 && x < u1)]), ys = new Set([v0, v1, ...cv.filter((y) => y > v0 && y < v1)]);
    for (const h of holes) { xs.add(Math.max(u0, Math.min(u1, h.u0))); xs.add(Math.max(u0, Math.min(u1, h.u1))); ys.add(Math.max(v0, Math.min(v1, h.v0))); ys.add(Math.max(v0, Math.min(v1, h.v1))); }
    const X = [...xs].sort((a, b) => a - b), Y = [...ys].sort((a, b) => a - b);
    for (let i = 0; i + 1 < X.length; i++) for (let j = 0; j + 1 < Y.length; j++) {
      const mx = (X[i] + X[i + 1]) / 2, my = (Y[j] + Y[j + 1]) / 2;
      if (X[i + 1] - X[i] < 1e-5 || Y[j + 1] - Y[j] < 1e-5) continue;
      if (holes.some((h) => mx > h.u0 && mx < h.u1 && my > h.v0 && my < h.v1)) continue;
      this.quad(k, pl.at(X[i], Y[j], d), pl.at(X[i + 1], Y[j], d), pl.at(X[i + 1], Y[j + 1], d), pl.at(X[i], Y[j + 1], d), pl.N, col, aux);
    }
    // fillets: the corners of rounded holes
    for (const h of holes) {
      const r = h.r || 0; if (r <= 0) continue;
      const corners = [[h.u0, h.v0, h.u0 + r, h.v0 + r, Math.PI, 1.5 * Math.PI], [h.u1, h.v0, h.u1 - r, h.v0 + r, 1.5 * Math.PI, 2 * Math.PI], [h.u1, h.v1, h.u1 - r, h.v1 - r, 0, 0.5 * Math.PI], [h.u0, h.v1, h.u0 + r, h.v1 - r, 0.5 * Math.PI, Math.PI]];
      for (const [px, py, cx, cy, a0, a1] of corners) {
        const N = 4, P0 = pl.at(px, py, d);
        for (let s = 0; s < N; s++) {
          const t0 = a0 + ((a1 - a0) * s) / N, t1 = a0 + ((a1 - a0) * (s + 1)) / N;
          this.tri(k, P0, pl.at(cx + Math.cos(t0) * r, cy + Math.sin(t0) * r, d), pl.at(cx + Math.cos(t1) * r, cy + Math.sin(t1) * r, d), pl.N, col, aux);
        }
      }
    }
  }
  // the reveal of a rounded hole: its walls from the face (d 0) back to depth -dep
  reveal(k, pl, h, dep, col, aux = 0) {
    const o = rrect((h.u0 + h.u1) / 2, (h.v0 + h.v1) / 2, h.u1 - h.u0, h.v1 - h.v0, h.r || 0, 3);
    for (let i = 0; i < o.length; i++) {
      const a = o[i], b = o[(i + 1) % o.length];
      const A0 = pl.at(a[0], a[1], 0), B0 = pl.at(b[0], b[1], 0), A1 = pl.at(a[0], a[1], -dep), B1 = pl.at(b[0], b[1], -dep);
      const e = nrm(sub(B0, A0)), inw = nrm(crs(pl.N, e));      // pointing into the hole's middle
      this.quad(k, A0, B0, B1, A1, inw, col, aux);
    }
  }
  // extrude a profile [[z, y], ...] along x from x0 to x1 (open polyline); normals per segment (flat) or per point (smooth)
  // pointing away from `ctr` [z, y]; `segs` subdivisions along x
  extrude(k, prof, x0, x1, col, aux = 0, { smooth = false, ctr = [0, 1.8], segs = 1 } = {}) {
    const segN = [];
    for (let i = 0; i + 1 < prof.length; i++) {
      const a = prof[i], b = prof[i + 1], t = [b[0] - a[0], b[1] - a[1]];
      let n = nrm([0, -t[0], t[1]]);           // (x, y, z): the 2D normal of (dz, dy) is (dy, -dz) -> y = -dz, z = dy
      const m = [(a[0] + b[0]) / 2 - ctr[0], (a[1] + b[1]) / 2 - ctr[1]];
      if (n[2] * m[0] + n[1] * m[1] < 0) n = [0, -n[1], -n[2]];
      segN.push(n);
    }
    const ptN = prof.map((_, i) => nrm(TV.add(segN[Math.max(0, i - 1)], segN[Math.min(segN.length - 1, i)])));
    for (let s = 0; s < segs; s++) {
      const xa = x0 + ((x1 - x0) * s) / segs, xb = x0 + ((x1 - x0) * (s + 1)) / segs;
      for (let i = 0; i + 1 < prof.length; i++) {
        const a = prof[i], b = prof[i + 1];
        const A0 = [xa, a[1], a[0]], A1 = [xb, a[1], a[0]], B1 = [xb, b[1], b[0]], B0 = [xa, b[1], b[0]];
        if (smooth) { const na = ptN[i], nb = ptN[i + 1]; this.tri(k, A0, A1, B1, [na, na, nb], col, aux); this.tri(k, A0, B1, B0, [na, nb, nb], col, aux); }
        else this.quad(k, A0, A1, B1, B0, segN[i], col, aux);
      }
    }
  }
  empty(k) { const o = this.B.get(k); return !o || !o.p.length; }
  // flush: one BufferGeometry per bucket
  build() {
    const out = {};
    for (const [k, o] of this.B) {
      if (!o.p.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(o.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(o.n, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(o.uv, 2));
      // colours are authored as display values (sRGB-like): to linear for the shading
      g.setAttribute('color', new THREE.Float32BufferAttribute(o.c.map((v) => Math.pow(Math.max(0, v), 2.2)), 3));
      g.setAttribute('aux', new THREE.Float32BufferAttribute(o.a, 1));
      g.computeBoundingSphere(); g.computeBoundingBox();
      out[k] = g;
    }
    return out;
  }
  tris() { let n = 0; for (const o of this.B.values()) n += o.p.length / 9; return n; }
}

// deterministic hash noise for weathering (no Math.random anywhere: a take must be repeatable)
export function hash3(x, y, z) { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); }
export function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const f = (t) => t * t * (3 - 2 * t), u = f(xf), v = f(yf), w = f(zf);
  const L = (a, b, t) => a + (b - a) * t;
  const h = (i, j, k) => hash3(xi + i, yi + j, zi + k);
  return L(L(L(h(0, 0, 0), h(1, 0, 0), u), L(h(0, 1, 0), h(1, 1, 0), u), v), L(L(h(0, 0, 1), h(1, 0, 1), u), L(h(0, 1, 1), h(1, 1, 1), u), v), w);
}
