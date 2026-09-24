// Geometry helpers. Convention: "bottom-origin" — boxes sit on y=0, centered in
// X/Z, so stacking floors is additive. Merged masonry gets world-space UVs in
// the batcher so brick coursing lines up across every box of a facade.
import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _e = new THREE.Euler();

// Bottom-origin box, with enough height segments for the ground-grime gradient.
export function box(w, h, d, { segY = 0, segX = 1, segZ = 1 } = {}) {
  const sy = segY || Math.max(1, Math.min(6, Math.ceil(h / 1.6)));
  const g = new THREE.BoxGeometry(w, h, d, segX, sy, segZ);
  g.translate(0, h / 2, 0);
  return g;
}

export function cylinder(rTop, rBot, h, radial = 12, open = false) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, radial, 1, open);
  g.translate(0, h / 2, 0);
  return g;
}

export function cone(r, h, radial = 12) {
  const g = new THREE.ConeGeometry(r, h, radial);
  g.translate(0, h / 2, 0);
  return g;
}

// Single quad facing +Z, bottom-origin, with optional UV rect (atlas cell).
export function quad(w, h, uv = null) {
  const g = new THREE.PlaneGeometry(w, h);
  g.translate(0, h / 2, 0);
  if (uv) {
    const a = g.attributes.uv;
    // PlaneGeometry uv order: (0,1) (1,1) (0,0) (1,0)
    a.setXY(0, uv.u0, uv.v1); a.setXY(1, uv.u1, uv.v1);
    a.setXY(2, uv.u0, uv.v0); a.setXY(3, uv.u1, uv.v0);
    a.needsUpdate = true;
  }
  return g;
}

// Extrude a 2D profile (array of [out, up] points, meters) along X for `len`.
// Profile plane: +out = away from wall (toward viewer, +Z), +up = +Y.
// Result runs from x=-len/2 to x=+len/2, back plane at z=0, base of profile at y=0.
export function profileAlongX(points, len) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false, curveSegments: 4 });
  // extrude runs along +Z with profile in XY; rotate so length runs along X:
  // profile "out" (x) should become +Z, length (z) becomes X.
  g.rotateY(Math.PI / 2);            // now length along +X, profile out along... check handedness
  g.translate(-len / 2, 0, 0);
  return g;
}

// Lathe (for water tank bodies, finials).
export function lathe(points, segments = 20) {
  const pts = points.map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.LatheGeometry(pts, segments);
}

export function tmat(x, y, z, ry = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(0, ry, 0);
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(_e),
    new THREE.Vector3(sx, sy, sz),
  );
}

// Merge a list of {geom, x,y,z,ry} into one geometry (local composition helper
// for kit parts — NOT the scene-level batcher).
export function compose(items) {
  const geoms = [];
  for (const it of items) {
    const g = it.geom.clone();
    if (it.ry) g.rotateY(it.ry);
    if (it.rx) g.rotateX(it.rx);
    if (it.rz) g.rotateZ(it.rz);
    g.translate(it.x || 0, it.y || 0, it.z || 0);
    geoms.push(g);
  }
  return mergeGeoms(geoms);
}

// Minimal merge that tolerates attribute differences (position/normal/uv).
export function mergeGeoms(geoms) {
  let vCount = 0, iCount = 0;
  for (const g of geoms) {
    vCount += g.attributes.position.count;
    iCount += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const col = new Float32Array(vCount * 3);
  const idx = new Uint32Array(iCount);
  let vo = 0, io = 0;
  for (const g of geoms) {
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv, c = g.attributes.color;
    pos.set(p.array, vo * 3);
    if (n) nor.set(n.array, vo * 3);
    if (u) uv.set(u.array.subarray(0, p.count * 2), vo * 2);
    if (c) col.set(c.array, vo * 3);
    else col.fill(1, vo * 3, (vo + p.count) * 3);
    if (g.index) {
      const gi = g.index.array;
      for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
      io += gi.length;
    } else {
      for (let i = 0; i < p.count; i++) idx[io + i] = vo + i;
      io += p.count;
    }
    vo += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

// Scale BoxGeometry's per-face 0..1 UVs to physical size so textures keep
// world scale on instanced parts (instances share geometry; batcher worldUV
// doesn't apply to them). Face order: +x -x +y -y +z -z, 4 verts each.
export function boxUV(g, w, h, d, tile = 2) {
  const uv = g.attributes.uv;
  const faces = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const [fw, fh] = faces[f];
    for (let i = f * 4; i < f * 4 + 4; i++) {
      uv.setXY(i, uv.getX(i) * fw / tile, uv.getY(i) * fh / tile);
    }
  }
  return g;
}

export function ensureColor(geom, tint = null) {
  const count = geom.attributes.position.count;
  if (!geom.attributes.color) {
    const col = new Float32Array(count * 3).fill(1);
    geom.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  if (tint) {
    const a = geom.attributes.color;
    for (let i = 0; i < count; i++) {
      a.setXYZ(i, a.getX(i) * tint.r, a.getY(i) * tint.g, a.getZ(i) * tint.b);
    }
  }
  return geom;
}

// Multiply vertex color by factor over a y-range (AO bands, grime).
export function shadeYRange(geom, y0, y1, f0, f1) {
  ensureColor(geom);
  const p = geom.attributes.position, c = geom.attributes.color;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const t = Math.min(1, Math.max(0, (y - y0) / (y1 - y0)));
    const f = f0 + (f1 - f0) * (t * t * (3 - 2 * t));
    c.setXYZ(i, c.getX(i) * f, c.getY(i) * f, c.getZ(i) * f);
  }
}
