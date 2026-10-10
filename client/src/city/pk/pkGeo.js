// AR33 PROPS geometry helpers (part pk, docs/notes/ar33-props.md): a model is a set of BufferGeometries by material key,
// built from lathes, swept tubes, bevelled boxes and extrusions, with UVs in metres (mat/pbrLib.js maps a UV metre to
// its set's real size) and merged per material at the end.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// UVs in metres by a box projection in object space (the dominant axis of each face's normal picks the plane), after the
// geometry is posed. Curved pieces get their own (lathe, tube) before posing.
export function boxUV(g) {
  g = g.index ? g.toNonIndexed() : g;
  const p = g.getAttribute('position'), n = p.count, uv = new Float32Array(n * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), nn = new THREE.Vector3();
  for (let i = 0; i < n; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    nn.subVectors(c, b).cross(new THREE.Vector3().subVectors(a, b));
    const ax = Math.abs(nn.x), ay = Math.abs(nn.y), az = Math.abs(nn.z);
    for (let k = 0; k < 3; k++) {
      const v = k === 0 ? a : k === 1 ? b : c;
      let u0, v0;
      if (ay >= ax && ay >= az) { u0 = v.x; v0 = v.z; } else if (ax >= az) { u0 = v.z; v0 = v.y; } else { u0 = v.x; v0 = v.y; }
      uv[(i + k) * 2] = u0; uv[(i + k) * 2 + 1] = v0;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
const strip = (g, keep = ['position', 'normal', 'uv']) => {
  for (const k of Object.keys(g.attributes)) if (!keep.includes(k)) g.deleteAttribute(k);
  return g;
};
// a solid of revolution about +y from a profile [[r, y], ...] (bottom to top); UV u = arc length, v = the profile's length
export function lathe(profile, seg = 16, phi0 = 0, phiLen = Math.PI * 2) {
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y));
  const g = new THREE.LatheGeometry(pts, seg, phi0, phiLen);
  const uv = g.getAttribute('uv'), p = g.getAttribute('position');
  // along the profile
  const acc = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const rMax = Math.max(...profile.map((q) => q[0]));
  for (let i = 0; i < uv.count; i++) {
    const j = i % pts.length;
    uv.setXY(i, uv.getX(i) * phiLen * rMax, acc[j]);
  }
  void p;
  return strip(g.toNonIndexed());
}
export const cyl = (r0, r1, h, seg = 12, y0 = 0, open = false) => {
  const g = new THREE.CylinderGeometry(r1, r0, h, seg, 1, open);
  g.translate(0, y0 + h / 2, 0);
  const uv = g.getAttribute('uv');
  const rr = Math.max(r0, r1);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.PI * 2 * rr, uv.getY(i) * h);
  return strip(g.toNonIndexed());
};
// a bevelled box by its centre
// LOD.far: the far model's bevelled boxes are plain boxes (12 triangles instead of a few hundred)
export const LOD = { far: false };
export function rbox(w, h, d, r = 0.01, x = 0, y = 0, z = 0, seg = 2) {
  const rr = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  const g = rr > 0.002 && !LOD.far ? new RoundedBoxGeometry(w, h, d, seg, rr) : new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return strip(boxUV(g));
}
export const box = (w, h, d, x = 0, y = 0, z = 0) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return strip(boxUV(g)); };
// a tube swept along a curve (THREE.Curve or points), radius r (number or (t) => r), UV u = around (m), v = along (m)
export function tube(path, r, tubSeg = 24, radSeg = 10, closed = false) {
  const curve = Array.isArray(path) ? new THREE.CatmullRomCurve3(path.map((p) => (p.isVector3 ? p : new THREE.Vector3(...p))), false, 'centripetal', 0.5) : path;
  const len = curve.getLength();
  const frames = curve.computeFrenetFrames(tubSeg, closed);
  const pos = [], nor = [], uvs = [], idx = [];
  const P = new THREE.Vector3(), N = new THREE.Vector3();
  for (let i = 0; i <= tubSeg; i++) {
    const t = i / tubSeg;
    curve.getPointAt(t, P);
    const rad = typeof r === 'function' ? r(t) : r;
    for (let j = 0; j <= radSeg; j++) {
      const v = (j / radSeg) * Math.PI * 2, s = Math.sin(v), c = -Math.cos(v);
      N.set(c * frames.normals[i].x + s * frames.binormals[i].x, c * frames.normals[i].y + s * frames.binormals[i].y, c * frames.normals[i].z + s * frames.binormals[i].z).normalize();
      pos.push(P.x + rad * N.x, P.y + rad * N.y, P.z + rad * N.z);
      nor.push(N.x, N.y, N.z);
      uvs.push((j / radSeg) * Math.PI * 2 * rad, t * len);
    }
  }
  for (let i = 0; i < tubSeg; i++) for (let j = 0; j < radSeg; j++) {
    const a = i * (radSeg + 1) + j, b = (i + 1) * (radSeg + 1) + j, c = (i + 1) * (radSeg + 1) + j + 1, d = i * (radSeg + 1) + j + 1;
    idx.push(a, b, d, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  return g.toNonIndexed();
}
// a straight rod from a to b
export function rod(a, b, r, seg = 8) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), L = A.distanceTo(B);
  const g = cyl(r, r, L, seg, -L / 2, true);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  g.applyQuaternion(q);
  g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  return g;
}
// an extruded 2D shape ([[x, y], ...] in the x/y plane) of depth d along +z (centred), bevelled
export function extrude(pts, d, bevel = 0.004, curveSeg = 4) {
  const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(1e-3, d - 2 * bevel), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: curveSeg });
  g.translate(0, 0, -(d - 2 * bevel) / 2);
  return strip(boxUV(g));
}
export const disc = (r, seg = 16) => { const g = new THREE.CircleGeometry(r, seg); return strip(boxUV(g)); };
export const plane = (w, h) => { const g = new THREE.PlaneGeometry(w, h); return strip(g.toNonIndexed()); };
// an open sleeve (radius r0 at y0 to r1 at y1) with UVs 0..1 around and up: a decal wrapped round a pole
export function sleeve(r0, r1, y0, y1, seg = 12) {
  const g = new THREE.CylinderGeometry(r1, r0, y1 - y0, seg, 1, true);
  g.translate(0, (y0 + y1) / 2, 0);
  return strip(g.toNonIndexed());
}

// a smooth lofted body along +x from sections [{ x, w (half width, z), t (height above the axis), b (depth below it), n (superellipse
// exponent, 2 = ellipse, higher = squarer), cy }]; closed at both ends by the first and last section's size (give them a small w).
// Indexed while the normals are computed, so the shading is smooth; UV u = along x (m), v = around (m).
export function loft(secs, ring = 14) {
  const pos = [], uvs = [], idx = [];
  const sp = (c, e) => Math.sign(c) * Math.pow(Math.abs(c), 2 / e);
  for (let i = 0; i < secs.length; i++) {
    const S = secs[i];
    for (let j = 0; j < ring; j++) {
      const a = (j / ring) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const y = (S.cy || 0) + sp(s, S.n || 2.4) * (s >= 0 ? S.t : S.b);
      pos.push(S.x, y, sp(c, S.n || 2.4) * S.w);
      uvs.push(S.x, (j / ring) * (S.w + S.t) * 4);
    }
  }
  for (let i = 0; i + 1 < secs.length; i++) for (let j = 0; j < ring; j++) {
    const a = i * ring + j, b = (i + 1) * ring + j, c = (i + 1) * ring + ((j + 1) % ring), d = i * ring + ((j + 1) % ring);
    idx.push(a, b, d, b, c, d);
  }
  // end caps: a fan round the ring's centre
  for (const [i, flip] of [[0, true], [secs.length - 1, false]]) {
    const S = secs[i], ci = pos.length / 3;
    pos.push(S.x, S.cy || 0, 0); uvs.push(S.x, 0);
    for (let j = 0; j < ring; j++) { const a = i * ring + j, b = i * ring + ((j + 1) % ring); if (flip) idx.push(ci, a, b); else idx.push(ci, b, a); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g.toNonIndexed();
}
// pose helpers (chainable on a geometry)
export const at = (g, x = 0, y = 0, z = 0) => { g.translate(x, y, z); return g; };
export const rotY = (g, a) => { g.rotateY(a); return g; };
export const rotX = (g, a) => { g.rotateX(a); return g; };
export const rotZ = (g, a) => { g.rotateZ(a); return g; };

// A model under construction: parts by material key
export class Model {
  constructor() { this.parts = new Map(); }
  add(key, ...gs) {
    let L = this.parts.get(key);
    if (!L) this.parts.set(key, (L = []));
    for (const g of gs) if (g) L.push(g.index ? g.toNonIndexed() : g);
    return this;
  }
  // another model placed by a matrix (or x, y, z, yaw)
  put(m, x = 0, y = 0, z = 0, yaw = 0, s = 1) {
    const M = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(s, s, s));
    for (const [k, L] of m.parts) for (const g of L) this.add(k, g.clone().applyMatrix4(M));
    return this;
  }
  // merged { key: BufferGeometry }, triangles
  bake() {
    const out = {};
    let tris = 0;
    for (const [k, L] of this.parts) {
      const gs = L.map((g) => { const q = g.index ? g.toNonIndexed() : g; for (const a of Object.keys(q.attributes)) if (!['position', 'normal', 'uv'].includes(a)) q.deleteAttribute(a); if (!q.getAttribute('uv')) boxUV(q); return q; });
      const m = mergeGeometries(gs, false);
      if (!m) continue;
      m.computeBoundingSphere(); m.computeBoundingBox();
      out[k] = m;
      tris += m.getAttribute('position').count / 3;
    }
    return { parts: out, tris };
  }
}
