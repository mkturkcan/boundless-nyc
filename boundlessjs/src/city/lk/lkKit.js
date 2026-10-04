// AR34 LIFE models (part lk, docs/notes/ar34-life.md), built in code from measured sizes: market umbrellas with sagging
// cloth panels and scalloped valances, folding tables with draped cloths and their goods (books, oils, printed tees,
// caps, sunglasses cards, wax prints, carvings, beads), the produce stall (canopy, tilted crates of fruit, boxes, hand
// truck, steel barrier), mopeds with delivery top boxes, e-bikes, wire carts and grid panels, clothing racks with
// hanging garments, rubbish bags, cardboard, the sidewalk shed (pipe frame, X bracing, deck, parapet with POST NO BILLS,
// notice boards, tube lights). Model space: y up from the sidewalk, +z the front (a stall's customers, a shed's kerb
// side, a two-wheeler's nose), x along it. q = 1 near model, q = 0 far (plain boxes, fewer segments, no small goods).
import * as THREE from 'three';
import { Model, rbox, box, cyl, rod, lathe, tube, loft, LOD, boxUV } from './lkGeo.js';
import { FAB, GOODS, toCell } from './lkArt.js';
import { halalCart, snackCart, cooler } from './lkCart.js';

const PI = Math.PI;
// a seeded random stream per model (the same model looks the same on every visit)
function rng(seed) { let s = (seed * 9301 + 49297) % 233280 || 1; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); }
const gcell = (g, cell) => toCell(g, cell, 4, 4);
const fcell = (g, cell) => toCell(g, cell);
const strip = (g) => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); return g.index ? g.toNonIndexed() : g; };

// ---------------------------------------------------------------- cloth
// a market umbrella: n ribs, cloth panels sagging between them, a scalloped valance, pole, hub, finial, weighted base
export function umbrella(q, p = {}) {
  const M = new Model(), R = p.r || 1.15, H = p.h || 2.25, n = p.n || 8, drop = p.drop || 0.34, cols = p.cols || [FAB.white], ck = p.key || 'canopy';
  const segR = q ? 6 : 2, segA = q ? 4 : 1, top = H + 0.16;
  const yAt = (r, t) => top - Math.pow(r / R, 1.25) * drop - (q ? 0.05 * Math.sin(PI * t) * (r / R) : 0);
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * 2 * PI, a1 = ((i + 1) / n) * 2 * PI, pos = [], uv = [];
    const P = (ri, aj) => { const r = (ri / segR) * R, t = aj / segA, a = a0 + (a1 - a0) * t, rr = r * (1 - (q ? 0.035 * Math.sin(PI * t) : 0)); return [Math.cos(a) * rr, yAt(r, t), Math.sin(a) * rr, r, t * r * (a1 - a0)]; };
    for (let ri = 0; ri < segR; ri++) for (let aj = 0; aj < segA; aj++) {
      const A = P(ri, aj), B = P(ri + 1, aj), C = P(ri + 1, aj + 1), D = P(ri, aj + 1);
      for (const v of [A, C, B, A, D, C]) { pos.push(v[0], v[1], v[2]); uv.push(v[4], v[3]); }
    }
    let g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    M.add(ck, fcell(g, cols[i % cols.length]));
    // the valance: a straight flap round the rim (0.11 m, hanging a little outward), or cut in points (p.points: 0.08 m at
    // the seams, 0.15 m at the tips)
    if (q && !p.points) {
      const vp = [], vu = [], k = 3;
      for (let j = 0; j < k; j++) {
        const ta = j / k, tb = (j + 1) / k, rim = (t, dy, out) => { const a = a0 + (a1 - a0) * t, r = R * (1 - 0.035 * Math.sin(PI * t)) + out; return [Math.cos(a) * r, yAt(R, t) - dy, Math.sin(a) * r]; };
        const A = rim(ta, 0, 0), B = rim(tb, 0, 0), A2 = rim(ta, 0.11, 0.012), B2 = rim(tb, 0.11, 0.012);
        for (const v of [A, B, B2, A, B2, A2]) vp.push(...v);
        vu.push(ta, 1, tb, 1, tb, 0, ta, 1, tb, 0, ta, 0);
      }
      const gv = new THREE.BufferGeometry();
      gv.setAttribute('position', new THREE.Float32BufferAttribute(vp, 3));
      gv.setAttribute('uv', new THREE.Float32BufferAttribute(vu, 2));
      gv.computeVertexNormals();
      M.add(ck, fcell(gv, cols[i % cols.length]));
    }
    if (q) {
      const vp = [], vu = [], k = 3;
      for (let j = 0; j < (p.points ? k : 0); j++) {
        const ta = j / k, tb = (j + 1) / k, tm = (ta + tb) / 2, rim = (t) => { const a = a0 + (a1 - a0) * t, r = R * (1 - 0.035 * Math.sin(PI * t)); return [Math.cos(a) * r, yAt(R, t), Math.sin(a) * r]; };
        const A = rim(ta), B = rim(tb), Mm = rim(tm), A2 = [A[0], A[1] - 0.08, A[2]], B2 = [B[0], B[1] - 0.08, B[2]], T = [Mm[0], Mm[1] - 0.15, Mm[2]];
        for (const v of [A, B, T, A, T, A2, B, B2, T]) vp.push(...v);
        vu.push(ta, 1, tb, 1, tm, 0, ta, 1, tm, 0, ta, 0.4, tb, 1, tb, 0.4, tm, 0);
      }
      if (vp.length) {
        g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(vp, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(vu, 2));
        g.computeVertexNormals();
        M.add(ck, fcell(g, cols[i % cols.length]));
      }
      // the rib under the seam and its stretcher to the runner
      const a = a0, cx = Math.cos(a), cz = Math.sin(a);
      M.add('alu', rod([0, top - 0.02, 0], [cx * R * 0.98, yAt(R, 0) - 0.015, cz * R * 0.98], 0.006, 4));
      M.add('alu', rod([0, H - 0.45, 0], [cx * R * 0.5, yAt(R * 0.5, 0) - 0.02, cz * R * 0.5], 0.005, 4));
    }
  }
  M.add(p.pole || 'alu', cyl(0.019, 0.019, top + 0.08, q ? 10 : 6, 0));
  if (q) { M.add('plasBlack', cyl(0.035, 0.03, 0.12, 10, top - 0.02)); M.add('plasBlack', cyl(0.028, 0.028, 0.08, 10, H - 0.5)); }
  if (p.base !== false) M.add('plasBlack', cyl(0.24, 0.27, 0.09, q ? 16 : 8, 0), cyl(0.06, 0.07, 0.2, 10, 0.09));
  return M;
}
// a folding table w x d, top at 0.74 m, with an optional cloth (FAB cell) draping to `drop` over the front and the ends
export function table(q, p = {}) {
  const M = new Model(), w = p.w || 1.83, d = p.d || 0.76, h = p.h || 0.74;
  M.add(p.top || 'plasWhite', rbox(w, 0.045, d, 0.012, 0, h - 0.022, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) M.add('alu', rod([sx * (w / 2 - 0.08), 0, sz * (d / 2 - 0.06)], [sx * (w / 2 - 0.09), h - 0.045, sz * (d / 2 - 0.07)], 0.013, q ? 8 : 4));
  if (q) for (const sx of [-1, 1]) M.add('alu', rod([sx * (w / 2 - 0.085), 0.18, -(d / 2 - 0.065)], [sx * (w / 2 - 0.085), 0.18, d / 2 - 0.065], 0.008, 4));
  if (p.cloth !== undefined) M.put(cloth(q, { w: w + 0.06, d: d + 0.06, h: h + 0.004, drop: p.drop ?? 0.62, cell: p.cloth, seed: p.seed || 1, back: p.back }));
  return M;
}
// a cloth over a top w x d at height h: the top sheet and the skirts on the front and the ends (the back too if `back`),
// folds deepening toward the hem (a sine of rising amplitude), the hem lifting where the folds bunch
export function cloth(q, p) {
  const M = new Model(), { w, d, h } = p, drop = p.drop, R = rng(p.seed || 1);
  const top = box(w, 0.004, d, 0, h, 0);
  M.add('fab', fcell(top, p.cell));
  const sides = [[0, d / 2, w, 1, 0], [w / 2, 0, d, 0, 1], [-w / 2, 0, d, 0, -1]];
  if (p.back) sides.push([0, -d / 2, w, -1, 0]);
  for (const [cx, cz, L, nz, nx] of sides) {
    const nu = q ? Math.max(8, Math.round(L * 14)) : 2, nv = q ? 5 : 1, ph = R() * 6, fold = 0.9 + R() * 0.6;
    const pos = [], uv = [];
    const V = (iu, iv) => {
      const t = iu / nu, s = iv / nv, along = (t - 0.5) * L, dep = s * drop;
      const amp = q ? (0.008 + 0.03 * s * s) : 0, f = Math.sin(t * L * 2 * PI * fold * 2.2 + ph) + 0.4 * Math.sin(t * L * 2 * PI * 5.1 + ph * 2);
      const out = 0.012 + amp * f + (q ? 0.02 * s * s : 0);
      const lift = q ? 0.02 * s * Math.max(0, f) : 0;
      // nz / nx: the outward normal of this side
      const x = nz ? cx + along : cx + nx * out, z = nz ? cz + nz * out : cz + along;
      return [x, h - dep + lift, z, along, -dep];
    };
    for (let iu = 0; iu < nu; iu++) for (let iv = 0; iv < nv; iv++) {
      const A = V(iu, iv), B = V(iu + 1, iv), C = V(iu + 1, iv + 1), D = V(iu, iv + 1);
      const tri = (nz > 0 || nx < 0) ? [A, D, C, A, C, B] : [A, C, D, A, B, C];
      for (const v of tri) { pos.push(v[0], v[1], v[2]); uv.push(v[3], v[4]); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    M.add('fab', fcell(g, p.cell));
  }
  return M;
}

// ---------------------------------------------------------------- goods on a top (y = the top's surface), in w x d
function lumpy(r, detail, seed, sq = 1, rough = 0.12) {
  // a smooth lumpy ball (a fruit, a bag): a UV sphere pushed in and out by three random waves of the direction, its
  // normals computed while indexed so it shades smooth, then flattened for merging
  const ws = detail >= 2 ? [12, 9] : detail === 1 ? [7, 5] : [5, 3];
  const g = new THREE.SphereGeometry(r, ws[0], ws[1]), P = g.getAttribute('position'), R = rng(seed);
  const waves = [0, 1, 2].map(() => [R() * 2 - 1, R() * 2 - 1, R() * 2 - 1, 2 + R() * 3, R() * 6]);
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i), l = Math.hypot(x, y, z) || 1;
    let f = 1;
    for (const [a, b, c, k, ph] of waves) f += (rough / 2) * Math.sin(((a * x + b * y + c * z) / l) * k + ph);
    P.setXYZ(i, x * f, y * f * sq, z * f);
  }
  g.computeVertexNormals();
  return strip(g);
}
export function goods(q, p) {
  const M = new Model(), R = rng(p.seed || 3), w = p.w || 1.8, d = p.d || 0.7, y = p.y ?? 0.742;
  if (!q) {
    // far: one low block of the goods' colour
    M.add('goods', gcell(box(w * 0.9, 0.12, d * 0.8, 0, y + 0.06, 0), GOODS[p.kind === 'produce' ? 'apples' : p.kind === 'books' ? 'books' : 'beads']));
    return M;
  }
  const kinds = p.kind.split('+');
  const span = w / kinds.length;
  kinds.forEach((kind, ki) => {
    const x0 = -w / 2 + ki * span + 0.06, x1 = x0 + span - 0.12;
    if (kind === 'books') {
      for (let x = x0; x < x1 - 0.18;) {
        const bw = 0.15 + R() * 0.08, bd = 0.21 + R() * 0.06, n = 1 + Math.floor(R() * 4);
        for (let k = 0; k < n; k++) { const t = 0.025 + R() * 0.025; M.add('goods', gcell(rbox(bw, t, bd, 0.004, x + bw / 2, y + t / 2 + k * 0.045, (R() - 0.5) * 0.25), GOODS.books)); }
        x += bw + 0.03;
      }
      for (let x = x0; x < x1 - 0.05; x += 0.04) M.add('goods', gcell(box(0.032, 0.24, 0.17, x, y + 0.12, -d / 2 + 0.12), GOODS.books));
    } else if (kind === 'oils' || kind === 'incense') {
      M.add('woodDark', rbox(x1 - x0, 0.03, d * 0.7, 0.005, (x0 + x1) / 2, y + 0.015, 0));
      for (let x = x0 + 0.03; x < x1 - 0.02; x += 0.045) for (let z = -d * 0.3; z < d * 0.3; z += 0.05) {
        if (kind === 'oils') { const hh = 0.08 + R() * 0.04; M.add('goods', gcell(cyl(0.017, 0.017, hh, 6, y + 0.03), GOODS.oils)); M.add('plasBlack', cyl(0.008, 0.008, 0.02, 5, y + 0.03 + hh)); M.parts.get('goods').at(-1).translate(x, 0, z); M.parts.get('plasBlack').at(-1).translate(x, 0, z); }
        else { M.add('goods', gcell(box(0.035, 0.02, 0.24, x, y + 0.04, z * 0.3), GOODS.beads)); }
      }
    } else if (kind === 'tees' || kind === 'wax') {
      for (let x = x0; x < x1 - 0.22; x += 0.27) for (const z of [-0.18, 0.15]) {
        // heaps of 3 to 10, each fold squared a little
        // differently, the stack leaning as it rises
        const n = 3 + Math.floor(R() * 8), lean = (R() - 0.5) * 0.012;
        for (let k = 0; k < n; k++) {
          // folded tees: printed blacks and whites, and plain colours (the fabric atlas) in the same stack
          const r0 = R(), cell = kind === 'tees' ? (r0 < 0.3 ? GOODS.teeBlack : r0 < 0.5 ? GOODS.teeWhite : null) : null;
          const g = box(0.25 + (R() - 0.5) * 0.03, 0.03, 0.22 + (R() - 0.5) * 0.03, 0, 0, 0);   // plain boxes: a rounded one is ~25 times the triangles for an edge nobody sees
          g.rotateY((R() - 0.5) * 0.16); g.translate(x + 0.12 + (R() - 0.5) * 0.025 + lean * k, y + 0.016 + k * 0.032, z + (R() - 0.5) * 0.025);
          if (cell !== null) M.add('goods', gcell(g, cell));
          else M.add('fab', fcell(g, kind === 'tees' ? [FAB.red, FAB.blue, FAB.yellow, FAB.green, FAB.white, FAB.pink, FAB.sky, FAB.orange, FAB.grey][Math.floor(R() * 9)] : [FAB.waxA, FAB.waxB, FAB.waxC, FAB.waxD, FAB.kente][Math.floor(R() * 5)]));
        }
      }
    } else if (kind === 'caps') {
      for (let x = x0 + 0.1; x < x1 - 0.08; x += 0.2) for (const z of [-0.2, 0.05, 0.25]) {
        const cap = lathe([[0.001, 0.105], [0.05, 0.1], [0.085, 0.07], [0.098, 0.03], [0.1, 0.0]], 10);
        cap.translate(x, y + 0.01 + (z < 0 ? 0.06 : 0), z);
        M.add('goods', gcell(cap, GOODS.caps));
        const brim = cyl(0.075, 0.075, 0.008, 10, 0); brim.scale(1, 1, 0.75); brim.translate(x, y + 0.012 + (z < 0 ? 0.06 : 0), z + 0.1);
        M.add('goods', gcell(brim, GOODS.caps));
      }
    } else if (kind === 'hats') {
      // stacks of brimmed hats (fedoras, sun hats, caps) nested in towers of 4 to 12
      for (let x = x0 + 0.14; x < x1 - 0.12; x += 0.27) for (const z of [-0.18, 0.14]) {
        const n = 6 + Math.floor(R() * 11), col = [FAB.black, FAB.khaki, FAB.white, FAB.navy, FAB.beige, FAB.grey, FAB.brown, FAB.red, FAB.charcoal][Math.floor(R() * 9)];
        for (let k = 0; k < n; k++) {
          const hy = y + k * 0.035;
          const crown = lathe([[0.001, 0.13], [0.06, 0.125], [0.075, 0.09], [0.08, 0.02], [0.13, 0.012], [0.135, 0.0]], 9);
          crown.translate(x + (R() - 0.5) * 0.01, hy, z + (R() - 0.5) * 0.01);
          M.add('fab', fcell(crown, k === n - 1 ? col : [col, FAB.charcoal, FAB.beige][k % 3]));
        }
      }
    } else if (kind === 'shades') {
      // sunglasses cards stood up in two rows (the back row higher on a riser), the vendors' tables full edge to edge
      for (let x = x0 + 0.13; x < x1 - 0.1; x += 0.27) for (const [zz, yy, tl] of [[-0.12, 0.12, -0.12], [0.14, 0, -0.2]]) {
        const g = box(0.24, 0.4, 0.02, 0, 0.2, 0); g.rotateX(tl); g.translate(x + (R() - 0.5) * 0.03, y + yy + 0.005, zz); M.add('goods', gcell(g, GOODS.shades));
        if (yy) M.add('black', box(0.26, yy, 0.16, x, y + yy / 2, zz - 0.02));
      }
    } else if (kind === 'carvings') {
      for (let x = x0 + 0.08; x < x1 - 0.05; x += 0.14) {
        const hh = 0.18 + R() * 0.32, g = lathe([[0.001, 0], [0.045, 0], [0.05, hh * 0.3], [0.035, hh * 0.55], [0.045, hh * 0.8], [0.03, hh], [0.001, hh + 0.02]], 8);
        g.translate(x, y, (R() - 0.5) * 0.4); M.add('goods', gcell(g, GOODS.carving));
      }
      for (let k = 0; k < 6; k++) M.add('goods', gcell(box(0.04, 0.012, 0.3, x0 + R() * (x1 - x0), y + 0.006, 0.1 + R() * 0.15), GOODS.beads));
    } else if (kind === 'soap') {
      for (let x = x0; x < x1 - 0.1; x += 0.11) for (let z = -0.25; z < 0.3; z += 0.13) M.add('goods', gcell(rbox(0.09, 0.05 + R() * 0.03, 0.1, 0.008, x + 0.05, y + 0.03, z), GOODS.soap));
    } else if (kind === 'produce') {
      for (let x = x0; x < x1 - 0.4; x += 0.42) M.put(crate(q, { seed: Math.floor(R() * 1e5), fruit: ['apples', 'oranges', 'limes', 'tomatoes', 'onions', 'bananas'][Math.floor(R() * 6)], tilt: 0.25 }), x + 0.2, y, 0.05);
    }
  });
  return M;
}
// a black plastic produce crate (0.4 x 0.3 x 0.17 m, slotted walls) heaped with fruit; tilted toward +z by `tilt`
export function crate(q, p = {}) {
  const M = new Model(), R = rng(p.seed || 5), W = 0.4, D = 0.3, H = 0.17, tilt = p.tilt || 0;
  const T = new THREE.Matrix4().makeRotationX(tilt).premultiply(new THREE.Matrix4().makeTranslation(0, 0.03, 0));
  const parts = [];
  parts.push(['plasBlack', box(W, 0.012, D, 0, 0.006, 0)]);
  for (const [w, d, x, z] of [[W, 0.012, 0, D / 2], [W, 0.012, 0, -D / 2], [0.012, D, W / 2, 0], [0.012, D, -W / 2, 0]]) parts.push(['plasBlack', box(w, H, d, x, H / 2, z)]);
  const cell = GOODS[p.fruit || 'apples'];
  if (p.fruit === 'bananas') {
    for (let k = 0; k < 5; k++) { const c = tube([[-0.15, 0.1, -0.08 + k * 0.04], [0, 0.16 + R() * 0.03, -0.06 + k * 0.04], [0.15, 0.12, -0.08 + k * 0.04]], 0.022, 8, 6); parts.push(['produce', gcell(c, cell)]); }
  } else {
    const r = p.fruit === 'oranges' ? 0.04 : p.fruit === 'limes' ? 0.028 : p.fruit === 'onions' ? 0.038 : 0.037;
    // the heap under the top layer (its texture is the fruit's skin), then the top layer, one ball each
    parts.push(['produce', gcell(box(W - 0.03, H * 0.5, D - 0.03, 0, H * 0.55, 0), cell)]);
    if (q) for (let ix = 0; ix < Math.floor(W / (2 * r)); ix++) for (let iz = 0; iz < Math.floor(D / (2 * r)); iz++) {
      const g = lumpy(r * (0.92 + R() * 0.16), p.lite ? 0 : 1, Math.floor(R() * 1e4), 0.92, 0.08);
      g.translate(-W / 2 + r + ix * 2 * r + (R() - 0.5) * 0.008, H * 0.8 + (R() - 0.5) * 0.015 + Math.sin(ix * 1.3 + iz) * 0.006, -D / 2 + r + iz * 2 * r + (R() - 0.5) * 0.008);
      parts.push(['produce', gcell(g, cell)]);
    }
  }
  for (const [k, g] of parts) M.add(k, g.applyMatrix4(T));
  return M;
}

// ---------------------------------------------------------------- the produce stall
// len along x: a white canopy over a run of tables with tilted crates, a second tier behind, boxes under and behind,
// the printed valance at the front, sandbags on the legs
export function produceStall(q, p = {}) {
  const M = new Model(), R = rng(p.seed || 11), L = p.len || 7.0, D = 2.4, H = 2.25, T = 0.95;
  // the canopy frame: a module every ~2.3 m, legs front and back, white powder-coat, sandbags on the feet
  const nb = Math.max(1, Math.round(L / 2.3)), bw = L / nb, z0 = 0.35, z1 = -D + 0.35;
  for (let i = 0; i <= nb; i++) {
    const x = -L / 2 + i * bw;
    for (const z of [z0, z1]) {
      M.add('plasWhite', box(0.035, H, 0.035, x, H / 2, z));
      if (q) { M.add('plasWhite', rod([x, H - 0.05, z], [x + (i < nb ? 0.45 : -0.45), H - 0.4, z], 0.01, 4)); M.add('tarp', fcell(box(0.22, 0.12, 0.3, x, 0.06, z), FAB.charcoal)); }
    }
  }
  // roof: a row of peaked modules (a pyramid of cloth over each, the peak 0.7 m over the eaves), each face sagging a little
  const eave = H + 0.08, peak = H + 0.52, sub = q ? 3 : 1;
  for (let i = 0; i < nb; i++) {
    const xa = -L / 2 + i * bw - 0.04, xb = xa + bw + 0.08, xc = (xa + xb) / 2, zc = (z0 + z1) / 2, za = z0 + 0.1, zb = z1 - 0.1;
    const Pk = [xc, peak, zc], corners = [[xa, eave, za], [xb, eave, za], [xb, eave, zb], [xa, eave, zb]];
    const pos = [], uv = [];
    for (let f = 0; f < 4; f++) {
      const A = corners[f], B = corners[(f + 1) % 4];
      // a triangle fan from the peak, subdivided along the eave, the cloth dipping between the corner and the middle
      for (let k = 0; k < sub; k++) {
        const t0 = k / sub, t1 = (k + 1) / sub;
        const E = (t) => { const x = A[0] + (B[0] - A[0]) * t, z = A[2] + (B[2] - A[2]) * t; return [x, eave - (q ? 0.05 * Math.sin(PI * t) : 0), z]; };
        const M0 = (t) => { const e = E(t); return [(e[0] + Pk[0]) / 2, (e[1] + Pk[1]) / 2 - (q ? 0.05 : 0), (e[2] + Pk[2]) / 2]; };
        const e0 = E(t0), e1 = E(t1), m0 = M0(t0), m1 = M0(t1);
        for (const v of [Pk, m1, m0, m0, m1, e1, m0, e1, e0]) { pos.push(...v); uv.push(v[0] + v[2], v[1]); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    M.add('canopy', fcell(g, FAB.white));
    if (q) M.add('plasWhite', cyl(0.025, 0.012, 0.12, 6, peak - 0.02).translate(xc, 0, zc));
  }
  // the valance: the printed strip at the front eave
  { const g = new THREE.PlaneGeometry(L + 0.12, 0.28); g.translate(0, eave - 0.14, z0 + 0.11); M.add('valance', strip(g)); }
  // the table: a front run of crates tilted to the street at T, a back tier of white produce boxes and black crates
  for (let x = -L / 2 + 0.15; x < L / 2 - 0.4; x += 0.43) {
    M.put(crate(q, { seed: Math.floor(R() * 1e5), fruit: ['apples', 'oranges', 'limes', 'tomatoes', 'onions', 'bananas', 'apples', 'oranges'][Math.floor(R() * 8)], tilt: 0.3 }), x + 0.2, T + 0.02, 0.05);
    M.put(crate(q, { seed: Math.floor(R() * 1e5), fruit: ['apples', 'oranges', 'limes', 'tomatoes', 'onions'][Math.floor(R() * 5)], tilt: 0.15, lite: true }), x + 0.2, T + 0.2, -0.4);
  }
  for (let x = -L / 2 + 0.25; x < L / 2 - 0.3; x += 0.52) {
    M.add('plasWhite', box(0.48, 0.3, 0.32, x + 0.24, T + 0.55, -0.82));
    if (q && R() < 0.6) M.add('plasWhite', box(0.48, 0.28, 0.32, x + 0.24, T + 0.85, -0.85));
    if (q) M.add('goods', gcell(box(0.3, 0.16, 0.005, x + 0.24, T + 0.57, -0.655), [GOODS.apples, GOODS.oranges, GOODS.limes, GOODS.tomatoes][Math.floor(R() * 4)]));
  }
  M.add('wood', rbox(L - 0.1, 0.03, 0.62, 0.006, 0, T, 0.0), rbox(L - 0.1, 0.03, 0.5, 0.006, 0, T + 0.18, -0.42), rbox(L - 0.1, 0.03, 0.4, 0.006, 0, T + 0.38, -0.82));
  for (let x = -L / 2 + 0.2; x < L / 2; x += 1.4) M.add('woodDark', box(0.06, T, 0.06, x, T / 2, 0.25), box(0.06, T + 0.38, 0.06, x, (T + 0.38) / 2, -0.95));
  // the front: a grey sheet from the sidewalk to the table
  M.add('galvDull', box(L - 0.15, T - 0.12, 0.012, 0, (T - 0.12) / 2 + 0.06, 0.31));
  // boxes under and behind
  if (q) {
    for (let k = 0; k < Math.round(L * 1.2); k++) {
      const w = 0.35 + R() * 0.25, h = 0.25 + R() * 0.2, d = 0.3 + R() * 0.15, x = -L / 2 + 0.3 + R() * (L - 0.6), z = -1.25 - R() * 0.6, st = Math.floor(R() * 3);
      for (let s2 = 0; s2 < st + 1; s2++) M.add('cardboard', gcell(rbox(w, h, d, 0.01, x + (R() - 0.5) * 0.04, h / 2 + s2 * h, z), GOODS.cardboard));
    }
  }
  return M;
}
// a steel crowd-control barrier, 2.4 m, galvanised, flat feet
export function barrier(q) {
  const M = new Model(), L = 2.4, H = 1.08;
  M.add('galv', rod([-L / 2, 0.12, 0], [-L / 2, H, 0], 0.019, q ? 8 : 4), rod([L / 2, 0.12, 0], [L / 2, H, 0], 0.019, q ? 8 : 4));
  M.add('galv', rod([-L / 2, H, 0], [L / 2, H, 0], 0.019, q ? 8 : 4), rod([-L / 2, 0.2, 0], [L / 2, 0.2, 0], 0.016, q ? 8 : 4));
  if (q) for (let i = 1; i < 14; i++) { const x = -L / 2 + (i * L) / 14; M.add('galv', rod([x, 0.2, 0], [x, H, 0], 0.008, 4)); }
  for (const x of [-L / 2 + 0.05, L / 2 - 0.05]) M.add('galvDull', box(0.05, 0.02, 0.62, x, 0.01, 0), rod([x, 0.12, 0], [x, 0.02, 0.28], 0.01, 4), rod([x, 0.12, 0], [x, 0.02, -0.28], 0.01, 4));
  return M;
}
// a hand truck (red frame, nose plate, two pneumatic wheels), standing tipped back against `lean`
export function handTruck(q, p = {}) {
  const M = new Model(), H = 1.2;
  for (const x of [-0.18, 0.18]) M.add('redPaint', rod([x, 0.1, 0], [x, H, -0.22], 0.013, q ? 8 : 4));
  for (const y of [0.45, 0.8, 1.1]) M.add('redPaint', rod([-0.18, y, -0.22 * (y - 0.1) / (H - 0.1)], [0.18, y, -0.22 * (y - 0.1) / (H - 0.1)], 0.009, 4));
  M.add('galvDull', box(0.4, 0.008, 0.22, 0, 0.004, 0.11));
  for (const x of [-0.24, 0.24]) { const t = new THREE.TorusGeometry(0.11, 0.035, q ? 8 : 4, q ? 16 : 8); t.rotateY(PI / 2); t.translate(x, 0.13, -0.06); M.add('rubber', strip(t)); }
  M.add('black', rod([-0.26, 0.13, -0.06], [0.26, 0.13, -0.06], 0.01, 4));
  if (p.load) M.add('plasWhite', rbox(0.42, 0.36, 0.3, q ? 0.015 : 0, 0, 0.2, 0.0).rotateX(-0.1));
  return M;
}
// cardboard: a stack of boxes (n), a produce box with its flaps open
export function boxes(q, p = {}) {
  const M = new Model(), R = rng(p.seed || 17), n = p.n || 3;
  let y = 0;
  for (let k = 0; k < n; k++) {
    const w = 0.4 + R() * 0.2, h = 0.22 + R() * 0.15, d = 0.3 + R() * 0.12;
    const g = rbox(w, h, d, 0.008, (R() - 0.5) * 0.06, y + h / 2, (R() - 0.5) * 0.06); g.rotateY((R() - 0.5) * 0.3);
    M.add('cardboard', gcell(g, GOODS.cardboard));
    y += h;
  }
  return M;
}

// ---------------------------------------------------------------- rubbish bags (black or white), piled
export function bags(q, p = {}) {
  const M = new Model(), R = rng(p.seed || 23), n = p.n || 4, key = p.white ? 'bagWhite' : 'bagBlack';
  const placed = [];
  for (let k = 0; k < n; k++) {
    const r = 0.24 + R() * 0.14, x = (R() - 0.5) * (p.w || 1.2), z = (R() - 0.5) * (p.d || 0.7);
    let y = 0;
    for (const o of placed) { const dd = Math.hypot(o.x - x, o.z - z); if (dd < (o.r + r) * 0.75) y = Math.max(y, o.y + o.r * 0.55); }
    placed.push({ x, y, z, r });
    M.add(key, bag(r, q, Math.floor(R() * 1e4), R).translate(x, y, z));
  }
  return M;
}
// one full bag: a sack that sits on a flattened base, bulges with its contents (lumps and creases), gathers to a tied
// neck with two ears; y = 0 at the ground
function bag(r, q, seed, R) {
  const ws = q ? [14, 10] : [7, 5];
  const g = new THREE.SphereGeometry(r, ws[0], ws[1]), P = g.getAttribute('position'), RR = rng(seed);
  const waves = [0, 1, 2, 3, 4].map((i) => [RR() * 2 - 1, RR() * 2 - 1, RR() * 2 - 1, 3 + RR() * 4 + i, RR() * 6, 0.05 + RR() * 0.05]);
  const sx = 1 + RR() * 0.35, sz = 0.85 + RR() * 0.2, lean = (RR() - 0.5) * 0.3;
  for (let i = 0; i < P.count; i++) {
    let x = P.getX(i) / r, y = P.getY(i) / r, z = P.getZ(i) / r;
    let f = 1;
    for (const [a, b, c, k, ph, amp] of waves) f += amp * Math.sin((a * x + b * y + c * z) * k + ph);
    x *= f * sx; z *= f * sz; y *= f;
    // the base settles flat and spreads; the top gathers toward the neck
    if (y < -0.35) { const d = -0.35 - y; y = -0.35 - d * 0.25; x *= 1 + d * 0.5; z *= 1 + d * 0.5; }
    if (y > 0.35) { const t = Math.min(1, (y - 0.35) / 0.65); x *= 1 - 0.7 * t; z *= 1 - 0.7 * t; y += 0.15 * t; }
    P.setXYZ(i, (x + lean * y) * r, (y + 0.42) * r * 0.82, z * r);
  }
  g.computeVertexNormals();
  const out = strip(g);
  out.rotateY(R() * PI * 2);
  if (!q) return out;
  // the neck and the two ears of the knot
  const top = r * 0.82 * 1.57, nk = cyl(0.045, 0.02, 0.1, 6, 0); nk.translate(0, top - 0.02, 0);
  const e1 = cyl(0.012, 0.03, 0.09, 5, 0); e1.rotateZ(0.9); e1.translate(0.03, top + 0.06, 0);
  const e2 = cyl(0.012, 0.03, 0.08, 5, 0); e2.rotateZ(-1.0); e2.translate(-0.03, top + 0.06, 0.01);
  return mergeAll([out, nk, e1, e2]);
}
function mergeAll(gs) {
  const pos = [], nor = [], uv = [];
  for (const g of gs) {
    const q = g.index ? g.toNonIndexed() : g;
    pos.push(...q.getAttribute('position').array); nor.push(...q.getAttribute('normal').array);
    const u = q.getAttribute('uv'); if (u) uv.push(...u.array); else for (let i = 0; i < q.getAttribute('position').count; i++) uv.push(0, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

// ---------------------------------------------------------------- two-wheelers: lkTwo.js (bicycles, share and delivery e-bikes, scooters)
export { moped, ebike, bicycle, motorcycle } from './lkTwo.js';

// ---------------------------------------------------------------- carts, panels, racks
// a welded wire cart (w x d x h) on four casters, mesh sides, a black steel frame
export function cageCart(q, p = {}) {
  const M = new Model(), w = p.w || 1.1, d = p.d || 0.62, h = p.h || 1.0, y0 = 0.14, key = p.key || 'mesh';
  const fr = p.frame || 'black';
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    M.add(fr, rod([sx * w / 2, y0, sz * d / 2], [sx * w / 2, y0 + h, sz * d / 2], 0.012, 4));
    if (q) { const c = cyl(0.05, 0.05, 0.04, 8, -0.02); c.rotateZ(PI / 2); c.translate(sx * (w / 2 - 0.04), 0.05, sz * (d / 2 - 0.04)); M.add('rubber', c); }
  }
  for (const y of [y0, y0 + h]) { M.add(fr, rod([-w / 2, y, d / 2], [w / 2, y, d / 2], 0.01, 4), rod([-w / 2, y, -d / 2], [w / 2, y, -d / 2], 0.01, 4), rod([-w / 2, y, -d / 2], [-w / 2, y, d / 2], 0.01, 4), rod([w / 2, y, -d / 2], [w / 2, y, d / 2], 0.01, 4)); }
  const side = (W, H, x, z, ry) => { const g = new THREE.PlaneGeometry(W, H); const u = g.getAttribute('uv'); for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * W / 0.2, u.getY(i) * H / 0.2); g.rotateY(ry); g.translate(x, y0 + H / 2, z); return strip(g); };
  M.add(key, side(w, h, 0, d / 2, 0), side(w, h, 0, -d / 2, 0), side(d, h, w / 2, 0, PI / 2), side(d, h, -w / 2, 0, PI / 2));
  M.add(key, (() => { const g = new THREE.PlaneGeometry(w, d); const u = g.getAttribute('uv'); for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * w / 0.2, u.getY(i) * d / 0.2); g.rotateX(-PI / 2); g.translate(0, y0 + 0.01, 0); return strip(g); })());
  if (p.load) M.put(p.load, 0, y0 + 0.02, 0);
  return M;
}
// a wire grid panel (a vendor's display wall) on two legs, goods hooked on it
export function gridPanel(q, p = {}) {
  const M = new Model(), w = p.w || 1.2, h = p.h || 1.8, R = rng(p.seed || 29);
  M.add('black', rod([-w / 2, 0, 0], [-w / 2, h, 0], 0.012, 4), rod([w / 2, 0, 0], [w / 2, h, 0], 0.012, 4));
  const g = new THREE.PlaneGeometry(w, h - 0.2); const u = g.getAttribute('uv'); for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * w / 0.2, u.getY(i) * (h - 0.2) / 0.2); g.translate(0, h / 2 + 0.1, 0);
  M.add('meshGalv', strip(g));
  if (q) for (let k = 0; k < 14; k++) { const x = (R() - 0.5) * (w - 0.2), y = 0.5 + R() * (h - 0.8); M.add('goods', gcell(box(0.16, 0.2, 0.03, x, y, 0.035), [GOODS.beads, GOODS.shades, GOODS.oils, GOODS.caps][k % 4])); }
  return M;
}
// a clothing rack (chrome tube, casters) with garments on hangers: dresses and shirts in wax prints, a board on top
export function clothesRack(q, p = {}) {
  const M = new Model(), w = p.w || 1.5, h = p.h || 1.75, R = rng(p.seed || 31);
  for (const s of [-1, 1]) { M.add('chrome', rod([s * w / 2, 0.08, 0], [s * w / 2, h, 0], 0.014, q ? 8 : 4), rod([s * w / 2, 0.08, -0.25], [s * w / 2, 0.08, 0.25], 0.012, 4)); }
  M.add('chrome', rod([-w / 2, h, 0], [w / 2, h, 0], 0.013, q ? 8 : 4));
  const n = q ? Math.round(w / 0.07) : 4;
  for (let i = 0; i < n; i++) {
    const pal = p.cols || [FAB.waxA, FAB.waxB, FAB.waxC, FAB.waxD, FAB.kente, FAB.orange, FAB.black, FAB.red, FAB.purple];
    const x = -w / 2 + 0.08 + (i / n) * (w - 0.12), L = q ? 0.85 + R() * 0.55 : 1.1, cell = pal[Math.floor(R() * pal.length)];
    // a garment: a strip that hangs from the shoulders, flaring toward the hem, gently wavy
    const nu = q ? 4 : 1, nv = q ? 6 : 1, pos = [], uv = [], ph = R() * 6, ry = (R() - 0.5) * 0.5;
    const V = (iu, iv) => { const t = iu / nu - 0.5, s = iv / nv, wid = 0.42 + 0.14 * s, zz = t * wid, yy = h - 0.08 - s * L, xx = (q ? 0.018 * Math.sin(t * 9 + ph) * (0.3 + s) : 0); return [x + xx + Math.sin(ry) * zz, yy, Math.cos(ry) * zz, t * wid, -s * L]; };
    for (let iu = 0; iu < nu; iu++) for (let iv = 0; iv < nv; iv++) { const A = V(iu, iv), B = V(iu + 1, iv), C = V(iu + 1, iv + 1), D = V(iu, iv + 1); for (const v of [A, B, C, A, C, D]) { pos.push(v[0], v[1], v[2]); uv.push(v[3], v[4]); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
    M.add('fab', fcell(g, cell));
    if (q) M.add('black', rod([x, h, 0], [x, h - 0.08, 0], 0.003, 3));
  }
  if (p.top) M.add('woodDark', rbox(w + 0.2, 0.025, 0.7, 0.005, 0, h + 0.12, 0));
  if (p.drape) { const g = new THREE.PlaneGeometry(w + 0.1, 0.5, q ? 6 : 1, q ? 3 : 1); const P = g.getAttribute('position'); for (let i = 0; i < P.count; i++) P.setZ(i, 0.05 * Math.sin(P.getX(i) * 7)); g.rotateX(-PI / 2 + 0.25); g.translate(0, h + 0.16, 0); g.computeVertexNormals(); M.add('fab', fcell(strip(g), p.drape)); }
  return M;
}
// a folding chair (steel, a fabric or plastic seat)
export function chair(q, p = {}) {
  const M = new Model(), key = p.col || 'plasWhite';
  M.add('alu', rod([-0.2, 0, 0.22], [-0.2, 0.82, -0.18], 0.01, 4), rod([0.2, 0, 0.22], [0.2, 0.82, -0.18], 0.01, 4), rod([-0.2, 0, -0.2], [-0.2, 0.45, 0.12], 0.01, 4), rod([0.2, 0, -0.2], [0.2, 0.45, 0.12], 0.01, 4));
  M.add(key, rbox(0.42, 0.025, 0.4, q ? 0.01 : 0, 0, 0.45, 0.02), (() => { const g = rbox(0.42, 0.22, 0.02, q ? 0.008 : 0, 0, 0.7, -0.16); g.rotateX(0); return g; })());
  return M;
}
// a lidded black storage tote (0.75 x 0.5 x 0.45 m)
export function tote(q, p = {}) {
  // a moulded tote: the body narrowing to its foot, a rolled rim, the lid with its raised panel, ribs down the long sides,
  // the latch handles at the ends (yellow on a black tote, as at the Studio Museum stall in 2026-08)
  const M = new Model(), k = p.col || 'plasBlack', n = p.n || 1, lt = p.latch || (k === 'plasBlack' ? 'plasYellow' : k);
  for (let i = 0; i < n; i++) {
    const y0 = i * 0.45, body = rbox(0.7, 0.38, 0.46, q ? 0.03 : 0, 0, 0.19, 0, 1);
    const P = body.getAttribute('position');
    for (let j = 0; j < P.count; j++) { const t = 1 - 0.1 * (1 - P.getY(j) / 0.38); P.setX(j, P.getX(j) * t); P.setZ(j, P.getZ(j) * t); }
    body.translate(0, y0, 0);
    M.add(k, body, rbox(0.74, 0.03, 0.5, q ? 0.012 : 0, 0, y0 + 0.385, 0), rbox(0.76, 0.045, 0.52, q ? 0.018 : 0, 0, y0 + 0.42, 0, 1));
    if (!q) continue;
    M.add(k, rbox(0.56, 0.016, 0.32, 0, 0, y0 + 0.448, 0));
    for (const s of [-1, 1]) {
      for (let r = 0; r < 4; r++) M.add(k, box(0.018, 0.3, 0.012, -0.24 + r * 0.16, y0 + 0.2, s * 0.226));
      M.add(lt, rbox(0.03, 0.13, 0.16, 0.008, s * 0.38, y0 + 0.37, 0, 1));
    }
  }
  return M;
}
// a bundle under a crumpled tarp (w x d, h high): a squashed lumpy heap in the tarp's crinkled blue, its hem spreading on
// the ground, a white bag or two showing at its edge (the Studio Museum stall, 2026-08)
export function tarpHeap(q, p = {}) {
  const M = new Model(), w = p.w || 1.0, d = p.d || 0.6, h = p.h || 0.35, R = rng(p.seed || 61);
  const ws = q ? [22, 12] : [8, 5];
  const g = new THREE.SphereGeometry(0.5, ws[0], ws[1]), P = g.getAttribute('position');
  const waves = [0, 1, 2, 3, 4, 5].map((i) => [R() * 2 - 1, R() * 2 - 1, R() * 2 - 1, 4 + R() * 6 + i, R() * 6, 0.04 + R() * 0.05]);
  for (let i = 0; i < P.count; i++) {
    let x = P.getX(i) / 0.5, y = P.getY(i) / 0.5, z = P.getZ(i) / 0.5;
    let f = 1;
    for (const [a, b, c, k, ph, amp] of waves) f += amp * Math.sin((a * x + b * y + c * z) * k + ph);
    x *= f; z *= f; y *= f;
    if (y < 0) { const t = -y; y = -t * 0.08; x *= 1 + t * 0.25; z *= 1 + t * 0.25; }
    P.setXYZ(i, (x * w) / 2, (y + 0.08) * h, (z * d) / 2);
  }
  g.computeVertexNormals();
  M.add('tarp', strip(g));
  if (q) for (let k = 0; k < 2; k++) M.add('bagWhite', bag(0.15 + R() * 0.06, q, Math.floor(R() * 1e4), R).translate((R() - 0.5) * w * 0.7, 0, (d / 2) * 0.75 * (k ? 1 : -1)));
  return M;
}
// a tub (a vendor's plastic tote)
export function tub(q, p = {}) {
  const M = new Model();
  M.add(p.col || 'plasGreen', lathe([[0.001, 0], [0.24, 0], [0.27, 0.32], [0.29, 0.34], [0.27, 0.34], [0.25, 0.04], [0.001, 0.04]], q ? 4 : 4, PI / 4));
  return M;
}

// ---------------------------------------------------------------- the sidewalk shed (a pipe-scaffold shed, the Theresa's 2024)
// len along x, dep toward -z (the building), the deck's underside at h: posts in two rows every `bay`, ledgers, X bracing
// on the front and the ends, steel beams across, a plywood deck, the parapet (plywood, POST NO BILLS) and its notice boards,
// tube lights under the deck
export function shed(q, p = {}) {
  const M = new Model(), L = p.len || 24, D = p.dep || 4.6, H = p.h || 4.3, bay = p.bay || 2.4, R = rng(p.seed || 41);
  const nb = Math.max(1, Math.round(L / bay)), bx = L / nb, pr = 0.024, rs = q ? 8 : 4;
  const xs = []; for (let i = 0; i <= nb; i++) xs.push(-L / 2 + i * bx);
  const rows = [0, -D];
  for (const x of xs) for (const z of rows) { M.add('galv', rod([x, 0, z], [x, H + 0.05, z], pr, rs)); if (q) M.add('galvDull', box(0.15, 0.012, 0.15, x, 0.006, z)); }
  const ledg = H > 3.9 ? [2.3, 3.3, H - 0.1] : [2.3, H - 0.1];
  for (const z of rows) for (const y of ledg) M.add('galv', rod([-L / 2, y, z], [L / 2, y, z], 0.02, rs));
  // the walk under the deck stays clear to 2.75 m (NYC sheds keep 8 ft and more of headroom): the cross members run over it
  const clr = Math.min(2.75, H - 0.6);
  for (const x of xs) for (const y of [clr, H - 0.1]) M.add('galv', rod([x, y, 0], [x, y, -D], 0.02, rs));
  // X bracing in the front bays above head height and in the ends
  if (q) {
    for (let i = 0; i < nb; i++) if (i % 2 === 0) { const x0 = xs[i], x1 = xs[i + 1]; M.add('galv', rod([x0, 2.3, 0.03], [x1, H - 0.1, 0.03], 0.016, 4), rod([x1, 2.3, 0.03], [x0, H - 0.1, 0.03], 0.016, 4)); }
    // a pipe-scaffold shed (p.dense): full-height X bracing in every third front bay, a ledger at 1.2 m on the kerb row, and
    // the black outrigger beams that run up from the shopfront posts to the deck's front edge
    if (p.dense) {
      for (let i = 1; i < nb; i += 3) { const x0 = xs[i], x1 = xs[i + 1]; M.add('galv', rod([x0, 0.25, 0.03], [x1, 2.3, 0.03], 0.016, 4), rod([x1, 0.25, 0.03], [x0, 2.3, 0.03], 0.016, 4)); }
      M.add('galv', rod([-L / 2, 1.2, 0], [L / 2, 1.2, 0], 0.018, rs));
      for (let i = 0; i <= nb; i += 2) {
        // rising 0.55 m from the shopfront row to the kerb row, under the deck
        const g = box(0.12, 0.16, Math.hypot(D, 0.55), 0, 0, 0);
        g.rotateX(-Math.atan2(0.55, D)); g.translate(xs[i], H - 0.38, -D / 2);
        M.add('beam', g);
      }
    }
    // the ends: X bracing over the walk only (people walk in under the shed's ends)
    for (const x of [xs[0], xs[nb]]) M.add('galv', rod([x, clr, 0], [x, H - 0.1, -D], 0.016, 4), rod([x, H - 0.1, 0], [x, clr, -D], 0.016, 4));
    // couplers at the crossings
    for (const x of xs) for (const z of rows) for (const y of [2.3, clr, H - 0.1]) M.add('galvDull', box(0.07, 0.08, 0.07, x, y, z));
  }
  // beams across the depth and the deck
  for (let x = -L / 2; x <= L / 2 + 1e-3; x += q ? 0.8 : bx) M.add('beam', box(0.1, 0.2, D + 0.4, x, H + 0.15, -D / 2));
  M.add('beam', box(L + 0.2, 0.24, 0.12, 0, H + 0.13, 0.12), box(L + 0.2, 0.24, 0.12, 0, H + 0.13, -D - 0.1));
  M.add('deck', box(L + 0.3, 0.06, D + 0.5, 0, H + 0.28, -D / 2));
  // parapet: plywood on the front and the ends, 1.2 m, painted
  const par = 1.2, pf = (w, x, z, ry) => { const g = new THREE.PlaneGeometry(w, par); const u = g.getAttribute('uv'); for (let i = 0; i < u.count; i++) u.setXY(i, (u.getX(i) * w) / 4.8, u.getY(i)); g.rotateY(ry); g.translate(x, H + 0.31 + par / 2, z); return strip(g); };
  const face = p.plain ? 'plyFacePlain' : 'plyFace';
  M.add(face, pf(L + 0.3, 0, 0.19, 0), pf(D + 0.5, -L / 2 - 0.15, -D / 2, -PI / 2), pf(D + 0.5, L / 2 + 0.15, -D / 2, PI / 2));
  M.add('ply', box(L + 0.3, par, 0.02, 0, H + 0.31 + par / 2, 0.17), box(L + 0.34, 0.05, 0.12, 0, H + 0.31 + par, 0.15));
  // notice boards on the parapet's face
  if (q && p.signs !== false) {
    const signs = p.signs || [[-L / 2 + 2.2, 0], [0.2 * L, 1], [-0.1 * L, 2], [L / 2 - 3, 3]];
    for (const [x, c, sw = 1.6, sh = 0.8] of signs) {
      const g = new THREE.PlaneGeometry(sw, sh); const u = g.getAttribute('uv');
      for (let i = 0; i < u.count; i++) u.setXY(i, ((c % 2) + u.getX(i)) / 2, 1 - (Math.floor(c / 2) + 1 - u.getY(i)) / 2);
      g.translate(x, H + 0.31 + par / 2 + (R() - 0.5) * 0.1, 0.205); M.add('shedSign', strip(g));
    }
  }
  // tube lights under the deck, one per bay over the walk
  for (let i = 0; i < nb; i++) { const x = (xs[i] + xs[i + 1]) / 2; M.add('tube', cyl(0.018, 0.018, 1.2, 6, -0.6).rotateZ(PI / 2).translate(x, H - 0.02, -D * 0.45)); if (q) M.add('alu', box(1.25, 0.04, 0.08, x, H + 0.02, -D * 0.45)); }
  return M;
}

// a sandwich board (A-frame): two yellow plastic panels 0.6 x 1.0 m hinged at the top, splayed, a poster on each face
export function aframe(q, p = {}) {
  // p.col: the frame (plasYellow, plasWhite, black); p.face: the panels (aframe = the poster, or a plain key: a white
  // board, a black chalkboard); p.w / p.h: other sizes (a tall menu board 0.6 x 1.2)
  const M = new Model(), W = p.w || 0.6, H = p.h || 1.0, a = 0.2, fk = p.face || 'aframe';
  for (const sd of [1, -1]) {
    const T = new THREE.Matrix4().makeRotationX(sd * a).premultiply(new THREE.Matrix4().makeTranslation(0, 0, 0));
    const fr = rbox(W, H, 0.03, q ? 0.012 : 0, 0, -H / 2, 0); fr.applyMatrix4(T); fr.translate(0, H * Math.cos(a), 0);
    M.add(p.col || 'plasYellow', fr);
    const g = new THREE.PlaneGeometry(W - 0.06, H - 0.08); if (sd < 0) g.rotateY(PI); g.translate(0, -H / 2, sd * 0.016); g.applyMatrix4(T); g.translate(0, H * Math.cos(a), 0);
    M.add(fk, strip(g));
  }
  return M;
}

// an air dancer: a nylon tube figure (body, two arms, a head with eyes) blown up from a fan drum, caught mid-sway
export function airDancer(q, p = {}) {
  const M = new Model(), H = p.h || 2.3, r = p.r || 0.15, cell = p.col ?? FAB.nylonRed, sw = p.sway ?? 0.22;
  M.add('plasBlack', cyl(0.22, 0.25, 0.3, q ? 16 : 8, 0.05), box(0.5, 0.05, 0.5, 0, 0.025, 0));
  if (q) M.add('black', cyl(0.17, 0.17, 0.02, 12, 0.35), box(0.06, 0.04, 0.3, 0.23, 0.2, 0));
  const P = (x, y, z) => new THREE.Vector3(x, y, z);
  const body = [P(0, 0.34, 0), P(0.01, H * 0.25, 0.02), P(sw * 0.45, H * 0.55, 0.05), P(sw * 0.9, H * 0.8, 0.03), P(sw * 0.85, H * 0.93, 0)];
  M.add('fab', fcell(strip(tube(body, (t) => r * (1.05 - 0.2 * t), q ? 18 : 5, q ? 12 : 5)), cell));
  const sh = [sw * 0.82, H * 0.74, 0.03];
  for (const s of [-1, 1]) {
    const arm = [P(...sh), P(sh[0] + s * 0.22, sh[1] + 0.06, 0.06), P(sh[0] + s * 0.42, sh[1] + (s > 0 ? 0.3 : 0.08), 0.1), P(sh[0] + s * 0.5, sh[1] + (s > 0 ? 0.62 : 0.02), 0.08)];
    M.add('fab', fcell(strip(tube(arm, (t) => 0.065 + 0.03 * t, q ? 10 : 3, q ? 8 : 4)), cell));
  }
  // the head: a bulb over the body's top, two white eyes with black pupils on its front
  const hx = sw * 0.85, hy = H * 0.93;
  M.add('fab', fcell(lathe([[0.001, 0], [0.12, 0.02], [0.17, 0.14], [0.15, 0.26], [0.08, 0.32], [0.001, 0.33]], q ? 12 : 6).translate(hx, hy, 0), cell));
  if (q) for (const s of [-1, 1]) {
    M.add('plasWhite', cyl(0.045, 0.045, 0.02, 10, 0).rotateX(PI / 2).translate(hx + s * 0.06, hy + 0.2, 0.15));
    M.add('black', cyl(0.02, 0.02, 0.02, 8, 0).rotateX(PI / 2).translate(hx + s * 0.06, hy + 0.19, 0.162));
  }
  return M;
}

// a white resin chair (the stackable monobloc): a dished seat, a slatted back, splayed legs, arms
export function monobloc(q, p = {}) {
  const M = new Model(), k = p.col || 'plasWhite';
  M.add(k, rbox(0.46, 0.035, 0.44, q ? 0.015 : 0, 0, 0.43, 0.02));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) M.add(k, rod([sx * 0.25, 0, sz * 0.25], [sx * 0.2, 0.43, sz * 0.19], 0.022, q ? 6 : 4));
  const back = rbox(0.46, 0.42, 0.03, q ? 0.015 : 0, 0, 0.21, 0); back.rotateX(-0.18); back.translate(0, 0.47, -0.22);
  M.add(k, back);
  if (q) for (const sx of [-1, 1]) M.add(k, rod([sx * 0.23, 0.64, -0.2], [sx * 0.23, 0.62, 0.14], 0.016, 4), rod([sx * 0.23, 0.62, 0.14], [sx * 0.21, 0.44, 0.18], 0.016, 4));
  return M;
}

// a tarp hung as a wall (a vendor's sun screen or a stall's side): a rope or pole at the top, the tarp in loose folds
// (deeper toward the hem), the hem lifting where the folds bunch, a pole at each end; w along x, hanging from h
export function tarpWall(q, p = {}) {
  const M = new Model(), w = p.w || 3.0, h = p.h || 2.0, cell = p.col ?? FAB.tarpCrease, R = rng(p.seed || 71), hem = p.hem ?? 0.15;
  const nu = q ? Math.max(8, Math.round(w * 6)) : 2, nv = q ? 6 : 1, ph = R() * 6, ph2 = R() * 6, pos = [], uv = [];
  const V = (iu, iv) => {
    const u = iu / nu, v = iv / nv, x = -w / 2 + u * w;
    const amp = (q ? 0.05 + 0.11 * v : 0), zz = amp * Math.sin(u * w * 5.5 + ph) + amp * 0.5 * Math.sin(u * w * 13 + ph2) + (q ? 0.04 * v * v : 0);
    const y = h - v * (h - hem - (q ? 0.06 * Math.sin(u * w * 2.3 + ph) : 0)) - (q ? 0.06 * Math.sin(PI * u) * (1 - v) : 0);
    return [x, y, zz, u * w, -v * h];
  };
  for (let iu = 0; iu < nu; iu++) for (let iv = 0; iv < nv; iv++) { const A = V(iu, iv), B = V(iu + 1, iv), C = V(iu + 1, iv + 1), D = V(iu, iv + 1); for (const v of [A, B, C, A, C, D]) { pos.push(v[0], v[1], v[2]); uv.push(v[3], v[4]); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
  M.add('fab', fcell(g, cell));
  if (p.poles !== false) for (const s of [-1, 1]) M.add('alu', rod([s * w / 2, 0, -0.03], [s * w / 2, h + 0.08, -0.03], 0.016, q ? 6 : 4));
  if (q) M.add('black', rod([-w / 2, h + 0.02, -0.01], [w / 2, h + 0.02, -0.01], 0.006, 3));
  return M;
}

// a street food cart (lkCart.js): p.type 'halal' (the stainless pushcart, default) or 'snack' (the wrapped snack cart of the
// St Nicholas corner); its umbrella (p.cols, null for none) on a pole through a holder, its cooler at the tongue end
export function foodCart(q, p = {}) {
  const snack = p.type === 'snack', M = snack ? snackCart(q, p) : halalCart(q, p);
  if (p.cols !== null) M.put(umbrella(q, { r: p.r || 1.15, h: p.uh || 2.3, cols: p.cols || [FAB.ringBlue], base: false }), snack ? 0.12 : 0.74, 0, snack ? -0.05 : -0.34);
  if (p.cooler !== false) M.put(cooler(q, snack ? { body: 'plasWhite', lid: 'plasWhite', w: 0.55, d: 0.36, h: 0.36 } : {}), snack ? 0.95 : -1.32, 0, snack ? 0.1 : 0.62, snack ? 0.3 : 0);
  return M;
}
export { cooler } from './lkCart.js';

// plywood sheets and boards leaning on a wall (+z the wall side): n sheets, each tilted back a little
export function boards(q, p = {}) {
  const M = new Model(), R = rng(p.seed || 83), n = p.n || 3;
  for (let i = 0; i < n; i++) {
    const w = 0.25 + R() * 0.35, hh = 1.2 + R() * 0.7, t = 0.1 + R() * 0.08;
    const g = box(w, hh, 0.018, 0, hh / 2, 0); g.rotateX(-t); g.translate((i - (n - 1) / 2) * 0.12 + (R() - 0.5) * 0.08, 0, 0.12 + i * 0.03 + hh * Math.sin(t) * 0.5);
    M.add(i % 2 ? 'woodDark' : 'wood', g);
  }
  return M;
}

// a pop-up canopy tent (w x d, legs at the corners and every 3 m), peaked cloth modules, a valance all round
export function tent(q, p = {}) {
  const M = new Model(), W = p.w || 3.0, D = p.d || 3.0, H = p.h || 2.1, col = p.col ?? FAB.navy, val = p.val ?? col, frame = p.frame || 'alu';
  const nb = Math.max(1, Math.round(W / 3)), bw = W / nb;
  for (let i = 0; i <= nb; i++) for (const z of [D / 2, -D / 2]) {
    const x = -W / 2 + i * bw;
    M.add(frame, box(0.035, H, 0.035, x, H / 2, z));
    if (q) { M.add(frame, rod([x, H - 0.05, z], [x + (i < nb ? 0.5 : -0.5), H - 0.45, z], 0.01, 4)); M.add('tarp', fcell(box(0.22, 0.1, 0.3, x, 0.05, z), FAB.charcoal)); }
  }
  const eave = H + 0.05, peak = H + 0.75, sub = q ? 3 : 1;
  // p.flat: one long tarp roof falling from the back (+0.35 m) to the front, sagging between the frame bays, instead of the peaked modules
  if (p.flat) {
    const nu = q ? Math.max(6, Math.round(W * 3)) : 1, nv = q ? 4 : 1, pos = [], uv = [];
    const V = (iu, iv) => { const u = iu / nu, v = iv / nv, x = -W / 2 - 0.05 + u * (W + 0.1), z = D / 2 + 0.05 - v * (D + 0.1);
      const sag = q ? 0.07 * Math.abs(Math.sin(PI * u * nb)) * Math.sin(PI * v) : 0; return [x, eave + 0.35 * v - sag, z, x, z]; };
    for (let iu = 0; iu < nu; iu++) for (let iv = 0; iv < nv; iv++) { const A = V(iu, iv), B = V(iu + 1, iv), C = V(iu + 1, iv + 1), Dd = V(iu, iv + 1); for (const v of [A, C, B, A, Dd, C]) { pos.push(v[0], v[1], v[2]); uv.push(v[3], v[4]); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
    M.add('canopy', fcell(g, col));
  }
  for (let i = 0; i < (p.flat ? 0 : nb); i++) {
    const xa = -W / 2 + i * bw - 0.03, xb = xa + bw + 0.06, xc = (xa + xb) / 2;
    const Pk = [xc, peak, 0], C = [[xa, eave, D / 2 + 0.03], [xb, eave, D / 2 + 0.03], [xb, eave, -D / 2 - 0.03], [xa, eave, -D / 2 - 0.03]];
    const pos = [], uv = [];
    for (let f = 0; f < 4; f++) {
      const A = C[f], B = C[(f + 1) % 4];
      for (let k = 0; k < sub; k++) {
        const E = (t) => [A[0] + (B[0] - A[0]) * t, eave - (q ? 0.05 * Math.sin(PI * t) : 0), A[2] + (B[2] - A[2]) * t];
        const Mm = (t) => { const e = E(t); return [(e[0] + Pk[0]) / 2, (e[1] + Pk[1]) / 2 - (q ? 0.05 : 0), (e[2] + Pk[2]) / 2]; };
        const e0 = E(k / sub), e1 = E((k + 1) / sub), m0 = Mm(k / sub), m1 = Mm((k + 1) / sub);
        for (const v of [Pk, m1, m0, m0, m1, e1, m0, e1, e0]) { pos.push(...v); uv.push(v[0] + v[2], v[1]); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    M.add('canopy', fcell(g, col));
  }
  // valance: a 0.25 m flap on all four sides
  for (const [w, x, z, ry] of [[W + 0.06, 0, D / 2 + 0.03, 0], [W + 0.06, 0, -D / 2 - 0.03, PI], [D + 0.06, W / 2 + 0.03, 0, PI / 2], [D + 0.06, -W / 2 - 0.03, 0, -PI / 2]]) {
    const g = new THREE.PlaneGeometry(w, 0.25); g.rotateY(ry); g.translate(x, eave - 0.125, z); M.add('canopy', fcell(strip(g), val));
  }
  return M;
}

// a wooden pallet (1.2 x 1.0 x 0.14 m: top boards, three stringers, bottom boards) with flattened cartons on it and one
// leaning against it
export function pallet(q, p = {}) {
  const M = new Model(), R = rng(p.seed || 61), W = 1.2, D = 1.0;
  for (let i = 0; i < (q ? 7 : 1); i++) M.add('wood', q ? box(0.1, 0.02, D, -W / 2 + 0.05 + i * (W - 0.1) / 6, 0.13, 0) : box(W, 0.02, D, 0, 0.13, 0));
  for (const x of [-W / 2 + 0.05, 0, W / 2 - 0.05]) M.add('woodDark', box(0.09, 0.1, D, x, 0.07, 0));
  if (q) for (const z of [-D / 2 + 0.05, 0, D / 2 - 0.05]) M.add('wood', box(W, 0.02, 0.1, 0, 0.01, z));
  const n = p.n ?? 4;
  for (let k = 0; k < n; k++) {
    const g = box(0.75 + R() * 0.3, 0.012, 0.55 + R() * 0.25, (R() - 0.5) * 0.2, 0.15 + k * 0.014, (R() - 0.5) * 0.2);
    g.rotateY((R() - 0.5) * 0.6); M.add('cardboard', gcell(g, GOODS.cardboard));
  }
  // one flattened carton slid off the heap, its far edge still on the pallet
  if (p.lean !== false) { const g = box(0.9, 0.012, 0.7, 0, 0, 0.35); g.rotateX(0.2); g.translate(0.1, 0.15, D / 2 - 0.25); M.add('cardboard', gcell(g, GOODS.cardboard)); }
  return M;
}
