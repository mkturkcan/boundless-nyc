// AR32 hptShore kit: the East River fleet off Hunters Point (city/hptShore.js builds it). Every boat is built in its own
// frame (x forward, y up from the waterline, z to starboard) and merged per material, vertex-coloured; one InstancedMesh
// per kind and material, their matrices written once per sim step (ENV.time, so a recorded take steps them
// frame-exactly) from preallocated state, no allocation per frame. Courses: city/hptShoreData.js. Sources and
// measurements: docs/notes/area-hptShore.md.
import * as THREE from 'three';
import { ENV, applyLightTrim, applySkyGlass } from '../world/materials.js';

const SRGB = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const COL = {
  white: SRGB(0xe6e8e5), whiteD: SRGB(0xc9ccca), navy: SRGB(0x16284e), deck: SRGB(0x8a9094), black: SRGB(0x1c1d1f),
  rub: SRGB(0x0f1011), cream: SRGB(0xe4dfcf), stack: SRGB(0x202224), band: SRGB(0xc8641e), rust: SRGB(0x5b3b2b),
  rustD: SRGB(0x3b2a22), gravel: SRGB(0x8c857a), steel: SRGB(0x9aa0a4), mast: SRGB(0xb9bdc1), teak: SRGB(0x9c7a55),
  hullS: SRGB(0xf0f0ec), sail: SRGB(0xf3f0e6), red: SRGB(0xff2a1a), green: SRGB(0x19ff5a), lampW: SRGB(0xfff4dc),
  amber: SRGB(0xffc23a), yacht: SRGB(0xf2f2ef), yachtB: SRGB(0x1c2a3a),
};

// ---- a merge bin in the boat's frame ------------------------------------------------------------------------------
class Bin {
  constructor(uv = false) { this.P = []; this.C = []; this.T = uv ? [] : null; }
  tri(a, b, c, col, ta, tb, tc) {
    this.P.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    for (let k = 0; k < 3; k++) this.C.push(col[0], col[1], col[2]);
    if (this.T) { const z = [0, 0], p = ta || z, q = tb || z, r = tc || z; this.T.push(p[0], p[1], q[0], q[1], r[0], r[1]); }
    return this;
  }
  quad(a, b, c, d, col, ta, tb, tc, td) { this.tri(a, b, c, col, ta, tb, tc); return this.tri(a, c, d, col, ta, tc, td); }
  // an axis box [x0, x1] x [y0, y1] x [z0, z1]
  box(x0, x1, y0, y1, z0, z1, col, bottom = false) {
    this.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], col);
    if (bottom) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0], col);
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], col);
    this.quad([x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1], col);
    this.quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], col);
    return this.quad([x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], col);
  }
  // a hull lofted through stations [x, half beam at the deck, deck y, half beam at the bottom, bottom y] (stern first),
  // offset zc across; the sides painted in bands [[y top, colour]...] from the bottom up; the deck in colD
  hull(st, zc, bands, colD, deck = true) {
    const side = (s, y, sg) => { const t = (y - s[4]) / (s[2] - s[4]), h = s[3] + (s[1] - s[3]) * Math.max(0, Math.min(1, t)); return [s[0], y, zc + sg * h]; };
    for (let i = 0; i + 1 < st.length; i++) {
      const A = st[i], B = st[i + 1];
      for (const sg of [-1, 1]) {
        let yA0 = A[4], yB0 = B[4];
        for (const [yt, col] of bands) {
          const yA1 = Math.min(yt, A[2]), yB1 = Math.min(yt, B[2]);
          if (yA1 > yA0 + 1e-3 || yB1 > yB0 + 1e-3) this.quad(side(A, yA0, sg), side(B, yB0, sg), side(B, Math.max(yB0, yB1), sg), side(A, Math.max(yA0, yA1), sg), col);
          yA0 = Math.max(yA0, yA1); yB0 = Math.max(yB0, yB1);
        }
      }
      if (deck) this.quad([A[0], A[2], zc - A[1]], [B[0], B[2], zc - B[1]], [B[0], B[2], zc + B[1]], [A[0], A[2], zc + A[1]], colD);
      this.quad([A[0], A[4], zc + A[3]], [B[0], B[4], zc + B[3]], [B[0], B[4], zc - B[3]], [A[0], A[4], zc - A[3]], bands[0][1]);
    }
    const S = st[0], E = st[st.length - 1];                              // the transom and the stem face
    for (const [s, c] of [[S, bands[bands.length - 1][1]], [E, bands[bands.length - 1][1]]]) this.quad([s[0], s[4], zc - s[3]], [s[0], s[4], zc + s[3]], [s[0], s[2], zc + s[1]], [s[0], s[2], zc - s[1]], c);
    return this;
  }
  // a deckhouse [x0, x1] x [y0, y1] x [-hw, hw] with a glazed band [g0, g1] (into glass bin G) and a raked front
  house(G, x0, x1, y0, y1, hw, g0, g1, col, rake = 0, roofCol = col) {
    const xf = (y) => x1 - rake * (y - y0) / (y1 - y0);
    const ring = (ya, yb, bin, c) => {
      const fa = xf(ya), fb = xf(yb);
      bin.quad([x0, ya, -hw], [fa, ya, -hw], [fb, yb, -hw], [x0, yb, -hw], c);
      bin.quad([fa, ya, hw], [x0, ya, hw], [x0, yb, hw], [fb, yb, hw], c);
      bin.quad([fa, ya, -hw], [fa, ya, hw], [fb, yb, hw], [fb, yb, -hw], c);
      bin.quad([x0, ya, hw], [x0, ya, -hw], [x0, yb, -hw], [x0, yb, hw], c);
    };
    ring(y0, g0, this, col); ring(g0, g1, G, COL.black); ring(g1, y1, this, col);
    const fr = xf(y1);
    this.quad([x0, y1, -hw], [fr, y1, -hw], [fr, y1, hw], [x0, y1, hw], roofCol);
    return this;
  }
  geo() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    if (this.T) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.T, 2));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

// ---- the boats ----------------------------------------------------------------------------------------------------
// Each builder fills { hull, glass, glow } bins and returns its navigation lights [x, y, z, colour] and wake
// { bow, len, halfW } (the wake's apex x in the boat frame, its length and half width at the far end).

// NYC Ferry's 26 m catamaran (the Incat Crowther 26 design built from 2017 by Horizon Shipbuilding and Metal Shark for
// the 149-passenger routes: 85 ft / 25.9 m overall, 28 ft / 8.5 m beam): two demihulls, the main cabin's continuous
// window band, the upper deck with the wheelhouse forward and open seating aft. Livery from photographs (Wikimedia Commons,
// 'NYC Ferry Lunch Box H-200' and 'NYC Ferry and Pepsi', CC BY-SA 4.0 / CC BY 4.0, look-only): navy hulls up to the main
// deck with a grey rubbing strake, a white superstructure, the cabin's black window band ending short of the stern, where
// the operator's roundel (a ferry over waves, light blue) and NYC sit on a white panel (drawn from scratch on a canvas)
function ferry(B) {
  const { hull: H, glass: G, glow: L } = B;
  const st = [[-12.9, 1.0, 1.55, 0.78, -1.1], [-6, 1.08, 1.55, 0.84, -1.3], [4, 1.08, 1.6, 0.8, -1.3], [8.5, 0.86, 1.7, 0.42, -1.1], [11.6, 0.46, 1.8, 0.1, -0.7], [12.95, 0.06, 1.86, 0.03, 0.3]];
  const bands = [[1.02, COL.navy], [1.12, COL.steel], [9, COL.navy]];
  H.hull(st, -3.17, bands, COL.deck); H.hull(st, 3.17, bands, COL.deck);
  H.box(-12.9, 11.2, 1.05, 1.62, -2.15, 2.15, COL.navy);                          // the bridge deck over the tunnel
  H.box(-12.9, 8.5, 1.62, 1.8, -4.25, 4.25, COL.navy);                            // the main deck, over the sponsons
  { // the foredeck tapering to the bow (8.5 m wide at x 8.5, 5.4 m at the stem head, x 12.7)
    const y0 = 1.62, y1 = 1.8, a0 = 8.5, a1 = 12.7, w0 = 4.25, w1 = 2.7;
    H.quad([a0, y1, -w0], [a1, y1, -w1], [a1, y1, w1], [a0, y1, w0], COL.deck);
    H.quad([a0, y0, w0], [a1, y0, w1], [a1, y0, -w1], [a0, y0, -w0], COL.navy);
    H.quad([a0, y0, -w0], [a1, y0, -w1], [a1, y1, -w1], [a0, y1, -w0], COL.navy); H.quad([a1, y0, w1], [a0, y0, w0], [a0, y1, w0], [a1, y1, w1], COL.navy);
    H.quad([a1, y0, -w1], [a1, y0, w1], [a1, y1, w1], [a1, y1, -w1], COL.navy);
    H.box(-12.9, 8.5, 1.8, 1.81, -4.2, 4.2, COL.deck);
  }
  H.box(-12.9, 11.0, 1.66, 1.78, -4.33, -4.2, COL.steel); H.box(-12.9, 11.0, 1.66, 1.78, 4.2, 4.33, COL.steel);
  // the main cabin: windows 2.35-3.55, the raked front
  H.house(G, -9.6, 7.6, 1.8, 4.05, 3.95, 2.35, 3.55, COL.white, 0.6);
  H.box(-9.9, 8.1, 4.05, 4.28, -4.2, 4.2, COL.white);                              // the upper deck
  for (const sg of [-1, 1]) H.box(-9.62, -7.2, 2.3, 3.6, sg * 3.96 - 0.02, sg * 3.96 + 0.02, COL.white);   // the aft panels
  // rails: the upper deck's (a bulwark and a top rail), the bow's and stern's open decks
  for (const sg of [-1, 1]) {
    H.box(-9.9, 2.6, 4.28, 4.85, sg * 4.2 - 0.05, sg * 4.2 + 0.05, COL.white); H.box(-9.9, 2.6, 5.25, 5.33, sg * 4.2 - 0.05, sg * 4.2 + 0.05, COL.steel);
    H.box(7.8, 9.6, 1.8, 2.25, sg * 4.05 - 0.05, sg * 4.05 + 0.05, COL.white); H.box(7.8, 12.4, 2.75, 2.82, sg * 3.55 - 0.05, sg * 3.55 + 0.05, COL.steel);
    H.box(-12.8, -9.7, 2.75, 2.82, sg * 4.15 - 0.05, sg * 4.15 + 0.05, COL.steel);
  }
  H.box(-9.95, -9.85, 4.28, 5.33, -4.2, 4.2, COL.steel); H.box(-12.85, -12.75, 1.8, 2.82, -4.15, 4.15, COL.steel);
  // seats on the open upper deck (rows of benches, navy)
  for (let x = -9.0; x < 1.8; x += 1.35) H.box(x, x + 0.5, 4.28, 4.75, -3.4, 3.4, COL.navy);
  // passengers seated on the benches (simple figures: legs, torso, head), a deterministic scatter of seats and colours
  const SH = [0x2d4a7a, 0xb8412f, 0xe7e2d6, 0x3f6b45, 0x222326, 0xd9a13b, 0x6d4c7d, 0x8c8f93].map(SRGB), SK = [0x8d5a3b, 0xc59a78, 0xe0b99a, 0x5b3a26].map(SRGB);
  let pi = 0;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 5; c++) {
    const hh = Math.sin(r * 12.9898 + c * 78.233) * 43758.5453, f = hh - Math.floor(hh);
    if (f > 0.34) continue;
    const x = -9.0 + r * 1.35 + 0.25, zc = -2.7 + c * 1.35 + (f - 0.17) * 0.8, sh = SH[(pi * 5 + r) % SH.length], sk = SK[(pi * 3 + c) % SK.length]; pi++;
    H.box(x + 0.02, x + 0.5, 4.72, 4.86, zc - 0.2, zc + 0.2, SRGB(0x2a2c30));                   // thighs
    H.box(x - 0.14, x + 0.14, 4.75, 5.4, zc - 0.22, zc + 0.22, sh);                            // torso
    H.box(x - 0.1, x + 0.1, 5.42, 5.66, zc - 0.09, zc + 0.09, sk);                             // head
  }
  // the wheelhouse forward on the upper deck, its mast with the radar and the lights
  H.house(G, 2.6, 7.4, 4.28, 6.45, 2.65, 5.15, 6.15, COL.white, 0.5, COL.navy);
  H.box(4.9, 5.1, 6.45, 8.4, -0.1, 0.1, COL.white); H.box(4.2, 5.8, 7.45, 7.62, -0.14, 0.14, COL.black);
  L.box(4.85, 5.15, 8.2, 8.45, -0.12, 0.12, COL.lampW);
  L.box(6.4, 6.9, 5.7, 5.95, -2.72, -2.66, COL.red); L.box(6.4, 6.9, 5.7, 5.95, 2.66, 2.72, COL.green);
  L.box(-9.75, -9.6, 4.55, 4.75, -0.12, 0.12, COL.lampW);
  return { lights: [[5, 8.33, 0, COL.lampW], [6.65, 5.83, -2.8, COL.red], [6.65, 5.83, 2.8, COL.green], [-9.8, 4.65, 0, COL.lampW]], wake: { bow: 12.9, len: 190, halfW: 67, stern: -12.9 } };
}

// a New York harbour tug (30 m, 10 m beam, an elevated pilothouse for pushing) in the notch of a loaded deck barge
// (60 x 16 m, aggregate heaped in its hopper); black hull, white house, black stacks with an orange band (a generic
// livery). The unit's origin is between the two; the barge ahead.
function tugUnit(B) {
  const { hull: H, glass: G, glow: L } = B;
  const X = -30;                                                                      // the tug's midship
  const st = [[X - 15, 4.2, 2.1, 3.6, -3.2], [X - 10, 4.9, 2.1, 4.3, -3.6], [X + 4, 5.0, 2.3, 4.2, -3.6], [X + 11, 4.5, 2.7, 3.2, -3.0], [X + 14.4, 3.6, 3.0, 2.2, -1.5]];
  H.hull(st, 0, [[0.55, COL.rust], [9, COL.black]], COL.deck);
  H.box(X - 15.3, X + 14.2, 1.7, 2.6, -5.2, -4.8, COL.rub); H.box(X - 15.3, X + 14.2, 1.7, 2.6, 4.8, 5.2, COL.rub);   // the fender belt
  H.box(X + 14.3, X + 15.4, 0.3, 3.2, -3.4, 3.4, COL.rub);                                                          // bow fenders
  for (const sg of [-1, 1]) H.box(X + 13.6, X + 15.2, 2.9, 6.2, sg * 2.4 - 0.25, sg * 2.4 + 0.25, COL.black);        // push knees
  H.house(G, X - 7, X + 6, 2.2, 5.0, 3.9, 3.3, 4.3, COL.white, 0, COL.white);
  H.house(G, X - 4.5, X + 4.5, 5.0, 7.4, 3.2, 5.9, 6.9, COL.white, 0, COL.white);
  H.house(G, X - 1.2, X + 4.0, 7.4, 10.35, 2.45, 8.45, 10.0, COL.white, 0.25, COL.black);
  for (const sg of [-1, 1]) {
    H.box(X - 4.2, X - 2.8, 7.4, 11.6, sg * 2.2 - 0.55, sg * 2.2 + 0.55, COL.stack);
    H.box(X - 4.25, X - 2.75, 9.9, 10.5, sg * 2.2 - 0.6, sg * 2.2 + 0.6, COL.band);
  }
  H.box(X + 1.1, X + 1.3, 10.35, 13.4, -0.1, 0.1, COL.white); H.box(X + 0.3, X + 2.1, 11.2, 11.35, -0.12, 0.12, COL.black);
  L.box(X + 1.05, X + 1.35, 12.2, 12.45, -0.13, 0.13, COL.lampW); L.box(X + 1.05, X + 1.35, 13.1, 13.35, -0.13, 0.13, COL.lampW);
  L.box(X + 3.2, X + 3.8, 9.6, 9.85, -2.52, -2.46, COL.red); L.box(X + 3.2, X + 3.8, 9.6, 9.85, 2.46, 2.52, COL.green);
  L.box(X - 7.1, X - 6.95, 4.4, 4.6, -0.12, 0.12, COL.lampW);                       // the sternlight (pushing ahead: no towing light)
  // the barge: raked ends, rust-brown sides, a black sheer strake, the hopper's coaming and its load
  const bx = 16.3;                                                                  // the barge's midship
  const bs = [[bx - 30, 8, 1.95, 8, 1.0], [bx - 26, 8, 1.85, 8, -2.4], [bx + 26, 8, 1.85, 8, -2.4], [bx + 30, 8, 1.95, 8, 1.0]];
  H.hull(bs, 0, [[0.5, COL.rustD], [1.5, COL.rust], [9, COL.black]], COL.rustD);
  for (const sg of [-1, 1]) H.box(bx - 27, bx + 27, 1.9, 3.0, sg * 7.6 - 0.2, sg * 7.6 + 0.2, COL.rust);
  H.box(bx - 27.2, bx - 26.8, 1.9, 3.0, -7.6, 7.6, COL.rust); H.box(bx + 26.8, bx + 27.2, 1.9, 3.0, -7.6, 7.6, COL.rust);
  // the heap: a ridge 4.6 m over the waterline, flanks down to the coaming
  const g = COL.gravel, r0 = bx - 22, r1 = bx + 22, yR = 4.6, yC = 2.9;
  H.quad([bx - 26.6, yC, -7.3], [bx + 26.6, yC, -7.3], [r1, yR, 0], [r0, yR, 0], g);
  H.quad([bx + 26.6, yC, 7.3], [bx - 26.6, yC, 7.3], [r0, yR, 0], [r1, yR, 0], g);
  H.tri([bx - 26.6, yC, 7.3], [bx - 26.6, yC, -7.3], [r0, yR, 0], g); H.tri([bx + 26.6, yC, -7.3], [bx + 26.6, yC, 7.3], [r1, yR, 0], g);
  L.box(bx + 29.5, bx + 29.8, 2.2, 2.45, -7.9, -7.8, COL.red); L.box(bx + 29.5, bx + 29.8, 2.2, 2.45, 7.8, 7.9, COL.green);
  L.box(bx + 29.7, bx + 29.9, 2.2, 2.5, -0.15, 0.15, COL.amber);
  return {
    lights: [[X + 1.2, 12.33, 0, COL.lampW], [X + 1.2, 13.23, 0, COL.lampW], [X + 3.5, 9.73, -2.6, COL.red], [X + 3.5, 9.73, 2.6, COL.green],
      [X - 7.1, 4.5, 0, COL.lampW], [bx + 29.6, 2.33, -7.95, COL.red], [bx + 29.6, 2.33, 7.95, COL.green], [bx + 29.9, 2.35, 0, COL.amber]],
    wake: { bow: X + 15, len: 240, halfW: 85, stern: X - 15 },
  };
}

// a cruising sloop, 11 m (36 ft) overall: hull, cabin trunk, mast 15 m over the deck; the sails built apart (they swing)
function sloop(B) {
  const { hull: H, glass: G, glow: L } = B;
  const st = [[-5.3, 1.45, 0.95, 1.05, -0.45], [-2.2, 1.75, 1.0, 1.25, -0.55], [1.8, 1.65, 1.08, 1.0, -0.55], [4.4, 0.85, 1.22, 0.36, -0.35], [5.6, 0.05, 1.34, 0.03, 0.55]];
  H.hull(st, 0, [[0.12, COL.navy], [9, COL.hullS]], COL.teak);
  H.house(G, -1.4, 2.4, 1.0, 1.55, 0.95, 1.18, 1.4, COL.hullS, 0.2);
  H.box(1.32, 1.48, 1.0, 16.0, -0.08, 0.08, COL.mast);
  L.box(1.28, 1.52, 16.0, 16.22, -0.1, 0.1, COL.lampW);
  L.box(5.0, 5.2, 1.3, 1.42, -0.2, -0.1, COL.red); L.box(5.0, 5.2, 1.3, 1.42, 0.1, 0.2, COL.green);
  return { lights: [[1.4, 16.1, 0, COL.lampW], [5.1, 1.36, -0.25, COL.red], [5.1, 1.36, 0.25, COL.green], [-5.3, 1.1, 0, COL.lampW]], wake: null };
}
// the sails in the sail frame: the mainsail about the mast (x 1.4), the jib about its tack; each set at its own angle
function sloopSails() {
  const M = new Bin(), J = new Bin(), c = COL.sail;
  M.quad([-0.02, 2.1, 0], [-4.9, 2.1, 0], [-4.9, 2.05, 0], [-0.02, 2.05, 0], COL.mast);        // the boom (a strip)
  M.tri([-0.05, 2.15, 0], [-4.85, 2.15, 0], [-0.05, 15.6, 0], c);
  M.tri([-0.05, 15.6, 0], [-4.85, 2.15, 0], [-2.2, 8.6, 0.18], c);                              // the roach, a little camber
  J.tri([0, 1.45, 0], [-4.4, 1.65, 0], [-3.95, 13.2, 0], c);
  return { main: M.geo(), jib: J.geo() };
}

// a 14 m motor yacht: white, a dark hull window band, the saloon, a flybridge with its windscreen and radar arch
function yacht(B) {
  const { hull: H, glass: G, glow: L } = B;
  const st = [[-7, 2.05, 1.35, 1.75, -0.7], [-1, 2.3, 1.42, 1.75, -0.9], [3.8, 2.0, 1.6, 1.1, -0.7], [6.3, 1.0, 1.8, 0.35, -0.3], [7.25, 0.06, 1.95, 0.03, 0.5]];
  H.hull(st, 0, [[0.1, COL.navy], [0.75, COL.yacht], [1.1, COL.yachtB], [9, COL.yacht]], COL.teak);
  H.house(G, -4.2, 3.4, 1.42, 3.05, 2.0, 1.95, 2.8, COL.yacht, 0.9);
  H.box(-2.6, 1.4, 3.05, 3.2, -2.0, 2.0, COL.yacht);
  H.box(0.6, 1.2, 3.2, 3.75, -1.8, 1.8, COL.yachtB);
  for (const sg of [-1, 1]) H.box(-1.6, -1.4, 3.2, 4.55, sg * 1.7 - 0.08, sg * 1.7 + 0.08, COL.yacht);
  H.box(-1.8, -1.2, 4.45, 4.62, -1.8, 1.8, COL.yacht);
  L.box(-1.62, -1.38, 4.62, 4.82, -0.1, 0.1, COL.lampW);
  L.box(2.9, 3.2, 1.95, 2.1, -2.03, -1.98, COL.red); L.box(2.9, 3.2, 1.95, 2.1, 1.98, 2.03, COL.green);
  return { lights: [[-1.5, 4.72, 0, COL.lampW], [3.05, 2.02, -2.1, COL.red], [3.05, 2.02, 2.1, COL.green], [-7.0, 1.6, 0, COL.lampW]], wake: { bow: 7.2, len: 115, halfW: 40, stern: -7 } };
}

// ---- the operator's roundel on the ferries' aft cabin panels -------------------------------------------------------------
function ferryDecal() {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, 256, 256);
  // the roundel: a light blue disc, a white ferry (hull, cabin, wheelhouse) over three white waves
  g.fillStyle = '#2f8fc9'; g.beginPath(); g.arc(128, 92, 76, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffffff';
  g.beginPath(); g.moveTo(74, 96); g.lineTo(182, 96); g.lineTo(170, 112); g.lineTo(86, 112); g.closePath(); g.fill();
  g.fillRect(92, 78, 70, 14); g.fillRect(110, 64, 34, 11);
  g.strokeStyle = '#ffffff'; g.lineWidth = 7; g.lineCap = 'round';
  for (let i = 0; i < 3; i++) { const y = 124 + i * 13, w = 58 - i * 12; g.beginPath(); for (let x = -w; x <= w; x += 4) { const yy = y + 4 * Math.sin((x / 14) * Math.PI); if (x === -w) g.moveTo(128 + x, yy); else g.lineTo(128 + x, yy); } g.stroke(); }
  g.fillStyle = '#16284e'; g.font = 'bold 58px "Helvetica Neue", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('NYC', 128, 214);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  // a quad on each side's aft panel (x -9.4 to -7.4, y 2.2 to 4.0), reading upright from outside
  const D = new Bin(true), w = [1, 1, 1];
  const x0 = -9.35, x1 = -7.45, y0 = 2.12, y1 = 4.02, zS = 3.99;
  D.quad([x0, y0, zS], [x1, y0, zS], [x1, y1, zS], [x0, y1, zS], w, [0, 0], [1, 0], [1, 1], [0, 1]);
  D.quad([x1, y0, -zS], [x0, y0, -zS], [x0, y1, -zS], [x1, y1, -zS], w, [0, 0], [1, 0], [1, 1], [0, 1]);
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.35, roughness: 0.5, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  applyLightTrim(mat);
  const pk = mat.customProgramCacheKey.bind(mat); mat.customProgramCacheKey = () => pk() + '|ar32hDecal';
  return { geo: D.geo(), mat };
}

// ---- the wake ---------------------------------------------------------------------------------------------------------
// a V behind the boat (the Kelvin arms at 19.5 degrees off the course, the stern's wash down the middle), painted once
// on a canvas: u across (0.5 the course), v back from the apex (the bow); the foam fades within about a third of the
// quad (the arms' foam is short-lived: the first texture's arms read as long bright lines at a grazing angle in the
// hptSign r1 dusk still hpsMidtown)
let _wakeTex = null;
function wakeTex() {
  if (_wakeTex) return _wakeTex;
  const W = 256, Hh = 1024, cv = document.createElement('canvas'); cv.width = W; cv.height = Hh;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, W, Hh);
  let s = 12345; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  // the arms: feathered dots along the two lines from the apex, fading back
  for (let i = 0; i < 5200; i++) {
    const v = Math.pow(rnd(), 0.8), side = rnd() < 0.5 ? -1 : 1, spread = 0.004 + 0.035 * v;
    const u = 0.5 + side * (0.5 * v) + (rnd() - 0.5) * spread * 2;
    const a = 0.3 * Math.pow(1 - v, 3.2) * (0.4 + 0.6 * rnd());
    g.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
    g.beginPath(); g.ellipse(u * W, v * Hh, 1.2 + 2.5 * v, 2.5 + 7 * v, side * 0.34, 0, Math.PI * 2); g.fill();
  }
  // the diverging crests: short strokes inside the arms
  for (let k = 0; k < 26; k++) {
    const v = 0.05 + k * 0.035, a = 0.14 * Math.pow(1 - v, 3);
    for (const side of [-1, 1]) {
      g.strokeStyle = `rgba(255,255,255,${a.toFixed(3)})`; g.lineWidth = 1.5 + 2 * v;
      g.beginPath(); g.moveTo((0.5 + side * 0.5 * v) * W, v * Hh); g.lineTo((0.5 + side * 0.33 * v) * W, (v - 0.035) * Hh); g.stroke();
    }
  }
  // the wash: from the stern (v 0.13) back, a band of churned foam widening and fading
  for (let i = 0; i < 9000; i++) {
    const v = 0.125 + Math.pow(rnd(), 1.3) * 0.875, w = 0.012 + 0.08 * (v - 0.125);
    const u = 0.5 + (rnd() - 0.5) * 2 * w * (0.5 + 0.5 * rnd());
    const a = 0.45 * Math.pow(1 - (v - 0.125) / 0.875, 3.6) * (0.35 + 0.65 * rnd());
    g.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
    g.beginPath(); g.ellipse(u * W, v * Hh, 1.0 + 3 * rnd(), 3 + 9 * rnd(), 0, 0, Math.PI * 2); g.fill();
  }
  _wakeTex = new THREE.CanvasTexture(cv);
  _wakeTex.anisotropy = 8;
  return _wakeTex;
}

// ---- the materials ------------------------------------------------------------------------------------------------------
let MATS = null;
function mats() {
  if (MATS) return MATS;
  const hull = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.0, side: THREE.DoubleSide });
  applyLightTrim(hull);
  { const k = hull.customProgramCacheKey.bind(hull); hull.customProgramCacheKey = () => k() + '|ar32hHull'; }
  // glazing: the analytic sky mirror over a dark interior, the cabins lit from inside after dark
  const glass = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 0.05, side: THREE.DoubleSide });
  glass.onBeforeCompile = (sh) => {
    sh.uniforms.hwNight = ENV.night;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float hwNight;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vec3(1.0, 0.9, 0.74) * smoothstep(0.2, 0.8, hwNight) * 0.9;');
  };
  glass.customProgramCacheKey = () => 'ar32hGlass';
  applySkyGlass(glass, { f0: 0.09, rough: 0.05, tint: [0.92, 0.96, 1.0] });
  { const k = glass.customProgramCacheKey.bind(glass); glass.customProgramCacheKey = () => k() + '|ar32hGlassSky'; }
  // navigation lights' lenses: dim coloured glass by day, over the bloom threshold after dark
  const glow = new THREE.MeshBasicMaterial({ vertexColors: true });
  glow.onBeforeCompile = (sh) => {
    sh.uniforms.hwNight = ENV.night;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float hwNight;')
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n gl_FragColor.rgb *= 0.18 + hwNight * 3.2;');
  };
  glow.customProgramCacheKey = () => 'ar32hGlow';
  const sail = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0, side: THREE.DoubleSide });
  applyLightTrim(sail);
  { const k = sail.customProgramCacheKey.bind(sail); sail.customProgramCacheKey = () => k() + '|ar32hSail'; }
  // the wakes: foam of the material's colour (the canvas's transparent texels are black, so only its alpha is used),
  // alpha from the texture times the boat's speed (the instance colour's red), dim after dark
  const wake = new THREE.MeshBasicMaterial({ map: wakeTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8, color: 0xf4f7f6 });
  wake.onBeforeCompile = (sh) => {
    sh.uniforms.hwNight = ENV.night;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float hwNight;')
      .replace('#include <map_fragment>', '#ifdef USE_MAP\n diffuseColor.a *= texture2D( map, vMapUv ).a;\n#endif')
      .replace('#include <color_fragment>', '#if defined( USE_COLOR )\n diffuseColor.a *= vColor.r;\n#endif')
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n gl_FragColor.rgb *= mix(0.92, 0.05, hwNight);');
  };
  wake.customProgramCacheKey = () => 'ar32hWake';
  // the lights' haloes after dark (points, additive, 1.7 m across, 2.5 to 24 px)
  const hc = document.createElement('canvas'); hc.width = hc.height = 64;
  { const g = hc.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,0.75)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }
  const halo = new THREE.PointsMaterial({ size: 1.7, sizeAttenuation: true, map: new THREE.CanvasTexture(hc), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  halo.onBeforeCompile = (sh) => {
    sh.uniforms.hwNight = ENV.night;
    sh.vertexShader = sh.vertexShader.replace('#include <fog_vertex>', '#include <fog_vertex>\n gl_PointSize = clamp(gl_PointSize, 2.5, 24.0);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float hwNight;')
      .replace('#include <fog_fragment>', '#include <fog_fragment>\n gl_FragColor.rgb *= smoothstep(0.15, 0.75, hwNight) * 1.6;');
  };
  halo.customProgramCacheKey = () => 'ar32hHalo';
  MATS = { hull, glass, glow, sail, wake, halo };
  return MATS;
}

// ---- the courses ----------------------------------------------------------------------------------------------------------
// a leg's polyline smoothed (Chaikin, 3 rounds, its ends kept) and resampled every 2 m
function resample(pts) {
  let P = pts.map((p) => [p[0], p[1]]);
  for (let r = 0; r < 3 && P.length > 2; r++) {
    const Q = [P[0]];
    for (let i = 0; i + 1 < P.length; i++) {
      const a = P[i], b = P[i + 1];
      if (i > 0) Q.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]]);
      if (i + 2 < P.length) Q.push([0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
    }
    Q.push(P[P.length - 1]);
    P = Q;
  }
  const cum = [0];
  for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const L = cum[cum.length - 1], n = Math.max(2, Math.ceil(L / 2) + 1), xs = new Float32Array(n), zs = new Float32Array(n);
  let j = 0;
  for (let k = 0; k < n; k++) {
    const s = (k / (n - 1)) * L;
    while (j + 2 < cum.length && cum[j + 1] < s) j++;
    const t = (s - cum[j]) / Math.max(1e-6, cum[j + 1] - cum[j]);
    xs[k] = P[j][0] + (P[j + 1][0] - P[j][0]) * t; zs[k] = P[j][1] + (P[j + 1][1] - P[j][1]) * t;
  }
  return { xs, zs, n, L, ds: L / (n - 1) };
}
const wrapA = (a) => a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));
// the course's events for one cycle: dwell at each stop, then the legs out and back
function schedule(C, pivot) {
  const stops = C.stops, legs = [];
  for (let i = 0; i + 1 < stops.length; i++) legs.push(resample(C.pts.slice(stops[i][0], stops[i + 1][0] + 1)));
  const ev = [], v = C.v, a = C.a;
  const move = (leg, dir) => {
    const ta = v / a, da = v * v / (2 * a);
    let T, vp = v;
    if (leg.L >= 2 * da) T = leg.L / v + ta; else { vp = Math.sqrt(leg.L * a); T = 2 * vp / a; }
    ev.push({ k: 'm', leg, dir, T, vp });
  };
  const n = legs.length;
  for (let i = 0; i < n; i++) { ev.push({ k: 'd', leg: legs[i], at: 0, T: stops[i][1] }); move(legs[i], 1); }
  ev.push({ k: 'd', leg: legs[n - 1], at: 1, T: stops[n][1] });
  for (let i = n - 1; i >= 0; i--) { move(legs[i], -1); if (i > 0) ev.push({ k: 'd', leg: legs[i - 1], at: 1, T: stops[i][1] }); }
  let t = 0;
  for (const e of ev) { e.t0 = t; t += e.T; }
  // headings: each move's end heading, and the heading it starts from (the move before it, round the cycle)
  const hdAt = (leg, s, dir) => { const i0 = Math.max(0, Math.min(leg.n - 1, Math.round((s - 6) / leg.ds))), i1 = Math.max(0, Math.min(leg.n - 1, Math.round((s + 6) / leg.ds))); const dx = leg.xs[i1] - leg.xs[i0], dz = leg.zs[i1] - leg.zs[i0]; return Math.atan2(dir * dz, dir * dx); };
  const moves = ev.filter((e) => e.k === 'm');
  for (const m of moves) { m.hS = hdAt(m.leg, m.dir > 0 ? 0 : m.leg.L, m.dir); m.hE = hdAt(m.leg, m.dir > 0 ? m.leg.L : 0, m.dir); }
  moves.forEach((m, i) => { const p = moves[(i + moves.length - 1) % moves.length]; m.hP = p.hE; let d = wrapA(m.hS - m.hP); if (Math.abs(d) > 2.6) d = Math.abs(d) * (i % 2 ? -1 : 1); m.dH = d; });
  for (let i = 0; i < ev.length; i++) if (ev[i].k === 'd') { const nx = ev.slice(i + 1).find((e) => e.k === 'm') || moves[0]; ev[i].h = nx.hP; }
  return { ev, T: t, pivot, hdAt, v, a };
}
// the boat's state at time t: out = [x, z, heading, speed, distance from the nearest stop]
function stateAt(S, t, out) {
  let tt = t % S.T; if (tt < 0) tt += S.T;
  let e = S.ev[0];
  for (let i = 0; i < S.ev.length; i++) { if (S.ev[i].t0 <= tt) e = S.ev[i]; else break; }
  const leg = e.leg;
  if (e.k === 'd') {
    const k = e.at ? leg.n - 1 : 0;
    out[0] = leg.xs[k]; out[1] = leg.zs[k]; out[2] = e.h; out[3] = 0; out[4] = 0;
    return out;
  }
  const tau = tt - e.t0, acc = S.a, ta = e.vp / acc;
  let s, v;
  if (tau < ta) { s = 0.5 * acc * tau * tau; v = acc * tau; } else if (tau < e.T - ta) { s = 0.5 * acc * ta * ta + e.vp * (tau - ta); v = e.vp; } else { const r = Math.max(0, e.T - tau); s = leg.L - 0.5 * acc * r * r; v = acc * r; }
  s = Math.max(0, Math.min(leg.L, s));
  const sp = e.dir > 0 ? s : leg.L - s;
  const f = sp / leg.ds, i = Math.min(leg.n - 2, Math.floor(f)), u = f - i;
  out[0] = leg.xs[i] + (leg.xs[i + 1] - leg.xs[i]) * u; out[1] = leg.zs[i] + (leg.zs[i + 1] - leg.zs[i]) * u;
  let h = S.hdAt(leg, sp, e.dir);
  if (s < S.pivot) { const w = s / S.pivot, sm = w * w * (3 - 2 * w); h = e.hP + e.dH * sm + wrapA(h - (e.hP + e.dH)) * sm; }
  out[2] = h; out[3] = v; out[4] = Math.min(s, leg.L - s);
  return out;
}

// ---- the fleet ----------------------------------------------------------------------------------------------------------
const KINDS = { ferry: { build: ferry, pivot: 45 }, tug: { build: tugUnit, pivot: 110 }, sloop: { build: sloop, pivot: 22 }, yacht: { build: yacht, pivot: 30 } };
const WIND_TO = [0.38, -0.92];                                                            // from the south-south-west

export function buildFleet(group, fleet, courses, tOffset = 0, tAt = null) {
  const M = mats();
  const kinds = {};
  for (const [kind] of fleet) {
    if (kinds[kind]) { kinds[kind].n++; continue; }
    const B = { hull: new Bin(), glass: new Bin(), glow: new Bin() };
    const info = KINDS[kind].build(B);
    kinds[kind] = { n: 1, B, info, meshes: [] };
  }
  const mk = (geo, mat, n, name, shadow = true) => {
    const m = new THREE.InstancedMesh(geo, mat, n); m.name = 'ar32h:' + name; m.frustumCulled = false;
    m.castShadow = shadow; m.receiveShadow = shadow; group.add(m); return m;
  };
  let tris = 0;
  for (const [kind, K] of Object.entries(kinds)) {
    for (const [part, mat] of [['hull', M.hull], ['glass', M.glass], ['glow', M.glow]]) {
      if (!K.B[part].P.length) continue;
      const g = K.B[part].geo(); tris += (g.attributes.position.count / 3) * K.n;
      K.meshes.push(mk(g, mat, K.n, kind + ':' + part, part !== 'glow'));
    }
    if (kind === 'ferry') { const d = ferryDecal(); K.meshes.push(mk(d.geo, d.mat, K.n, 'ferry:name', false)); }
    if (kind === 'sloop') { const S = sloopSails(); K.main = mk(S.main, M.sail, K.n, 'sloop:main'); K.jib = mk(S.jib, M.sail, K.n, 'sloop:jib'); tris += 4 * K.n; }
  }
  // the boats, their slots in their kind's meshes, their schedules
  const count = {};
  const boats = fleet.map(([kind, cn, dph]) => {
    const C = courses[cn], K = kinds[kind];
    const slot = (count[kind] = (count[kind] ?? -1) + 1);
    return { kind, K, slot, S: schedule(C, KINDS[kind].pivot), ph: (C.phase || 0) + (dph || 0), seed: slot * 1.7 + cn.length, st: new Float64Array(5), M: new THREE.Matrix4() };
  });
  // wakes (the kinds that make one) and the lights' haloes
  const wb = boats.filter((b) => b.K.info.wake);
  const wg = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(-0.5, 0, 0);    // x in [-1, 0] (0 the apex)
  { const uv = wg.attributes.uv, p = wg.attributes.position; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getZ(i) + 0.5, 1 + p.getX(i)); }
  const wakes = wb.length ? mk(wg, M.wake, wb.length, 'wakes', false) : null;
  if (wakes) { wakes.renderOrder = 2; for (let i = 0; i < wb.length; i++) wakes.setColorAt(i, new THREE.Color(0, 0, 0)); }
  const lights = [];
  boats.forEach((b, bi) => { for (const l of b.K.info.lights) lights.push([bi, l[0], l[1], l[2], l[3]]); });
  const lp = new Float32Array(lights.length * 3), lc = new Float32Array(lights.length * 3);
  lights.forEach((l, i) => { lc.set(l[4], i * 3); });
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(lp, 3)); pg.setAttribute('color', new THREE.BufferAttribute(lc, 3));
  const halos = new THREE.Points(pg, M.halo); halos.name = 'ar32h:halos'; halos.frustumCulled = false; halos.renderOrder = 3;
  group.add(halos);
  // per-frame state (preallocated)
  const q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s1 = new THREE.Vector3(1, 1, 1), sc = new THREE.Vector3();
  const Ms = new THREE.Matrix4(), Mt = new THREE.Matrix4(), Mt2 = new THREE.Matrix4(), cW = new THREE.Color();
  // the fleet's clock starts at tOffset when it is built (a recorded take settles at dt 0 and warms up at 1/30 s, so
  // its first frame is at tOffset + warm-up / 30 s), then runs with the sim clock
  const tBuilt = ENV.time.value;
  let lastT = -1e9;
  const update = () => {
    const t = tAt !== null ? tAt : ENV.time.value - tBuilt + tOffset;
    if (t === lastT) return;
    lastT = t;
    let wi = 0;
    for (const b of boats) {
      const st = stateAt(b.S, t + b.ph, b.st), hd = st[2], v = st[3], K = b.K, sd = b.seed;
      // ferries on one route keep to their starboard side of it (they pass port to port, 20 m apart), from 90 m off a stop
      const off = b.kind === 'ferry' ? 10 * Math.min(1, st[4] / 90) : 0, x = st[0] - Math.sin(hd) * off, z = st[1] + Math.cos(hd) * off;
      const vr = b.S.v > 0 ? v / b.S.v : 0;
      let roll = 0.012 * Math.sin(0.55 * t + 2 * sd), pitch = 0.009 * Math.sin(0.71 * t + sd) + (b.kind === 'ferry' || b.kind === 'yacht' ? 0.011 * vr : 0);
      let sail = 0;
      if (b.kind === 'sloop') {
        const lee = WIND_TO[0] * -Math.sin(hd) + WIND_TO[1] * Math.cos(hd) > 0 ? 1 : -1;  // +1: the wind blows to starboard
        roll += lee * (0.07 + 0.12 * vr); sail = lee * 0.55;
      }
      const y = 0.04 * Math.sin(0.83 * t + sd);
      e.set(roll, -hd, pitch, 'YXZ'); q.setFromEuler(e); p.set(x, y, z);
      b.M.compose(p, q, s1);
      for (const m of K.meshes) m.setMatrixAt(b.slot, b.M);
      if (b.kind === 'sloop') {
        // the mainsail about the mast (x 1.4), the jib about its tack (x 5.4), each swung to leeward
        Mt.makeRotationY(sail); Ms.makeTranslation(1.4, 0, 0); Mt2.multiplyMatrices(Ms, Mt); Mt.multiplyMatrices(b.M, Mt2);
        K.main.setMatrixAt(b.slot, Mt);
        Mt.makeRotationY(sail * 0.55); Ms.makeTranslation(5.4, 0, 0); Mt2.multiplyMatrices(Ms, Mt); Mt.multiplyMatrices(b.M, Mt2);
        K.jib.setMatrixAt(b.slot, Mt);
      }
      if (K.info.wake && wakes) {
        const W = K.info.wake, ch = Math.cos(hd), sh = Math.sin(hd);
        e.set(0, -hd, 0, 'YXZ'); q.setFromEuler(e);
        p.set(x + ch * W.bow, 0.06, z + sh * W.bow); sc.set(W.len, 1, 2 * W.halfW);
        Mt.compose(p, q, sc); wakes.setMatrixAt(wi, Mt);
        cW.setRGB(Math.min(1, vr * (b.kind === 'tug' ? 0.8 : 1.0)), 0, 0); wakes.setColorAt(wi, cW);
        wi++;
      }
    }
    for (const K of Object.values(kinds)) { for (const m of K.meshes) m.instanceMatrix.needsUpdate = true; if (K.main) { K.main.instanceMatrix.needsUpdate = true; K.jib.instanceMatrix.needsUpdate = true; } }
    if (wakes) { wakes.instanceMatrix.needsUpdate = true; if (wakes.instanceColor) wakes.instanceColor.needsUpdate = true; }
    for (let i = 0; i < lights.length; i++) {
      const l = lights[i], me = boats[l[0]].M.elements, lx = l[1], ly = l[2], lz = l[3];
      lp[i * 3] = me[0] * lx + me[4] * ly + me[8] * lz + me[12];
      lp[i * 3 + 1] = me[1] * lx + me[5] * ly + me[9] * lz + me[13];
      lp[i * 3 + 2] = me[2] * lx + me[6] * ly + me[10] * lz + me[14];
    }
    pg.attributes.position.needsUpdate = true;
  };
  update();
  const first = kinds.ferry?.meshes[0] || Object.values(kinds)[0].meshes[0];
  first.onBeforeRender = update;
  first.onBeforeShadow = update;
  halos.onBeforeRender = update;
  return { boats: boats.length, tris, lights: lights.length, update, state: (i, out = [0, 0, 0, 0, 0]) => stateAt(boats[i].S, (tAt !== null ? tAt : ENV.time.value - tBuilt + tOffset) + boats[i].ph, out) };
}

// ---- the waterfront: the seawall's guardrail and the Hunters Point South ferry landing ---------------------------------
// A world-frame bin (x, y, z world) for the static pieces, merged per tile.
class WBin extends Bin {
  // a box along the segment a -> b (world x, z), from y0 to y1 over the ground at each end, w wide
  seg(ax, az, ay, bx, bz, by, y0, y1, w, col) {
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1, nx = -dz / L * w / 2, nz = dx / L * w / 2;
    const A0 = [ax - nx, ay + y0, az - nz], A1 = [ax + nx, ay + y0, az + nz], B0 = [bx - nx, by + y0, bz - nz], B1 = [bx + nx, by + y0, bz + nz];
    const A2 = [ax - nx, ay + y1, az - nz], A3 = [ax + nx, ay + y1, az + nz], B2 = [bx - nx, by + y1, bz - nz], B3 = [bx + nx, by + y1, bz + nz];
    this.quad(A2, B2, B3, A3, col); this.quad(A0, B0, B2, A2, col); this.quad(B1, A1, A3, B3, col);
    this.quad(A0, A2, A3, A1, col); this.quad(B0, B1, B3, B2, col);
    if (y0 > 0.05) this.quad(A0, A1, B1, B0, col);
    return this;
  }
  post(x, z, y, h, s, col) { return this.box(x - s / 2, x + s / 2, y, y + h, z - s / 2, z + s / 2, col); }
}
// the guardrail along the seawall, 0.45 m in from the edge: steel posts every 1.9 m, 1.07 m high (42 in, the guard height
// of the NYC Building Code), a timber cap rail and two steel rails; the segments whose middle lies in the tile
// groundAt(x, z) is the compiled esplanade's surface there or null; where the compiled ground stops short of the OSM
// edge (the terrain grid slopes to the water over its last cell) a segment's rail moves in to the ground's edge (the
// median of three samples, searched 0-8 m inland)
export function buildSeawallRail(group, line, ox, oz, groundAt, gap) {
  const B = new WBin();
  const steel = SRGB(0x3b4045), cap = SRGB(0x8a6a4a);
  const DS = [0, 0.75, 1.5, 2.5, 3.5, 5, 6.5, 8];
  let posts = 0;
  for (let i = 0; i + 1 < line.length; i++) {
    const [ax, az] = line[i], [bx, bz] = line[i + 1];
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz); if (L < 0.5) continue;
    const lx = dz / L, lz = -dx / L;                                                   // inland (the river on the right)
    const mx0 = (ax + bx) / 2, mz0 = (az + bz) / 2;
    if (mx0 < ox - 30 || mx0 >= ox + 542 || mz0 < oz - 30 || mz0 >= oz + 542) continue;
    const found = [];
    for (const t of [0.2, 0.5, 0.8]) {
      const sx = ax + dx * t + lx * 0.45, sz = az + dz * t + lz * 0.45;
      for (const d of DS) { const y = groundAt(sx + lx * d, sz + lz * d); if (y !== null && isFinite(y) && y > 2) { found.push(d); break; } }
    }
    if (!found.length) continue;
    found.sort((p, q) => p - q);
    const off = 0.45 + found[(found.length - 1) >> 1];
    const n = Math.max(1, Math.round(L / 1.9));
    let yPrev = null;
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n;
      const x0 = ax + dx * t0 + lx * off, z0 = az + dz * t0 + lz * off, x1 = ax + dx * t1 + lx * off, z1 = az + dz * t1 + lz * off;
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      if (mx < ox || mx >= ox + 512 || mz < oz || mz >= oz + 512) continue;
      if (gap && Math.hypot(mx - gap[0], mz - gap[1]) < gap[2]) continue;
      let y0 = groundAt(x0, z0), y1 = groundAt(x1, z1);
      if (y0 === null || !(y0 > 2)) y0 = yPrev ?? (y1 !== null && y1 > 2 ? y1 : null);
      if (y1 === null || !(y1 > 2)) y1 = y0;
      if (y0 === null || y1 === null || !isFinite(y0) || !isFinite(y1)) continue;
      yPrev = y1;
      B.post(x0, z0, y0, 1.07, 0.07, steel); posts++;
      if (k === n - 1) B.post(x1, z1, y1, 1.07, 0.07, steel);
      B.seg(x0, z0, y0, x1, z1, y1, 1.02, 1.1, 0.14, cap);
      B.seg(x0, z0, y0, x1, z1, y1, 0.72, 0.745, 0.03, steel);
      B.seg(x0, z0, y0, x1, z1, y1, 0.38, 0.405, 0.03, steel);
    }
  }
  if (!B.P.length) return 0;
  const m = new THREE.Mesh(B.geo(), mats().hull); m.name = 'ar32h:seawallRail'; m.castShadow = true; m.receiveShadow = true;
  group.add(m);
  return posts;
}
// the ferry landing: a gangway from the esplanade down to a steel float, the float with its fendering, rails and a
// canopy over the boarding end; the float's deck 1.1 m over the river
export function buildLanding(group, L, yShore) {
  const B = new WBin(), G = new WBin(), Lw = new WBin();
  const grey = SRGB(0x6f757a), deck = SRGB(0x8e9296), steel = SRGB(0x3b4045), white = SRGB(0xe8eaea), navy = SRGB(0x1d3257), rub = SRGB(0x151617);
  const [sx, sz] = L.shore, [fx0, fz0] = L.float0, [fx1, fz1] = L.float1;
  const yF = 1.1;
  // the float: a pontoon 9 m across the gangway's line, from float0 out 2 m past float1
  const ux = fx1 - fx0, uz = fz1 - fz0, uL = Math.hypot(ux, uz), ax = ux / uL, az = uz / uL;   // out along the landing
  const frame = (u, y, w) => [fx0 + ax * u - az * w, y, fz0 + az * u + ax * w];
  const u0 = -1.0, u1 = uL + 2.2, hw = L.floatW / 2;
  const P = (u, y, w) => frame(u, y, w);
  B.quad(P(u0, yF, -hw), P(u1, yF, -hw), P(u1, yF, hw), P(u0, yF, hw), deck);
  for (const [a, b] of [[[u0, -hw], [u1, -hw]], [[u1, -hw], [u1, hw]], [[u1, hw], [u0, hw]], [[u0, hw], [u0, -hw]]]) {
    B.quad(P(a[0], -0.4, a[1]), P(b[0], -0.4, b[1]), P(b[0], yF, b[1]), P(a[0], yF, a[1]), grey);
    const A = P(a[0], 0, a[1]), Bq = P(b[0], 0, b[1]);
    B.seg(A[0], A[2], 0, Bq[0], Bq[2], 0, 0.25, 0.95, 0.35, rub);                             // the rubber fender belt
  }
  // rails round the float except the boarding end (u1) and the gangway's landing
  const railSeg = (ua, wa, ub, wb) => { const A = P(ua, 0, wa), Bp = P(ub, 0, wb); B.seg(A[0], A[2], yF, Bp[0], Bp[2], yF, 1.0, 1.07, 0.06, steel); B.seg(A[0], A[2], yF, Bp[0], Bp[2], yF, 0.5, 0.53, 0.03, steel); B.post(A[0], A[2], yF, 1.07, 0.07, steel); B.post(Bp[0], Bp[2], yF, 1.07, 0.07, steel); };
  railSeg(u0, -hw + 0.1, u1 - 0.1, -hw + 0.1); railSeg(u0, hw - 0.1, u1 - 0.1, hw - 0.1); railSeg(u0 + 0.1, -hw + 0.1, u0 + 0.1, -1.8); railSeg(u0 + 0.1, 1.8, u0 + 0.1, hw - 0.1);
  // the canopy: four posts and a white roof with a navy fascia over the boarding end
  const c0 = u1 - 6.2, c1 = u1 - 0.4, cw = hw - 0.6, yR = yF + 3.0;
  for (const [u, w] of [[c0, -cw], [c1, -cw], [c0, cw], [c1, cw]]) { const p = P(u, 0, w); B.post(p[0], p[2], yF, 3.0, 0.16, white); }
  B.quad(P(c0 - 0.5, yR + 0.25, -cw - 0.5), P(c1 + 0.5, yR + 0.25, -cw - 0.5), P(c1 + 0.5, yR + 0.25, cw + 0.5), P(c0 - 0.5, yR + 0.25, cw + 0.5), white);
  B.quad(P(c0 - 0.5, yR, -cw - 0.5), P(c0 - 0.5, yR, cw + 0.5), P(c1 + 0.5, yR, cw + 0.5), P(c1 + 0.5, yR, -cw - 0.5), SRGB(0xd0d3d4));
  for (const [a, b] of [[[c0 - 0.5, -cw - 0.5], [c1 + 0.5, -cw - 0.5]], [[c1 + 0.5, -cw - 0.5], [c1 + 0.5, cw + 0.5]], [[c1 + 0.5, cw + 0.5], [c0 - 0.5, cw + 0.5]], [[c0 - 0.5, cw + 0.5], [c0 - 0.5, -cw - 0.5]]]) B.quad(P(a[0], yR - 0.05, a[1]), P(b[0], yR - 0.05, b[1]), P(b[0], yR + 0.3, b[1]), P(a[0], yR + 0.3, a[1]), navy);
  // lamps under the canopy (lit after dark)
  for (const w of [-cw * 0.5, cw * 0.5]) { const p = P((c0 + c1) / 2, 0, w); Lw.box(p[0] - 0.5, p[0] + 0.5, yR - 0.12, yR - 0.02, p[2] - 0.12, p[2] + 0.12, COL.lampW); }
  // the gangway: from the esplanade's edge down to the float, 2.4 m wide, side trusses with a rail
  const gx0 = sx, gz0 = sz, gx1 = fx0 + ax * u0, gz1 = fz0 + az * u0;
  B.seg(gx0, gz0, yShore, gx1, gz1, yF, -0.25, 0.05, 2.4, deck);
  for (const sg of [-1, 1]) {
    const gl = Math.hypot(gx1 - gx0, gz1 - gz0), nx = -(gz1 - gz0) / gl * 1.25 * sg, nz = (gx1 - gx0) / gl * 1.25 * sg;
    B.seg(gx0 + nx, gz0 + nz, yShore, gx1 + nx, gz1 + nz, yF, 0.0, 0.35, 0.08, steel);
    B.seg(gx0 + nx, gz0 + nz, yShore, gx1 + nx, gz1 + nz, yF, 1.0, 1.08, 0.07, steel);
    const n = 6;
    for (let k = 0; k <= n; k++) { const t = k / n, x = gx0 + (gx1 - gx0) * t + nx, z = gz0 + (gz1 - gz0) * t + nz, y = yShore + (yF - yShore) * t; B.post(x, z, y, 1.08, 0.06, steel); }
  }
  const M = mats();
  const add = (bin, mat, name, sh = true) => { if (!bin.P.length) return 0; const m = new THREE.Mesh(bin.geo(), mat); m.name = 'ar32h:' + name; m.castShadow = sh; m.receiveShadow = sh; group.add(m); return bin.P.length / 9; };
  const tris = add(B, M.hull, 'landing') + add(G, M.glass, 'landingGlass') + add(Lw, M.glow, 'landingLamps', false);
  return { tris, yF };
}
