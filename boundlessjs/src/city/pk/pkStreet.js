// AR33 PROPS street-level models (part pk, docs/notes/ar33-props.md), modelled in code to the measured sizes of the pieces
// on 125th Street: hydrants, CityRacks, regulation sign poles, the MTA bus-stop pole, bus shelters, subway stair heads,
// sidewalk sheds, newspaper boxes, mail boxes, fire-alarm boxes, bollards, benches, litter cans, planters.
// Conventions as pkKit.js: local +z = the side facing the roadway, x along the kerb, y up, origin at the base on the
// pavement; q = 1 the near model, 0 the far one; parts keyed by pkMats.js material keys.
import * as THREE from 'three';
import { Model, lathe, cyl, rbox, box, tube, rod, extrude, disc, plane, sleeve } from './pkGeo.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const seg = (q, hi, lo) => (q ? hi : lo);

// ---------------------------------------------------------------- fire hydrant (a 2.5 in pair and a 4.5 in pumper)
export function hydrant(q = 1, p = {}) {
  const M = new Model(), s = seg(q, 20, 9);
  const body = p.body || 'hydrantY', bon = p.bonnet || body;
  // base flange, barrel, the break-away flange, the upper barrel, then the bonnet dome
  M.add(body, lathe([[0.001, 0.0], [0.135, 0.0], [0.135, 0.028], [0.118, 0.04], [0.098, 0.05], [0.096, 0.15], [0.118, 0.16], [0.118, 0.185], [0.096, 0.195],
    [0.092, 0.6], [0.108, 0.615]], s));
  M.add(bon, lathe([[0.108, 0.615], [0.128, 0.64], [0.13, 0.69], [0.112, 0.73], [0.078, 0.775], [0.04, 0.8], [0.001, 0.81]], s));
  // two 2.5 in hose nozzles (along x) and the 4.5 in pumper (toward the road)
  for (const sx of [-1, 1]) {
    M.add(body, cyl(0.056, 0.056, 0.13, seg(q, 14, 7), 0, false).rotateZ(-sx * Math.PI / 2).translate(sx * 0.085, 0.5, 0));
    M.add('hydrantCap', cyl(0.066, 0.066, 0.05, seg(q, 14, 7), 0, false).rotateZ(-sx * Math.PI / 2).translate(sx * 0.225, 0.5, 0));
    if (q) M.add('hydrantCap', cyl(0.025, 0.025, 0.02, 6, 0, false).rotateZ(-sx * Math.PI / 2).translate(sx * 0.265, 0.5, 0));
  }
  M.add(body, cyl(0.076, 0.076, 0.12, seg(q, 16, 8), 0, false).rotateX(Math.PI / 2).translate(0, 0.46, 0.085));
  M.add('hydrantCap', cyl(0.088, 0.088, 0.065, seg(q, 16, 8), 0, false).rotateX(Math.PI / 2).translate(0, 0.46, 0.2));
  if (q) {
    // the operating nut, the chain links, the bolts round the base flange
    M.add('hydrantCap', cyl(0.028, 0.028, 0.035, 5, 0.8, false));
    M.add('hydrantCap', cyl(0.045, 0.04, 0.02, 10, 0.795, false));
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      M.add('hydrantCap', cyl(0.012, 0.012, 0.014, 6, 0.028).translate(Math.sin(a) * 0.112, 0, Math.cos(a) * 0.112));
    }
    M.add('galvDark', rod([0.12, 0.56, 0.0], [0.23, 0.44, 0.012], 0.004, 3));
    M.add('galvDark', rod([-0.12, 0.56, 0.0], [-0.23, 0.44, 0.012], 0.004, 3));
  }
  return M;
}

// ---------------------------------------------------------------- CityRack: the inverted-U post-and-ring bike rack
export function rack(q = 1, p = {}) {
  const M = new Model();
  const W = 0.76, H = 0.88, r = 0.022, R = 0.17, n = Math.max(1, Math.min(6, p.n || 1));
  const rs = seg(q, 10, 5), k = seg(q, 7, 3);
  for (let i = 0; i < n; i++) {
    const x0 = (i - (n - 1) / 2) * (W + 0.12);
    for (const sx of [-1, 1]) {
      const xl = x0 + sx * W / 2;
      M.add('rackMetal', rod([xl, 0, 0], [xl, H - R, 0], r, rs));
      // the corner: a quarter circle from the leg's top to the bar
      const pts = [];
      for (let j = 0; j <= k; j++) { const a = (j / k) * Math.PI / 2; pts.push(V(xl - sx * (R - Math.cos(a) * R) * 1 - 0 * sx, H - R + Math.sin(a) * R, 0)); }
      // centre of the corner circle sits R inside the leg
      const c = [];
      for (let j = 0; j <= k; j++) { const a = (j / k) * Math.PI / 2; c.push(V(xl - sx * R + sx * Math.cos(a) * R, H - R + Math.sin(a) * R, 0)); }
      void pts;
      M.add('rackMetal', tube(c, r, seg(q, 10, 4), rs));
      if (q) {
        M.add('rackMetal', cyl(0.05, 0.05, 0.008, 12, 0).translate(xl, 0, 0));
        M.add('rackMetal', cyl(0.03, 0.027, 0.03, 10, 0.008).translate(xl, 0, 0));
      }
    }
    M.add('rackMetal', rod([x0 - W / 2 + R, H, 0], [x0 + W / 2 - R, H, 0], r, rs));
  }
  return M;
}

// ---------------------------------------------------------------- the 2 in galvanised sign pole with its regulation plates
// p.set picks the plates: [face index, y of the plate's centre, yaw offset]
const PLATES = [
  [[0, 2.75], [2, 2.2]],
  [[1, 2.78], [2, 2.25], [4, 1.85]],
  [[3, 2.72]],
  [[5, 2.78], [0, 2.3]],
];
export function signPole(q = 1, p = {}) {
  const M = new Model();
  const H = 3.25, s = seg(q, 10, 5);
  M.add('galv', cyl(0.0254, 0.0254, H, s, 0));
  M.add('galv', lathe([[0.001, H], [0.022, H], [0.028, H + 0.008], [0.001, H + 0.03]], seg(q, 10, 5)));
  if (q) M.add('galv', cyl(0.05, 0.05, 0.03, 10, 0.0).translate(0, 0, 0));   // the base collar
  if (q) {
    // the street's wear: stickers, flyers and tags at hand height, rust and grime at the foot
    M.add('face:poleTags' + ((p.set || 0) % 4), sleeve(0.0268, 0.0268, 0.95, 2.05, 10));
    M.add('face:poleGrime', sleeve(0.0268, 0.0268, 0.0, 0.38, 10));
  }
  const set = PLATES[(p.set || 0) % PLATES.length];
  set.forEach(([face, y], i) => {
    const w = 0.305, h = face === 6 || face === 5 ? 0.305 : 0.457;
    // plates face the roadway (+z) and its back (-z) is bare; clamps top and bottom
    const yaw = (i % 2 ? 0.05 : -0.04);
    const g = new THREE.Group();
    void g;
    const back = rbox(w, h, 0.004, 0.002, 0, y, 0.03);
    M.add('aluBack', back);
    // the U-channel the plate is bolted through, behind it on the pole side, and the plate's bare back (brushed, bolts,
    // grime, a sticker on some: QA Q20 / Q36)
    if (q) {
      M.add('galvDark', rbox(0.045, h - 0.04, 0.012, 0.003, 0, y, 0.022));
      const bk = plane(w - 0.004, h - 0.004);
      bk.rotateY(Math.PI); bk.translate(0, y, 0.03 - 0.0032);
      M.add('face:plateBack' + ((i + (p.set || 0)) % 4), bk);
    }
    const pl = plane(w - 0.004, h - 0.004);
    pl.rotateY(yaw); pl.translate(0, y, 0.03 + 0.0032);
    M.add('face:park' + face, pl);
    if (q) {
      M.add('galv', rod([0, y + h / 2 - 0.05, 0.0254], [0, y + h / 2 - 0.05, 0.03], 0.004, 4));
      M.add('galv', rod([0, y - h / 2 + 0.05, 0.0254], [0, y - h / 2 + 0.05, 0.03], 0.004, 4));
    }
  });
  return M;
}

// ---------------------------------------------------------------- the MTA bus-stop pole: a blue roundel over a route blade
export function busSign(q = 1, p = {}) {
  const M = new Model();
  const H = 3.35;
  M.add('galv', cyl(0.0254, 0.0254, H, seg(q, 10, 5), 0));
  M.add('galv', lathe([[0.001, H], [0.022, H], [0.028, H + 0.008], [0.001, H + 0.03]], 8));
  // the roundel: a 0.40 m disc, both faces
  const rc = 0.2, yc = 3.02;
  M.add('aluBack', cyl(rc, rc, 0.006, seg(q, 28, 12), -0.003).rotateX(Math.PI / 2).translate(0, yc, 0.03));
  for (const sgn of [1, -1]) {
    const g = disc(rc - 0.004, seg(q, 28, 12));
    if (sgn < 0) g.rotateY(Math.PI);
    g.translate(0, yc, 0.03 + sgn * 0.0035);
    // UV 0..1 across the disc for the art
    const uv = g.getAttribute('uv'), ps = g.getAttribute('position');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (ps.getX(i) * sgn) / (2 * (rc - 0.004)) + 0.5, (ps.getY(i) - yc) / (2 * (rc - 0.004)) + 0.5);
    M.add('face:busRound', g);
  }
  // the route blade (0.305 x 0.61 m), below it, rotated a little off the roadway axis as they are hung
  const bw = 0.305, bh = 0.61, yb = 2.52;
  M.add('aluBack', rbox(bw, bh, 0.004, 0.002, 0, yb, 0.03));
  for (const sgn of [1, -1]) {
    const g = plane(bw - 0.006, bh - 0.006);
    if (sgn < 0) g.rotateY(Math.PI);
    g.translate(0, yb, 0.03 + sgn * 0.0032);
    M.add('face:busBlade' + ((p.routes || 0) % 4), g);
  }
  // the small info plate: a white 0.25 x 0.2 schedule holder under the blade
  M.add('aluBack', rbox(0.25, 0.2, 0.01, 0.004, 0, 2.03, 0.03));
  for (const sgn of [1, -1]) {
    const g = plane(0.236, 0.186);
    if (sgn < 0) g.rotateY(Math.PI);
    g.translate(0, 2.03, 0.03 + sgn * 0.0055);
    M.add('face:busInfo', g);
  }
  if (q) for (const y of [yc + 0.14, yc - 0.14, yb + 0.24, yb - 0.24, 2.12, 1.94]) M.add('galv', rod([0, y, 0.0254], [0, y, 0.03], 0.004, 4));
  return M;
}

// ---------------------------------------------------------------- MTA bus shelter. Two makes stand on 125th: the slim
// flat-roofed shelter (glass back and one glass end, stainless posts) and the lit-panel shelter (a backlit advertising case
// at one end). p.len: 2.8..5 m, p.ad: -1 / +1 the end that carries the case, 0 none. Origin: the centre of the footprint.
export function shelter(q = 1, p = {}) {
  const M = new Model();
  const L = Math.max(2.6, Math.min(5.2, p.len || 4.2)), D = 1.32, H = 2.55;
  const ad = p.ad ?? 0, lit = p.kind !== 'slim';
  const zb = -D / 2 + 0.06, zf = D / 2 - 0.08;
  const s = seg(q, 12, 6);
  // posts: four (two at the back, two at the front), stainless square tube with bevelled corners
  const xs = [-L / 2 + 0.08, L / 2 - 0.08];
  for (const x of xs) {
    M.add('shelterFrame', rbox(0.075, H, 0.075, 0.012, x, H / 2, zb, seg(q, 2, 1)));
    M.add('shelterFrame', rbox(0.075, H, 0.075, 0.012, x, H / 2, zf, seg(q, 2, 1)));
  }
  if (p.adBack) {
    // the 125th Street shelter: a light glass roof in two panes on a low ridge along the shelter,
    // in a slim stainless frame with a front and a back beam
    const rz0 = -D / 2 - 0.05, rz1 = D / 2 + 0.22, rzm = (rz0 + rz1) / 2, yr = H + 0.05, yRidge = H + 0.2;
    M.add('shelterFrame', rbox(L + 0.2, 0.08, 0.06, 0.012, 0, H + 0.02, rz1 - 0.03), rbox(L + 0.2, 0.08, 0.06, 0.012, 0, H + 0.02, rz0 + 0.03));
    M.add('shelterFrame', rod([-L / 2 - 0.1, yRidge, rzm], [L / 2 + 0.1, yRidge, rzm], 0.025, 6));
    for (const x of [-L / 2 - 0.08, 0, L / 2 + 0.08]) M.add('shelterFrame', rod([x, yr, rz0], [x, yRidge, rzm], 0.018, 5), rod([x, yRidge, rzm], [x, yr, rz1], 0.018, 5));
    for (const [za, zb2] of [[rz0, rzm], [rzm, rz1]]) {
      const g = new THREE.BufferGeometry();
      const P = [-L / 2 - 0.1, yr, za, L / 2 + 0.1, yr, za, L / 2 + 0.1, yRidge, zb2, -L / 2 - 0.1, yr, za, L / 2 + 0.1, yRidge, zb2, -L / 2 - 0.1, yRidge, zb2];
      if (za !== rz0) for (let i = 0; i < P.length; i += 3) { if (Math.abs(P[i + 2] - za) < 1e-6) { P[i + 1] = yRidge; } else { P[i + 1] = yr; } }
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
      g.computeVertexNormals();
      M.add('roofGlass', g);
    }
  } else {
    // the roof: a slim slab on a rim with a gutter, overhanging the front
    M.add('shelterFrame', rbox(L + 0.22, 0.09, D + 0.3, 0.02, 0, H + 0.045, 0.06, seg(q, 2, 1)));
    M.add('shelterRoof', box(L + 0.06, 0.012, D + 0.16, 0, H + 0.096, 0.06));
    if (q) M.add('shelterFrame', rbox(L + 0.24, 0.03, 0.05, 0.01, 0, H + 0.02, D / 2 + 0.2));
  }
  // the roof's lights (lit at night)
  if (q) M.add('lum', box(L * 0.7, 0.012, 0.06, 0, H - 0.012, zf - 0.2));
  // glass: the back panel in three or four lites, the end lite on the side away from the case
  const nl = Math.max(2, Math.round(L / 1.15)), lw = (L - 0.16) / nl;
  for (let i = 0; i < nl; i++) {
    const x = -L / 2 + 0.08 + lw * (i + 0.5);
    M.add('glassSh', plane(lw - 0.03, H - 0.42).translate(x, 0.12 + (H - 0.42) / 2 + 0.09, zb));
    if (q) {
      M.add('shelterFrame', box(0.03, H - 0.3, 0.04, -L / 2 + 0.08 + lw * i, (H - 0.3) / 2 + 0.05, zb));
    }
  }
  M.add('shelterFrame', rbox(L - 0.16, 0.1, 0.05, 0.012, 0, 0.11, zb));          // the back's kick rail
  M.add('shelterFrame', rbox(L - 0.16, 0.06, 0.05, 0.012, 0, H - 0.3, zb));      // and its head
  const endX = ad > 0 ? -1 : 1;      // the glass end is opposite the case
  if (!p.adBack && (ad !== 0 || p.kind === 'slim')) {
    const x = endX * (L / 2 - 0.08);
    M.add('glassSh', plane(D - 0.2, H - 0.42).rotateY(Math.PI / 2).translate(x, 0.12 + (H - 0.42) / 2 + 0.09, 0));
    M.add('shelterFrame', rbox(0.05, 0.1, D - 0.1, 0.012, x, 0.11, 0));
    M.add('shelterFrame', rbox(0.05, 0.06, D - 0.1, 0.012, x, H - 0.3, 0));
  }
  // the advertising case: in the back wall at the `ad` end (the 125th Street shelters), or at the end, a 1.22 x 1.83 m
  // lit panel in a brushed frame, two faces
  if (ad !== 0 && p.adBack) {
    const x = ad * (L / 2 - 0.08 - 0.68);
    M.add('shelterFrame', rbox(1.36, 2.1, 0.16, 0.02, x, 1.13, zb, seg(q, 2, 1)));
    for (const sgn of [1, -1]) {
      const g = plane(1.2, 1.83);
      if (sgn < 0) g.rotateY(Math.PI);
      g.translate(x, 1.16, zb + sgn * 0.0815);
      M.add('screen:ad' + (p.adv || 0) + (sgn > 0 ? 'a' : 'b'), g);
    }
    // the route strip on the front post at the open end: the stop's name in the MTA's blue, read from the street
    const xr = -ad * (L / 2 - 0.08);
    const sk = 'face:busStrip|' + (p.stop || 'West 125 Street');
    M.add(sk, plane(0.16, 1.9).translate(xr, 1.2, zf + 0.0385));
    M.add(sk, plane(0.16, 1.9).rotateY(-ad * Math.PI / 2).translate(xr - ad * 0.0385, 1.2, zf));
  } else if (ad !== 0) {
    const x = ad * (L / 2 + 0.12);
    M.add('shelterFrame', rbox(0.18, 2.05, 1.32, 0.02, x, 1.12, 0.0, seg(q, 2, 1)));
    M.add('shelterFrame', rbox(0.2, 0.12, 1.34, 0.02, x, 0.1, 0.0));
    for (const sgn of [1, -1]) {
      // each face's normal points out of the case on its own side
      const g = plane(1.2, 1.83);
      g.rotateY(sgn * Math.PI / 2);
      g.translate(x + sgn * 0.0915, 1.12, 0);
      M.add('screen:ad' + (p.adv || 0) + (sgn > 0 ? 'a' : 'b'), g);
    }
  } else if (lit) {
    M.add('shelterFrame', rbox(0.06, H, 0.06, 0.012, 0, H / 2, zf));
  }
  // the bench along the back: a stainless frame with a perforated seat, and the armrest
  const bl = Math.min(2.2, L * 0.55), bx = -ad * L * 0.1;
  M.add('shelterFrame', rbox(bl, 0.03, 0.42, 0.01, bx, 0.47, zb + 0.3));
  M.add('shelterSeat', rbox(bl - 0.04, 0.02, 0.38, 0.008, bx, 0.492, zb + 0.3));
  for (const sx of [-1, 1]) M.add('shelterFrame', rbox(0.04, 0.46, 0.04, 0.01, bx + sx * (bl / 2 - 0.05), 0.23, zb + 0.3));
  if (q) {
    M.add('shelterFrame', rbox(0.04, 0.22, 0.04, 0.01, bx, 0.6, zb + 0.12));
    M.add('shelterFrame', rbox(bl - 0.2, 0.03, 0.03, 0.01, bx, 0.72, zb + 0.12));
  }
  // the schedule panel on the back glass, and the route-info sign on the post
  if (q) M.add('face:busInfo', plane(0.48, 0.66).translate(-ad * (L / 2 - 0.65), 1.35, zb + 0.004));
  return M;
}

// ---------------------------------------------------------------- subway stair head (a green steel rail round the
// stair, two globe lamps on the front posts, the station's name plate). p.len 3.6 along the stair, p.w 2.4 across, origin at
// the centre of the opening, the stair runs along z (the open end toward +z).
export function subway(q = 1, p = {}) {
  const M = new Model();
  const L = p.len || 3.6, W = p.w || 2.4, hr = 1.07, s = seg(q, 14, 6);
  // the opening: a dark slot with the treads' nosings showing on the floor plane
  M.add('face:stairs', plane(W - 0.3, L - 0.2).rotateX(-Math.PI / 2).translate(0, 0.012, 0));
  // the two side rails and the closed end rail: top rail, a mid rail, a kick rail, pickets
  const rail = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(x1 - x0, z1 - z0);
    const m = new Model();
    m.add('subGreen', rbox(0.05, 0.05, len, 0.012, 0, hr, len / 2));
    m.add('subGreen', rbox(0.03, 0.03, len, 0.008, 0, 0.6, len / 2));
    m.add('subGreen', rbox(0.04, 0.12, len, 0.01, 0, 0.09, len / 2));
    const n = Math.max(2, Math.round(len / seg(q, 0.12, 0.3)));
    for (let i = 0; i <= n; i++) m.add('subGreen', cyl(0.011, 0.011, hr - 0.14, seg(q, 6, 4), 0.14).translate(0, 0, (len * i) / n));
    const G = new THREE.Matrix4().makeRotationY(a).premultiply(new THREE.Matrix4().makeTranslation(x0, 0, z0));
    for (const [k, Lg] of m.parts) for (const g of Lg) M.add(k, g.clone().applyMatrix4(G));
  };
  rail(-W / 2, -L / 2, -W / 2, L / 2);
  rail(W / 2, -L / 2, W / 2, L / 2);
  rail(-W / 2, -L / 2, W / 2, -L / 2);
  // the newel posts, capped, and the globes on the two front ones
  const gh = 2.42;
  for (const [x, z, globe] of [[-W / 2, L / 2, 1], [W / 2, L / 2, 1], [-W / 2, -L / 2, 0], [W / 2, -L / 2, 0]]) {
    M.add('subGreen', rbox(0.11, hr + 0.06, 0.11, 0.02, x, (hr + 0.06) / 2, z, seg(q, 2, 1)));
    if (globe) {
      const col = p.globe === 'red' ? 'globeR' : 'globeG';
      M.add('subGreen', cyl(0.045, 0.055, gh - hr - 0.06, seg(q, 10, 6), hr + 0.06).translate(x, 0, z));
      M.add('subGreen', lathe([[0.001, gh], [0.06, gh], [0.05, gh + 0.06], [0.001, gh + 0.06]], 10).translate(x, 0, z));
      M.add(col, lathe([[0.001, gh + 0.06], [0.11, gh + 0.11], [0.15, gh + 0.24], [0.15, gh + 0.36], [0.1, gh + 0.46], [0.04, gh + 0.5], [0.001, gh + 0.51]], seg(q, 16, 8)).translate(x, 0, z));
      M.add('subGreen', lathe([[0.04, gh + 0.5], [0.05, gh + 0.54], [0.001, gh + 0.57]], 8).translate(x, 0, z));
    }
  }
  if (p.display) {
    const zd = -L / 2 + 0.02, yc = hr + 0.86;
    for (const sx of [-0.88, 0.88]) M.add('black', rbox(0.08, yc + 0.66, 0.08, 0.01, sx, (yc + 0.66) / 2, zd, seg(q, 2, 1)));
    M.add('black', rbox(2.02, 1.3, 0.13, 0.02, 0, yc, zd, seg(q, 2, 1)));
    for (const sgn of [1, -1]) {
      const g = plane(1.9, 1.16);
      if (sgn < 0) g.rotateY(Math.PI);
      g.translate(0, yc, zd + sgn * 0.0665);
      M.add('screen:ad' + ((p.adv || 3) % 6) + (sgn > 0 ? 'a' : 'b'), g);
    }
  }
  // the name plate on a post at the open end: a 0.9 x 0.3 m blade
  M.add('subGreen', rbox(0.06, 2.6, 0.06, 0.012, W / 2 + 0.3, 1.3, L / 2 - 0.1));
  M.add('alu', rbox(0.9, 0.3, 0.01, 0.004, W / 2 + 0.3, 2.35, L / 2 - 0.1));
  M.add('face:subPlate' + (p.lines || '23'), plane(0.88, 0.28).translate(W / 2 + 0.3, 2.35, L / 2 - 0.1 + 0.0055));
  M.add('face:subPlate' + (p.lines || '23'), plane(0.88, 0.28).rotateY(Math.PI).translate(W / 2 + 0.3, 2.35, L / 2 - 0.1 - 0.0055));
  return M;
}

// ---------------------------------------------------------------- street elevator kiosk (AR34 STATIONS): the glass head
// house the MTA lists as an elevator entrance (data.ny.gov i9wp-a4ja) where the compiled furniture had drawn a stair head:
// a dark steel frame on a granite curb, glass walls, a flat roof with a shallow overhang, stainless doors on the open end
// (+z, as the stair head's), the station plate over them and a globe at the door. W 2.3 across, L 2.6 along, 3.0 high.
export function subElev(q = 1, p = {}) {
  const M = new Model();
  const W = 2.3, L = 2.6, H = 4.4, s = seg(q, 2, 1), fr = 'stainless';
  M.add('granite', rbox(W + 0.16, 0.12, L + 0.16, 0.01, 0, 0.06, 0, s));
  for (const [x, z] of [[-W / 2, -L / 2], [W / 2, -L / 2], [-W / 2, L / 2], [W / 2, L / 2], [0, -L / 2], [-W / 2, 0], [W / 2, 0]]) M.add(fr, rbox(0.12, H - 0.12, 0.12, 0.01, x, 0.12 + (H - 0.12) / 2, z, s));
  for (const y of [0.17, 1.6, 3.0, H - 0.06]) {
    M.add(fr, rbox(W, 0.09, 0.09, 0.008, 0, y, -L / 2, s)); M.add(fr, rbox(0.09, 0.09, L, 0.008, -W / 2, y, 0, s)); M.add(fr, rbox(0.09, 0.09, L, 0.008, W / 2, y, 0, s));
  }
  // the stainless band at the top on every face, the door head on the front
  M.add(fr, rbox(W, 0.62, 0.06, 0.006, 0, H - 0.34, -L / 2, s)); M.add(fr, rbox(0.06, 0.62, L, 0.006, -W / 2, H - 0.34, 0, s)); M.add(fr, rbox(0.06, 0.62, L, 0.006, W / 2, H - 0.34, 0, s));
  M.add(fr, rbox(W, 0.62 + (H - 2.5), 0.09, 0.008, 0, 2.5 + (H - 2.5) / 2, L / 2, s));
  // glass and the shaft's dark mesh behind it: the back and both sides, and the front either side of the doors
  M.add('glassSh', plane(W - 0.1, H - 0.8).translate(0, 0.17 + (H - 0.8) / 2, -L / 2));
  for (const sx of [-1, 1]) M.add('glassSh', plane(L - 0.1, H - 0.8).rotateY(Math.PI / 2).translate(sx * W / 2, 0.17 + (H - 0.8) / 2, 0));
  for (const sx of [-1, 1]) M.add('glassSh', plane(0.5, 2.3).translate(sx * 0.85, 0.17 + 1.15, L / 2));
  M.add('aluDark', rbox(W - 0.35, H - 0.6, 0.04, 0.004, 0, 0.12 + (H - 0.6) / 2, -L / 2 + 0.2, s));
  for (const sx of [-1, 1]) M.add('aluDark', rbox(0.04, H - 0.6, L - 0.5, 0.004, sx * (W / 2 - 0.2), 0.12 + (H - 0.6) / 2, -0.05, s));
  // the doors
  M.add('stainless', rbox(1.1, 2.15, 0.05, 0.005, 0, 0.12 + 1.075, L / 2 - 0.02, s));
  M.add('black', rbox(0.02, 2.1, 0.06, 0.002, 0, 0.12 + 1.05, L / 2 + 0.005, s));
  // the roof
  M.add(fr, rbox(W + 0.2, 0.14, L + 0.2, 0.02, 0, H + 0.07, 0, s));
  // the canopy over the doors: two brackets, five glass louvres sloping out
  for (const sx of [-0.75, 0.75]) M.add('black', rbox(0.06, 0.08, 1.1, 0.008, sx, 2.75, L / 2 + 0.55, s));
  for (let k = 0; k < 5; k++) M.add('glassSh', rbox(1.7, 0.02, 0.32, 0.004, 0, 2.86 - k * 0.05, L / 2 + 0.16 + k * 0.22, 1));
  // the plates: over the doors and on the side facing the street
  M.add('face:subPlate' + (p.lines || '23'), plane(0.88, 0.28).translate(0, 2.6, L / 2 + 0.05));
  M.add('face:subPlate' + (p.lines || '23'), plane(1.2, 0.38).rotateY(-Math.PI / 2).translate(-W / 2 - 0.07, 2.3, 0.3));
  return M;
}

// ---------------------------------------------------------------- sidewalk shed. len along x, dep across (the kerb row
// of posts at +dep/2), 3.4 m to the deck. The shed's plywood parapet faces the roadway. origin: centre of the footprint.
export function shed(q = 1, p = {}) {
  const M = new Model();
  const len = Math.max(3, p.len || 12), dep = Math.max(2, p.dep || 4.4), Hd = p.h || 3.45;
  const zk = dep / 2 - 0.12, zw = -dep / 2 + 0.1;
  const r = 0.024, s = seg(q, 8, 5);
  const bays = Math.max(1, Math.round(len / 2.45)), bl = len / bays;
  const x0 = -len / 2;
  // vertical posts on the kerb row at every bay line, with the base plates and the sleeve couplers
  for (let i = 0; i <= bays; i++) {
    const x = x0 + i * bl;
    M.add('scaffold', cyl(r, r, Hd + 0.55, s, 0).translate(x, 0, zk));
    M.add('scaffold', cyl(r, r, Hd - 0.1, s, 0).translate(x, 0, zw));
    if (q) {
      M.add('scaffold', cyl(0.09, 0.09, 0.012, 10, 0).translate(x, 0, zk));
      M.add('scaffold', cyl(0.035, 0.035, 0.07, 8, 0.9).translate(x, 0, zk));
      M.add('scaffold', cyl(0.035, 0.035, 0.07, 8, 2.0).translate(x, 0, zk));
    }
  }
  // the bays left open over a doorway or a vendor (p.open: [[u0, u1], ...] metres from the west end; LIFE lkC1820: the
  // CVS shed's bay over the vendor has no rail or brace below the first ledger)
  const open = (i) => (p.open || []).some(([a, b]) => { const c = (i + 0.5) * bl; return c >= a && c <= b; });
  // ledgers along the kerb row (guard rails at 0.55 / 1.1 m bay by bay, the 2.2 m ledger and the one under the deck), and
  // cross transoms to the wall only under the deck: nothing crosses the walk below it (NYC sheds keep 8 ft clear; QA Q42)
  for (const y of [2.2, Hd - 0.12]) M.add('scaffold', rod([x0, y, zk], [-x0, y, zk], r, s));
  for (let i = 0; i < bays; i++) {
    if (open(i)) continue;
    const xa = x0 + i * bl, xb = xa + bl;
    for (const y of [0.55, 1.1]) M.add('scaffold', rod([xa, y, zk], [xb, y, zk], r, s));
  }
  M.add('scaffold', rod([x0, 0.3, zw], [-x0, 0.3, zw], r, s));
  for (let i = 0; i <= bays; i++) {
    const x = x0 + i * bl;
    M.add('scaffold', rod([x, Hd - 0.12, zw], [x, Hd - 0.12, zk], r, s));
  }
  // diagonal bracing on every third bay; none in an open bay
  for (let i = 0; i < bays; i += (p.xb || 3)) {
    if (open(i)) continue;
    const xa = x0 + i * bl, xb = xa + bl;
    M.add('scaffold', rod([xa, 0.55, zk], [xb, Hd - 0.12, zk], r * 0.9, s));
    if (q && i + 1 < bays) M.add('scaffold', rod([xb, 0.55, zk], [xa, Hd - 0.12, zk], r * 0.9, s));
  }
  // the deck: two layers of plywood, sloped 2 deg toward the road, with the fascia board and the upstand
  const deck = box(len + 0.3, 0.06, dep + 0.5, 0, Hd + 0.03, 0.08);
  deck.rotateX(0.035).translate(0, 0, 0);
  M.add('shedDeck', deck);
  if (p.rail) {
    // an open guard rail on the deck instead of the boarded fascia: a slim edge board, painted posts at
    // every bay, a top and a mid rail
    M.add('shedFascia', rbox(len + 0.34, 0.3, 0.04, 0.008, 0, Hd + 0.15, zk + 0.36, 1));
    for (const xr of [-len / 2 - 0.15, len / 2 + 0.15]) M.add('shedFascia', rbox(0.04, 0.3, dep + 0.44, 0.008, xr, Hd + 0.15, 0.08, 1));
    const zr = zk + 0.3;
    for (let i = 0; i <= bays; i++) M.add('green', rbox(0.05, 1.05, 0.05, 0.008, x0 + i * bl, Hd + 0.55, zr, 1));
    for (const y of [Hd + 0.62, Hd + 1.06]) M.add('green', rbox(len + 0.1, 0.05, 0.05, 0.008, 0, y, zr, 1));
    if (q) for (let i = 0; i < bays; i++) for (let k = 1; k < 8; k++) M.add('green', rbox(0.016, 0.42, 0.016, 0.004, x0 + i * bl + (k * bl) / 8, Hd + 0.84, zr, 1));
  } else {
    M.add('shedFascia', rbox(len + 0.34, 0.92, 0.04, 0.008, 0, Hd + 0.46, zk + 0.36, 1));
    M.add('shedFascia', rbox(0.04, 0.92, dep + 0.44, 0.008, -len / 2 - 0.15, Hd + 0.46, 0.08, 1));
    M.add('shedFascia', rbox(0.04, 0.92, dep + 0.44, 0.008, len / 2 + 0.15, Hd + 0.46, 0.08, 1));
  }
  // a lower kick board along the kerb row (toe board, bay by bay, none in an open bay) and the work lamps under the deck
  for (let i = 0; i < bays; i++) if (!open(i)) M.add('shedFascia', box(bl, 0.18, 0.025, x0 + (i + 0.5) * bl, 0.09, zk + 0.045));
  const nl = Math.max(1, Math.floor(len / 4));
  for (let i = 0; i < nl; i++) {
    const x = x0 + (i + 0.5) * (len / nl);
    M.add('black', rbox(0.22, 0.06, 0.12, 0.01, x, Hd - 0.08, 0.1));
    M.add('lum', box(0.18, 0.012, 0.08, x, Hd - 0.116, 0.1));
  }
  return M;
}

// ---------------------------------------------------------------- newspaper boxes (a set of p.n coloured coin boxes)
const NB_COL = ['bluePaint', 'redPaint', 'orange', 'whitePlas', 'yellowSig', 'greyPaint'];
export function newsbox(q = 1, p = {}) {
  const M = new Model();
  const n = Math.max(1, Math.min(4, p.n || 1));
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * 0.46, col = NB_COL[((p.c || 0) + i * 2) % NB_COL.length];
    M.add(col, rbox(0.4, 0.96, 0.36, 0.025, x, 0.56, 0, seg(q, 2, 1)));
    M.add('galv', rbox(0.34, 0.06, 0.3, 0.01, x, 0.03, 0));      // the pedestal
    M.add('galv', rbox(0.04, 0.46, 0.04, 0.01, x - 0.12, 0.26, 0.0));
    M.add('galv', rbox(0.04, 0.46, 0.04, 0.01, x + 0.12, 0.26, 0.0));
    M.add('glassSh', plane(0.26, 0.34).translate(x, 0.84, 0.181));
    M.add('black', box(0.3, 0.05, 0.02, x, 0.58, 0.185));          // the coin slot panel
    if (q) M.add('black', rbox(0.3, 0.12, 0.05, 0.01, x, 0.66, 0.2));
  }
  return M;
}

// ---------------------------------------------------------------- USPS collection box
export function mailbox(q = 1) {
  const M = new Model();
  const W = 0.6, D = 0.52, H = 1.12;
  const top = H - W / 2;
  M.add('mailBlue', rbox(W, top - 0.36, D, 0.02, 0, 0.36 + (top - 0.36) / 2, 0, seg(q, 2, 1)));
  M.add('mailBlue', cyl(W / 2, W / 2, D, seg(q, 20, 10), -D / 2).rotateX(Math.PI / 2).translate(0, top, 0));
  M.add('mailBlue', rbox(W + 0.02, 0.08, D + 0.02, 0.02, 0, 0.36, 0));
  M.add('galv', rbox(0.16, 0.36, 0.14, 0.02, 0, 0.18, 0));      // the leg
  M.add('galv', rbox(0.46, 0.04, 0.4, 0.01, 0, 0.02, 0));
  M.add('silverPaint', rbox(0.34, 0.06, 0.05, 0.015, 0, H - 0.3, D / 2 + 0.01));   // the pull-down chute
  M.add('whitePlas', plane(0.3, 0.1).translate(0, H - 0.5, D / 2 + 0.003));
  return M;
}

// ---------------------------------------------------------------- FDNY street alarm box on a pole
export function callBox(q = 1) {
  // the FDNY alarm post: a red cabinet on a tapered pedestal over a plinth, a hooded top and the finial,
  // the street's tags on its face
  const M = new Model();
  M.add('redPaint', rbox(0.36, 0.1, 0.36, 0.015, 0, 0.05, 0, seg(q, 2, 1)));
  M.add('redPaint', lathe([[0.001, 0.1], [0.13, 0.1], [0.13, 0.16], [0.105, 0.22], [0.09, 0.95], [0.001, 0.95]], 4, Math.PI / 4));
  M.add('redPaint', rbox(0.4, 0.56, 0.3, 0.03, 0, 1.23, 0, seg(q, 2, 1)));
  M.add('redPaint', rbox(0.44, 0.05, 0.34, 0.015, 0, 1.535, 0));
  M.add('redPaint', lathe([[0.001, 1.56], [0.07, 1.56], [0.05, 1.6], [0.03, 1.64], [0.045, 1.69], [0.03, 1.73], [0.001, 1.74]], seg(q, 12, 6)));
  M.add('silverPaint', plane(0.24, 0.3).translate(0, 1.24, 0.152));
  M.add('whitePlas', plane(0.2, 0.05).translate(0, 1.44, 0.153));
  if (q) M.add('face:poleTags1', plane(0.38, 0.5).translate(0, 1.23, 0.1545), plane(0.38, 0.5).rotateY(Math.PI).translate(0, 1.2, -0.153));
  return M;
}

// ---------------------------------------------------------------- bollards and the DSNY litter cans
export function bollard(q = 1, p = {}) {
  const M = new Model();
  const c = p.concrete ? 'concrete' : 'black', r = p.concrete ? 0.15 : 0.085, H = p.h || 0.92;
  if (p.cap) {
    // the 125th Street kerb bollard: a black steel pipe with a bolted base ring and a cast cap, its
    // dome and rim worn to bare metal
    M.add(c, lathe([[0.001, 0], [r + 0.03, 0], [r + 0.03, 0.025], [r + 0.012, 0.04], [r, 0.06], [r, H - 0.09]], seg(q, 18, 8)));
    M.add('silverPaint', lathe([[r, H - 0.09], [r + 0.012, H - 0.085], [r + 0.012, H - 0.05], [r - 0.004, H - 0.04], [r - 0.02, H - 0.012], [r - 0.05, H + 0.004], [0.001, H + 0.012]], seg(q, 18, 8)));
    if (q) for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      M.add('galvDark', cyl(0.011, 0.011, 0.014, 6, 0.025).translate(Math.sin(a) * (r + 0.018), 0, Math.cos(a) * (r + 0.018)));
    }
    return M;
  }
  M.add(c, lathe([[0.001, 0], [r + 0.02, 0], [r + 0.02, 0.05], [r, 0.07], [r, H - 0.07], [r - 0.005, H - 0.02], [r - 0.04, H], [0.001, H + 0.012]], seg(q, 18, 8)));
  if (q) M.add('silverPaint', cyl(r + 0.004, r + 0.004, 0.06, 14, H - 0.26));
  return M;
}
export function bin(q = 1, p = {}) {
  // the DSNY can: a ribbed steel drum 0.54 m across, 0.92 m tall (vertical slats over a dark liner, two bands), a flat
  // lid with a dished opening and a swing flap; maroon (the BID's), blue for recycling, grey for the older ones
  const M = new Model();
  const key = p.recycle ? 'binBlue' : p.grey ? 'binGrey' : 'binRed';
  const lid = p.recycle ? 'binBlueLid' : 'binGreyLid';
  const R = 0.262, H = 0.86;
  if (q) {
    M.add('sigBlack', cyl(R - 0.02, R - 0.02, H - 0.1, 20, 0.06));
    const n = 30;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      M.add(key, box(0.052, H - 0.16, 0.014, 0, 0.08 + (H - 0.16) / 2, R).rotateY(a));
    }
  } else M.add(key, lathe([[0.001, 0.04], [R, 0.04], [R, H], [0.001, H]], 10));
  M.add(key, lathe([[R - 0.02, 0.0], [R + 0.012, 0.0], [R + 0.012, 0.09], [R - 0.02, 0.09]], seg(q, 22, 9)));
  M.add(key, lathe([[R - 0.02, H - 0.1], [R + 0.012, H - 0.1], [R + 0.012, H], [R - 0.02, H]], seg(q, 22, 9)));
  M.add(lid, lathe([[R + 0.02, H], [R + 0.03, H + 0.03], [R, H + 0.06], [R - 0.04, H + 0.055], [0.12, H + 0.04], [0.11, H + 0.02], [0.001, H + 0.02]], seg(q, 22, 9)));
  M.add('black', rbox(0.22, 0.12, 0.03, 0.01, 0, H + 0.03, R - 0.03));
  M.add('galv', rbox(0.42, 0.03, 0.42, 0.008, 0, 0.015, 0));
  return M;
}
export function recycle(q = 1) { return bin(q, { recycle: true }); }

// ---------------------------------------------------------------- bench (steel frame, timber slats), 1.8 m
export function bench(q = 1) {
  const M = new Model();
  const L = 1.8;
  for (const sx of [-1, 1]) {
    const x = sx * (L / 2 - 0.12);
    M.add('black', rbox(0.04, 0.45, 0.42, 0.01, x, 0.225, 0));
    M.add('black', rbox(0.04, 0.5, 0.05, 0.01, x, 0.66, -0.2));
  }
  for (let i = 0; i < 4; i++) M.add('wood', rbox(L, 0.035, 0.085, 0.008, 0, 0.44, -0.16 + i * 0.1));
  for (let i = 0; i < 3; i++) M.add('wood', rbox(L, 0.085, 0.03, 0.008, 0, 0.6 + i * 0.12, -0.22));
  return M;
}

// ---------------------------------------------------------------- a planter: a precast trough with soil and shrubs
export function planter(q = 1, p = {}) {
  const M = new Model();
  const L = p.len || 1.6, W = p.d || 0.7, H = 0.62;
  M.add('concrete', rbox(L, H, W, 0.02, 0, H / 2, 0, seg(q, 2, 1)));
  M.add('soil', box(L - 0.14, 0.02, W - 0.14, 0, H + 0.002, 0));
  if (q) for (let i = 0; i < 5; i++) {
    const x = (i - 2) * (L / 5.2), a = i * 2.4;
    M.add('plantLeaf', lathe([[0.001, H], [0.13, H + 0.08], [0.16, H + 0.22], [0.1, H + 0.36], [0.001, H + 0.42]], 8).translate(x + Math.sin(a) * 0.05, 0, Math.cos(a) * 0.08));
  }
  return M;
}

// ---------------------------------------------------------------- a street-side barrier (low steel fence section)
export function barrier(q = 1, p = {}) {
  const M = new Model();
  const L = p.len || 2.0;
  M.add('black', rbox(L, 0.04, 0.04, 0.01, 0, 0.98, 0));
  M.add('black', rbox(L, 0.04, 0.04, 0.01, 0, 0.12, 0));
  const n = Math.round(L / 0.12);
  for (let i = 0; i <= n; i++) M.add('black', cyl(0.009, 0.009, 0.86, 5, 0.12).translate(-L / 2 + (L * i) / n, 0, 0));
  for (const x of [-L / 2, L / 2]) M.add('black', rbox(0.06, 1.05, 0.06, 0.01, x, 0.525, 0));
  return M;
}

// ---------------------------------------------------------------- MTA Select Bus Service fare machines (a row of p.n; the
// M60 stops carry them beside the shelter): 0.50 x 0.40 x 1.42 m blue cabinets with a white face, a screen, a card reader and a
// receipt slot, standing on an angled stainless foot. Faces the roadway.
export function sbs(q = 1, p = {}) {
  const M = new Model();
  const n = Math.max(1, Math.min(4, p.n || 3));
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * 0.66;
    // the foot: a stainless plate and two raked legs
    M.add('shelterFrame', rbox(0.46, 0.03, 0.46, 0.008, x, 0.015, 0));
    for (const sx of [-1, 1]) M.add('shelterFrame', rbox(0.04, 0.3, 0.3, 0.01, x + sx * 0.17, 0.17, 0.0));
    // the cabinet: a blue body, the top sloped toward the roadway
    const top = extrude([[-0.2, 0], [0.2, 0], [0.2, 0.06], [-0.2, 0.0 + 0.16]], 0.5, 0.01);
    top.rotateY(Math.PI / 2); top.translate(x, 1.32, 0);
    M.add('sbsBlue', rbox(0.5, 1.0, 0.4, 0.03, x, 0.85, 0, seg(q, 3, 1)));
    M.add('sbsBlue', top);
    M.add('face:sbs', plane(0.44, 0.92).translate(x, 0.86, 0.2015));
    if (q) {
      M.add('black', rbox(0.3, 0.012, 0.04, 0.004, x, 0.52, 0.215));
      M.add('shelterFrame', rbox(0.46, 0.02, 0.012, 0.004, x, 1.36, 0.21));
    }
  }
  return M;
}

// ---------------------------------------------------------------- the MTA bus-stop sign of the 2010s (EAST b12_s, 77 E
// 125th, 2024-08): a dark green 3 in pole, the 0.5 m disc at the top, the route plate on one side of the pole and the
// destinations over the stop's name on the other, the Guide-A-Ride case lower down. Heights from the b12 pair at the
// 2.15 m lens (disc centre 3.33 m, plates 2.93 m, the case 0.6-1.12 m), about +-0.1 m. p: { routes: ['M101', 'M125'], dests: [...], stop: 'E 125 St & Park Av' }
export function busStop2(q = 1, p = {}) {
  const M = new Model();
  const H = 3.68, r = 0.038, s = seg(q, 12, 6);
  M.add('greenSub', cyl(r, r, H, s, 0));
  M.add('greenSub', lathe([[0.001, H], [r - 0.004, H], [r + 0.004, H + 0.01], [0.001, H + 0.035]], seg(q, 12, 6)));
  if (q) {
    M.add('greenSub', cyl(r + 0.022, r + 0.026, 0.05, s, 0));
    // the street's wear on the pole, as on the sign poles
    M.add('face:poleTags' + (((p.routes || []).length + 1) % 4), sleeve(r + 0.0015, r + 0.0015, 0.95, 2.0, 12));
    M.add('face:poleGrime', sleeve(r + 0.0015, r + 0.0015, 0.0, 0.42, 12));
  }
  const key = (p.routes || ['M101', 'M125']).join(',');
  const dkey = (p.dests || ['Ft George', 'Manhattanville']).join(',') + '|' + (p.stop || 'E 125 St & Park Av');
  // the disc (both faces), its aluminium blank and the two clamps
  const rc = 0.25, yc = 3.33, zf = r + 0.012;
  M.add('aluBack', cyl(rc, rc, 0.006, seg(q, 32, 14), -0.003).rotateX(Math.PI / 2).translate(0, yc, zf));
  for (const sgn of [1, -1]) {
    const g = disc(rc - 0.003, seg(q, 32, 14));
    if (sgn < 0) g.rotateY(Math.PI);
    g.translate(0, yc, zf + sgn * 0.0035);
    const uv = g.getAttribute('uv'), ps = g.getAttribute('position');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (ps.getX(i) * sgn) / (2 * (rc - 0.003)) + 0.5, (ps.getY(i) - yc) / (2 * (rc - 0.003)) + 0.5);
    M.add('face:busDisc', g);
  }
  // the route plate (left of the pole seen from the street) and the destination plate (right), each on a back bar
  const nR = Math.min(3, (p.routes || [0, 0]).length), rw = 0.3, rh = 0.152 * nR, ry = 2.93 - rh / 2;
  const nD = Math.min(3, (p.dests || [0, 0]).length), dw = 0.38, dh = 0.155 * nD + 0.19, dy = 2.93 - dh / 2;
  const plate = (w, h, cx, cy, face) => {
    M.add('aluBack', rbox(w, h, 0.005, 0.003, cx, cy, zf));
    const g = plane(w - 0.006, h - 0.006);
    g.translate(cx, cy, zf + 0.0035);
    M.add(face, g);
    const b = plane(w - 0.006, h - 0.006);
    b.rotateY(Math.PI); b.translate(cx, cy, zf - 0.0035);
    M.add('aluBack', b);
  };
  plate(rw, rh, -(rw / 2 + r + 0.01), ry, 'face:busRoute|' + key);
  plate(dw, dh, dw / 2 + r + 0.01, dy, 'face:busDest|' + dkey);
  if (q) {
    for (const y of [yc + 0.17, yc - 0.17, 2.85, 3.0]) M.add('galv', rbox(0.1, 0.022, 0.012, 0.004, 0, y, r + 0.004));
    M.add('galvDark', rbox(rw + dw + 2 * r + 0.04, 0.035, 0.012, 0.004, (dw - rw) / 2, 2.93, r - 0.004));
  }
  // the Guide-A-Ride case: a grey box with a window over the schedule, on two straps
  const cy = 0.86, cw = 0.27, ch = 0.52, cd = 0.07;
  M.add('silverPaint', rbox(cw, ch, cd, 0.012, 0, cy, r + cd / 2 + 0.005));
  M.add('face:busTimes', plane(cw - 0.05, ch - 0.08).translate(0, cy, r + cd + 0.0065));
  if (q) for (const y of [cy + 0.18, cy - 0.18]) M.add('galv', rbox(0.09, 0.03, 0.012, 0.004, 0, y, r - 0.002));
  return M;
}

// ---------------------------------------------------------------- work-zone pieces (EAST b64_s / b65_s, the Lexington
// Avenue SW corner lot, 2026-08): the orange channelizer drum, the timber tree-pit barrier draped with orange safety mesh,
// a diamond work-zone sign on a post
export function drum(q = 1, p = {}) {
  // a 36 in channelizer drum: an orange polyethylene barrel with two white and two orange retroreflective bands, a
  // flared black rubber ballast ring at the foot
  const M = new Model(), s = seg(q, 18, 9);
  M.add('rubber', lathe([[0.001, 0], [0.37, 0], [0.37, 0.05], [0.33, 0.085], [0.27, 0.095]], s));
  const bands = [[0.09, 0.27, 'drumOrange'], [0.27, 0.42, 'drumWhite'], [0.42, 0.57, 'drumOrange'], [0.57, 0.72, 'drumWhite'], [0.72, 0.86, 'drumOrange']];
  for (const [a, b, k] of bands) {
    const ra = 0.29 - a * 0.06, rb = 0.29 - b * 0.06;
    M.add(k, lathe([[ra, a], [ra + 0.006, a + 0.01], [rb + 0.006, b - 0.01], [rb, b]], s));
  }
  M.add('drumOrange', lathe([[0.238, 0.86], [0.22, 0.9], [0.12, 0.92], [0.06, 0.95], [0.001, 0.955]], s));
  void p;
  return M;
}
export function pitBarrier(q = 1, p = {}) {
  // a frame of 2x4s on posts round a tree pit (len along the kerb x dep across, rails at 0.45 and 1.0 m) with an orange
  // plastic safety mesh tied over its front and sides, sagging between the posts
  const M = new Model(), L = p.len || 3.6, D = p.dep || 1.5, H = 1.05;
  const post = (x, z) => M.add('timber', rbox(0.09, H, 0.09, 0.008, x, H / 2, z));
  for (const x of [-L / 2, 0, L / 2]) for (const z of [-D / 2, D / 2]) post(x, z);
  for (const y of [0.45, H - 0.04]) {
    for (const z of [-D / 2, D / 2]) M.add('timber', rbox(L + 0.12, 0.09, 0.04, 0.006, 0, y, z + Math.sign(z) * 0.065));
    for (const x of [-L / 2, L / 2]) M.add('timber', rbox(0.04, 0.09, D + 0.12, 0.006, x + Math.sign(x) * 0.065, y, 0));
  }
  if (q) M.add('timber', rbox(L * 0.98, 0.09, 0.04, 0.006, 0, 0.72, D / 2 + 0.065).rotateZ(0.32));
  // the mesh: a sagging sheet on the street face and the two ends (alpha-tested lattice)
  const sheet = (w, x0, z0, ang) => {
    const g = new THREE.PlaneGeometry(w, 0.9, Math.max(2, Math.round(w / 0.4)), 3).toNonIndexed();
    const ps = g.getAttribute('position');
    for (let i = 0; i < ps.count; i++) { const u = ps.getX(i) / w + 0.5; ps.setY(i, ps.getY(i) - Math.sin(u * Math.PI * (w > 2 ? 2 : 1)) ** 2 * 0.07); ps.setZ(i, Math.sin(u * 9.1 + ps.getY(i) * 3) * 0.012); }
    g.computeVertexNormals();
    g.rotateY(ang); g.translate(x0, 0.58, z0);
    M.add('face:mesh', g);
  };
  if (p.mesh !== 'end') sheet(L * 0.65, -L * 0.175, D / 2 + 0.1, 0);
  sheet(D + 0.1, -L / 2 - 0.1, 0, -Math.PI / 2);
  return M;
}
export function warnSign(q = 1, p = {}) {
  // a 36 in work-zone diamond on a 2 in post (b64_s: BLASTING ZONE, orange, black legend), its bottom corner about 1.9 m up
  const M = new Model(), d = 0.91, yc = 1.9 + (d * Math.SQRT2) / 2;
  M.add('galv', cyl(0.0254, 0.0254, yc + 0.35, seg(q, 10, 5), 0));
  const blank = rbox(d, d, 0.004, 0.02, 0, 0, 0.03).rotateZ(Math.PI / 4).translate(0, yc, 0);
  M.add('aluBack', blank);
  const f = plane(d - 0.01, d - 0.01);
  f.rotateZ(Math.PI / 4); f.translate(0, yc, 0.0355);
  M.add('face:mut' + (p.sign || 'blast'), f);
  if (q) for (const y of [yc + 0.25, yc - 0.25]) M.add('galv', rod([0, y, 0.0254], [0, y, 0.031], 0.004, 4));
  return M;
}
