// AR33 facade kit: geometry primitives (owner KIT, docs/notes/ar33-kit.md). Everything is built in a FACE FRAME:
// u along the wall from its left end to its right end as seen from the street, y up from the sidewalk at the front, w
// out of the wall plane (w = 0 the face, negative into the building). A Frame maps (u, y, w) to world metres relative to
// an origin (the cell the building is merged into); (u, y, w) -> (U, Y, N) is a proper rotation, so a polygon wound
// counter-clockwise as seen from +w stays front-facing. UVs are metres (u along the wall, v up), which is what
// mat/pbrLib.js's sets expect.
import * as THREE from 'three';
import earcut from 'earcut';

// ------------------------------------------------------------------ the sink: one indexed triangle list per material
// Growable typed arrays (a building writes ~100k vertices; JS number arrays and their conversion were half the build).
// AR34 w2 s6: the vertex streams in segments: a full segment is kept as it is and the next one is as large as everything
// before it (the capacities the doubling had), so a sink never copies what it holds while it grows (the copies were 0.7 s
// of a fresh page's build at qc_lenox); build() joins the segments once. P / N / T / G / C / WE / BO / TR are the current
// segment's streams, `sb` its first vertex; a vertex's normal is changed through tiltN (paneW), never by index.
export class Sink {
  constructor() {
    this.n = 0; this.ni = 0; this.cap = 0; this.icap = 0; this.cN = 0;
    this.P = null; this.N = null; this.T = null; this.G = null; this.C = null; this.I = null; this.WE = null; this.TR = null; this.BO = null;
    this.gfn = null; this.we = null;   // we: the writer's (seed, baseY, topY), carried per vertex as aWeather
    this.tr = null;                    // tr: the writer's tint over its set's base tint (AR34 shared materials), as aFkTr
    this.bo = null;                    // bo: an opaque tower glass writer's body (linear) and dirt, as aPgBody
    this.segs = []; this.sb = 0;       // the full segments ({ b, n, P, N, T, G, C, WE, BO, TR }), the current one's first vertex
    this.hasG = false; this.hasC = false; this.hasWE = false; this.hasBO = false; this.hasTR = false;
    this.weF = null;                   // the weather the vertices before the first weather writer take (that writer's)
    this._seg(512); this._growI(1536);
  }
  // a new current segment of c vertices (the streams the sink already has; zeros, BO -1, TR 1)
  _seg(c) {
    if (this.P) this.segs.push({ b: this.sb, n: this.n - this.sb, P: this.P, N: this.N, T: this.T, G: this.G, C: this.C, WE: this.WE, BO: this.BO, TR: this.TR });
    this.sb = this.n; this.cap = c;
    this.P = new Float32Array(c * 3); this.N = new Float32Array(c * 3); this.T = new Float32Array(c * 2);
    this.G = this.hasG ? new Float32Array(c) : null;
    this.C = null;
    this.WE = this.hasWE ? new Float32Array(c * 4) : null;
    this.BO = this.hasBO ? new Float32Array(c * 4).fill(-1) : null;
    this.TR = this.hasTR ? new Float32Array(c * 3).fill(1) : null;
  }
  _growI(need) {
    if (need <= this.icap) return;
    let c = Math.max(1536, this.icap * 2);
    while (c < need) c *= 2;
    const b = new Uint32Array(c);
    if (this.I) b.set(this.I.subarray(0, this.ni));
    this.I = b; this.icap = c;
  }
  get tris() { return this.ni / 3; }
  // a vertex (position relative to the cell origin, normal, metre UV, grime weight)
  v(x, y, z, nx, ny, nz, tu, tv, g) {
    let i = this.n - this.sb;
    if (i >= this.cap) { this._seg(Math.max(512, this.n)); i = 0; }
    const i3 = i * 3, i2 = i * 2;
    this.P[i3] = x; this.P[i3 + 1] = y; this.P[i3 + 2] = z;
    this.N[i3] = nx; this.N[i3 + 1] = ny; this.N[i3 + 2] = nz;
    this.T[i2] = tu; this.T[i2 + 1] = tv;
    if (g) { if (!this.G) { this.G = new Float32Array(this.cap); this.hasG = true; } this.G[i] = g; }
    const we = this.we;
    if (we) {
      // (AR34 w2 s6, MATS 06:16: aWeather is (seed, baseY, topY, dirt), the dirt -1 = the material's own)
      const w3 = we.length > 3 ? we[3] : -1;
      if (!this.WE) {
        // (the vertices written before the first weather writer take its weather: those of this segment here, the full
        // segments' in build())
        this.WE = new Float32Array(this.cap * 4); this.hasWE = true; this.weF = [we[0], we[1], we[2], w3];
        for (let j = 0; j < i; j++) { this.WE[j * 4] = we[0]; this.WE[j * 4 + 1] = we[1]; this.WE[j * 4 + 2] = we[2]; this.WE[j * 4 + 3] = w3; }
      }
      const i4 = i * 4;
      this.WE[i4] = we[0]; this.WE[i4 + 1] = we[1]; this.WE[i4 + 2] = we[2]; this.WE[i4 + 3] = w3;
    }
    const bo = this.bo;
    if (bo || this.BO) {
      if (!this.BO) { this.BO = new Float32Array(this.cap * 4).fill(-1); this.hasBO = true; }
      const i4 = i * 4;
      if (bo) { this.BO[i4] = bo[0]; this.BO[i4 + 1] = bo[1]; this.BO[i4 + 2] = bo[2]; this.BO[i4 + 3] = bo[3]; } else { this.BO[i4] = -1; this.BO[i4 + 1] = -1; this.BO[i4 + 2] = -1; this.BO[i4 + 3] = -1; }
    }
    const tr = this.tr;
    if (tr || this.TR) {
      if (!this.TR) { this.TR = new Float32Array(this.cap * 3).fill(1); this.hasTR = true; }
      if (tr) { this.TR[i3] = tr[0]; this.TR[i3 + 1] = tr[1]; this.TR[i3 + 2] = tr[2]; } else { this.TR[i3] = 1; this.TR[i3 + 1] = 1; this.TR[i3 + 2] = 1; }
    }
    return this.n++;
  }
  tri(a, b, c) {
    if (this.ni + 3 > this.icap) this._growI(this.ni + 3);
    this.I[this.ni] = a; this.I[this.ni + 1] = b; this.I[this.ni + 2] = c; this.ni += 3;
  }
  // the segment holding vertex i (the current one: null)
  _segOf(i) {
    if (i >= this.sb) return null;
    for (let k = this.segs.length - 1; k >= 0; k--) if (i >= this.segs[k].b) return this.segs[k];
    return this.segs[0];
  }
  // add (ax, ay, az) to vertex i's normal and normalise it (paneW's tilt)
  tiltN(i, ax, ay, az) {
    const s = this._segOf(i), A = s ? s.N : this.N, o = (i - (s ? s.b : this.sb)) * 3;
    const nx = A[o] + ax, ny = A[o + 1] + ay, nz = A[o + 2] + az;
    const L = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    A[o] = nx / L; A[o + 1] = ny / L; A[o + 2] = nz / L;
  }
  // set the colour of vertices [a, b) (a segment's colour stream made when first needed)
  _col(a, b, r, g, bl) {
    for (let i = Math.max(a, 0); i < b;) {
      const s = this._segOf(i), sb = s ? s.b : this.sb, e = Math.min(b, s ? s.b + s.n : this.n);
      let C = s ? s.C : this.C;
      if (!C) { C = new Float32Array((s ? s.n : this.cap) * 3); if (s) s.C = C; else this.C = C; }
      for (let j = i; j < e; j++) { const o = (j - sb) * 3; C[o] = r; C[o + 1] = g; C[o + 2] = bl; }
      i = e;
    }
  }
  // colour every vertex written since n0 (vertices never coloured stay white)
  color(n0, r, g, b) {
    if (!this.hasC) { this.hasC = true; this.cN = 0; }
    this._col(this.cN, n0, 1, 1, 1);
    this._col(n0, this.n, r, g, b);
    this.cN = this.n;
  }
  // one stream of every segment joined (k components; a segment without it: `fill` per vertex)
  _cat(key, k, fill) {
    const out = new Float32Array(this.n * k);
    const put = (b, n, a) => {
      if (a) out.set(a.length === n * k ? a : a.subarray(0, n * k), b * k);
      else if (fill) for (let j = b * k, e = (b + n) * k; j < e; j += k) for (let q = 0; q < k; q++) out[j + q] = fill[q];
    };
    for (const s of this.segs) put(s.b, s.n, s[key]);
    put(this.sb, this.n - this.sb, this[key]);
    return out;
  }
  build() {
    if (!this.ni) return null;
    const n = this.n, g = new THREE.BufferGeometry();
    const P = this._cat('P', 3);
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this._cat('N', 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(this._cat('T', 2), 2));
    if (this.hasC) {
      this._col(this.cN, n, 1, 1, 1);
      g.setAttribute('color', new THREE.BufferAttribute(this._cat('C', 3), 3));
    }
    if (this.hasG) g.setAttribute('aGrime', new THREE.BufferAttribute(this._cat('G', 1), 1));
    if (this.hasWE) g.setAttribute('aWeather', new THREE.BufferAttribute(this._cat('WE', 4, this.weF), 4));
    if (this.hasBO) g.setAttribute('aPgBody', new THREE.BufferAttribute(this._cat('BO', 4, [-1, -1, -1, -1]), 4));
    if (this.hasTR) g.setAttribute('aFkTr', new THREE.BufferAttribute(this._cat('TR', 3, [1, 1, 1]), 3));
    const ix = this.I.subarray(0, this.ni);
    g.setIndex(new THREE.BufferAttribute(n > 65535 ? ix.slice() : Uint16Array.from(ix), 1));
    // (AR34 w2 s5: the bounds straight from the typed array, as three computes them (the box's min / max, the sphere round
    // the box's centre through the farthest vertex); three's accessors were ~4 % of the kit's build)
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let i = 0, e = n * 3; i < e; i += 3) {
      const x = P[i], y = P[i + 1], z = P[i + 2];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    g.boundingBox = new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1));
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
    let r2 = 0;
    for (let i = 0, e = n * 3; i < e; i += 3) { const dx = P[i] - cx, dy = P[i + 1] - cy, dz = P[i + 2] - cz, d = dx * dx + dy * dy + dz * dz; if (d > r2) r2 = d; }
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, cy, cz), Math.sqrt(r2));
    return g;
  }
}

// ------------------------------------------------------------------ the frame
export class Frame {
  // p0 = [x, z] the left end, p1 = [x, z] the right end (as seen from the street), y0 the sidewalk level, org = [x, z]
  constructor(p0, p1, y0, org = [0, 0]) {
    this.p0 = p0; this.p1 = p1; this.y0 = y0; this.org = org;
    const dx = p1[0] - p0[0], dz = p1[1] - p0[1];
    this.L = Math.hypot(dx, dz) || 1e-6;
    this.U = [dx / this.L, dz / this.L];
    this.N = [-this.U[1], this.U[0]];            // outward (the compiled ring's winding)
    this.ux = this.U[0]; this.uz = this.U[1]; this.nx = this.N[0]; this.nz = this.N[1];
    this.ox = p0[0] - org[0]; this.oz = p0[1] - org[1];
  }
  // world position (relative to org)
  x(u, w) { return this.ox + u * this.ux + w * this.nx; }
  z(u, w) { return this.oz + u * this.uz + w * this.nz; }
  world(u, y, w) { return [this.p0[0] + u * this.ux + w * this.nx, this.y0 + y, this.p0[1] + u * this.uz + w * this.nz]; }
  // the frame as a Matrix4 (local -> world, absolute), for Object3Ds built in wall-local coordinates
  matrix(u = 0, y = 0, w = 0) {
    const [X, Y, Z] = this.world(u, y, w);
    const m = new THREE.Matrix4();
    m.set(this.ux, 0, this.nx, X,
      0, 1, 0, Y,
      this.uz, 0, this.nz, Z,
      0, 0, 0, 1);
    return m;
  }
  // a sub-frame shifted along u (a bay's own origin)
  shift(du) {
    const f = new Frame([this.p0[0] + this.ux * du, this.p0[1] + this.uz * du], this.p1, this.y0, this.org);
    f.L = this.L - du; return f;
  }
}

// ------------------------------------------------------------------ emitting into a sink through a frame
// a vertex at local (u, y, w) with a WORLD normal (nx, ny, nz)
function pushV(S, F, u, y, w, nx, ny, nz, tu, tv) {
  return S.v(F.ox + u * F.ux + w * F.nx, F.y0 + y, F.oz + u * F.uz + w * F.nz, nx, ny, nz, tu, tv, S.gfn ? S.gfn(u, y, w) : 0);
}
// a planar polygon of local points [[u, y, w], ...] with the intended local normal; wound to face it
export function poly(S, F, pts, nu, ny, nw, uvo) {
  const np = pts.length;
  if (np < 3) return;
  const a = pts[0];
  let cx = 0, cy = 0, cz = 0;
  for (let i = 1; i + 1 < np; i++) {
    const p = pts[i], q = pts[i + 1];
    const e10 = p[0] - a[0], e11 = p[1] - a[1], e12 = p[2] - a[2], e20 = q[0] - a[0], e21 = q[1] - a[1], e22 = q[2] - a[2];
    cx += e11 * e22 - e12 * e21; cy += e12 * e20 - e10 * e22; cz += e10 * e21 - e11 * e20;
  }
  const flip = cx * nu + cy * ny + cz * nw < 0;
  const nl = Math.sqrt(nu * nu + ny * ny + nw * nw) || 1;
  nu /= nl; ny /= nl; nw /= nl;
  const wx = nu * F.ux + nw * F.nx, wz = nu * F.uz + nw * F.nz;
  const au = Math.abs(nu), ay = Math.abs(ny), aw = Math.abs(nw);
  const mode = aw >= au && aw >= ay ? 0 : au >= ay ? 1 : 2;
  const ou = uvo ? uvo[0] : 0, ov = uvo ? uvo[1] : 0;
  const base = S.n;
  for (let k = 0; k < np; k++) {
    const p = pts[k], u = p[0], y = p[1], w = p[2];
    const tu = mode === 1 ? (nu > 0 ? -w : w) + ou : u + ou;
    const tv = mode === 2 ? (ny > 0 ? -w : w) + ov : y + ov;
    pushV(S, F, u, y, w, wx, ny, wz, tu, tv);
  }
  for (let i = 1; i + 1 < np; i++) {
    if (flip) S.tri(base, base + i + 1, base + i); else S.tri(base, base + i, base + i + 1);
  }
}
// a glass pane: the quad with its vertex normals tilted by up to amp radians (seeded), so each pane (and each corner of
// it) reflects a slightly different part of the sky and the street: old float glass is never one mirror
export function paneW(S, F, u0, u1, y0, y1, w, seed = 0, amp = 0.012) {
  if (u1 - u0 < 1e-4 || y1 - y0 < 1e-4) return;
  const base = S.n;
  quadW(S, F, u0, u1, y0, y1, w);
  const h = (k) => { const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return (x - Math.floor(x)) * 2 - 1; };
  const tu = h(1) * amp, ty = h(2) * amp;              // the pane's own tilt
  for (let i = 0; i < 4; i++) {
    const du = tu + h(3 + i) * amp * 0.5, dy = ty + h(7 + i) * amp * 0.5;
    S.tiltN(base + i, du * F.ux, dy, du * F.uz);
  }
}
// an axis quad on the plane w = const facing +w (or -w with back = true): u0..u1 x y0..y1
export function quadW(S, F, u0, u1, y0, y1, w, back = false, uvo) {
  if (u1 - u0 < 1e-5 || y1 - y0 < 1e-5) return;
  const s = back ? -1 : 1, nx = F.nx * s, nz = F.nz * s, ou = uvo ? uvo[0] : 0, ov = uvo ? uvo[1] : 0;
  const b = S.n;
  pushV(S, F, u0, y0, w, nx, 0, nz, u0 + ou, y0 + ov); pushV(S, F, u1, y0, w, nx, 0, nz, u1 + ou, y0 + ov);
  pushV(S, F, u1, y1, w, nx, 0, nz, u1 + ou, y1 + ov); pushV(S, F, u0, y1, w, nx, 0, nz, u0 + ou, y1 + ov);
  if (back) { S.tri(b, b + 2, b + 1); S.tri(b, b + 3, b + 2); } else { S.tri(b, b + 1, b + 2); S.tri(b, b + 2, b + 3); }
}
// a pane tilted a little about its own axes (old float glass, a sash not quite home): the quad's corners leave the plane
// by up to amp (radians) and the vertex normals follow, so the reflection of each pane differs. o.ta / o.tb force the angles
export function paneT(S, F, u0, u1, y0, y1, w, seed = 0, amp = 0.02, o = {}) {
  if (u1 - u0 < 1e-4 || y1 - y0 < 1e-4) return;
  const h = (k) => { const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return (x - Math.floor(x)) * 2 - 1; };
  const ta = o.ta ?? h(1) * amp, tb = o.tb ?? h(2) * amp;              // tilt about the horizontal axis (top out) and the vertical axis
  const um = (u0 + u1) / 2, yc = (y0 + y1) / 2, sa = Math.tan(ta), sb = Math.tan(tb);
  const nl = Math.sqrt(1 + sa * sa + sb * sb), nu = -sb / nl, ny = -sa / nl, nw = 1 / nl;
  const wx = nu * F.ux + nw * F.nx, wz = nu * F.uz + nw * F.nz;
  const b = S.n;
  const P = [[u0, y0], [u1, y0], [u1, y1], [u0, y1]];
  for (const [u, y] of P) pushV(S, F, u, y, w + (y - yc) * sa + (u - um) * sb, wx, ny, wz, u, y);
  S.tri(b, b + 1, b + 2); S.tri(b, b + 2, b + 3);
}
// a vertical quad on the plane w = const with explicit texture coordinates (a texture laid on once, not in metres):
// (tu0, tv0) at the lower left, (tu1, tv1) at the upper right
export function quadWT(S, F, u0, u1, y0, y1, w, tu0, tv0, tu1, tv1, back = false) {
  if (u1 - u0 < 1e-5 || y1 - y0 < 1e-5) return;
  const s = back ? -1 : 1, nx = F.nx * s, nz = F.nz * s;
  const b = S.n;
  pushV(S, F, u0, y0, w, nx, 0, nz, tu0, tv0); pushV(S, F, u1, y0, w, nx, 0, nz, tu1, tv0);
  pushV(S, F, u1, y1, w, nx, 0, nz, tu1, tv1); pushV(S, F, u0, y1, w, nx, 0, nz, tu0, tv1);
  if (back) { S.tri(b, b + 2, b + 1); S.tri(b, b + 3, b + 2); } else { S.tri(b, b + 1, b + 2); S.tri(b, b + 2, b + 3); }
}
export function quadU(S, F, u, y0, y1, w0, w1, sgn, uvo) {            // plane u = const, normal sgn * u
  if (y1 - y0 < 1e-5 || w1 - w0 < 1e-5) return;
  const nx = F.ux * sgn, nz = F.uz * sgn, ou = uvo ? uvo[0] : 0, ov = uvo ? uvo[1] : 0;
  const t0 = (sgn > 0 ? -w0 : w0) + ou, t1 = (sgn > 0 ? -w1 : w1) + ou;
  const b = S.n;
  pushV(S, F, u, y0, w0, nx, 0, nz, t0, y0 + ov); pushV(S, F, u, y0, w1, nx, 0, nz, t1, y0 + ov);
  pushV(S, F, u, y1, w1, nx, 0, nz, t1, y1 + ov); pushV(S, F, u, y1, w0, nx, 0, nz, t0, y1 + ov);
  // (w0 y0, w1 y0, w1 y1) winds to face -u
  if (sgn > 0) { S.tri(b, b + 2, b + 1); S.tri(b, b + 3, b + 2); } else { S.tri(b, b + 1, b + 2); S.tri(b, b + 2, b + 3); }
}
// a quad on the plane u = const with explicit texture coordinates: (tu0, tv0) at (w0, y0), (tu1, tv1) at (w1, y1)
export function quadUT(S, F, u, y0, y1, w0, w1, sgn, tu0, tv0, tu1, tv1) {
  if (y1 - y0 < 1e-5 || w1 - w0 < 1e-5) return;
  const nx = F.ux * sgn, nz = F.uz * sgn;
  const b = S.n;
  pushV(S, F, u, y0, w0, nx, 0, nz, tu0, tv0); pushV(S, F, u, y0, w1, nx, 0, nz, tu1, tv0);
  pushV(S, F, u, y1, w1, nx, 0, nz, tu1, tv1); pushV(S, F, u, y1, w0, nx, 0, nz, tu0, tv1);
  if (sgn > 0) { S.tri(b, b + 2, b + 1); S.tri(b, b + 3, b + 2); } else { S.tri(b, b + 1, b + 2); S.tri(b, b + 2, b + 3); }
}
export function quadY(S, F, u0, u1, y, w0, w1, sgn, uvo) {            // plane y = const, normal sgn * y
  if (u1 - u0 < 1e-5 || w1 - w0 < 1e-5) return;
  const ou = uvo ? uvo[0] : 0, ov = uvo ? uvo[1] : 0;
  const t0 = (sgn > 0 ? -w0 : w0) + ov, t1 = (sgn > 0 ? -w1 : w1) + ov;
  const b = S.n;
  pushV(S, F, u0, y, w0, 0, sgn, 0, u0 + ou, t0); pushV(S, F, u1, y, w0, 0, sgn, 0, u1 + ou, t0);
  pushV(S, F, u1, y, w1, 0, sgn, 0, u1 + ou, t1); pushV(S, F, u0, y, w1, 0, sgn, 0, u0 + ou, t1);
  // (u0 w0, u1 w0, u1 w1) winds to face -y
  if (sgn > 0) { S.tri(b, b + 2, b + 1); S.tri(b, b + 3, b + 2); } else { S.tri(b, b + 1, b + 2); S.tri(b, b + 2, b + 3); }
}

// ------------------------------------------------------------------ the chamfered box
// u0..u1 x y0..y1 x w0..w1 with every edge chamfered by c (the 1-2 cm bevel that catches the light). skip: a mask of
// main faces left out (1 -u, 2 +u, 4 -y, 8 +y, 16 -w, 32 +w): the face against the wall, the underside on the ground.
export const SK = { NU: 1, PU: 2, NY: 4, PY: 8, NW: 16, PW: 32 };
export function box(S, F, u0, u1, y0, y1, w0, w1, c = 0, skip = 0, uvo) {
  if (u1 < u0) [u0, u1] = [u1, u0];
  if (y1 < y0) [y0, y1] = [y1, y0];
  if (w1 < w0) [w0, w1] = [w1, w0];
  const du = u1 - u0, dy = y1 - y0, dw = w1 - w0;
  if (du < 1e-4 || dy < 1e-4 || dw < 1e-4) return;
  c = Math.min(c, 0.45 * Math.min(du, dy, dw));
  if (c < 0.0015) {
    if (!(skip & 1)) quadU(S, F, u0, y0, y1, w0, w1, -1, uvo);
    if (!(skip & 2)) quadU(S, F, u1, y0, y1, w0, w1, 1, uvo);
    if (!(skip & 4)) quadY(S, F, u0, u1, y0, w0, w1, -1, uvo);
    if (!(skip & 8)) quadY(S, F, u0, u1, y1, w0, w1, 1, uvo);
    if (!(skip & 16)) quadW(S, F, u0, u1, y0, y1, w0, true, uvo);
    if (!(skip & 32)) quadW(S, F, u0, u1, y0, y1, w1, false, uvo);
    return;
  }
  const X = [u0, u1], Y = [y0, y1], W = [w0, w1];
  const inU = (s) => (s ? -c : c);
  // the three points of the corner (su, sy, sw), one on each face meeting there
  const pU = (su, sy, sw) => [X[su], Y[sy] + inU(sy), W[sw] + inU(sw)];
  const pY = (su, sy, sw) => [X[su] + inU(su), Y[sy], W[sw] + inU(sw)];
  const pW = (su, sy, sw) => [X[su] + inU(su), Y[sy] + inU(sy), W[sw]];
  const sg = (s) => (s ? 1 : -1);
  // main faces
  for (const s of [0, 1]) {
    if (!(skip & (s ? 2 : 1))) poly(S, F, [pU(s, 0, 0), pU(s, 1, 0), pU(s, 1, 1), pU(s, 0, 1)], sg(s), 0, 0, uvo);
    if (!(skip & (s ? 8 : 4))) poly(S, F, [pY(0, s, 0), pY(1, s, 0), pY(1, s, 1), pY(0, s, 1)], 0, sg(s), 0, uvo);
    if (!(skip & (s ? 32 : 16))) poly(S, F, [pW(0, 0, s), pW(1, 0, s), pW(1, 1, s), pW(0, 1, s)], 0, 0, sg(s), uvo);
  }
  const r2 = Math.SQRT1_2, r3 = 1 / Math.sqrt(3);
  // edge chamfers
  for (const a of [0, 1]) for (const b of [0, 1]) {
    // along u: between the y face (a) and the w face (b)
    poly(S, F, [pY(0, a, b), pY(1, a, b), pW(1, a, b), pW(0, a, b)], 0, sg(a) * r2, sg(b) * r2, uvo);
    // along y: between the u face (a) and the w face (b)
    poly(S, F, [pU(a, 0, b), pU(a, 1, b), pW(a, 1, b), pW(a, 0, b)], sg(a) * r2, 0, sg(b) * r2, uvo);
    // along w: between the u face (a) and the y face (b)
    poly(S, F, [pU(a, b, 0), pU(a, b, 1), pY(a, b, 1), pY(a, b, 0)], sg(a) * r2, sg(b) * r2, 0, uvo);
  }
  // corner triangles
  for (const a of [0, 1]) for (const b of [0, 1]) for (const d of [0, 1]) {
    poly(S, F, [pU(a, b, d), pY(a, b, d), pW(a, b, d)], sg(a) * r3, sg(b) * r3, sg(d) * r3, uvo);
  }
}

// ------------------------------------------------------------------ profile extrusion along u
// prof: [[w, y], ...] an open polyline from the wall (w = 0 or less) out and back to the wall, the section of a sill,
// a cornice, a belt course, a coping. Extruded from u0 to u1; m0 / m1 the mitre slopes at the ends (tan of half the
// turn: +1 an outside 90-degree corner, -1 an inside one, 0 square), with caps on square ends unless cap: false.
// Auto-smooth: consecutive segments turning less than `smooth` degrees (default 32) share a normal (the curved
// mouldings); sharper turns stay crisp.
export function extrude(S, F, prof, u0, u1, o = {}) {
  const m0 = o.m0 || 0, m1 = o.m1 || 0, n = prof.length;
  if (n < 2 || u1 - u0 < 1e-4) return;
  const smoothCos = Math.cos(((o.smooth ?? 32) * Math.PI) / 180);
  // the closed section (the profile plus the wall line) decides which side is out
  let area = 0;
  for (let i = 0; i < n; i++) { const a = prof[i], b = prof[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  const ccw = area > 0;
  // per-segment normals in (w, y)
  const sn = [];
  for (let i = 0; i + 1 < n; i++) {
    const dw = prof[i + 1][0] - prof[i][0], dy = prof[i + 1][1] - prof[i][1], L = Math.hypot(dw, dy) || 1;
    sn.push(ccw ? [dy / L, -dw / L] : [-dy / L, dw / L]);
  }
  // accumulated length along the section for v
  const acc = [0];
  for (let i = 1; i < n; i++) acc.push(acc[i - 1] + Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]));
  const vOff = o.v0 || 0;
  for (let i = 0; i + 1 < n; i++) {
    const [nw0, ny0] = sn[i];
    // vertex normals: smooth with the neighbour when the turn is gentle
    const nA = (i > 0 && sn[i - 1][0] * nw0 + sn[i - 1][1] * ny0 > smoothCos) ? norm2([sn[i - 1][0] + nw0, sn[i - 1][1] + ny0]) : [nw0, ny0];
    const nB = (i + 2 < n && sn[i + 1][0] * nw0 + sn[i + 1][1] * ny0 > smoothCos) ? norm2([sn[i + 1][0] + nw0, sn[i + 1][1] + ny0]) : [nw0, ny0];
    const [wa, ya] = prof[i], [wb, yb] = prof[i + 1];
    const ua0 = u0 - wa * m0, ua1 = u1 + wa * m1, ub0 = u0 - wb * m0, ub1 = u1 + wb * m1;
    const NA0 = nA[0] * F.nx, NA2 = nA[0] * F.nz, NB0 = nB[0] * F.nx, NB2 = nB[0] * F.nz;
    const base = S.n;
    pushV(S, F, ua0, ya, wa, NA0, nA[1], NA2, ua0, vOff + acc[i]);
    pushV(S, F, ua1, ya, wa, NA0, nA[1], NA2, ua1, vOff + acc[i]);
    pushV(S, F, ub1, yb, wb, NB0, nB[1], NB2, ub1, vOff + acc[i + 1]);
    pushV(S, F, ub0, yb, wb, NB0, nB[1], NB2, ub0, vOff + acc[i + 1]);
    // wind to face the segment normal: (u, section tangent) x ... check with the flat normal
    const tw = wb - wa, ty = yb - ya;          // tangent in (w, y)
    // cross(U, T) in local (u, y, w): U = (1,0,0), T = (0, ty, tw) -> (0*tw - 0*ty, 0*0 - 1*tw, 1*ty - 0) = (0, -tw, ty)
    const flip = (-tw * ny0 + ty * nw0) < 0;
    if (flip) { S.tri(base, base + 2, base + 1); S.tri(base, base + 3, base + 2); }
    else { S.tri(base, base + 1, base + 2); S.tri(base, base + 2, base + 3); }
  }
  // caps on square ends
  const capPts = prof.map((p) => [p[0], p[1]]);
  const tri = earcut(capPts.flat());
  if (tri.length && o.cap !== false) {
    for (const [end, u, m] of [[0, u0, m0], [1, u1, m1]]) {
      if (Math.abs(m) > 1e-6 || (end === 0 && o.cap0 === false) || (end === 1 && o.cap1 === false)) continue;
      const nu = end ? 1 : -1;
      const cnx = nu * F.ux, cnz = nu * F.uz;
      const base = S.n;
      for (const [w, y] of capPts) pushV(S, F, u, y, w, cnx, 0, cnz, end ? -w : w, y);
      // earcut's winding follows the section's; face the cap outward
      for (let k = 0; k < tri.length; k += 3) {
        const a = tri[k], b = tri[k + 1], c = tri[k + 2];
        const [wa, ya] = capPts[a], [wb, yb] = capPts[b], [wc, yc] = capPts[c];
        // local normal of (a,b,c) along u: in (u, y, w) with u const, the cross of (0, yb-ya, wb-wa) x (0, yc-ya, wc-wa)
        const cu = (yb - ya) * (wc - wa) - (wb - wa) * (yc - ya);
        if (cu * nu > 0) S.tri(base + a, base + b, base + c); else S.tri(base + a, base + c, base + b);
      }
    }
  }
}
function norm2(v) { const L = Math.hypot(v[0], v[1]) || 1; return [v[0] / L, v[1] / L]; }

// ------------------------------------------------------------------ a wall rectangle with rectangular holes
// The face plane w = wz from u0..u1 x y0..y1 minus the holes [{u0, u1, y0, y1}], as horizontal bands of quads.
export function wallWithHoles(S, F, u0, u1, y0, y1, holes, wz = 0, uvo, cuts = null) {
  const hs = holes.map((h) => ({ u0: Math.max(u0, h.u0), u1: Math.min(u1, h.u1), y0: Math.max(y0, h.y0), y1: Math.min(y1, h.y1) }))
    .filter((h) => h.u1 - h.u0 > 1e-4 && h.y1 - h.y0 > 1e-4);
  if (!hs.length) { quadW(S, F, u0, u1, y0, y1, wz, false, uvo); return; }
  const ys = [...new Set([y0, y1, ...hs.flatMap((h) => [h.y0, h.y1])])].sort((a, b) => a - b);
  let prevKey = null, prevSeg = null, bandY0 = y0;
  const flush = (yTop) => {
    if (prevSeg) for (const [a, b] of prevSeg) quadW(S, F, a, b, bandY0, yTop, wz, false, uvo);
  };
  for (let i = 0; i + 1 < ys.length; i++) {
    const ya = ys[i], yb = ys[i + 1];
    if (yb - ya < 1e-5) continue;
    const cov = hs.filter((h) => h.y0 <= ya + 1e-6 && h.y1 >= yb - 1e-6).map((h) => [h.u0, h.u1]).sort((a, b) => a[0] - b[0]);
    let seg = [];
    let cur = u0;
    for (const [a, b] of cov) { if (a > cur + 1e-5) seg.push([cur, a]); cur = Math.max(cur, b); }
    if (u1 > cur + 1e-5) seg.push([cur, u1]);
    if (cuts && cuts.length) {
      const out = [];
      for (const [a, b] of seg) {
        let s0 = a;
        for (const c of cuts) if (c > s0 + 0.02 && c < b - 0.02) { out.push([s0, c]); s0 = c; }
        out.push([s0, b]);
      }
      seg = out;
    }
    const key = seg.map((s) => s[0].toFixed(4) + ':' + s[1].toFixed(4)).join('|');
    if (key !== prevKey) { flush(ya); prevKey = key; prevSeg = seg; bandY0 = ya; }
  }
  flush(y1);
}
// the four returns of a rectangular opening, from the face (w = 0) back to w = -d
export function reveal(S, F, h, d, o = {}) {
  const w0 = -d, w1 = o.w1 ?? 0;
  if (!o.noTop) quadY(S, F, h.u0, h.u1, h.y1, w0, w1, -1, o.uvo);          // the soffit faces down
  if (!o.noBottom) quadY(S, F, h.u0, h.u1, h.y0, w0, w1, 1, o.uvo);        // the sill seat faces up
  const wj = w1 - (o.jc || 0);                                               // a jamb chamfer takes the first jc
  quadU(S, F, h.u0, h.y0, h.y1, w0, wj, 1, o.uvo);                          // the left jamb faces +u
  quadU(S, F, h.u1, h.y0, h.y1, w0, wj, -1, o.uvo);                         // the right jamb faces -u
}

// ------------------------------------------------------------------ a horizontal polygon (roof slab, floor), world ring
// ring [[x, z], ...] world, at height y (absolute), facing up (or down), relative to org
export function flatRing(S, ring, y, org, down = false, holes = null) {
  const flat = [], hi = [];
  for (const [x, z] of ring) flat.push(x - org[0], z - org[1]);
  if (holes) for (const h of holes) { hi.push(flat.length / 2); for (const [x, z] of h) flat.push(x - org[0], z - org[1]); }
  const t = earcut(flat, hi.length ? hi : undefined);
  const base = S.n;
  for (let i = 0; i < flat.length; i += 2) {
    S.v(flat[i], y, flat[i + 1], 0, down ? -1 : 1, 0, flat[i] + org[0], flat[i + 1] + org[1], 0);
  }
  // earcut on (x, z): a triangle wound CCW in (x, z) faces -y (z is south); flip to face up
  for (let k = 0; k < t.length; k += 3) {
    const a = t[k], b = t[k + 1], c = t[k + 2];
    const ax = flat[a * 2], az = flat[a * 2 + 1], bx = flat[b * 2], bz = flat[b * 2 + 1], cx = flat[c * 2], cz = flat[c * 2 + 1];
    const cr = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);   // > 0: CCW in (x, z) -> normal along -y
    const up = cr < 0;
    if (up !== down) S.tri(base + a, base + b, base + c); else S.tri(base + a, base + c, base + b);
  }
}

// ------------------------------------------------------------------ ring helpers
export function ringArea(ring) {
  let a = 0;
  for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return a / 2;
}
// the compiled winding (outward normal (ez, -ex) for the edge i -> i + 1) has a positive shoelace sum
export function normRing(ring) { return ringArea(ring) < 0 ? ring.slice().reverse() : ring.slice(); }
// drop collinear and duplicate vertices (a 2 cm tolerance)
export function cleanRing(ring) {
  let r = ring.filter((p, i) => { const q = ring[(i + 1) % ring.length]; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.02; });
  let changed = true;
  while (changed && r.length > 3) {
    changed = false;
    for (let i = 0; i < r.length; i++) {
      const a = r[(i - 1 + r.length) % r.length], b = r[i], c = r[(i + 1) % r.length];
      const cr = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      const L = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1;
      if (Math.abs(cr) / L < 0.03) { r.splice(i, 1); changed = true; break; }
    }
  }
  return r;
}
// the same with the map from each original edge to the cleaned edge that holds it
export function cleanRingMap(ring) {
  const n = ring.length;
  let idx = ring.map((_, i) => i);
  // duplicates
  idx = idx.filter((i) => { const p = ring[i], q = ring[(i + 1) % n]; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.02; });
  let changed = true;
  while (changed && idx.length > 3) {
    changed = false;
    for (let k = 0; k < idx.length; k++) {
      const a = ring[idx[(k - 1 + idx.length) % idx.length]], b = ring[idx[k]], c = ring[idx[(k + 1) % idx.length]];
      const cr = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      const L = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1;
      if (Math.abs(cr) / L < 0.03) { idx.splice(k, 1); changed = true; break; }
    }
  }
  const out = idx.map((i) => ring[i]);
  // original edge e (ring[e] -> ring[e + 1]) lies in the cleaned edge that starts at the last kept vertex at or before e
  const map = new Array(n).fill(0);
  for (let e = 0; e < n; e++) {
    let best = idx.length - 1;
    for (let k = 0; k < idx.length; k++) if (idx[k] <= e) best = k;
    map[e] = best;
  }
  return { ring: out, map, keep: idx };
}
// edge i of the ring as a face frame: p0 = ring[i + 1] (the left end seen from outside), p1 = ring[i]
export function edgeFrame(ring, i, y0, org) {
  const n = ring.length;
  return new Frame(ring[(i + 1) % n], ring[i], y0, org);
}
// the mitre slopes at the two ends of edge i (tan of half the turn; + for an outside corner)
export function edgeMitres(ring, i) {
  const n = ring.length;
  const turn = (a, b, c) => {
    const e1 = [b[0] - a[0], b[1] - a[1]], e2 = [c[0] - b[0], c[1] - b[1]];
    const ang = Math.atan2(e1[0] * e2[1] - e1[1] * e2[0], e1[0] * e2[0] + e1[1] * e2[1]);
    return ang;   // the ring's winding: positive = a convex (outside) corner
  };
  // the face runs from ring[i + 1] (u = 0) to ring[i] (u = L): its u = 0 end is the corner at ring[i + 1], turning
  // from edge i to edge i + 1; its u = L end is the corner at ring[i], turning from edge i - 1 to edge i
  const a0 = turn(ring[i], ring[(i + 1) % n], ring[(i + 2) % n]);
  const a1 = turn(ring[(i - 1 + n) % n], ring[i], ring[(i + 1) % n]);
  const cl = (a) => Math.max(-3, Math.min(3, Math.tan(a / 2)));
  return [cl(a0), cl(a1)];
}
// deterministic hash in 0..1 (numbers to 1 mm, strings by their characters), no allocation
const _sh = new Map();
function strH(v) {
  let h = _sh.get(v);
  if (h === undefined) { h = 2166136261; for (let i = 0; i < v.length; i++) { h ^= v.charCodeAt(i); h = Math.imul(h, 16777619); } _sh.set(v, h); }
  return h;
}
export function hash(...a) {
  let h = 0x811c9dc5 | 0;
  for (let i = 0; i < a.length; i++) {
    const v = a[i];
    const x = typeof v === 'number' ? (Math.round(v * 1000) | 0) : strH(String(v));
    h = Math.imul(h ^ x, 0x01000193); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  }
  return ((h >>> 0) % 100000) / 100000;
}
