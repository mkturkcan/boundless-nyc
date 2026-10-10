// AR34 STATIONS: the street access of the IRT's 125th Street station (the 1 train, Manhattan Valley Viaduct) as the
// 1931 mezzanine left it (docs/notes/ar34-stations.md):
// * the mezzanine (fare control) under the tracks at the station's south end, hung in the tower bay between the bents
// * the enclosed passageways east and west over Broadway's roadways on green plate girders;
// * WEST: the passageway ends over the west sidewalk, where two enclosed escalators go down in opposite directions
// along the sidewalk, one north to 125th Street, one south toward Tiemann Place (MTA entrance points 40.8157388
// -73.9585275 and 40.8151608 -73.9584439); each lands in a brick foot house with the station sign and a globe;
// * EAST: the head house over the east kerb (measured by VIADUCTS, mvvStation.js ST.house), the escalator facing south
// to the sidewalk (MTA 40.8153339 -73.9588257) under a red standing-seam roof, and the L-shaped stair: its upper
// flight an open steel stair over the roadway from the viaduct to a landing at the kerb, its lower flight beneath
// the escalator down to the sidewalk (MTA 40.8152606 -73.9583715; the 2026-04 photograph from Broadway's median).
// Frame: vk/mvv.js (u along the line from the 125th St crossing, NNE +; l across, ESE +). The street is the flat datum
// (gy); the floor of the mezzanine and the passageways 13.15 (VIADUCTS' measure of the east passageway).
import * as THREE from 'three';
import { V, UP, ibeam, plateGirder, angle } from '../vk/vkKit.js';
import { litMat, steelMat, otherMat } from '../vk/vkMats.js';
import { MV, P, DA, DN, toUL } from '../vk/mvv.js';

const { add, sub, mul, norm, cross } = V;
const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
// `?st34=0` keeps VIADUCTS' earlier access (the glazed street stair east of the line, no mezzanine, nothing west)
export const ST34 = !(Q && Q.get('st34') === '0');

const TAN30 = Math.tan(Math.PI / 6);
export const ACC = {
  mez: { u0: -36.0, u1: -28.3, l0: -3.9, l1: 3.9, y0: 14.6, y1: 17.6 },
  corr: { u0: -35.5, u1: -30.5, yF: 13.15, yG: 12.1, yC: 15.95 },
  // the west passageway's end over the sidewalk (the compiled west kerb at l ~-16.9, the building line ~-22.5)
  wEnd: -21.0,
  // escalators: head face (uA, lA) at the floor, the axis to the foot's MTA point (uB, lB); the sign faces away
  // from the station. All three straight along the line as the real ones; the east one at the MTA's l 18.0 stands on the
  // real sidewalk, which the compiled street lacks (its east kerb at l ~20.3): the patch `eWalk` below lays it
  esc: [
    { id: 'wN', uA: -30.5, lA: -19.3, uB: -6.44, lB: -19.3, roof: 'grey', globe: 1, kerbSide: 1 },
    { id: 'wS', uA: -35.5, lA: -19.4, uB: -57.98, lB: -19.4, roof: 'grey', globe: 1, kerbSide: -1 },
    { id: 'eS', uA: -38.4, lA: 18.0, uB: -59.21, lB: 18.0, roof: 'red', globe: 1, kerbSide: -1 },
  ],
  // the east L stair: a walkway south from the passageway along the viaduct, the upper flight east over the roadway, the
  // corner landing on two posts on the sidewalk, the lower flight south beneath the escalator to the sidewalk (its foot
  // at u ~-48.1, l 18.0; the MTA's stair point u -46.55, l 17.98)
  lst: { uW0: -35.5, uW1: -40.0, lW0: 7.4, lW1: 9.0, uF0: -40.0, uF1: -38.6, lTop: 9.0, lLand: 16.6, lLow: 18.0, wLow: 1.4 },
  // the east sidewalk where the compiled street has roadway (lead 11:02, recompile item 16 until then): pavement at the
  // sidewalk's height from the real kerb line to the compiled one, a granite kerb along it and at both ends
  eWalk: { u0: -62.0, u1: -36.6, l0: 16.3, l1: 20.35 },
  // Broadway's median under the station's south end: the compiled grass (u -61.3..-37.1, l -6.65..3.35, y 3.57-3.62) paved
  // as the 2026-04 photograph shows it (lead 11:02, recompile item 17), bollards at its south nose
  med: { u0: -61.45, u1: -36.9, l0: -6.75, l1: 3.45, y: 3.645 },
};
// the escalator's step line: a 1.2 m flat outside the head face, 30 deg down to the street, 2 m flat at the foot
function escGeom(e, gy) {
  const L = Math.hypot(e.uB - e.uA, e.lB - e.lA), du = (e.uB - e.uA) / L, dl = (e.lB - e.lA) / L;
  const yF = ACC.corr.yF, s1 = 1.2, s2 = s1 + (yF - gy) / TAN30, s3 = s2 + 2.0;
  const sEnd = L + 0.6, sEnc = s1 + (yF - gy - 0.6) / TAN30, sb0 = sEnc - 1.0;
  const y = (s) => (s <= s1 ? yF : s >= s2 ? gy : yF - (s - s1) * TAN30);
  // a point at axis distance s, lateral o (positive to the axis's left seen down the slope... (-dl, du)), height h
  const at = (s, o, h) => P(e.uA + du * s - dl * o, e.lA + dl * s + du * o, h);
  const D = norm(add(mul(DA, du), mul(DN, dl))), Lat = norm(add(mul(DA, -dl), mul(DN, du)));
  return { L, du, dl, yF, s1, s2, s3, sEnd, sEnc, sb0, y, at, D, Lat };
}

let _M = null;
function accMats(SM) {
  if (_M) return _M;
  const cv = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  let sign = null;
  if (cv) {
    // the entrance sign drawn here: black panel, white Helvetica-style lettering, the 1 line's red disc
    cv.width = 512; cv.height = 136;
    const x = cv.getContext('2d');
    x.fillStyle = '#141517'; x.fillRect(0, 0, 512, 136);
    x.fillStyle = '#ffffff'; x.textBaseline = 'alphabetic';
    x.font = 'bold 50px Helvetica, Arial, sans-serif'; x.fillText('125 Street', 22, 60);
    x.font = 'bold 40px Helvetica, Arial, sans-serif'; x.fillText('Station', 22, 112);
    x.fillStyle = '#ee352e'; x.beginPath(); x.arc(438, 68, 46, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#ffffff'; x.font = 'bold 66px Helvetica, Arial, sans-serif'; x.fillText('1', 438 - x.measureText('1').width / 2, 92);
    x.fillStyle = '#e8e8e2'; x.fillRect(0, 0, 512, 3); x.fillRect(0, 133, 512, 3);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    sign = new THREE.MeshStandardMaterial({ map: t, roughness: 0.45, metalness: 0.05, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.12 });
    sign.name = 'vk-st34sign';
  } else sign = new THREE.MeshStandardMaterial({ color: 0x141517, roughness: 0.5 });
  _M = {
    ...SM,
    sign,
    // the foot houses' brick: a dark brown-grey face brick (2015 / 2026-04 photographs)
    brick: otherMat('brick', { tint: '#6e5547', dirt: 0.35 }),
    coping: otherMat('lime', { tint: '#b9b4a8', dirt: 0.35 }),
    // the west enclosures' roofs a light grey standing-seam (2026-04 photograph); the east one red (SM.red)
    roofG: steelMat('irtRoofG', { paint: 0xc6c8c4, paint2: 0xbcbebb, rust: 0x6a5a4a, rustD: 0x4a3e34, rustAmt: 0.08, rough: 0.6, metal: 0.1, rivets: false, chalk: 0.2, guano: 0.1 }),
    // the enclosures' corrugated walls: the station's cream, a shade greyer than the platform screens
    corr: steelMat('irtCorr', { paint: 0xdcd6c6, paint2: 0xd2ccbc, rust: 0x8a7a66, rustD: 0x5d5043, rustAmt: 0.06, rough: 0.66, metal: 0.05, rivets: false, chalk: 0.08 }),
    rail: steelMat('irtRail', { paint: 0x1d1f1e, paint2: 0x1a1c1b, rust: 0x3a2e24, rustD: 0x2a221c, rustAmt: 0.05, rough: 0.4, metal: 0.3, rivets: false, noShadow: true }),
    globe: litMat('vkGlobeG', 0x52f08a, 0.18, 2.6, { base: 0x86c49a, rough: 0.25 }),
    tread: otherMat('concrete', { tint: '#8d8a84', dirt: 0.4 }),
    walk: otherMat('concrete', { tint: '#a39f97', dirt: 0.45 }),
    // the foot houses' lobbies: off-white glazed tile gone grey (the 2015 photograph through the door: a light lobby)
    tile: steelMat('irtTile', { paint: 0xbdbab2, paint2: 0xb3b0a8, rust: 0x7a7266, rustD: 0x5d5850, rustAmt: 0.05, rough: 0.35, metal: 0.0, rivets: false, chalk: 0.05 }),
    kerb: otherMat('granite'),
  };
  return _M;
}

// the platforms' station-name signs (MTA style, drawn here): black panel, a white rule along the top, white lettering
let _nameSign = null;
export function nameSignMat() {
  if (_nameSign) return _nameSign;
  const cv = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  if (cv) {
    cv.width = 512; cv.height = 112;
    const x = cv.getContext('2d');
    x.fillStyle = '#121314'; x.fillRect(0, 0, 512, 112);
    x.fillStyle = '#f2f2ee'; x.fillRect(0, 10, 512, 5);
    x.font = 'bold 58px Helvetica, Arial, sans-serif'; x.textBaseline = 'alphabetic'; x.fillText('125 Street', 26, 88);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    _nameSign = new THREE.MeshStandardMaterial({ map: t, roughness: 0.45, metalness: 0.05, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.1 });
  } else _nameSign = new THREE.MeshStandardMaterial({ color: 0x121314, roughness: 0.5 });
  _nameSign.name = 'vk-st34name';
  return _nameSign;
}
// a flat sign quad: centre c, the reading direction `right` (horizontal unit), facing `want`, half sizes hw x hh
export function signQuad(g, mat, c, right, want, hw, hh) {
  const A = add(c, add(mul(right, -hw), [0, -hh, 0])), B = add(c, add(mul(right, hw), [0, -hh, 0])), C = add(c, add(mul(right, hw), [0, hh, 0])), D = add(c, add(mul(right, -hw), [0, hh, 0]));
  let n = norm(cross(sub(B, A), sub(D, A)));
  if (V.dot(n, want) < 0) { n = mul(n, -1); g.quad(mat, B, A, D, C, n, [[1, 0], [0, 0], [0, 1], [1, 1]], [1, 0, 0, 0], [1, 0]); }
  else g.quad(mat, A, B, C, D, n, [[0, 0], [1, 0], [1, 1], [0, 1]], [1, 0, 0, 0], [1, 0]);
}

// a box between two points with the slope's normal as its up (for the inclined members)
function slopeUp(a, b, Lat) { const T = norm(sub(b, a)); const u = norm(cross(Lat, T)); return u[1] > 0 ? u : mul(u, -1); }

// one escalator: truss, steps and handrails, the enclosure (soffit, ribbed walls, window band, fascia, standing-seam roof),
// lamps, the mid support (west), the brick foot house with its door, sign and globe
function escalator(g, M, e, gy) {
  const G = escGeom(e, gy), { y, at, s1, sEnc, sb0, sEnd, Lat } = G, st = M.steel;
  const roof = e.roof === 'red' ? M.red : M.roofG;
  const seg = (s0, sA, o, dy, w, h, mat, opt = {}) => {
    // the member along the step line from s0 to sA (split at the slope's knees), lateral o, dy over the step line
    const knots = [s0, ...[s1, G.s2].filter((k) => k > s0 + 0.01 && k < sA - 0.01), sA];
    for (let k = 0; k + 1 < knots.length; k++) {
      const a = at(knots[k], o, y(knots[k]) + dy), b = at(knots[k + 1], o, y(knots[k + 1]) + dy);
      g.rect(mat, a, b, slopeUp(a, b, Lat), w, h, { caps: opt.caps ?? false, rv: [], seed: opt.seed ?? 610 });
    }
  };
  // the truss under the steps (dark), the steps' grooved band and the black handrails on glass-less balustrades
  seg(0, G.s3, 0, -0.62, 1.62, 1.0, M.steelU, { caps: true, seed: 611 });
  seg(0, G.s3, 0, 0.02, 1.02, 0.05, M.rail);
  for (const o of [-0.62, 0.62]) { seg(0, G.s3, o, 0.5, 0.06, 0.9, M.corr); seg(0, G.s3, o, 0.98, 0.09, 0.07, M.rail); }
  // plumb plates along the step line (the enclosure's walls stand plumb, its soffit and roof follow the slope): one quad per
  // stretch between the knees, wound to face `want`, uv in metres
  const quad4 = (mat, a, b, c, d, want, uv, seed) => {
    let n = norm(cross(sub(b, a), sub(d, a)));
    if (V.dot(n, want) < 0) { n = mul(n, -1); g.quad(mat, a, d, c, b, n, [uv[0], uv[3], uv[2], uv[1]], [1, 0, 0, 0], [1, seed]); }
    else g.quad(mat, a, b, c, d, n, uv, [1, 0, 0, 0], [1, seed]);
  };
  const knotsOf = (s0, sA) => [s0, ...[s1, G.s2].filter((k) => k > s0 + 0.01 && k < sA - 0.01), sA];
  const plate = (mat, s0, sA, o, dy0, dy1, sg) => {
    const K = knotsOf(s0, sA), want = mul(Lat, sg);
    for (let k = 0; k + 1 < K.length; k++) {
      const sa = K[k], sb = K[k + 1];
      quad4(mat, at(sa, o, y(sa) + dy0), at(sb, o, y(sb) + dy0), at(sb, o, y(sb) + dy1), at(sa, o, y(sa) + dy1), want,
        [[sa, 0], [sb, 0], [sb, dy1 - dy0], [sa, dy1 - dy0]], 613);
    }
  };
  const deck = (mat, s0, sA, dy, hw, sg) => {
    const K = knotsOf(s0, sA);
    for (let k = 0; k + 1 < K.length; k++) {
      const sa = K[k], sb = K[k + 1];
      quad4(mat, at(sa, -hw, y(sa) + dy), at(sb, -hw, y(sb) + dy), at(sb, hw, y(sb) + dy), at(sa, hw, y(sa) + dy), [0, sg, 0],
        [[sa, 0], [sb, 0], [sb, 2 * hw], [sa, 2 * hw]], 612);
    }
  };
  // the enclosure, from the head face to where its roof meets the foot house: soffit, ribbed lower walls, the window band
  // in its frame, the fascia, the eave trim (both faces of each wall: the inside shows through the glass)
  deck(M.corr, 0.0, sEnc, -1.15, 1.3, -1);
  for (const sg of [-1, 1]) {
    plate(M.corr, 0.0, sEnc, sg * 1.3, -1.15, 1.06, sg);
    plate(M.corr, 0.0, sEnc, sg * 1.24, -0.9, 1.06, -sg);
    plate(M.win, 0.0, sEnc, sg * 1.27, 1.06, 2.2, sg);
    plate(M.win, 0.0, sEnc, sg * 1.26, 1.06, 2.2, -sg);
    plate(M.corr, 0.0, sEnc, sg * 1.3, 2.2, 2.47, sg);
    plate(M.corr, 0.0, sEnc, sg * 1.24, 2.2, 2.47, -sg);
    for (const dy of [1.06, 2.2]) seg(0.0, sEnc, sg * 1.3, dy, 0.07, 0.08, M.steelS);
    seg(0.0, sEnc + 0.4, sg * 1.47, 2.43, 0.05, 0.16, e.roof === 'red' ? M.red : M.eave);   // the eave trim
    // plumb ribs of the corrugated wall (every 0.3 m) and the window mullions (every ~1.55 m)
    for (let s = 0.25; s < sEnc - 0.2; s += 0.3) {
      const yy = y(s); g.rect(M.corr, at(s, sg * 1.315, yy - 1.12), at(s, sg * 1.315, yy + 1.03), G.D, 0.03, 0.05, { caps: false, rv: [] });
    }
    for (let s = 0.6; s < sEnc - 0.3; s += 1.55) {
      const yy = y(s); g.rect(M.steelS, at(s, sg * 1.29, yy + 1.06), at(s, sg * 1.29, yy + 2.2), G.D, 0.07, 0.07, { caps: false, rv: [] });
    }
  }
  deck(M.corr, 0.0, sEnc, 2.42, 1.3, -1);                                              // the ceiling
  deck(roof, 0.0, sEnc + 0.4, 2.53, 1.48, 1); deck(roof, 0.0, sEnc + 0.4, 2.47, 1.48, -1);   // roof
  for (const sg of [-1, 1]) plate(roof, 0.0, sEnc + 0.4, sg * 1.48, 2.47, 2.53, sg);
  for (let o = -1.32; o <= 1.33; o += 0.33) seg(0.0, sEnc + 0.4, o, 2.55, 0.03, 0.04, roof);   // standing seams
  seg(0.3, sEnc - 0.5, 0, 2.28, 0.14, 0.03, M.lamp);                                  // the fluorescent strip
  // the west escalators' mid support: two columns on the sidewalk and a cross beam under the truss
  if (e.id !== 'eS') {
    const sm = s1 + 0.45 * (G.s2 - s1), ym = y(sm) - 1.18;
    for (const o of [-1.0, 1.0]) g.rect(st, at(sm, o, gy), at(sm, o, ym - 0.3), G.D, 0.24, 0.24, { seed: 615 });
    g.rect(st, at(sm, -1.2, ym - 0.15), at(sm, 1.2, ym - 0.15), UP, 0.26, 0.3, { seed: 616 });
    for (const o of [-1.0, 1.0]) g.rect(st, at(sm, o, gy), at(sm, o, gy + 0.12), G.D, 0.5, 0.5, { seed: 617 });
  }
  // the brick foot house: walls 3.1 m, a stone coping, a flat roof (the east one a red hipped roof), the door at the far
  // end with the sign over it, a concrete floor inside
  const bh = gy + 3.1, bw = 1.6, t = 0.25;
  const wall = (sa, sb, o, h0, h1) => g.rect(M.brick, at(sa, o, (h0 + h1) / 2), at(sb, o, (h0 + h1) / 2), UP, t, h1 - h0, { seed: 618 });
  for (const sg of [-1, 1]) wall(sb0, sEnd, sg * (bw - t / 2), gy, bh);
  // the back corners where the enclosure enters (between its walls and the brick)
  for (const sg of [-1, 1]) g.rect(M.brick, at(sb0 + t / 2, sg * 1.45, gy), at(sb0 + t / 2, sg * 1.45, bh), G.D, 0.3, t, { seed: 619 });
  // the far end: piers either side of a 1.9 m opening and a lintel
  { const s = sEnd - t / 2;
    for (const sg of [-1, 1]) g.rect(M.brick, at(s, sg * 1.27, gy), at(s, sg * 1.27, bh), G.D, 0.66, t, { seed: 619 });
    g.rect(M.brick, at(s, -0.95, (gy + 2.15 + bh) / 2), at(s, 0.95, (gy + 2.15 + bh) / 2), G.D, bh - gy - 2.15, t, { caps: false, seed: 619 });
    // the sign on the lintel's face (0.06 proud)
    const c = at(sEnd + 0.04, 0, gy + 2.62), hw = 0.9, hh = 0.24, Dx = G.D, Lx = G.Lat;
    const A = add(c, add(mul(Lx, hw), [0, -hh, 0])), B = add(c, add(mul(Lx, -hw), [0, -hh, 0])), C = add(c, add(mul(Lx, -hw), [0, hh, 0])), D0 = add(c, add(mul(Lx, hw), [0, hh, 0]));
    g.quad(M.sign, A, B, C, D0, Dx, [[0, 0], [1, 0], [1, 1], [0, 1]], [1, 0, 0, 0], [1, 0]);
    g.rect(M.steelS, at(sEnd + 0.015, -0.94, gy + 2.62), at(sEnd + 0.015, 0.94, gy + 2.62), UP, 0.03, 0.54, { rv: [] });
  }
  g.rect(M.coping, at(sb0 - 0.05, 0, bh + 0.06), at(sEnd + 0.05, 0, bh + 0.06), UP, 2 * bw + 0.1, 0.12, { seed: 620 });
  g.rect(M.tread, at(sb0 + 0.3, 0, gy + 0.04), at(sEnd - 0.3, 0, gy + 0.04), UP, 2 * bw - 2 * t, 0.06, { caps: false });
  // the lobby inside: glazed tile on the walls (the brick's inner face read through the door as a brick wall, r7
  // stFootWN at full resolution), a ceiling, a fluorescent fixture
  for (const sg of [-1, 1]) g.rect(M.tile, at(Math.max(sb0 + 0.3, G.s2), sg * (bw - t - 0.012), gy + 1.5), at(sEnd - t, sg * (bw - t - 0.012), gy + 1.5), UP, 0.02, 2.96, { caps: false, rv: [] });
  g.rect(M.tile, at(Math.max(sb0 + 0.3, G.s2), 0, bh - 0.12), at(sEnd - t, 0, bh - 0.12), UP, 2 * (bw - t), 0.02, { caps: false, rv: [] });
  g.rect(M.lamp, at(Math.max(sb0 + 0.6, G.s2 + 0.3), 0, bh - 0.16), at(sEnd - 0.6, 0, bh - 0.16), UP, 0.14, 0.03, { caps: false, rv: [] });
  if (e.roof === 'red') {
    // the hipped roof: four faces up 0.75 m to a ridge along the axis
    const r0 = sb0 - 0.15, r1 = sEnd + 0.15, ow = bw + 0.15, yr = bh + 0.12, yt = yr + 0.75, rr0 = r0 + 0.9, rr1 = r1 - 0.9;
    const pa = at(r0, -ow, yr), pb = at(r1, -ow, yr), pc = at(r1, ow, yr), pd = at(r0, ow, yr), ra = at(rr0, 0, yt), rb = at(rr1, 0, yt);
    const nf = (a, b, c) => norm(cross(sub(b, a), sub(c, a)));
    const uvq = (q) => [q[0], q[2]];
    const faces = [[pa, pb, rb, ra], [pc, pd, ra, rb], [pb, pc, rb], [pd, pa, ra]];
    for (const F of faces) { let n = nf(F[0], F[1], F[2]); let Fv = F; if (n[1] < 0) { Fv = F.slice().reverse(); n = mul(n, -1); } g.poly(M.red, Fv, n, uvq); }
  } else g.rect(M.roof, at(sb0, 0, bh + 0.02), at(sEnd, 0, bh + 0.02), UP, 2 * bw - 0.02, 0.06, { caps: false });
  // the globe lamp on its post at the door (kerb side or building side as the photographs show)
  if (e.globe) {
    const o = e.kerbSide * (bw + 0.25), s = sEnd - 0.35, py = gy;
    g.cyl(M.steelS, at(s, o, py), at(s, o, py + 2.75), 0.055, 10);
    g.cyl(M.steelS, at(s, o, py), at(s, o, py + 0.35), 0.1, 10);
    g.cyl(M.globe, at(s, o, py + 2.78), at(s, o, py + 2.86), 0.12, 14);
    g.cyl(M.globe, at(s, o, py + 2.86), at(s, o, py + 3.1), 0.17, 14);
    g.cyl(M.globe, at(s, o, py + 3.1), at(s, o, py + 3.2), 0.12, 14);
    g.cyl(M.steelS, at(s, o, py + 3.2), at(s, o, py + 3.27), 0.05, 8);
  }
}

// a passageway along l from la to lb (u0..u1): cream framed panels over two plate girders, windows on both long faces,
// a flat roof under the red-brown coping, the floor slab
function passage(g, M, la, lb, nWin, panelWall, windowIn) {
  const C = ACC.corr, st = M.steel, lo = Math.min(la, lb), hi = Math.max(la, lb), lm = (lo + hi) / 2;
  const XZ = (p) => [p[0], p[2]];
  for (const [u, n] of [[C.u1, DA], [C.u0, mul(DA, -1)]]) {
    const A = XZ(P(u, lo, 0)), B = XZ(P(u, hi, 0));
    panelWall(g, M, A, B, n, C.yF, C.yC - 0.3, 0.9, { caps: true });
    g.rect(M.red, [A[0] + n[0] * 0.08, C.yC - 0.15, A[1] + n[2] * 0.08], [B[0] + n[0] * 0.08, C.yC - 0.15, B[1] + n[2] * 0.08], UP, 0.16, 0.3);
    for (let k = 0; k < nWin; k++) {
      const t = (k + 0.5) / nWin, lc = lo + 0.9 + (hi - lo - 1.8) * t, w = 0.42;
      const a = P(u, lc - w, 0), b = P(u, lc + w, 0);
      windowIn(g, M, [a[0] + n[0] * 0.07, a[2] + n[2] * 0.07], [b[0] + n[0] * 0.07, b[2] + n[2] * 0.07], n, 14.0, 15.1, 2, 2, M.panel);
    }
    plateGirder(g, st, P(u + (n === DA ? -0.14 : 0.14), lo - 0.3, (C.yG + C.yF) / 2), P(u + (n === DA ? -0.14 : 0.14), hi, (C.yG + C.yF) / 2), UP, C.yF - C.yG, 0.28, { stiff: 1.1, seed: 631 });
  }
  g.rect(M.roof, P(C.u0, lm, C.yC - 0.32), P(C.u1, lm, C.yC - 0.32), UP, hi - lo + 0.1, 0.08);
  g.rect(M.slab, P(C.u0, lm, C.yF - 0.1), P(C.u1, lm, C.yF - 0.1), UP, hi - lo, 0.2);
  for (let l = lo + 1.0; l < hi - 0.5; l += 2.0) ibeam(g, M.steelU, P(C.u0 + 0.2, l, C.yF - 0.42), P(C.u1 - 0.2, l, C.yF - 0.42), UP, 0.42, 0.18, 0.014, 0.01, { riv: false });
}

export function accessBuild(g, SM, gy, panelWall, windowIn) {
  if (!ST34) return;
  const M = accMats(SM), st = M.steel, C = ACC.corr, Z = ACC.mez;
  const XZ = (p) => [p[0], p[2]];
  // ---- the mezzanine in the tower bay: cream framed panels, flat roof, steel floor on two cross girders, the headers
  // along both column lines between the tower's columns that carry it and the passageways
  { const faces = [[XZ(P(Z.u0, Z.l0, 0)), XZ(P(Z.u0, Z.l1, 0)), mul(DA, -1)], [XZ(P(Z.u1, Z.l1, 0)), XZ(P(Z.u1, Z.l0, 0)), DA],
      [XZ(P(Z.u0, Z.l1, 0)), XZ(P(Z.u1, Z.l1, 0)), DN], [XZ(P(Z.u1, Z.l0, 0)), XZ(P(Z.u0, Z.l0, 0)), mul(DN, -1)]];
    for (const [A, B, n] of faces) panelWall(g, M, A, B, n, Z.y0, Z.y1, 0.95, { midRail: true, caps: true });
    const um = (Z.u0 + Z.u1) / 2;
    g.rect(M.roof, P(Z.u0 - 0.05, 0, Z.y1 + 0.04), P(Z.u1 + 0.05, 0, Z.y1 + 0.04), UP, Z.l1 - Z.l0 + 0.1, 0.08);
    g.rect(M.steelU, P(Z.u0, 0, Z.y0 - 0.08), P(Z.u1, 0, Z.y0 - 0.08), UP, Z.l1 - Z.l0, 0.16);
    for (const u of [Z.u0 + 0.15, Z.u1 - 0.15]) plateGirder(g, st, P(u, -4.45, Z.y0 - 0.45), P(u, 4.45, Z.y0 - 0.45), UP, 0.6, 0.26, { stiff: 1.0, seed: 640 });
    // deep headers in both column planes between the tower's columns: the passageways' girders bear on their foot, the
    // mezzanine's floor girders frame in at their top
    for (const l of [-4.6, 4.6]) plateGirder(g, st, P(-36.42, l, 13.35), P(-27.88, l, 13.35), UP, 2.7, 0.3, { stiff: 1.2, seed: 641 });
    // the passageways' ends under the mezzanine's floor (cream, up to the floor)
    for (const l of [Z.l0, Z.l1]) { const A = XZ(P(C.u0, l, 0)), B = XZ(P(C.u1, l, 0)); panelWall(g, M, A, B, l < 0 ? DN : mul(DN, -1), C.yF, Z.y0 - 0.05, 0.9, { caps: true }); }
    void um;
  }
  // ---- the passageways: east from the mezzanine to VIADUCTS' head house is mvvStation.js's corridor (extended to the
  // mezzanine there); west from the mezzanine to the escalators' heads over the west sidewalk
  passage(g, M, Z.l0, ACC.wEnd, 8, panelWall, windowIn);   // (eight a side: the 2026-04 photograph's south face)
  { const A = XZ(P(C.u0, ACC.wEnd, 0)), B = XZ(P(C.u1, ACC.wEnd, 0));
    panelWall(g, M, A, B, mul(DN, -1), C.yF, C.yC - 0.3, 0.9, { caps: true });
    g.rect(M.red, [A[0] - DN[0] * 0.08, C.yC - 0.15, A[1] - DN[2] * 0.08], [B[0] - DN[0] * 0.08, C.yC - 0.15, B[1] - DN[2] * 0.08], UP, 0.16, 0.3);
    // its legs on the sidewalk: four box columns, cross beams, X bracing between the pairs
    const legs = [[-35.2, -17.95], [-30.8, -17.95], [-35.2, -20.7], [-30.8, -20.7]];
    for (const [u, l] of legs) { g.rect(st, P(u, l, gy), P(u, l, C.yG), DA, 0.3, 0.3, { seed: 650 }); g.rect(st, P(u, l, gy), P(u, l, gy + 0.1), DA, 0.6, 0.6, { seed: 651 }); }
    for (const l of [-17.95, -20.7]) {
      plateGirder(g, st, P(-35.6, l, C.yG - 0.3), P(-30.4, l, C.yG - 0.3), UP, 0.6, 0.3, { stiff: 1.0, seed: 652 });
      for (const [ua, ub] of [[-35.05, -30.95], [-30.95, -35.05]]) angle(g, M.steelS, P(ua, l, gy + 2.6), P(ub, l, C.yG - 0.75), DN, 0.1, 0.1, 0.011, { fs: 1, fu: 1, off: [0, 0], seed: 653 });
    }
  }
  // ---- the escalators and their foot houses, the street patches under them
  for (const e of ACC.esc) escalator(g, M, e, gy);
  streetPatches(g, M, gy);
  // ---- the east L stair (open green steel): a walkway along the viaduct south from the passageway, the upper flight east
  // over the roadway under a red canopy, the corner landing on two posts at the kerb, the lower flight beneath the escalator
  { const S = ACC.lst, yF = C.yF, rise = 0.18;
    const grn = M.steel;
    // the walkway: grating deck, two stringers, railings
    const lmW = (S.lW0 + S.lW1) / 2;
    g.rect(M.steelU, P(S.uW0, lmW, yF - 0.05), P(S.uW1, lmW, yF - 0.05), UP, S.lW1 - S.lW0, 0.06, { caps: false });
    for (const l of [S.lW0, S.lW1]) {
      g.rect(grn, P(S.uW0, l, yF - 0.25), P(S.uW1, l, yF - 0.25), UP, 0.1, 0.36, { seed: 660 });
      g.rect(grn, P(S.uW0, l, yF + 1.05), P(S.uW1, l, yF + 1.05), UP, 0.05, 0.05);
      for (let u = S.uW0; u >= S.uW1; u -= 1.2) g.rect(grn, P(u, l, yF), P(u, l, yF + 1.05), DA, 0.05, 0.05, { caps: false });
    }
    // the upper flight east, at 30 deg: from the walkway's end (lTop) down to the landing (lLand)
    const yL = yF - (S.lLand - S.lTop) * TAN30, um = (S.uF0 + S.uF1) / 2, wF = Math.abs(S.uF1 - S.uF0);
    const fTop = P(um, S.lTop, yF), fBot = P(um, S.lLand, yL);
    const upF = slopeUp(fTop, fBot, mul(DA, 1));
    for (const du of [-wF / 2, wF / 2]) {
      g.rect(grn, add(P(um + du, S.lTop, yF - 0.2), [0, 0, 0]), P(um + du, S.lLand, yL - 0.2), upF, 0.1, 0.36, { seed: 661 });
      g.rect(grn, P(um + du, S.lTop, yF + 0.95), P(um + du, S.lLand, yL + 0.95), upF, 0.05, 0.05);
      for (let k = 0; k <= 6; k++) { const t = k / 6, l = S.lTop + (S.lLand - S.lTop) * t, yy = yF + (yL - yF) * t; g.rect(grn, P(um + du, l, yy), P(um + du, l, yy + 0.95), DN, 0.05, 0.05, { caps: false }); }
    }
    { const nT = Math.round((yF - yL) / rise); for (let k = 0; k < nT; k++) { const l = S.lTop + ((S.lLand - S.lTop) * (k + 0.5)) / nT, yy = yF - ((yF - yL) * (k + 1)) / nT; g.rect(M.steelU, P(um - wF / 2 + 0.08, l, yy + 0.02), P(um + wF / 2 - 0.08, l, yy + 0.02), UP, 0.28, 0.04, { rv: [] }); } }
    // its canopy: red, on posts off the stringers
    g.rect(M.red, add(fTop, [0, 2.45, 0]), add(fBot, [0, 2.45, 0]), upF, wF + 0.3, 0.05, { seed: 662 });
    for (let k = 0; k <= 3; k++) { const t = k / 3, l = S.lTop + (S.lLand - S.lTop) * t, yy = yF + (yL - yF) * t; for (const du of [-wF / 2, wF / 2]) g.rect(grn, P(um + du, l, yy + 0.95), P(um + du, l, yy + 2.42), DN, 0.06, 0.06, { caps: false }); }
    // the corner landing at the kerb on two posts
    const lE = S.lLow + S.wLow / 2, lc = (S.lLand + lE) / 2;
    g.rect(M.steelU, P(um, S.lLand, yL - 0.05), P(um, lE, yL - 0.05), UP, wF, 0.08);
    for (const u of [S.uF0, S.uF1]) plateGirder(g, grn, P(u, S.lLand, yL - 0.32), P(u, lE, yL - 0.32), UP, 0.45, 0.16, { stiff: 0.9, seed: 663 });
    for (const u of [S.uF0 + 0.12, S.uF1 - 0.12]) { g.rect(grn, P(u, lE - 0.25, gy), P(u, lE - 0.25, yL - 0.5), DA, 0.2, 0.2, { seed: 664 }); g.rect(grn, P(u, lE - 0.25, gy), P(u, lE - 0.25, gy + 0.1), DA, 0.45, 0.45); }
    g.rect(grn, P(S.uF1, S.lLand, yL + 1.05), P(S.uF1, lE, yL + 1.05), UP, 0.05, 0.05);
    g.rect(grn, P(S.uF0, S.lLand, yL + 1.05), P(S.uF0, S.lLow - S.wLow / 2, yL + 1.05), UP, 0.05, 0.05);
    // the lower flight south beneath the escalator, at 33 deg, to the sidewalk
    const t33 = Math.tan((33 * Math.PI) / 180), runL = (yL - gy) / t33, uTopL = S.uF0, uFoot = uTopL - runL;
    const lTop = P(uTopL, S.lLow, yL), lBot = P(uFoot, S.lLow, gy), upL = slopeUp(lTop, lBot, DN);
    for (const dl of [-S.wLow / 2, S.wLow / 2]) {
      g.rect(grn, P(uTopL, S.lLow + dl, yL - 0.2), P(uFoot, S.lLow + dl, gy - 0.2), upL, 0.1, 0.36, { seed: 665 });
      g.rect(grn, P(uTopL, S.lLow + dl, yL + 0.95), P(uFoot, S.lLow + dl, gy + 0.95), upL, 0.05, 0.05);
      for (let k = 0; k <= 6; k++) { const t = k / 6, u = uTopL - runL * t, yy = yL + (gy - yL) * t; g.rect(grn, P(u, S.lLow + dl, yy), P(u, S.lLow + dl, yy + 0.95), DA, 0.05, 0.05, { caps: false }); }
    }
    { const nT = Math.round((yL - gy) / rise); for (let k = 0; k < nT; k++) { const u = uTopL - (runL * (k + 0.5)) / nT, yy = yL - ((yL - gy) * (k + 1)) / nT + rise; g.rect(M.tread, P(u, S.lLow - S.wLow / 2 + 0.08, yy - 0.02), P(u, S.lLow + S.wLow / 2 - 0.08, yy - 0.02), UP, 0.28, 0.05, { rv: [] }); } }
  }
}

// the two street patches (paving at the street's own heights)
function streetPatches(g, M, gy) {
  const E = ACC.eWalk, Md = ACC.med, ya = 3.37;
  // the east sidewalk: a concrete slab from the asphalt up to the sidewalk's height, a granite kerb along the real kerb
  // line and short returns at both ends
  const lm = (E.l0 + E.l1) / 2, top = gy + 0.004;
  g.rect(M.walk, P(E.u0, lm, (ya + top) / 2), P(E.u1, lm, (ya + top) / 2), UP, E.l1 - E.l0, top - ya, { caps: true });
  g.rect(M.kerb, P(E.u0, E.l0 + 0.08, (ya + top + 0.004) / 2), P(E.u1, E.l0 + 0.08, (ya + top + 0.004) / 2), UP, 0.16, top + 0.004 - ya, { caps: true });
  for (const u of [E.u0 + 0.08, E.u1 - 0.08]) g.rect(M.kerb, P(u, E.l0, (ya + top + 0.004) / 2), P(u, E.l1 - 0.05, (ya + top + 0.004) / 2), UP, 0.16, top + 0.004 - ya, { caps: true });
  // the median: concrete paving over the grass, its edge kerbs, three bollards at the south nose
  const ml = (Md.l0 + Md.l1) / 2;
  g.rect(M.walk, P(Md.u0, ml, (gy + Md.y) / 2), P(Md.u1, ml, (gy + Md.y) / 2), UP, Md.l1 - Md.l0, Md.y - gy + 0.01, { caps: true });
  for (const l of [-2.6, -0.6, 1.4]) { g.cyl(M.steelS, P(Md.u0 + 0.5, l, Md.y), P(Md.u0 + 0.5, l, Md.y + 0.95), 0.11, 12); g.cyl(M.steelS, P(Md.u0 + 0.5, l, Md.y + 0.95), P(Md.u0 + 0.5, l, Md.y + 1.0), 0.09, 12); }
}
// compiled furniture inside the station's footprints on the sidewalks (a lamp stood inside the south foot house): pk's
// dropFurniture asks here for every record
export function accessDrop(wx, wz) {
  if (!ST34) return false;
  const [u, l] = toUL(wx, wz);
  if (u < -66 || u > 0 || Math.abs(l) < 15) return false;
  for (const e of ACC.esc) {
    const G = escGeom(e, 3.52), du = u - e.uA, dl = l - e.lA, s = du * G.du + dl * G.dl, o = -du * G.dl + dl * G.du;
    if (s > G.sb0 - 0.5 && s < G.sEnd + 0.6 && Math.abs(o) < 2.1) return true;
  }
  if (u > -35.8 && u < -30.2 && l > -21.3 && l < -17.4) return true;
  if (u > -48.6 && u < -38.4 && l > 16.4 && l < 19.4) return true;
  return false;
}
// walker obstacles: the west legs, the mid supports, the foot houses, the L stair's posts and lower flight
export function accessColliders(addBox, gy, rot) {
  if (!ST34) return;
  for (const [u, l] of [[-35.2, -17.95], [-30.8, -17.95], [-35.2, -20.7], [-30.8, -20.7]]) { const p = P(u, l, 0); addBox(p[0], gy + 1.2, p[2], 0.25, 1.2, 0.25, rot); }
  for (const e of ACC.esc) {
    const G = escGeom(e, gy), r = Math.atan2(G.D[2], G.D[0]);
    const m = G.at((G.sb0 + G.sEnd) / 2 - 0.3, 0, 0); addBox(m[0], gy + 1.5, m[2], (G.sEnd - G.sb0) / 2 - 0.4, 1.5, 1.6, r);
    if (e.id !== 'eS') { const sm = G.s1 + 0.45 * (G.s2 - G.s1); for (const o of [-1, 1]) { const p = G.at(sm, o, 0); addBox(p[0], gy + 1.2, p[2], 0.2, 1.2, 0.2, r); } }
  }
  const S = ACC.lst, lE = S.lLow + S.wLow / 2;
  for (const u of [S.uF0 + 0.12, S.uF1 - 0.12]) { const p = P(u, lE - 0.25, 0); addBox(p[0], gy + 1.2, p[2], 0.2, 1.2, 0.2, rot); }
  { const yL = ACC.corr.yF - (S.lLand - S.lTop) * TAN30, runL = (yL - gy) / Math.tan((33 * Math.PI) / 180), p = P(S.uF0 - runL * 0.75, S.lLow, 0); addBox(p[0], gy + 1.0, p[2], runL / 4, 1.0, S.wLow / 2, rot); }
}
// the escalators' axes and heights for other parts (TRAINS, the sheets)
export function accessPlan(gy) { return ACC.esc.map((e) => { const G = escGeom(e, gy); return { id: e.id, head: [e.uA, e.lA], foot: [e.uB, e.lB], s1: G.s1, s2: G.s2, s3: G.s3, sEnd: G.sEnd, rise: G.yF - gy }; }); }
void MV;
