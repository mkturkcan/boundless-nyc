// AR33 VIADUCT: the Park Avenue Viaduct (New York Central, 1893-97; Metro-North) over E 125th Street and the
// Harlem-125th Street station (docs/notes/ar33-viaducts.md). Positions from OpenStreetMap through city/w125eData.js (the
// four tracks, the two island platforms, the 1897 station house's footprint), heights as city/w125e.js derived them
// (rail 7.0 m over the street). at 125th St and Park Avenue:
// * the steel painted a sandstone tan; the span over 125th St a deep plate girder each side painted blue, carrying the
// silver cut-out artwork (reclining sphinxes at both ends, fans, a sunburst, skylines: drawn here from scratch);
// * built-up riveted columns in the avenue's median with knee brackets under the fascia girders, a tan parapet over
// the girders, the platform canopies on columns above, the stone station house at street level under the deck.
// Grid frame (city/w125eKit.js): u along the streets (ESE), v along the avenue (NNE), world = (C u + S v, y, S u - C v).
import * as THREE from 'three';
import { V, UP, RIV, path, plateGirder, laced, gusset, ibeam, angle, castBase, frustum, girderSpikes } from './vkKit.js';
import { steelMat, otherMat, litMat } from './vkMats.js';
import { applyLightTrim } from '../../world/materials.js';
import { TRACKS, PLATFORMS, STATION } from '../w125eData.js';
import { toUV } from '../w125eKit.js';

const { add, mul } = V;
const C29 = Math.cos((29 * Math.PI) / 180), S29 = Math.sin((29 * Math.PI) / 180);
export const PP = (u, v, y) => [C29 * u + S29 * v, y, S29 * u - C29 * v];
export const DU = [C29, 0, S29], DVv = [S29, 0, -C29];
const TUV = TRACKS.map((t) => t.map(([x, z]) => toUV(x, z)));
export const tU = (i, v) => {
  const T = TUV[i];
  if (v <= T[0][1]) return T[0][0];
  for (let k = 0; k + 1 < T.length; k++) { const a = T[k], b = T[k + 1]; if (v <= b[1]) return a[0] + ((b[0] - a[0]) * (v - a[1])) / (b[1] - a[1]); }
  return T[T.length - 1][0];
};
export const PK = (() => {
  const RAIL = 3.38 + 7.0, DECK_T = RAIL - 0.62, DECK_B = RAIL - 0.95, GIRD_B = RAIL - 2.55;
  const SUV = STATION.map(([x, z]) => toUV(x, z));
  const SH = { u0: Math.min(...SUV.map((p) => p[0])), u1: Math.max(...SUV.map((p) => p[0])), v0: Math.min(...SUV.map((p) => p[1])), v1: Math.max(...SUV.map((p) => p[1])) };
  const PUV = PLATFORMS.map((p) => p.map(([x, z]) => toUV(x, z)));
  const P_V0 = Math.min(...PUV.flat().map((p) => p[1])), P_V1 = Math.max(...PUV.flat().map((p) => p[1]));
  return {
    RAIL, DECK_T, DECK_B, GIRD_B, XG_B: GIRD_B - 1.05, EDGE: 2.1, PLAT_Y: RAIL + 1.22, CAN_Y: RAIL + 1.22 + 3.35,
    V_S: 2100, V_N: Math.min(...TUV.map((t) => t[t.length - 1][1])) - 1, SH, P_V0, P_V1, CAN_V0: P_V0 + 38, CAN_V1: P_V1 - 36,
    // the span over E 125th St (centreline v 3449.2, 100 ft between the building lines) from its south bent to the station
    // house: a2 put the girder's ends at compass 68.1 and 136.1 deg (girder 137 px tall at its
    // near end: the fascia ~17 m off), the south end at v ~3438.4; 3437.2 puts the girder's end with its 1.2 m overlap on a 6 m interval's end
    // its north end at
    // 3461.0 from's compass 66.8 with the face where it is; was 3465.3 against the station house, the regular fascia over the last 6 m now
    v125: [3439.3, 3459.8],
    CORNER: [1169.85, 3439.4],
  };
})();
const inHouse = (u, v, pad = 0) => u > PK.SH.u0 - pad && u < PK.SH.u1 + pad && v > PK.SH.v0 - pad && v < PK.SH.v1 + pad;
export const parkMid = (v) => { const u = (tU(0, v) + tU(3, v)) / 2; return PP(u, v, 0); };
export const parkUV = (x, z) => toUV(x, z);

let _M = null;
export function parkMats() {
  if (_M) return _M;
  _M = {
    // the 1990s repaint: a sandstone tan that reads salmon in the sun, soot-darkened underneath; the span
    // girders a cornflower blue; the median columns the same tan gone brown with rust
    steel: steelMat('park', { paint: 0xbc9877, paint2: 0xb09070, rust: 0x8a4a28, rustD: 0x4f3322, rustAmt: 0.3, rough: 0.7, metal: 0.03, chalk: 0.3 }),
    steelS: steelMat('parkS', { paint: 0xbc9877, paint2: 0xb09070, rust: 0x8a4a28, rustD: 0x4f3322, rustAmt: 0.3, rough: 0.7, metal: 0.03, chalk: 0.3, noShadow: true }),
    col: steelMat('parkCol', { paint: 0xa97c5c, paint2: 0x9c7254, rust: 0x80401f, rustD: 0x472b1d, rustAmt: 0.42, rough: 0.72, metal: 0.03 }),
    blue: steelMat('parkBlue', { paint: 0x8c94a8, paint2: 0x858da2, rust: 0x5d4a3c, rustD: 0x3d3128, rustAmt: 0.1, rough: 0.55, metal: 0.05, chalk: 0.15, spec: 0.4 }),
    art: steelMat('parkArt', { paint: 0xc9c5bc, paint2: 0xbfbbb2, rust: 0x6a5a4c, rustD: 0x4a4038, rustAmt: 0.08, rough: 0.45, metal: 0.15, rivets: false }),
    dark: steelMat('parkDark', { paint: 0x4a3b32, paint2: 0x43362e, rust: 0x5a3a26, rustD: 0x3a281c, rustAmt: 0.25, rough: 0.72, metal: 0.04 }),
    conc: otherMat('concrete'), granite: otherMat('granite'), ballast: otherMat('ballast'), timber: otherMat('timber'),
    rail: otherMat('rail'), railTop: otherMat('railTop'), yellow: otherMat('yellow'),
    // the platform canopies' roof sheeting: a soot-brown painted metal
    roof: steelMat('parkRoof', { paint: 0x4d443b, paint2: 0x463e36, rust: 0x5a3a26, rustD: 0x3a281c, rustAmt: 0.2, rough: 0.72, metal: 0.04, rivets: false }),
    lime: otherMat('lime'), brick: otherMat('brick'), glass: otherMat('glass'),
    lamp: litMat('vkParkLamp', 0xfff0d6, 0.06, 2.4),
    win: litMat('vkParkWin', 0x5b605c, 0.05, 0.8),
    cast: steelMat('parkCast', { paint: 0x2f4a3c, paint2: 0x2c4639, rust: 0x5e3e2a, rustD: 0x3e2a1c, rustAmt: 0.3, rough: 0.6, metal: 0.04, rivets: false }),
    well: otherMat('netting'),
    // the windscreens' glass: clear, a little blue, a sky sheen (no depth write, so the platform shows through)
    glassW: (() => { const m = applyLightTrim(new THREE.MeshStandardMaterial({ color: 0xb4c8d0, roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.3, depthWrite: false })); m.userData.noShadow = true; m.name = 'vk-glassW'; return m; })(),
  };
  return _M;
}

// ---------------------------------------------------------------- the viaduct between va and vb (one 6 m interval)
export function parkInterval(g, M, va, vb) {
  const st = M.steel, over125 = (va + vb) / 2 > PK.v125[0] && (va + vb) / 2 < PK.v125[1];
  const lite = Math.abs((va + vb) / 2 - 3449.2) > 300;   // away from 125th St: plain girders (seen from afar)
  const uL = (v) => tU(0, v) - PK.EDGE, uR = (v) => tU(3, v) + PK.EDGE;
  const quad = (fa, fb, y) => [PP(fa(va), va, y), PP(fb(va), va, y), PP(fb(vb), vb, y), PP(fa(vb), vb, y)];
  // the deck plate (a steel trough floor), ballast, ties, rails, third rails
  { const q = quad(uL, uR, PK.DECK_B + 0.16); g.rect(M.dark, V.lerp(q[0], q[1], 0.5), V.lerp(q[3], q[2], 0.5), UP, V.len(V.sub(q[1], q[0])), 0.32, { caps: false }); }
  const nearSt = vb > PK.P_V0 - 80 && va < PK.P_V1 + 80;
  for (let i = 0; i < 4; i++) {
    const ca = tU(i, va), cb = tU(i, vb);
    g.rect(M.ballast, PP(ca, va, PK.DECK_T + 0.14), PP(cb, vb, PK.DECK_T + 0.14), UP, 3.0, 0.28, { caps: false });
    for (const s of [-0.7175, 0.7175]) {
      g.rect(M.rail, PP(ca + s, va, PK.RAIL - 0.09), PP(cb + s, vb, PK.RAIL - 0.09), UP, 0.017, 0.12, { caps: false });
      g.rect(M.rail, PP(ca + s, va, PK.RAIL - 0.145), PP(cb + s, vb, PK.RAIL - 0.145), UP, 0.14, 0.016, { caps: false });
      g.rect(M.railTop, PP(ca + s, va, PK.RAIL - 0.022), PP(cb + s, vb, PK.RAIL - 0.022), UP, 0.072, 0.044, { caps: false });
    }
    const t3 = i < 2 ? -1.42 : 1.42;
    g.rect(M.rail, PP(ca + t3, va, PK.RAIL - 0.13), PP(cb + t3, vb, PK.RAIL - 0.13), UP, 0.09, 0.14, { caps: false });
    g.rect(M.timber, PP(ca + t3, va, PK.RAIL + 0.02), PP(cb + t3, vb, PK.RAIL + 0.02), UP, 0.3, 0.04, { caps: false });
    if (nearSt) for (let v = Math.ceil(va / 0.61) * 0.61; v < vb; v += 0.61) { const c = tU(i, v); g.rect(M.timber, PP(c - 1.3, v, PK.RAIL - 0.235), PP(c + 1.3, v, PK.RAIL - 0.235), UP, 0.23, 0.18); }
    // two riveted plate girders under each track
    for (const s of [-0.95, 0.95]) {
      const A = PP(ca + s, va, (PK.GIRD_B + PK.DECK_B) / 2), B = PP(cb + s, vb, (PK.GIRD_B + PK.DECK_B) / 2);
      if (lite) ibeam(g, M.dark, A, B, UP, PK.DECK_B - PK.GIRD_B, 0.36, 0.03, 0.014, { riv: false, caps: false });
      else plateGirder(g, M.dark, A, B, UP, PK.DECK_B - PK.GIRD_B, 0.36, { stiff: 1.5, endStiff: false, seed: 700 + i });
    }
  }
  // the fascia girders along both edges (over 125th St: the deep blue span girders, drawn by parkSpan125)
  if (!over125) {
    for (const [f, sgn] of [[uL, -1], [uR, 1]]) {
      const a = PP(f(va), va, 0), b = PP(f(vb), vb, 0), yb = PK.GIRD_B - 0.25, yt = PK.DECK_T + 0.32;
      plateGirder(g, st, [a[0], (yb + yt) / 2, a[2]], [b[0], (yb + yt) / 2, b[2]], UP, yt - yb, 0.42, { stiff: lite ? 3.0 : 1.5, endStiff: false, seed: 710 });
      // diamond lattice of flat bars), elsewhere a plain walkway railing
      const r0 = PP(f(va) - sgn * 0.12, va, 0), r1 = PP(f(vb) - sgn * 0.12, vb, 0);
      const stn = vb > PK.P_V0 - 25 && va < PK.P_V1 + 25, rm = stn ? M.cast : M.steelS;
      g.rect(rm, [r0[0], yt + 1.05, r0[2]], [r1[0], yt + 1.05, r1[2]], UP, 0.07, 0.07, { caps: false, rv: [] });
      g.rect(rm, [r0[0], stn ? yt + 0.1 : yt + 0.55, r0[2]], [r1[0], stn ? yt + 0.1 : yt + 0.55, r1[2]], UP, 0.05, 0.05, { caps: false, rv: [] });
      for (let v = Math.ceil(va / 2) * 2; v < vb; v += 2) { const p = PP(f(v) - sgn * 0.12, v, 0); g.rect(rm, [p[0], yt, p[2]], [p[0], yt + 1.08, p[2]], DVv, 0.07, 0.07, { rv: [] }); }
      if (stn) {
        const n = Math.max(1, Math.round((vb - va) / 0.48));
        for (let k = 0; k < n; k++) for (const up of [true, false]) {
          const v0 = va + ((vb - va) * k) / n, v1 = va + ((vb - va) * (k + 1)) / n;
          const p0 = PP(f(v0) - sgn * 0.12, v0, 0), p1 = PP(f(v1) - sgn * 0.12, v1, 0);
          g.rect(rm, [p0[0], up ? yt + 0.12 : yt + 1.03, p0[2]], [p1[0], up ? yt + 1.03 : yt + 0.12, p1[2]], DU, 0.03, 0.008, { rv: [] });
        }
      }
    }
  }
}
// ---------------------------------------------------------------- the span over 125th St with its artwork
// the artwork's outlines ([x, y] metres, x along the girder, y up from its bottom), drawn from scratch
const SPHINX = [[0, 0.25], [4.3, 0.25], [4.3, 0.55], [3.2, 0.62], [3.05, 0.95], [2.9, 1.25], [3.0, 1.55], [3.25, 1.7], [3.2, 2.05], [2.95, 2.3], [2.55, 2.35], [2.2, 2.1], [1.95, 1.45], [1.25, 1.2], [0.55, 1.05], [0.15, 0.7]];
const SPHINX_EYE = [[2.72, 1.9], [2.9, 1.95], [2.95, 1.86], [2.76, 1.82]];
// a standing figure in the sunburst (head, shoulders, a long robe)
const FIGURE = [[-0.35, 0.3], [0.35, 0.3], [0.28, 1.1], [0.36, 1.75], [0.3, 2.05], [0.14, 2.15], [0.17, 2.42], [0.0, 2.55], [-0.17, 2.42], [-0.14, 2.15], [-0.3, 2.05], [-0.36, 1.75], [-0.28, 1.1]];
// a perforated leaf / peacock feather: a pointed oval with a spine of dots
function leaf(cx, y0, w, h) {
  const o = [];
  for (let k = 0; k <= 16; k++) { const t = k / 16, a = Math.PI * t; o.push([cx + Math.sin(a) * w / 2 * (1 - 0.35 * t), y0 + h * (1 - Math.cos(a)) / 2 + h * 0.08 * Math.sin(a * 2)]); }
  for (let k = 15; k >= 1; k--) { const t = k / 16, a = Math.PI * t; o.push([cx - Math.sin(a) * w / 2 * (1 - 0.35 * t), y0 + h * (1 - Math.cos(a)) / 2 - h * 0.08 * Math.sin(a * 2) * 0.3]); }
  const holes = [];
  for (let r = 0; r < 7; r++) for (const dx of r % 2 ? [-0.14, 0.14] : [0]) {
    const yc = y0 + h * (0.2 + r * 0.1), xc = cx + dx, rr = 0.045;
    holes.push(Array.from({ length: 8 }, (_, k) => [xc + Math.cos((k / 8) * Math.PI * 2) * rr, yc + Math.sin((k / 8) * Math.PI * 2) * rr]));
  }
  return [o, ...holes];
}
// a fan of slats (a sunburst when wide): sx stretches it along the girder
function fanSlats(cx, cy, R, n, a0 = 0, a1 = Math.PI, sx = 1) {
  const out = [], X = (a, r) => cx + Math.cos(a) * r * sx, Y = (a, r) => cy + Math.sin(a) * r;
  for (let k = 0; k < n; k++) {
    const t0 = a0 + ((a1 - a0) * (k + 0.12)) / n, t1 = a0 + ((a1 - a0) * (k + 0.88)) / n, tm = (t0 + t1) / 2;
    out.push([[X(t0, R * 0.22), Y(t0, R * 0.22)], [X(t0, R), Y(t0, R)], [X(tm, R * 1.04), Y(tm, R * 1.04)], [X(t1, R), Y(t1, R)], [X(t1, R * 0.22), Y(t1, R * 0.22)]]);
  }
  out.push(Array.from({ length: 9 }, (_, k) => { const a = a0 + ((a1 - a0) * k) / 8; return [X(a, R * 0.2), Y(a, R * 0.2)]; }).concat([[cx, cy]]));
  return out;
}
function skyline(x0, w) {
  const hs = [1.2, 1.75, 1.4, 1.95, 1.5, 1.1], out = [], bw = w / hs.length;
  hs.forEach((h, k) => {
    const a = x0 + k * bw + 0.04, b = a + bw - 0.08;
    out.push(k === 3 ? [[a, 0.25], [b, 0.25], [b, h * 0.8], [(a + b) / 2 + 0.12, h], [(a + b) / 2 + 0.03, h + 0.35], [(a + b) / 2 - 0.03, h + 0.35], [(a + b) / 2 - 0.12, h], [a, h * 0.8]] : [[a, 0.25], [b, 0.25], [b, h], [a, h]]);
  });
  return out;
}
// the station's name lettered on the tan fascia girders just south of the span, drawn from scratch
let _name = null;
function nameMat() {
  if (_name) return _name;
  let map = null;
  if (typeof document !== 'undefined') {
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 128;
    const c = cv.getContext('2d');
    c.clearRect(0, 0, 1024, 128);
    c.fillStyle = '#f2f1ec'; c.font = 'bold 96px Helvetica, Arial, sans-serif'; c.textBaseline = 'middle';
    c.fillText('Harlem\u2013125 St', 16, 68);
    map = new THREE.CanvasTexture(cv); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  }
  _name = applyLightTrim(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0, map, alphaTest: 0.45, transparent: false }));
  _name.name = 'vk-parkName'; _name.userData.noShadow = true;
  return _name;
}
function parkName(g, M) {
  const m = nameMat(), v1 = PK.v125[0] - 1.3, v0 = v1 - 6.2, yc = (PK.GIRD_B - 0.25 + PK.DECK_T + 0.32) / 2, h = 0.78;
  for (const sgn of [-1, 1]) {
    // the lettering 0.13 m off the web (in front of the stiffeners), reading left to right from outside: north to
    // south on the west face, south to north on the east face
    const f = (v) => (sgn < 0 ? tU(0, v) - PK.EDGE - 0.13 : tU(3, v) + PK.EDGE + 0.13);
    const [vl, vr] = sgn < 0 ? [v1, v0] : [v0, v1];
    const pl = PP(f(vl), vl, 0), pr = PP(f(vr), vr, 0), n = mul(DU, sgn);
    const a = [pl[0], yc - h / 2, pl[2]], b = [pl[0], yc + h / 2, pl[2]], c = [pr[0], yc + h / 2, pr[2]], d = [pr[0], yc - h / 2, pr[2]];
    // counter-clockwise seen from outside: a (left bottom), d (right bottom), c (right top), b (left top)
    g.quad(m, a, d, c, b, n, [[0, 0], [1, 0], [1, 1], [0, 1]], [1, 0, 0, 0], [1, 7]);
  }
}
export function parkSpan125(g, M) {
  try { parkName(g, M); } catch (e) { console.warn('[vk] park name', e); }
  const [va, vb] = PK.v125, st = M.steel;
  const yb = PK.GIRD_B - 0.1, yt = PK.DECK_T + 0.55, D = yt - yb;
  for (const sgn of [-1, 1]) {
    // 6 cm outside the regular fascia line: where the two girders overlap at the span's ends their webs never coincide
    const f = (v) => (sgn < 0 ? tU(0, v) - PK.EDGE - 0.06 : tU(3, v) + PK.EDGE + 0.06);
    const a = PP(f(va - 1.2), va - 1.2, 0), b = PP(f(vb + 1.2), vb + 1.2, 0);
    plateGirder(g, M.blue, [a[0], (yb + yt) / 2, a[2]], [b[0], (yb + yt) / 2, b[2]], UP, D, 0.5, { stiff: 1.6, seed: 720 });
    girderSpikes(g, [a[0], (yb + yt) / 2, a[2]], [b[0], (yb + yt) / 2, b[2]], UP, D, 0);
    // the tan parapet over the girder, its coping
    g.rect(st, [a[0], yt + 0.55, a[2]], [b[0], yt + 0.55, b[2]], UP, 0.3, 1.1, { rv: [] });
    g.rect(st, [a[0], yt + 1.14, a[2]], [b[0], yt + 1.14, b[2]], UP, 0.45, 0.08, { rv: [] });
    // panel joints in the parapet's face every ~3 m, and a band of rivet-head flats along the girder's upper flange
    { const Lp = V.len(V.sub(b, a)), exp = V.norm(V.sub(b, a)), nO = mul(DU, sgn);
      for (let t = 1.2; t < Lp - 0.8; t += 3.05) { const p = add(add(a, mul(exp, t)), mul(nO, 0.153)); g.rect(M.dark, [p[0], yt, p[2]], [p[0], yt + 1.1, p[2]], DU, 0.02, 0.012, { rv: [] }); }
    }
    // the artwork on the outer face: sphinxes at both ends facing out, fans, a sunburst, skylines
    const L = V.len(V.sub(b, a)), ex = V.norm(V.sub(b, a)), n = mul(DU, sgn);
    const ez = sgn > 0 ? ex : mul(ex, -1);   // x runs left to right as seen from outside
    const O = add(sgn > 0 ? a : b, add(mul(n, 0.3), [0, yb, 0]));
    const W = L, S = [], mid = W / 2;
    // the east face from
    // the east, south on the left): a recumbent sphinx at each end facing out, as tall as the girder (heads at its top
    // edge); next to the left one a ribbed dome (west) or a small skyline and a standing figure (east); pairs of
    // perforated leaves; a wide sunburst with a figure in the middle; a fan rising behind the right sphinx's back; all on
    // a base strip along the bottom flange. Each piece at its own depth (the fans behind), so overlaps never fight.
    const SX = 1.32, SY = 1.08, sl = 4.3 * SX;
    const sph = (x0, flip) => { const m = ([x, y]) => [flip ? x0 + (4.3 - x) * SX : x0 + x * SX, 0.25 + (y - 0.25) * SY]; return [SPHINX.map(m), SPHINX_EYE.map(m)]; };
    const put = (shape, dz) => S.push([shape, dz]);
    put([[[0.2, 0.1], [W - 0.2, 0.1], [W - 0.2, 0.27], [0.2, 0.27]]], -0.03);
    put(sph(0.35, true), 0.0);
    put(sph(W - 0.35 - sl, false), 0.0);
    for (const q of fanSlats(mid, 0.3, 2.2, 19, 0, Math.PI, 1.55)) put([q], -0.015);
    put([FIGURE.map(([x, y]) => [mid + x * 1.1, y * 0.95])], 0.0);
    if (sgn < 0) for (const q of fanSlats(sl + 0.95, 0.3, 1.2, 9)) put([q], -0.015);
    else { for (const q of skyline(sl + 0.6, 2.2)) put([q], -0.01); put([FIGURE.map(([x, y]) => [sl + 3.4 + x * 0.8, y * 0.85])], 0.0); }
    for (const q of fanSlats(W - sl - 1.6, 0.3, 1.75, 11, Math.PI * 0.08, Math.PI * 0.92)) put([q], -0.02);
    for (const c of sgn < 0 ? [sl + 2.75, sl + 3.95, mid + 3.95, mid + 5.15] : [sl + 4.6, sl + 5.8, mid + 3.95, mid + 5.15]) put(leaf(c, 0.3, 1.1, 2.2), -0.005);
    for (const [[outline, ...holes], dz] of S) g.shape(M.art, outline, add(O, mul(n, dz)), ez, UP, 0.03, { seed: 730, holes });
    void st;
  }
}
// tags and stickers on the corner columns' lower flanges, invented letterforms on a card per face (alpha-tested), never copied
let _tags = null;
function tagMat() {
  if (_tags) return _tags;
  let map = null;
  if (typeof document !== 'undefined') {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 512;
    const c = cv.getContext('2d'); c.clearRect(0, 0, 256, 512);
    let sd = 7; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    c.lineCap = 'round'; c.lineJoin = 'round';
    // stickers: small labels, sun-faded, a corner peeled
    for (const [x, y, w, h, col] of [[22, 300, 70, 44, '#e9e4d6'], [150, 210, 54, 54, '#d7c03c'], [120, 380, 84, 30, '#3d6fb0'], [40, 120, 46, 60, '#dcdcd4']]) {
      c.fillStyle = col; c.globalAlpha = 0.85; c.fillRect(x, y, w, h);
      c.globalAlpha = 0.7; c.fillStyle = '#2a2a2a'; for (let k = 0; k < 3; k++) c.fillRect(x + 6, y + 8 + k * (h / 4), w * (0.4 + 0.5 * rnd()), 3);
      c.globalAlpha = 1; c.clearRect(x + w - 10, y, 10, 8);
    }
    // marker tags: fast connected strokes, a loop and a flourish under each, black and silver
    for (const [x0, y0, sc, col, lw] of [[18, 70, 1.0, '#151515', 5], [96, 280, 0.8, '#bfc3c6', 4], [30, 450, 1.1, '#151515', 4], [130, 120, 0.7, '#7a1f1f', 4]]) {
      c.strokeStyle = col; c.lineWidth = lw; c.globalAlpha = 0.88;
      c.beginPath(); let x = x0, y = y0; c.moveTo(x, y);
      for (let k = 0; k < 6; k++) { const dx = (14 + rnd() * 14) * sc, up = (k % 2 ? -1 : 1) * (18 + rnd() * 22) * sc; c.quadraticCurveTo(x + dx * 0.3, y - up, x + dx, y + (rnd() - 0.5) * 8 * sc); x += dx; }
      c.stroke();
      c.beginPath(); c.moveTo(x0 - 4, y0 + 22 * sc); c.bezierCurveTo(x0 + 40 * sc, y0 + 36 * sc, x - 30 * sc, y0 + 12 * sc, x + 10 * sc, y0 + 26 * sc); c.stroke();
    }
    c.globalAlpha = 1;
    map = new THREE.CanvasTexture(cv); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  }
  _tags = applyLightTrim(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0, map, alphaTest: 0.5, transparent: false }));
  _tags.name = 'vk-parkTags'; _tags.userData.noShadow = true;
  return _tags;
}
// a tag card on both flange faces of a column at (u, v) (depth cd along the street, width cw along the avenue)
function columnTags(g, u, v, gy, cd, cw) {
  const m = tagMat();
  if (!m.map && typeof document !== 'undefined') return;
  for (const sx of [-1, 1]) {
    const uf = u + sx * (cd / 2 + 0.024), w = Math.min(0.6, cw - 0.1), y0 = gy + 0.95, y1 = y0 + 1.2, n = mul(DU, sx);
    // left to right as seen from outside (the viewer's right is +v on the east face, -v on the west face)
    const vl = v - sx * w / 2, vr = v + sx * w / 2;
    const pl = PP(uf, vl, 0), pr = PP(uf, vr, 0);
    g.quad(m, [pl[0], y0, pl[2]], [pr[0], y0, pr[2]], [pr[0], y1, pr[2]], [pl[0], y1, pl[2]], n, [[0, 0], [1, 0], [1, 1], [0, 1]], [1, 0, 0, 0], [1, 9]);
  }
}
// the tags on the three columns of a bent at v (the corner bent at 125th St)
// the bents' three columns: near 125th St on the median plaza's edges and its middle; elsewhere
// the tracks' mid +- 6.5 m (not measured)
export const parkCols = (v) => { const uM = (tU(1, v) + tU(2, v)) / 2; return Math.abs(v - 3449.2) < 60 ? [uM - 10.2, uM - 1.4, uM + 7.3] : [uM - 6.5, uM, uM + 6.5]; };
export function parkBentTags(g, v, gy) {
  for (const u of parkCols(v)) columnTags(g, u, v, gy, 0.62, 0.7);
}
// ---------------------------------------------------------------- the bents (every 50 ft, none in a street)
export function parkBent(g, M, v, gy) {
  // the median columns and cross girders soot-brown under the deck, the fascia tan, the columns a
  // tan gone brown: built-up riveted H sections on a concrete plinth, a base plate with anchor bolts, straps every 0.9 m
  const st = M.dark, col = M.col, uM = (tU(1, v) + tU(2, v)) / 2, dL = tU(0, v) - PK.EDGE, dR = tU(3, v) + PK.EDGE;
  plateGirder(g, st, PP(dL + 0.3, v, (PK.XG_B + PK.GIRD_B) / 2), PP(dR - 0.3, v, (PK.XG_B + PK.GIRD_B) / 2), UP, PK.GIRD_B - PK.XG_B, 0.45, { stiff: 1.1, seed: 740 });
  for (const u of parkCols(v)) parkColumn(g, M, u, v, gy);
  // knee brackets under the fascia girders at both edges
  for (const [e, sg] of [[dL, 1], [dR, -1]]) gusset(g, M.steel, PP(e + sg * 0.4, v, PK.XG_B), PP(e + sg * 0.4, v, PK.GIRD_B - 0.2), PP(e + sg * 2.2, v, PK.GIRD_B - 0.2), PP(e + sg * 2.2, v, PK.XG_B + 0.2), 0.016, { seed: 742 });
}
// the corner column on the west sidewalk at the 125th St span's south end and its short cross girder to the west fascia
export function parkCorner(g, M, gy) {
  const [u, v] = PK.CORNER, dL = tU(0, v) - PK.EDGE;
  parkColumn(g, M, u, v, gy);
  plateGirder(g, M.dark, PP(u - 0.4, v, (PK.XG_B + PK.GIRD_B) / 2), PP(dL + 0.3, v, (PK.XG_B + PK.GIRD_B) / 2), UP, PK.GIRD_B - PK.XG_B, 0.45, { stiff: 1.1, seed: 741 });
}
// one built-up column of a bent: footing, plinth, base plate and bolts, H section with cover plates and tie straps, cap
// and the curved head brackets
function parkColumn(g, M, u, v, gy) {
  const col = M.col;
  {
    const cw = 0.7, cd = 0.62;   // depth along the street (DU), width along the avenue
    // the footing and a chamfered plinth, the base plate, anchor bolts with nuts
    g.rect(M.conc, PP(u, v, gy - 0.1), PP(u, v, gy + 0.12), DVv, 1.5, 1.5);
    frustum(g, M.conc, PP(u, v, 0), DU, 1.36, 1.36, 1.1, 1.1, gy + 0.12, gy + 0.46);
    g.rect(col, PP(u, v, gy + 0.46), PP(u, v, gy + 0.53), DU, cd + 0.3, cw + 0.3, { rv: [null, RIV.edges(0.05, 0.18), null, RIV.edges(0.05, 0.18)] });
    for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const p = PP(u + su * (cd / 2 + 0.2), v + sv * (cw / 2 + 0.2), gy + 0.53);
      g.cyl(col, p, [p[0], p[1] + 0.07, p[2]], 0.028, 6);
      g.cyl(col, [p[0], p[1] + 0.03, p[2]], [p[0], p[1] + 0.065, p[2]], 0.045, 6);
    }
    // four base angles up the column's toe
    for (const su of [-1, 1]) for (const sv of [-1, 1]) g.rect(col, PP(u + su * (cd / 2 + 0.05), v + sv * (cw / 2 - 0.0), gy + 0.53), PP(u + su * (cd / 2 + 0.05), v + sv * (cw / 2 - 0.0), gy + 0.95), DU, 0.1, 0.1, { rv: [] });
    // the column: an H section, flanges 22 mm, web 16 mm, with cover plates riveted on the flange faces
    ibeam(g, col, PP(u, v, gy + 0.53), PP(u, v, PK.XG_B), DU, cd, cw, 0.022, 0.016);
    for (const sx of [-1, 1]) g.rect(col, PP(u + sx * (cd / 2 + 0.008), v, gy + 0.55), PP(u + sx * (cd / 2 + 0.008), v, PK.XG_B - 1.2), DU, cw - 0.04, 0.012, { rv: [null, null, RIV.pair(cw * 0.3, 0.12), null] });
    // straps across the open sides of the web every 0.9 m (riveted tie plates)
    for (let y = gy + 1.2; y < PK.XG_B - 1.0; y += 0.9) for (const sv of [-1, 1]) {
      g.rect(col, PP(u - cd / 2 + 0.03, v + sv * (cw / 2 - 0.005), y), PP(u + cd / 2 - 0.03, v + sv * (cw / 2 - 0.005), y), UP, 0.012, 0.22, { rv: [null, null, null, null] });
    }
    // the cap under the cross girder
    g.rect(col, PP(u, v, PK.XG_B - 0.1), PP(u, v, PK.XG_B), DVv, 0.9, 0.9);
    // the column head's curved brackets under the cross girder, both ways along it
    for (const sx of [-1, 1]) {
      const q = [], qu = [], R = 1.0, cy = PK.XG_B - R;
      for (let j = 0; j <= 8; j++) { const a = (Math.PI / 2) * (j / 8); q.push(PP(u + sx * (0.3 + R - R * Math.cos(a)), v, cy + R * Math.sin(a) - 0.02)); qu.push(V.norm([DU[0] * -sx * Math.cos(a), Math.sin(a), DU[2] * -sx * Math.cos(a)])); }
      path(g, col, q, qu, 0.03, 0.16, { seed: 743 });
      gusset(g, col, PP(u + sx * 0.3, v, PK.XG_B - 1.0), PP(u + sx * 0.3, v, PK.XG_B - 0.02), PP(u + sx * 1.3, v, PK.XG_B - 0.02), PP(u + sx * 0.62, v, PK.XG_B - 0.45), 0.014, { seed: 744 });
    }
  }
}
// ---------------------------------------------------------------- the platforms and their canopies
export function parkPlatforms(g, M) {
  const st = M.steel, DV = 5.0;
  for (const [ia, ib] of [[0, 1], [2, 3]]) {
    for (let va = PK.P_V0; va < PK.P_V1 - 0.01; va += DV) {
      const vb = Math.min(PK.P_V1, va + DV);
      const a0 = tU(ia, va) + 1.65, a1 = tU(ia, vb) + 1.65, b0 = tU(ib, va) - 1.65, b1 = tU(ib, vb) - 1.65;
      const ca = (a0 + b0) / 2, cb = (a1 + b1) / 2;
      g.rect(M.conc, PP(ca, va, (PK.DECK_T + PK.PLAT_Y) / 2), PP(cb, vb, (PK.DECK_T + PK.PLAT_Y) / 2), UP, b0 - a0, PK.PLAT_Y - PK.DECK_T, { caps: false });
      for (const [e0, e1, s] of [[a0, a1, 1], [b0, b1, -1]]) g.rect(M.yellow, PP(e0 + s * 0.31, va, PK.PLAT_Y + 0.004), PP(e1 + s * 0.31, vb, PK.PLAT_Y + 0.004), UP, 0.61, 0.008, { caps: false });
    }
    // canopy: columns on the island's axis every 25 ft with cross beams, the roof, fascias, lamps
    for (let v = PK.CAN_V0; v <= PK.CAN_V1 + 0.01; v += 7.62) {
      const c = (tU(ia, v) + tU(ib, v)) / 2;
      // a cast-iron column: fluted shaft (12 sides), base and capital rings, the cross girder over it, and the 1897
      // canopy's curved cast brackets
      g.cyl(M.cast, PP(c, v, PK.PLAT_Y), PP(c, v, PK.CAN_Y - 0.42), 0.1, 12);
      g.cyl(M.cast, PP(c, v, PK.PLAT_Y), PP(c, v, PK.PLAT_Y + 0.42), 0.17, 12);
      g.cyl(M.cast, PP(c, v, PK.PLAT_Y + 0.42), PP(c, v, PK.PLAT_Y + 0.5), 0.13, 12);
      g.cyl(M.cast, PP(c, v, PK.CAN_Y - 0.62), PP(c, v, PK.CAN_Y - 0.42), 0.15, 12);
      plateGirder(g, M.cast, PP(c - 2.6, v, PK.CAN_Y - 0.2), PP(c + 2.6, v, PK.CAN_Y - 0.2), UP, 0.4, 0.18, { stiff: 0.8, seed: 750 });
      for (const sx of [-1, 1]) {
        const q = [], qu = [], R = 1.55, cxu = c + sx * R, cy = PK.CAN_Y - 0.4 - R;
        for (let j = 0; j <= 10; j++) { const a = (Math.PI / 2) * (j / 10); q.push(PP(cxu - sx * R * Math.cos(a), v, cy + R * Math.sin(a))); qu.push(V.norm([DU[0] * -sx * Math.cos(a), Math.sin(a), DU[2] * -sx * Math.cos(a)])); }
        path(g, M.cast, q, qu, 0.03, 0.11, { seed: 752 });
        g.cyl(M.cast, PP(c + sx * 0.62, v - 0.02, PK.CAN_Y - 0.95), PP(c + sx * 0.62, v + 0.02, PK.CAN_Y - 0.95), 0.2, 12, { caps: true });
      }
    }
    for (let va = PK.CAN_V0; va < PK.CAN_V1 - 0.01; va += DV) {
      const vb = Math.min(PK.CAN_V1, va + DV);
      const ca = (tU(ia, va) + tU(ib, va)) / 2, cb = (tU(ia, vb) + tU(ib, vb)) / 2, w = tU(ib, va) - tU(ia, va) - 2 * 1.65 + 0.7;
      // a low gable: two slopes from a ridge 0.35 m up to the eaves over the platform edges
      for (const sx of [-1, 1]) {
        const a0 = PP(ca + sx * w / 4, va, PK.CAN_Y + 0.25), a1 = PP(cb + sx * w / 4, vb, PK.CAN_Y + 0.25);
        const up = V.norm([DU[0] * sx * 0.35, w / 2, DU[2] * sx * 0.35]);
        g.rect(M.roof, a0, a1, up, w / 2 + 0.05, 0.08, { caps: false });
      }
      for (const s of [-1, 1]) g.rect(M.cast, PP(ca + s * w / 2, va, PK.CAN_Y), PP(cb + s * w / 2, vb, PK.CAN_Y), UP, 0.08, 0.3, { caps: false, rv: [] });
      g.rect(M.lamp, PP(ca, va + 0.4, PK.CAN_Y - 0.44), PP(cb, vb - 0.4, PK.CAN_Y - 0.44), UP, 0.14, 0.05, { caps: false });
    }
    // the canopy roof's corrugation and gutter (the roof is seen from the trains and from above)
    for (let v = PK.CAN_V0 + 0.15; v < PK.CAN_V1; v += 0.3) {
      const c = (tU(ia, v) + tU(ib, v)) / 2, w = tU(ib, v) - tU(ia, v) - 2 * 1.65 - 0.7;
      const w2 = w + 1.4;
      for (const sx of [-1, 1]) g.rect(M.roof, PP(c, v, PK.CAN_Y + 0.47), PP(c + sx * (w2 / 2 - 0.05), v, PK.CAN_Y + 0.1), UP, 0.05, 0.03, { caps: false });
    }
    // windscreens: glazed panels on steel frames along the island's axis in the middle bays, a bench in front of each
    // (and the stairs down to the waiting room: a railed well near the 125th St end, its own small canopy)
    const vM = (PK.P_V0 + PK.P_V1) / 2;
    for (let k = -3; k <= 2; k++) {
      const va = vM + k * 7.62 + 0.3, vb = va + 7.0, c0 = (tU(ia, va) + tU(ib, va)) / 2, c1 = (tU(ia, vb) + tU(ib, vb)) / 2;
      const y0 = PK.PLAT_Y + 0.25, y1 = PK.PLAT_Y + 2.45;
      g.rect(M.glassW, PP(c0, va, (y0 + y1) / 2), PP(c1, vb, (y0 + y1) / 2), UP, 0.012, y1 - y0, { caps: false });
      for (const y of [PK.PLAT_Y + 0.12, y1 + 0.03]) g.rect(M.steelS, PP(c0, va, y), PP(c1, vb, y), UP, 0.06, y === y1 + 0.03 ? 0.06 : 0.24, { rv: [] });
      for (let j = 0; j <= 4; j++) { const v = va + (j * 7.0) / 4, c = (tU(ia, v) + tU(ib, v)) / 2; g.rect(M.steelS, PP(c, v, PK.PLAT_Y), PP(c, v, y1 + 0.06), DU, 0.06, 0.06, { rv: [] }); }
      for (const s of [-1, 1]) {
        const vb0 = va + 1.2, vb1 = vb - 1.2, cb0 = (tU(ia, vb0) + tU(ib, vb0)) / 2 + s * 0.55, cb1 = (tU(ia, vb1) + tU(ib, vb1)) / 2 + s * 0.55;
        g.rect(M.timber, PP(cb0, vb0, PK.PLAT_Y + 0.45), PP(cb1, vb1, PK.PLAT_Y + 0.45), UP, 0.42, 0.05, { caps: true });
        for (const v of [vb0 + 0.3, vb1 - 0.3]) { const c = (tU(ia, v) + tU(ib, v)) / 2 + s * 0.55; g.rect(M.steelS, PP(c, v, PK.PLAT_Y), PP(c, v, PK.PLAT_Y + 0.42), DU, 0.36, 0.05, { rv: [] }); }
      }
    }
    { const v0 = PK.SH.v0 + 6, v1 = v0 + 7.5, c0 = (tU(ia, v0) + tU(ib, v0)) / 2, c1 = (tU(ia, v1) + tU(ib, v1)) / 2, hw = 0.9;
      g.rect(M.well, PP(c0, v0, PK.PLAT_Y + 0.004), PP(c1, v1, PK.PLAT_Y + 0.004), UP, 2 * hw, 0.008, { caps: true });   // the well
      for (const s of [-1, 1]) {
        g.rect(M.steelS, PP(c0 + s * (hw + 0.04), v0, PK.PLAT_Y + 1.05), PP(c1 + s * (hw + 0.04), v1, PK.PLAT_Y + 1.05), UP, 0.05, 0.05, { rv: [] });
        g.rect(M.steelS, PP(c0 + s * (hw + 0.04), v0, PK.PLAT_Y + 0.55), PP(c1 + s * (hw + 0.04), v1, PK.PLAT_Y + 0.55), UP, 0.035, 0.035, { rv: [] });
        for (let v = v0; v <= v1 + 0.01; v += 1.5) { const c = (tU(ia, v) + tU(ib, v)) / 2 + s * (hw + 0.04); g.rect(M.steelS, PP(c, v, PK.PLAT_Y), PP(c, v, PK.PLAT_Y + 1.08), DU, 0.05, 0.05, { rv: [] }); }
      }
    }
  }
}
// ---------------------------------------------------------------- the station house (1897, Morgan O'Brien)
// buff brick over a granite base, limestone trim, round-arched windows in every bay of the long sides, three arches at
// each end (the doors in the middle one), a limestone cornice under the deck
export function parkHouse(g, M, gy) {
  const { u0, u1, v0, v1 } = PK.SH, top = PK.DECK_B - 0.02;
  const box = (mat, a0, a1, b0, b1, y0, y1) => g.rect(mat, PP((a0 + a1) / 2, b0, (y0 + y1) / 2), PP((a0 + a1) / 2, b1, (y0 + y1) / 2), UP, a1 - a0, y1 - y0);
  box(M.granite, u0 - 0.1, u1 + 0.1, v0 - 0.1, v1 + 0.1, gy - 0.1, gy + 0.95);
  box(M.brick, u0, u1, v0, v1, gy + 0.95, top - 0.75);
  box(M.lime, u0 - 0.14, u1 + 0.14, v0 - 0.14, v1 + 0.14, gy + 4.0, gy + 4.25);
  box(M.lime, u0 - 0.3, u1 + 0.3, v0 - 0.3, v1 + 0.3, top - 0.75, top - 0.35);
  box(M.brick, u0 - 0.1, u1 + 0.1, v0 - 0.1, v1 + 0.1, top - 0.35, top);
  // arched windows: a limestone surround (a plate cut to the arch), dark glass behind, the sash's mullion and transom
  const archO = (w, h, r) => { const o = [[-w / 2, 0], [w / 2, 0], [w / 2, h]]; for (let k = 1; k < 12; k++) { const a = (Math.PI * k) / 12; o.push([Math.cos(a) * w / 2, h + Math.sin(a) * r]); } o.push([-w / 2, h]); return o; };
  const win = (O, ex, n, w, y0, ySp, door) => {
    g.shape(M.lime, archO(w + 0.5, ySp - y0 + 0.15, (w + 0.5) / 2).map(([x, y]) => [x, y - 0.15]), add(O, add(mul(n, 0.03), [0, y0, 0])), ex, UP, 0.06);
    g.shape(door ? M.timber : M.win, archO(w, ySp - y0, w / 2), add(O, add(mul(n, 0.07), [0, y0, 0])), ex, UP, 0.02);
    g.rect(M.steelS, add(O, add(mul(n, 0.085), [0, y0, 0])), add(O, add(mul(n, 0.085), [0, ySp + w / 2 - 0.05, 0])), n, 0.06, 0.05, { rv: [] });
    g.rect(M.steelS, add(add(O, mul(ex, -w / 2)), add(mul(n, 0.085), [0, ySp, 0])), add(add(O, mul(ex, w / 2)), add(mul(n, 0.085), [0, ySp, 0])), UP, 0.05, 0.05, { rv: [] });
  };
  const nb = 12, bay = (v1 - v0) / nb;
  for (const [u, sgn] of [[u0, -1], [u1, 1]]) {
    const n = mul(DU, sgn), ex = mul(DVv, -sgn);
    for (let k = 0; k < nb; k++) win(PP(u, v0 + (k + 0.5) * bay, 0), ex, n, 2.4, gy + 1.3, gy + 4.0, false);
  }
  for (const [v, sgn] of [[v0, -1], [v1, 1]]) {
    const n = mul(DVv, sgn), ex = mul(DU, sgn), w3 = (u1 - u0) / 3;
    for (let k = 0; k < 3; k++) win(PP(u0 + (k + 0.5) * w3, v, 0), ex, n, 3.6, gy + (k === 1 ? 0.02 : 1.3), gy + 3.3, k === 1);
  }
}
void THREE; void RIV; void laced; void angle;
