// AR33 VIADUCT kit (vk/): riveted steel as geometry. Every member is built from rectangular plates swept along a line
// or a curve (a flange, a web, an angle's leg, a lacing bar, a batten, a gusset), merged into one mesh per material per
// build. Each face carries what the steel shader (vk/vkMats.js) needs:
//   uv   (u, v) in METRES: u along the member, v across the face from one edge;
//   aRv  (W, e, c, p): the face's width W and its rivet rows: two rows e in from both edges (e > 0), two rows c either
//        side of the middle (c > 0) or one row in the middle (e = c = 0), a grid at spacing -c between the edge rows
//        (c < 0); p the pitch along (p < 0: one rivet |p| in from each end only; p = 0: no rivets);
//   aJ   (L, seed): the member's length (joint rust near both ends) and a per-member seed.
// Frames: a member runs from P0 to P1 (world [x, y, z]); U is its "up" (a hint, made square to the member), S = U x T
// its side, so (S, U, T) is right handed. A rectangle's corners go round (-S -U) (+S -U) (+S +U) (-S +U); face k joins
// corner k to k+1: 0 = the -U face, 1 = +S, 2 = +U, 3 = -S.
import * as THREE from 'three';

export const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  mad: (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};
const { add, sub, mul, mad, dot, cross, len, norm } = V;
export const UP = [0, 1, 0];

// the frame (S, U, T) of a member along T with up hint U0 (T nearly parallel to U0: a fallback hint)
export function frameOf(T, U0) {
  let S = cross(U0, T);
  if (len(S) < 1e-4) S = cross(Math.abs(T[1]) < 0.9 ? UP : [1, 0, 0], T);
  S = norm(S);
  const U = norm(cross(T, S));
  return [S, U];
}

// rivet specs [e, c, p] (vk/vkMats.js reads them per face)
export const RIV = {
  none: null,
  edges: (e = 0.045, p = 0.1) => [e, 0, p],
  mid: (p = 0.1) => [0, 0, p],
  pair: (c = 0.07, p = 0.1) => [0, c, p],
  grid: (e = 0.05, g = 0.09, p = 0.09) => [e, -g, p],
  ends: (inset = 0.05) => [0, 0, -inset],
};

let _seed = 1;
export class Geo {
  constructor() { this.M = new Map(); this.RI = new Map(); this.zone = null; this.SP = []; }
  // a strip of anti-pigeon spikes along a ledge P0 -> P1 (U its up): a clear base strip and a cluster of stainless
  // wires every 11 cm (instanced crossed cards, vk/vkMats.js spikeMat)
  spikes(P0, P1, U = UP) {
    const d = sub(P1, P0), L = len(d); if (L < 0.2) return;
    const T = mul(d, 1 / L), n = Math.max(1, Math.round(L / 0.11));
    for (let k = 0; k < n; k++) { const p = add(P0, mul(d, (k + 0.5) / n)); this.SP.push(p[0], p[1], p[2], T[0], T[1], T[2], U[0], U[1], U[2]); }
  }
  // rivets as instanced heads (geometry) where a street lens comes close: under world y1 within r of (cx, cz), on the
  // steel materials that carry a band (vk/vkMats.js vkBandY: the shader draws no rivets under it)
  rivZone(y1, cx, cz, r) { this.zone = { y1, cx, cz, r2: r * r }; return this; }
  _rivOk(mat, P) { const z = this.zone, b = mat.userData && mat.userData.vk && mat.userData.vk.vkBand; return !!(z && b && b.value.x > -1000 && P[1] < z.y1 + 0.02 && (P[0] - z.cx) ** 2 + (P[2] - z.cz) ** 2 < z.r2); }
  _riv(mat, P, n) { let a = this.RI.get(mat); if (!a) this.RI.set(mat, (a = [])); a.push(P[0] + n[0] * 0.001, P[1] + n[1] * 0.001, P[2] + n[2] * 0.001, n[0], n[1], n[2]); }
  // the rivet centres of a face a (u0, 0) b (u0, W) c (u1, W) d (u1, 0), as the shader lays them (vkRivet)
  _faceRivets(mat, a, b, d, u0, u1, rv, L, n) {
    const [W, e, c, p] = rv;
    if (!this.zone || Math.abs(p) < 1e-4 || W > 500) return;
    if (Math.min(a[1], b[1], d[1]) > this.zone.y1 + 0.02) return;
    const us = [];
    if (p > 0) { for (let k = Math.ceil(u0 / p - 0.5); (k + 0.5) * p <= u1; k++) { const u = (k + 0.5) * p; if (u >= u0) us.push(u); } }
    else for (const u of [-p, L + p]) if (u >= u0 && u <= u1) us.push(u);
    const vs = [];
    if (c < 0) { const gs = -c; for (let v = e; v <= W - e + 1e-6; v += gs) vs.push(v); }
    else { if (e > 0) vs.push(e, W - e); if (c > 0) vs.push(W / 2 - c, W / 2 + c); if (!(e > 0) && !(c > 0)) vs.push(W / 2); }
    const du = u1 - u0 || 1, AD = sub(d, a), AB = sub(b, a);
    for (const u of us) for (const v of vs) {
      if (v < 0.012 || v > W - 0.012) continue;
      const P = add(a, add(mul(AD, (u - u0) / du), mul(AB, v / (W || 1))));
      if (this._rivOk(mat, P)) this._riv(mat, P, n);
    }
  }
  _b(mat) { let b = this.M.get(mat); if (!b) this.M.set(mat, (b = { p: [], n: [], t: [], r: [], j: [], i: [], nv: 0 })); return b; }
  get empty() { for (const b of this.M.values()) if (b.nv) return false; return true; }
  // one quad a b c d (counter-clockwise seen from outside); n its normal; uvs [[u, v] x4]; rv [W, e, c, p]; j [L, seed]
  quad(mat, a, b, c, d, n, uvs, rv, j) {
    const B = this._b(mat), o = B.nv;
    for (const [q, uv] of [[a, uvs[0]], [b, uvs[1]], [c, uvs[2]], [d, uvs[3]]]) {
      B.p.push(q[0], q[1], q[2]); B.n.push(n[0], n[1], n[2]); B.t.push(uv[0], uv[1]);
      B.r.push(rv[0], rv[1], rv[2], rv[3]); B.j.push(j[0], j[1]);
    }
    B.i.push(o, o + 1, o + 2, o, o + 2, o + 3);
    B.nv += 4;
    if (this.zone && rv[3]) this._faceRivets(mat, a, b, d, uvs[0][0], uvs[3][0], rv, j[0], n);
  }
  // a quad strip with its own per-vertex normals (a curved face): rows A[k], B[k] (two edges), normals N[k]
  strip(mat, A, Bv, N, us, W, rv, j) {
    const B = this._b(mat), o = B.nv, n = A.length;
    for (let k = 0; k < n; k++) {
      for (const [q, v] of [[A[k], 0], [Bv[k], W]]) {
        B.p.push(q[0], q[1], q[2]); B.n.push(N[k][0], N[k][1], N[k][2]); B.t.push(us[k], v);
        B.r.push(rv[0], rv[1], rv[2], rv[3]); B.j.push(j[0], j[1]);
      }
    }
    for (let k = 0; k + 1 < n; k++) { const a = o + k * 2; B.i.push(a, a + 1, a + 3, a, a + 3, a + 2); }
    B.nv += n * 2;
    if (this.zone && rv[3]) for (let k = 0; k + 1 < n; k++) this._faceRivets(mat, A[k], Bv[k], A[k + 1], us[k], us[k + 1], rv, j[0], norm(add(N[k], N[k + 1])));
  }
  // flat polygon (convex, counter-clockwise seen from n)
  poly(mat, P, n, uvOf, rv = [1, 0, 0, 0], j = [1, 0]) {
    const B = this._b(mat), o = B.nv;
    for (const q of P) { const uv = uvOf(q); B.p.push(q[0], q[1], q[2]); B.n.push(n[0], n[1], n[2]); B.t.push(uv[0], uv[1]); B.r.push(rv[0], rv[1], rv[2], rv[3]); B.j.push(j[0], j[1]); }
    for (let k = 1; k + 1 < P.length; k++) B.i.push(o, o + k, o + k + 1);
    B.nv += P.length;
  }
  // a rectangular bar from P0 to P1: w across (S), h up (U), offset o.off = [s, u] from the line; o.rv = [f0, f1, f2, f3]
  // rivet specs per face (see RIV), o.caps (default both), o.seed, o.len (the member length for joint rust)
  rect(mat, P0, P1, U0, w, h, o = {}) {
    const d = sub(P1, P0), L = len(d);
    if (L < 1e-4) return;
    const T = mul(d, 1 / L), [S, U] = frameOf(T, U0);
    this.sweep(mat, [P0, P1], [S, S], [U, U], w, h, o, [0, L]);
  }
  // the same along a polyline pts with frames per point (S[k], U[k]); us = arc lengths (computed when left out)
  sweep(mat, pts, Ss, Us, w, h, o = {}, us = null) {
    const n = pts.length;
    if (n < 2) return;
    if (!us) { us = [0]; for (let k = 1; k < n; k++) us.push(us[k - 1] + len(sub(pts[k], pts[k - 1]))); }
    const L = o.len ?? us[n - 1], seed = o.seed ?? (_seed = (_seed * 16807) % 2147483647) % 997;
    const [os, ou] = o.off || [0, 0], j = [L, seed];
    const hw = w / 2, hh = h / 2;
    const cs = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
    const C = pts.map((p, k) => cs.map(([s, u]) => add(add(p, mul(Ss[k], s + os)), mul(Us[k], u + ou))));
    const rvs = o.rv || [];
    const fw = [w, h, w, h];
    for (let f = 0; f < 4; f++) {
      const spec = rvs[f] || null, W = fw[f];
      const rv = spec ? [W, spec[0], spec[1], spec[2]] : [W, 0, 0, 0];
      const A = [], Bv = [], N = [];
      for (let k = 0; k < n; k++) {
        A.push(C[k][f]); Bv.push(C[k][(f + 1) % 4]);
        // outward normal of face f: -U, +S, +U, -S
        N.push(f === 0 ? mul(Us[k], -1) : f === 1 ? Ss[k] : f === 2 ? Us[k] : mul(Ss[k], -1));
      }
      if (n === 2) this.quad(mat, A[0], Bv[0], Bv[1], A[1], N[0], [[us[0], 0], [us[0], W], [us[1], W], [us[1], 0]], rv, j);
      else this.strip(mat, A, Bv, N, us, W, rv, j);
    }
    if (o.caps !== false) {
      const T1 = norm(sub(pts[n - 1], pts[n - 2])), T0 = norm(sub(pts[1], pts[0]));
      const cuv = (k) => (q) => { const r = sub(q, add(pts[k], add(mul(Ss[k], os), mul(Us[k], ou)))); return [dot(r, Ss[k]) + hw, dot(r, Us[k]) + hh]; };
      if (o.caps !== 'start') this.poly(mat, C[n - 1], T1, cuv(n - 1), [h, 0, 0, 0], [w, seed]);
      if (o.caps !== 'end') this.poly(mat, C[0].slice().reverse(), mul(T0, -1), cuv(0), [h, 0, 0, 0], [w, seed]);
    }
  }
  // a cylinder (pins, bolts, rods) from P0 to P1, radius r, n sides
  cyl(mat, P0, P1, r, n = 12, o = {}) {
    const d = sub(P1, P0), L = len(d);
    if (L < 1e-4) return;
    const T = mul(d, 1 / L), [S, U] = frameOf(T, o.up || UP);
    const ring = (P) => { const out = []; for (let k = 0; k <= n; k++) { const a = (k / n) * Math.PI * 2; out.push(add(P, add(mul(S, Math.cos(a) * r), mul(U, Math.sin(a) * r)))); } return out; };
    const A = ring(P0), Bq = ring(P1), seed = o.seed ?? 7, j = [L, seed];
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
      const n0 = add(mul(S, Math.cos(a0)), mul(U, Math.sin(a0))), n1 = add(mul(S, Math.cos(a1)), mul(U, Math.sin(a1)));
      const B = this._b(mat), oo = B.nv, c = 2 * Math.PI * r;
      for (const [q, nn, uv] of [[A[k], n0, [0, (c * k) / n]], [A[k + 1], n1, [0, (c * (k + 1)) / n]], [Bq[k + 1], n1, [L, (c * (k + 1)) / n]], [Bq[k], n0, [L, (c * k) / n]]]) {
        B.p.push(q[0], q[1], q[2]); B.n.push(nn[0], nn[1], nn[2]); B.t.push(uv[0], uv[1]); B.r.push(c, 0, 0, 0); B.j.push(j[0], j[1]);
      }
      B.i.push(oo, oo + 1, oo + 2, oo, oo + 2, oo + 3);
      B.nv += 4;
    }
    if (o.caps !== false) {
      this.poly(mat, Bq.slice(0, n), T, (q) => [dot(sub(q, P1), S) + r, dot(sub(q, P1), U) + r], [2 * r, 0, 0, 0], j);
      this.poly(mat, A.slice(0, n).reverse(), mul(T, -1), (q) => [dot(sub(q, P0), S) + r, dot(sub(q, P0), U) + r], [2 * r, 0, 0, 0], j);
    }
  }
  // a flat plate of thickness t cut to a 2D outline (any simple polygon, [[x, y]...] in metres): the outline in the plane
  // O + ex * x + ey * y, the plate's faces at +-t/2 along n = ex x ey (cut-out artwork, brackets, sign plates)
  shape(mat, outline0, O, ex, ey, t = 0.02, o = {}) {
    const area = (L) => { let a = 0; for (let k = 0; k < L.length; k++) { const [x0, y0] = L[k], [x1, y1] = L[(k + 1) % L.length]; a += x0 * y1 - x1 * y0; } return a; };
    const outline = area(outline0) < 0 ? outline0.slice().reverse() : outline0;           // the outline counter-clockwise,
    const holes = (o.holes || []).map((h) => (area(h) > 0 ? h.slice().reverse() : h));   // holes clockwise (earcut)
    const all = outline.concat(...holes);
    const n = norm(cross(ex, ey)), tri = THREE.ShapeUtils.triangulateShape(outline.map(([x, y]) => new THREE.Vector2(x, y)), holes.map((h) => h.map(([x, y]) => new THREE.Vector2(x, y))));
    const at = (x, y, s) => add(add(add(O, mul(ex, x)), mul(ey, y)), mul(n, s * t / 2));
    const B = this._b(mat), seed = o.seed ?? 9;
    for (const s of [1, -1]) {
      const base = B.nv, nn = mul(n, s);
      for (const [x, y] of all) { const q = at(x, y, s); B.p.push(q[0], q[1], q[2]); B.n.push(nn[0], nn[1], nn[2]); B.t.push(x, y); B.r.push(1, 0, 0, 0); B.j.push(4, seed); }
      for (const [a, b, c] of tri) { if (s > 0) B.i.push(base + a, base + b, base + c); else B.i.push(base + a, base + c, base + b); }
      B.nv += all.length;
    }
    // the walls round the outline and every hole: (a, d, c, b) faces the loop's right-hand side, out of the plate
    for (const L of [outline, ...holes]) {
      for (let k = 0; k < L.length; k++) {
        const [x0, y0] = L[k], [x1, y1] = L[(k + 1) % L.length], Lk = Math.hypot(x1 - x0, y1 - y0);
        if (Lk < 1e-5) continue;
        const on = norm(add(mul(ex, (y1 - y0) / Lk), mul(ey, -(x1 - x0) / Lk)));
        const a = at(x0, y0, 1), b = at(x1, y1, 1), c = at(x1, y1, -1), d = at(x0, y0, -1);
        this.quad(mat, a, d, c, b, on, [[0, 0], [0, t], [Lk, t], [Lk, 0]], [t, 0, 0, 0], [Lk, seed]);
      }
    }
  }
  // one mesh per material into the group; returns the triangle count
  flush(group, name, o = {}) {
    let tris = 0;
    for (const [mat, B] of this.M) {
      if (!B.nv) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(B.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(B.n, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(B.t, 2));
      g.setAttribute('aRv', new THREE.Float32BufferAttribute(B.r, 4));
      g.setAttribute('aJ', new THREE.Float32BufferAttribute(B.j, 2));
      g.setIndex(B.nv > 65535 ? new THREE.Uint32BufferAttribute(B.i, 1) : new THREE.Uint16BufferAttribute(B.i, 1));
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat);
      m.name = 'ar33vk:' + name + ':' + (mat.name || 'm');
      m.castShadow = o.shadow !== false && !mat.userData.noShadow;
      m.receiveShadow = true;
      m.matrixAutoUpdate = false; m.updateMatrix();
      m.layers.enable(3);   // the far shadow cascade, like the dressed buildings
      group.add(m);
      tris += B.i.length / 3;
    }
    this.M.clear();
    for (const [mat, R] of this.RI) {
      const n = R.length / 6;
      if (!n) continue;
      const m = new THREE.InstancedMesh(rivetHead().clone(), mat, n), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), N = new THREE.Vector3(), M4 = new THREE.Matrix4(), T = new THREE.Vector3(), S1 = new THREE.Vector3(1, 1, 1);
      for (let i = 0; i < n; i++) { N.set(R[i * 6 + 3], R[i * 6 + 4], R[i * 6 + 5]).normalize(); q.setFromUnitVectors(Y, N); T.set(R[i * 6], R[i * 6 + 1], R[i * 6 + 2]); M4.compose(T, q, S1); m.setMatrixAt(i, M4); }
      m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere();
      m.name = 'ar33vk:' + name + ':rivets'; m.castShadow = false; m.receiveShadow = true; m.matrixAutoUpdate = false; m.updateMatrix();
      group.add(m); tris += n * 6;
    }
    this.RI.clear();
    if (this.SP.length && Geo.spikeMat) {
      const R = this.SP, n = R.length / 9, m = new THREE.InstancedMesh(spikeCard().clone(), Geo.spikeMat, n);
      const M4 = new THREE.Matrix4(), X = new THREE.Vector3(), Yv = new THREE.Vector3(), Z = new THREE.Vector3();
      for (let i = 0; i < n; i++) {
        X.set(R[i * 9 + 3], R[i * 9 + 4], R[i * 9 + 5]); Yv.set(R[i * 9 + 6], R[i * 9 + 7], R[i * 9 + 8]); Z.crossVectors(X, Yv).normalize(); Yv.crossVectors(Z, X).normalize();
        M4.makeBasis(X, Yv, Z); M4.setPosition(R[i * 9], R[i * 9 + 1], R[i * 9 + 2]); m.setMatrixAt(i, M4);
      }
      m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere();
      m.name = 'ar33vk:' + name + ':spikes'; m.castShadow = false; m.receiveShadow = false; m.matrixAutoUpdate = false; m.updateMatrix();
      group.add(m); tris += n * 4;
    }
    this.SP = [];
    return tris | 0;
  }
}

// a rectangle swept along a curve pts with an up vector per point (or one for all): the frames are made right handed
// (T from the points, S = U x T, U = T x S), so the faces keep their winding whatever the hints
export function path(g, mat, pts, ups, w, h, o = {}) {
  const n = pts.length, Ss = [], Us = [];
  for (let k = 0; k < n; k++) {
    const T = norm(sub(pts[Math.min(n - 1, k + 1)], pts[Math.max(0, k - 1)]));
    const [S, U] = frameOf(T, Array.isArray(ups[0]) ? ups[k] : ups);
    Ss.push(S); Us.push(U);
  }
  g.sweep(mat, pts, Ss, Us, w, h, o);
}

// a cluster of pigeon-spike wires: two crossed cards 11 cm long, 11 cm tall, the wires drawn in the card texture
let _card = null;
export function spikeCard() {
  if (_card) return _card;
  const w = 0.055, h = 0.11, P = [], N = [], T = [];
  const card = (ax, az) => { const q = [[-w * ax, 0, -w * az], [w * ax, 0, w * az], [w * ax, h, w * az], [-w * ax, h, -w * az]]; for (const [i, uv] of [[0, [0, 0]], [1, [1, 0]], [2, [1, 1]], [0, [0, 0]], [2, [1, 1]], [3, [0, 1]]]) { P.push(...q[i]); N.push(0, 1, 0); T.push(...uv); } };
  card(1, 0); card(0, 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(T, 2));
  g.computeBoundingSphere();
  return (_card = g);
}
// a button rivet head (7/8 in rivet: 36 mm across, 11 mm high), 6 triangles, standing on +Y
let _head = null;
export function rivetHead() {
  if (_head) return _head;
  const r = 0.018, h = 0.011, N = 6, P = [0, h, 0], Nn = [0, 1, 0], pos = [], nrm = [], idx = [];
  const push = (p, n) => { pos.push(...p); nrm.push(...n); return pos.length / 3 - 1; };
  // a low dome: the crown and one ring at the foot, the normals of a hemisphere (6 triangles)
  const top = push(P, Nn), r0 = [];
  for (let k = 0; k < N; k++) { const a = (k / N) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); r0.push(push([c * r, 0, s * r], norm([c * 0.9, 0.44, s * 0.9]))); }
  for (let k = 0; k < N; k++) { const k1 = (k + 1) % N; idx.push(top, r0[k1], r0[k]); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  const n = pos.length / 3;
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(n * 2).fill(0.5), 2));
  g.setAttribute('aRv', new THREE.Float32BufferAttribute(new Array(n * 4).fill(0).map((v, i) => (i % 4 === 0 ? 1 : 0)), 4));
  g.setAttribute('aJ', new THREE.Float32BufferAttribute(new Array(n * 2).fill(0).map((v, i) => (i % 2 === 0 ? 1 : 3)), 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return (_head = g);
}

// ---------------------------------------------------------------- members (built from rect sweeps)
// The member helpers take a straight member P0 -> P1 with an up hint U0, or a path (pts, Ss, Us) for a curved one.
// Dimensions in metres. Rivet rows go where the parts are riveted together.

// an I (or H) section: depth d along U, flange width bf along S, flange tf, web tw
export function ibeam(g, mat, P0, P1, U0, d, bf, tf = 0.02, tw = 0.014, o = {}) {
  const r = o.riv !== false;
  g.rect(mat, P0, P1, U0, bf, tf, { ...o, off: [0, d / 2 - tf / 2], rv: r ? [null, null, RIV.pair(bf * 0.28), null] : [] });
  g.rect(mat, P0, P1, U0, bf, tf, { ...o, off: [0, -d / 2 + tf / 2], rv: r ? [RIV.pair(bf * 0.28), null, null, null] : [] });
  g.rect(mat, P0, P1, U0, tw, d - 2 * tf, { ...o, caps: o.caps, rv: r ? [null, RIV.edges(0.06), null, RIV.edges(0.06)] : [] });
}
// a built-up plate girder: web plate (depth d), four flange angles (leg a), cover plates on both flanges (width bf),
// stiffener angles every `stiff` metres on both faces of the web; rivets on every seam
export function plateGirder(g, mat, P0, P1, U0, d, bf, o = {}) {
  const T = norm(sub(P1, P0)), [S, U] = frameOf(T, U0), L = len(sub(P1, P0));
  const tw = 0.012, a = Math.min(0.15, d * 0.14), ta = 0.016, tc = 0.016;
  const ro = { ...o };
  g.rect(mat, P0, P1, U0, tw, d, { ...ro, rv: [null, RIV.edges(a * 0.55, 0.11), null, RIV.edges(a * 0.55, 0.11)] });               // web
  for (const sy of [-1, 1]) {
    const yc = sy * (d / 2 - ta / 2);
    // cover plate over the flange (outermost)
    g.rect(mat, P0, P1, U0, bf, tc, { ...ro, off: [0, sy * (d / 2 + tc / 2)], rv: sy > 0 ? [null, null, RIV.pair(tw / 2 + a * 0.55), null] : [RIV.pair(tw / 2 + a * 0.55), null, null, null] });
    for (const sx of [-1, 1]) {
      g.rect(mat, P0, P1, U0, a, ta, { ...ro, off: [sx * (tw / 2 + a / 2), yc], caps: o.caps });                                      // horizontal leg
      g.rect(mat, P0, P1, U0, ta, a, { ...ro, off: [sx * (tw / 2 + ta / 2), sy * (d / 2 - a / 2)], caps: o.caps });                // vertical leg
    }
  }
  const st = o.stiff ?? Math.max(1.2, d * 1.0);
  if (st > 0 && L > st * 0.8) {
    const n = Math.max(1, Math.round(L / st));
    for (let k = o.endStiff === false ? 1 : 0; k <= n - (o.endStiff === false ? 1 : 0); k++) {
      const t = Math.min(Math.max(k / n, 0.004), 0.996), C = V.lerp(P0, P1, t);
      for (const sx of [-1, 1]) {
        // a stiffener angle: the outstanding leg square to the web, the other against it (filler + rivets up the middle)
        const b0 = add(C, add(mul(S, sx * (tw / 2 + 0.05)), mul(U, -d / 2 + a))), b1 = add(C, add(mul(S, sx * (tw / 2 + 0.05)), mul(U, d / 2 - a)));
        g.rect(mat, b0, b1, T, 0.1, 0.012, { seed: o.seed, rv: [null, null, null, null] });
        const c0 = add(C, add(mul(S, sx * (tw / 2 + 0.006)), mul(U, -d / 2 + a))), c1 = add(C, add(mul(S, sx * (tw / 2 + 0.006)), mul(U, d / 2 - a)));
        g.rect(mat, c0, c1, S, 0.1, 0.012, { seed: o.seed, rv: [null, null, RIV.mid(0.12), null] });
      }
    }
  }
}
// pigeon spikes on a plate girder's bottom flange angles (the ledge the birds use), on side +1 / -1 / 0 (both) of its web
export function girderSpikes(g, P0, P1, U0, d, side = 0) {
  const T = norm(sub(P1, P0)), [S, U] = frameOf(T, U0), a = Math.min(0.15, d * 0.14), tw = 0.012;
  for (const sx of side ? [side] : [-1, 1]) {
    const off = add(mul(S, sx * (tw / 2 + a * 0.55)), mul(U, -d / 2 + 0.017));
    g.spikes(add(P0, off), add(P1, off), U);
  }
}
// a channel: web depth d along U, flanges b along S pointing to +S (o.flip: to -S), thickness t
export function channel(g, mat, P0, P1, U0, d, b, t = 0.012, o = {}) {
  const sx = o.flip ? -1 : 1, os = o.off || [0, 0];
  g.rect(mat, P0, P1, U0, t, d, { ...o, off: [os[0], os[1]], rv: o.rv || [null, sx > 0 ? RIV.none : RIV.edges(0.05), null, sx > 0 ? RIV.edges(0.05) : RIV.none] });
  for (const sy of [-1, 1]) g.rect(mat, P0, P1, U0, b, t, { ...o, off: [os[0] + sx * (b / 2 - t / 2), os[1] + sy * (d / 2 - t / 2)], rv: [] });
}
// an angle: legs a (along S) and b (along U) from the heel at the line (the legs run to +S and +U unless flipped)
export function angle(g, mat, P0, P1, U0, a, b, t = 0.012, o = {}) {
  const fs = o.fs || 1, fu = o.fu || 1, os = o.off || [0, 0];
  g.rect(mat, P0, P1, U0, a, t, { ...o, off: [os[0] + fs * a / 2, os[1] + fu * t / 2], rv: o.rvA || [RIV.mid(0.12), null, RIV.mid(0.12), null] });
  g.rect(mat, P0, P1, U0, t, b - t, { ...o, off: [os[0] + fs * t / 2, os[1] + fu * (t + (b - t) / 2)], rv: o.rvB || [] });
}
// a laced member: two channels at +-b/2 along S (webs outside, flanges in) and lacing bars zig-zagging over both
// open faces (the +-U faces, depth d apart), batten plates at the ends. The lacing is what reads as "lattice".
export function laced(g, mat, P0, P1, U0, b, d, o = {}) {
  const T = norm(sub(P1, P0)), L = len(sub(P1, P0)), [S, U] = frameOf(T, U0);
  const cd = d, cb = Math.min(0.09, b * 0.3), t = 0.012;
  for (const sx of [-1, 1]) channel(g, mat, P0, P1, U0, cd, cb, t, { seed: o.seed, off: [sx * (b / 2 - t / 2), 0], flip: sx > 0 });
  const bat = Math.min(b * 1.1, 0.5), lb = o.bar ?? 0.064, lt = 0.01;
  const pitch = o.pitch ?? Math.max(0.3, b * 1.1);
  const s0 = o.end ?? bat + 0.05, s1 = L - s0;
  for (const sy of [-1, 1]) {
    const fo = sy * (d / 2 + lt / 2);
    // battens (end tie plates)
    for (const s of [0, L - bat]) {
      const A = mad(P0, T, s), Bp = mad(P0, T, s + bat);
      g.rect(mat, A, Bp, U, b + 0.02, lt, { seed: o.seed, off: [0, fo], rv: [RIV.grid(0.04, 0.08, 0.09), null, RIV.grid(0.04, 0.08, 0.09), null] });
    }
    // lacing: single (o.double false) or double (a lattice of crossing bars)
    if (s1 - s0 < 0.2) continue;
    const n = Math.max(1, Math.round((s1 - s0) / pitch)), step = (s1 - s0) / n;
    for (let k = 0; k < n; k++) {
      const sa = s0 + k * step, sb = sa + step;
      const flip = (k % 2 === 0) !== (sy > 0);
      const A = add(mad(P0, T, sa), add(mul(S, (flip ? -1 : 1) * (b / 2 - 0.04)), mul(U, fo)));
      const Bp = add(mad(P0, T, sb), add(mul(S, (flip ? 1 : -1) * (b / 2 - 0.04)), mul(U, fo)));
      g.rect(mat, A, Bp, U, lb, lt, { seed: o.seed, rv: [RIV.ends(0.035), null, RIV.ends(0.035), null], caps: true });
      if (o.double) {
        const A2 = add(mad(P0, T, sa), add(mul(S, (flip ? 1 : -1) * (b / 2 - 0.04)), mul(U, fo + sy * lt)));
        const B2 = add(mad(P0, T, sb), add(mul(S, (flip ? -1 : 1) * (b / 2 - 0.04)), mul(U, fo + sy * lt)));
        g.rect(mat, A2, B2, U, lb, lt, { seed: o.seed, rv: [RIV.ends(0.035), null, RIV.ends(0.035), null] });
      }
    }
  }
}
// a lattice strut (bracing between ribs or bents): two angle chords top and bottom (depth d, U), a single web of
// lacing bars zig-zagging between them in the member's plane
export function latticeStrut(g, mat, P0, P1, U0, d, o = {}) {
  const T = norm(sub(P1, P0)), L = len(sub(P1, P0)), [S, U] = frameOf(T, U0);
  const a = o.a ?? 0.1;
  for (const sy of [-1, 1]) {
    for (const sx of [-1, 1]) angle(g, mat, add(P0, mul(U, sy * d / 2)), add(P1, mul(U, sy * d / 2)), U0, a, a * 0.8, 0.011, { seed: o.seed, fs: sx, fu: -sy, off: [sx * 0.006, 0] });
  }
  const n = Math.max(1, Math.round(L / Math.max(0.35, d * 0.9)));
  for (let k = 0; k < n; k++) {
    const sa = (k / n) * L, sb = ((k + 1) / n) * L, up = k % 2 === 0;
    const A = add(mad(P0, T, sa), mul(U, (up ? -1 : 1) * (d / 2 - a * 0.4))), Bp = add(mad(P0, T, sb), mul(U, (up ? 1 : -1) * (d / 2 - a * 0.4)));
    g.rect(mat, A, Bp, S, 0.06, 0.01, { seed: o.seed, rv: [RIV.ends(0.03), null, RIV.ends(0.03), null] });
  }
  // gusset plates at both ends
  for (const s of [0.02, L - 0.42]) {
    const A = mad(P0, T, s), Bp = mad(P0, T, s + 0.4);
    g.rect(mat, A, Bp, U, 0.012, d + a * 0.6, { seed: o.seed, rv: [null, RIV.grid(0.05, 0.1, 0.1), null, RIV.grid(0.05, 0.1, 0.1)] });
  }
}
// a rectangular frustum (a flared casting): footprint w0 x d0 at y0 tapering to w1 x d1 at y1 round the vertical axis
// through C, its w along the horizontal unit ax; the four sloped faces (and the top ring when `top`)
export function frustum(g, mat, C, ax, w0, d0, w1, d1, y0, y1, o = {}) {
  const bx = norm(cross(UP, ax));
  const at = (sa, sb, w, d, y) => [C[0] + ax[0] * sa * w / 2 + bx[0] * sb * d / 2, y, C[2] + ax[2] * sa * w / 2 + bx[2] * sb * d / 2];
  const cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]], seed = o.seed ?? 31;
  for (let k = 0; k < 4; k++) {
    const [a0, b0] = cs[k], [a1, b1] = cs[(k + 1) % 4];
    const A = at(a0, b0, w0, d0, y0), B = at(a1, b1, w0, d0, y0), Cq = at(a1, b1, w1, d1, y1), D = at(a0, b0, w1, d1, y1);
    let n = norm(cross(sub(B, A), sub(D, A)));
    const mid = mul(add(A, Cq), 0.5);
    if (dot(n, sub(mid, [C[0], mid[1], C[2]])) < 0) n = mul(n, -1);
    const W = len(sub(B, A)), Hs = len(sub(D, A));
    // winding: counter-clockwise seen from outside
    if (dot(cross(sub(B, A), sub(D, A)), n) > 0) g.quad(mat, A, B, Cq, D, n, [[0, 0], [W, 0], [W, Hs], [0, Hs]], [Hs, 0, 0, 0], [W, seed]);
    else g.quad(mat, A, D, Cq, B, n, [[0, 0], [0, Hs], [W, Hs], [W, 0]], [Hs, 0, 0, 0], [W, seed]);
  }
}
// a cast-iron column base round a column foot at C (ground point y0): a plinth with a chamfer, the flared casting with
// two beads, bolt heads round the plinth (the els' cast bases); w x d the column's size, ax its w direction
export function castBase(g, mat, C, ax, w, d, y0, o = {}) {
  const bx = norm(cross(UP, ax)), h = o.h ?? 0.95, pw = w + 0.62, pd = d + 0.62;
  g.rect(mat, [C[0], y0, C[2]], [C[0], y0 + 0.14, C[2]], ax, pd, pw, { rv: [] });
  frustum(g, mat, C, ax, pw, pd, pw - 0.12, pd - 0.12, y0 + 0.14, y0 + 0.22);
  frustum(g, mat, C, ax, pw - 0.12, pd - 0.12, w + 0.16, d + 0.16, y0 + 0.22, y0 + h * 0.72);
  frustum(g, mat, C, ax, w + 0.16, d + 0.16, w + 0.1, d + 0.1, y0 + h * 0.72, y0 + h);
  for (const [y, s] of [[y0 + h * 0.72, 0.05], [y0 + h, 0.035]]) {
    for (const [e, f, L] of [[ax, bx, d], [bx, ax, w]]) for (const sg of [-1, 1]) {
      const off = sg * ((e === ax ? w : d) / 2 + 0.08 + s * 0.4);
      const c = add([C[0], y, C[2]], mul(e, off));
      g.rect(mat, sub(c, mul(f, (L + 0.2 + s) / 2)), add(c, mul(f, (L + 0.2 + s) / 2)), UP, s * 1.2, s, { rv: [] });
    }
  }
  for (const [sa, sb] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]]) {
    const p = [C[0] + ax[0] * sa * (pw / 2 - 0.09) + bx[0] * sb * (pd / 2 - 0.09), y0 + 0.14, C[2] + ax[2] * sa * (pw / 2 - 0.09) + bx[2] * sb * (pd / 2 - 0.09)];
    g.cyl(mat, p, [p[0], p[1] + 0.035, p[2]], 0.032, 6);
  }
}
// a flat gusset / tie plate standing in the plane (A, B, C, D) (a quad, counter-clockwise seen from n) of thickness t,
// riveted all over
export function gusset(g, mat, A, B, C, D, t = 0.014, o = {}) {
  const n = norm(cross(sub(B, A), sub(D, A)));
  const h = mul(n, t / 2), W = len(sub(B, A)), H = len(sub(D, A));
  const ex = norm(sub(B, A)), ey = norm(sub(D, A));
  const uvOf = (P0) => (q) => { const r = sub(q, P0); return [dot(r, ex), dot(r, ey)]; };
  const rv = o.riv === false ? [H, 0, 0, 0] : [H, 0.05, -0.1, 0.1];
  const seed = o.seed ?? 3;
  const F = [A, B, C, D].map((q) => add(q, h)), Bk = [A, B, C, D].map((q) => sub(q, h));
  if (g.zone && o.riv !== false && Math.min(A[1], B[1], C[1], D[1]) < g.zone.y1) {
    // the grid in the shader's (dot ex, dot ey) space, kept inside the plate by a head's radius
    const e2 = norm(sub(ey, mul(ex, dot(ey, ex)))), exy = dot(ex, ey), e2y = dot(e2, ey) || 1;
    const Q = [A, B, C, D], inside = (P) => { for (let k = 0; k < 4; k++) { const a = Q[k], b = Q[(k + 1) % 4]; if (dot(cross(sub(b, a), sub(P, a)), n) < 0.018 * len(sub(b, a))) return false; } return true; };
    const us = Q.map((q) => dot(sub(q, A), ex)), vs = Q.map((q) => dot(sub(q, A), ey));
    for (let u = (Math.ceil(Math.min(...us) / 0.1 - 0.5) + 0.5) * 0.1; u <= Math.max(...us); u += 0.1) {
      for (let v = 0.05; v <= H - 0.05 + 1e-6; v += 0.1) {
        if (v < Math.min(...vs) - 1e-6 || v > Math.max(...vs) + 1e-6) continue;
        const P = add(A, add(mul(ex, u), mul(e2, (v - u * exy) / e2y)));
        if (!inside(P) || !g._rivOk(mat, P)) continue;
        g._riv(mat, add(P, h), n); g._riv(mat, sub(P, h), mul(n, -1));
      }
    }
  }
  g.poly(mat, F, n, uvOf(F[0]), rv, [W, seed]);
  g.poly(mat, Bk.slice().reverse(), mul(n, -1), uvOf(Bk[0]), rv, [W, seed]);
  for (let k = 0; k < 4; k++) {
    const a = F[k], b = F[(k + 1) % 4], c = Bk[(k + 1) % 4], d = Bk[k];
    const e = norm(sub(b, a)), nn = norm(cross(e, n));
    const out = dot(nn, sub(a, add(A, mul(sub(C, A), 0.5)))) < 0 ? mul(nn, -1) : nn;
    const L = len(sub(b, a));
    g.quad(mat, a, d, c, b, out, [[0, 0], [0, t], [L, t], [L, 0]], [t, 0, 0, 0], [L, seed]);
  }
}
