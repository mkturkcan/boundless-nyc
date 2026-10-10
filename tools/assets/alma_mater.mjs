// Alma Mater (Daniel Chester French, 1903) from the photogrammetry scan by M. K. Turkcan (CC BY 4.0,
// https://doi.org/10.5281/zenodo.10312053, also Sketchfab mkturkcan): the scan's node transforms baked, the model moved
// into the frame campus.js places it in (+Z her front, +X her left, y = 0 at the foot of her granite block, the block
// centred on x = z = 0), levelled (LEVEL below), cut to the bronze, its marble die and the block's inscribed front, and
// stood on a closed granite block (BLOCK below), the mesh simplified.
//   --level: tread heights round and inside the base once levelled; --block: the pedestal's faces; --profile <out>:
//   side and front elevations; --measure / --extent: older extent probes
//   node tools/assets/alma_mater.mjs <scan.glb> [out.glb] [--level | --block | --profile <out>]
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, dedup, prune } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';

const [src, outArg] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const MEASURE = process.argv.includes('--measure');
const out = outArg || 'client/public/models/landmarks/alma_mater.glb';
// the scan's frame -> hers: the stepped base is square to axes turned -15 deg about y; its centre and underside
const A = (-15 * Math.PI) / 180, cA = Math.cos(A), sA = Math.sin(A), UC = -0.745, VC = 0.695, YB = -1.52;
// BLOCK (2026-09-29, the owner: "still leaned the wrong way. You might need to prop up the base"). Levelled (--level,
// --block, --profile), the capture is the monument as it stands on the Low steps: the bronze and her throne on a red
// marble die (y 0.64-1.04, 1.85 x 1.99 m) on a granite block 2.02 m wide whose front, carved ALMA MATER, drops 0.88 m to
// a tread at y -0.24, while its top runs on behind her as the landing (y 0.64) and the stairs climb its sides, so its
// sides were captured only above a line sloping up to the back and its back not at all. The campus stands her on a
// flat landing, so the block is rebuilt: the scan keeps the die and the bronze (cut level just over the block's top,
// their walls propped PROP down into it) and the block's inscribed front (clipped to the block's edges, its borders
// returned to the block), and a closed box with the die's margins all round (8.6 cm, measured at its front and sides)
// is the block, in the campus granite (campus.js).
const BOX = { x0: -1.05, x1: 1.05, z0: -1.20, z1: 1.20 };   // the die and the bronze stand within this
const PROP = 0.10;
// in her output frame (y = 0 at the block's foot, YL): the block's faces (--block), the die's cut, the bronze's start
const BLOCK = { x: 1.01, zF: 1.08, zB: -0.970 - 0.086, face: 1.05, top: 0.845, faceTop: 0.84 };   // zF: 3 cm behind the carved face (z 1.10-1.11)
const DIE_CUT = 0.855;   // levelled 0.655, 1 cm over the box's top (so the die's propped foot shows 1 cm); the block
                         // top's treads round it (0.62-0.66, --level) are dropped where they reach over it
const BRONZE_Y = 1.25;   // levelled 1.05: the die's top (1.02-1.06); above it, bronze

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(src);
const mul = (m, v) => [m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]];
const rot = (m, v) => [m[0] * v[0] + m[4] * v[1] + m[8] * v[2], m[1] * v[0] + m[5] * v[1] + m[9] * v[2], m[2] * v[0] + m[6] * v[1] + m[10] * v[2]];
// LEVEL (2026-09-29, the owner: "slightly tilted towards back"): the capture's +Y is 5.6 deg off the vertical, her top
// leaning back, and 0.9 deg to her left. tools/assets/alma_tilt.mjs measures the true up from the stone base's treads
// (level) and risers (plumb), each iterated in its own levelled frame: (0.0163, 0.9951, -0.0975) and (0.0151, 0.9950,
// -0.0987). Their mean is rotated onto +Y about her base's centre. The tilt was also the capture's "uneven underside": a
// 5.6 deg lean over the base's 2.4 m depth is 0.24 m between its front and back edges.
const UP = (() => { const u = [0.0157, 0.99505, -0.0981], l = Math.hypot(...u); return u.map((x) => x / l); })();
const LV = (() => {   // the rotation taking UP to +Y (Rodrigues), as rows
  const k = [-UP[2], 0, UP[0]], kl = Math.hypot(...k), c = UP[1], s = kl;   // the axis UP x Y (Y x UP turned it the other way and doubled the lean, 11.3 deg)
  if (kl < 1e-9) return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const x = k[0] / kl, y = k[1] / kl, z = k[2] / kl, t = 1 - c;
  return [[t * x * x + c, t * x * y - s * z, t * x * z + s * y], [t * x * y + s * z, t * y * y + c, t * y * z - s * x], [t * x * z - s * y, t * y * z + s * x, t * z * z + c]];
})();
const lv = (v) => [LV[0][0] * v[0] + LV[0][1] * v[1] + LV[0][2] * v[2], LV[1][0] * v[0] + LV[1][1] * v[1] + LV[1][2] * v[2], LV[2][0] * v[0] + LV[2][1] * v[1] + LV[2][2] * v[2]];
// her frame, levelled, then y = 0 at the block's foot: 4 cm over the tread its front stands on (levelled -0.24, --level)
const YL = -0.20;
const toHer = (w) => { const q = lv([cA * w[0] + sA * w[2] - UC, w[1] - YB, -sA * w[0] + cA * w[2] - VC]); q[1] -= YL; return q; };
const toHerN = (w) => { const n = lv([cA * w[0] + sA * w[2], w[1], -sA * w[0] + cA * w[2]]); const l = Math.hypot(...n) || 1; return n.map((x) => x / l); };
const LEVEL = process.argv.includes('--level');

// exact clipping: a polygon of vertices [pos, nrm, uv] against a plane { ax, v, s } (kept where s * (pos[ax] - v) >= 0),
// the edge it leaves on the plane handed to `cut`
const lerpV = (p, q, t) => [
  [p[0][0] + (q[0][0] - p[0][0]) * t, p[0][1] + (q[0][1] - p[0][1]) * t, p[0][2] + (q[0][2] - p[0][2]) * t],
  (() => { const n = [p[1][0] + (q[1][0] - p[1][0]) * t, p[1][1] + (q[1][1] - p[1][1]) * t, p[1][2] + (q[1][2] - p[1][2]) * t], l = Math.hypot(...n) || 1; return n.map((x) => x / l); })(),
  [p[2][0] + (q[2][0] - p[2][0]) * t, p[2][1] + (q[2][1] - p[2][1]) * t],
];
const inPl = (q, P) => P.s * (q[0][P.ax] - P.v) >= 0;
function clipPoly(poly, P, cut) {
  const out = [], on = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], ip = inPl(p, P), iq = inPl(q, P);
    if (ip) out.push(p);
    if (ip !== iq) { const x = lerpV(p, q, (P.v - p[0][P.ax]) / (q[0][P.ax] - p[0][P.ax])); x[0][P.ax] = P.v; out.push(x); on.push(x); }
  }
  if (on.length === 2) cut(on[0], on[1]);
  return out;
}
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
// triangle -> the triangles of it inside every plane; each plane's cut edge, trimmed by the planes after it, goes to
// `edges` with the plane and the triangle's face normal
function clipTri(tri, planes, edges) {
  let poly = tri;
  const fn = cross3(sub3(tri[1][0], tri[0][0]), sub3(tri[2][0], tri[0][0]));
  for (let k = 0; k < planes.length && poly.length >= 3; k++) poly = clipPoly(poly, planes[k], (a, b) => edges.push({ a, b, k, fn }));
  if (poly.length < 3) return [];
  const T = []; for (let i = 1; i + 1 < poly.length; i++) T.push([poly[0], poly[i], poly[i + 1]]);
  return T;
}
function trimEdge(e, planes) {
  let { a, b } = e;
  for (let j = e.k + 1; j < planes.length; j++) {
    const P = planes[j], ia = inPl(a, P), ib = inPl(b, P);
    if (!ia && !ib) return null;
    if (ia !== ib) { const x = lerpV(a, b, (P.v - a[0][P.ax]) / (b[0][P.ax] - a[0][P.ax])); x[0][P.ax] = P.v; if (ia) b = x; else a = x; }
  }
  return { ...e, a, b };
}
// each cut edge extruded as its plane says (`ex`: the point it runs to), a quad facing `n` (or the cut face's own way,
// less the extrusion's direction), carrying the edge's texture
function extrude(edges, planes) {
  const T = [];
  for (const e0 of edges) {
    const e = trimEdge(e0, planes); if (!e) continue;
    const P = planes[e.k], a2p = P.ex(e.a[0]), b2p = P.ex(e.b[0]);
    const dir = sub3(a2p, e.a[0]), dl = Math.hypot(...dir); if (dl < 1e-4 || Math.hypot(...sub3(e.b[0], e.a[0])) < 1e-5) continue;
    let n = P.n;
    if (!n) { const d = dir.map((x) => x / dl), f = e.fn, k = dot3(f, d), h = [f[0] - k * d[0], f[1] - k * d[1], f[2] - k * d[2]], hl = Math.hypot(...h); if (hl < 1e-9) continue; n = h.map((x) => x / hl); }
    const A = [e.a[0], n, e.a[2]], B = [e.b[0], n, e.b[2]], A2 = [a2p, n, e.a[2]], B2 = [b2p, n, e.b[2]];
    if (dot3(cross3(sub3(B[0], A[0]), sub3(A2[0], A[0])), n) >= 0) T.push(A, B, A2, B, B2, A2); else T.push(A, A2, B, B, A2, B2);
  }
  return T;
}
// the die and the bronze: cut level over the block's top, their walls propped down into it
const DIE_PLANES = [{ ax: 1, v: DIE_CUT, s: 1, ex: (p) => [p[0], p[1] - PROP, p[2]] }];
// the block's carved front: clipped to the block's sides, foot and top; the sides and the top returned to the box's
// front (zF), the foot propped down into the landing
const toZF = (p) => [p[0], p[1], Math.min(p[2], BLOCK.zF)];
const FACE_PLANES = [
  { ax: 0, v: -BLOCK.x, s: 1, ex: toZF, n: [-1, 0, 0] },
  { ax: 0, v: BLOCK.x, s: -1, ex: toZF, n: [1, 0, 0] },
  { ax: 1, v: 0, s: 1, ex: (p) => [p[0], p[1] - PROP, p[2]] },
  { ax: 1, v: BLOCK.faceTop, s: -1, ex: toZF, n: [0, 1, 0] },
];
// gather: per source texture, the triangles (positions, normals, uvs) in her frame
const groups = new Map();   // texture -> { stone: [], bronze: [] } of [p0,n0,t0,p1,n1,t1,p2,n2,t2]
const ext = { x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9 };
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh(); if (!mesh) continue;
  const M = node.getWorldMatrix();
  for (const prim of mesh.listPrimitives()) {
    const P = prim.getAttribute('POSITION'), N = prim.getAttribute('NORMAL'), T = prim.getAttribute('TEXCOORD_0'), I = prim.getIndices();
    const tex = prim.getMaterial()?.getBaseColorTexture() || null;
    if (!groups.has(tex)) groups.set(tex, { granite: [], marble: [], bronze: [], dieCuts: [], faceCuts: [] });
    const g = groups.get(tex);
    const v = [0, 0, 0], n = [0, 0, 0], t = [0, 0];
    const vert = (i) => { P.getElement(i, v); N.getElement(i, n); T.getElement(i, t); return [toHer(mul(M, v)), toHerN(rot(M, n)), [t[0], t[1]]]; };
    const cnt = I ? I.getCount() : P.getCount();
    for (let k = 0; k < cnt; k += 3) {
      const a = vert(I ? I.getScalar(k) : k), b = vert(I ? I.getScalar(k + 1) : k + 1), c = vert(I ? I.getScalar(k + 2) : k + 2);
      const inside = (q) => q[0][0] >= BOX.x0 && q[0][0] <= BOX.x1 && q[0][2] >= BOX.z0 && q[0][2] <= BOX.z1 && q[0][1] >= BOX.y0;
      if (MEASURE) for (const q of [a, b, c]) if (q[0][1] > 0.1 && q[0][1] < 0.6 && Math.abs(q[0][0]) < 1.6 && Math.abs(q[0][2]) < 1.6) {
        ext.x0 = Math.min(ext.x0, q[0][0]); ext.x1 = Math.max(ext.x1, q[0][0]); ext.z0 = Math.min(ext.z0, q[0][2]); ext.z1 = Math.max(ext.z1, q[0][2]);
      }
      const mx = (a[0][0] + b[0][0] + c[0][0]) / 3, mz = (a[0][2] + b[0][2] + c[0][2]) / 3;
      if (mx < BOX.x0 || mx > BOX.x1 || mz < BOX.z0 || mz > BOX.z1) continue;
      const cy = (a[0][1] + b[0][1] + c[0][1]) / 3;
      const my = Math.max(a[0][1], b[0][1], c[0][1]);
      if (my > DIE_CUT) {   // the die and the bronze (less the block top's treads at the die's foot)
        const tn = cross3(sub3(b[0], a[0]), sub3(c[0], a[0])), tl = Math.hypot(...tn);
        if (my < 0.92 && tl > 1e-12 && tn[1] / tl > 0.7) continue;
        const e0 = g.dieCuts.length, part = cy > BRONZE_Y ? 'bronze' : 'marble';
        for (const tri of clipTri([a, b, c], DIE_PLANES, g.dieCuts)) g[part].push(...tri);
        for (let i = e0; i < g.dieCuts.length; i++) g.dieCuts[i].part = part;
        continue;
      }
      // the block's carved front (the V-cut letters' walls face at least 70 deg off the face; its top and the tread
      // under it face up); nothing else below the die's cut: the box is the rest of the block
      const fn = cross3(sub3(b[0], a[0]), sub3(c[0], a[0])), fl = Math.hypot(...fn);
      if (mz > BLOCK.face && fl > 1e-12 && fn[2] / fl > 0.3) for (const tri of clipTri([a, b, c], FACE_PLANES, g.faceCuts)) g.granite.push(...tri);
    }
  }
}
if (MEASURE) { console.log('base block (y 0.1-0.6) extent in her frame:', JSON.stringify(ext, (k, x) => (typeof x === 'number' ? +x.toFixed(3) : x))); }
if (process.argv.includes('--profile')) {
  // side (z across, y up) and front (x across, y up) elevations of the levelled capture within 3 m, 1 cm a pixel, as PNGs
  const { createRequire } = await import('node:module');
  const sharp = createRequire(import.meta.url)('sharp');
  const W = 600, H = 400, S = 100, oy = 150;   // y from -1.5 to 2.5 m, across from -3 to 3 m
  const side = new Uint16Array(W * H), front = new Uint16Array(W * H);
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue;
    const M = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const P = prim.getAttribute('POSITION'), v = [0, 0, 0];
      for (let i = 0; i < P.getCount(); i++) {
        P.getElement(i, v); const q = toHer(mul(M, v));
        const py = H - 1 - Math.round(q[1] * S + oy);
        if (py < 0 || py >= H) continue;
        if (Math.abs(q[0]) < 1.05) { const px = Math.round(q[2] * S + W / 2); if (px >= 0 && px < W) side[py * W + px]++; }
        if (Math.abs(q[2]) < 1.2) { const px = Math.round(q[0] * S + W / 2); if (px >= 0 && px < W) front[py * W + px]++; }
      }
    }
  }
  const img = (A) => { const b = Buffer.alloc(W * H * 3); for (let i = 0; i < W * H; i++) { const k = Math.min(255, A[i] * 40); b[i * 3] = k; b[i * 3 + 1] = k; b[i * 3 + 2] = k; }
    // grid: every 0.5 m, y = 0 red
    for (let x = 0; x < W; x++) for (const yy of [-1, -0.5, 0, 0.5, 1, 1.5, 2]) { const py = H - 1 - Math.round(yy * S + oy); const o = (py * W + x) * 3; if (yy === 0) { b[o] = 255; } else b[o + 2] = Math.max(b[o + 2], 90); }
    for (let y = 0; y < H; y++) for (const xx of [-2, -1, 0, 1, 2]) { const px = Math.round(xx * S + W / 2); const o = (y * W + px) * 3; b[o + 1] = Math.max(b[o + 1], 90); }
    return b; };
  const out = process.argv[process.argv.indexOf('--profile') + 1];
  await sharp(img(side), { raw: { width: W, height: H, channels: 3 } }).png().toFile(out + '_side.png');
  await sharp(img(front), { raw: { width: W, height: H, channels: 3 } }).png().toFile(out + '_front.png');
  console.log('wrote', out + '_side.png', out + '_front.png');
  process.exit(0);
}
if (process.argv.includes('--block')) {
  // the pedestal's vertical faces by the way they face, per height band (levelled, before YL): each face's position as
  // area-weighted percentiles (the capture's surface noise), so the granite block and the marble die can be rebuilt
  const faces = { '+z': [], '-z': [], '+x': [], '-x': [] }, bands = [[-0.30, 0.00], [0.00, 0.30], [0.30, 0.58], [0.66, 0.96]];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue;
    const M = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const P = prim.getAttribute('POSITION'), I = prim.getIndices(), v = [0, 0, 0];
      const get = (i) => { P.getElement(i, v); return toHer(mul(M, v)); };
      const cnt = I ? I.getCount() : P.getCount();
      for (let k = 0; k < cnt; k += 3) {
        const a = get(I ? I.getScalar(k) : k), b = get(I ? I.getScalar(k + 1) : k + 1), c = get(I ? I.getScalar(k + 2) : k + 2);
        const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], l = Math.hypot(...n);
        if (l < 1e-12) continue;
        const nx = n[0] / l, nz = n[2] / l, ar = l / 2;
        const cx = (a[0] + b[0] + c[0]) / 3, cy = (a[1] + b[1] + c[1]) / 3 + YL, cz = (a[2] + b[2] + c[2]) / 3;
        if (Math.abs(cx) > 1.25 || Math.abs(cz) > 1.4) continue;
        const bi = bands.findIndex(([y0, y1]) => cy >= y0 && cy < y1); if (bi < 0) continue;
        const key = nz > 0.8 ? '+z' : nz < -0.8 ? '-z' : nx > 0.8 ? '+x' : nx < -0.8 ? '-x' : null; if (!key) continue;
        faces[key].push([bi, key.endsWith('z') ? cz : cx, key.endsWith('z') ? cx : cz, cy, ar]);
      }
    }
  }
  const pct = (L, q) => { const S = [...L].sort((p, r) => p[0] - r[0]), tot = S.reduce((t, x) => t + x[1], 0); let acc = 0; for (const [x, w] of S) { acc += w; if (acc >= q * tot) return x; } return NaN; };
  for (const [key, L] of Object.entries(faces)) bands.forEach(([y0, y1], bi) => {
    const F = L.filter((f) => f[0] === bi); if (!F.length) return;
    const A = F.reduce((t, f) => t + f[4], 0); if (A < 0.01) return;
    // the dominant plane: the outermost cluster (the face itself, not what stands behind it)
    const pos = F.map((f) => [f[1], f[4]]), acr = F.map((f) => [f[2], f[4]]), ys = F.map((f) => [f[3], f[4]]);
    console.log(`${key} y ${y0}..${y1}: ${A.toFixed(2)} m2  at p10 ${pct(pos, 0.1).toFixed(3)} p50 ${pct(pos, 0.5).toFixed(3)} p90 ${pct(pos, 0.9).toFixed(3)}  across ${pct(acr, 0.02).toFixed(2)}..${pct(acr, 0.98).toFixed(2)}  y ${pct(ys, 0.01).toFixed(2)}..${pct(ys, 0.99).toFixed(2)}`);
  });
  process.exit(0);
}
if (process.argv.includes('--extent')) {
  const bands = [[-0.34, -0.22], [-0.18, -0.08], [-0.04, 0.08], [0.10, 0.24], [0.52, 0.68], [0.94, 1.06]];
  const E = bands.map(() => ({ x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9, a: 0 }));
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue;
    const M = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const P = prim.getAttribute('POSITION'), I = prim.getIndices(), v = [0, 0, 0];
      const get = (i) => { P.getElement(i, v); return toHer(mul(M, v)); };
      const cnt = I ? I.getCount() : P.getCount();
      for (let k = 0; k < cnt; k += 3) {
        const a = get(I ? I.getScalar(k) : k), b = get(I ? I.getScalar(k + 1) : k + 1), c = get(I ? I.getScalar(k + 2) : k + 2);
        const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], l = Math.hypot(...n);
        if (l < 1e-12 || n[1] / l < Math.cos((8 * Math.PI) / 180)) continue;
        const cx = (a[0] + b[0] + c[0]) / 3, cy = (a[1] + b[1] + c[1]) / 3, cz = (a[2] + b[2] + c[2]) / 3;
        if (Math.abs(cx) > 3 || Math.abs(cz) > 3) continue;
        bands.forEach(([y0, y1], i) => { if (cy >= y0 && cy < y1) { const e = E[i]; e.x0 = Math.min(e.x0, cx); e.x1 = Math.max(e.x1, cx); e.z0 = Math.min(e.z0, cz); e.z1 = Math.max(e.z1, cz); e.a += l / 2; } });
      }
    }
  }
  bands.forEach(([y0, y1], i) => { const e = E[i]; console.log(`level faces y ${y0}..${y1}: ${e.a.toFixed(2)} m2  x ${e.x0.toFixed(2)}..${e.x1.toFixed(2)}  z ${e.z0.toFixed(2)}..${e.z1.toFixed(2)}`); });
  process.exit(0);
}
if (LEVEL) {
  const H = { inside: new Map(), ring: new Map() };
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue;
    const M = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const P = prim.getAttribute('POSITION'), I = prim.getIndices(), v = [0, 0, 0];
      const get = (i) => { P.getElement(i, v); return toHer(mul(M, v)); };
      const cnt = I ? I.getCount() : P.getCount();
      for (let k = 0; k < cnt; k += 3) {
        const a = get(I ? I.getScalar(k) : k), b = get(I ? I.getScalar(k + 1) : k + 1), c = get(I ? I.getScalar(k + 2) : k + 2);
        const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], l = Math.hypot(...n);
        if (l < 1e-12 || n[1] / l < Math.cos((8 * Math.PI) / 180)) continue;
        const cx = (a[0] + b[0] + c[0]) / 3, cy = (a[1] + b[1] + c[1]) / 3 + YL, cz = (a[2] + b[2] + c[2]) / 3;   // before YL
        if (cy > 2.2 || cy < -1.0) continue;
        const r = Math.max(Math.abs(cx) - 1.05, Math.abs(cz) - 1.2), key = Math.round(cy * 50) / 50;   // 2 cm bins
        const T = r <= 0 ? H.inside : r < 0.8 ? H.ring : null; if (!T) continue;
        T.set(key, (T.get(key) || 0) + l / 2);
      }
    }
  }
  for (const [name, T] of Object.entries(H)) {
    console.log(`tread area by height (levelled, before YL), ${name}:`);
    for (const [y, ar] of [...T.entries()].sort((p, q) => p[0] - q[0])) if (ar > 0.01) console.log(`  y ${y.toFixed(2)}  ${ar.toFixed(3)} m2`);
  }
  process.exit(0);
}

// the output document
const outDoc = new Document();
const buffer = outDoc.createBuffer();
const scene = outDoc.createScene('Scene');
const root = outDoc.createNode('almaMater');
scene.addChild(root);
const meshOut = outDoc.createMesh('almaMater');
root.setMesh(meshOut);
const texOut = new Map();
let tris = 0;
for (const g of groups.values()) {
  for (const part of ['marble', 'bronze']) g[part].push(...extrude(g.dieCuts.filter((e) => e.part === part), DIE_PLANES));
  const q = extrude(g.faceCuts, FACE_PLANES); g.granite.push(...q);
  console.log('cut edges: die', g.dieCuts.length, 'face', g.faceCuts.length, '(face border quads', q.length / 6 + ')');
}
for (const [tex, g] of groups) {
  let t2 = null;
  if (tex) {
    if (!texOut.has(tex)) texOut.set(tex, outDoc.createTexture(tex.getName() || 'scan').setImage(tex.getImage()).setMimeType(tex.getMimeType()));
    t2 = texOut.get(tex);
  }
  for (const part of ['granite', 'marble', 'bronze']) {
    const L = g[part]; if (!L.length) continue;
    const pos = new Float32Array(L.length * 3), nor = new Float32Array(L.length * 3), uv = new Float32Array(L.length * 2);
    L.forEach((q, i) => { pos.set(q[0], 3 * i); nor.set(q[1], 3 * i); uv.set(q[2], 2 * i); });
    const mat = outDoc.createMaterial(part)
      .setBaseColorFactor([1, 1, 1, 1])
      .setMetallicFactor(part === 'bronze' ? 0.35 : 0.0)
      .setRoughnessFactor(part === 'bronze' ? 0.52 : part === 'marble' ? 0.5 : 0.86)
      .setDoubleSided(false);
    if (t2) mat.setBaseColorTexture(t2);
    const prim = outDoc.createPrimitive()
      .setAttribute('POSITION', outDoc.createAccessor().setType('VEC3').setArray(pos).setBuffer(buffer))
      .setAttribute('NORMAL', outDoc.createAccessor().setType('VEC3').setArray(nor).setBuffer(buffer))
      .setAttribute('TEXCOORD_0', outDoc.createAccessor().setType('VEC2').setArray(uv).setBuffer(buffer))
      .setMaterial(mat);
    meshOut.addPrimitive(prim);
    tris += L.length / 3;
  }
}
console.log('kept triangles', tris);
await MeshoptSimplifier.ready;
await outDoc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: 0.55, error: 0.0008 }), dedup(), prune());
let after = 0; for (const p of meshOut.listPrimitives()) after += p.getIndices() ? p.getIndices().getCount() / 3 : p.getAttribute('POSITION').getCount() / 3;
console.log('after simplify', after);
{
  // the block: a closed box (no underside), PROP into the landing; campus.js gives 'block' the campus granite
  const { x, zF, zB, top } = BLOCK, y0 = -PROP;
  const quads = [   // corners counter-clockwise seen from outside, then the normal
    [[-x, y0, zF], [x, y0, zF], [x, top, zF], [-x, top, zF], [0, 0, 1]],
    [[x, y0, zB], [-x, y0, zB], [-x, top, zB], [x, top, zB], [0, 0, -1]],
    [[x, y0, zF], [x, y0, zB], [x, top, zB], [x, top, zF], [1, 0, 0]],
    [[-x, y0, zB], [-x, y0, zF], [-x, top, zF], [-x, top, zB], [-1, 0, 0]],
    [[-x, top, zF], [x, top, zF], [x, top, zB], [-x, top, zB], [0, 1, 0]],
  ];
  const pos = [], nor = [], uv = [], idx = [];
  for (const [p0, p1, p2, p3, n] of quads) {
    const b = pos.length / 3;
    for (const p of [p0, p1, p2, p3]) { pos.push(...p); nor.push(...n); uv.push(n[0] ? p[2] : p[0], n[1] ? p[2] : p[1]); }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const prim = outDoc.createPrimitive()
    .setAttribute('POSITION', outDoc.createAccessor().setType('VEC3').setArray(new Float32Array(pos)).setBuffer(buffer))
    .setAttribute('NORMAL', outDoc.createAccessor().setType('VEC3').setArray(new Float32Array(nor)).setBuffer(buffer))
    .setAttribute('TEXCOORD_0', outDoc.createAccessor().setType('VEC2').setArray(new Float32Array(uv)).setBuffer(buffer))
    .setIndices(outDoc.createAccessor().setType('SCALAR').setArray(new Uint16Array(idx)).setBuffer(buffer))
    .setMaterial(outDoc.createMaterial('block').setBaseColorFactor([0.67, 0.63, 0.55, 1]).setMetallicFactor(0).setRoughnessFactor(0.82));
  meshOut.addPrimitive(prim);
}
await io.write(out, outDoc);
console.log('wrote', out);
