// AR33 custom builders and sign marks, segment bid3: Adam Clayton Powell Jr. Boulevard to Lenox Avenue. Specs name them as 'bid3:<fn>' (docs/notes/ar33-spec.md).
// Owner: the BID3 worker (docs/notes/ar33-bid3.md). Measurements come from orthographic elevations rectified out of the
// each builder
// names its references. Everything is placed through the kit's frame (frame.kit: u along the front from its left end as
// seen from the street, y over the sidewalk, w out of the wall), so it merges into the kit's per-material meshes.
import * as THREE from 'three';
import { ENV, applyLightTrim } from '../../../world/materials.js';
import { buildSign } from '../signKit.js';
import { pbrMaterial } from '../../mat/pbrLib.js';
import { towerGlass, litHall, selfLit, panelMat, curtain, paleMullion, wallMat } from './bid3Util.js';
export { koch } from './bid3Koch.js';   // the Koch & Co. building, 132 W 125th (its own file)

// ------------------------------------------------------------------ own materials
// The towers' curtain walls are drawn as opaque reflective glass (no interior behind a 60 m wall of glass to show
// through); a share of the vision panes is lit from inside after dark (ENV.night).
function nightLit(m) {
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    sh.uniforms.b3N = ENV.night;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float b3N;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= b3N;');
  };
  m.customProgramCacheKey = () => (prevKey ? prevKey.call(m) : '') + '|b3lit';
  return m;
}
let _M = null;
function mats() {
  if (_M) return _M;
  const S = (o) => applyLightTrim(new THREE.MeshStandardMaterial(o));
  _M = {
    // the State Office Building's glass: the library's opaque tower glass with a
    // body of our own, three tones of vision pane so the wall is not one flat colour
    // three height classes (the reflected sky grows with height: the measured glass reads (108,120,121) low, (121,132,134) at
    // mid height and (146,148,141) near the top), each in three tones of vision pane so the wall is not one flat colour
    // (w2b re-measure: low (85,112,108) vs (85,101,100), mid (79-80,104-108,105-107) vs (90-107,103-121,108-123): the mid class went
    // too dark and both too green: the mid bodies half way back, less green in the low tint)
    set: [['#706e5e', '#838478', '#5d5b4b'], ['#999485', '#aaa89d', '#827d6e'], ['#b19f80', '#c1b296', '#978669']].map((c, k) => ({
      vision: towerGlass('glass_tower_green', c[0], 1 + k * 10, null, k === 0 ? '#aec6c0' : null),
      visionB: towerGlass('glass_tower_green', c[1], 2 + k * 10, null, k === 0 ? '#aec6c0' : null),
      visionC: towerGlass('glass_tower_green', c[2], 3 + k * 10, null, k === 0 ? '#aec6c0' : null),
      lit: towerGlass('glass_tower_green', c[1], 4 + k * 10, [0xffe6c4, 0.7]),
    })),
    spandrel: towerGlass('glass_tower_grey', '#434e4c', 5),
    mullion: paleMullion(),     // pale anodised aluminium
    vent: S({ color: 0x141618, roughness: 0.7, metalness: 0.3 }),
    lobbyLit: nightLit(S({ color: 0x9a9388, roughness: 0.6, metalness: 0.0, emissive: 0xfff1d8, emissiveIntensity: 1.0 })),
    interior: S({ color: 0x4a4540, roughness: 0.8, metalness: 0.0 }),
    // the Studio Museum
    // the glass of the boxes reflects the sky
    smGlass: towerGlass('glass_tower_grey', '#8a8e90', 71),   // (wave 2: the tall box read (81,107,131) on w2b, the real (124,137,143))
    smGlassDk: towerGlass('glass_tower_grey', '#3f4549', 73),
    smGlassMirror: towerGlass('glass_tower_grey', '#4a4f55', 74),
    smGlassLit: towerGlass('glass_tower_grey', '#30353b', 72, [0xffe9cc, 0.7]),
    smVoid: S({ color: 0x101113, roughness: 0.9, metalness: 0.0 }),
    // the Urban League Empowerment Center's podium glass: a pale blue-grey mirror, measured (156-171, 175-183, 193-194) sRGB on
    // (2026-08); three tones of pane and a dark transom
    ul: { vision: towerGlass('glass_tower_blue', '#8190a0', 61), visionB: towerGlass('glass_tower_blue', '#d3dce5', 62), visionC: towerGlass('glass_tower_blue', '#47566a', 63),
      lit: towerGlass('glass_tower_blue', '#a2b0bd', 64, [0xfff0dd, 0.55]), line: towerGlass('glass_tower_grey', '#3a4652', 65) },
    // the Harlem Center's office slab: ribbon glass
    hcGlass: S({ color: 0x46545b, roughness: 0.08, metalness: 0.5 }),
    hcGlassLit: nightLit(S({ color: 0x46545b, roughness: 0.08, metalness: 0.5, emissive: 0xfff2dc, emissiveIntensity: 0.55 })),
  };
  return _M;
}
// a deterministic hash in [0, 1)
const hash = (a, b = 0, c = 0) => { const x = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return x - Math.floor(x); };

// ================================================================== the Adam Clayton Powell Jr. State Office Building
// 163 W 125th St (Ifill Johnson Hanchard, 1973). The spec's ring is the tower's bounding rectangle: the frame's u = s (from
// the west face, east along 125th Street), w = b - 4.17 (b from the north pier faces at -20.52 to the south central front
// at 4.17). Measured on the south face's orthographic elevation and the compiled pier
// outline (the ring in docs/notes/ar33-frontage/bid3.json); the corners and the ends off and
// The tower is symmetric about s = 30.86.
const SOB = {
  L: 61.72, W0: 4.17,
  roof: 88.4, pierTop: 90.1, atticTop: 89.8, cw0: 12.5, cw1: 77.9, band0: 7.8, lobbyTop: 7.6,
  box0: 39.8, box1: 74.6, shelf0: 42.6, shelf1: 47.6,
};
export function sob(group, ctx, spec, frame) {
  const K = frame.kit, M = mats(), S = SOB;
  // the cladding: large-format stone panels (1.5 x 2.4 m, joints recessed) in a warm beige
  const st = panelMat([208, 191, 172], 1.5, 2.4, { cols: 2, rows: 2, seed: 3, tone: 0.05 });
  const stSoffit = panelMat([182, 167, 150], 1.5, 2.4, { cols: 2, rows: 2, seed: 7, tone: 0.04 });
  const roofM = K.mat('concrete_precast', { tint: '#8c8c88', dirt: 0.4 });
  const plant = K.mat('metal_painted', { tint: '#a9aba7' });
  const lobbyGlass = pbrMaterial('glass_grey', { opacity: 0.55, dirt: 0.2, street: 70 });   // (wave 2: the lobby read (72,75,77), the real (42,42,37))   // dark reflective lobby glass, the hall behind it dim
  const bronze = K.mat('alu_bronze', { tint: '#4a3c2c' });
  const L = S.L, W0 = S.W0;
  const G = { set: M.set, vision: M.set[1].vision, lit: M.set[1].lit, spandrel: M.spandrel, mullion: M.mullion };
  // world-plan boxes: s along 125th, b toward it; mirrored copies east of the centre
  const bx = (m, s0, s1, y0, y1, b0, b1, o = {}) => K.box(m, s0, s1, y0, y1, b0 - W0, b1 - W0, o);
  const bxM = (m, s0, s1, y0, y1, b0, b1, o = {}) => { bx(m, s0, s1, y0, y1, b0, b1, o); bx(m, L - s1, L - s0, y0, y1, b0, b1, o); };
  const floorH = (S.cw1 - S.cw0) / 17;
  // a south/north-facing curtain (along s) and a west/east-facing one (along b)
  const cwS = (s0, s1, y0, y1, b, dir, pane, seed, extra = {}) => curtain(K, { axis: 'u', a0: s0, a1: s1, plane: b - W0, dir, y0, y1, floor: floorH, y1st: S.cw0, pane, seed, M: G, lit: 0.32, ...extra });
  const cwE = (b0, b1, y0, y1, s, dir, pane, seed, extra = {}) => curtain(K, { axis: 'w', a0: b0 - W0, a1: b1 - W0, plane: s, dir, y0, y1, floor: floorH, y1st: S.cw0, pane, seed, M: G, lit: 0.32, ...extra });

  // ---------------------------------------------------------------- the long faces' piers (south b > 0, north b < -16)
  // a pier with a battered foot: its front leans out 1.2 m over the bottom 7.8 m
  const pier = (s0, s1, bFront, bBack, south) => {
    const wf = bFront - W0, wb = bBack - W0, k = south ? 1 : -1;
    const prof = south
      ? [[wb, 0], [wf + 1.2, 0], [wf, S.band0], [wf, S.pierTop], [wb, S.pierTop]]
      : [[wb, S.pierTop], [wf, S.pierTop], [wf, S.band0], [wf - 1.2, 0], [wb, 0]];
    K.extrude(st, prof, s0, s1, { cap: true });
    void k;
  };
  for (const [s0, s1, south, bF] of [[4.9, 8.0, true, 3.6], [14.8, 18.0, true, 3.5], [4.95, 7.24, false, -20.52], [14.91, 24.39, false, -19.9]]) {
    pier(s0, s1, bF, south ? -6 : -10.6, south);
    pier(L - s1, L - s0, bF, south ? -6 : -10.6, south);
  }

  // ---------------------------------------------------------------- the narrow bays (both long faces)
  for (const south of [true, false]) {
    const sg = south ? 1 : -1, bb = (b) => (south ? b : -16.6 - b);   // the north face mirrors the south about b = -8.3
    const s0 = south ? 8.0 : 7.24, s1 = south ? 14.8 : 14.91;
    for (const mir of [false, true]) {
      const A = mir ? L - s1 : s0, B = mir ? L - s0 : s1;
      const g0 = A + 0.6, g1 = B - 0.6;
      const lo = (a, b) => Math.min(bb(a), bb(b)), hi = (a, b) => Math.max(bb(a), bb(b));
      // stone jambs (the bay's returns) full height, recessed behind the piers
      bx(st, A, g0, S.band0, S.roof, lo(-6, 2.4), hi(-6, 2.4));
      bx(st, g1, B, S.band0, S.roof, lo(-6, 2.4), hi(-6, 2.4));
      // the base band and the arcade under it
      bx(st, A, B, S.band0, S.cw0, lo(-1, 3.26), hi(-1, 3.26));
      bx(M.interior, A, B, 0, S.band0, lo(-4, -2.5), hi(-4, -2.5), { c: 0 });
      // the lower glass (in the recess), the shelf, the upper box, the stone head
      cwS(g0, g1, S.cw0, S.shelf0, bb(2.0), sg, 1.35, 11 + (mir ? 1 : 0) + (south ? 0 : 2));
      bx(st, A + 0.2, B - 0.2, S.shelf0, S.shelf1, lo(-1, 3.3), hi(-1, 3.3));
      bx(st, A + 0.4, B - 0.4, S.shelf1, S.cw1, lo(-1, 2.2), hi(-1, 2.2));   // the upper box's stone body behind its glass
      cwS(A + 0.55, B - 0.55, S.shelf1, S.cw1, bb(2.95), sg, 1.3, 21 + (mir ? 1 : 0) + (south ? 0 : 2));
      bx(st, A + 0.4, A + 0.55, S.shelf1, S.cw1, lo(2.2, 3.05), hi(2.2, 3.05));
      bx(st, B - 0.55, B - 0.4, S.shelf1, S.cw1, lo(2.2, 3.05), hi(2.2, 3.05));
      bx(st, A, B, S.cw1, S.roof, lo(-2, 3.2), hi(-2, 3.2));
    }
  }
  // the recesses between the inner piers and the central section (south), and the north's broad-pier returns
  bxM(st, 18.0, 19.66, S.band0, S.roof, -6, 2.2);

  // ---------------------------------------------------------------- the south central section
  {
    const s0 = 19.66, s1 = L - 19.66;
    cwS(s0, s1, S.cw0, S.cw1, 3.3, 1, 1.6, 31, { mull: [0.07, 0.16] });
    bx(st, s0 - 0.1, s1 + 0.1, S.cw1 + 0.7, S.atticTop, -2, 4.17);          // the attic
    bx(M.vent, s0 + 0.2, s1 - 0.2, S.cw1, S.cw1 + 0.7, -2, 4.0, { c: 0 });    // its vent line
    bx(st, s0 - 0.6, s1 + 0.6, S.band0, S.cw0, -1, 4.17);                     // the lettering band
    // the lobby: glass 3.9 m back under the band, bronze doors in two groups, the lit hall behind
    const bL = 0.25;
    litHall(K, s0, s1, S.lobbyTop, bL - W0 - 0.05, 8.2, { k: 0.2, columns: 7.2, lightStep: 3.0 });
    K.sign({ kind: 'painted', text: '', logo: 'bid3:summerBanner', logoAt: 'fill', bg: null, u0: 25.0, u1: 36.5, y: 4.6, h: 2.0 }, { z: bL - W0 - 0.55 });   // the lobby seen through dark glass reads dim
    K.box(lobbyGlass, s0, s1, 0.02, S.lobbyTop, bL - W0 - 0.02, bL - W0, { c: 0 });
    const n = 14, pw = (s1 - s0) / n;
    for (let i = 0; i <= n; i++) bx(bronze, s0 + i * pw - 0.06, s0 + i * pw + 0.06, 0, S.lobbyTop, bL - 0.1, bL + 0.12, { c: 0.01 });
    bx(bronze, s0, s1, 3.0, 3.12, bL - 0.1, bL + 0.1, { c: 0 });
    for (const [a, b] of [[21.2, 25.3], [L - 25.3, L - 21.2]]) {
      for (let i = 0; i < 4; i++) {
        const d0 = a + i * ((b - a) / 4), d1 = d0 + (b - a) / 4;
        bx(bronze, d0 + 0.02, d1 - 0.02, 0, 2.7, bL, bL + 0.08, { c: 0.01, skip: 16 });
        bx(lobbyGlass, d0 + 0.12, d1 - 0.12, 0.12, 2.58, bL + 0.08, bL + 0.1, { c: 0 });
        bx(bronze, d0 + 0.45 * (d1 - d0), d0 + 0.55 * (d1 - d0), 0.95, 1.05, bL + 0.1, bL + 0.16, { c: 0 });
      }
    }
  }
  // the north central section: a narrower curtain between the broad piers
  {
    const s0 = 24.39, s1 = L - 24.39;
    cwS(s0, s1, S.cw0, S.cw1, -19.95, -1, 1.66, 41, { mull: [0.07, 0.16] });
    bx(st, s0 - 0.1, s1 + 0.1, S.cw1 + 0.7, S.atticTop, -20.25, -14);
    bx(M.vent, s0 + 0.2, s1 - 0.2, S.cw1, S.cw1 + 0.7, -20.1, -14, { c: 0 });
    bx(st, s0 - 0.3, s1 + 0.3, S.band0, S.cw0, -20.25, -15);
    bx(M.interior, s0, s1, 0, S.band0, -17.5, -16.2, { c: 0 });
  }

  // ---------------------------------------------------------------- the corner boxes and the end faces
  for (const east of [false, true]) {
    const sx = (s) => (east ? L - s : s);                  // mirror in s
    const sLo = (a, b) => Math.min(sx(a), sx(b)), sHi = (a, b) => Math.max(sx(a), sx(b));
    const dirE = east ? 1 : -1;                              // the end face's outward direction along u
    for (const north of [false, true]) {
      const by = (b) => (north ? -16.6 - b : b);
      const bLo = (a, b) => Math.min(by(a), by(b)), bHi = (a, b) => Math.max(by(a), by(b));
      // the box: s 0-4.9, b -3.1..1.94 (south) between 39.8 and 74.6, glass on its two outer faces, a stone cap, a
      // chamfered stone soffit, a stone corner post
      bx(st, sLo(0.5, 4.9), sHi(0.5, 4.9), S.box0 + 3.0, S.box1, bLo(-3.1, 1.5), bHi(-3.1, 1.5));
      bx(st, sLo(0, 4.9), sHi(0, 4.9), S.box1 - 0.9, S.box1, bLo(-3.1, 1.94), bHi(-3.1, 1.94));
      cwS(sLo(0.35, 4.9), sHi(0.35, 4.9), S.box0 + 0.5, S.box1 - 0.9, by(1.94), north ? -1 : 1, 1.15, 51 + (east ? 1 : 0) + (north ? 2 : 0), { y1st: S.box0 + 0.5 + floorH * 0.35 });
      cwE(bLo(-3.1, 1.6), bHi(-3.1, 1.6), S.box0 + 0.5, S.box1 - 0.9, sx(0), dirE, 1.2, 61 + (east ? 1 : 0) + (north ? 2 : 0), { y1st: S.box0 + 0.5 + floorH * 0.35 });
      bx(st, sLo(0, 0.35), sHi(0, 0.35), S.box0, S.box1, bLo(1.6, 1.94), bHi(1.6, 1.94));
      // the soffit: two sloped faces from the box's outer bottom edges up to the set-back wall below
      {
        const yA = S.box0, yB = S.box0 + 3.0;
        const s0 = sx(0), s1 = sx(4.9), sIn = sx(1.6), b0 = by(1.94), bIn = by(0.34), bBk = by(-3.1);
        const w = (b) => b - W0;
        const nS = north ? -1 : 1, nE = dirE;
        // under the south (or north) edge: from (s0..s1, b0, yA) up to (sIn..s1, bIn, yB)
        K.poly(stSoffit, [[s0, yA, w(b0)], [s1, yA, w(b0)], [s1, yB, w(bIn)], [sIn, yB, w(bIn)]].map((p) => p), [0, -0.7, 0.7 * nS]);
        K.poly(stSoffit, [[s0, yA, w(b0)], [sIn, yB, w(bIn)], [sIn, yB, w(bBk)], [s0, yA, w(bBk)]], [0.7 * nE, -0.7, 0]);
      }
      // below the box: the set-back corner (s 1.6-4.9, b -3.1..0.34), glass on both outer faces, the arcade at its foot
      cwS(sLo(1.6, 4.9), sHi(1.6, 4.9), S.cw0, S.box0 + 3.0, by(0.34), north ? -1 : 1, 1.1, 71 + (east ? 1 : 0) + (north ? 2 : 0));
      cwE(bLo(-3.1, 0.34), bHi(-3.1, 0.34), S.cw0, S.box0 + 3.0, sx(1.6), dirE, 1.15, 81 + (east ? 1 : 0) + (north ? 2 : 0));
      bx(st, sLo(1.6, 4.9), sHi(1.6, 4.9), S.band0, S.cw0, bLo(-3.1, 0.6), bHi(-3.1, 0.6));
      bx(M.interior, sLo(2.6, 4.9), sHi(2.6, 4.9), 0, S.band0, bLo(-3.1, -1.4), bHi(-3.1, -1.4), { c: 0 });
    }
    // the end face's centre: two piers and a recessed glass strip with the mid-height shelf
    for (const [b0, b1] of [[-13.6, -11.0], [-5.7, -3.1]]) bx(st, sLo(-0.0, 5.0), sHi(-0.0, 5.0), 0, S.pierTop, b0, b1);
    cwE(-11.0, -5.7, S.cw0, S.shelf0, sx(0.9), dirE, 1.33, 91 + (east ? 1 : 0));
    cwE(-11.0, -5.7, S.shelf1, S.cw1, sx(0.35), dirE, 1.33, 93 + (east ? 1 : 0));
    bx(st, sLo(-0.2, 3.0), sHi(-0.2, 3.0), S.shelf0, S.shelf1, -11.0, -5.7);
    bx(st, sLo(0.0, 3.0), sHi(0.0, 3.0), S.cw1, S.roof, -11.0, -5.7);
    bx(st, sLo(0.6, 3.0), sHi(0.6, 3.0), S.band0, S.cw0, -11.0, -5.7);
    bx(M.interior, sLo(1.8, 3.0), sHi(1.8, 3.0), 0, S.band0, -11.0, -5.7, { c: 0 });
  }

  // ---------------------------------------------------------------- the core and the roof
  // the core behind every face (hidden but it closes the gaps between the facade layers)
  bx(M.interior, 3.0, L - 3.0, S.band0, S.roof - 0.3, -16.5, -0.2, { c: 0, skip: 4 });
  bx(M.interior, 3.0, L - 3.0, 0, S.band0, -16.2, -8.2, { c: 0, skip: 4 });
  bx(roofM, 4.9, L - 4.9, S.roof - 0.4, S.roof, -18.6, 3.4, { c: 0.02 });
  bx(roofM, 0.2, 4.9, S.roof - 0.4, S.roof, -13.6, -3.1, { c: 0.02 });
  bx(roofM, L - 4.9, L - 0.2, S.roof - 0.4, S.roof, -13.6, -3.1, { c: 0.02 });
  // roof with a tan gravel patch at the north-east, a stone coping ring, a 7 m wooden water tank on a steel frame at u 20.8 (b -13), a
  // stepped pale penthouse at u 26-43 on the north half, a row of four white cooling units on the south half (u 21.4, 29.5, 37, 45.3),
  // blue tarp and small plant at the north-east
  {
    const memb = K.mat('roof_membrane', { tint: '#a4aaae', dirt: 0.35 });
    const gravel = K.mat('roof_gravel', { tint: '#8d7e66', dirt: 0.3 });
    const R = S.roof, TOP = 1 | 2 | 4 | 16 | 32;
    bx(memb, 4.9, L - 4.9, R, R + 0.04, -18.6, 3.4, { c: 0, skip: TOP });
    bx(memb, 0.2, 4.9, R, R + 0.04, -13.6, -3.1, { c: 0, skip: TOP });
    bx(memb, L - 4.9, L - 0.2, R, R + 0.04, -13.6, -3.1, { c: 0, skip: TOP });
    bx(gravel, 44.8, 58.0, R + 0.04, R + 0.08, -17.2, -7.5, { c: 0, skip: TOP });
    // the coping ring (0.4 m wide, 0.7 m high) on the south, north and end edges
    bx(st, 4.9, L - 4.9, R, R + 0.7, 3.0, 3.4, { c: 0.02 });
    bx(st, 4.9, L - 4.9, R, R + 0.7, -18.6, -18.2, { c: 0.02 });
    bx(st, 4.9, 5.3, R, R + 0.7, -18.6, 3.4, { c: 0.02 });
    bx(st, L - 5.3, L - 4.9, R, R + 0.7, -18.6, 3.4, { c: 0.02 });
    // the water tank: staves and hoops, a conical lid, eight legs and two steel rings
    const wood = K.mat('wood_painted', { tint: '#8c6a44', dirt: 0.4 }), steel = K.mat('steel_black', { tint: '#2b2d2c' });
    const tw = frame.world(20.8, R + 2.2 + 1.9, -13.0 - W0);
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 3.8, 28), wood);
    tank.position.set(tw[0], tw[1], tw[2]); tank.castShadow = true; tank.receiveShadow = true; K.add(tank);
    const lid = new THREE.Mesh(new THREE.ConeGeometry(3.6, 1.2, 28), wood);
    lid.position.set(tw[0], tw[1] + 1.9 + 0.6, tw[2]); lid.castShadow = true; K.add(lid);
    for (const dy of [-1.3, 0, 1.3]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(3.42, 0.05, 6, 40).rotateX(Math.PI / 2), steel); ring.position.set(tw[0], tw[1] + dy, tw[2]); K.add(ring); }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, lg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.2, 0.16), steel);
      lg.position.set(tw[0] + Math.cos(a) * 3.0, tw[1] - 1.9 - 1.1, tw[2] + Math.sin(a) * 3.0); K.add(lg);
    }
    // the penthouse: two stepped pale boxes, an orange hatch, a green duct
    const pen = K.mat('panel_grey', { tint: '#bdbfbf', dirt: 0.3 }), white = K.mat('panel_grey', { tint: '#e0e1e0', dirt: 0.2 });
    bx(pen, 26.0, 43.0, R, R + 4.6, -19.7, -10.8, { c: 0.03 });
    bx(white, 33.0, 43.0, R + 4.6, R + 6.8, -17.5, -11.0, { c: 0.03 });
    bx(K.mat('metal_painted', { tint: '#d9602a' }), 37.4, 38.8, R + 6.8, R + 7.3, -15.0, -13.8, { c: 0.01 });
    bx(K.mat('metal_painted', { tint: '#3d8a4e' }), 36.0, 41.0, R, R + 0.9, -9.6, -8.6, { c: 0.01 });
    // four cooling units, each a pale box with two fan grilles on top
    const unit = K.mat('panel_alu', { tint: '#d6d9db', dirt: 0.3 }), fanM = K.mat('steel_black', { tint: '#3a3d40' });
    for (const cu of [21.4, 29.5, 37.0, 45.3]) {
      bx(unit, cu - 2.5, cu + 2.5, R, R + 3.0, -5.6, -0.9, { c: 0.04 });
      for (const dx of [-1.3, 1.3]) {
        const fw = frame.world(cu + dx, R + 3.02, -3.25 - W0), fan = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.06, 20), fanM);
        fan.position.set(fw[0], fw[1], fw[2]); K.add(fan);
      }
    }
    // the north-east: a blue tarp and small plant on the gravel
    bx(K.mat('metal_painted', { tint: '#3a6ea8' }), 51.0, 54.2, R + 0.08, R + 0.12, -14.2, -11.2, { c: 0, skip: TOP });
    bx(K.mat('metal_painted', { tint: '#c8662a' }), 47.0, 48.6, R + 0.08, R + 1.0, -12.0, -10.8, { c: 0.01 });
    bx(K.mat('metal_painted', { tint: '#4a78b0' }), 55.2, 56.6, R + 0.08, R + 0.9, -13.5, -12.2, { c: 0.01 });
  }

  // ---------------------------------------------------------------- the lettering (bronze on the band) and the numbers
  // ADAM CLAYTON POWELL JR. STATE OFFICE BUILDING centred over the lobby, letters ~0.45 m; 163 over each door group
  K.sign({ kind: 'channel', text: 'ADAM CLAYTON POWELL JR.  STATE OFFICE BUILDING', font: 'Inter-500', fg: '#5b4a33', bg: null, tracking: 0.12,
    u0: 23.2, u1: L - 23.6, y: 9.35, h: 0.5, depth: 0.03, lit: 'none' }, { z: 0.01 });
  for (const u of [21.2, L - 21.8]) K.sign({ kind: 'numbers', text: '163', font: 'Inter-500', fg: '#5b4a33', bg: null, u0: u, u1: u + 0.75, y: 8.45, h: 0.32, depth: 0.02, lit: 'none' }, { z: 0.01 });
  void group; void ctx; void spec;
}

// ================================================================== the Studio Museum in Harlem (144 W 125th St)
// Adjaye Associates with Cooper Robertson, opened November 2025. The spec's ring is the whole lot between 148 W (west) and
// 132 W (east), 22.87 m on 125th Street, 61.9 m back to 124th Street. Frame: u from the EAST end (the left end as seen
// from the street), w out onto 125th Street. Measured on the front rectified out of (30 and 60 px/m, the
// camera at u 10, 13.8 m out; projecting frames corrected for their depth), with the obliques h165 and
// h245 for the depths. Heights over the sidewalk (the door sill).
const SM = {
  H: 33.3,
  // [u0, u1, y0, y1, depth of the frame (out of the wall plane), frame bar]: the stacked boxes' picture frames
  frames: [
    [2.9, 20.3, 25.9, 33.3, 0.9, 0.55],     // the top box (the roof loggia level)
    [1.9, 8.6, 20.2, 25.6, 0.7, 0.45],      // floor 6, east part (a dark loggia)
    [8.5, 22.4, 20.2, 25.5, 0.7, 0.5],      // floor 6, west part (the terrace with planting)
    [2.2, 15.8, 13.3, 19.3, 0.8, 0.45],     // floor 5 gallery box (glass over a granular spandrel)
    [15.6, 22.7, 8.5, 20.3, 1.1, 0.6],      // the tall glazed box over the west end
    [0.9, 15.4, 8.0, 13.6, 0.9, 0.45],      // floors 3-4 (the granular panel over a ribbon window)
    [15.3, 21.0, 0.4, 4.5, 0.6, 0.35],      // the west entrance portal
  ],
  slabs: [[1.3, 23.0, 19.25, 20.2, 1.0], [0.9, 15.8, 13.1, 13.8, 1.05], [0.9, 15.6, 8.0, 9.1, 1.1], [15.4, 22.8, 7.6, 8.5, 1.3], [2.5, 20.6, 25.6, 26.0, 1.0]],
};
export function studio(group, ctx, spec, frame) {
  const K = frame.kit, M = mats(), L = frame.L;
  // the charcoal precast as large panels with recessed joints, the bronze as a plain dark bronze (the library's alu_bronze mirrored the sky orange)
  // (wave 2: the frames read (54,67,79) on the w2b plate studioA, the real piers (78,82,87): the sky light turns a grey base blue,
  // so the base is a warm grey, lighter)
  const pc = panelMat([88, 88, 94], 1.2, 1.2, { cols: 2, rows: 2, seed: 9, tone: 0.04, joint: 0.01 });
  const pcG = panelMat([74, 76, 80], 0.6, 0.6, { cols: 4, rows: 4, seed: 12, tone: 0.06, joint: 0.006 });       // the granular spandrel panels
  const bronze = wallMat({ color: 0x5a4531, roughness: 0.45, metalness: 0.3, soot: 0, streak: 0 });
  const glassT = K.mat('glass_storefront');
  const glassL = pbrMaterial('glass_grey', { opacity: 0.62, dirt: 0.2 });   // the lobby's tall glass: reads dark and mirrors the street
  const D = 61.9, H = SM.H;
  // the volume, stepped back behind the lobby (0-8 m), the boxes (8-19.25) and the loggias (19.25 up); the top level
  // only u 2.9-20.3 wide (the elevation shows sky beside it)
  K.box(pc, 0.9, L - 0.1, 0, 8.0, -D + 0.3, -9.2, { c: 0.02 });
  K.box(pc, 0.9, L - 0.1, 8.0, 19.25, -D + 0.3, -1.2, { c: 0.02 });
  K.box(pc, 1.9, 22.4, 19.25, 25.9, -D + 0.3, -3.2, { c: 0.02 });
  K.box(pc, 2.9, 20.3, 25.9, H, -D * 0.6, -2.6, { c: 0.02 });
  // the ground floor lobby (u 2.3-14.5): tall glass to 7.3 m, the bronze fascia 2.2-2.8 with the museum's name, bronze
  // doors 0-2.2, the lit lobby behind
  litHall(K, 2.3, 15.2, 7.5, -0.36, 9.0, { k: 0.09, columns: 0, lightStep: 3.4 });
  K.box(glassL, 2.3, 14.5, 2.8, 7.35, -0.32, -0.3, { c: 0 });
  const nm = 12;
  for (let i = 0; i <= nm; i++) { const u = 2.3 + (i * (14.5 - 2.3)) / nm; K.box(bronze, u - 0.04, u + 0.04, 2.8, 7.35, -0.34, -0.12, { c: 0.004 }); }
  K.box(bronze, 2.4, 15.2, 2.2, 2.85, -0.35, -0.1, { c: 0.01 });
  for (let i = 0; i < 8; i++) {
    const d0 = 2.5 + i * ((11.0 - 2.5) / 8), d1 = d0 + (11.0 - 2.5) / 8;
    // a bronze door leaf: stiles, a top rail, a kick rail, the glass between; a pull bar
    K.box(bronze, d0 + 0.02, d0 + 0.13, 0, 2.2, -0.45, -0.37, { c: 0.008 });
    K.box(bronze, d1 - 0.13, d1 - 0.02, 0, 2.2, -0.45, -0.37, { c: 0.008 });
    K.box(bronze, d0 + 0.02, d1 - 0.02, 2.05, 2.2, -0.45, -0.37, { c: 0.008 });
    K.box(bronze, d0 + 0.02, d1 - 0.02, 0, 0.25, -0.45, -0.37, { c: 0.008 });
    K.box(glassT, d0 + 0.13, d1 - 0.13, 0.25, 2.05, -0.41, -0.39, { c: 0 });
    K.box(bronze, d0 + 0.8 * (d1 - d0), d0 + 0.86 * (d1 - d0), 0.7, 1.7, -0.37, -0.28, { c: 0.005 });
  }
  K.box(glassT, 11.1, 15.2, 0.05, 2.2, -0.45, -0.43, { c: 0 });
  // the wall plane itself round the openings (the ground floor's piers and the areas between the boxes)
  K.box(pc, 0.9, 2.3, 0, 8.0, -1.2, 0.35, { c: 0.02 });
  K.box(pc, 14.5, 15.4, 0, 8.0, -1.2, 0.2, { c: 0.02 });
  K.box(pc, 22.4, L - 0.1, 0, 20.2, -1.2, 0.2, { c: 0.02 });
  // floors 3-4: a granular panel over a ribbon window
  K.box(pcG, 1.4, 14.9, 9.8, 12.9, -0.25, -0.05, { c: 0.01 });
  K.box(M.smGlassLit, 1.4, 14.9, 9.1, 9.8, -0.35, -0.3, { c: 0 });
  // floor 5 gallery: glass 16.2-18.2 over a granular spandrel 14.2-16.2
  K.box(pcG, 2.7, 15.3, 13.8, 16.2, -0.25, -0.05, { c: 0.01 });
  K.box(M.smGlassDk, 2.7, 15.3, 16.2, 18.9, -0.4, -0.35, { c: 0 });
  for (let i = 0; i <= 6; i++) { const u = 2.7 + (i * (15.3 - 2.7)) / 6; K.box(M.mullion, u - 0.04, u + 0.04, 16.2, 18.9, -0.4, -0.3, { c: 0 }); }
  // the tall glazed box: glass 16.4-22.2 x 9.5-18.9, a transom at 14.0
  K.box(M.smGlassMirror, 16.4, 22.2, 9.5, 18.9, 0.35, 0.4, { c: 0 });
  for (const u of [18.3, 20.2]) K.box(M.mullion, u - 0.04, u + 0.04, 9.5, 18.9, 0.35, 0.46, { c: 0 });
  K.box(M.mullion, 16.4, 22.2, 13.95, 14.05, 0.35, 0.46, { c: 0 });
  K.box(M.interior, 16.2, 22.4, 9.0, 19.2, -3.0, -2.8, { c: 0 });
  // the west entrance portal's glass and the dark door beside it
  K.box(M.smGlassLit, 15.9, 20.4, 1.0, 3.9, -0.4, -0.35, { c: 0 });
  K.box(pcG, 15.8, 20.5, 0.4, 1.0, -0.2, 0.45, { c: 0.01 });             // the bench sill people sit on
  K.box(M.smVoid, 21.2, 22.5, 0, 2.3, -0.3, -0.25, { c: 0 });
  K.box(M.smGlassLit, 15.9, 20.3, 4.6, 7.0, -0.4, -0.35, { c: 0 });      // the window band over the portal
  // floor 6: an east loggia (dark, 2.5 m deep) and the west terrace (planting behind a glass rail)
  K.box(M.smVoid, 2.4, 8.2, 20.5, 25.1, -2.6, -2.5, { c: 0 });
  K.box(pc, 2.4, 8.2, 20.2, 20.5, -2.6, 0.1, { c: 0 });
  K.box(M.smVoid, 9.2, 21.9, 20.5, 25.0, -3.0, -2.9, { c: 0 });
  K.box(K.mat('metal_painted', { tint: '#2f4a2a' }), 9.4, 21.7, 20.5, 21.6, -2.8, -1.6, { c: 0.2 });   // planting
  K.box(glassT, 9.2, 21.9, 20.5, 21.6, 0.0, 0.03, { c: 0 });
  // the top box: an east loggia (open) and a closed panel over the west
  K.box(M.smVoid, 3.5, 8.8, 26.6, 32.6, -2.4, -2.3, { c: 0 });
  K.box(pc, 9.0, 19.8, 26.4, 32.8, -0.4, -0.1, { c: 0.01 });
  K.box(pc, 3.3, 8.9, 26.0, 26.6, -2.4, 0.2, { c: 0 });
  // the roof of the top box
  {
    const TOPF = 1 | 2 | 4 | 16 | 32;
    const roofD = K.mat('roof_epdm', { tint: '#4d5054', dirt: 0.3 });
    K.box(roofD, 2.9, 20.3, H, H + 0.05, -D * 0.6, -2.6, { c: 0, skip: TOPF });
    K.box(K.mat('panel_alu', { tint: '#d5d8da', dirt: 0.3 }), 4.0, 14.0, H, H + 1.4, -9.0, -5.5, { c: 0.04 });
    K.box(K.mat('panel_grey', { tint: '#8d9094', dirt: 0.3 }), 12.0, 19.0, H, H + 2.6, -D * 0.6 + 4, -D * 0.6 + 12, { c: 0.04 });
  }
  // the picture frames (four bars each) and the slabs
  for (const [u0, u1, y0, y1, d, t] of SM.frames) {
    K.box(pc, u0, u1, y1 - t, y1, -0.4, d, { c: 0.015 });
    K.box(pc, u0, u1, y0, y0 + t, -0.4, d, { c: 0.015 });
    K.box(pc, u0, u0 + t, y0 + t, y1 - t, -0.4, d, { c: 0.015 });
    K.box(pc, u1 - t, u1, y0 + t, y1 - t, -0.4, d, { c: 0.015 });
  }
  for (const [u0, u1, y0, y1, d] of SM.slabs) K.box(pc, u0, u1, y0, y1, -0.4, d, { c: 0.015 });
  // the name over the doors and the vertical blade at the east end
  K.sign({ kind: 'channel', text: 'STUDIO MUSEUM IN HARLEM', font: 'Inter-700', fg: '#e8d6ae', bg: null, tracking: 0.04, u0: 11.3, u1: 15.1, y: 2.33, h: 0.3, depth: 0.02, lit: 'halo' }, { z: -0.08 });
  {
    // the blade: a charcoal slab 0.5 m thick standing out from the wall at u 1.0, 13.7-22.5 m, white letters both sides
    K.box(pc, 0.75, 1.25, 13.7, 22.5, 0.2, 2.6, { c: 0.02 });
    // the letters read downward on both faces: sign-local x runs down the blade, y across it, z out of the face
    for (const west of [true, false]) {
      const obj = buildSign({ kind: 'painted', text: 'STUDIO MUSEUM', font: 'Inter-800', fg: '#f2f2f0', bg: null, tracking: 0.08, u0: 0, u1: 8.2, h: 1.1, lit: 'face' }, { seed: 144 });
      if (!obj) continue;
      const B = new THREE.Matrix4();
      if (west) B.makeBasis(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0)).setPosition(1.265, 22.2, 1.95);
      else B.makeBasis(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0)).setPosition(0.735, 22.2, 0.85);
      obj.applyMatrix4(frame.matrix(0, 0, 0).multiply(B));
      K.add(obj);
    }
  }
  void group; void ctx; void spec;
}

// ================================================================== the Urban League Empowerment Center (121 W 125th St)
// No footprint record (the compiled 30 m INDUSTRIAL box stands in for it). Frame: u from the west end, w out onto 125th
// Street. The podium's glass front 30.6 m high (north mosaic, 22 px/m: vertical fins at an irregular pitch, a heavy
// transom each ~4.3 m floor), the grey terrace box at u 31.8-47.2, 13.0-19.9 m, the ground-floor fascia 4.2-5.5 m with the
// tenants' letters, the museum's portal at the east end; the residential slab (~17 storeys, 61 m) at the rear.
export function ulec(group, ctx, spec, frame) {
  const K = frame.kit, M = mats(), L = frame.L;
  const grey = K.mat('panel_grey', { tint: '#3d4043', dirt: 0.15 });
  const dark = K.mat('panel_grey', { tint: '#2e3033', dirt: 0.15 });
  const resi = K.mat('panel_grey', { tint: '#979a9d', dirt: 0.25 });
  const glassT = K.mat('glass_storefront');
  const PH = 30.6, D = 58.0;
  // the podium mass and its glass front (the fins: irregular pitch 1.2-1.9 m, deep 0.35 m)
  K.box(M.interior, 0.2, L - 0.2, 4.2, PH - 0.5, -D + 1, -1.0, { c: 0 });          // the mass above the shops (the ground floor is the lit hall below)
  K.box(M.interior, 0.2, L - 0.2, 0, 4.2, -D + 1, -8.45, { c: 0 });
  const G = { vision: M.ul.vision, visionB: M.ul.visionB, visionC: M.ul.visionC, lit: M.ul.lit, spandrel: M.ul.line, mullion: grey };
  curtain(K, { axis: 'u', a0: 0.3, a1: L - 0.3, plane: 0.1, dir: 1, y0: 5.5, y1: PH, floor: 1.5, y1st: 7.0, pane: 0.78, span: [0.035, 0.035], mull: [0.045, 0.3], seed: 5, M: G, lit: 0.2, patch: [7, 3] });
  K.box(grey, 0, L, PH, PH + 0.6, -1.2, 0.3, { c: 0.02 });
  // the dark blades over the western half (u 0-31, 17.5-28.5 m): fins of alternating depth
  { const bl = K.mat('panel_grey', { tint: '#25282b', dirt: 0.1 }); let k = 0; for (let u = 0.8; u < 31; u += 1.55, k++) K.box(bl, u - 0.07, u + 0.07, 17.5, 28.6, 0.0, k % 2 ? 0.8 : 0.5, { c: 0.01 }); }
  // the terrace box (a grey frame round a recessed terrace)
  const t0 = 31.8, t1 = 47.2, ya = 13.0, yb = 19.9;
  for (const [a, b, c, d] of [[t0, t1, yb - 0.7, yb], [t0, t1, ya, ya + 0.7], [t0, t0 + 0.7, ya, yb], [t1 - 0.7, t1, ya, yb]]) K.box(grey, a, b, c, d, -0.3, 1.3, { c: 0.02 });
  K.box(M.smVoid, t0 + 0.7, t1 - 0.7, ya + 0.7, yb - 0.7, -3.2, -3.1, { c: 0 });
  K.box(glassT, t0 + 0.7, t1 - 0.7, ya + 0.7, ya + 1.8, 0.2, 0.23, { c: 0 });
  // the ground floor: the kit's shop bays and signband (the spec); here the museum's portal at the east end
  const pu0 = L - 9.3, pu1 = L - 0.2;
  K.box(grey, pu0, pu1, 0, 8.7, -0.2, 1.4, { c: 0.02, skip: 32 });
  K.box(M.smVoid, pu0 + 0.8, pu1 - 0.8, 0.05, 7.9, 1.2, 1.25, { c: 0 });
  K.sign({ kind: 'painted', lines: ['URBAN', 'CIVIL', 'RIGHTS', 'MUSEUM'], font: 'Inter-900', fg: '#f4f4f2', bg: '#151515', u0: pu0 + 1.8, u1: pu0 + 6.3, y: 4.9, h: 2.9, lit: 'face' }, { z: 1.27 });
  // leasing vinyl on the glass of the vacant bays
  for (const u of [13.4, 16.6, 19.8, 48.0, 50.6]) K.sign({ kind: 'painted', lines: ['RETAIL', 'FOR LEASE', 'ON 125TH STREET'], font: 'Inter-700', fg: '#f4f4f0', bg: '#1b4a4a', u0: u, u1: u + 2.3, y: 0.7, h: 2.9 }, { z: 0.07 });
  // the tenants' letters (2026-08): target and TRADER JOE'S on the glass, PANDORA and SEPHORA on the fascia
  K.sign({ kind: 'channel', text: 'TRADER JOE\'S', font: 'AlfaSlabOne-400', fg: '#d6202a', bg: null, u0: 2.2, u1: 12.6, y: 9.0, h: 1.2, lit: 'face' }, { z: 0.4 });
  K.sign({ kind: 'painted', text: '', logo: 'bid3:targetMark', logoAt: 'fill', bg: null, u0: 26.3, u1: 28.4, y: 8.55, h: 2.1, lit: 'face' }, { z: 0.4 });
  K.sign({ kind: 'channel', text: 'target', font: 'Inter-700', fg: '#f7f7f7', bg: null, u0: 28.7, u1: 33.6, y: 8.7, h: 1.8, lit: 'face' }, { z: 0.4 });
  K.sign({ kind: 'channel', text: 'PANDORA', font: 'Inter-600', fg: '#ffffff', bg: null, tracking: 0.12, u0: 29.4, u1: 33.9, y: 4.5, h: 0.6, lit: 'face' }, { z: 0.46 });
  K.sign({ kind: 'channel', text: 'SEPHORA', font: 'Inter-500', fg: '#ffffff', bg: null, tracking: 0.3, u0: 39.2, u1: 44.2, y: 4.5, h: 0.6, lit: 'face' }, { z: 0.46 });
  K.sign({ kind: 'painted', text: '', logo: 'bid3:targetMark', logoAt: 'fill', bg: null, u0: 0.8, u1: 1.7, y: 4.4, h: 0.88, lit: 'face' }, { z: 0.46 });
  K.sign({ kind: 'channel', text: 'target', font: 'Inter-700', fg: '#f7f7f7', bg: null, u0: 1.85, u1: 3.9, y: 4.4, h: 0.85, lit: 'face' }, { z: 0.46 });
  K.sign({ kind: 'channel', text: 'TRADER JOE\'S', font: 'AlfaSlabOne-400', fg: '#d6202a', bg: null, u0: 4.3, u1: 9.6, y: 4.45, h: 0.6, lit: 'face' }, { z: 0.46 });
  // the block 64 m wide at 2.65 px/m): the podium's roof is a
  // pale grey membrane with a 2.2 m sedum strip along its front edge, one large olive sedum field (u 4-60, 5-21 m behind the front)
  // with a pale penthouse in it (u 24-47, 9-19 m behind), and the residential slab (17 storeys, 61 m) stands 23-52 m behind the
  // front, its south face a regular grid of punched windows in a pale warm grey wall, a sedum ring on its roof
  const sedum = wallMat({ color: new THREE.Color('#86a257'), roughness: 0.96, metalness: 0, soot: 0, streak: 0 });
  const memb = K.mat('roof_membrane', { tint: '#9ea3a7', dirt: 0.3 });
  const TOPF = 1 | 2 | 4 | 16 | 32;
  K.box(memb, 0.6, L - 0.6, PH + 0.0, PH + 0.05, -56.5, -0.6, { c: 0, skip: TOPF });
  K.box(sedum, 4.0, L - 0.6, PH + 0.05, PH + 0.22, -2.8, -0.6, { c: 0.05 });
  K.box(sedum, 4.0, L - 3.0, PH + 0.05, PH + 0.22, -21.0, -5.0, { c: 0.05 });
  K.box(K.mat('panel_grey', { tint: '#c9cbcb', dirt: 0.25 }), 24.0, 47.0, PH + 0.22, PH + 3.4, -19.0, -9.0, { c: 0.03 });
  K.box(K.mat('panel_alu', { tint: '#d9dbdc', dirt: 0.25 }), 28.0, 38.0, PH + 3.4, PH + 4.4, -17.0, -11.0, { c: 0.03 });
  const r0 = 1.0, r1 = L - 2.0, rb0 = -52.0, rb1 = -23.5, top = 61.0;
  K.box(resi, r0, r1, PH, top, rb0, rb1, { c: 0.03 });
  // punched windows on its south face (towards 125th), 3.0 m floors, 2.6 m pitch, white frames
  const winM = { vision: M.hcGlass, lit: M.hcGlassLit, spandrel: resi, mullion: resi };
  const frameM = K.mat('alu_white', { tint: '#e6e6e2', dirt: 0.2 });
  for (let y = PH + 1.2; y + 1.6 < top - 1; y += 3.0) {
    for (let u = r0 + 1.4; u + 1.3 < r1 - 1; u += 2.6) {
      const lit = hash(u, y, 7) < 0.3;
      K.box(frameM, u - 0.07, u + 1.37, y - 0.07, y + 1.67, rb1 + 0.0, rb1 + 0.05, { c: 0 });
      K.box(lit ? winM.lit : winM.vision, u, u + 1.3, y, y + 1.6, rb1 + 0.04, rb1 + 0.09, { c: 0 });
    }
  }
  // the top: a sedum ring on its roof, a bulkhead and a cooling unit
  K.box(sedum, r0 + 1, r1 - 1, top, top + 0.15, rb1 - 3.0, rb1 - 0.4, { c: 0.04 });
  K.box(sedum, r0 + 1, r1 - 1, top, top + 0.15, rb0 + 0.4, rb0 + 3.0, { c: 0.04 });
  K.box(dark, r0 + 8, r0 + 20, top, top + 3.2, rb0 + 8, rb1 - 8, { c: 0.02 });
  K.box(K.mat('panel_alu', { tint: '#d6d9db', dirt: 0.3 }), r1 - 14, r1 - 8, top, top + 2.2, rb0 + 8, rb0 + 12, { c: 0.04 });
  void group; void ctx; void spec;
}
// Panda Express's roundel: a red ring round a white disc with the panda's face
export function pandaMark(c, w, h) {
  const r = Math.min(w, h) / 2, cx = w / 2, cy = h / 2;
  const arcText = (txt, rad, a0, a1, size, top) => {
    c.font = `800 ${size}px Inter, Arial, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    const n = txt.length;
    for (let k = 0; k < n; k++) {
      const t = n > 1 ? k / (n - 1) : 0.5, an = a0 + (a1 - a0) * t;
      c.save(); c.translate(cx + Math.cos(an) * rad, cy + Math.sin(an) * rad); c.rotate(top ? an + Math.PI / 2 : an - Math.PI / 2); c.fillText(txt[k], 0, 0); c.restore();
    }
  };
  c.save();
  c.fillStyle = '#d52b1e'; c.beginPath(); c.arc(cx, cy, r * 0.99, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#f6f3ec'; c.beginPath(); c.arc(cx, cy, r * 0.94, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#d52b1e'; c.beginPath(); c.arc(cx, cy, r * 0.69, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#c4231a';
  arcText('PANDA EXPRESS', r * 0.815, -Math.PI * 0.86, -Math.PI * 0.14, r * 0.15, true);
  arcText('CHINESE KITCHEN', r * 0.815, Math.PI * 0.88, Math.PI * 0.12, r * 0.12, false);
  const q = 0.86;   // the panda inside the inner disc
  c.fillStyle = '#17120f';
  for (const s of [-1, 1]) { c.beginPath(); c.arc(cx + s * r * 0.36 * q, cy - r * 0.44 * q, r * 0.17 * q, 0, Math.PI * 2); c.fill(); }      // ears
  c.fillStyle = '#fbf9f4'; c.strokeStyle = '#17120f'; c.lineWidth = Math.max(1.5, r * 0.035);
  c.beginPath(); c.ellipse(cx, cy - r * 0.04 * q, r * 0.44 * q, r * 0.4 * q, 0, 0, Math.PI * 2); c.fill(); c.stroke();                      // the head
  c.fillStyle = '#17120f';
  for (const s of [-1, 1]) { c.save(); c.translate(cx + s * r * 0.19 * q, cy - r * 0.1 * q); c.rotate(s * 0.5); c.beginPath(); c.ellipse(0, 0, r * 0.1 * q, r * 0.14 * q, 0, 0, Math.PI * 2); c.fill(); c.restore(); }   // eye patches
  c.beginPath(); c.ellipse(cx, cy + r * 0.07 * q, r * 0.07 * q, r * 0.045 * q, 0, 0, Math.PI * 2); c.fill();                                // the nose
  c.save(); c.beginPath(); c.arc(cx, cy, r * 0.68, 0, Math.PI * 2); c.clip();
  c.beginPath(); c.ellipse(cx, cy + r * 0.52, r * 0.46, r * 0.16, 0, 0, Math.PI * 2); c.fill(); c.restore();                                  // the shoulders
  c.restore();
}
// the banner hung inside the State Office Building's lobby (an invented event: HARLEM SUMMER NIGHTS, free concerts on the plaza)
export function summerBanner(c, w, h) {
  const g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#d63a78'); g.addColorStop(0.34, '#b02f7a'); g.addColorStop(0.36, '#173a66'); g.addColorStop(1, '#0f5b5c');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.fillStyle = '#ffffff'; c.textAlign = 'left'; c.textBaseline = 'middle';
  c.font = `900 ${h * 0.34}px Inter, Arial, sans-serif`; c.fillText('HARLEM', w * 0.03, h * 0.3);
  c.font = `900 ${h * 0.3}px Inter, Arial, sans-serif`; c.fillText('SUMMER NIGHTS', w * 0.03, h * 0.68);
  c.font = `800 ${h * 0.2}px Inter, Arial, sans-serif`; c.fillText('EVERY THURSDAY  -  FREE', w * 0.4, h * 0.3);
  c.font = `700 ${h * 0.16}px Inter, Arial, sans-serif`; c.fillText('LIVE MUSIC ON THE PLAZA  5 TO 9 PM', w * 0.4, h * 0.62);
}
// the leasing wrap on the glass of 105 W: a magenta-to-navy vinyl with white lettering
export function leaseWrap(c, w, h) {
  const g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#c2306e'); g.addColorStop(0.42, '#7a2f78'); g.addColorStop(0.62, '#202f6e'); g.addColorStop(1, '#16255c');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.fillStyle = '#ffffff'; c.textAlign = 'left'; c.textBaseline = 'middle';
  c.font = `900 ${h * 0.2}px Inter, Arial, sans-serif`; c.fillText('Retail', w * 0.04, h * 0.2); c.fillText('Branding', w * 0.04, h * 0.42); c.fillText('Opportunity', w * 0.04, h * 0.64);
  c.font = `900 ${h * 0.2}px Inter, Arial, sans-serif`; c.fillText('212.555.0147', w * 0.5, h * 0.3);
  c.font = `700 ${h * 0.075}px Inter, Arial, sans-serif`; c.fillText('CONTACT EXCLUSIVE AGENT', w * 0.5, h * 0.52); c.fillText('HALLORAN PROPERTY GROUP', w * 0.5, h * 0.64);
  c.fillStyle = 'rgba(255,255,255,0.9)'; c.fillRect(w * 0.5, h * 0.74, w * 0.2, h * 0.17);
}
export function leasePoster(c, w, h) {
  c.fillStyle = '#f4f4f1'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#c42a3a'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = `900 ${h * 0.09}px Inter, Arial, sans-serif`; c.fillText('RETAIL BRANDING', w / 2, h * 0.1); c.fillText('OPPORTUNITY', w / 2, h * 0.2);
  c.fillStyle = '#16255c'; c.font = `900 ${h * 0.12}px Inter, Arial, sans-serif`; c.fillText('212.555.0147', w / 2, h * 0.38);
  c.font = `700 ${h * 0.05}px Inter, Arial, sans-serif`; c.fillText('CONTACT EXCLUSIVE AGENT', w / 2, h * 0.54); c.fillText('HALLORAN PROPERTY GROUP', w / 2, h * 0.62);
  const g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#c2306e'); g.addColorStop(1, '#202f6e'); c.fillStyle = g; c.fillRect(0, h * 0.74, w, h * 0.26);
}
// Raising Cane's oval mark: a red ellipse in a cream and black outline, the white script name, an orange ribbon with CHICKEN
// FINGERS
export function canesMark(c, w, h) {
  const cx = w / 2, cy = h / 2, rx = w * 0.47, ry = h * 0.46;
  c.save();
  c.fillStyle = '#17120f'; c.beginPath(); c.ellipse(cx, cy, rx, ry, -0.04, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#f2ead6'; c.beginPath(); c.ellipse(cx, cy, rx * 0.965, ry * 0.95, -0.04, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#c8102e'; c.beginPath(); c.ellipse(cx, cy, rx * 0.91, ry * 0.88, -0.04, 0, Math.PI * 2); c.fill();
  // the ribbon across the lower third
  c.translate(cx, cy + ry * 0.42); c.rotate(-0.05);
  c.fillStyle = '#17120f'; c.fillRect(-rx * 0.78, -ry * 0.2, rx * 1.56, ry * 0.44);
  c.fillStyle = '#f0a21a'; c.fillRect(-rx * 0.75, -ry * 0.16, rx * 1.5, ry * 0.36);
  c.fillStyle = '#17120f'; c.font = `900 ${ry * 0.2}px Inter, Arial, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('CHICKEN FINGERS', 0, ry * 0.02);
  c.rotate(0.05); c.translate(-cx, -(cy + ry * 0.42));
  // the script name
  c.fillStyle = '#17120f'; c.font = `italic 900 ${ry * 0.62}px "Kaushan Script", "KaushanScript-400", "Brush Script MT", cursive`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText("Cane's", cx + ry * 0.03, cy - ry * 0.16 + ry * 0.03);
  c.fillStyle = '#ffffff'; c.fillText("Cane's", cx, cy - ry * 0.16);
  c.restore();
}
// Target's bullseye mark: drawn from scratch (a disc, a ring), white on the glass
export function targetMark(c, w, h) {
  const r = Math.min(w, h) / 2, cx = w / 2, cy = h / 2;
  c.fillStyle = '#f7f7f7';
  c.beginPath(); c.arc(cx, cy, r * 0.96, 0, Math.PI * 2); c.arc(cx, cy, r * 0.64, 0, Math.PI * 2, true); c.fill();
  c.beginPath(); c.arc(cx, cy, r * 0.32, 0, Math.PI * 2); c.fill();
}

// ================================================================== the Harlem Center's office slab (105 W 125th St)
// Over the kit's 21 m brick base: the grey slab of ribbon windows set back 4 m from 125th Street, to 53.3 m (the compiled
// record), a brick return at the Lenox corner.
export function hctop(group, ctx, spec, frame) {
  const K = frame.kit, M = mats(), L = frame.L;
  const y0 = spec.h ?? 21.0, top = 53.3;
  // AR34: the slab is tan-pink brick with a continuous ribbon of pale blue-grey glass every ~3.9 m
  // (1.3 m tall, 2.6 m of brick between), set back 4 m from 125th Street; the brick return at the Lenox corner carries light stripes
  const slab = K.mat('brick_red', { tint: '#b88a74', dirt: 0.3 });
  const brick = K.mat('brick_red', { tint: '#b0705c', dirt: 0.3 });
  const glass = towerGlass('glass_tower_blue', '#8aa2b0', 101);
  const glassLit = towerGlass('glass_tower_blue', '#8aa2b0', 102, [0xfff2dc, 0.55]);
  // the four 2.6 m windows of the brick base (12.1-14.7 m): pale blue-grey reflective panes in a 3 x 2 grid of thin white mullions
  { const gl = towerGlass('glass_tower_blue', '#94a6b2', 141), mu = paleMullion();
    for (const [ua, ub] of [[4.0, 6.6], [11.2, 13.8], [21.1, 23.7], [28.4, 31.0]]) {
      K.box(gl, ua + 0.05, ub - 0.05, 12.15, 14.65, -0.1, -0.06, { c: 0, skip: 16 });
      for (const f of [1 / 3, 2 / 3]) K.box(mu, ua + (ub - ua) * f - 0.025, ua + (ub - ua) * f + 0.025, 12.1, 14.7, -0.12, 0.02, { c: 0 });
      K.box(mu, ua, ub, 13.4, 13.45, -0.12, 0.02, { c: 0 });
    } }
  const a0 = 0.6, a1 = L - 9.5, wF = -4.0, wB = -38.0;
  K.box(slab, a0, a1, y0, top, wB, wF, { c: 0.03 });
  const pale = K.mat('cast_stone', { tint: '#d6cdbd', dirt: 0.25 });
  for (let y = y0 + 1.4, k = 0; y + 1.3 < top - 0.8; y += 3.9, k++) {
    const n = Math.round((a1 - a0) / 6.0), pw = (a1 - a0 - 0.8) / n;
    for (let i = 0; i < n; i++) K.box(hash(i, k, 13) < 0.25 ? glassLit : glass, a0 + 0.4 + i * pw, a0 + 0.4 + (i + 1) * pw - 0.08, y, y + 1.3, wF - 0.05, wF + 0.04, { c: 0 });
    K.box(pale, a0, a1, y - 0.1, y, wF, wF + 0.1, { c: 0 });
    K.box(pale, a0, a1, y + 1.3, y + 1.4, wF, wF + 0.12, { c: 0 });
  }
  // the slab's roof
  {
    const TOPF = 1 | 2 | 4 | 16 | 32;
    const roofT = K.mat('roof_gravel', { tint: '#8a8274', dirt: 0.3 });
    K.box(roofT, a0, a1, top, top + 0.05, wB, wF, { c: 0, skip: TOPF });
    for (const [x0, x1, y0b, y1b] of [[a0, a1, wF - 0.45, wF], [a0, a1, wB, wB + 0.45], [a0, a0 + 0.45, wB, wF], [a1 - 0.45, a1, wB, wF]]) K.box(slab, x0, x1, top, top + 0.7, y0b, y1b, { c: 0.02 });
    K.box(K.mat('panel_grey', { tint: '#a9abac', dirt: 0.3 }), a0 + 14, a0 + 24, top, top + 3.6, wB + 10, wB + 17, { c: 0.03 });
    K.box(K.mat('panel_alu', { tint: '#d3d6d8', dirt: 0.3 }), a0 + 6, a0 + 9.5, top, top + 2.4, wB + 6, wB + 9, { c: 0.04 });
    K.box(K.mat('panel_alu', { tint: '#d3d6d8', dirt: 0.3 }), a0 + 28, a0 + 32, top, top + 2.2, wB + 20, wB + 23, { c: 0.04 });
  }
  // the Lenox corner block, brick with light stripes, to 33.7 m
  K.box(brick, a1, L - 0.3, y0, 33.7, -30, -0.6, { c: 0.03 });
  const stripe = K.mat('cast_stone', { tint: '#d6cdbd', dirt: 0.25 });
  for (const y of [22.3, 23.6, 27.8, 29.0, 32.6]) K.box(stripe, a1 - 0.02, L - 0.28, y, y + 0.35, -30, -0.55, { c: 0 });
  void group; void ctx; void spec; void M;
}
export { w100 } from './bid3W100.js';   // 100 W 125th at Lenox (its own file)
export { boards, lot158, shut124, shut120, w148, w117, w105a } from './bid3Shops.js';   // 2089 ACP's billboard tower, the fenced lot, the closed shutters (AR34)
