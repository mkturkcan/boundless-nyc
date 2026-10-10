// AR34 LIFE two-wheelers (part lk, docs/notes/ar34-life.md), built in code to real sizes and
// (120 W 125th, Wing Stop, the Posh rack): bicycles (a diamond frame on 28 in laced wheels), the orange share e-bikes (a
// step-through on six-spoke mag wheels, full fenders, a front basket, the yellow battery box over the rear wheel), the
// delivery e-bikes (fat tyres, a down-tube battery, a hub motor, a rack with an insulated bag box) and the delivery riders'
// scooters (12 in five-spoke wheels, a front disc, a telescopic fork, the front body and leg shield, floorboard, the rear
// body over a matt skirt with its stripes, the stepped seat, head, tail and turn lamps, mirrors, the plate on its hugger,
// the motor case and muffler, a grab rail and rack carrying the bag box).
// Model space as lkKit.js: y up from the ground, +z the nose, the rider's right at -x (the chain side).
// q = 1 near model, q = 0 far (tyre rings, the frame as thin rods, the body as plain profiles).
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { Model, rbox, box, cyl, rod, lathe, tube, loft, boxUV } from './lkGeo.js';
import { DECAL, DECAL_COLS, DECAL_ROWS, toCell } from './lkArt.js';

const PI = Math.PI;

// ---------------------------------------------------------------- helpers
// a lathed ring about the x axis (an axle) through (x, y, z): profile [[r, across], ...] counter-clockwise (outward normals)
function revX(profile, seg, y, z, x = 0, phi0 = 0, phiLen = 2 * PI) {
  const g = lathe(profile, seg, phi0, phiLen);
  g.rotateZ(-PI / 2);
  g.translate(x, y, z);
  return g;
}
// a tyre's section, bead to bead over the tread
function tyreProf(R, w, n, sq = 1) {
  const c = R - w / 2, out = [];
  for (let i = 0; i <= n; i++) { const t = -2.45 + (4.9 * i) / n; out.push([c + (w / 2) * Math.cos(t), (w / 2) * Math.sin(t) * sq]); }
  return out;
}
// a printed decal (lkArt.js DECAL atlas) on a plane facing +z
export function decal(w, h, cell) {
  const g = new THREE.PlaneGeometry(w, h).toNonIndexed();
  return toCell(g, cell, DECAL_COLS, DECAL_ROWS);
}
// scale x by f(z, y) (a body that narrows toward its tail), the normals kept roughly right
function warpX(g, f) {
  const P = g.getAttribute('position'), N = g.getAttribute('normal');
  for (let i = 0; i < P.count; i++) {
    const s = f(P.getZ(i), P.getY(i));
    P.setX(i, P.getX(i) * s);
    if (N) { const nx = N.getX(i) / s, ny = N.getY(i), nz = N.getZ(i), l = Math.hypot(nx, ny, nz) || 1; N.setXYZ(i, nx / l, ny / l, nz / l); }
  }
  P.needsUpdate = true;
  if (N) N.needsUpdate = true;
  return g;
}
// a side profile [[z, y], ...] (a smooth closed outline through the points) extruded across x, width w centred, the edges
// rounded by `bev`, smooth-shaded; f narrows it along its length
function side(pts, w, bev, q, f) {
  const sh = new THREE.Shape();
  sh.moveTo(pts[0][0], pts[0][1]);
  if (q) sh.splineThru(pts.slice(1).concat([pts[0]]).map(([a, b]) => new THREE.Vector2(a, b)));
  else for (const [a, b] of pts.slice(1)) sh.lineTo(a, b);
  const b = q ? Math.min(bev, w / 2 - 0.002) : 0;
  // bevelOffset -size: the walls stand on the outline itself (the caps are inset), so the profile keeps its measured size
  let g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(1e-3, w - 2 * b), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b * 0.85, bevelOffset: -b * 0.85, bevelSegments: q ? 3 : 1, curveSegments: q ? 3 : 1 });
  g.translate(0, 0, -(w - 2 * b) / 2);
  g.rotateY(-PI / 2);
  if (q) {
    g.deleteAttribute('normal'); g.deleteAttribute('uv');
    g = mergeVertices(g, 1e-4);
    g.computeVertexNormals();
  }
  if (f) warpX(g, f);
  return boxUV(g);
}
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// ---------------------------------------------------------------- wheels (the axle along x at (0, y, z))
// a laced wheel: the tyre (a lathed section), a box-section rim, n spokes crossing from the hub's two flanges, the hub
export function spokedWheel(M, q, o) {
  const R = o.R || 0.35, w = o.w || 0.04, y = o.y ?? R, z = o.z || 0, n = o.n || 32;
  const tk = o.tyre || 'rubber', rk = o.rim || 'galvDull', sk = o.spoke || rk, hk = o.hub || rk;
  M.add(tk, revX(tyreProf(R, w, q ? 6 : 3), q ? 32 : 10, y, z));
  const Rr = R - w * 0.86, rd = o.rimDepth || 0.02;
  M.add(rk, revX([[Rr - rd, -0.008], [Rr, -0.011], [Rr, 0.011], [Rr - rd, 0.008], [Rr - rd, -0.008]], q ? 28 : 10, y, z));
  if (!q) return;
  const hr = o.motor ? 0.07 : 0.03, hw = o.hubW || 0.033;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * PI, sd = i % 2 ? 1 : -1, ah = a + ((i >> 1) % 2 ? 0.45 : -0.45);
    M.add(sk, rod([sd * 0.003, y + Math.sin(a) * (Rr - rd), z + Math.cos(a) * (Rr - rd)], [sd * hw, y + Math.sin(ah) * hr, z + Math.cos(ah) * hr], 0.0012, 3));
  }
  const hm = o.motor ? 0.075 : 0.017;
  M.add(hk, revX([[0.011, -hw - 0.02], [hm, -hw - 0.013], [hm, -hw - 0.005], [Math.max(hm, 0.034), -hw - 0.003], [Math.max(hm, 0.034), -hw + 0.003], [hm, -hw + 0.006],
    [hm, hw - 0.006], [Math.max(hm, 0.034), hw - 0.003], [Math.max(hm, 0.034), hw + 0.003], [hm, hw + 0.005], [hm, hw + 0.013], [0.011, hw + 0.02]], o.motor ? 18 : 10, y, z));
}
// a cast wheel: tyre, a wide rim, n tapered blades from the hub, the hub
export function magWheel(M, q, o) {
  const R = o.R || 0.31, w = o.w || 0.055, y = o.y ?? R, z = o.z || 0, n = o.n || 6;
  const tk = o.tyre || 'rubber', rk = o.rim || 'plasBlack', hk = o.hub || rk;
  M.add(tk, revX(tyreProf(R, w, q ? 7 : 3, o.sq || 1), q ? 32 : 10, y, z));
  const Rr = R - w * 0.86, rw = w * 0.42, rd = o.rimDepth || 0.03;
  M.add(rk, revX([[Rr - rd, -rw * 0.8], [Rr, -rw], [Rr, rw], [Rr - rd, rw * 0.8], [Rr - rd, -rw * 0.8]], q ? 28 : 10, y, z));
  if (!q) return;
  const hub = o.hubR || 0.05, L = Rr - rd - hub + 0.012, b0 = o.bw0 || 0.03, b1 = o.bw1 || 0.022, th = o.bt || 0.016;
  for (let i = 0; i < n; i++) {
    const sh = new THREE.Shape([new THREE.Vector2(-b0 / 2, 0), new THREE.Vector2(b0 / 2, 0), new THREE.Vector2(b1 / 2, L), new THREE.Vector2(-b1 / 2, L)]);
    const g = new THREE.ExtrudeGeometry(sh, { depth: th - 0.004, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1, curveSegments: 1 });
    g.translate(0, hub - 0.006, -(th - 0.004) / 2);
    g.rotateY(PI / 2);
    g.rotateX((i / n) * 2 * PI + (o.a0 || 0.3));
    g.translate(0, y, z);
    M.add(rk, g);
  }
  M.add(hk, revX([[0.018, -0.05], [hub, -0.036], [hub + 0.004, -0.012], [hub + 0.004, 0.012], [hub, 0.036], [0.018, 0.05]], 16, y, z));
}

// ---------------------------------------------------------------- bicycles and e-bikes
// a saddle (nose at +z) centred at (x, y, z)
function saddle(M, q, y, z, k = 'plasBlack', wide = 1) {
  if (!q) { M.add(k, rbox(0.15 * wide, 0.05, 0.27, 0, 0, y, z)); return; }
  const g = loft([
    { x: 0, w: 0.015, t: 0.008, b: 0.008, cy: 0.012 }, { x: 0.03, w: 0.026 * wide, t: 0.02, b: 0.014, cy: 0.016 },
    { x: 0.12, w: 0.034 * wide, t: 0.024, b: 0.016, cy: 0.012 }, { x: 0.2, w: 0.07 * wide, t: 0.028, b: 0.018, cy: 0.008 },
    { x: 0.255, w: 0.08 * wide, t: 0.026, b: 0.02, cy: 0.008 }, { x: 0.275, w: 0.05 * wide, t: 0.014, b: 0.012, cy: 0.008 },
  ], 12);
  g.rotateY(PI / 2);
  g.translate(0, y, z + 0.14);
  M.add(k, g);
}
// the bicycle family: p.style 'diamond' (a plain bicycle), 'share' (the orange share e-bike), 'delivery' (a delivery
// e-bike); p.col the frame's key, p.basket a box on the rear rack (its key), p.front a front basket (its key), p.lean the
// lean on the kickstand (rad, toward +x)
export function bicycle(q, p = {}) {
  const M = new Model(), st = p.style || 'diamond', fr = p.col || 'black', dk = 'black';
  const share = st === 'share', dlv = st === 'delivery';
  const R = p.r ? p.r + (share ? 0.0 : 0.02) : share ? 0.31 : dlv ? 0.345 : 0.35;
  const tw = share ? 0.055 : dlv ? 0.07 : 0.036, wb = p.wb || (share ? 1.1 : dlv ? 1.12 : 1.04);
  const zr = -wb / 2, zf = wb / 2, sg = q ? 8 : 4;
  // wheels
  if (share) for (const zz of [zf, zr]) magWheel(M, q, { R, w: tw, z: zz, n: 6, rim: dk, hub: dk, bw0: 0.028, bw1: 0.02, bt: 0.014, hubR: 0.045 });
  else for (const [zz, mot] of [[zf, 0], [zr, dlv]]) spokedWheel(M, q, { R, w: tw, z: zz, n: dlv ? 36 : 32, rim: dlv ? dk : 'galvDull', spoke: 'galvDull', hub: dk, motor: mot });
  // frame points
  const BB = [0, 0.29, zr + 0.45], HB = [0, share ? 0.6 : 0.64, zf - 0.155], HT = [0, share ? 0.86 : 0.8, zf - (share ? 0.245 : 0.21)];
  const ST = [0, BB[1] + (share ? 0.48 : 0.52), BB[2] - 0.16], RA = [0, R, zr], FA = [0, R, zf];
  const tr = share ? 0.026 : dlv ? 0.021 : 0.015;
  M.add(fr, rod(HB, HT, tr + 0.004, sg));                                      // head tube
  if (share) {
    // the step-through: one swept main tube from the head tube down under the knees to the bottom bracket
    M.add(fr, tube([HT.map((v, i) => (i === 1 ? v - 0.05 : v)), [0, 0.5, HB[2] - 0.12], [0, 0.31, BB[2] + 0.22], [0, 0.27, BB[2] + 0.05]], tr, q ? 16 : 5, sg));
    M.add(fr, rod(BB, ST, tr * 0.85, sg));
    M.add('plasBlack', rbox(0.11, 0.08, 0.26, q ? 0.02 : 0, 0, 0.36, BB[2] + 0.2, 1));   // the motor housing under the bend
  } else {
    M.add(fr, rod(BB, HB, tr * (dlv ? 1.25 : 1), sg), rod(BB, ST, tr * 0.9, sg));
    M.add(fr, rod([0, ST[1] - (dlv ? 0.14 : 0.03), ST[2] + (dlv ? 0.045 : 0.01)], [0, HT[1] - 0.025, HT[2] + 0.01], tr * 0.9, sg));   // top tube
  }
  for (const s of [-1, 1]) {
    M.add(fr, rod([s * 0.02, ST[1] - 0.04, ST[2] - 0.01], [s * 0.062, RA[1], RA[2]], 0.008, q ? 6 : 3));   // seat stays
    M.add(fr, rod([s * 0.03, BB[1], BB[2]], [s * 0.065, RA[1], RA[2]], 0.009, q ? 6 : 3));               // chain stays
    // fork blades, a little rake at the foot
    const cr = [s * 0.045, HB[1] - 0.03, HB[2] + 0.01];
    M.add(fr, tube([cr, [s * 0.052, (cr[1] + FA[1]) / 2, (cr[2] + FA[2]) / 2 - 0.01], [s * 0.052, FA[1], FA[2]]], share ? 0.014 : 0.011, q ? 6 : 2, q ? 6 : 3));
  }
  if (q) M.add(fr, rbox(0.12, 0.03, 0.05, 0, 0, HB[1] - 0.025, HB[2] + 0.005));   // fork crown
  // seat post and saddle
  const sd = [0, 0.956, -0.292], post = share ? 0.2 : 0.16, SP = [0, ST[1] + sd[1] * post, ST[2] + sd[2] * post];
  M.add('galvDull', rod(ST, SP, 0.0135, q ? 8 : 4));
  saddle(M, q, SP[1] + 0.035, SP[2] + 0.01, 'plasBlack', share || dlv ? 1.45 : 1);
  // stem and bars
  const SC = [0, HT[1] + (share ? 0.12 : 0.06), HT[2] - (share ? 0.03 : -0.05)];
  M.add(dk, rod(HT, SC, 0.014, q ? 8 : 4));
  const hb = share || dlv
    ? [[-0.3, 0, -0.12], [-0.21, 0.01, -0.05], [0, 0, 0.0], [0.21, 0.01, -0.05], [0.3, 0, -0.12]]
    : [[-0.3, 0, -0.01], [0, 0, 0.0], [0.3, 0, -0.01]];
  const bars = hb.map(([x, y, z]) => [x, SC[1] + y, SC[2] + z]);
  M.add(dk, tube(bars, 0.011, q ? 16 : 4, q ? 6 : 3));
  if (q) for (const s of [-1, 1]) {
    const e = bars[s < 0 ? 0 : bars.length - 1], i2 = bars[s < 0 ? 1 : bars.length - 2], t = 0.12 / Math.hypot(e[0] - i2[0], e[2] - i2[2]);
    M.add('rubber', rod(e, [e[0] + (i2[0] - e[0]) * t, e[1], e[2] + (i2[2] - e[2]) * t], 0.0165, 8));
    M.add(dk, rod([s * 0.16, SC[1] + 0.01, SC[2] + 0.01], [s * 0.27, SC[1] - 0.005, SC[2] + 0.05 - (share || dlv ? 0.08 : 0)], 0.005, 4));   // brake levers
  }
  // drive train on the right (-x): chainring, cranks and pedals, chain, the rear sprocket
  if (q) {
    M.add('galvDull', revX([[0.088, -0.0022], [0.1, -0.0022], [0.1, 0.0022], [0.088, 0.0022], [0.088, -0.0022]], 28, BB[1], BB[2], -0.055));
    M.add(dk, revX([[0.02, -0.003], [0.075, -0.003], [0.075, 0.003], [0.02, 0.003], [0.02, -0.003]], 5, BB[1], BB[2], -0.052));
    const ca = 0.6;
    for (const s of [-1, 1]) {
      const a = s < 0 ? ca : ca + PI, e = [s * 0.075, BB[1] - Math.cos(a) * 0.17, BB[2] + Math.sin(a) * 0.17];
      M.add(dk, rod([s * 0.06, BB[1], BB[2]], e, 0.011, 6));
      M.add(dk, rbox(0.09, 0.022, 0.065, 0, s * 0.125, e[1], e[2]));
    }
    M.add(dk, rod([-0.055, BB[1] + 0.1, BB[2]], [-0.058, RA[1] + 0.04, RA[2]], 0.004, 3), rod([-0.055, BB[1] - 0.1, BB[2]], [-0.058, RA[1] - 0.04, RA[2]], 0.004, 3));
    M.add('galvDull', revX([[0.028, -0.012], [0.042, -0.012], [0.042, 0.012], [0.028, 0.012], [0.028, -0.012]], 16, RA[1], RA[2], -0.045));
    // chain guard (share and delivery)
    if (share || dlv) M.add('plasBlack', rbox(0.006, 0.07, BB[2] - RA[2] + 0.12, 0, -0.075, BB[1] + 0.03, (BB[2] + RA[2]) / 2 - 0.02));
  }
  // kickstand on the left
  M.add(dk, rod([0.035, BB[1] - 0.01, BB[2] - 0.07], [0.15, 0.02, BB[2] - 0.3], 0.009, q ? 6 : 3));
  // fenders (share, delivery)
  if (share || dlv) {
    const fk = share ? 'plasBlack' : dk, Rf = R + 0.012;
    const prof = [[Rf, -0.034], [Rf + 0.012, -0.026], [Rf + 0.018, 0], [Rf + 0.012, 0.026], [Rf, 0.034], [Rf + 0.006, 0.022], [Rf + 0.009, 0], [Rf + 0.006, -0.022], [Rf, -0.034]];
    M.add(fk, revX(prof, q ? 18 : 6, R, zf, 0, 3 * PI / 2 - 0.55, 1.35));
    M.add(fk, revX(prof, q ? 20 : 6, R, zr, 0, PI - 0.25, PI / 2 + 0.95));
  }
  // rear rack (share, delivery, or a box)
  const rackY = R + (share ? 0.22 : 0.3);
  if (share || dlv || p.basket) {
    for (const s of [-1, 1]) {
      M.add(dk, rod([s * 0.075, rackY, zr + 0.18], [s * 0.075, rackY, zr - 0.2], 0.007, q ? 5 : 3), rod([s * 0.065, R, zr], [s * 0.075, rackY, zr - 0.12], 0.006, q ? 5 : 3));
      M.add(dk, rod([s * 0.075, rackY, zr + 0.18], [s * 0.025, ST[1] - 0.06, ST[2] - 0.03], 0.006, q ? 5 : 3));
    }
    if (q) for (const zz of [zr + 0.12, zr - 0.02, zr - 0.18]) M.add(dk, rod([-0.075, rackY, zz], [0.075, rackY, zz], 0.005, 3));
  }
  if (share) {
    // the share bike's yellow battery box over the rear wheel, its pale band
    M.add('plasYellow', rbox(0.11, 0.25, 0.37, q ? 0.03 : 0, 0, rackY + 0.13, zr - 0.01, 1));
    if (q) for (const s of [-1, 1]) { const d = decal(0.34, 0.22, DECAL.shareBox); d.rotateY(s * PI / 2); d.translate(s * 0.0565, rackY + 0.13, zr - 0.01); M.add('decal', d); }
    // front basket on the head tube: a black frame, mesh walls
    const bz = zf - 0.1, by = HT[1] - 0.02;
    basket(M, q, 0.38, 0.22, 0.3, by, bz, 'plasBlack');
    M.add(dk, rod([0, HT[1] - 0.06, HT[2] + 0.02], [0, by - 0.11, bz - 0.06], 0.008, 4));
    if (q) M.add('chrome', rbox(0.06, 0.04, 0.03, 0, 0, by - 0.05, bz + 0.17));
  } else if (p.front) {
    basket(M, q, 0.34, 0.2, 0.26, HT[1] - 0.05, zf - 0.05, p.front === 'plasBlack' ? 'black' : p.front);
  }
  if (dlv) {
    // the battery on the down tube, its lock and the display on the bars
    const dz = HB[2] - BB[2], dy = HB[1] - BB[1], L = Math.hypot(dz, dy), a = Math.atan2(dy, dz);
    const g = rbox(0.085, 0.085, 0.42, q ? 0.02 : 0, 0, 0, 0);
    g.rotateX(-a); g.translate(0, BB[1] + dy * 0.52 + Math.cos(a) * 0.065, BB[2] + dz * 0.52 - Math.sin(a) * 0.065);
    M.add('plasBlack', g);
    if (q) M.add('glossBlack', rbox(0.07, 0.045, 0.11, 0, 0.055, SC[1] + 0.01, SC[2] - 0.03), rbox(0.05, 0.012, 0.06, 0, -0.05, SC[1] + 0.035, SC[2] - 0.02));
    // the headlamp
    if (q) M.add('chrome', rbox(0.06, 0.045, 0.035, 0, 0, HT[1] - 0.06, HT[2] + 0.08));
    void L;
  }
  if (p.basket && !share) bagBox(M, q, 0.4, 0.36, 0.36, rackY + 0.01, zr - 0.04, p.basket);
  // a red tail lamp on the rack or the seat post
  if (q) M.add('glossRed', rbox(0.05, 0.03, 0.02, 0, 0, share || dlv || p.basket ? rackY - 0.03 : SP[1] - 0.12, share || dlv || p.basket ? zr - 0.205 : SP[2] - 0.035));
  // lean on the kickstand
  const lean = p.lean ?? 0.08;
  if (lean) for (const L of M.parts.values()) for (const g of L) g.rotateZ(-lean);
  return M;
}
// a wire basket (w x h x d) whose bottom sits at y - h / 2: a rim, posts, mesh walls (the cage carts' mesh)
function basket(M, q, w, h, d, y, z, k) {
  const y0 = y - h / 2, y1 = y + h / 2, key = 'mesh';
  for (const yy of [y0, y1]) {
    M.add(k, rod([-w / 2, yy, z - d / 2], [w / 2, yy, z - d / 2], 0.006, 4), rod([-w / 2, yy, z + d / 2], [w / 2, yy, z + d / 2], 0.006, 4));
    M.add(k, rod([-w / 2, yy, z - d / 2], [-w / 2, yy, z + d / 2], 0.006, 4), rod([w / 2, yy, z - d / 2], [w / 2, yy, z + d / 2], 0.006, 4));
  }
  if (!q) return;
  const pl = (W, H, x, yy, zz, ry, rx = 0) => { const g = new THREE.PlaneGeometry(W, H); const u = g.getAttribute('uv'); for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * W / 0.12, u.getY(i) * H / 0.12); if (rx) g.rotateX(rx); g.rotateY(ry); g.translate(x, yy, zz); return g.toNonIndexed(); };
  M.add(key, pl(w, h, 0, y, z + d / 2, 0), pl(w, h, 0, y, z - d / 2, 0), pl(d, h, w / 2, y, z, PI / 2), pl(d, h, -w / 2, y, z, PI / 2), pl(w, d, 0, y0 + 0.004, z, 0, -PI / 2));
}
// an insulated delivery bag box (soft black, piped edges, a printed mark) sitting at y on a rack, centred at z;
// k: its fabric key (plasBlack / black: the black nylon bag)
function bagBox(M, q, w, h, d, y, z, k) {
  const fab = k === 'plasBlack' || k === 'black' ? 'nylonBlack' : k;
  M.add(fab, rbox(w, h, d, q ? 0.035 : 0, 0, y + h / 2, z, 1));
  if (!q) return;
  M.add('plasBlack', rbox(w + 0.012, 0.022, d + 0.012, 0, 0, y + h - 0.035, z));             // the lid's piping
  M.add('black', rod([-0.08, y + h + 0.012, z], [0.08, y + h + 0.012, z], 0.008, 4));             // the strap handle
  if (fab === 'nylonBlack') {
    const b = decal(w * 0.78, h * 0.62, DECAL.bagLogo); b.rotateY(PI); b.translate(0, y + h * 0.5, z - d / 2 - 0.004); M.add('decal', b);
    for (const s of [-1, 1]) { const g = decal(d * 0.7, h * 0.5, DECAL.bagLogo); g.rotateY(s * PI / 2); g.translate(s * (w / 2 + 0.004), y + h * 0.5, z); M.add('decal', g); }
  }
}
// the survey's kind: an e-bike or a bicycle. p.bike: a plain bicycle; orange: the share e-bike; else a delivery e-bike
export function ebike(q, p = {}) {
  const style = p.style || (p.bike ? 'diamond' : p.col === 'glossOrange' ? 'share' : 'delivery');
  return bicycle(q, { ...p, style });
}

// ---------------------------------------------------------------- the scooter (a 125-150 cc delivery scooter / e-moped)
// p.col the body's key, p.box: true (the insulated bag box, default), 'case' (a hard top case), false (none)
export function moped(q, p = {}) {
  const M = new Model(), body = p.col || 'glossBlack', trim = 'plasBlack', R = 0.235, zr = -0.6, zf = 0.66;
  for (const zz of [zf, zr]) magWheel(M, q, { R, w: 0.11, z: zz, n: 5, rim: 'black', hub: 'black', bw0: 0.05, bw1: 0.032, bt: 0.03, hubR: 0.056, rimDepth: 0.024, sq: 0.95 });
  if (q) {
    // front disc and caliper (left)
    M.add('galvDull', revX([[0.088, -0.0025], [0.112, -0.0025], [0.112, 0.0025], [0.088, 0.0025], [0.088, -0.0025]], 28, R, zf, 0.06));
    M.add('black', rbox(0.035, 0.085, 0.06, 0.01, 0.075, R + 0.075, zf - 0.07, 1));
  }
  // telescopic fork: lower legs and chromed stanchions up into the front body
  for (const s of [-1, 1]) {
    M.add('black', rod([s * 0.075, R, zf], [s * 0.07, 0.52, zf - 0.145], 0.025, q ? 10 : 4));
    M.add('chrome', rod([s * 0.07, 0.52, zf - 0.145], [s * 0.066, 0.66, zf - 0.215], 0.018, q ? 10 : 4));
  }
  // the front fender
  const Rf = R + 0.02, fp = [[Rf, -0.066], [Rf + 0.024, -0.05], [Rf + 0.032, 0], [Rf + 0.024, 0.05], [Rf, 0.066], [Rf + 0.008, 0.05], [Rf + 0.014, 0], [Rf + 0.008, -0.05], [Rf, -0.066]];
  M.add(body, revX(fp, q ? 18 : 6, R, zf, 0, 3 * PI / 2 - 0.5, PI / 2 + 0.38));
  // the front body: the gloss front skin sweeping up from the floorboard toward the bars, the matt leg shield behind it
  // (the seam between them a panel line), both narrowing upward; the glove box in the shield
  const narrowUp = (z, y) => 1 - 0.34 * clamp01((y - 0.36) / 0.62);
  M.add(body, side([[0.36, 0.37], [0.44, 0.4], [0.49, 0.52], [0.53, 0.7], [0.555, 0.86], [0.555, 0.95], [0.51, 0.975], [0.46, 0.93], [0.44, 0.8], [0.41, 0.62], [0.36, 0.47]], 0.42, 0.04, q, narrowUp));
  M.add(trim, side([[0.31, 0.36], [0.37, 0.37], [0.37, 0.47], [0.415, 0.62], [0.445, 0.8], [0.465, 0.93], [0.43, 0.95], [0.41, 0.8], [0.38, 0.62], [0.335, 0.47]], 0.4, 0.012, q, narrowUp));
  if (q) M.add(trim, rbox(0.18, 0.1, 0.02, 0.006, 0, 0.8, 0.4, 1));
  // headset cowl round the bars, the headlamp in its nose, turn signals, the dash
  M.add(body, side([[0.38, 0.98], [0.6, 0.99], [0.645, 1.04], [0.59, 1.1], [0.45, 1.12], [0.36, 1.07]], 0.3, 0.035, q));
  M.add('chrome', rbox(0.2, 0.055, 0.03, q ? 0.018 : 0, 0, 1.045, 0.635, 1));
  if (q) {
    M.add('plasBlack', rbox(0.18, 0.012, 0.09, 0, 0, 1.118, 0.44));
    for (const s of [-1, 1]) M.add('glossOrange', rbox(0.05, 0.03, 0.045, 0, s * 0.13, 1.02, 0.61));
    // the green trim on the front skin, as on the real scooter
    for (const s of [-1, 1]) { const d = decal(0.13, 0.06, DECAL.stripeGreen); d.rotateY(s * PI / 2); d.translate(s * 0.212, 0.6, 0.44); M.add('decal', warpX(d, narrowUp)); }
  }
  // floorboard (a ribbed rubber mat) and the frame tunnel under it
  M.add('rubber', rbox(0.3, 0.03, 0.42, q ? 0.01 : 0, 0, 0.375, 0.1));
  M.add(trim, rbox(0.32, 0.12, 0.5, q ? 0.03 : 0, 0, 0.3, 0.08));
  if (q) for (let i = 0; i < 6; i++) M.add('rubber', rbox(0.27, 0.008, 0.012, 0, 0, 0.392, -0.08 + i * 0.06));
  // the rear body over a matt skirt (the seam between them a panel line), narrowing to the tail
  const taper = (z) => 1 - 0.42 * clamp01((-0.2 - z) / 0.8);
  M.add(body, side([[-0.06, 0.37], [-0.06, 0.6], [-0.13, 0.7], [-0.42, 0.73], [-0.7, 0.75], [-0.9, 0.78], [-0.99, 0.76], [-1.0, 0.7], [-0.9, 0.63], [-0.7, 0.57], [-0.45, 0.49], [-0.25, 0.41]], 0.32, 0.04, q, taper));
  M.add(trim, side([[-0.04, 0.26], [-0.05, 0.42], [-0.25, 0.445], [-0.46, 0.525], [-0.64, 0.565], [-0.66, 0.5], [-0.46, 0.44], [-0.25, 0.3]], 0.335, 0.025, q, taper));
  if (q) for (const s of [-1, 1]) {
    // the stripes on the side panels
    const d = decal(0.56, 0.1, DECAL.stripeGreen); d.rotateY(s * PI / 2); d.translate(s * 0.163, 0.64, -0.5);
    M.add('decal', warpX(d, taper));
  }
  // the stepped seat
  M.add('plasBlack', side([[-0.08, 0.7], [-0.13, 0.79], [-0.24, 0.81], [-0.44, 0.815], [-0.52, 0.85], [-0.8, 0.865], [-0.87, 0.84], [-0.86, 0.77], [-0.6, 0.735], [-0.3, 0.71]], 0.3, 0.045, q, (z) => 1 - 0.2 * clamp01((-0.3 - z) / 0.6)));
  // tail lamp, rear turn signals, the hugger fender, plate on its hanger
  M.add('glossRed', rbox(0.17, 0.055, 0.05, q ? 0.018 : 0, 0, 0.725, -0.99, 1));
  if (q) {
    for (const s of [-1, 1]) { M.add('black', rod([s * 0.06, 0.64, -0.93], [s * 0.12, 0.64, -0.96], 0.006, 4)); M.add('glossOrange', rbox(0.045, 0.03, 0.04, 0, s * 0.13, 0.64, -0.965)); }
    M.add(trim, revX(fp.map(([r, a]) => [r - 0.008, a * 0.85]), 16, R, zr, 0, PI - 0.15, PI / 2 + 0.25));
    const h = rbox(0.13, 0.2, 0.012, 0, 0, 0, 0); h.rotateX(0.35); h.translate(0, 0.54, -0.99); M.add('black', h);
    const pl = decal(0.18, 0.1, DECAL.plate); pl.rotateX(-0.15); pl.rotateY(PI); pl.translate(0, 0.45, -1.035); M.add('decal', pl);
    M.add('black', rbox(0.19, 0.11, 0.008, 0, 0, 0.45, -1.029));
  }
  // motor case and swing arm (left), the rear shock; the muffler (right)
  const mc = side([[-0.1, 0.26], [-0.17, 0.4], [-0.52, 0.36], [-0.64, 0.3], [-0.66, 0.2], [-0.56, 0.15], [-0.2, 0.18]], 0.085, 0.02, q);
  mc.translate(0.115, 0, 0);
  M.add('black', mc);
  if (q) {
    M.add('black', rod([0.11, 0.34, -0.62], [0.115, 0.64, -0.54], 0.02, 8));
    M.add('glossRed', tube(Array.from({ length: 41 }, (_, i) => { const t = i / 40, a = t * 8 * 2 * PI; return [0.115 + Math.cos(a) * 0.026, 0.4 + t * 0.19 + Math.sin(a) * 0.004, -0.605 + t * 0.05 + Math.sin(a) * 0.026]; }), 0.0045, 80, 4));
  }
  M.add('black', rod([-0.13, 0.3, -0.42], [-0.15, 0.39, -0.86], 0.052, q ? 12 : 5));
  if (q) {
    M.add('black', tube([[-0.04, 0.2, -0.05], [-0.1, 0.17, -0.2], [-0.13, 0.26, -0.4]], 0.018, 10, 6));
    M.add('galvDull', rod([-0.15, 0.39, -0.86], [-0.152, 0.394, -0.9], 0.022, 8));
    M.add('plasBlack', rbox(0.02, 0.1, 0.3, 0, -0.185, 0.36, -0.62));   // heat shield
  }
  // side stand (left)
  M.add('black', rod([0.12, 0.23, -0.05], [0.24, 0.015, -0.12], 0.013, q ? 6 : 3));
  // handlebar, grips, levers, mirrors
  const by = 1.075, bz = 0.46;
  M.add('black', rod([-0.34, by, bz - 0.02], [0.34, by, bz - 0.02], 0.012, q ? 8 : 4));
  if (q) for (const s of [-1, 1]) {
    M.add('rubber', rod([s * 0.25, by, bz - 0.02], [s * 0.36, by, bz - 0.025], 0.018, 10));
    M.add('chrome', rod([s * 0.36, by, bz - 0.025], [s * 0.372, by, bz - 0.025], 0.016, 8));
    M.add('black', rod([s * 0.18, by + 0.025, bz + 0.03], [s * 0.33, by + 0.01, bz + 0.07], 0.006, 4));
    M.add('black', rbox(0.04, 0.03, 0.04, 0, s * 0.17, by + 0.04, bz));
    M.add('black', rod([s * 0.2, by + 0.04, bz], [s * 0.285, by + 0.235, bz + 0.01], 0.006, 4));
    M.add('black', rbox(0.13, 0.075, 0.035, 0.016, s * 0.3, by + 0.26, bz + 0.012, 1));
    M.add('galvDull', rbox(0.112, 0.058, 0.004, 0, s * 0.3, by + 0.26, bz - 0.007));
  }
  // grab rail round the seat's tail and the rack
  if (q) M.add('black', tube([[0.13, 0.82, -0.52], [0.14, 0.855, -0.78], [0.1, 0.875, -0.95], [-0.1, 0.875, -0.95], [-0.14, 0.855, -0.78], [-0.13, 0.82, -0.52]], 0.013, 24, 6));
  if (p.box !== false) {
    M.add('black', rbox(0.3, 0.015, 0.3, 0, 0, 0.885, -0.84));
    if (p.box === 'case') {
      M.add(p.boxKey || 'plasBlack', rbox(0.42, 0.3, 0.38, q ? 0.07 : 0, 0, 0.895 + 0.15, -0.84));
      if (q) { M.add('plasGrey', rbox(0.43, 0.02, 0.39, 0.008, 0, 0.895 + 0.2, -0.84)); M.add('glossRed', rbox(0.16, 0.035, 0.01, 0.005, 0, 0.895 + 0.13, -1.032)); }
    } else bagBox(M, q, 0.46, 0.42, 0.42, 0.895, -0.84, p.boxKey || 'plasBlack');
  }
  return M;
}

// ---------------------------------------------------------------- a motorcycle (a naked standard, 17 in wheels)
// p.col the tank and tail's key; parked on its side stand (a lean toward +x)
export function motorcycle(q, p = {}) {
  const M = new Model(), body = p.col || 'glossBlack', zr = -0.7, zf = 0.72, Rf = 0.3, Rr = 0.31;
  magWheel(M, q, { R: Rf, w: 0.12, z: zf, n: 6, rim: 'black', hub: 'black', bw0: 0.026, bw1: 0.016, bt: 0.022, hubR: 0.05, rimDepth: 0.02, sq: 0.9 });
  magWheel(M, q, { R: Rr, y: Rr, w: 0.16, z: zr, n: 6, rim: 'black', hub: 'black', bw0: 0.028, bw1: 0.018, bt: 0.03, hubR: 0.06, rimDepth: 0.022, sq: 0.85 });
  if (q) {
    for (const s of [-1, 1]) M.add('galvDull', revX([[0.115, -0.0025], [0.15, -0.0025], [0.15, 0.0025], [0.115, 0.0025], [0.115, -0.0025]], 28, Rf, zf, s * 0.07));
    M.add('galvDull', revX([[0.08, -0.0025], [0.11, -0.0025], [0.11, 0.0025], [0.08, 0.0025], [0.08, -0.0025]], 24, Rr, zr, -0.075));
    for (const s of [-1, 1]) M.add('black', rbox(0.035, 0.09, 0.07, 0.01, s * 0.085, Rf + 0.1, zf - 0.09, 1));
  }
  // the fork (gold-anodised legs, chromed stanchions), the triple clamp and the bars, mirrors
  for (const s of [-1, 1]) {
    M.add('plasYellow', rod([s * 0.09, Rf, zf], [s * 0.085, 0.62, zf - 0.15], 0.03, q ? 10 : 4));
    M.add('chrome', rod([s * 0.085, 0.62, zf - 0.15], [s * 0.08, 0.98, zf - 0.32], 0.022, q ? 10 : 4));
  }
  M.add('black', rbox(0.24, 0.05, 0.1, q ? 0.01 : 0, 0, 0.985, zf - 0.33, 1));
  const by = 1.06, bz = zf - 0.4;
  M.add('black', tube([[-0.38, by + 0.02, bz - 0.05], [-0.15, by, bz + 0.02], [0.15, by, bz + 0.02], [0.38, by + 0.02, bz - 0.05]], 0.011, q ? 12 : 3, q ? 6 : 3));
  if (q) for (const s of [-1, 1]) {
    M.add('rubber', rod([s * 0.27, by + 0.012, bz - 0.01], [s * 0.38, by + 0.02, bz - 0.05], 0.017, 10));
    M.add('black', rod([s * 0.17, by + 0.02, bz + 0.04], [s * 0.33, by + 0.015, bz + 0.06], 0.006, 4));
    M.add('black', rod([s * 0.19, by + 0.03, bz + 0.01], [s * 0.27, by + 0.24, bz - 0.02], 0.006, 4));
    M.add('black', rbox(0.12, 0.07, 0.03, 0.014, s * 0.28, by + 0.265, bz - 0.02, 1));
    M.add('galvDull', rbox(0.104, 0.054, 0.004, 0, s * 0.28, by + 0.265, bz - 0.037));
  }
  // the round headlamp and the dial above it, front fender
  const hz = zf - 0.2, hy = 0.9;
  M.add('black', lathe([[0.001, -0.07], [0.06, -0.06], [0.085, -0.02], [0.09, 0.02], [0.001, 0.021]], q ? 16 : 6).rotateX(PI / 2).translate(0, hy, hz));
  M.add('chrome', lathe([[0.001, 0.022], [0.082, 0.02], [0.078, 0.03], [0.001, 0.04]], q ? 16 : 6).rotateX(PI / 2).translate(0, hy, hz));
  if (q) {
    M.add('black', cyl(0.05, 0.05, 0.04, 12, 0).rotateX(-1.1).translate(0, 1.02, zf - 0.36));
    for (const s of [-1, 1]) M.add('glossOrange', rbox(0.04, 0.03, 0.06, 0, s * 0.13, 0.9, hz - 0.03));
  }
  const fp = [[Rf + 0.02, -0.07], [Rf + 0.04, -0.05], [Rf + 0.045, 0], [Rf + 0.04, 0.05], [Rf + 0.02, 0.07], [Rf + 0.026, 0.05], [Rf + 0.03, 0], [Rf + 0.026, -0.05], [Rf + 0.02, -0.07]];
  M.add(body, revX(fp, q ? 16 : 6, Rf, zf, 0, 3 * PI / 2 - 0.4, 1.25));
  // the frame (black tubes from the steering head down past the engine to the swing-arm pivot), the swing arm
  const SH = [0, 0.92, zf - 0.36], PV = [0, 0.48, -0.16];
  for (const s of [-1, 1]) {
    M.add('black', tube([[s * 0.04, SH[1] - 0.02, SH[2] - 0.02], [s * 0.12, 0.82, 0.05], [s * 0.13, 0.62, -0.14], [s * 0.1, PV[1], PV[2]]], 0.02, q ? 12 : 3, q ? 6 : 3));
    M.add('black', rod([s * 0.1, PV[1], PV[2]], [s * 0.11, Rr, zr], 0.022, q ? 8 : 4));
  }
  M.add('black', rod([0, SH[1] - 0.04, SH[2]], [0, 0.32, 0.32], 0.02, q ? 8 : 4));
  // the engine: crankcase, the cylinder block leaning forward with its fins, side covers; the exhaust to a right-side silencer
  M.add('black', rbox(0.3, 0.26, 0.44, q ? 0.04 : 0, 0, 0.36, 0.0, 1));
  const cylb = rbox(0.24, 0.3, 0.2, q ? 0.02 : 0, 0, 0, 0, 1); cylb.rotateX(0.35); cylb.translate(0, 0.6, 0.16); M.add('galvDull', cylb);
  if (q) {
    for (let i = 0; i < 6; i++) { const f = box(0.27, 0.008, 0.23, 0, 0, 0); f.rotateX(0.35); f.translate(0, 0.5 + i * 0.04, 0.12 + i * 0.014); M.add('black', f); }
    for (const s of [-1, 1]) M.add('galvDull', revX([[0.001, -0.015], [0.1, -0.015], [0.11, 0.0], [0.1, 0.015], [0.001, 0.015]], 18, 0.36, -0.02, s * 0.155));
  }
  M.add('chrome', tube([[-0.05, 0.62, 0.3], [-0.1, 0.4, 0.36], [-0.12, 0.2, 0.16], [-0.14, 0.24, -0.25], [-0.17, 0.4, -0.45]], 0.024, q ? 20 : 4, q ? 8 : 3));
  M.add('galvDull', rod([-0.17, 0.4, -0.42], [-0.18, 0.5, -0.8], 0.055, q ? 14 : 5));
  if (q) M.add('black', rod([-0.18, 0.5, -0.8], [-0.181, 0.505, -0.83], 0.035, 10));
  // the tank, the seat, the tail with its lamp, signals and the plate on a hugger
  M.add(body, side([[0.38, 0.86], [0.3, 1.01], [0.08, 1.04], [-0.12, 0.97], [-0.16, 0.87], [0.1, 0.84]], 0.36, 0.09, q));
  if (q) M.add('galvDull', cyl(0.035, 0.035, 0.012, 12, 1.03).translate(0, 0, 0.12));
  M.add('plasBlack', side([[-0.1, 0.86], [-0.18, 0.9], [-0.46, 0.89], [-0.58, 0.93], [-0.74, 0.94], [-0.76, 0.9], [-0.5, 0.84], [-0.14, 0.82]], 0.28, 0.04, q, (z) => 1 - 0.25 * clamp01((-0.45 - z) / 0.3)));
  M.add(body, side([[-0.4, 0.84], [-0.62, 0.87], [-0.84, 0.92], [-0.88, 0.88], [-0.7, 0.76], [-0.45, 0.72]], 0.22, 0.03, q));
  if (q) {
    for (const s of [-1, 1]) M.add(body, rbox(0.012, 0.16, 0.36, 0, s * 0.13, 0.72, -0.3));
  }
  M.add('glossRed', rbox(0.12, 0.04, 0.03, 0, 0, 0.885, -0.88));
  if (q) {
    for (const s of [-1, 1]) { M.add('black', rod([s * 0.04, 0.78, -0.82], [s * 0.13, 0.78, -0.86], 0.006, 4)); M.add('glossOrange', rbox(0.04, 0.03, 0.045, 0, s * 0.14, 0.78, -0.865)); }
    const h = rbox(0.12, 0.22, 0.01, 0, 0, 0, 0); h.rotateX(0.5); h.translate(0, 0.68, -0.9); M.add('black', h);
    const pl = decal(0.18, 0.1, DECAL.plate); pl.rotateX(-0.3); pl.rotateY(PI); pl.translate(0, 0.6, -0.96); M.add('decal', pl);
    M.add('black', rbox(0.19, 0.11, 0.008, 0, 0, 0.6, -0.953));
    // the chain on the left, the side stand
    M.add('black', rod([0.09, 0.33, 0.05], [0.1, Rr + 0.08, zr], 0.006, 3), rod([0.09, 0.27, 0.05], [0.1, Rr - 0.08, zr], 0.006, 3));
  }
  M.add('black', rod([0.12, 0.3, -0.1], [0.3, 0.015, -0.18], 0.013, q ? 6 : 3));
  const lean = p.lean ?? 0.12;
  if (lean) for (const L of M.parts.values()) for (const g of L) g.rotateZ(-lean);
  return M;
}
