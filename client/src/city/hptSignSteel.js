// AR33 HPT: structural steel for the Pepsi-Cola sign and the LONG ISLAND gantries (docs/notes/ar33-hpt.md). Members are
// real sections swept along their axis (equal angles, channels, wide-flange beams, pipes, flat bars, plates), gathered
// into one merged geometry per material (a Builder), with UVs in metres (u along the member, v round its section), so a
// tiling PBR set (mat/pbrLib.js) maps at its real scale. Sections are in metres; `up` picks the section's roll.
import * as THREE from 'three';

// ---------------------------------------------------------------- sections (closed outlines in the section plane: x, y)
// an equal angle L a x a x t, its heel at the member's axis (the outline is offset so the axis runs through the heel)
export const angle = (a, t) => [[0, 0], [a, 0], [a, t], [t, t], [t, a], [0, a]];
// a channel C d x b x t (web along y, flanges toward +x), axis at the web's middle
export const channel = (d, b, t, tf = t) => [[0, -d / 2], [b, -d / 2], [b, -d / 2 + tf], [t, -d / 2 + tf], [t, d / 2 - tf], [b, d / 2 - tf], [b, d / 2], [0, d / 2]];
// a wide-flange (I) section, depth d, flange width b, web tw, flange tf, centred
export const wide = (d, b, tw, tf) => {
  const h = d / 2, w = b / 2, s = tw / 2;
  return [[-w, -h], [w, -h], [w, -h + tf], [s, -h + tf], [s, h - tf], [w, h - tf], [w, h], [-w, h], [-w, h - tf], [-s, h - tf], [-s, -h + tf], [-w, -h + tf]];
};
export const rect = (w, h) => [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
export const circle = (r, n = 10) => Array.from({ length: n }, (_, i) => [Math.cos((i / n) * Math.PI * 2) * r, Math.sin((i / n) * Math.PI * 2) * r]);
// a tee (the stem down), for rails' caps and bar-grating bearers
export const tee = (b, d, t) => [[-b / 2, 0], [b / 2, 0], [b / 2, -t], [t / 2, -t], [t / 2, -d], [-t / 2, -d], [-t / 2, -t], [-b / 2, -t]];

// an outline wound counter-clockwise (x right, y up), and its triangles, each counter-clockwise
const area2 = (P) => P.reduce((s, p, i) => s + p[0] * P[(i + 1) % P.length][1] - P[(i + 1) % P.length][0] * p[1], 0);
export const ccw = (P) => (area2(P) < 0 ? P.slice().reverse() : P);
function tris2(P) {
  const T = THREE.ShapeUtils.triangulateShape(P.map(([x, y]) => new THREE.Vector2(x, y)), []);
  return T.map(([i, j, k]) => ((P[j][0] - P[i][0]) * (P[k][1] - P[i][1]) - (P[j][1] - P[i][1]) * (P[k][0] - P[i][0]) >= 0 ? [i, j, k] : [i, k, j]));
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _u = new THREE.Vector3();
const _p = new THREE.Vector3(), _n = new THREE.Vector3();

// A Builder gathers triangles (non-indexed: flat-shaded sections keep their crisp edges; smooth sections share normals
// round the loop) for one material; `geometry()` hands the merged BufferGeometry over.
export class Builder {
  constructor() { this.P = []; this.N = []; this.U = []; }
  get tris() { return this.P.length / 9; }
  tri(a, b, c, na, nb, nc, ua, ub, uc) {
    this.P.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    this.N.push(na.x, na.y, na.z, nb.x, nb.y, nb.z, nc.x, nc.y, nc.z);
    this.U.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
  }
  // sweep `sec` from a to b (arrays or Vector3). `up` (a direction) sets the section's y axis (projected off the
  // member's axis); smooth = shared normals round the loop (pipes); caps = close the ends
  member(sec, a, b, up = null, { smooth = false, caps = true, rot = 0 } = {}) {
    _a.set(a[0] ?? a.x, a[1] ?? a.y, a[2] ?? a.z); _b.set(b[0] ?? b.x, b[1] ?? b.y, b[2] ?? b.z);
    _d.subVectors(_b, _a); const L = _d.length(); if (L < 1e-4) return;
    _d.divideScalar(L);
    if (up) _u.set(up[0] ?? up.x, up[1] ?? up.y, up[2] ?? up.z); else _u.set(0, 1, 0);
    if (Math.abs(_u.dot(_d)) > 0.98) _u.set(Math.abs(_d.x) < 0.9 ? 1 : 0, 0, Math.abs(_d.x) < 0.9 ? 0 : 1);
    _y.copy(_u).addScaledVector(_d, -_u.dot(_d)).normalize();
    _x.crossVectors(_y, _d).normalize();
    if (rot) { const c = Math.cos(rot), s = Math.sin(rot); const X = _x.clone(), Y = _y.clone(); _x.copy(X).multiplyScalar(c).addScaledVector(Y, s); _y.copy(Y).multiplyScalar(c).addScaledVector(X, -s); }
    sec = ccw(sec);
    const n = sec.length;
    const pt = (i, end) => { const [sx, sy] = sec[i % n]; return new THREE.Vector3().copy(end ? _b : _a).addScaledVector(_x, sx).addScaledVector(_y, sy); };
    // perimeter coordinate (v, metres) at each outline vertex
    const per = [0];
    for (let i = 1; i <= n; i++) per.push(per[i - 1] + Math.hypot(sec[i % n][0] - sec[i - 1][0], sec[i % n][1] - sec[i - 1][1]));
    const vn = [];   // smooth: per-vertex outward normals
    if (smooth) for (let i = 0; i < n; i++) { const [sx, sy] = sec[i]; vn.push(new THREE.Vector3().addScaledVector(_x, sx).addScaledVector(_y, sy).normalize()); }
    for (let i = 0; i < n; i++) {
      const a0 = pt(i, 0), a1 = pt(i + 1, 0), b0 = pt(i, 1), b1 = pt(i + 1, 1);
      let n0, n1;
      if (smooth) { n0 = vn[i]; n1 = vn[(i + 1) % n]; } else {
        const ex = sec[(i + 1) % n][0] - sec[i][0], ey = sec[(i + 1) % n][1] - sec[i][1];
        n0 = n1 = new THREE.Vector3().addScaledVector(_x, ey).addScaledVector(_y, -ex).normalize();
      }
      const v0 = per[i], v1 = per[i + 1];
      this.tri(a0, a1, b1, n0, n1, n1, [0, v0], [0, v1], [L, v1]);
      this.tri(a0, b1, b0, n0, n1, n0, [0, v0], [L, v1], [L, v0]);
    }
    if (caps && n >= 3) {
      // (x, y, axis) is right-handed: a triangle counter-clockwise in the section has the +axis normal (the b end)
      const nA = _d.clone().negate(), nB = _d.clone();
      for (const [i, j, k] of tris2(sec)) {
        this.tri(pt(i, 0), pt(k, 0), pt(j, 0), nA, nA, nA, sec[i], sec[k], sec[j]);
        this.tri(pt(i, 1), pt(j, 1), pt(k, 1), nB, nB, nB, sec[i], sec[j], sec[k]);
      }
    }
  }
  // an axis-aligned-in-frame box given by its centre, half extents along the three axes ax, ay, az (Vector3s, unit)
  box(c, hx, hy, hz, ax = X1, ay = Y1, az = Z1) {
    const C = new THREE.Vector3(c[0] ?? c.x, c[1] ?? c.y, c[2] ?? c.z);
    const f = (sx, sy, sz) => new THREE.Vector3().copy(C).addScaledVector(ax, sx * hx).addScaledVector(ay, sy * hy).addScaledVector(az, sz * hz);
    const quad = (p0, p1, p2, p3, nrm, w, h) => { this.tri(p0, p1, p2, nrm, nrm, nrm, [0, 0], [w, 0], [w, h]); this.tri(p0, p2, p3, nrm, nrm, nrm, [0, 0], [w, h], [0, h]); };
    const nx = ax.clone(), ny = ay.clone(), nz = az.clone();
    quad(f(1, -1, 1), f(1, -1, -1), f(1, 1, -1), f(1, 1, 1), nx, 2 * hz, 2 * hy);
    quad(f(-1, -1, -1), f(-1, -1, 1), f(-1, 1, 1), f(-1, 1, -1), nx.clone().negate(), 2 * hz, 2 * hy);
    quad(f(-1, 1, 1), f(1, 1, 1), f(1, 1, -1), f(-1, 1, -1), ny, 2 * hx, 2 * hz);
    quad(f(-1, -1, -1), f(1, -1, -1), f(1, -1, 1), f(-1, -1, 1), ny.clone().negate(), 2 * hx, 2 * hz);
    quad(f(-1, -1, 1), f(1, -1, 1), f(1, 1, 1), f(-1, 1, 1), nz, 2 * hx, 2 * hy);
    quad(f(1, -1, -1), f(-1, -1, -1), f(-1, 1, -1), f(1, 1, -1), nz.clone().negate(), 2 * hx, 2 * hy);
  }
  // a flat plate (a gusset): a polygon in the plane (o, ex, ey), thickness t along ex x ey
  plate(o, ex, ey, poly, t) {
    poly = ccw(poly);
    const O = new THREE.Vector3(o[0] ?? o.x, o[1] ?? o.y, o[2] ?? o.z), nz = new THREE.Vector3().crossVectors(ex, ey).normalize();
    const P = (x, y, z) => new THREE.Vector3().copy(O).addScaledVector(ex, x).addScaledVector(ey, y).addScaledVector(nz, z);
    const nzN = nz.clone().negate();
    for (const [i, j, k] of tris2(poly)) {
      this.tri(P(...poly[i], t / 2), P(...poly[j], t / 2), P(...poly[k], t / 2), nz, nz, nz, poly[i], poly[j], poly[k]);
      this.tri(P(...poly[i], -t / 2), P(...poly[k], -t / 2), P(...poly[j], -t / 2), nzN, nzN, nzN, poly[i], poly[k], poly[j]);
    }
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const e = new THREE.Vector3().addScaledVector(ex, b[0] - a[0]).addScaledVector(ey, b[1] - a[1]);
      const nrm = new THREE.Vector3().crossVectors(e, nz).normalize();
      const L = e.length();
      const p0 = P(a[0], a[1], -t / 2), p1 = P(b[0], b[1], -t / 2), p2 = P(b[0], b[1], t / 2), p3 = P(a[0], a[1], t / 2);
      this.tri(p0, p1, p2, nrm, nrm, nrm, [0, 0], [L, 0], [L, t]); this.tri(p0, p2, p3, nrm, nrm, nrm, [0, 0], [L, t], [0, t]);
    }
  }
  // append another builder's triangles transformed by a Matrix4
  append(B, M) {
    const nm = new THREE.Matrix3().getNormalMatrix(M);
    for (let i = 0; i < B.P.length; i += 3) {
      _p.set(B.P[i], B.P[i + 1], B.P[i + 2]).applyMatrix4(M); this.P.push(_p.x, _p.y, _p.z);
      _n.set(B.N[i], B.N[i + 1], B.N[i + 2]).applyMatrix3(nm).normalize(); this.N.push(_n.x, _n.y, _n.z);
    }
    for (const v of B.U) this.U.push(v);
  }
  geometry(M = null) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.U, 2));
    if (M) g.applyMatrix4(M);
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}
export const X1 = new THREE.Vector3(1, 0, 0), Y1 = new THREE.Vector3(0, 1, 0), Z1 = new THREE.Vector3(0, 0, 1);

// ---------------------------------------------------------------- assemblies
// a pipe handrail with posts: along the polyline pts (local points), top at h over each point, posts every `step`,
// a mid rail and a toe plate (kick board); the line's left side (seen walking from pts[0]) is `side` +1/-1 for the toe
export function railing(B, pts, { h = 1.07, step = 1.8, r = 0.024, post = 0.05, mid = true, toe = 0.1, up = [0, 1, 0] } = {}) {
  const P = pts.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  for (let i = 0; i + 1 < P.length; i++) {
    const a = P[i], b = P[i + 1], L = a.distanceTo(b);
    if (L < 0.05) continue;
    B.member(circle(r, 8), [a.x, a.y + h, a.z], [b.x, b.y + h, b.z], up, { smooth: true, caps: false });
    if (mid) B.member(circle(r * 0.75, 6), [a.x, a.y + h * 0.52, a.z], [b.x, b.y + h * 0.52, b.z], up, { smooth: true, caps: false });
    if (toe) B.member(rect(0.008, toe), [a.x, a.y + toe / 2, a.z], [b.x, b.y + toe / 2, b.z], up);
    const n = Math.max(1, Math.round(L / step));
    for (let k = 0; k <= n; k++) {
      if (k === n && i + 2 < P.length) continue;   // the next leg's first post
      const t = k / n, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, z = a.z + (b.z - a.z) * t;
      B.member(angle(post, 0.006), [x - post / 2, y, z - post / 2], [x - post / 2, y + h, z - post / 2], [1, 0, 0]);
    }
  }
}
// a caged ladder from (x, y0, z) to y1, rungs across ex (unit Vector3), the cage out along en
export function ladder(B, x, y0, z, y1, ex, en, { w = 0.45, cage = true } = {}) {
  const hw = w / 2;
  for (const s of [-1, 1]) B.member(rect(0.012, 0.065), [x + ex.x * hw * s, y0, z + ex.z * hw * s], [x + ex.x * hw * s, y1, z + ex.z * hw * s], [en.x, 0, en.z]);
  for (let y = y0 + 0.3; y < y1 - 0.05; y += 0.3) B.member(circle(0.012, 6), [x - ex.x * hw, y, z - ex.z * hw], [x + ex.x * hw, y, z + ex.z * hw], [0, 1, 0], { smooth: true, caps: false });
  if (!cage || y1 - y0 < 3) return;
  const R = 0.36, cx = x + en.x * (R + 0.1), cz = z + en.z * (R + 0.1);
  for (let y = y0 + 2.3; y < y1; y += 1.2) {
    const ring = [];
    for (let k = 0; k <= 8; k++) { const a = Math.PI + (k / 8) * Math.PI; ring.push([cx + ex.x * Math.cos(a) * R * -1 + en.x * Math.sin(a) * -R, y, cz + ex.z * Math.cos(a) * R * -1 + en.z * Math.sin(a) * -R]); }
    for (let k = 0; k + 1 < ring.length; k++) B.member(rect(0.05, 0.008), ring[k], ring[k + 1], [0, 1, 0]);
  }
  for (let k = 1; k < 8; k += 2) {
    const a = Math.PI + (k / 8) * Math.PI, px = cx + ex.x * Math.cos(a) * -R + en.x * Math.sin(a) * -R, pz = cz + ex.z * Math.cos(a) * -R + en.z * Math.sin(a) * -R;
    B.member(rect(0.04, 0.008), [px, y0 + 2.3, pz], [px, y1, pz], [en.x, 0, en.z]);
  }
}
// hex bolt heads (a short 6-sided prism) at a point, pointing along n (unit Vector3)
export function bolt(B, p, n, r = 0.014, h = 0.012) {
  B.member(circle(r, 6), [p[0], p[1], p[2]], [p[0] + n.x * h, p[1] + n.y * h, p[2] + n.z * h], null, { caps: true });
}
