// BP31 — Bryant Park's physical detail (owner 2026-09-28: "We need much higher quality and realism for Bryant Park and
// Times Square there are no details, no sitting people on chairs, etc. it's extremely barebones", and after the first
// pass: "Bryant Park looks terrible. Please look online for reference shots ... and create it in a detailed way").
// Built to the park's measured plan (docs/notes/bryant-park.md "Reference facts"): OpenStreetMap maps it feature by feature
// (the lawn, every bed, wall, flight of steps and tree), the Landmarks Preservation Commission's 1974 report and the
// designers' own descriptions give the forms and materials. In the BP28 park frame (u along 42nd St from the Sixth
// Avenue line, v from 40th St toward 42nd), the real park is:
//   * a central lawn u 36.8-124.4 x v 43.1-97.6, its west end cut by an arc of radius 20.2 m round the Lowell fountain
//     (29.4, 70.6), ringed by a gravel walk, flower borders behind granite curbs and a 1 m balustraded wall (v 34.9 /
//     106.4) with openings at u 54-58 and 90.6-94.5 (BP28 had the fountain at u 15 and a 90 x 44 m lawn);
//   * on each side two gravel walks under the plane allees (v 31.1-34.9 and 17-21.3 south, 106.4-110.2 and 120-124.3
//     north) separated by ivy beds with the planes in them, a crushed-gravel panel in the middle of each (the carousel's
//     to the south), and planted beds along the street walls;
//   * the fountain in a raised flagstone plaza that faces the lawn with a half-disc of radius 13.1 m;
//   * the Upper Terrace behind: the central plaza 6 steps up (a broad flight across v 55.5-86.3), the Bryant memorial's
//     court and the cafe's timber deck 3 steps higher, the Grill at the level of the park on the terrace's south part;
//   * the four kiosks, Le Carrousel, the statues, the restroom, the ping-pong tables and the petanque court where OSM has
//     them, and the 419 trees OSM maps one by one (city/bryantParkData.js).
// Everything is merged per material (granite, the memorial's marble, painted metal, glass, matte, foliage, glow: seven
// meshes for the park); the chairs and tables are instanced by the caller. Parts are built in the park frame and mapped onto the world through the
// frame's own affine map (bpWorld): its axes are 0.15 deg off square, and a rotated box would drift 0.3 m in 120 m.
import * as THREE from 'three';
import { ENV, applyLightTrim, applyCityAO, applyStoneDetail, applySkyGlass } from '../world/materials.js';
import { BP_TREES_DM } from './bryantParkData.js';
import { COLLIDERS } from './colliders.js';

// Walker obstacles (the lead's sim/peds.js reads the 'kit31' key, like the campus kit's): every solid piece a walker
// should go round, as boxes collected in the park frame on the first build and registered once per page (the tile's own
// colliders are dropped with it; these are not). [u, v, hw (along the piece's local u), hd, y0 above the ground, h, a]
let COLL = null, _collDone = false;
const coll = (u, v, hw, hd, y0, h, a = 0) => { if (COLL) COLL.push([u, v, hw, hd, y0, h, a]); };
// a round piece of radius R as four boxes 2R x 0.83R at 0/45/90/135 deg: their union is the regular octagon round the
// circle (its flats R out, its corners 1.08 R), where a square and a 45 deg square reach 1.41 R on eight points (the
// carousel's reached 0.8 m into the south allee's walkers' lane)
const collRound = (u, v, R, y0, h) => { for (let k = 0; k < 4; k++) coll(u, v, R, R * Math.tan(Math.PI / 8), y0, h, k * Math.PI / 4); };

// ---- the plan (park-frame metres, from the OSM features; see the notes for the ids) ---------------------------------
export const FOUNT31 = [29.4, 70.6];
export const LAWN31 = { u0: 36.8, u1: 124.4, v0: 43.1, v1: 97.6, arcR: 20.2 };
export const FPLAZA = { u0: 6.2, u1: 31.1, v0: 51.2, v1: 90.1, r: 13.1, h: 0.3 };        // raised two steps
const BORDER_V = [[35.4, 39.5], [101.9, 105.9]], BORDER_U = [[32.1, 53.9], [58.3, 90.5], [94.5, 124.4]];
const ENCL = { vS: 34.9, vN: 106.4, u0: 31.4, u1: 128.3, gaps: [[54.0, 58.1], [90.6, 94.5]] };
export const WALK_LINES = [{ v: 19.15, u0: 6.5, u1: 131 }, { v: 33.0, u0: 31.5, u1: 128 }, { v: 108.3, u0: 31.5, u1: 128 }, { v: 122.15, u0: 20, u1: 131 }];
// ivy beds with the planes in them (and the planted beds along the walls), from the OSM leisure=garden outlines
const BEDS = [
  [5.5, 26.4, 2.5, 6.2], [30.8, 56.2, 3.0, 6.2], [70.8, 117.5, 2.7, 6.1],                    // along 40th St
  [6.2, 26.4, 8.5, 17.0], [30.8, 38.9, 8.4, 17.0], [45.3, 53.8, 8.4, 17.0], [72.7, 90.1, 8.4, 16.9], [94.5, 117.5, 8.3, 16.8],
  [58.3, 60.5, 8.4, 11.1], [66.2, 68.4, 8.4, 11.1], [58.3, 60.5, 14.2, 16.9], [66.2, 68.4, 14.2, 16.9],
  [6.2, 13.5, 21.4, 35.3], [16.7, 26.5, 21.4, 35.5], [30.8, 53.8, 21.3, 31.1], [94.5, 117.5, 21.2, 31.0], [121.1, 131.8, 21.2, 31.0],
  [0.55, 3.1, 9.4, 59.6], [0.55, 2.8, 81.2, 118.0], [0.55, 13.5, 117.4, 120.0],                 // along Sixth Ave
  [6.2, 8.8, 55.7, 57.9], [11.0, 13.5, 55.7, 57.9], [6.2, 8.8, 83.3, 85.6], [11.0, 13.5, 83.3, 85.5],
  [16.8, 26.5, 90.1, 100.3], [16.8, 19.3, 104.2, 106.4], [23.7, 26.3, 104.2, 106.4],
  [16.8, 26.5, 110.3, 120.1], [30.9, 53.9, 110.3, 120.0], [94.6, 117.6, 110.2, 119.9], [121.2, 132.0, 110.1, 119.9],
  [19.0, 26.5, 124.5, 139.9], [71.0, 98.3, 124.3, 139.9], [98.3, 111.8, 124.3, 135.4], [111.8, 117.6, 124.3, 139.9], [121.2, 130.1, 124.3, 139.9],
  [31.7, 55.9, 134.7, 139.9], [58.3, 60.6, 124.4, 127.1], [66.3, 68.5, 124.4, 127.1], [58.3, 60.6, 130.2, 132.9], [66.3, 68.5, 130.2, 132.9],
  [138.3, 141.1, 132.1, 139.9], [150.0, 165.5, 132.0, 139.9],
];
const PANELS = [[58.5, 90.1, 21.5, 30.8], [58.6, 89.9, 110.5, 119.8]];                        // crushed gravel under planes
// the Upper Terrace: the central plaza and the north terrace 6 steps (0.9 m) up, the memorial court and the cafe's deck
// 3 steps higher; the broad stair on the axis and the north allee's flight cut into the plaza's face
const RISE = 0.15, TREAD = 0.34, NSTEP = 6, RUN = NSTEP * TREAD, TER = { h: 0.9 }, EW = 4.4;   // flight() and gatePiers() read these
export const TZ = {
  plaza: { u0: 131.5, u1: 150.3, v0: 48.8, v1: 92.0, h: 0.9 },
  north: { u0: 132.0, u1: 150.6, v0: 92.0, v1: 130.4, h: 0.9 },
  court: { u0: 150.3, u1: 165.6, v0: 58.4, v1: 84.2, h: 1.35 },
  deck: { u0: 150.3, u1: 165.6, v0: 84.2, v1: 128.6, h: 1.35 },
};
const BROAD = { v0: 55.5, v1: 86.3 }, NFLIGHT = { v0: 120.0, v1: 124.3 }, STFLIGHT = { u0: 141.4, u1: 149.7 };
const MEM31 = { u: 155.6, v: 71.4 };
const GRILL31 = [[151.4, 165.5, 22.6, 49.1], [152.9, 165.5, 49.1, 55.3], [155.9, 165.5, 55.3, 58.0], [149.3, 151.4, 25.0, 29.7]];
const KIOSK31 = [{ u: 42.1, v: 13.1, w: 4.6, d: 4.8, a: 0 }, { u: 2.95, v: 126.35, w: 3.9, d: 3.7, a: Math.PI / 2 }, { u: 9.25, v: 132.8, w: 3.9, d: 3.8, a: Math.PI }, { u: 1.8, v: 6.2, w: 5.0, d: 5.0, a: Math.PI / 4 }];
const CAROUSEL31 = { u: 74.9, v: 25.1, r: 3.35 };
const GOETHE31 = { u: 86.6, v: 25.3 }, DODGE31 = { u: 98.3, v: 119.5 }, STEIN31 = { u: 136.3, v: 39.8 }, BONIF31 = { u: 1.7, v: 21.5 };
const RESTROOM31 = { u0: 132.1, u1: 138.3, v0: 130.4, v1: 138.6 }, HOUSE40 = { u0: 130.0, u1: 135.9, v0: -0.75, v1: 7.2 };
const PING31 = [{ u: 34.9, v: 129.1 }, { u: 47.1, v: 129.1 }];
const PETANQUE = [6.4, 13.3, 90.6, 112.2], PUTTING = [6.7, 13.0, 35.9, 50.6], PORCH = [20.2, 23.3, 42.9, 47.0];
const GAZEBO = { u: 146.6, v: 62.2 };
// the reading room's carts on the north gravel panel by the middle 42nd St entrance, chess tables by the ping-pong
const READING = { u0: 64, u1: 80, v0: 113.2, v1: 119.2 };
const CHESS = [{ u: 37.2, v: 125.6 }, { u: 40.4, v: 125.6 }, { u: 43.6, v: 125.6 }, { u: 46.8, v: 125.6 }, { u: 50.0, v: 125.6 }];
// the streets' walls (granite, an iron railing on top) and their entrances; 42nd St's runs on the sidewalk's edge
// (NV: the compiled sidewalk starts 2.2 m past the park line there, over bare terrain)
const NV = 140.05, SV = 2.1, WU = 0.3;
const WALLS40 = [[3.9, 26.5], [30.6, 56.2], [70.8, 117.5], [121.2, 129.6]];
const WALLS42 = [[18.4, 26.1], [31.5, 55.9], [70.9, 98.5], [111.6, 117.5], [121.2, 131.7], [150.0, 165.5]];
const WALLS6 = [[9.0, 60.3], [80.8, 117.0]];
const GATES40 = [28.55, 63.5, 119.35], GATES42 = [28.8, 63.4, 119.35];
// the middle entrances are 15 m wide (the walls stop at u 56 and 71): piers with urns at the wall ends, no gate leaves
const MID40 = [56.2, 70.8], MID42 = [55.9, 70.9];

// the ground under it all, for bpApply's re-kind (park-frame convex polygons): flagstone (the city's sidewalk kind),
// gravel, and what stays grass (the lawn and the beds, under their planting)
function rectP(u0, u1, v0, v1) { return [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]; }
function arcHalf(c, r, n = 24) { const out = []; for (let k = 0; k <= n; k++) { const a = -Math.PI / 2 + Math.PI * k / n; out.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]); } return out; }
export function bp31Ground() {
  const L = LAWN31, F = FOUNT31;
  const flag = [
    rectP(0, 165.7, 0, SV), rectP(0, 6.2, 60.3, 80.8), rectP(56.2, 70.8, SV, 8.4), rectP(55.9, 70.9, 132.9, 138.1),
    rectP(-0.4, 18.0, 120.5, 138.1), rectP(30.9, 53.9, 124.4, 132.9), rectP(98.3, 111.8, 135.4, 138.1),
    rectP(132.0, 165.7, SV, 20.3), rectP(141.0, 165.7, 20.3, 48.8), rectP(132.0, 134.8, 20.3, 48.8), rectP(131.5, 165.7, 48.8, 138.1),
    rectP(32.1, 124.4, 39.5, 40.4), rectP(32.1, 124.4, 101.0, 101.9),                              // flagstone strips by the borders
    [...arcHalf(F, FPLAZA.r + 0.2)], rectP(FPLAZA.u0 - 0.2, F[0], FPLAZA.v0 - 0.2, FPLAZA.v1 + 0.2),
  ];
  const lawn = [rectP(49.6, L.u1, L.v0, L.v1)];
  // the two horns west of the arc's apex, as thin trapezoids (each convex)
  for (let u = L.u0; u < 49.6 - 1e-6;) {
    const u2 = Math.min(49.6, u + 1.6), off = (x) => Math.sqrt(Math.max(0, L.arcR * L.arcR - (x - F[0]) ** 2));
    lawn.push([[u, L.v0], [u2, L.v0], [u2, F[1] - off(u2)], [u, F[1] - off(u)]]);
    lawn.push([[u, F[1] + off(u)], [u2, F[1] + off(u2)], [u2, L.v1], [u, L.v1]]);
    u = u2;
  }
  const beds = BEDS.map((b) => rectP(...b)).concat(BORDER_V.flatMap(([v0, v1]) => BORDER_U.map(([u0, u1]) => rectP(u0, u1, v0, v1))));
  const gravel = [rectP(0.2, 131.5, 0.2, 138.1), rectP(134.8, 141.0, 20.3, 48.8)];
  return { flag, lawn, beds, gravel };
}

// ---- colours: sRGB albedo on the landmarks' scale (applyLightTrim takes them to 0.30 by day) -----------------------
const K = (hex) => new THREE.Color(hex);
const COL = {
  granite: K(0xa19b90), graniteD: K(0x8c867b), graniteW: K(0xb4ada0), lime: K(0xcdc4b0), limeD: K(0xb9b09c),
  paveT: K(0xa9a49a), coping: K(0xbab3a5), marble: K(0xe2ded4), marbleD: K(0xcdc8bc), pink: K(0xb88e76), pinkD: K(0x9a7462),
  blackG: K(0x2a2b2c), gravel: K(0x8f8a80),
  green: K(0x223d2e), greenD: K(0x19301f), greenL: K(0x2e5040), iron: K(0x1e201f), ironD: K(0x141615), steel: K(0x6f777c),
  bronze: K(0x3b3326), bronzeG: K(0x3a4234), brass: K(0xa0844a), white: K(0xe6e2d8), urn: K(0xd9d4c8),
  glass: K(0x3a4248), glassW: K(0x4a4a42),
  canvas: K(0xe4ddca), canvasG: K(0x2f5a44), canvasS: K(0xc9c1ab), woodL: K(0x9a7650), ipe: K(0xa0968a), ipeD: K(0x877e72),
  deck: K(0x8a6e52), deckD: K(0x76604a), teal: K(0x5592a0), tealD: K(0x2c6068), gold: K(0xb89a50),
  red: K(0x8e2a26), ppTop: K(0x1f5a78), ppLine: K(0xe8e8e4), chessL: K(0xd9d2c0), chessD: K(0x2a2a26), turf: K(0x3f7a38),
  roofCu: K(0x3f5a48), slate: K(0x4a4e52), books: [K(0x8a2d2a), K(0x2d4a7a), K(0xc8b27a), K(0x2e6a48), K(0x6a4a7a), K(0xd8d2c4)],
  marbleC: K(0xb9b3a7),
  leafIvy: K(0x86a078), leafBox: K(0xc6d6a0), leafMix: K(0xb4c89c), leafShrub: K(0xa8bf92), leafCone: K(0x7d9870),
  // the borders' foliage in the references is the brightest green in the park (sunlit perennials, fresh shrubs); on the
  // dark leaf texture that takes a vertex colour over 1 (linear), ~1.9x the plain mix. v4 stills: the ivy read as black
  // mats and the clipped cones as black spikes, where ref7 and ref3 show them dark green: x1.45 and (v5, still black
  // in the allee's shade) x2.2
  leafBorder: new THREE.Color(0.86, 1.08, 0.58), leafBorderS: new THREE.Color(0.6, 0.8, 0.42),
  leafIvyB: new THREE.Color(0.345, 0.51, 0.267), leafConeB: new THREE.Color(0.46, 0.7, 0.34),
  // late-summer perennials (linear, every channel over 0.03 for the flower material's divide): coneflower, rudbeckia,
  // salvia, pink phlox (no white: a white drift read as litter in teaser 3's skim), bee balm, heliopsis, catmint
  flowers: [new THREE.Color(0.75, 0.2, 0.4), new THREE.Color(0.85, 0.58, 0.05), new THREE.Color(0.33, 0.17, 0.68), new THREE.Color(0.9, 0.5, 0.66),
    new THREE.Color(0.72, 0.07, 0.08), new THREE.Color(0.9, 0.42, 0.07), new THREE.Color(0.4, 0.42, 0.85)],
  glowW: K(0xfff0d8), glowY: K(0xffd48a),
};

// ---- the merge bin: parts are built in the park frame (u = x, y up, v = z) and mapped onto the world at the end ----
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
function M(o) {
  _e.set(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ'); _q.setFromEuler(_e);
  _p.set(o.u || 0, o.y || 0, o.v || 0); _s.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1);
  return new THREE.Matrix4().compose(_p, _q, _s);
}
const _tpl = new Map();
function tpl(key, make, inv = false) {
  const k = inv ? key + '|inv' : key;
  let g = _tpl.get(k);
  if (!g) {
    g = make(); if (g.index) g = g.toNonIndexed(); if (!g.attributes.normal) g.computeVertexNormals();
    if (inv) {                                                     // seen from inside: reversed winding, normals in
      const p = g.attributes.position.array, n = g.attributes.normal.array;
      for (let i = 0; i < p.length; i += 9) for (let c = 0; c < 3; c++) { const a = i + 3 + c, b = i + 6 + c; let t = p[a]; p[a] = p[b]; p[b] = t; t = n[a]; n[a] = n[b]; n[b] = t; }
      for (let i = 0; i < n.length; i++) n[i] = -n[i];
    }
    _tpl.set(k, g);
  }
  return g;
}
const ORD = [0, 3, 6], ORD_F = [0, 6, 3];
class Bin {
  constructor(o = {}) { this.P = new Float32Array(3 << 16); this.N = new Float32Array(3 << 16); this.C = new Float32Array(3 << 16); this.n = 0; this.uv = !!o.uv; this.stack = [new THREE.Matrix4()]; }
  // room for k more vertices (typed arrays doubled as they fill: a whole park is ~2M vertices)
  grow(k) {
    if ((this.n + k) * 3 <= this.P.length) return;
    let L = this.P.length; while ((this.n + k) * 3 > L) L *= 2;
    for (const key of ['P', 'N', 'C']) { const a = new Float32Array(L); a.set(this[key].subarray(0, this.n * 3)); this[key] = a; }
  }
  push(u, y, v, a = 0) { this.stack.push(this.top().clone().multiply(new THREE.Matrix4().makeRotationY(a).setPosition(u, y, v))); return this; }
  pop() { this.stack.pop(); return this; }
  top() { return this.stack[this.stack.length - 1]; }
  // a template at the local transform o; colour c (a THREE.Color, or (triangle index) -> Color)
  add(g, o, c) {
    const m = this.top().clone().multiply(M(o || {}));
    const p = g.attributes.position.array, n = g.attributes.normal.array;
    const e = m.elements, f = new THREE.Matrix3().getNormalMatrix(m).elements;
    const ord = m.determinant() < 0 ? ORD_F : ORD;
    const cf = typeof c === 'function';
    this.grow(p.length / 3);
    const P = this.P, N = this.N, C = this.C;
    let w = this.n * 3;
    for (let i = 0; i < p.length; i += 9) {
      const cc = cf ? c(i / 9) : c;
      for (let q = 0; q < 3; q++) {
        const j = i + ord[q], x = p[j], y = p[j + 1], z = p[j + 2];
        P[w] = e[0] * x + e[4] * y + e[8] * z + e[12]; P[w + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]; P[w + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        const nx = n[j], ny = n[j + 1], nz = n[j + 2];
        const ax = f[0] * nx + f[3] * ny + f[6] * nz, ay = f[1] * nx + f[4] * ny + f[7] * nz, az = f[2] * nx + f[5] * ny + f[8] * nz;
        const l = Math.sqrt(ax * ax + ay * ay + az * az) || 1;
        N[w] = ax / l; N[w + 1] = ay / l; N[w + 2] = az / l;
        C[w] = cc.r; C[w + 1] = cc.g; C[w + 2] = cc.b;
        w += 3;
      }
    }
    this.n = w / 3;
    return this;
  }
  box(w, h, d, c, o = {}) { return this.add(tpl('box', () => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)), { ...o, sx: w, sy: h, sz: d }, c); }
  cyl(rt, rb, h, c, o = {}) {
    const seg = o.seg || 8;
    return this.add(tpl(`cyl${(rt / rb).toFixed(3)}|${seg}|${o.open ? 1 : 0}`, () => new THREE.CylinderGeometry(rt / rb, 1, 1, seg, 1, !!o.open).translate(0, 0.5, 0)),
      { ...o, sx: rb * (o.sx ?? 1), sy: h, sz: rb * (o.sz ?? 1) }, c);
  }
  sphere(r, c, o = {}) {
    const s = o.seg || 8;
    return this.add(tpl(`sph${s}`, () => new THREE.SphereGeometry(1, s, Math.max(3, s >> 1))), { ...o, sx: r * (o.sx ?? 1), sy: r * (o.sy ?? 1), sz: r * (o.sz ?? 1) }, c);
  }
  lathe(key, pts, c, o = {}) { const s = o.seg || 10; return this.add(tpl('lathe' + key + s, () => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), s)), o, c); }
  // a round bar from a to b (points in the current frame), radius r
  tube(a, b, r, c, seg = 6) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz);
    if (L < 1e-4) return this;
    const g = tpl(`tube${seg}`, () => new THREE.CylinderGeometry(1, 1, 1, seg, 1, true).translate(0, 0.5, 0));
    const m = new THREE.Matrix4().compose(new THREE.Vector3(a[0], a[1], a[2]), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / L, dy / L, dz / L)), new THREE.Vector3(r, L, r));
    this.stack.push(this.top().clone().multiply(m)); this.add(g, {}, c); this.stack.pop();
    return this;
  }
  // a closed polygon in the local (x, y) plane extruded `len` along local z (centred)
  prism(key, pts, len, c, o = {}) {
    return this.add(tpl('prism' + key, () => new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))), { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5)), { ...o, sz: len }, c);
  }
  get tris() { return this.n / 3; }
  // onto the world: (u, y, v) -> (x, y0 + y, z) by the park's affine map. The map is a mirror (u x v points up), so
  // each triangle's winding is reversed and the normals go through the inverse transpose.
  build(F, y0, mat, name, o = {}) {
    const n = this.n;
    if (!n) return null;
    const P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3), T = this.uv ? new Float32Array(n * 2) : null;
    const { SW, U, V } = F, det = U[0] * V[1] - V[0] * U[1];
    const sc = 1 / (o.uvM || 1.3), sP = this.P, sN = this.N, sC = this.C;
    const a0 = SW[0], a1 = SW[1], u0 = U[0], u1 = U[1], v0 = V[0], v1 = V[1];
    for (let t = 0; t < n; t += 3) {
      for (let k = 0; k < 3; k++) {
        const s3 = (t + (k === 0 ? 0 : 3 - k)) * 3, d3 = (t + k) * 3;
        const u = sP[s3], y = sP[s3 + 1], v = sP[s3 + 2];
        P[d3] = a0 + u0 * u + v0 * v; P[d3 + 1] = y0 + y; P[d3 + 2] = a1 + u1 * u + v1 * v;
        const nu = sN[s3], ny = sN[s3 + 1], nv = sN[s3 + 2];
        const nx = (v1 * nu - u1 * nv) / det, nz = (-v0 * nu + u0 * nv) / det, l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        N[d3] = nx / l; N[d3 + 1] = ny / l; N[d3 + 2] = nz / l;
        C[d3] = sC[s3]; C[d3 + 1] = sC[s3 + 1]; C[d3 + 2] = sC[s3 + 2];
      }
      if (T) {
        // planar projection on the triangle's dominant world axis (the park frame's u/v on tops, world-aligned on sides)
        const ax = Math.abs(N[t * 3] + N[t * 3 + 3] + N[t * 3 + 6]), ay = Math.abs(N[t * 3 + 1] + N[t * 3 + 4] + N[t * 3 + 7]), az = Math.abs(N[t * 3 + 2] + N[t * 3 + 5] + N[t * 3 + 8]);
        for (let k = 0; k < 3; k++) {
          const d = t + k, x = P[d * 3], y = P[d * 3 + 1], z = P[d * 3 + 2];
          const a = ay >= ax && ay >= az ? x : ax >= az ? z : x, b = ay >= ax && ay >= az ? z : y;
          T[d * 2] = a * sc; T[d * 2 + 1] = b * sc;
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    g.setAttribute('color', new THREE.BufferAttribute(C, 3));
    if (T) g.setAttribute('uv', new THREE.BufferAttribute(T, 2));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat);
    m.name = name; m.castShadow = o.cast !== false; m.receiveShadow = true;
    return m;
  }
}

// ---- materials: one each, shared by every build -------------------------------------------------------------------
const MATS = {};
function leafTexture() {
  // clipped foliage seen from 2-60 m: overlapping small leaves in six greens over a dark ground
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const c = cv.getContext('2d');
  c.fillStyle = '#1b2b15'; c.fillRect(0, 0, S, S);
  let seed = 31;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const greens = ['#2f4a25', '#3a5a2c', '#476b34', '#56793d', '#3f5e33', '#6a8a48'];
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * S, y = rnd() * S, r = 2.2 + rnd() * 4.2, a = rnd() * Math.PI;
    c.fillStyle = greens[(rnd() * greens.length) | 0];
    for (const [ox, oy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) { c.beginPath(); c.ellipse(x + ox, y + oy, r, r * 0.55, a, 0, Math.PI * 2); c.fill(); }
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
// the flower mask, 1.6 m to a repeat (6 mm a texel): ~1500 heads of 3-7 cm, each with a darker eye, over leaf shading
function flowerMask() {
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const c = cv.getContext('2d');
  c.fillStyle = 'rgb(0, 110, 0)'; c.fillRect(0, 0, S, S);
  let seed = 131;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const blob = (x, y, rx, ry, a, style) => { c.fillStyle = style; for (const [ox, oy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) { c.beginPath(); c.ellipse(x + ox, y + oy, rx, ry, a, 0, Math.PI * 2); c.fill(); } };
  for (let i = 0; i < 900; i++) blob(rnd() * S, rnd() * S, 3 + rnd() * 6, 2 + rnd() * 3, rnd() * 3.1, `rgb(0, ${(40 + rnd() * 170) | 0}, 0)`);
  for (let i = 0; i < 1500; i++) {
    const x = rnd() * S, y = rnd() * S, rr = 2.5 + rnd() * 3.5;
    blob(x, y, rr, rr * (0.75 + rnd() * 0.25), rnd() * 3.1, `rgb(255, 90, ${(110 + rnd() * 145) | 0})`);
    blob(x, y, rr * 0.32, rr * 0.32, 0, 'rgb(255, 40, 30)');
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; t.anisotropy = 8;
  return t;
}
// three.js gives one compiled program to every material whose cache key matches, and applyLightTrim / applyCityAO build
// theirs from the source text of the wrapper they wrap, which is the same for every material: the stone, the metal and
// the matte material had one key (checked in Node: 4023 identical characters), so whichever compiled first lent the
// others its shader, granite speckle and joints on the lamps and umbrellas. The materials that carry their own shader
// code say their name in the key.
const own = (m, k) => { const f = m.customProgramCacheKey.bind(m); m.customProgramCacheKey = () => f() + '|bp31' + k; return m; };
export function kitMats() {
  if (MATS.stone) return MATS;
  const std = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, ...o });
  // granite and limestone: the campus stone detail (the fountain's and the library's sets), vertex-tinted per part; the
  // ashlar term gives the decks their flagstone joints and the walls their coursing (0.9: the v3 stills showed the
  // terrace as one pale sheet at 20-40 m, where the references show its grey flags)
  MATS.stone = own(applyLightTrim(applyCityAO(applyStoneDetail(std({ roughness: 0.84, metalness: 0.0 }), 'cgranite',
    { amt: 0.6, nrm: 0.6, rgh: 0.35, scale: 0.8, ashlar: 0.9 }))), 'stone');
  // the Bryant memorial's white marble (Carrere & Hastings used it for the arch, the rotunda and the pedestal): finer and
  // smoother than the park's granite, jointed in blocks; the limestone set at a fifth of its strength gives a faint grain
  MATS.marble = own(applyLightTrim(applyCityAO(applyStoneDetail(std({ roughness: 0.5, metalness: 0.0 }), 'climestone',
    { amt: 0.2, nrm: 0.25, rgh: 0.2, scale: 1.0, ashlar: 0.45 }))), 'marble');
  // painted steel and cast iron (enamel over steel is a dielectric: a sheen, not a mirror), the bronzes
  MATS.metal = applyLightTrim(applyCityAO(std({ roughness: 0.46, metalness: 0.25 })));
  MATS.matte = applyLightTrim(applyCityAO(std({ roughness: 0.86, metalness: 0.0 })));
  MATS.leaf = applyLightTrim(applyCityAO(std({ map: leafTexture(), roughness: 0.9, metalness: 0.0 })));
  // the borders' flowers: a data mask (R the flower heads, G the leaves' shading, B the petals' shade) mixes each drift's
  // vertex colour over a leaf green; divided back by the vertex colour, which three multiplies in after the map
  const fm = std({ map: flowerMask(), roughness: 0.82, metalness: 0.0 });
  fm.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#ifdef USE_MAP
      vec4 fm31 = texture2D( map, vMapUv );
      vec3 leaf31 = vec3( 0.05, 0.095, 0.028 ) * ( 0.5 + 1.0 * fm31.g );
      vec3 flw31 = vColor.rgb * ( 0.62 + 0.5 * fm31.b );
      diffuseColor.rgb *= mix( leaf31, flw31, fm31.r ) / max( vColor.rgb, vec3( 0.03 ) );
    #endif`);
  };
  fm.customProgramCacheKey = () => 'bp31flower';
  MATS.flower = own(applyLightTrim(applyCityAO(fm)), 'flower');
  // glazing: the landmarks' analytic sky mirror over a dark interior, lit from inside after dark
  const gl = std({ roughness: 0.08, metalness: 0.05 });
  gl.onBeforeCompile = (sh) => {
    sh.uniforms.bpNight = ENV.night;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float bpNight;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vec3(1.0, 0.72, 0.42) * smoothstep(0.2, 0.8, bpNight) * 0.55;');
  };
  gl.customProgramCacheKey = () => 'bp31glass';
  MATS.glass = own(applyLightTrim(applySkyGlass(gl, { f0: 0.09, rough: 0.05, tint: [0.95, 0.97, 1.0] })), 'glass');
  // lamp globes and bulbs: the street lamps' glow curve (instancer.js glowMat). By day a milk-glass globe is lit only by
  // the sky: 0.34 (v3) and 0.2 (v4) still read as lit bulbs beside the sunlit stone; 0.1, a third its colour by day
  const gw = new THREE.MeshBasicMaterial({ vertexColors: true });
  gw.onBeforeCompile = (sh) => {
    sh.uniforms.night = ENV.night;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float night;')
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n gl_FragColor.rgb = mix(vec3(dot(gl_FragColor.rgb, vec3(0.3, 0.45, 0.25)) * 1.06), gl_FragColor.rgb, 0.35 + 0.65 * clamp(night * 1.6, 0.0, 1.0)) * (0.1 + night * 2.64);');
  };
  gw.customProgramCacheKey = () => 'bp31glow2';
  MATS.glow = gw;
  return MATS;
}

// ---- noise, and the foliage masses ---------------------------------------------------------------------------------
const h1 = (a, b = 0, c = 0) => { const s = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453; return s - Math.floor(s); };
function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }
// a lumpy mass: a subdivided box (w x h x d, base on y 0) whose upper vertices a two-octave noise pushes out, the top
// edges rounded, soft normals. Fixed size per key: scale it with sx/sy/sz. Three variants per key break the repeat.
function lumpy(w, h, d, amp, key, cell = 0.3, variant = 0) {
  const vr = (((variant | 0) % 3) + 3) % 3;
  return tpl(`lumpy${key}|${vr}`, () => {
    const g = new THREE.BoxGeometry(w, h, d, Math.max(1, Math.round(w / cell)), Math.max(1, Math.round(h / cell)), Math.max(1, Math.round(d / cell)));
    g.translate(0, h / 2, 0);
    const p = g.attributes.position, o = vr * 17.3;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      if (y < 0.02) continue;
      const k = (h1(x * 1.9 + o, y * 1.9, z * 1.9) - 0.5) * amp + (h1(x * 5.1 + 3 + o, y * 5.1, z * 5.1) - 0.5) * amp * 0.45;
      const ex = Math.abs(x) > w / 2 - 0.01 ? Math.sign(x) : 0, ez = Math.abs(z) > d / 2 - 0.01 ? Math.sign(z) : 0, ey = y > h - 0.01 ? 1 : 0;
      const rd = (ex || ez) && ey ? -amp * 0.6 : 0;
      p.setXYZ(i, x + ex * (k + rd * 0.5), y + ey * (k + rd), z + ez * (k + rd * 0.5));
    }
    g.deleteAttribute('normal'); g.computeVertexNormals();
    return g;
  });
}
const AWN = () => tpl('awn', () => new THREE.BoxGeometry(1, 0.05, 1).translate(0, 0, 0.5));   // a flat canvas leaf, local +z out
const HIP = () => tpl('hip', () => new THREE.CylinderGeometry(0, Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0));
const GABLE = [[-1, 0], [1, 0], [0, 1]];
const URN = [[0.12, 0], [0.16, 0.04], [0.1, 0.12], [0.12, 0.2], [0.26, 0.34], [0.3, 0.5], [0.3, 0.56], [0.26, 0.6]];

// a balustrade from (u0, v0) to (u1, v1) with its plinth at height y: piers at the ends and every ~6 m, urns of
// plants on alternate piers, ivy over the outer face (`out` = +1 / -1: the side of the run, in its local x, that faces
// away from the deck) hanging down the retaining wall
function balustrade(B, u0, v0, u1, v1, y, o = {}) {
  const { S, L } = B;
  const du = u1 - u0, dv = v1 - v0, len = Math.hypot(du, dv), a = Math.atan2(du, dv);   // local +z along the run
  if (len < 0.8) return;
  coll((u0 + u1) / 2, (v0 + v1) / 2, 0.32, len / 2 + 0.3, 0, y + 1.14, a);                  // from the ground: the drop too
  S.push(u0, y, v0, a);
  const nb = Math.max(1, Math.round(len / 6.2)), seg = len / nb;
  const BAL = [[0.07, 0], [0.07, 0.05], [0.05, 0.09], [0.045, 0.14], [0.08, 0.27], [0.083, 0.33], [0.05, 0.45], [0.042, 0.52], [0.06, 0.55], [0.07, 0.6]];
  for (let i = 0; i < nb; i++) {
    const z0 = i * seg + 0.3, z1 = (i + 1) * seg - 0.3, zl = z1 - z0;
    S.box(0.44, 0.2, zl, COL.coping, { v: (z0 + z1) / 2 });
    const nbal = Math.max(2, Math.floor(zl / 0.3));
    for (let k = 0; k < nbal; k++) S.lathe('bal', BAL, COL.graniteW, { y: 0.2, v: z0 + (k + 0.5) * zl / nbal, seg: 6 });
    S.box(0.46, 0.16, zl + 0.02, COL.coping, { y: 0.8, v: (z0 + z1) / 2 });
  }
  for (let i = 0; i <= nb; i++) {
    S.box(0.6, 1.04, 0.6, COL.granite, { v: i * seg });
    S.box(0.7, 0.1, 0.7, COL.coping, { y: 1.04, v: i * seg });
    if (o.urns && i % 2 === 1) {
      S.lathe('urn', URN, COL.graniteW, { y: 1.14, v: i * seg, seg: 10 });
      L.add(lumpy(0.62, 0.42, 0.62, 0.22, 'urnplant', 0.2, i), { y: 1.62, v: i * seg }, COL.leafShrub);
    }
  }
  S.pop();
  if (o.ivy) {
    // ivy: curtains 0.5-1.8 m wide, some from the rail down to the ground, some over the wall only
    const r = rng(o.ivy);
    L.push(u0, 0, v0, a);
    for (let z = 0.3; z < len - 0.5;) {
      const w = Math.min(0.5 + r() * 1.3, len - z - 0.3), p = r();
      if (p < 0.4) L.add(lumpy(0.14, 1, 1, 0.1, 'ivy', 0.25, z * 7), { u: o.out * 0.3, v: z + w / 2, sy: y + 0.95, sz: w }, COL.leafIvyB);
      else if (p < 0.7) { const hng = 0.3 + r() * (y - 0.35); L.add(lumpy(0.14, 1, 1, 0.1, 'ivy', 0.25, z * 7), { u: o.out * 0.3, y: y - hng, v: z + w / 2, sy: hng + 0.05, sz: w }, COL.leafIvyB); }
      z += w + r() * 0.9;
    }
    L.pop();
  }
}

// a stair flight: NSTEP risers climbing local +x (the flight's frame at the foot, yaw a), width w along local z
function flight(B, u, v, a, w, cut = false) {
  const { S, Mt } = B;
  S.push(u, 0, v, a);
  for (let k = 0; k < NSTEP; k++) {
    S.box(TREAD + 0.02, RISE * (k + 1), w, k % 2 ? COL.granite : COL.graniteW, { u: TREAD * (k + 0.5) });
    S.box(0.03, 0.02, w, COL.graniteD, { u: TREAD * k + 0.015, y: RISE * (k + 1) - 0.02 });   // the nosing's shadow line
  }
  for (const s of [-1, 1]) {
    // stepped granite cheek walls, a pier at the top, a newel block at the foot (a cut flight: the deck's balustrade frames it)
    if (cut) continue;
    for (let k = 0; k < NSTEP; k++) S.box(TREAD, RISE * (k + 1) + 0.45, 0.46, COL.granite, { u: TREAD * (k + 0.5), v: s * (w / 2 + 0.23) });
    S.box(0.62, TER.h + 1.04, 0.62, COL.granite, { u: RUN + 0.1, v: s * (w / 2 + 0.23) });
    S.box(0.72, 0.1, 0.72, COL.coping, { u: RUN + 0.1, y: TER.h + 1.04, v: s * (w / 2 + 0.23) });
    S.box(0.62, 0.62, 0.62, COL.granite, { u: -0.32, v: s * (w / 2 + 0.23) }); S.box(0.7, 0.08, 0.7, COL.coping, { u: -0.32, y: 0.62, v: s * (w / 2 + 0.23) });
  }
  S.pop();
  if (w > 9) {                                                        // steel handrails down a wide flight
    Mt.push(u, 0, v, a);
    for (const z of [-w / 6, w / 6]) {
      Mt.tube([-0.2, 0.92, z], [RUN + 0.2, TER.h + 0.92, z], 0.024, COL.iron);
      for (const t of [0.12, 0.5, 0.88]) { const x = t * RUN; Mt.tube([x, RISE * Math.ceil(x / TREAD + 0.01), z], [x, (x / RUN) * TER.h + 0.92, z], 0.02, COL.iron); }
    }
    Mt.pop();
  }
}

// the park's cast-iron lamp post: an octagonal base, a fluted shaft, a scrolled collar, an acorn globe, a crown (4.7 m)
function lampPost(B, u, v, y = 0) {
  const { Mt, G } = B;
  coll(u, v, 0.2, 0.2, y, 1.0);
  Mt.push(u, y, v, 0);
  Mt.lathe('lampbase', [[0.2, 0], [0.2, 0.08], [0.17, 0.1], [0.17, 0.2], [0.14, 0.26], [0.13, 0.62], [0.15, 0.66], [0.15, 0.72], [0.1, 0.8], [0.085, 0.86]], COL.iron, { seg: 8 });
  Mt.cyl(0.058, 0.08, 2.6, COL.iron, { y: 0.86, seg: 8 });
  Mt.lathe('lampcol', [[0.075, 0], [0.1, 0.05], [0.1, 0.1], [0.07, 0.14], [0.07, 0.3], [0.11, 0.36], [0.13, 0.4]], COL.ironD, { y: 3.44, seg: 8 });
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + Math.PI / 4;
    Mt.tube([Math.sin(a) * 0.07, 3.5, Math.cos(a) * 0.07], [Math.sin(a) * 0.19, 3.8, Math.cos(a) * 0.19], 0.013, COL.iron, 4);
  }
  Mt.lathe('lampcap', [[0.02, 0], [0.2, 0], [0.23, 0.03], [0.19, 0.08], [0.1, 0.16], [0.04, 0.26], [0.03, 0.34], [0.0, 0.36]], COL.ironD, { y: 4.3, seg: 10 });
  Mt.pop();
  G.lathe('globe', [[0.05, 0], [0.14, 0.04], [0.21, 0.14], [0.235, 0.26], [0.22, 0.36], [0.18, 0.42], [0.12, 0.45], [0.02, 0.46]], COL.glowW, { u, y: y + 3.84, v, seg: 12 });
}

// a cafe umbrella (round with eight ribs, or square) on a pole, open, with its underside and valance
function umbrella(B, u, v, y, r, col, o = {}) {
  const { Mt, Mm } = B;
  const sq = !!o.square, n = sq ? 4 : 8, ry = sq ? Math.PI / 4 + (o.a || 0) : Math.PI / 8;
  Mt.cyl(0.022, 0.022, 2.35, COL.steel, { u, y, v, seg: 6 });
  Mt.cyl(0.2, 0.24, 0.08, COL.iron, { u, y, v, seg: 8 });
  const cone = () => new THREE.ConeGeometry(1, 0.42, n, 1, true).translate(0, 0.21, 0);
  Mm.add(tpl('umb' + n, cone), { u, y: y + 2.05, v, sx: r, sz: r, ry }, col);
  Mm.add(tpl('umb' + n, cone, true), { u, y: y + 2.04, v, sx: r, sz: r, ry }, COL.canvasS);
  Mm.cyl(r * (sq ? 0.71 : 0.93), r * (sq ? 0.71 : 0.93), 0.15, o.trim || col, { u, y: y + 1.9, v, open: true, seg: n, ry: sq ? ry : 0 });
  Mt.sphere(0.04, COL.steel, { u, y: y + 2.5, v, seg: 6 });
}


// a small stone building (the 42nd St restroom and its 40th St twin) on its footprint, doors toward the park (-u)
function stoneHouse(B, h) {
  const { S, Mt, Mm } = B;
  const cu = (h.u0 + h.u1) / 2, cv = (h.v0 + h.v1) / 2, w = h.u1 - h.u0, d = h.v1 - h.v0;
  S.box(w + 0.1, 0.5, d + 0.1, COL.granite, { u: cu, v: cv });
  S.box(w, 2.9, d, COL.lime, { u: cu, y: 0.5, v: cv });
  for (const [su, sv] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) for (let k = 0; k < 5; k++)
    S.box(0.5 + (k % 2) * 0.2, 0.52, 0.5 + ((k + 1) % 2) * 0.2, COL.limeD, { u: cu + su * (w / 2 - 0.2), y: 0.52 + k * 0.56, v: cv + sv * (d / 2 - 0.2) });
  S.box(w + 0.5, 0.18, d + 0.5, COL.coping, { u: cu, y: 3.4, v: cv });
  S.box(w + 0.3, 0.22, d + 0.3, COL.lime, { u: cu, y: 3.58, v: cv });
  Mm.add(HIP(), { u: cu, y: 3.8, v: cv, sx: w + 0.2, sz: d + 0.2, sy: 0.7 }, COL.roofCu);
  for (const dv of [-1.1, 1.1]) {
    Mt.box(0.08, 2.15, 1.0, COL.green, { u: h.u0 - 0.02, y: 0.5, v: cv + dv });
    Mt.box(0.06, 0.45, 1.1, COL.iron, { u: h.u0 - 0.03, y: 2.72, v: cv + dv });
  }
  for (const z of [h.v0 - 0.02, h.v1 + 0.02]) for (const du of [-1.4, 0, 1.4]) Mt.box(0.8, 0.6, 0.06, COL.iron, { u: cu + du, y: 2.4, v: z });
}

function pingpong(B, p) {
  const { Mt, Mm } = B;
  Mm.box(2.74, 0.05, 1.525, COL.ppTop, { u: p.u, y: 0.71, v: p.v });
  Mm.box(2.74, 0.006, 0.03, COL.ppLine, { u: p.u, y: 0.76, v: p.v });
  for (const s of [-1, 1]) Mm.box(0.03, 0.006, 1.525, COL.ppLine, { u: p.u + s * 1.355, y: 0.76, v: p.v });
  Mt.box(0.04, 0.16, 1.7, COL.iron, { u: p.u, y: 0.76, v: p.v });
  for (const s of [-1, 1]) { Mt.box(0.12, 0.71, 1.2, COL.steel, { u: p.u + s * 0.9, v: p.v }); Mt.box(0.5, 0.06, 1.3, COL.steel, { u: p.u + s * 0.9, v: p.v }); }
}

// the iron fence on a granite curb wall along a street edge from (u0, v0) to (u1, v1): pickets every 0.15 m with
// spear tips between two rails
function fenceRun(B, u0, v0, u1, v1) {
  const { S, Mt } = B;
  const du = u1 - u0, dv = v1 - v0, len = Math.hypot(du, dv), a = Math.atan2(du, dv);
  if (len < 0.5) return;
  const wallH = 0.46, fH = 0.95;
  coll((u0 + u1) / 2, (v0 + v1) / 2, 0.26, len / 2, 0, 1.55, a);
  S.push(u0, 0, v0, a); Mt.push(u0, 0, v0, a);
  S.box(0.46, wallH, len, COL.granite, { v: len / 2 });
  S.box(0.52, 0.08, len, COL.coping, { y: wallH, v: len / 2 });
  for (const y of [wallH + 0.14, wallH + fH - 0.1]) Mt.box(0.035, 0.035, len, COL.iron, { y, v: len / 2 });
  const n = Math.floor(len / 0.15);
  for (let k = 1; k < n; k++) {
    Mt.box(0.018, fH, 0.018, COL.iron, { y: wallH + 0.08, v: k * len / n });
    Mt.add(tpl('spear', () => new THREE.ConeGeometry(0.022, 0.08, 4).translate(0, 0.04, 0)), { y: wallH + 0.08 + fH, v: k * len / n }, COL.iron);
  }
  S.pop(); Mt.pop();
}
// an entrance on a street edge along u at v: two granite piers with a cap and a lantern each, and the open gates swung
// back into the park (`park` = +1 when the park lies toward +v)
function gatePiers(B, u, v, park) {
  const { S, Mt, G } = B;
  for (const s of [-1, 1]) {
    const pu = u + s * (EW / 2 + 0.36);
    coll(pu, v, 0.36, 0.36, 0, 2.4);
    S.box(0.72, 1.85, 0.72, COL.granite, { u: pu, v });
    S.box(0.84, 0.12, 0.84, COL.coping, { u: pu, y: 1.85, v });
    S.box(0.6, 0.14, 0.6, COL.graniteW, { u: pu, y: 1.97, v });
    Mt.lathe('lantern', [[0.12, 0], [0.14, 0.04], [0.08, 0.1], [0.07, 0.4], [0.16, 0.44], [0.16, 0.5], [0.04, 0.62], [0.0, 0.66]], COL.iron, { u: pu, y: 2.11, v, seg: 6 });
    G.cyl(0.1, 0.12, 0.3, COL.glowW, { u: pu, y: 2.23, v, seg: 6 });
    // the leaf: hinged at the pier's inner face, swung ~100 deg from closed into the park
    const lw = EW / 2 - 0.05, hu = u + s * (EW / 2);
    Mt.push(hu, 0, v + park * 0.1, Math.atan2(s * 0.17, park));                                 // local +z along the open leaf
    Mt.box(0.04, 0.04, lw, COL.iron, { y: 0.15, v: lw / 2 }); Mt.box(0.04, 0.04, lw, COL.iron, { y: 1.35, v: lw / 2 });
    for (let k = 0; k <= Math.floor(lw / 0.13); k++) Mt.box(0.02, 1.3, 0.02, COL.iron, { y: 0.1, v: Math.min(lw, k * 0.13) });
    Mt.pop();
  }
}

const HOOP = () => tpl('hoop', () => new THREE.TorusGeometry(0.45, 0.009, 3, 10, Math.PI));   // in the local x-y plane

// ---- more builders ------------------------------------------------------------------------------------------------
// a black slatted park bin (the photos: a dark cylinder of vertical steel slats with a domed lid)
function slatBin(B, u, v, y = 0) {
  const { Mt } = B;
  coll(u, v, 0.3, 0.3, y, 1.1);
  Mt.push(u, y, v, 0);
  Mt.cyl(0.27, 0.27, 0.06, COL.ironD, { y: 0.02, seg: 12 });
  Mt.cyl(0.25, 0.25, 0.9, COL.ironD, { y: 0.05, seg: 12 });                                  // the liner behind the slats
  for (let k = 0; k < 18; k++) { const a = k * Math.PI / 9; Mt.box(0.05, 0.86, 0.016, COL.iron, { u: Math.sin(a) * 0.275, y: 0.08, v: Math.cos(a) * 0.275, ry: a }); }
  for (const yy of [0.12, 0.9]) Mt.cyl(0.29, 0.29, 0.04, COL.iron, { y: yy, seg: 16, open: true });
  Mt.lathe('binlid2', [[0.3, 0], [0.29, 0.05], [0.22, 0.1], [0.1, 0.13], [0.0, 0.14]], COL.iron, { y: 0.96, seg: 14 });
  Mt.pop();
}
// a big white urn planter with a clipped conical evergreen (the photos: at the carousel, the entrances, the terrace)
function urnPlanter(B, u, v, y = 0, s = 1) {
  const { S, L } = B;
  coll(u, v, 0.58 * s, 0.58 * s, y, 1.0 * s);
  S.push(u, y, v, 0);
  S.lathe('bigurn', [[0.3, 0], [0.32, 0.06], [0.22, 0.14], [0.2, 0.3], [0.36, 0.42], [0.5, 0.6], [0.56, 0.82], [0.58, 0.9], [0.52, 0.94]], COL.urn, { sx: s, sy: s, sz: s, seg: 16 });
  S.pop();
  L.add(tpl('cone', () => new THREE.ConeGeometry(1, 1, 10, 3).translate(0, 0.5, 0)), { u, y: y + 0.86 * s, v, sx: 0.42 * s, sz: 0.42 * s, sy: 1.25 * s }, COL.leafConeB);
  L.add(lumpy(0.9, 0.3, 0.9, 0.18, 'urntop', 0.25, (u * 3) | 0), { u, y: y + 0.84 * s, v, sx: s, sz: s }, COL.leafShrub);
}
// an ivy bed: a granite curb round a low ivy mass (the planes stand in it; bpTrees plants them)
function ivyBed(B, u0, u1, v0, v1, r, o = {}) {
  const { S, L } = B;
  const w = u1 - u0, d = v1 - v0, cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
  if (w < 0.6 || d < 0.6) return;
  coll(cu, cv, w / 2, d / 2, 0, 0.45);
  for (const [a, b, c, e] of [[cu, v0, w, 0.18], [cu, v1, w, 0.18]]) S.box(c, 0.14, e, COL.coping, { u: a, v: b });
  for (const uu of [u0, u1]) S.box(0.18, 0.14, d, COL.coping, { u: uu, v: cv });
  for (let x = u0 + 0.12; x < u1 - 0.12; x += 3.6) {
    const l = Math.min(3.6, u1 - 0.12 - x);
    L.add(lumpy(3.6, 1, 3.6, 0.12, 'ivybed', 0.6, (x * 7) | 0), { u: x + l / 2, v: cv, sx: l / 3.6, sz: (d - 0.24) / 3.6, sy: o.h || 0.2 }, COL.leafIvyB);
  }
  // the bed's edge is not a ruled line: ivy tongues creep over the curb onto the walk every few metres
  if (w > 3) for (const [vv, sd] of [[v0, -1], [v1, 1]]) for (let x = u0 + 0.8 + r() * 2.5, i = 0; x < u1 - 0.8; x += 2.2 + r() * 4.5, i++) {
    L.add(lumpy(1, 0.14, 0.7, 0.1, 'spill', 0.2, i), { u: x, v: vv + sd * (0.05 + r() * 0.2), sx: 0.4 + r() * 0.8, sz: 0.45 + r() * 0.4, sy: 0.8 + r() * 0.5, ry: (r() - 0.5) * 0.6 }, COL.leafIvyB);
  }
  if (o.shrubs) for (let k = 0, n = Math.round(w * d / 14); k < n; k++) {
    const s = 0.6 + r() * 0.7;
    L.add(lumpy(1.2, 1, 1.2, 0.35, 'shrub2', 0.3, k), { u: u0 + 0.8 + r() * (w - 1.6), v: v0 + 0.8 + r() * (d - 1.6), sx: s, sz: s, sy: 0.5 + r() * 0.8, ry: r() * 6.28 }, COL.leafShrub);
  }
}
// a perennial border: raised behind a granite curb on the lawn walk's side, mounded perennials, clipped shrubs, conical
// evergreens and tulips (the photos along the lawn); `walk` = the v of the lawn-walk edge (the curb), s = +1 north side
function borderBed(B, u0, u1, v0, v1, walk, r) {
  const { S, L, Fl } = B;
  const w = u1 - u0, cu = (u0 + u1) / 2, d = v1 - v0, cv = (v0 + v1) / 2;
  coll(cu, cv, w / 2, d / 2, 0, 1.0);
  S.box(w, 0.32, 0.24, COL.coping, { u: cu, v: walk });                                      // the curb, 0.3 m proud
  for (let x = u0, i = 0; x < u1 - 0.1; x += 2.4, i++) {
    const l = Math.min(2.4, u1 - x), hh = 0.42 + r() * 0.2;
    L.add(lumpy(2.4, 1, 3.6, 0.16, 'border', 0.4, i), { u: x + l / 2, v: cv, sx: l / 2.4, sz: (d - 0.3) / 3.6, sy: hh }, COL.leafBorder);
    // the flowers grow in drifts of one kind (ref3: bands of red and white through the border; late summer: mounds of
    // coneflower, rudbeckia, salvia, phlox): a bumpy mound 0.5-1.2 m across whose crown breaks 0-0.1 m out of the foliage
    // (v5's smooth mounds stood 0.2 m proud and read as cushions at 2 m), in the
    // flower material (its mask puts 3-7 cm heads of the drift's colour over leaf green; v4's flat speckled mounds read
    // as sheets of paper and its cups as plastic cups)
    for (let k = 0, nd = 2 + ((r() * 2.4) | 0); k < nd; k++) {
      const fi = (h1(Math.floor((x + k * 0.8) / 2.9), walk, k) * COL.flowers.length) | 0;
      const du = x + 0.3 + r() * Math.max(0.1, l - 0.6), dv = v0 + 0.55 + r() * (d - 1.1), sx = 0.5 + r() * 0.7, sz = 0.4 + r() * 0.5;
      Fl.add(lumpy(1, 0.3, 1, 0.26, 'drift3', 0.14, k + i), { u: du, y: hh * 0.9 - 0.2, v: dv, sx, sz, sy: 0.55 + r() * 0.4, ry: r() * 3 }, COL.flowers[fi]);
    }
    if (r() < 0.5) L.add(lumpy(0.9, 0.8, 0.9, 0.3, 'shrub', 0.3, i), { u: x + r() * l, v: v0 + 0.6 + r() * (d - 1.2), sy: 0.8 + r() * 0.7, ry: r() * 6.28 }, COL.leafBorderS);
    if (r() < 0.35) { const cu2 = x + r() * l, cv2 = v0 + 0.8 + r() * (d - 1.6), hc = 1.6 + r() * 1.4; L.add(tpl('cone', () => new THREE.ConeGeometry(1, 1, 10, 3).translate(0, 0.5, 0)), { u: cu2, y: 0.3, v: cv2, sx: 0.45, sz: 0.45, sy: hc }, COL.leafConeB); }
  }
}
// the lawn's edge: a granite curb and short iron posts with a chain between them (the photos), open on the axis
function lawnEdge(B) {
  const { S, Mt } = B;
  const L = LAWN31, F = FOUNT31;
  const add = (a, b, posts) => {
    const du = b[0] - a[0], dv = b[1] - a[1], len = Math.hypot(du, dv), ang = Math.atan2(du, dv);
    if (len < 0.05) return;
    S.box(0.2, 0.12, len + 0.2, COL.coping, { u: (a[0] + b[0]) / 2, v: (a[1] + b[1]) / 2, ry: ang });
    if (!posts) return;
    coll((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0.12, len / 2, 0, 0.6, ang);
    const n = Math.max(1, Math.round(len / 2.4));
    for (let k = 0; k <= n; k++) {
      const t = k / n, pu = a[0] + du * t, pv = a[1] + dv * t;
      Mt.cyl(0.02, 0.025, 0.46, COL.iron, { u: pu, y: 0.1, v: pv, seg: 6 });
      Mt.sphere(0.03, COL.iron, { u: pu, y: 0.57, v: pv, seg: 5 });
      if (k < n) { const qu = a[0] + du * (t + 1 / n), qv = a[1] + dv * (t + 1 / n), mu = (pu + qu) / 2, mv = (pv + qv) / 2; Mt.tube([pu, 0.52, pv], [mu, 0.42, mv], 0.008, COL.iron, 4); Mt.tube([mu, 0.42, mv], [qu, 0.52, qv], 0.008, COL.iron, 4); }
    }
  };
  const vE = Math.sqrt(L.arcR * L.arcR - (L.u0 - F[0]) ** 2), arcA = Math.atan2(vE, L.u0 - F[0]);
  add([L.u0, L.v0], [L.u1, L.v0], true);
  add([L.u1, L.v0], [L.u1, L.v1], true);
  add([L.u1, L.v1], [L.u0, L.v1], true);
  add([L.u0, L.v1], [L.u0, F[1] + vE], true);
  add([L.u0, F[1] - vE], [L.u0, L.v0], true);
  let prev = null;
  for (let k = 0; k <= 18; k++) {
    const a = arcA - (2 * arcA * k) / 18, p = [F[0] + Math.cos(a) * L.arcR, F[1] + Math.sin(a) * L.arcR];
    if (prev) add(prev, p, k !== 9 && k !== 10);
    prev = p;
  }
}
// a timber diamond lattice in the local (z, y) plane: diagonals every `step` both ways, clipped to the bay (width w
// centred on z 0, from y0 to y1)
function lattice(b, w, y0, y1, step, col) {
  const h = y1 - y0, z0 = -w / 2, z1 = w / 2;
  for (const dir of [1, -1]) for (let c = -h; c < w; c += step) {
    // the line z = z0 + c + dir * t, y = y0 + t (dir -1: z = z1 - c - t), t in [0, h], clipped to [z0, z1]
    let ta = 0, tb = h;
    const zAt = (t) => dir > 0 ? z0 + c + t : z1 - c - t;
    if (dir > 0) { ta = Math.max(ta, -c); tb = Math.min(tb, w - c); } else { ta = Math.max(ta, -c); tb = Math.min(tb, w - c); }
    if (tb - ta < 0.05) continue;
    b.tube([0, y0 + ta, zAt(ta)], [0, y0 + tb, zAt(tb)], 0.016, col, 4);
  }
}
// the lawn's enclosure: the balustraded wall on the borders' outer edge, 1 m, with the openings (and their stone sills)
function enclosure(B) {
  const { S } = B;
  for (const v of [ENCL.vS, ENCL.vN]) {
    let a = ENCL.u0;
    for (const [g0, g1] of [...ENCL.gaps, [ENCL.u1, ENCL.u1]]) {
      if (g0 - a > 0.8) { S.box(g0 - a, 0.22, 0.5, COL.granite, { u: (a + g0) / 2, v }); balustrade(B, a, v, g0, v, 0.22, {}); }
      a = g1;
    }
    for (const [g0, g1] of ENCL.gaps) S.box(g1 - g0, 0.05, 1.2, COL.paveT, { u: (g0 + g1) / 2, v });
  }
  // the returns: west ends of both walls toward the fountain, east ends to the terrace
  for (const [v0, v1] of [[ENCL.vS, 49.1], [90.1, ENCL.vN]]) { S.box(0.5, 0.22, v1 - v0, COL.granite, { u: ENCL.u0, v: (v0 + v1) / 2 }); balustrade(B, ENCL.u0, v0, ENCL.u0, v1, 0.22, {}); }
  for (const [v0, v1] of [[ENCL.vS, 50.3], [91.4, ENCL.vN]]) { S.box(0.5, 0.22, v1 - v0, COL.granite, { u: ENCL.u1, v: (v0 + v1) / 2 }); balustrade(B, ENCL.u1, v0, ENCL.u1, v1, 0.22, {}); }
}
// the fountain plaza: a flagstone deck two steps up (the rectangle and its half-disc toward the lawn), curved steps down
// to the lawn walk, two steps down to the Sixth Avenue entrance, urns at its corners
function fountainPlaza(B) {
  const { S } = B;
  const P = FPLAZA, F = FOUNT31, h = P.h;
  S.box(F[0] - P.u0, h, P.v1 - P.v0, COL.paveT, { u: (P.u0 + F[0]) / 2, v: (P.v0 + P.v1) / 2 });
  // the half-disc: a half cylinder, and two curved treads of 0.15 m round it
  S.add(tpl('halfdisc', () => new THREE.CylinderGeometry(1, 1, 1, 48, 1, false, 0, Math.PI).translate(0, 0.5, 0)), { u: F[0], v: F[1], sx: P.r, sz: P.r, sy: h }, COL.paveT);
  S.add(tpl('halfdisc', () => new THREE.CylinderGeometry(1, 1, 1, 48, 1, false, 0, Math.PI).translate(0, 0.5, 0)), { u: F[0], v: F[1], sx: P.r + 0.4, sz: P.r + 0.4, sy: h / 2 }, COL.granite);
  for (const [v0, v1] of [[P.v0, F[1] - P.r - 0.4], [F[1] + P.r + 0.4, P.v1]]) if (v1 - v0 > 0.2) S.box(P.u1 - F[0], h, v1 - v0, COL.paveT, { u: (F[0] + P.u1) / 2, v: (v0 + v1) / 2 });
  // the plaza's edges: a coping all round, the treads at the Sixth Avenue entrance
  S.box(0.3, h + 0.02, P.v1 - P.v0, COL.coping, { u: P.u0, v: (P.v0 + P.v1) / 2 });
  for (const vv of [P.v0, P.v1]) S.box(F[0] - P.u0 + 0.3, h + 0.02, 0.3, COL.coping, { u: (P.u0 + F[0]) / 2, v: vv });
  S.box(0.4, h / 2, 20.5, COL.granite, { u: P.u0 - 0.2, v: 70.55 });
  for (const [u, v] of [[P.u0 + 0.8, P.v0 + 0.8], [P.u0 + 0.8, P.v1 - 0.8], [F[0] - 1.5, P.v0 + 0.8], [F[0] - 1.5, P.v1 - 0.8]]) urnPlanter(B, u, v, h, 0.9);
}
// the four small round basins on the Lowell fountain's diagonals, and a pink granite rim round the pool
function fountainLobes(B, y0) {
  const { S, Mm } = B;
  for (const [u, v] of [[33.4, 67.0], [25.9, 66.2], [25.6, 74.5], [32.9, 74.9]]) {
    S.add(tpl('lobe', () => new THREE.CylinderGeometry(1, 1, 1, 20, 1, true).translate(0, 0.5, 0)), { u, y: y0, v, sx: 0.95, sz: 0.95, sy: 0.42 }, COL.pink);
    S.add(tpl('lobe', () => new THREE.CylinderGeometry(1, 1, 1, 20, 1, true).translate(0, 0.5, 0), true), { u, y: y0, v, sx: 0.78, sz: 0.78, sy: 0.42 }, COL.pinkD);
    S.add(tpl('lobeTop', () => new THREE.RingGeometry(0.78, 1.0, 20, 1).rotateX(-Math.PI / 2)), { u, y: y0 + 0.42, v, sx: 0.95, sz: 0.95 }, COL.pinkD);
    // their water matte and dark (the sky-mirror glass turned them into white lids at the grazing angles of teaser 3's arc)
    Mm.add(tpl('lobeWater', () => new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2)), { u, y: y0 + 0.33, v, sx: 0.76, sz: 0.76 }, K(0x2e3a37));
  }
}
// the Upper Terrace's raised decks, their faces, the broad stair, the north flight, the steps up to the memorial court
// and the cafe's deck, the balustrade round the drops
function terrace(B) {
  const { S, Mm, Mt } = B;
  const Z = TZ, st = (n) => n * TREAD;
  const body = (u0, u1, v0, v1, h, col = COL.paveT) => { if (u1 - u0 < 0.05 || v1 - v0 < 0.05) return; S.box(u1 - u0, h - 0.1, v1 - v0, COL.granite, { u: (u0 + u1) / 2, v: (v0 + v1) / 2 }); S.box(u1 - u0, 0.1, v1 - v0, col, { u: (u0 + u1) / 2, y: h - 0.1, v: (v0 + v1) / 2 }); };
  // the central plaza, less the broad stair's cut (6 steps across v 55.5-86.3 from its face)
  const P = Z.plaza, run6 = st(6);
  body(P.u0 + run6, P.u1, P.v0, P.v1, P.h);
  body(P.u0, P.u0 + run6, P.v0, BROAD.v0, P.h); body(P.u0, P.u0 + run6, BROAD.v1, P.v1, P.h);
  for (let k = 0; k < 6; k++) S.box(TREAD + 0.02, RISE * (k + 1), BROAD.v1 - BROAD.v0, k % 2 ? COL.granite : COL.graniteW, { u: P.u0 + st(k) + TREAD / 2, v: (BROAD.v0 + BROAD.v1) / 2 });
  for (const z of [BROAD.v0 + 7.7, (BROAD.v0 + BROAD.v1) / 2, BROAD.v1 - 7.7]) Mt.tube([P.u0 - 0.2, 0.92, z], [P.u0 + run6 + 0.2, P.h + 0.92, z], 0.024, COL.iron);
  // the north terrace, less the north allee's flight
  const N = Z.north;
  body(N.u0 + run6, N.u1, N.v0, N.v1, N.h);
  body(N.u0, N.u0 + run6, N.v0, NFLIGHT.v0, N.h); body(N.u0, N.u0 + run6, NFLIGHT.v1, N.v1, N.h);
  for (let k = 0; k < 6; k++) S.box(TREAD + 0.02, RISE * (k + 1), NFLIGHT.v1 - NFLIGHT.v0, k % 2 ? COL.granite : COL.graniteW, { u: N.u0 + st(k) + TREAD / 2, v: (NFLIGHT.v0 + NFLIGHT.v1) / 2 });
  // gravel panels under the terrace's planes (OSM natural=sand), a hair over the deck
  for (const [v0, v1] of [[92.4, 106.8], [109.6, 120.0], [124.3, 130.0]]) Mm.box(6.2, 0.02, v1 - v0, COL.gravel, { u: 137.9, y: N.h, v: (v0 + v1) / 2 });
  // the memorial court and the cafe's deck, 3 steps up along their west edges
  const C = Z.court, D = Z.deck;
  body(C.u0 + st(3), C.u1, C.v0, C.v1, C.h);
  for (let k = 0; k < 3; k++) S.box(TREAD + 0.02, P.h + RISE * (k + 1), C.v1 - C.v0 - 4, k % 2 ? COL.granite : COL.graniteW, { u: C.u0 + st(k) + TREAD / 2, v: (C.v0 + 4 + C.v1) / 2 });
  body(C.u0, C.u0 + st(3), C.v0, C.v0 + 4, C.h);
  // the timber deck on its granite body: planks along u, planting boxes on its west edge, two short flights
  S.box(D.u1 - D.u0, D.h - 0.06, D.v1 - D.v0, COL.granite, { u: (D.u0 + D.u1) / 2, v: (D.v0 + D.v1) / 2 });
  for (let v = D.v0 + 0.07, i = 0; v < D.v1 - 0.05; v += 0.145, i++) Mm.box(D.u1 - D.u0 - 0.1, 0.06, 0.13, i % 3 === 0 ? COL.deckD : COL.deck, { u: (D.u0 + D.u1) / 2, y: D.h - 0.06, v });
  for (const vf of [93.9, 108.1]) for (let k = 0; k < 3; k++) S.box(TREAD, N.h + RISE * (k + 1), 2.2, COL.graniteW, { u: D.u0 - st(3) + st(k) + TREAD / 2, v: vf });
  for (let v = D.v0 + 1.2; v < D.v1 - 1; v += 3.2) {
    if (Math.abs(v - 93.9) < 2 || Math.abs(v - 108.1) < 2) continue;
    Mm.box(0.6, 0.55, 2.6, COL.deckD, { u: D.u0 + 0.35, y: D.h, v });
    B.L.add(lumpy(0.55, 0.5, 2.5, 0.22, 'deckbox', 0.3, (v * 3) | 0), { u: D.u0 + 0.35, y: D.h + 0.52, v }, COL.leafShrub);
  }
  // the balustrade round every drop: the plaza's face either side of the broad stair and its south edge, the north
  // terrace's face either side of its flight and its north edge (clear of the 42nd St flight), the court's south edge
  const bal = (u0, v0, u1, v1, y, o = {}) => balustrade(B, u0, v0, u1, v1, y, o);
  bal(P.u0 + 0.26, P.v0 + 0.26, P.u0 + 0.26, BROAD.v0 - 0.26, P.h, { urns: true, ivy: 901, out: -1 });
  bal(P.u0 + 0.26, BROAD.v1 + 0.26, P.u0 + 0.26, P.v1 - 0.65, P.h, { urns: true, ivy: 902, out: -1 });   // clear of the north run's first pier
  bal(N.u0 + 0.26, N.v0 + 0.35, N.u0 + 0.26, NFLIGHT.v0 - 0.26, N.h, { urns: true, ivy: 903, out: -1 });
  bal(N.u0 + 0.26, NFLIGHT.v1 + 0.26, N.u0 + 0.26, N.v1 - 0.26, N.h, { ivy: 904, out: -1 });
  bal(P.u0 + 0.26, P.v0 + 0.26, P.u1 - 0.26, P.v0 + 0.26, P.h, { ivy: 905, out: 1 });
  bal(N.u0 + 0.26, N.v1 - 0.26, STFLIGHT.u0 - 0.9, N.v1 - 0.26, N.h, { ivy: 906, out: -1 });
  bal(STFLIGHT.u1 + 0.9, N.v1 - 0.26, N.u1, N.v1 - 0.26, N.h, { ivy: 907, out: -1 });
  bal(P.u1 - 0.26, P.v0 + 0.26, P.u1 - 0.26, C.v0 - 0.3, P.h, {});
  bal(C.u0 + 0.3, C.v0 + 0.26, GRILL31[2][0], C.v0 + 0.26, C.h, {});
  // the wall between the lawn's east walk and the Grill's forecourt (OSM, 1 m, at the park's level): a granite base and a
  // balustrade with urns, its ivy toward the walk
  S.box(0.5, 0.22, 26.9, COL.granite, { u: 132.0, v: 35.05 });
  bal(132.0, 21.6, 132.0, 48.5, 0.22, { urns: true, ivy: 908, out: -1 });
  // the 42nd St flight: 6 steps down to the street, cheek walls, a landing to the sidewalk
  flight(B, (STFLIGHT.u0 + STFLIGHT.u1) / 2, N.v1 + st(6), Math.PI / 2, STFLIGHT.u1 - STFLIGHT.u0);
  S.box(STFLIGHT.u1 - STFLIGHT.u0 + 1.4, 0.05, NV - (N.v1 + st(6)), COL.paveT, { u: (STFLIGHT.u0 + STFLIGHT.u1) / 2, v: (N.v1 + st(6) + NV) / 2 });
  // big urns flanking the broad stair's top, lamps along the plaza's edge
  for (const vv of [BROAD.v0 - 1.0, BROAD.v1 + 1.0]) urnPlanter(B, P.u0 + run6 + 0.9, vv, P.h, 1.1);
  for (const v of [52, 62, 80, 90]) lampPost(B, P.u0 + run6 + 1.2, v, P.h);
  for (const v of [98, 112, 127]) lampPost(B, N.u0 + run6 + 1.0, v, N.h);
}
// the William Cullen Bryant memorial (Carrere & Hastings, Herbert Adams, 1911), in white marble (its own material, B.Mb):
// a Roman arch, coupled engaged columns either side, an entablature and attic; inside it, behind the statue, a
// demi-rotunda of two free Ionic columns and pilasters under a coffered semi-dome, open behind to the library's wall; the
// seated bronze on a square die with its inscription, on a podium with a row of rosettes, three straight shallow steps
// from the court (ref4, the memorial seen from the court); the balustraded wall across the court with two big urns
const flutes = (n, a, b) => (t) => (t < 2 * n && ((t >> 1) & 1) ? b : a);
function memorial31(B) {
  const { S, Mb, Mt } = B;
  const y0 = TZ.court.h, u = MEM31.u, v = MEM31.v;
  const W = 9.4, D = 4.4, H = 8.6, ow = 4.6, spring = 4.3, rA = ow / 2, yb = y0 + 0.5;   // yb: the arch's floor
  coll(u + D / 2 - 0.6, v, D / 2 + 0.9, W / 2 + 0.3, y0, H);
  const M = COL.marble, MD = COL.marbleD, MF = COL.marbleC;
  // the piers of the arch, each 2.4 m, the head over the opening, the barrel vault's intrados (stepped)
  for (const s of [-1, 1]) Mb.box(D, H - 1.4, (W - ow) / 2, M, { u: u + D / 2, y: yb, v: v + s * (ow / 2 + (W - ow) / 4) });
  Mb.box(D, H - 1.4 - spring - rA, ow, M, { u: u + D / 2, y: yb + spring + rA, v });
  for (let i = 0; i < 10; i++) {
    const d0 = rA * i / 10, d1 = rA * (i + 1) / 10, dc = (d0 + d1) / 2, yA = Math.sqrt(Math.max(0, rA * rA - dc * dc)), hh = rA - yA;
    if (hh < 0.02) continue;
    for (const s of [-1, 1]) Mb.box(D, hh, d1 - d0, M, { u: u + D / 2, y: yb + spring + yA, v: v + s * dc });
  }
  Mb.box(D + 0.4, 0.5, W + 0.6, MD, { u: u + D / 2, y: y0, v });                              // the base
  Mb.box(D + 0.6, 0.35, W + 0.9, M, { u: u + D / 2, y: y0 + H - 1.4, v });                   // architrave
  Mb.box(D + 0.5, 0.5, W + 0.8, MD, { u: u + D / 2, y: y0 + H - 1.05, v });                   // frieze
  Mb.box(D + 0.9, 0.22, W + 1.3, M, { u: u + D / 2, y: y0 + H - 0.55, v });                   // cornice
  Mb.box(D - 0.4, 0.4, W - 1.2, M, { u: u + D / 2, y: y0 + H - 0.33, v });                    // attic
  // coupled engaged columns on the front, each side of the arch, on pedestals: fluted (alternate facets a shade
  // darker), capitals under the architrave
  for (const s of [-1, 1]) for (const dz of [ow / 2 + 0.55, W / 2 - 0.45]) {
    Mb.box(0.9, 0.9, 0.9, MD, { u: u - 0.1, y: yb, v: v + s * dz });
    Mb.cyl(0.27, 0.31, H - 3.0, flutes(20, M, MF), { u: u - 0.12, y: y0 + 1.4, v: v + s * dz, seg: 20 });
    Mb.box(0.72, 0.22, 0.72, MD, { u: u - 0.12, y: y0 + H - 1.62, v: v + s * dz });
  }
  // the demi-rotunda: a half-round of the opening's width centred 1.6 m in; the two free columns stand on it a fifth of
  // the opening either side of the axis (ref4), pilasters where it meets the piers; an entablature band round it at the
  // springing and the coffered semi-dome over, as inverted templates (seen from inside) with their outsides behind
  const uc = u + 1.6, Ru = 2.2, Rv = rA - 0.05;
  for (const s of [-1, 1]) {
    const ph = 0.5, cu = uc + Math.cos(ph) * (Ru - 0.3), cv = v + s * Math.sin(ph) * (Rv - 0.3);
    Mb.box(0.46, 0.3, 0.46, MD, { u: cu, y: yb, v: cv });
    Mb.cyl(0.155, 0.18, spring - 0.85, flutes(16, M, MF), { u: cu, y: yb + 0.3, v: cv, seg: 16 });
    Mb.box(0.42, 0.2, 0.42, MD, { u: cu, y: yb + spring - 0.55, v: cv });
    Mb.box(0.5, spring - 0.35, 0.14, M, { u: uc, y: yb, v: v + s * (rA - 0.07) });
  }
  const band = (inv) => tpl('rotband', () => new THREE.CylinderGeometry(1, 1, 1, 18, 1, true, 0, Math.PI).translate(0, 0.5, 0), inv);
  for (const inv of [true, false]) Mb.add(band(inv), { u: uc, y: yb + spring - 0.35, v, sx: Ru, sz: Rv, sy: 0.35 }, MD);
  // the semi-dome (the +u half of an upper hemisphere): 18 x 8 facets, coffers as the darker cells of alternate rows below
  // the crown, 6 across between ribs (three's sphere indexing: the top row one triangle a cell, the others two)
  const dome = (inv) => tpl('rotdome', () => new THREE.SphereGeometry(1, 18, 8, Math.PI / 2, Math.PI, 0, Math.PI / 2), inv);
  const cof = (t) => { const iy = t < 18 ? 0 : 1 + Math.floor((t - 18) / 36), ix = t < 18 ? t : Math.floor(((t - 18) % 36) / 2); return iy >= 3 && iy % 2 === 1 && ix % 3 !== 0 ? MF : M; };
  Mb.add(dome(true), { u: uc, y: yb + spring, v, sx: Ru, sy: rA * 0.93, sz: Rv }, cof);
  Mb.add(dome(false), { u: uc, y: yb + spring, v, sx: Ru + 0.08, sy: rA * 0.93 + 0.08, sz: Rv + 0.08 }, MD);
  // the die with its inscription panel, a base moulding and a cap, on a podium with five rosettes on its face; three
  // straight shallow steps from the court up to the arch's floor
  const pu = u + 1.75;
  Mb.box(2.1, 0.6, 3.0, MD, { u: pu - 0.05, y: yb, v });
  Mb.box(2.2, 0.08, 3.1, M, { u: pu - 0.05, y: yb + 0.6, v });
  for (let k = 0; k < 5; k++) Mb.cyl(0.11, 0.11, 0.04, M, { u: pu - 1.09, y: yb + 0.3, v: v + (k - 2) * 0.56, rz: Math.PI / 2, seg: 10 });
  Mb.box(1.1, 0.12, 1.36, MD, { u: pu, y: yb + 0.68, v });
  Mb.box(0.95, 0.92, 1.2, M, { u: pu, y: yb + 0.8, v });
  Mb.box(0.02, 0.5, 0.86, MD, { u: pu - 0.48, y: yb + 1.0, v });
  Mb.box(1.1, 0.14, 1.36, MD, { u: pu, y: yb + 1.72, v });
  for (let k = 0; k < 3; k++) Mb.box(0.36, 0.5 - k * 0.167, 5.2, k % 2 ? MD : M, { u: u - 0.38 - k * 0.34, y: y0, v });
  // the seated bronze: armchair, lap robe, arms on the chair's arms, bearded head
  const fy = yb + 1.86;
  Mt.push(pu, fy, v, -Math.PI / 2);
  Mt.box(1.25, 0.6, 1.0, COL.bronze, { v: -0.12 });                                          // the chair's seat block
  for (const s of [-1, 1]) Mt.box(0.16, 0.95, 0.9, COL.bronze, { u: s * 0.58, v: -0.12 });   // its arms
  Mt.box(1.2, 1.25, 0.18, COL.bronze, { y: 0.4, v: -0.58 });                                  // its back
  Mt.add(tpl('robe', () => new THREE.CylinderGeometry(0.42, 0.62, 1, 12).translate(0, 0.5, 0)), { y: 0.0, v: 0.35, sy: 0.72, sz: 0.62 }, COL.bronzeG);   // the robe over the knees
  Mt.add(tpl('torso', () => new THREE.CylinderGeometry(0.34, 0.44, 1, 10).translate(0, 0.5, 0)), { y: 0.6, v: -0.22, sy: 0.9, sz: 0.66, rx: -0.06 }, COL.bronze);
  for (const s of [-1, 1]) { Mt.tube([s * 0.4, 1.35, -0.25], [s * 0.5, 0.95, -0.02], 0.1, COL.bronze); Mt.tube([s * 0.5, 0.95, -0.02], [s * 0.56, 0.98, 0.34], 0.085, COL.bronze); }
  Mt.sphere(0.21, COL.bronze, { y: 1.72, v: -0.12, sy: 1.18, seg: 10 });
  Mt.sphere(0.18, COL.bronzeG, { y: 1.52, v: -0.02, sy: 1.3, sz: 0.8, seg: 8 });
  Mt.pop();
  // the balustraded wall across the court either side, and the two big marble urns on it
  for (const [a, b] of [[TZ.court.v0 + 0.6, v - W / 2 - 0.2], [v + W / 2 + 0.2, TZ.court.v1 - 0.6]]) { S.box(1.0, 0.25, b - a, COL.graniteW, { u: u + 1.6, y: y0, v: (a + b) / 2 }); balustrade(B, u + 1.6, a, u + 1.6, b, y0 + 0.25, {}); }
  for (const s of [-1, 1]) {
    const uv = v + s * (W / 2 + 1.6);
    Mb.box(1.1, 1.3, 1.1, MD, { u: u + 1.6, y: y0, v: uv });
    Mb.lathe('memurn', [[0.28, 0], [0.34, 0.08], [0.24, 0.2], [0.26, 0.36], [0.5, 0.56], [0.62, 0.84], [0.62, 0.96], [0.54, 1.02], [0.2, 1.1], [0.1, 1.28], [0.0, 1.34]], M, { u: u + 1.6, y: y0 + 1.3, v: uv, seg: 16 });
  }
}
// the Bryant Park Grill (Hardy Holzman Pfeiffer, 1995), on the OSM outline: glass and dark green steel inside an ipe
// trellis of piers and diamond lattice on cast stone bases, vines over it, a raised planter along the base, the roof
// terrace with umbrellas (18 ft: 5.5 m)
function grill31(B) {
  const { S, Mt, Gl, Mm, L } = B;
  const H = 5.5;
  for (const [u0, u1, v0, v1] of GRILL31) {
    const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2, w = u1 - u0, d = v1 - v0;
    coll(cu, cv, w / 2 + 1.4, d / 2 + 1.4, 0, 5.5);                                                // with its trellis and planter
    S.box(w, 0.6, d, COL.lime, { u: cu, v: cv });                                              // cast stone base
    Gl.box(w - 0.2, 3.9, d - 0.2, COL.glassW, { u: cu, y: 0.6, v: cv });
    Mt.box(w + 0.02, 0.9, d + 0.02, COL.greenD, { u: cu, y: 4.5, v: cv });
    Mt.box(w + 0.5, 0.14, d + 0.5, COL.greenD, { u: cu, y: H - 0.1, v: cv });
  }
  // the trellis on the park faces: piers every 2.1 m (0.36 m square, ipe), diamond lattice between them to 4.3 m, a
  // timber beam at 4.4 m; dark green steel columns inside every other bay; vines (ivy and flowering) over the top
  const faces = [[151.4, 29.7, 151.4, 49.1, -1], [149.3, 25.0, 149.3, 29.7, -1], [151.4, 22.6, 165.5, 22.6, 1], [151.4, 49.1, 152.9, 49.1, -1], [152.9, 49.1, 152.9, 55.3, -1], [152.9, 55.3, 155.9, 55.3, -1], [155.9, 55.3, 155.9, 58.0, -1], [155.9, 58.0, 165.5, 58.0, -1]];
  for (const [a0, b0, a1, b1, sgn] of faces) {
    const len = Math.hypot(a1 - a0, b1 - b0), n = Math.max(1, Math.round(len / 2.1)), ang = Math.atan2(a1 - a0, b1 - b0);
    const nu = (b1 - b0) / len * sgn, nv = -(a1 - a0) / len * sgn;                             // outward (the park side)
    const off = 0.3;
    for (let i = 0; i <= n; i++) {
      const t = i / n, pu = a0 + (a1 - a0) * t + nu * off, pv = b0 + (b1 - b0) * t + nv * off;
      S.box(0.5, 0.7, 0.5, COL.lime, { u: pu, v: pv });
      Mm.box(0.36, 3.7, 0.36, COL.ipe, { u: pu, y: 0.7, v: pv });
      if (i < n) {
        const qu = a0 + (a1 - a0) * (t + 1 / n) + nu * off, qv = b0 + (b1 - b0) * (t + 1 / n) + nv * off, mu = (pu + qu) / 2, mv = (pv + qv) / 2, seg = len / n - 0.36;
        Mm.push(mu, 0, mv, ang);
        lattice(Mm, seg, 0.85, 4.3, 0.32, COL.ipeD);
        Mm.box(0.12, 0.12, seg, COL.ipe, { y: 0.8 }); Mm.box(0.12, 0.12, seg, COL.ipe, { y: 4.3 });
        Mm.pop();
        if (i % 2 === 0) Mt.cyl(0.11, 0.11, 4.4, COL.greenD, { u: mu - nu * 0.2, v: mv - nv * 0.2, seg: 8 });
        L.add(lumpy(1, 0.5, 2, 0.3, 'vine', 0.3, i), { u: mu, y: 4.1, v: mv, ry: ang, sx: 0.8, sz: seg / 2, sy: 1 + (i % 3) * 0.3 }, COL.leafIvyB);
        if (i % 3 !== 1) L.add(lumpy(0.3, 1, 1, 0.12, 'vinedrop', 0.25, i), { u: mu + nu * 0.05, y: 1.2 + (i % 2) * 0.8, v: mv + nv * 0.05, ry: ang, sy: 3.0 - (i % 2) * 0.8, sz: 0.5 + (i % 3) * 0.3 }, COL.leafIvyB);
      }
    }
    // the raised planter along the base: a granite box with clipped evergreens and ivy
    S.box(0.9, 0.55, len, COL.graniteW, { u: (a0 + a1) / 2 + nu * 0.95, v: (b0 + b1) / 2 + nv * 0.95, ry: ang });
    L.add(lumpy(0.85, 0.6, 2.4, 0.26, 'grillbed', 0.3, (a0 * 3) | 0), { u: (a0 + a1) / 2 + nu * 0.95, y: 0.5, v: (b0 + b1) / 2 + nv * 0.95, ry: ang, sz: len / 2.4 }, COL.leafShrub);
  }
  // the roof terrace: a parapet, planters, umbrellas
  for (let v = 25; v < 56; v += 5.5) umbrella(B, 158.5, v, H, 1.4, COL.canvas, { trim: COL.canvasG });
  Mm.box(0.6, 0.35, 0.05, COL.greenD, { u: 150.6, y: 3.4, v: 44.0 });                        // the grill's hanging sign
}
// the two subway stairs inside the 42nd St wall (OSM: u 99-103 and 107-111, the 42 St-Bryant Park station), in the
// wall's gap: a granite parapet with an iron rail round each well, open to the sidewalk, the green globes of an
// entrance that never closes on the parapet's street ends, flagstones round them; the well is a dark void on the ground
// (the flat compile has no hole to go down into), a fence between the two
function subway31(B) {
  const { S, Mt, Mm, G } = B;
  for (const [u0, u1] of [[99, 103], [107, 111]]) {
    const v0 = 135.9, v1 = NV - 0.25, cu = (u0 + u1) / 2, cv = (v0 + v1) / 2, len = v1 - v0;
    coll(cu, cv - 0.15, (u1 - u0) / 2 + 0.3, len / 2 + 0.15, 0, 1.15);
    Mm.box(u1 - u0, 0.012, len, K(0x0b0b0b), { u: cu, y: 0.003, v: cv });
    for (const uu of [u0 - 0.15, u1 + 0.15]) { S.box(0.3, 0.9, len, COL.granite, { u: uu, v: cv }); S.box(0.36, 0.08, len + 0.06, COL.coping, { u: uu, y: 0.9, v: cv }); }
    S.box(u1 - u0 + 0.6, 0.9, 0.3, COL.granite, { u: cu, v: v0 - 0.15 }); S.box(u1 - u0 + 0.66, 0.08, 0.36, COL.coping, { u: cu, y: 0.9, v: v0 - 0.15 });
    // the rail: a top bar on posts along the three parapets
    for (const [a, b] of [[[u0 - 0.15, v0 - 0.15], [u0 - 0.15, v1]], [[u1 + 0.15, v0 - 0.15], [u1 + 0.15, v1]], [[u0 - 0.15, v0 - 0.15], [u1 + 0.15, v0 - 0.15]]]) {
      Mt.tube([a[0], 1.72, a[1]], [b[0], 1.72, b[1]], 0.02, COL.iron);
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(L / 1.2));
      for (let k = 0; k <= n; k++) { const t = k / n; Mt.tube([a[0] + (b[0] - a[0]) * t, 0.98, a[1] + (b[1] - a[1]) * t], [a[0] + (b[0] - a[0]) * t, 1.72, a[1] + (b[1] - a[1]) * t], 0.014, COL.iron, 4); }
    }
    for (const uu of [u0 - 0.15, u1 + 0.15]) {
      Mt.cyl(0.035, 0.05, 1.2, COL.green, { u: uu, y: 0.98, v: v1 - 0.12, seg: 8 });
      Mt.cyl(0.07, 0.05, 0.1, COL.green, { u: uu, y: 2.14, v: v1 - 0.12, seg: 8 });
      G.sphere(0.19, K(0x46d06a), { u: uu, y: 2.4, v: v1 - 0.12, seg: 10 });
    }
  }
  fenceRun(B, 103.45, NV, 106.55, NV);
}
// the cafe's lattice pavilions on the deck: timber frames with lattice sides, a pitched green roof, a counter
function latticePavilion(B, u, v, w, d, y) {
  const { Mm } = B;
  coll(u, v, w / 2 + 0.3, d / 2 + 0.3, y, 3.4);
  Mm.push(u, y, v, 0);
  for (const [x, z] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) Mm.box(0.18, 2.7, 0.18, COL.ipe, { u: x, v: z });
  for (const s of [-1, 1]) { Mm.push(s * w / 2, 0, 0, 0); lattice(Mm, d - 0.2, 0.3, 2.5, 0.28, COL.ipeD); Mm.pop(); }
  Mm.box(w - 0.2, 1.05, 0.5, COL.woodL, { v: d / 2 - 0.25 });
  Mm.prism('gable', GABLE, d + 0.6, COL.roofCu, { y: 2.7, ry: 0, sx: w / 2 + 0.35, sy: 0.9 });
  Mm.pop();
}
// a Hardy Holzman Pfeiffer kiosk: green steel and brown timber, glass above a solid base, a pyramid roof with an open
// globe and a spire on its peak
function hhpKiosk(B, k) {
  const { S, Mt, Gl, Mm } = B;
  const W = k.w, D = k.d, H = 2.6;
  coll(k.u, k.v, W / 2 + 0.2, D / 2 + 0.2, 0, 4.2, k.a);
  for (const b of [S, Mt, Gl, Mm]) b.push(k.u, 0, k.v, k.a);
  S.box(W + 0.1, 0.3, D + 0.1, COL.granite);
  Mm.box(W - 0.1, 0.8, D - 0.1, COL.deckD, { y: 0.3 });                                      // brown timber base
  Gl.box(W - 0.14, H - 1.1, D - 0.14, COL.glass, { y: 1.1 });
  for (const x of [-W / 2 + 0.06, W / 2 - 0.06]) for (const z of [-D / 2 + 0.06, D / 2 - 0.06]) Mt.box(0.12, H - 0.3, 0.12, COL.green, { u: x, y: 0.3, v: z });
  for (const x of [-W / 6, W / 6]) for (const z of [-D / 2 + 0.05, D / 2 - 0.05]) Mt.box(0.07, H - 1.1, 0.07, COL.green, { u: x, y: 1.1, v: z });
  Mt.box(W + 0.04, 0.08, D + 0.04, COL.green, { y: 1.1 });
  Mt.box(W + 0.3, 0.28, D + 0.3, COL.green, { y: H });
  Mm.add(HIP(), { y: H + 0.28, sx: W + 0.8, sz: D + 0.8, sy: 1.25 }, COL.roofCu);
  const ty = H + 0.28 + 1.25;
  Mt.cyl(0.05, 0.07, 0.3, COL.greenD, { y: ty - 0.05, seg: 8 });
  for (const rot of [0, Math.PI / 2]) Mt.add(tpl('ring', () => new THREE.TorusGeometry(0.34, 0.022, 4, 20)), { y: ty + 0.6, ry: rot }, COL.brass);
  Mt.add(tpl('ringH', () => new THREE.TorusGeometry(0.34, 0.022, 4, 20).rotateX(Math.PI / 2)), { y: ty + 0.6 }, COL.brass);
  Mt.cyl(0.012, 0.03, 1.3, COL.brass, { y: ty + 0.2, seg: 6 });
  Mm.add(AWN(), { y: 2.0, v: D / 2 + 0.05, rx: 0.3, sx: W - 0.2, sz: 0.8 }, COL.canvasG);
  Mm.box(0.8, 0.4, 0.03, COL.white, { u: -W / 4, y: 1.55, v: D / 2 + 0.02 });
  for (const b of [S, Mt, Gl, Mm]) b.pop();
}
// Le Carrousel (2002, 6.7 m): teal peaked canopy, an ornate teal valance with gold and bulbs, fourteen animals on brass
// poles, a round platform; a low hoop fence round it, four white urns with conical evergreens
function carousel31(B) {
  const { Mt, Mm, G } = B;
  const { u, v, r } = CAROUSEL31;
  collRound(u, v, r + 1.35, 0, 3.4);
  Mm.cyl(r, r, 0.3, COL.woodL, { u, v, seg: 24 });
  Mt.cyl(r + 0.02, r + 0.02, 0.08, COL.brass, { u, y: 0.24, v, seg: 24, open: true });
  Mm.cyl(0.6, 0.6, 2.7, COL.tealD, { u, y: 0.3, v, seg: 12 });
  G.cyl(0.62, 0.62, 0.8, COL.glowW, { u, y: 1.2, v, seg: 12, open: true });
  Mm.lathe('carcanopy', [[r + 0.45, 0], [r + 0.2, 0.25], [r - 0.6, 0.75], [r * 0.5, 1.3], [r * 0.2, 1.75], [0.12, 2.0], [0.0, 2.05]], COL.teal, { u, y: 3.05, v, seg: 16 });
  Mm.cyl(r + 0.48, r + 0.48, 0.55, COL.tealD, { u, y: 2.55, v, seg: 16, open: true });
  for (let k = 0; k < 16; k++) { const a = (k + 0.5) * Math.PI / 8; Mm.box(0.9, 0.22, 0.08, COL.gold, { u: u + Math.sin(a) * (r + 0.5), y: 2.95, v: v + Math.cos(a) * (r + 0.5), ry: a + Math.PI / 2 }); Mm.box(0.6, 0.18, 0.06, COL.tealD, { u: u + Math.sin(a) * (r + 0.52), y: 3.12, v: v + Math.cos(a) * (r + 0.52), ry: a + Math.PI / 2 }); }
  for (let k = 0; k < 32; k++) { const a = (k + 0.5) * Math.PI / 16; G.sphere(0.04, COL.glowY, { u: u + Math.sin(a) * (r + 0.5), y: 2.6, v: v + Math.cos(a) * (r + 0.5), seg: 4 }); }
  Mt.cyl(0.03, 0.05, 0.7, COL.tealD, { u, y: 5.05, v, seg: 6 });
  Mt.sphere(0.1, COL.tealD, { u, y: 5.4, v, seg: 6 });
  const colors = [COL.white, K(0xd8b060), K(0x6aa04a), K(0xc8a878), K(0xe8e0d0), K(0x8a6a4a), K(0xb8584a)];
  for (let k = 0; k < 14; k++) {
    const ring = k % 2, rr = ring ? 1.55 : 2.55, a = k * (Math.PI * 2 / 14) + ring * 0.2;
    const x = u + Math.sin(a) * rr, z = v + Math.cos(a) * rr, hy = 0.95 + ((k * 7) % 3) * 0.12, c = colors[k % colors.length];
    Mt.cyl(0.022, 0.022, 2.3, COL.brass, { u: x, y: 0.3, v: z, seg: 6 });
    Mm.push(x, 0, z, a + Math.PI / 2);
    Mm.add(tpl('horseBody', () => new THREE.CapsuleGeometry(0.15, 0.52, 3, 8).rotateX(Math.PI / 2)), { y: hy }, c);
    Mm.tube([0, hy + 0.06, 0.3], [0, hy + 0.36, 0.45], 0.08, c, 6);
    Mm.box(0.13, 0.14, 0.3, c, { y: hy + 0.3, v: 0.54, rx: 0.5 });
    for (const [lx, lz] of [[-0.08, 0.24], [0.08, 0.24], [-0.08, -0.24], [0.08, -0.24]]) Mm.tube([lx, hy - 0.05, lz], [lx, hy - 0.45, lz + (lz > 0 ? 0.1 : -0.08)], 0.03, c, 4);
    Mm.pop();
  }
  for (let k = 0; k < 36; k++) {
    if (k === 0 || k === 35) continue;
    const a0 = k * Math.PI / 18, R = r + 1.3;
    Mt.add(HOOP(), { u: u + Math.sin(a0) * R, y: 0.0, v: v + Math.cos(a0) * R, ry: a0 + Math.PI / 2, sx: 0.9, sy: 1.25 }, COL.iron);
  }
  for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + k * Math.PI / 2; urnPlanter(B, u + Math.sin(a) * (r + 1.95), v + Math.cos(a) * (r + 1.95), 0, 0.85); }
}
// the statues where OSM has them: Goethe's bust on a black pedestal by the carousel, Dodge standing on a tall granite
// pedestal (north allee), Stein seated on a plinth (the Grill's forecourt), Bonifacio standing (Sixth Ave)
function statues31(B) {
  const { S, Mt } = B;
  coll(GOETHE31.u, GOETHE31.v, 0.36, 0.36, 0, 2.6); coll(DODGE31.u, DODGE31.v, 0.8, 0.8, 0, 4.8); coll(BONIF31.u, BONIF31.v, 0.8, 0.8, 0, 4.4); coll(STEIN31.u, STEIN31.v, 0.7, 0.7, 0, 2.2);
  { const g = GOETHE31; S.box(0.62, 1.75, 0.62, COL.blackG, { u: g.u, v: g.v }); S.box(0.72, 0.1, 0.72, COL.blackG, { u: g.u, y: 1.75, v: g.v });
    Mt.push(g.u, 1.85, g.v, Math.PI); Mt.add(tpl('bustChest', () => new THREE.CylinderGeometry(0.2, 0.3, 1, 10).translate(0, 0.5, 0)), { sy: 0.42, sz: 0.62 }, COL.bronzeG); Mt.cyl(0.08, 0.09, 0.14, COL.bronze, { y: 0.4, seg: 8 }); Mt.sphere(0.15, COL.bronze, { y: 0.66, sy: 1.18, seg: 10 }); Mt.pop(); }
  for (const [p, a, ph] of [[DODGE31, Math.PI, 2.6], [BONIF31, Math.PI / 2, 2.2]]) {
    S.box(1.6, 0.4, 1.6, COL.granite, { u: p.u, v: p.v }); S.box(1.2, ph - 0.4, 1.2, COL.graniteW, { u: p.u, y: 0.4, v: p.v }); S.box(1.4, 0.2, 1.4, COL.coping, { u: p.u, y: ph, v: p.v });
    Mt.push(p.u, ph + 0.2, p.v, a);
    Mt.add(tpl('coat', () => new THREE.CylinderGeometry(0.26, 0.4, 1, 10).translate(0, 0.5, 0)), { sy: 1.35, sz: 0.8 }, COL.bronzeG);
    Mt.add(tpl('torso', () => new THREE.CylinderGeometry(0.34, 0.44, 1, 10).translate(0, 0.5, 0)), { y: 1.2, sy: 0.75, sx: 0.8, sz: 0.62 }, COL.bronze);
    for (const s of [-1, 1]) Mt.tube([s * 0.33, 1.88, 0], [s * 0.38, 1.25, 0.08], 0.075, COL.bronze);
    Mt.sphere(0.15, COL.bronze, { y: 2.12, sy: 1.15, seg: 10 });
    Mt.pop();
  }
  { const s2 = STEIN31; S.box(1.3, 0.9, 1.3, COL.granite, { u: s2.u, v: s2.v }); S.box(1.4, 0.1, 1.4, COL.coping, { u: s2.u, y: 0.9, v: s2.v });
    Mt.push(s2.u, 1.0, s2.v, -Math.PI / 2); Mt.add(tpl('steinBody', () => new THREE.CylinderGeometry(0.28, 0.58, 1, 9).translate(0, 0.5, 0)), { sy: 0.9, sz: 0.85 }, COL.bronzeG); Mt.box(0.72, 0.26, 0.46, COL.bronze, { y: 0.28, v: 0.3 }); Mt.sphere(0.16, COL.bronze, { y: 1.02, v: 0.02, sy: 1.12, seg: 9 }); Mt.pop(); }
}
// petanque, the putting green, the LOR Porch's bar, the terrace's small gazebo
function games(B) {
  const { Mm, Mt } = B;
  const [a0, a1, b0, b1] = PETANQUE;
  for (const [u, v, w, d] of [[(a0 + a1) / 2, b0, a1 - a0, 0.12], [(a0 + a1) / 2, b1, a1 - a0, 0.12], [a0, (b0 + b1) / 2, 0.12, b1 - b0], [a1, (b0 + b1) / 2, 0.12, b1 - b0]]) Mm.box(w, 0.2, d, COL.deckD, { u, v });
  Mm.box(a1 - a0 - 0.2, 0.02, b1 - b0 - 0.2, K(0xb0a58c), { u: (a0 + a1) / 2, v: (b0 + b1) / 2 });
  const [p0, p1, q0, q1] = PUTTING;
  Mm.box(p1 - p0, 0.04, q1 - q0, COL.turf, { u: (p0 + p1) / 2, v: (q0 + q1) / 2 });
  Mt.cyl(0.01, 0.01, 1.3, COL.white, { u: p0 + 2.5, y: 0.04, v: q0 + 4 }); Mm.box(0.02, 0.2, 0.3, COL.red, { u: p0 + 2.5, y: 1.1, v: q0 + 4.15 });
  const [c0, c1, d0, d1] = PORCH;
  latticePavilion(B, (c0 + c1) / 2, (d0 + d1) / 2, c1 - c0, d1 - d0, 0);
  coll(GAZEBO.u, GAZEBO.v, 1.25, 1.25, TZ.plaza.h, 3.7);
  { const g = GAZEBO, y = TZ.plaza.h; for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + Math.PI / 8; Mt.box(0.1, 2.6, 0.1, COL.green, { u: g.u + Math.sin(a) * 1.15, y, v: g.v + Math.cos(a) * 1.15 }); }
    Mm.add(tpl('octroof', () => new THREE.ConeGeometry(1, 1, 8, 1).translate(0, 0.5, 0)), { u: g.u, y: y + 2.6, v: g.v, sx: 1.55, sz: 1.55, sy: 1.1, ry: Math.PI / 8 }, COL.roofCu);
    Mm.box(1.6, 0.9, 0.9, COL.deckD, { u: g.u, y, v: g.v }); }
}

// the chess tables (a board inlaid on a green steel table, some pieces) and the reading room's carts (from BP31's first pass)
function chessTable(B, c) {
  const { Mt, Mm } = B;
  Mt.cyl(0.05, 0.06, 0.7, COL.green, { u: c.u, v: c.v, seg: 8 });
  Mt.cyl(0.26, 0.3, 0.05, COL.green, { u: c.u, v: c.v, seg: 10 });
  Mt.box(0.72, 0.04, 0.72, COL.green, { u: c.u, y: 0.7, v: c.v });
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) Mm.box(0.06, 0.006, 0.06, (i + j) % 2 ? COL.chessD : COL.chessL, { u: c.u - 0.21 + i * 0.06, y: 0.74, v: c.v - 0.21 + j * 0.06 });
  const r = rng(Math.round(c.u * 97 + c.v));
  for (let k = 0; k < 14; k++) {
    const i = (r() * 8) | 0, j = (r() * 8) | 0;
    Mm.cyl(0.012, 0.018, 0.04 + (r() < 0.25 ? 0.03 : 0), r() < 0.5 ? COL.white : COL.chessD, { u: c.u - 0.21 + i * 0.06, y: 0.746, v: c.v - 0.21 + j * 0.06, seg: 5 });
  }
}
function readingRoom(B) {
  const { Mt, Mm } = B;
  const { u0, u1, v0, v1 } = READING, r = rng(77);
  for (const [cu, cv, a] of [[u0 + 2, v1 - 1.2, Math.PI], [u0 + 6.5, v1 - 0.9, Math.PI], [u1 - 3, v1 - 1.1, Math.PI + 0.15]]) {
    Mm.push(cu, 0, cv, a); Mt.push(cu, 0, cv, a);
    Mm.box(1.5, 0.75, 0.65, COL.canvasG, { y: 0.25 });
    for (const x of [-0.65, 0.65]) for (const z of [-0.25, 0.25]) Mt.cyl(0.07, 0.07, 0.04, COL.iron, { u: x, y: 0.07, v: z - 0.02, rx: Math.PI / 2, seg: 8 });
    Mm.box(1.5, 0.05, 0.75, COL.woodL, { y: 1.0, v: 0.05, rx: -0.35 });
    for (let x = -0.7; x < 0.68;) { const w = 0.03 + r() * 0.04; Mm.box(w, 0.2 + r() * 0.06, 0.16, COL.books[(r() * 6) | 0], { u: x + w / 2, y: 1.02, v: 0.02, rx: -0.35 }); x += w + 0.005; }
    for (const x of [-0.72, 0.72]) Mt.box(0.04, 1.6, 0.04, COL.green, { u: x, y: 0.25, v: -0.3 });
    Mm.box(1.6, 0.06, 0.9, COL.canvas, { y: 1.85, v: 0.05, rx: 0.12 });
    Mm.pop(); Mt.pop();
  }
  Mt.box(0.06, 1.9, 0.06, COL.green, { u: u0 + 9.5, v: v1 - 0.8 });
  Mm.box(1.1, 0.7, 0.05, COL.canvasG, { u: u0 + 9.5, y: 1.3, v: v1 - 0.83 });
  umbrella(B, u0 + 11.5, v0 + 2.6, 0, 1.6, COL.canvasG, { trim: COL.canvasG });
  umbrella(B, u0 + 4.5, v0 + 2.2, 0, 1.6, COL.canvasG, { trim: COL.canvasG });
}

// ---- the chair plan ------------------------------------------------------------------------------------------------
// The movable chairs the way the park's are left through a day (the photos): crowded along the lawn's walk facing the
// lawn, pulled round small tables in twos and fours under the allees and on the gravel panels, rings round the
// fountain, some carried onto the lawn, cafe tables with umbrellas on the terrace and the Grill's forecourt, a few
// alone. Deterministic, so the list the crowd seats people on is the same on every build. A chair is
// { u, v, a, y (height above the park's ground), g (its table group, -1 none), kind, st ('grill' for the Grill's own
// furniture, else null) }: a person seated looks along (sin a, cos a) in (u, v). A table is { u, v, y, sq, a, g, st }.
let _plan = null;
export function bp31Trees() {
  const out = [];
  for (let i = 0; i + 1 < BP_TREES_DM.length; i += 2) out.push([BP_TREES_DM[i] / 10, BP_TREES_DM[i + 1] / 10]);
  return out;
}
function levelAt(u, v) {
  for (const z of [TZ.court, TZ.deck, TZ.plaza, TZ.north]) if (u > z.u0 && u < z.u1 && v > z.v0 && v < z.v1) return z.h;
  const P = FPLAZA;
  if ((u > P.u0 && u < FOUNT31[0] && v > P.v0 && v < P.v1) || (u >= FOUNT31[0] && Math.hypot(u - FOUNT31[0], v - FOUNT31[1]) < P.r) || (u > FOUNT31[0] && u < P.u1 && v > P.v0 && v < P.v1)) return P.h;
  return 0;
}
export function bp31LevelAt(u, v) { return levelAt(u, v); }
export function bp31Plan() {
  if (_plan) return _plan;
  const r = rng(20260928);
  const chairs = [], tables = [], umbrellas = [];
  // obstacles: small ones in a 4 m grid (the 419 trees and every chair placed), the few big ones in a list
  const big = [], grid = new Map(), rects = [];
  const obst = { push(...os) { for (const o of os) { if (o[2] > 1.8) { big.push(o); continue; } const k = Math.floor(o[0] / 4) * 1000 + Math.floor(o[1] / 4); let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(o); } } };
  const clear = (u, v, rad) => {
    for (const o of big) if ((u - o[0]) ** 2 + (v - o[1]) ** 2 < (rad + o[2]) ** 2) return false;
    const cu = Math.floor(u / 4), cv = Math.floor(v / 4);
    for (let i = cu - 1; i <= cu + 1; i++) for (let j = cv - 1; j <= cv + 1; j++) { const a = grid.get(i * 1000 + j); if (a) for (const o of a) if ((u - o[0]) ** 2 + (v - o[1]) ** 2 < (rad + o[2]) ** 2) return false; }
    for (const q of rects) if (u > q[0] - rad && u < q[1] + rad && v > q[2] - rad && v < q[3] + rad) return false;
    return true;
  };
  for (const [u, v] of bp31Trees()) obst.push([u, v, 0.55]);
  for (const p of lampSpots31()) obst.push([p[0], p[1], 0.5]);
  for (const p of binSpots31()) obst.push([p[0], p[1], 0.5]);
  for (const b of BEDS) rects.push([b[0], b[1], b[2], b[3]]);
  for (const [v0, v1] of BORDER_V) rects.push([32.1, 124.4, v0 - 0.2, v1 + 0.2]);
  for (const v of [ENCL.vS, ENCL.vN]) rects.push([ENCL.u0, ENCL.u1, v - 0.4, v + 0.4]);
  rects.push([131.5, 132.5, 21.4, 48.7]);                                                         // the forecourt's wall
  for (const k of KIOSK31) rects.push([k.u - k.w / 2 - 1.2, k.u + k.w / 2 + 1.2, k.v - k.d / 2 - 1.2, k.v + k.d / 2 + 1.2]);
  for (const g of GRILL31) rects.push([g[0] - 1.9, g[1], g[2] - 1.9, g[3] + 0.6]);
  rects.push([READING.u0, READING.u1, READING.v0 + 2.8, READING.v1 + 0.6]);
  for (const c of CHESS) obst.push([c.u, c.v, 0.5]);
  rects.push(PETANQUE, PUTTING, [PORCH[0] - 0.8, PORCH[1] + 0.8, PORCH[2] - 0.8, PORCH[3] + 0.8], [RESTROOM31.u0 - 0.5, RESTROOM31.u1 + 0.5, RESTROOM31.v0 - 0.5, 140], [HOUSE40.u0 - 0.5, HOUSE40.u1 + 0.5, -1, HOUSE40.v1 + 0.5]);
  obst.push([CAROUSEL31.u, CAROUSEL31.v, CAROUSEL31.r + 1.7], [GOETHE31.u, GOETHE31.v, 0.9], [DODGE31.u, DODGE31.v, 1.3], [STEIN31.u, STEIN31.v, 1.2], [BONIF31.u, BONIF31.v, 1.2], [GAZEBO.u, GAZEBO.v, 1.7]);
  obst.push([FOUNT31[0], FOUNT31[1], 6.3]);
  for (const k of [[33.4, 67.0], [25.9, 66.2], [25.6, 74.5], [32.9, 74.9]]) obst.push([k[0], k[1], 1.2]);
  // the steps and their approaches, the stair tops, the memorial and its court's steps
  rects.push([TZ.plaza.u0 - 1.2, TZ.plaza.u0 + 6 * TREAD + 1.0, BROAD.v0, BROAD.v1], [TZ.north.u0 - 1.2, TZ.north.u0 + 6 * TREAD + 1.0, NFLIGHT.v0 - 0.4, NFLIGHT.v1 + 0.4]);
  rects.push([MEM31.u - 3.6, TZ.court.u1, MEM31.v - 6.8, MEM31.v + 6.8], [TZ.court.u0 - 0.3, TZ.court.u0 + 3 * TREAD + 0.4, TZ.court.v0, TZ.court.v1]);
  rects.push([STFLIGHT.u0 - 0.6, STFLIGHT.u1 + 0.6, TZ.north.v1 - 1.2, 141]);
  for (const vf of [93.9, 108.1]) rects.push([TZ.deck.u0 - 1.6, TZ.deck.u0 + 1.2, vf - 1.6, vf + 1.6]);
  rects.push([TZ.deck.u0 - 0.2, TZ.deck.u0 + 0.8, TZ.deck.v0, TZ.deck.v1]);                            // the deck's planting boxes
  // the walkers' lanes down the four walks, the ways in from the gates and from Sixth Avenue
  for (const w of WALK_LINES) rects.push([w.u0 - 2, w.u1 + 2, w.v - 1.15, w.v + 1.15]);
  for (const u of GATES40) rects.push([u - 2.2, u + 2.2, 0, 8.6]);
  for (const u of GATES42) rects.push([u - 2.2, u + 2.2, 124.2, 140]);
  rects.push([-1, FPLAZA.u0 + 3, 60.3, 80.8], [ENCL.gaps[0][0], ENCL.gaps[0][1], 31, 43.3], [ENCL.gaps[1][0], ENCL.gaps[1][1], 31, 43.3], [ENCL.gaps[0][0], ENCL.gaps[0][1], 97.4, 110.2], [ENCL.gaps[1][0], ENCL.gaps[1][1], 97.4, 110.2]);
  // the plaza's axis from the broad stair to the memorial is walked, not sat on
  rects.push([TZ.plaza.u0 + 2, TZ.plaza.u1, MEM31.v - 3.5, MEM31.v + 3.5]);
  let g = 0, style = null;   // style 'grill': the Grill's own rattan chairs and marble tables (the forecourt, ref5)
  const add = (u, v, a, o) => { chairs.push({ u, v, a, y: levelAt(u, v), g: o.g ?? -1, kind: o.kind, st: style }); obst.push([u, v, 0.32]); };
  const lawnward = (u, v) => {
    const L = LAWN31, tu = Math.min(Math.max(u, L.u0 + 8), L.u1 - 6), tv = Math.min(Math.max(v, L.v0 + 5), L.v1 - 5);
    const a = Math.atan2(tu - u, tv - v);
    return r() < 0.7 ? a : a + (r() - 0.5) * Math.PI;
  };
  const cluster = (u, v, kind, sqP = 0, rad = 0) => {
    const a0 = r() * Math.PI * 2;
    if (!clear(u, v, rad || (kind === 'lone' ? 0.4 : kind === 'duo' ? 0.95 : 1.2))) return false;
    if (kind === 'lone') { add(u, v, lawnward(u, v) + (r() - 0.5) * 1.4, { kind }); return true; }
    if (kind === 'duo') {
      const a = lawnward(u, v) + (r() - 0.5) * 0.9, px = Math.cos(a), pz = -Math.sin(a);
      add(u + px * 0.33, v + pz * 0.33, a - 0.25, { kind, g }); add(u - px * 0.33, v - pz * 0.33, a + 0.25, { kind, g }); g++;
      return true;
    }
    const n = kind === 'table4' ? 4 : kind === 'table3' ? 3 : kind === 'table1' ? 1 : 2;
    const sq = r() < sqP;
    tables.push({ u, v, y: levelAt(u, v), sq, a: a0, g, st: style });
    for (let c = 0; c < n; c++) {
      const a = a0 + (c / n) * Math.PI * 2 + (sq ? 0 : (r() - 0.5) * (n === 2 ? 0.35 : 0.5)), rr = 0.56 + r() * 0.14;
      add(u + Math.sin(a) * rr, v + Math.cos(a) * rr, a + Math.PI + (r() - 0.5) * 0.5, { kind, g });
    }
    obst.push([u, v, 0.45]);
    g++;
    return true;
  };
  const pick = (w) => { let x = r() * w.reduce((s, e) => s + e[1], 0); for (const [k, p] of w) { if ((x -= p) <= 0) return k; } return w[0][0]; };
  const MIX = [['table2', 0.34], ['table4', 0.18], ['table3', 0.1], ['table1', 0.06], ['duo', 0.15], ['lone', 0.17]];
  const CAFE = [['table2', 0.45], ['table4', 0.35], ['table3', 0.12], ['table1', 0.08]];
  const scatter = (u0, u1, v0, v1, perM2, mix, sqP = 0) => {
    const n = Math.round((u1 - u0) * (v1 - v0) * perM2);
    let placed = 0;
    for (let i = 0; i < n * 5 && placed < n; i++) if (cluster(u0 + r() * (u1 - u0), v0 + r() * (v1 - v0), pick(mix), sqP)) placed++;
  };
  const row = (u0, v0, u1, v1, a, gapP) => {
    const len = Math.hypot(u1 - u0, v1 - v0), n = Math.floor(len / 0.58);
    for (let k = 0; k < n; k++) {
      if (r() < gapP) continue;
      const t = (k + 0.5) / n, u = u0 + (u1 - u0) * t + (r() - 0.5) * 0.12, v = v0 + (v1 - v0) * t + (r() - 0.5) * 0.12;
      if (clear(u, v, 0.28)) add(u, v, a + (r() - 0.5) * 0.35, { kind: 'row' });
    }
  };
  const L = LAWN31;
  // along the lawn's walk (ref3, its north side: tables with chairs packed in a line at the lawn's edge, breaks between
  // them, a row facing the lawn here and there): runs of 3-8 tables 1.9-2.4 m apart, 0.75 m in from the edge row's
  // line, packed the way a cafe packs them (0.8 m clearance, where the scatter's 1.2 m placed only half of them), or
  // rows of chairs facing the lawn (a quarter of the runs on the south side, 60 % on the north, where teaser 3's
  // skim looks along them); the flagstone strip and 0.7 m of the walk are left to pass on. A 3 m gap at u 70 on the
  // south walk: teaser 3's crane rises from (70, 41.8) at 1.8 m, head height over a table band
  rects.push([68.4, 71.6, L.v0 - 2.8, L.v0]);
  const TMIX = [['table2', 0.4], ['table4', 0.35], ['table3', 0.25]];
  for (const [vr, a, s, pRow] of [[L.v0 - 0.6, 0, -1, 0.25], [L.v1 + 0.6, Math.PI, 1, 0.6]]) for (let u = 52; u < L.u1 - 1;) {
    if (r() < pRow) { const len = 3 + r() * 9; row(u, vr, Math.min(L.u1 - 1, u + len), vr, a, 0.1); u += len + 1.0 + r() * 2; continue; }
    for (let k = 0, nt = 3 + ((r() * 6) | 0); k < nt && u < L.u1 - 1.5; k++) { cluster(u + 0.9, vr + s * 0.75, pick(TMIX), 0, 0.8); u += 1.9 + r() * 0.5; }
    u += 0.8 + r() * 1.7;
  }
  row(L.u1 + 0.7, L.v0 + 6, L.u1 + 0.7, 66.8, -Math.PI / 2, 0.25); row(L.u1 + 0.7, 71.2, L.u1 + 0.7, L.v1 - 6, -Math.PI / 2, 0.25);
  scatter(52, L.u1, 40.5, L.v0 - 0.9, 1 / 9, MIX); scatter(52, L.u1, L.v1 + 0.9, 100.9, 1 / 9, MIX);
  scatter(L.u1 + 1.6, 131.2, 36, 105, 1 / 11, MIX);
  // carried onto the lawn (ref2: chairs and tables all over it on a fine day, thickest near the edges, people on the
  // grass between): 30 groups within 9 m of the long edges, 14 anywhere
  for (let k = 0; k < 44; k++) {
    const u = L.u0 + 16 + r() * (L.u1 - L.u0 - 22), v = k < 30 ? (r() < 0.5 ? L.v0 + 1.5 + r() * 7.5 : L.v1 - 1.5 - r() * 7.5) : L.v0 + 5 + r() * (L.v1 - L.v0 - 10);
    const q = r();
    cluster(u, v, q < 0.36 ? 'duo' : q < 0.62 ? 'table2' : q < 0.72 ? 'table4' : 'lone');
  }
  // the chess players: two chairs to a board
  for (const c of CHESS) { for (const s2 of [-1, 1]) add(c.u + s2 * 0.62, c.v, s2 > 0 ? -Math.PI / 2 : Math.PI / 2, { kind: 'chess', g }); g++; }
  // round the fountain on its plaza, facing the water
  for (let k = 0; k < 56; k++) {
    if (r() < 0.4) continue;
    const a = (k / 56) * Math.PI * 2, rr = 6.9 + r() * 0.8, u = FOUNT31[0] + Math.sin(a) * rr, v = FOUNT31[1] + Math.cos(a) * rr;
    if (clear(u, v, 0.28)) add(u, v, a + Math.PI + (r() - 0.5) * 0.5, { kind: 'fountain' });
  }
  scatter(FPLAZA.u0 + 1, FPLAZA.u1 + 8, FPLAZA.v0 + 1, FPLAZA.v1 - 1, 1 / 14, MIX);
  // the allee walks' edges (not their middles), the gravel panels, the carousel's
  for (const w of WALK_LINES) for (const s of [-1, 1]) scatter(w.u0, w.u1, w.v + s * 1.25, w.v + s * 2.0, 1 / 5, MIX);
  for (const [u0, u1, v0, v1] of PANELS) scatter(u0 + 0.5, u1 - 0.5, v0 + 0.5, v1 - 0.5, 1 / 8, MIX);
  scatter(0.5, 31, 17.5, 50, 1 / 16, MIX); scatter(0.5, 31, 90.5, 124, 1 / 16, MIX);
  scatter(30.9, 53.9, 124.6, 132.7, 1 / 18, MIX);
  // the terrace: cafe tables on the plaza and the north terrace, the deck's under umbrellas, the Grill's forecourt
  const t0 = tables.length;
  scatter(TZ.plaza.u0 + 3, TZ.plaza.u1 - 0.4, TZ.plaza.v0 + 1, TZ.plaza.v1 - 0.6, 1 / 10, CAFE, 0.5);
  scatter(TZ.north.u0 + 3, TZ.north.u1 - 0.6, TZ.north.v0 + 0.6, TZ.north.v1 - 1, 1 / 9, CAFE, 0.5);
  scatter(TZ.deck.u0 + 1.2, TZ.deck.u1 - 0.6, TZ.deck.v0 + 0.8, TZ.deck.v1 - 0.8, 1 / 6.5, CAFE, 0.7);
  // the Grill's forecourt: its own furniture set out the way a restaurant sets it (ref5: rattan bistro chairs round
  // marble-top tables in lines along the trellis, a band ~7 m deep), three lines 2.4 m apart with tables every 2.3 m, one
  // in seven left out; the rest of the forecourt has the park's own chairs, thinly (the v3 stills scattered green chairs
  // over all of it at 1 group in 7.5 m2 and it read as a canteen)
  style = 'grill';
  for (const ug of [148.3, 145.9, 143.5]) for (let vg = 5.2; vg < 47.2; vg += 2.3) {
    if (r() < 0.14) continue;
    const q = r();
    cluster(ug + (r() - 0.5) * 0.3, vg + (r() - 0.5) * 0.3, q < 0.5 ? 'table2' : q < 0.85 ? 'table4' : 'table3', 0, 0.7);
  }
  style = null;
  scatter(132.5, 142.2, 3, 47.5, 1 / 16, MIX, 0);
  // umbrellas: most of the cafe deck's tables (green), a quarter of the Grill's (cream), few on the terrace's plaza
  // (the v3 stills' plaza was a field of them; the references show it open)
  for (let i = t0; i < tables.length; i++) {
    const t = tables[i], grill = t.st === 'grill';
    if (r() < (grill ? 0.25 : t.y > 1 ? 0.6 : 0.12)) umbrellas.push({ u: t.u, v: t.v, y: t.y, sq: t.sq, a: t.a, col: grill ? COL.canvas : t.y > 1 ? COL.canvasG : (r() < 0.6 ? COL.canvas : COL.canvasG) });
  }
  _plan = { chairs, tables, umbrellas, groups: g };
  return _plan;
}
// the lamps: along the allee walks every ~16 m (staggered), in the ivy beds' edges; round the fountain plaza. The inner
// walks have them on the ivy side only: their lawn side is the enclosure's balustrade (v 34.9 / 106.4), where the v3
// stills stood a post on the rail. None along the lawn's own walk (ref3 looks down its whole north side: no post in it).
export function lampSpots31() {
  const out = [];
  for (const w of WALK_LINES) for (const s of [-1, 1]) {
    if ((w.v > 30 && w.v < 40 && s > 0) || (w.v > 100 && w.v < 115 && s < 0)) continue;
    for (let u = w.u0 + 4 + (s > 0 ? 8 : 0); u < w.u1 - 2; u += 16) out.push([u, w.v + s * 2.45]);
  }
  for (const a of [0.9, 2.25, 4.05, 5.4]) out.push([FOUNT31[0] + Math.sin(a) * 9.6, FOUNT31[1] + Math.cos(a) * 9.6]);
  return out;
}
// the walks' bins at the edge away from the enclosure (1.85 m off the walk's middle, the walkers' lane is 1.15), the
// lawn walk's corners and openings, the carousel, the fountain plaza, the entrances, the kiosks
function binSpots31() {
  const out = [];
  for (const w of WALK_LINES) { const s = w.v < 25 ? 1 : w.v < 60 ? -1 : w.v < 115 ? 1 : -1; for (const u of [w.u0 + 12, (w.u0 + w.u1) / 2, w.u1 - 10]) out.push([u, w.v + s * 1.85]); }
  for (const [u, v] of [[36, 41.2], [90, 41.2], [36, 99.4], [90, 99.4], [123.6, 45], [123.6, 95], [CAROUSEL31.u + 5.3, CAROUSEL31.v - 3.2], [8, 58.5], [8, 83], [61.2, 17.3], [66.8, 123.95]]) out.push([u, v]);
  for (const k of KIOSK31) out.push([k.u + k.w / 2 + 0.8, k.v]);
  return out;
}
// the Grill's footprint (and a metre round it), for the caller's building skip
export function bp31InGrill(u, v) { return GRILL31.some(([u0, u1, v0, v1]) => u > u0 - 1 && u < u1 + 1 && v > v0 - 1 && v < v1 + 1); }
export const BP31_EXTENT = { u1: 165.7, v1: 140.2 };

// ---- the whole park -----------------------------------------------------------------------------------------------
// F: the frame map { SW, U, V }; y: the park's ground (world). Returns a census per mesh.
export function bp31Build(group, y, F) {
  const MT = kitMats();
  const B = { S: new Bin(), Mb: new Bin(), Mt: new Bin(), Gl: new Bin(), Mm: new Bin(), L: new Bin({ uv: true }), Fl: new Bin({ uv: true }), G: new Bin() };
  const r = rng(4417);
  const first = !_collDone;
  if (first) COLL = [];
  collRound(FOUNT31[0], FOUNT31[1], 5.2, FPLAZA.h, 2.3);
  for (const [u, v] of [[33.4, 67.0], [25.9, 66.2], [25.6, 74.5], [32.9, 74.9]]) coll(u, v, 0.95, 0.95, FPLAZA.h, 0.5);
  for (const h of [RESTROOM31, HOUSE40]) coll((h.u0 + h.u1) / 2, (h.v0 + h.v1) / 2, (h.u1 - h.u0) / 2 + 0.1, (h.v1 - h.v0) / 2 + 0.1, 0, 4.4);
  for (const p of PING31) coll(p.u, p.v, 1.42, 0.82, 0, 0.8);
  // the beds: ivy under the planes, the seasonal beds along the walls, the lawn's borders
  for (const b of BEDS) ivyBed(B, b[0], b[1], b[2], b[3], r, { shrubs: (b[3] - b[2]) > 7 && (b[2] < 7 || b[3] > 130) });
  for (const [v0, v1] of BORDER_V) for (const [u0, u1] of BORDER_U) borderBed(B, u0, u1, v0, v1, v0 < 60 ? v1 : v0, r);
  enclosure(B);
  lawnEdge(B);
  // cast iron drain grates in the flagstone strips along the borders (the photos), every 12 m
  for (const vv of [39.95, 101.45]) for (let u = 38; u < 123; u += 12) B.Mt.box(0.62, 0.02, 0.36, COL.ironD, { u, y: 0.004, v: vv });
  // the gravel panels' granite edging
  for (const [u0, u1, v0, v1] of PANELS) { for (const vv of [v0, v1]) B.S.box(u1 - u0, 0.1, 0.16, COL.coping, { u: (u0 + u1) / 2, v: vv }); for (const uu of [u0, u1]) B.S.box(0.16, 0.1, v1 - v0, COL.coping, { u: uu, v: (v0 + v1) / 2 }); }
  // the fountain's plaza and basins, the terrace, the memorial, the Grill, the cafe's pavilions
  fountainPlaza(B);
  fountainLobes(B, FPLAZA.h);
  terrace(B);
  memorial31(B);
  grill31(B);
  latticePavilion(B, 157.5, 101.5, 4.2, 3.2, TZ.deck.h);
  latticePavilion(B, 157.5, 116.0, 4.2, 3.2, TZ.deck.h);
  // the small buildings, the kiosks, the carousel, the statues, the games
  stoneHouse(B, RESTROOM31); stoneHouse(B, HOUSE40);
  for (const k of KIOSK31) hhpKiosk(B, k);
  carousel31(B);
  statues31(B);
  for (const p of PING31) pingpong(B, p);
  for (const c of CHESS) { chessTable(B, c); coll(c.u, c.v, 0.4, 0.4, 0, 0.8); }
  readingRoom(B);
  coll((READING.u0 + READING.u1) / 2, READING.v1 - 1.0, (READING.u1 - READING.u0) / 2, 0.8, 0, 2.0);
  games(B);
  // the street walls with their railings, the gates' piers, the Sixth Avenue wall and the main entrance's urns
  for (const [a, b] of WALLS40) fenceRun(B, a, SV, b, SV);
  for (const [a, b] of WALLS42) fenceRun(B, a, NV, b, NV);
  subway31(B);
  for (const [a, b] of WALLS6) fenceRun(B, WU, a, WU, b);
  fenceRun(B, WU, 117.0, 13.5, 117.0);
  for (const u of GATES40) if (Math.abs(u - 63.5) > 1) gatePiers(B, u, SV, 1);
  for (const u of GATES42) if (Math.abs(u - 63.4) > 1) gatePiers(B, u, NV, -1);
  for (const [vv, ends] of [[SV, MID40], [NV, MID42]]) for (const u of ends) {
    B.S.box(0.9, 1.9, 0.9, COL.granite, { u, v: vv }); B.S.box(1.02, 0.14, 1.02, COL.coping, { u, y: 1.9, v: vv });
    urnPlanter(B, u, vv, 2.04, 0.7);
  }
  for (const vv of [60.3 - 0.45, 80.8 + 0.45]) {
    B.S.box(0.9, 2.1, 0.9, COL.granite, { u: WU, v: vv }); B.S.box(1.02, 0.14, 1.02, COL.coping, { u: WU, y: 2.1, v: vv });
    urnPlanter(B, WU, vv, 2.24, 0.75);
  }
  for (const u of [58.6, 68.2]) { urnPlanter(B, u, 5.0, 0, 0.9); urnPlanter(B, u, 135.8, 0, 0.9); }
  // lamps, bins
  for (const [u, v] of lampSpots31()) lampPost(B, u, v, levelAt(u, v));
  for (const [u, v] of binSpots31()) slatBin(B, u, v, levelAt(u, v));
  // the umbrellas over the plan's tables
  const P = bp31Plan();
  for (const q of P.umbrellas) umbrella(B, q.u, q.v, q.y, q.sq ? 1.45 : 1.25, q.col, { square: q.sq, a: q.a, trim: q.col === COL.canvas ? COL.canvasG : COL.canvas });
  for (const t of P.tables) coll(t.u, t.v, 0.36, 0.36, t.y, 0.75);
  // every chair too, its footprint (0.44 wide, 0.48 deep with the crossed legs) to the back's top, turned with it: the
  // walkers' furniture boxes (peds.js _obsAddCampus) make them step round a chair, not through it
  for (const c of P.chairs) coll(c.u, c.v, 0.22, 0.24, c.y, 0.9, c.a);
  if (first) {
    const ry0 = Math.atan2(F.U[1], F.U[0]);
    for (const [u, v, hw, hd, y0, h, a] of COLL) {
      COLLIDERS.addBox('kit31', { x: F.SW[0] + F.U[0] * u + F.V[0] * v, y: y + y0 + h / 2, z: F.SW[1] + F.U[1] * u + F.V[1] * v, hw, hh: h / 2, hd, rotY: ry0 + a });
    }
    if (typeof window !== 'undefined') window.__BP31_COLL = COLL.length;
    COLL = null; _collDone = true;
  }
  const out = [];
  const add = (b, mat, name, o) => { const m = b.build(F, y, mat, name, o); if (m) { group.add(m); out.push({ name, tris: b.tris }); } };
  add(B.S, MT.stone, 'bp31:stone');
  add(B.Mb, MT.marble, 'bp31:marble');
  add(B.Mt, MT.metal, 'bp31:metal');
  add(B.Gl, MT.glass, 'bp31:glass', { cast: false });
  add(B.Mm, MT.matte, 'bp31:matte');
  add(B.L, MT.leaf, 'bp31:leaf', { uvM: 1.1 });
  add(B.Fl, MT.flower, 'bp31:flowers', { uvM: 1.6 });
  add(B.G, MT.glow, 'bp31:glow', { cast: false });
  return out;
}

// ---- the movable chair and the cafe tables, one geometry each (local +z = the chair's front) -----------------------
// The park's folding bistro chair: five seat slats on a steel frame, three curved back slats between the back legs'
// uprights, tube legs, a stretcher; the round bistro table; the terrace's square cafe table.
export function chairGeo31() {
  const B = new Bin();
  const c = COL.white;
  for (let i = 0; i < 5; i++) B.box(0.4, 0.014, 0.062, c, { y: 0.445, v: -0.16 + i * 0.08 });
  for (const s of [-1, 1]) B.box(0.02, 0.025, 0.42, c, { u: s * 0.19, y: 0.425, v: 0 });
  // the folding bistro chair's crossed legs (the photos): each side, the back frame runs from the backrest's top down
  // past the seat's rear to the floor at the front, and the front leg from the seat's front to the floor behind
  for (const s of [-1, 1]) {
    B.tube([s * 0.2, 0.88, -0.25], [s * 0.2, 0.44, -0.17], 0.011, c, 6);
    B.tube([s * 0.2, 0.44, -0.17], [s * 0.205, 0, 0.21], 0.011, c, 6);
    B.tube([s * 0.19, 0.44, 0.18], [s * 0.185, 0, -0.22], 0.011, c, 6);
  }
  for (let i = 0; i < 3; i++) B.box(0.38, 0.05, 0.012, c, { y: 0.6 + i * 0.1, v: -0.195 - i * 0.017, rx: -0.16 });
  B.tube([-0.205, 0.1, 0.16], [0.205, 0.1, 0.16], 0.009, c, 5);
  B.tube([-0.19, 0.1, -0.17], [0.19, 0.1, -0.17], 0.009, c, 5);
  return plainGeo(B);
}
export function tableGeo31(square) {
  const B = new Bin();
  const c = COL.white;
  if (square) { B.box(0.7, 0.025, 0.7, c, { y: 0.715 }); B.box(0.66, 0.05, 0.66, c, { y: 0.67 }); }
  else { B.cyl(0.3, 0.3, 0.025, c, { y: 0.715, seg: 20 }); B.cyl(0.29, 0.29, 0.04, c, { y: 0.675, seg: 20, open: true }); }
  B.cyl(0.022, 0.028, 0.68, c, { seg: 8 });
  for (let k = 0; k < 3; k++) { const a = k * Math.PI * 2 / 3; B.tube([0, 0.06, 0], [Math.sin(a) * 0.26, 0.0, Math.cos(a) * 0.26], 0.012, c, 5); }
  return plainGeo(B);
}
// the Grill's rattan bistro chair (ref5): a round woven seat, four legs, the rear ones running on up into a back band
// that wraps round the sitter from side to side, leaning back a little, a top rail, a ring stretcher. Frame and weave
// are one tone at this scale (the instance colour carries the rattan). Seat top 0.46 m and its back 0.24 m behind the
// seat's centre, like the park chair's (bpSeats' seat point holds for both).
export function chairGeoRattan31() {
  const B = new Bin();
  const c = COL.white, t0 = Math.PI - 1.31, tl = 2.62, bz = -0.04;
  B.cyl(0.215, 0.2, 0.05, c, { y: 0.41, seg: 14, sz: 0.93 });
  for (const s of [-1, 1]) {
    B.tube([s * 0.16, 0.42, 0.14], [s * 0.19, 0, 0.19], 0.012, c, 6);
    B.tube([s * 0.17, 0, -0.2], [s * 0.185, 0.42, -0.14], 0.012, c, 6);
    B.tube([s * 0.185, 0.42, -0.14], [s * 0.2, 0.84, -0.13], 0.012, c, 6);
  }
  const band = (inv) => tpl('rband', () => new THREE.CylinderGeometry(1, 1, 1, 10, 1, true, t0, tl).translate(0, 0.5, 0), inv);
  for (const inv of [false, true]) B.add(band(inv), { y: 0.62, v: bz, sx: 0.215, sz: 0.2, sy: 0.21, rx: -0.12 }, c);
  for (let k = 0; k < 6; k++) {
    const a0 = t0 + tl * k / 6, a1 = t0 + tl * (k + 1) / 6, lean = -0.025;
    B.tube([Math.sin(a0) * 0.215, 0.835, bz + lean + Math.cos(a0) * 0.2], [Math.sin(a1) * 0.215, 0.835, bz + lean + Math.cos(a1) * 0.2], 0.013, c, 5);
  }
  for (let k = 0; k < 8; k++) { const a0 = k * Math.PI / 4, a1 = (k + 1) * Math.PI / 4; B.tube([Math.sin(a0) * 0.18, 0.16, Math.cos(a0) * 0.18], [Math.sin(a1) * 0.18, 0.16, Math.cos(a1) * 0.18], 0.008, c, 4); }
  return plainGeo(B);
}
// the Grill's table: a round white marble top on a black cast-iron pedestal and foot, two tones in its vertex colours
export function tableGeoGrill31() {
  const B = new Bin();
  const top = new THREE.Color(0.86, 0.85, 0.82), iron = new THREE.Color(0.04, 0.04, 0.038);
  B.cyl(0.3, 0.3, 0.03, top, { y: 0.715, seg: 20 });
  B.cyl(0.07, 0.07, 0.04, iron, { y: 0.675, seg: 8 });
  B.cyl(0.024, 0.03, 0.68, iron, { seg: 8 });
  B.lathe('tfoot', [[0.24, 0], [0.235, 0.035], [0.13, 0.07], [0.055, 0.13], [0.03, 0.2]], iron, { seg: 12 });
  return plainGeo(B, true);
}
// a bin's parts as a plain local geometry (no park map; colours only when asked)
function plainGeo(B, colors = false) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(B.P.slice(0, B.n * 3), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(B.N.slice(0, B.n * 3), 3));
  if (colors) g.setAttribute('color', new THREE.BufferAttribute(B.C.slice(0, B.n * 3), 3));
  g.computeBoundingSphere();
  return g;
}
export { COL as BP31_COL };
