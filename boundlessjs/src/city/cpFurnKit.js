// CP33 LANDSCAPE: the park's furniture, modelled (docs/notes/central-park-photoreal.md, LANDSCAPE, item 8). The owner,
// 2026-09-30 22:15: "update all details and objects so that nothing looks flat low poly". Until now the lamps were 10-sided
// lathes with 5 "flutes" that 10 sides could not draw, the benches were boxes, the baskets 9-sided drums. Here:
//   * THE BACON LAMP (Henry Bacon's B pole, 1907-10, under Kent Bloomer's luminaire, 1980-83): a 40-sided lathe, a stepped
//     plinth, beaded rings (the "chains of seeds and leaves"), the base's five raised leaf panels, five flutes cut into the
//     shaft in two lengths, a capital, the calyx with eight sepals, the glass urn on four swept iron ribs, the acorn finial;
//     ~10k triangles near, the old six-sided post beyond;
//   * THE 1939 WORLD'S FAIR SETTEE: cast-iron end and middle standards swept from curved centre lines with rounded edges
//     (the raked back standard, the seat bracket, the scrolled arm), eight rounded oak slats on their own UVs;
//   * THE LITTER BASKET: a wire basket of 28 vertical wires and five rings, a rolled rim, a liner;
//   * THE HOOP FENCE: round bars at 15 cm under a row of half-hoops, rails and ball-finial posts.
// Geometry only (colours as vertex colours, positions in metres, the bench facing +z): the materials are cpFlora.js's. Every
// builder is cached; the geometries are shared by every tile's instance set.
import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const IRON = '#1a261f', PAINT = '#1f3a2b', GLASS = '#ece6d6', OAK = '#cdbb99', OAK_FAR = '#6e5a46';

// colour (linear from the hex), a planar UV for the iron's micro-normal (1 uv = ~0.55 m), flat triangles list
function paint(g, hex, uv = true) {
  const c = new THREE.Color(hex), n = g.getAttribute('position').count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  if (uv) {
    const P = g.getAttribute('position'), U = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { U[i * 2] = (P.getX(i) * 1.7 + P.getZ(i) * 1.3); U[i * 2 + 1] = (P.getY(i) * 1.9 + P.getX(i) * 0.4); }
    g.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  } else if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return g.index ? g.toNonIndexed() : g;
}
const done = (list) => {
  const g = mergeGeometries(list, false);
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
};

// A lathe of [r, y] points (a repeated point is a crease), `segs` sides, the radius scaled per vertex by mod(r, y, theta);
// smooth normals (the seam column shared)
function lathe(pts, segs, hex, mod = null) {
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segs);
  if (mod) {
    const P = g.getAttribute('position');
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i), r = Math.hypot(x, z);
      if (r < 1e-5) continue;
      const k = mod(r, y, Math.atan2(z, x));
      P.setX(i, x * k); P.setZ(i, z * k);
    }
    g.computeVertexNormals();
    const N = g.getAttribute('normal'), n = pts.length;
    for (let j = 0; j < n; j++) {
      const a = j, b = segs * n + j;
      const nx = N.getX(a) + N.getX(b), ny = N.getY(a) + N.getY(b), nz = N.getZ(a) + N.getZ(b), l = Math.hypot(nx, ny, nz) || 1;
      N.setXYZ(a, nx / l, ny / l, nz / l); N.setXYZ(b, nx / l, ny / l, nz / l);
    }
  }
  return paint(g, hex);
}

// a profile smoothed through its points (a Catmull-Rom spline sampled at n spaced points): the luminaire's silhouette is the profile, so
// nine points made nine straight segments
const smoothPts = (pts, n) => new THREE.SplineCurve(pts.map(([r, y]) => new THREE.Vector2(r, y))).getSpacedPoints(n).map((v) => [Math.max(0.001, v.x), v.y]);

// ================================================================ THE LAMP
let _lamp = null;
export function lampKit() {
  if (_lamp) return _lamp;
  const P = [];
  const pt = (r, y) => P.push([r, y]);
  const bead = (r, y, rad, n = 5) => { for (let k = 0; k <= n; k++) { const a = -Math.PI / 2 + (k / n) * Math.PI; pt(r + rad * Math.cos(a), y + rad * Math.sin(a)); } };
  // the plinth, two steps and a rolled foot
  pt(0.001, 0); pt(0.236, 0); pt(0.236, 0.045); pt(0.236, 0.045); pt(0.222, 0.058); pt(0.222, 0.092); pt(0.222, 0.092); pt(0.206, 0.108);
  bead(0.2, 0.128, 0.015);
  // the flare, a trumpet from 0.19 m to 0.12 m over 0.4 m
  for (let k = 0; k <= 13; k++) { const y = 0.15 + (k / 13) * 0.37; pt(0.118 + 0.072 * Math.exp(-(y - 0.15) / 0.105), y); }
  // the collar: two beaded rings and a neck
  bead(0.121, 0.548, 0.013); pt(0.108, 0.572); bead(0.109, 0.592, 0.012); pt(0.094, 0.616);
  for (let k = 0; k <= 4; k++) pt(0.084 - k * 0.0006, 0.64 + k * 0.012);
  // the lower shaft (fluted from 0.7 m)
  for (let k = 0; k <= 11; k++) pt(0.082 - (k / 11) * 0.003, 0.69 + (k / 11) * 0.53);
  // the knee: a swelling with two beaded rings
  pt(0.079, 1.22); pt(0.098, 1.236); bead(0.098, 1.262, 0.014); pt(0.103, 1.284); bead(0.103, 1.308, 0.013); pt(0.09, 1.328); pt(0.074, 1.346);
  // the upper shaft, tapering, fluted
  for (let k = 0; k <= 16; k++) pt(0.071 - (k / 16) * 0.008, 1.37 + (k / 16) * 1.38);
  // the capital
  pt(0.063, 2.77); pt(0.078, 2.79); bead(0.081, 2.816, 0.012); pt(0.09, 2.846); for (let k = 1; k <= 5; k++) pt(0.09 + 0.028 * Math.sin((k / 5) * 1.4), 2.846 + k * 0.026);
  pt(0.118, 2.97); pt(0.1, 2.985); pt(0.064, 2.992);
  const FL = (y0, y1) => (r, y, th) => {
    // five flutes, narrow grooves between wide lands, run out at both ends
    const e = Math.min(smooth(y0, y0 + 0.07, y), 1 - smooth(y1 - 0.07, y1, y));
    if (e <= 0) return 1;
    const c = 0.5 + 0.5 * Math.cos(5 * th);
    return 1 - 0.1 * e * Math.pow(c, 6);
  };
  const leaves = (r, y, th) => {
    // five raised leaf panels up the flare
    if (y < 0.15 || y > 0.5) return 1;
    const t = (y - 0.15) / 0.35, c = Math.max(0, Math.cos(5 * th));
    return 1 + 0.17 * Math.pow(c, 2.5) * Math.sin(Math.PI * Math.pow(t, 0.8)) * (1 - 0.5 * t);
  };
  const post = lathe(P, 48, IRON, (r, y, th) => leaves(r, y, th) * FL(0.72, 1.2)(r, y, th) * FL(1.4, 2.74)(r, y, th));
  const calyx = lathe(smoothPts([[0.06, 2.985], [0.1, 2.995], [0.15, 3.005], [0.19, 3.03], [0.2, 3.055], [0.185, 3.072], [0.12, 3.08], [0.06, 3.08]], 18), 64, IRON,
    (r, y, th) => 1 + 0.07 * smooth(2.995, 3.05, y) * Math.pow(0.5 + 0.5 * Math.cos(8 * th), 2));
  const CAP = [[0.17, 3.662], [0.19, 3.658], [0.2, 3.67], [0.206, 3.69], [0.19, 3.714], [0.15, 3.757], [0.1, 3.806], [0.062, 3.848], [0.05, 3.872], [0.062, 3.886], [0.064, 3.915],
    [0.052, 3.945], [0.04, 3.975], [0.022, 4.005], [0.001, 4.03]];
  const cap = lathe(smoothPts(CAP, 40), 64, IRON);
  const URN = [[0.001, 3.05], [0.07, 3.058], [0.135, 3.1], [0.185, 3.19], [0.214, 3.3], [0.22, 3.42], [0.205, 3.54], [0.18, 3.625], [0.168, 3.662], [0.001, 3.668]];
  const glass = lathe(smoothPts(URN, 30), 64, GLASS);
  // four iron ribs swept over the glass
  const ribs = [];
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.3, ca = Math.cos(a), sa = Math.sin(a);
    const path = new THREE.CatmullRomCurve3(URN.slice(1, 9).map(([r, y]) => new THREE.Vector3((r + 0.007) * ca, y, (r + 0.007) * sa)));
    ribs.push(paint(new THREE.TubeGeometry(path, 14, 0.008, 5, false), IRON));
  }
  // the numbered plate on the shaft
  const plate = new THREE.BoxGeometry(0.078, 0.05, 0.008); plate.translate(0, 1.12, 0.086);
  const iron = done([post, calyx, cap, ...ribs, paint(plate, '#a9aaa2')]);
  // past ~40 m: a six-sided post, collar, cap and lantern (~100 triangles)
  const ironFar = lathe([[0.001, 0], [0.2, 0], [0.19, 0.12], [0.1, 0.55], [0.12, 0.62], [0.07, 0.7], [0.065, 2.8], [0.1, 2.93], [0.2, 3.05], [0.13, 3.075], [0.001, 3.08]], 6, IRON);
  const capFar = lathe([[0.19, 3.655], [0.2, 3.69], [0.05, 3.87], [0.001, 4.03]], 6, IRON);
  const glassFar = lathe([[0.001, 3.05], [0.2, 3.26], [0.21, 3.45], [0.17, 3.66], [0.001, 3.665]], 6, GLASS);
  return (_lamp = { iron, glass, ironF: done([ironFar, capFar]), glassF: (glassFar.computeBoundingSphere(), glassFar.computeBoundingBox(), glassFar), tris: { iron: iron.getAttribute('position').count / 3, glass: glass.getAttribute('position').count / 3 } });
}

// ================================================================ THE BENCH
// a bar of width w swept along a 2D centre line (y up, z forward) as a member of the cast-iron frame: a rounded outline from
// the offset curve, extruded `depth` with a rounded edge; returned in bench coordinates with its x from -depth/2 to depth/2
function bar(pts, w, depth, round = 0.5) {
  const C = new THREE.SplineCurve(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  const S = C.getSpacedPoints(Math.max(8, Math.round(C.getLength() / 0.04)));
  const L = [], R = [];
  for (let i = 0; i < S.length; i++) {
    const a = S[Math.max(0, i - 1)], b = S[Math.min(S.length - 1, i + 1)];
    let tx = b.x - a.x, ty = b.y - a.y; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const wi = w * (1 - 0.18 * (i / (S.length - 1)));   // a taper along the member
    L.push([S[i].x - ty * wi / 2, S[i].y + tx * wi / 2]); R.push([S[i].x + ty * wi / 2, S[i].y - tx * wi / 2]);
  }
  const sh = new THREE.Shape();
  sh.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i < L.length; i++) sh.lineTo(L[i][0], L[i][1]);
  // the end cap: a half-round
  { const e = S[S.length - 1], p = S[S.length - 2], tx = e.x - p.x, ty = e.y - p.y, tl = Math.hypot(tx, ty) || 1, wi = w * 0.82; for (let k = 1; k < 5; k++) { const a = (k / 5) * Math.PI; const nx = -ty / tl, ny = tx / tl; sh.lineTo(e.x + (nx * Math.cos(a) + (tx / tl) * Math.sin(a)) * wi / 2, e.y + (ny * Math.cos(a) + (ty / tl) * Math.sin(a)) * wi / 2); } }
  for (let i = R.length - 1; i >= 0; i--) sh.lineTo(R[i][0], R[i][1]);
  { const e = S[0], p = S[1], tx = p.x - e.x, ty = p.y - e.y, tl = Math.hypot(tx, ty) || 1; for (let k = 1; k < 5; k++) { const a = (k / 5) * Math.PI; const nx = ty / tl, ny = -tx / tl; sh.lineTo(e.x + (nx * Math.cos(a) - (tx / tl) * Math.sin(a)) * w / 2, e.y + (ny * Math.cos(a) - (ty / tl) * Math.sin(a)) * w / 2); } }
  const bev = Math.min(0.006, depth * 0.3 * round);
  const g = new THREE.ExtrudeGeometry(sh, { depth: depth - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev * 0.8, bevelSegments: 1, curveSegments: 3, steps: 1 });
  g.translate(0, 0, -(depth - 2 * bev) / 2);
  g.rotateY(-Math.PI / 2);   // shape x -> bench z, extrusion -> bench x
  return toCreasedNormals(g, 1.0);
}
let _bench = null;
export function benchKit() {
  if (_bench) return _bench;
  const iron = [];
  const frame = (x, arm) => {
    const parts = [];
    // front leg, splayed a little, with a foot
    parts.push(bar([[0.252, 0.0], [0.246, 0.2], [0.238, 0.41]], 0.05, 0.05));
    parts.push(bar([[0.3, 0.0], [0.252, 0.0]], 0.026, 0.05));
    // rear leg rising into the raked back standard
    parts.push(bar([[-0.292, 0.0], [-0.282, 0.2], [-0.27, 0.39], [-0.31, 0.58], [-0.385, 0.9]], 0.05, 0.05));
    parts.push(bar([[-0.34, 0.0], [-0.292, 0.0]], 0.026, 0.05));
    // the seat bracket
    parts.push(bar([[-0.275, 0.372], [0.0, 0.384], [0.245, 0.4]], 0.034, 0.05));
    if (arm) {
      // the arm: from the back standard forward and down into a scroll over the front leg
      parts.push(bar([[-0.325, 0.665], [-0.1, 0.665], [0.14, 0.658], [0.255, 0.64], [0.29, 0.6], [0.27, 0.56], [0.24, 0.575]], 0.034, 0.05));
      parts.push(bar([[0.245, 0.585], [0.242, 0.5], [0.238, 0.41]], 0.03, 0.05));
    } else {
      parts.push(bar([[-0.385, 0.9], [-0.396, 0.93]], 0.04, 0.05));
    }
    for (const p of parts) { p.translate(x, 0, 0); iron.push(paint(p, PAINT)); }
  };
  frame(-1.16, true); frame(0, false); frame(1.16, true);
  // the slats: 2.44 m, oak, rounded edges. Five on the seat (z -0.18 .. 0.19), three on the back (raked)
  const slat = (w, h, len, r) => {
    const s = new THREE.Shape(), q = 4, hw = w / 2, hh = h / 2;
    const corner = (cx, cy, a0) => { for (let k = 0; k <= q; k++) { const a = a0 + (k / q) * Math.PI / 2; s.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } };
    s.moveTo(-hw + r, -hh);
    corner(hw - r, -hh + r, -Math.PI / 2); corner(hw - r, hh - r, 0); corner(-hw + r, hh - r, Math.PI / 2); corner(-hw + r, -hh + r, Math.PI);
    const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false, curveSegments: 1, steps: 1 });
    g.translate(0, 0, -len / 2);
    g.rotateY(Math.PI / 2);   // shape x -> bench -z... (symmetric), extrusion -> bench x
    return g;
  };
  const wood = [];
  const uvWood = (g, row, off, across) => {
    const P = g.getAttribute('position'), n = P.count, U = new Float32Array(n * 2);
    let lo = 1e9, hi = -1e9;
    for (let i = 0; i < n; i++) { const a = across(P.getX(i), P.getY(i), P.getZ(i)); lo = Math.min(lo, a); hi = Math.max(hi, a); }
    for (let i = 0; i < n; i++) {
      const a = across(P.getX(i), P.getY(i), P.getZ(i));
      U[i * 2] = off + (P.getX(i) + 1.22) / 2.44 * 0.5;
      U[i * 2 + 1] = row / 13 + 0.0769 * (0.08 + 0.84 * (a - lo) / Math.max(1e-6, hi - lo));
    }
    g.setAttribute('uv', new THREE.BufferAttribute(U, 2));
    return g;
  };
  for (let j = 0; j < 5; j++) {
    const g = slat(0.074, 0.03, 2.44, 0.008);
    g.translate(0, 0.435, -0.2 + j * 0.1);
    const c = paint(toCreasedNormals(g, 0.9), OAK, false);
    wood.push(uvWood(c, (j * 5 + 2) % 13, (j * 0.173) % 0.5, (x, y, z) => z));
  }
  for (let j = 0; j < 3; j++) {
    const g = slat(0.1, 0.026, 2.44, 0.008);
    g.rotateX(Math.PI / 2 - 0.23);   // the wide face up the rake, the top leaning back
    g.translate(0, 0.6 + j * 0.11, -0.275 - j * 0.026);
    const c = paint(toCreasedNormals(g, 0.9), OAK, false);
    wood.push(uvWood(c, (j * 4 + 7) % 13, 0.31 + j * 0.2, (x, y, z) => y));
  }
  // past ~28 m: the seat and the back as two slabs on four end frames (~70 triangles), with the colours baked
  const box = (w, h, d, hex, x, y, z, rx = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (rx) g.rotateX(rx); g.translate(x, y, z); return paint(g, hex, false); };
  const far = done([box(2.44, 0.03, 0.46, OAK_FAR, 0, 0.435, 0.0), box(2.44, 0.3, 0.03, OAK_FAR, 0, 0.74, -0.31, -0.23),
    box(0.05, 0.43, 0.5, PAINT, -1.16, 0.215, 0.0), box(0.05, 0.43, 0.5, PAINT, 1.16, 0.215, 0.0), box(0.05, 0.9, 0.06, PAINT, -1.16, 0.45, -0.3, -0.27), box(0.05, 0.9, 0.06, PAINT, 1.16, 0.45, -0.3, -0.27),
    box(0.05, 0.9, 0.06, PAINT, 0, 0.45, -0.3, -0.27)]);
  _bench = { iron: done(iron), wood: done(wood), far };
  _bench.tris = { iron: _bench.iron.getAttribute('position').count / 3, wood: _bench.wood.getAttribute('position').count / 3 };
  return _bench;
}

// ================================================================ THE LITTER BASKET
let _basket = null;
export function basketKit() {
  if (_basket) return _basket;
  const WIRE = '#1c2a22';
  const rBot = 0.215, rTop = 0.285, y0 = 0.05, y1 = 0.79, rAt = (y) => rBot + (rTop - rBot) * ((y - y0) / (y1 - y0));
  const list = [];
  // 28 vertical wires
  for (let k = 0; k < 28; k++) {
    const a = (k / 28) * Math.PI * 2, len = Math.hypot(rTop - rBot, y1 - y0);
    const w = new THREE.CylinderGeometry(0.0042, 0.0042, len, 4, 1, true);
    w.rotateZ(-Math.atan2(rTop - rBot, y1 - y0));
    w.translate((rBot + rTop) / 2, (y0 + y1) / 2, 0);
    w.rotateY(a);
    list.push(paint(w, WIRE));
  }
  // the rings
  for (const y of [0.052, 0.2, 0.37, 0.55, 0.78]) { const t = new THREE.TorusGeometry(rAt(y), 0.0045, 4, 40); t.rotateX(Math.PI / 2); t.translate(0, y, 0); list.push(paint(t, WIRE)); }
  // the rolled rim and the foot ring
  { const t = new THREE.TorusGeometry(rTop + 0.004, 0.013, 6, 40); t.rotateX(Math.PI / 2); t.translate(0, 0.8, 0); list.push(paint(t, WIRE)); }
  { const t = new THREE.TorusGeometry(rBot + 0.012, 0.014, 6, 36); t.rotateX(Math.PI / 2); t.translate(0, 0.03, 0); list.push(paint(t, WIRE)); }
  // the base plate
  { const d = new THREE.CylinderGeometry(rBot + 0.004, rBot + 0.004, 0.012, 36); d.translate(0, 0.036, 0); list.push(paint(d, WIRE)); }
  // the dark liner seen through the wire
  { const c = new THREE.CylinderGeometry(rTop - 0.012, rBot - 0.01, 0.7, 28, 1, true); c.translate(0, 0.42, 0); list.push(paint(c, '#0a0d0b')); }
  // past ~25 m: a drum
  const far = done([paint(new THREE.CylinderGeometry(rTop, rBot, 0.76, 12, 1, true).translate(0, 0.42, 0), '#1c2a22'), paint(new THREE.CylinderGeometry(rBot, rBot, 0.02, 12).translate(0, 0.04, 0), '#1c2a22')]);
  return (_basket = { near: done(list), far });
}

// ================================================================ THE HOOP FENCE
// One panel 2.0 m long (x), 0.62 m tall, standing on y 0: posts at both ends (x -1 and +1; a neighbour's coincide), 14 round
// bars at 14.3 cm, a half-hoop over each pair, a low and a mid rail
let _fence = null;
export function fenceKit() {
  if (_fence) return _fence;
  const B = '#15201a', list = [];
  const post = (x) => {
    const p = new THREE.CylinderGeometry(0.017, 0.02, 0.7, 8, 1); p.translate(x, 0.33, 0); list.push(paint(p, B));
    const b = new THREE.SphereGeometry(0.03, 8, 6); b.translate(x, 0.7, 0); list.push(paint(b, B));
  };
  post(-1); post(1);
  const N = 14, sp = 2 / (N + 1);
  for (let k = 1; k <= N; k++) {
    const x = -1 + k * sp;
    const bar1 = new THREE.CylinderGeometry(0.0065, 0.0065, 0.46, 6, 1); bar1.translate(x, 0.27, 0); list.push(paint(bar1, B));
    if (k < N) {
      const h = new THREE.TorusGeometry(sp / 2, 0.0065, 5, 10, Math.PI); h.translate(x + sp / 2, 0.5, 0); list.push(paint(h, B));
    }
  }
  for (const y of [0.08, 0.3]) { const r = new THREE.CylinderGeometry(0.0085, 0.0085, 2, 6, 1); r.rotateZ(Math.PI / 2); r.translate(0, y, 0); list.push(paint(r, B)); }
  // past ~26 m: the posts and rails and a top rail (the hoops are a pixel)
  const far = [];
  for (const x of [-1, 1]) { const p = new THREE.BoxGeometry(0.04, 0.7, 0.04); p.translate(x, 0.35, 0); far.push(paint(p, B, false)); }
  for (const y of [0.08, 0.3, 0.55]) { const r = new THREE.BoxGeometry(2, 0.02, 0.02); r.translate(0, y, 0); far.push(paint(r, B, false)); }
  return (_fence = { near: done(list), far: done(far) });
}
