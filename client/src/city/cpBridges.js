// CPB33: the park's bridges and arches rebuilt stone by stone and casting by casting (owner 2026-09-30 22:15: "stones,
// parts of bridges, and the castle area look really low poly ... nothing looks flat low poly"). city/cpLandmarks.js calls
// these instead of its CP32 builders, which stay as each structure's far level (THREE.LOD on the structure's centre):
//   * Gapstow Bridge (Howard & Caudwell, 1896): rough-faced Manhattan schist laid in courses of 0.22-0.46 m stones with
//     recessed joints, the two-centred (pointed) arch of rock-faced voussoirs, the barrel laid in courses, the parapets'
//     coping slabs, the piers; the walls of the approaches the same;
//   * Bow Bridge (Vaux and Mould, 1859-62, cast iron): the railings' interlocking rings with their cinquefoil rosettes as
//     castings (instanced), the moulded rails, cornice and fascia with its panels, the arch ribs and the spandrels'
//     scrollwork as round bars, the eight planting urns, the deck's boards, the granite abutments in courses;
//   * Oak Bridge, Balcony Bridge and the stone arches: their masonry and timber the same way.
// Every level, outline and walkable deck is the CP32 part's (cpLandmarksKit.js: BOW, GAP, OAK, BALC and their deck
// functions), so the walkers' prisms and promenades are unchanged. `?cpb33=0` restores the CP32 builders alone.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GAP, gapDeckY, gapWalkY, buildGapstow, BOW, bowDeckY, buildBowBridge, COL, OAK, oakFrame, oakDeckY, buildOakBridge, BALC, buildBalcony, buildArch, LBin, lmMats, K, TPL } from './cpLandmarksKit.js';
import { MB, stone, wall, backing, rbox, sweep, upPath, steps, lathe, seed, rnd, lin, mul, mix3, fbm, bxMats, bxSoffit, nearFar, trisOf, PLANK_MEAN, sstep } from './cpBridgesKit.js';

export const CPB33 = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('cpb33') === '0');
const NEAR = { gapstow: 150, bow: 190, oak: 130, balcony: 130, arch: 120 };   // m to the structure's centre (Bow: the long lens)

// ---- shared tones and weathering -------------------------------------------------------------------------------------
// Manhattan schist as the bridge stands (Commons photographs, look only): warm grey-brown, some stones rust-stained, some
// blue-grey, the rock-faced voussoirs paler; the mortar a light lime grey, recessed. Linear, for applyLightTrim's 0.3.
const SCH = [0xa0968a, 0x928a7c, 0xaba090, 0x9a8f7c, 0xb0a898, 0x8d877a, 0xa49380, 0x9a948a, 0xb09c7e, 0x98846c, 0x8e8f8e, 0xbab2a2, 0xa89a86].map((h) => mul(lin(h), 1.22));
const VOU = [0xb8afa0, 0xafa698, 0xc0b7a8, 0xa9a092, 0xc4b498, 0xb4aa9c].map((h) => mul(lin(h), 1.2));
const MORTAR = mul(lin(0xa39d90), 1.05), SOFF = [lin(0x7d766a), lin(0x726c62), lin(0x857d70), lin(0x7c776c), lin(0x6c6a66)].map((c) => mul(c, 1.25));
// damp and algae near the waterline, a darker band where the water stands
const wetter = (W, k = 1) => (c, q) => {
  const y = q[1], t = 1 - sstep(W + 0.05, W + 0.9 * k, y);
  if (t <= 0) return c;
  const g = mix3(c, [c[0] * 0.55, c[1] * 0.62, c[2] * 0.5], t);
  return y < W + 0.12 ? mul(g, 0.8) : g;
};

// the whole of it on the vertex colours: the damp band at the waterline (wetter), pale grey-green and orange lichen in patches on
// the stone's face (not in its joints; thicker on the upper courses), dark rain streaks running down from the ledges and the
// coping, rust-brown stains under iron (o.rust); the scan's own detail rides on top in the shader
const weather = (W, k = 1, o = {}) => {
  const wet = wetter(W, k), lich = o.lichen ?? 1, streak = o.streak ?? 1, rust = o.rust ?? 0;
  return (c, q, z, p) => {
    let g = wet(c, q);
    const u = q[0], y = q[1], w = q[2], face = sstep(0.55, 0.95, p), hi = sstep(W + 0.8, W + 3.5, y);
    if (lich > 0) {
      const lm = sstep(0.6, 0.74, fbm(u * 2.1 + w * 1.7 + 17.0, y * 2.1 + 5.0)) * face * lich * (0.45 + 0.55 * hi);
      if (lm > 0.001) g = mix3(g, mix3([0.3, 0.33, 0.22], [0.46, 0.36, 0.16], sstep(0.45, 0.6, fbm(u * 4.7 + 3.0, y * 4.7 + w * 3.1))), 0.5 * lm);
    }
    if (streak > 0) {
      const sm = sstep(0.55, 0.82, fbm(u * 5.5 + w * 4.1, y * 0.28 + 9.0)) * streak * (0.35 + 0.65 * hi);
      g = mul(g, 1 - 0.3 * sm);
    }
    if (lich > 0) {                                                   // lime run-off: pale streaks down the wall from the joints under the coping
      const lime = sstep(0.68, 0.84, fbm(u * 8.0 + w * 6.0 + 21.0, y * 0.3 + 2.0)) * sstep(W + 3.4, W + 5.3, y) * face * 0.5 * lich;
      if (lime > 0.001) g = mix3(g, [g[0] * 1.45 + 0.02, g[1] * 1.42 + 0.02, g[2] * 1.36 + 0.015], lime);
    }
    if (rust > 0) g = mix3(g, [g[0] * 1.5, g[1] * 0.9, g[2] * 0.55], rust * sstep(0.62, 0.8, fbm(u * 3.3 + 40.0, y * 0.5 + w * 3.0)));
    return g;
  };
};

// ---- Gapstow Bridge ---------------------------------------------------------------------------------------------------
// The CP32 frame and levels (GAP: centre, axis, half length 11.6, span 6.7, half width 3.03, ramps 14 m). The arch keeps its
// springing (0.4 m over the Pond) and its crown (3.66 m) and is drawn two-centred: each half an arc centred 1.2 m past the
// middle, so the crown comes to the shallow point the bridge has.
export function gapArch(W) {
  const SP = GAP.SPAN, yS = W + 0.4, yC = W + 3.66, a = 1.2, r = yC - yS;
  const yc = (yC + yS - ((SP + a) ** 2 - a * a) / r) / 2, R = Math.sqrt(a * a + (yC - yc) ** 2);
  const ph0 = Math.atan2(yS - yc, -SP - a), ph1 = Math.atan2(yC - yc, -a), Lh = R * (ph0 - ph1), LA = 2 * Lh;
  // the intrados at arc length s from the west springing: [u, y, ru, ry] (ru, ry: the outward radial)
  const at = (s) => { const left = s <= Lh, ss = left ? s : LA - s, ph = ph0 - ss / R, cu = Math.cos(ph), sy = Math.sin(ph); return left ? [a + R * cu, yc + R * sy, cu, sy] : [-(a + R * cu), yc + R * sy, -cu, sy]; };
  const yi = (u) => (Math.abs(u) > SP ? null : yc + Math.sqrt(Math.max(0, R * R - (Math.abs(u) + a) ** 2)));
  return { SP, yS, yC, a, yc, R, Lh, LA, at, yi };
}
function gapstowNear(W, gW, gE) {
  const G = GAP, [cx, cz] = G.C, [ax, az] = G.A, f = { x0: cx, y0: 0, z0: cz, ax, az };
  const SC = new MB(f), VS = new MB(f), MO = new MB(f), CO = new MB(f), PV = new MB(f), SO = new MB(f);
  seed(1896);
  const W2 = G.W2, E = G.HALF + G.RAMP, yd = (u) => gapDeckY(u, W), yw = (u) => gapWalkY(u, W, gW, gE);
  const A = gapArch(W), RD = 0.8;
  // the extrados (the voussoirs' backs) as y over u, from a dense table of the ring
  const ext = []; for (let k = 0; k <= 240; k++) { const [u, y, ru, ry] = A.at(A.LA * k / 240); ext.push([u + RD * ru, y + RD * ry]); }
  const uE = -ext[0][0], yE0 = ext[0][1];
  const NT = 600, tab = new Float32Array(NT + 1);                                // y of the extrados on a uniform u grid
  for (let i = 0, k = 0; i <= NT; i++) {
    const u = -uE + 2 * uE * i / NT;
    while (k + 2 < ext.length && ext[k + 1][0] < u) k++;
    const [u0, y0] = ext[k], [u1, y1] = ext[k + 1];
    tab[i] = u1 !== u0 ? y0 + (y1 - y0) * Math.min(1, Math.max(0, (u - u0) / (u1 - u0))) : y0;
  }
  const extY = (u) => { if (Math.abs(u) >= uE) return null; const x = (u + uE) / (2 * uE) * NT, i = Math.min(NT - 1, Math.floor(x)), t = x - i; return tab[i] * (1 - t) + tab[i + 1] * t; };
  const gF = Math.min(gW, gE) - 0.6, bot = W - 0.7;
  const parH = (u) => { const a = Math.abs(u); return a <= G.HALF ? 0.95 : Math.max(0.2, 0.95 * (1 - (a - G.HALF) / G.RAMP * 0.6)); };
  const walk = (u) => (Math.abs(u) <= G.HALF ? yd(u) : yw(u));
  const top = (u) => walk(u) + parH(u);
  // CP34: the masonry to the end piers' outer faces (EB), the parapets into the piers (PU); CP33 ran both to the ramps' feet
  const EB = CPB34 ? GAP_EB : E, PU = CPB34 ? GAP_PU : E;
  const wet = weather(W);
  const rough = { joint: 0.03, depth: 0.04, rough: 0.024, dome: 0.01, rim: 0.03, tilt: 0.04, freq: 5.0, weather: wet, toneVar: 0.36, step: 0.085, facets: 4, crag: 0.03, wobble: 0.012, lvl: 0.14, gap: 0.05 };
  for (const sd of [-1, 1]) {
    const face = (s, t, z) => [s, t, sd * (W2 + z)];
    // the face above the ring and over the abutments (CP33: and the approaches)
    const low = (u) => { const e = extY(u); if (e !== null) return e; return Math.abs(u) <= (CPB34 ? EB : G.HALF) ? bot : gF; };
    // the spandrel wall up to the deck line, and the parapet above it laid on its own bed joint (the line of the deck follows the walk)
    wall(SC, face, -EB, EB, low, walk, { ...rough, cols: SCH, hmin: 0.2, hmax: 0.5, lmin: 0.26, lmax: 1.1, stack: 0.4 });
    wall(SC, face, -PU, PU, walk, top, { ...rough, cols: SCH, hmin: 0.2, hmax: 0.34, lmin: 0.3, lmax: 1.0 });
    if (CPB34) { backing(MO, face, -EB, EB, low, walk, MORTAR, 120); backing(MO, face, -PU, PU, walk, top, MORTAR, 120); } else backing(MO, face, -E, E, low, top, MORTAR, 120);
    // the haunches under the springing stones (between the springing joint and the water)
    for (const sg of [-1, 1]) {
      const a0 = Math.min(sg * A.SP, sg * uE), a1 = Math.max(sg * A.SP, sg * uE);
      const hi = (u) => A.yS + (Math.abs(u) - A.SP) / (uE - A.SP) * (yE0 - A.yS);
      wall(SC, face, a0, a1, () => bot, hi, { ...rough, cols: SCH, hmin: 0.22, hmax: 0.4, lmin: 0.2, lmax: 0.5 });
      backing(MO, face, a0, a1, () => bot, hi, MORTAR, 4);
    }
    // the voussoirs: rock-faced, paler, 9 cm proud of the mortar (5 cm past the walling), a keystone at the point
    const ring = (s, t, z) => { const [u, y, ru, ry] = A.at(s); return [u + ru * t, y + ry * t, sd * (W2 + z)]; };
    const nH = Math.round(A.Lh / 0.62), kw = 0.36, sv = (A.Lh - kw) / nH;
    const vo = { ...rough, depth: 0.085, rough: 0.018, dome: 0.008, rim: 0.016, tilt: 0.012, joint: 0.022, weather: wet, draft: 0.036, step: 0.06, facets: 4, crag: 0.04, wobble: 0.006, toneVar: 0.22, lvl: 0 };
    for (let k = 0; k < nH; k++) for (const half of [0, 1]) {
      const s0 = half ? A.LA - (k + 1) * sv : k * sv, s1 = half ? A.LA - k * sv : (k + 1) * sv;
      stone(VS, ring, s0 + 0.011, s1 - 0.011, 0.012, RD - 0.012, { ...vo, col: VOU[Math.floor(rnd() * VOU.length)] });
    }
    stone(VS, ring, A.Lh - kw + 0.011, A.Lh + kw - 0.011, 0.012, RD + 0.06, { ...vo, depth: 0.11, crag: 0.05, col: VOU[2] });
    backing(MO, ring, 0, A.LA, () => 0, () => RD, MORTAR, 60);
    // the parapet's inner face and the coping slabs
    const inner = (s, t, z) => [s, t, sd * (W2 - 0.5 - z)];
    wall(SC, inner, -PU, PU, walk, top, { ...rough, depth: 0.035, rough: 0.018, cols: SCH, hmin: 0.18, hmax: 0.34, lmin: 0.3, lmax: 0.8, tStart: walk(0) - 0.05 });
    backing(MO, inner, -PU, PU, walk, top, MORTAR, 120);
    const cap = (s, t, z) => [s, top(s) + z, sd * (W2 - 0.5 + t)];
    backing(MO, cap, -PU, PU, () => 0, () => 0.5, MORTAR, 120, -0.005);
    for (let u = -PU + 0.02; u < PU - 0.1;) {
      const len = 0.75 + rnd() * 0.5, u1 = Math.min(PU - 0.02, u + len), um = (u + u1) / 2;
      if (Math.abs(Math.abs(um) - G.HALF) < 0.55 + len / 2) { u = u1 + 0.012; continue; }   // the piers take it there
      const sl = (top(u1) - top(u)) / Math.max(0.05, u1 - u);
      rbox(CO, um, top(um) + 0.085, sd * (W2 - 0.25), (u1 - u) / 2 - 0.006, 0.085, 0.31, 0.028, mul(VOU[Math.floor(rnd() * 4)], 0.95), {
        pitch: Math.atan(sl), rough: 0.012, step: 0.25, ao0: 0.72,
        colAt: (c, X, k) => { const up = X[1] > 0.05 ? fbm(X[0] * 4 + um, X[2] * 4) : 0; const m = sstep(0.55, 0.75, up); return mix3(mul(c, k), [c[0] * 0.55, c[1] * 0.68, c[2] * 0.42], m * 0.6); },
      });
      u = u1 + 0.012;
    }
    // CP34: the end piers, 1.0 x 0.8 m from the footing up past the coping, a little proud of the walls: the same rough-faced
    // stones as the walls laid in courses on each face that shows (over a mortar core), a flat top stone and the big rounded
    // boulder sitting on it (gap_b, gap_sunlit); under the banks only the core
    if (CPB34) for (const pu of [-PU, PU]) {
      const sg = Math.sign(pu), y1 = top(pu) + 0.18, wc = sd * (W2 - 0.22), hu = 0.5, hw = 0.4, f0 = hu - 0.03, g0 = hw - 0.03;
      const yb = walk(pu) - 1.7, w0 = Math.min(wc - hw, wc + hw), w1 = Math.max(wc - hw, wc + hw);
      rbox(MO, pu, (bot + y1) / 2, wc, f0, (y1 - bot) / 2, g0, 0.02, MORTAR, { step: 0.5, ao0: 0.7 });
      const po = { ...rough, cols: SCH, hmin: 0.24, hmax: 0.4, lmin: 0.28, lmax: 0.62, stack: 0, lvl: 0.1 };
      wall(SC, (s, t, z) => [s, t, wc + sd * (g0 + z)], pu - hu, pu + hu, () => yb, () => y1 - 0.09, po);                       // the outer face
      wall(SC, (s, t, z) => [pu + sg * (f0 + z), t, s], w0, w1, () => yb, () => y1 - 0.09, po);                                // the end
      wall(SC, (s, t, z) => [s, t, wc - sd * (g0 + z)], pu - hu, pu + hu, (u) => walk(u) - 0.06, () => y1 - 0.09, po);        // over the path
      wall(SC, (s, t, z) => [pu - sg * (f0 + z), t, s], w0, w1, () => top(pu) + 0.02, () => y1 - 0.09, po);                  // over the coping
      rbox(SC, pu, y1 - 0.045, wc, hu - 0.01, 0.05, hw - 0.01, 0.03, SCH[Math.floor(rnd() * SCH.length)], { rough: 0.02, step: 0.18, ao0: 0.62 });
      boulder(SC, pu + (rnd() - 0.5) * 0.06, y1 - 0.03, wc + (rnd() - 0.5) * 0.04, 0.54, 0.5, 0.47, VOU[Math.floor(rnd() * VOU.length)], wet);
    }
    // the piers: at the bridge's ends (in the parapet) and at the approaches' feet, of rock-faced blocks and a cap
    else for (const pu of [-G.HALF, G.HALF, -E + 0.4, E - 0.4]) {
      const y0 = Math.abs(pu) > G.HALF ? walk(pu) - 0.3 : walk(pu) - 0.15, y1 = top(pu) + (Math.abs(pu) > G.HALF ? 0.45 : 0.32);
      const n = Math.max(2, Math.round((y1 - y0) / 0.42)), hh = (y1 - y0) / n;
      for (let k = 0; k < n; k++) rbox(SC, pu, y0 + hh * (k + 0.5), sd * (W2 - 0.24), 0.5 - (k % 2) * 0.03, hh / 2 - 0.008, 0.38, 0.03, SCH[Math.floor(rnd() * SCH.length)], { rough: 0.025, step: 0.22, ao0: 0.62 });
      rbox(CO, pu, y1 + 0.08, sd * (W2 - 0.24), 0.58, 0.08, 0.46, 0.03, VOU[1], { rough: 0.01, step: 0.25, ao0: 0.75 });
    }
  }
  // the barrel: courses along the arch, the stones across it; the abutments' faces under the springing
  const soff = (s, t, z) => { const [u, y, ru, ry] = A.at(t); return [u - ru * z, y - ry * z, s]; };
  wall(SO, soff, -W2 + 0.02, W2 - 0.02, () => 0, () => A.LA, { ...rough, depth: 0.045, rough: 0.022, cols: SOFF, hmin: 0.22, hmax: 0.5, lmin: 0.45, lmax: 1.6, step: 0.1, facets: 3, crag: 0.03, lvl: 0.12, weather: weather(W, 1.4, { lichen: 0.25, streak: 0 }) });
  backing(MO, soff, -W2 - 0.03, W2 + 0.03, () => 0, () => A.LA, mul(MORTAR, 0.7), 8, 0, 48);
  for (const sg of [-1, 1]) {
    const ab = (s, t, z) => [sg * (A.SP - z), t, s];
    wall(SO, ab, -W2 + 0.02, W2 - 0.02, () => bot, () => A.yS, { ...rough, cols: SOFF, hmin: 0.26, hmax: 0.4, lmin: 0.45, lmax: 1.0, weather: wet });
    backing(MO, ab, -W2 - 0.03, W2 + 0.03, () => bot, () => A.yS, mul(MORTAR, 0.7), 6);
    // the approaches' end faces (CP34: the abutments' backs, under the graded banks)
    const en = (s, t, z) => [sg * (EB + z), t, s];
    if (CPB34) {
      wall(SC, en, -W2, W2, () => bot, () => walk(sg * EB) - 0.12, { ...rough, cols: SCH, hmin: 0.22, hmax: 0.4, lmin: 0.3, lmax: 0.8, res: 0.6 });
      backing(MO, en, -W2, W2, () => bot, () => walk(sg * EB) - 0.12, MORTAR, 6);
      continue;
    }
    wall(SC, en, -W2, W2, () => gF, (w) => walk(sg * E) + (Math.abs(w) > W2 - 0.5 ? parH(sg * E) : 0), { ...rough, cols: SCH, hmin: 0.22, hmax: 0.4, lmin: 0.3, lmax: 0.8 });
    backing(MO, en, -W2, W2, () => gF, () => walk(sg * E), MORTAR, 6);
  }
  // the path over it: asphalt between the parapets, crowned 2 cm, worn and patched
  const asph = lin(0x5d5a55), us = steps(-E, E, Math.ceil(2 * E / 0.5)), hw = W2 - 0.5;
  PV.grid(us.length - 1, 6, (i, j) => {
    const u = us[i], w = -hw + 2 * hw * j / 6, n = fbm(u * 0.9, w * 0.9);
    return { p: [u, walk(u) + 0.02 * (1 - (w / hw) ** 2) + 0.004 * (n - 0.5), w], c: mul(asph, 0.86 + 0.28 * n) };
  });
  // CP34: off the bridge the path lies on the graded bank: its edges turned down into the turf
  if (CPB34) for (const sg of [-1, 1]) for (const sd of [-1, 1]) {
    const ua = steps(sg * (EB - 0.3), sg * E, 60);
    PV.grid(ua.length - 1, 1, (i, j) => { const u = ua[i]; return { p: [u, walk(u) - (j ? 0.09 : 0.0), sd * (hw + j * 0.05)], c: mul(asph, j ? 0.6 : 0.8) }; });
  }
  const M = bxMats(), grp = new THREE.Group();
  grp.name = 'cpb33:gapstow:near';
  for (const [b, m, nm, cast] of [[SC, M.schist, 'walls', true], [VS, M.dressed, 'voussoirs', true], [SO, bxSoffit(W), 'barrel', true], [MO, M.mortar, 'mortar', false], [CO, M.dressed, 'coping', true], [PV, M.path, 'path', false]]) {
    const mesh = b.mesh(m, 'cpb33:gapstow:' + nm, cast); if (mesh) grp.add(mesh);
  }
  return grp;
}
// CP34 (the owner on teaser 4: "ends of bridges had weird walls that shouldn't exist", Gapstow's right end "the unnecessary
// weird wall protruding sideways from the bridge"): the bridge is its 76 ft and no more. Its walls and parapets stop at the
// end piers, each a stack of rough blocks carrying a rounded boulder of the rock (the photographs from the Pond, gap_b and
// gap_sunlit in refs/cp33/gapstow); the walled approaches (GAP.RAMP), the piers at their feet and the far level's wing walls
// off the ends are gone, and the paths reach the bridge on the park's own ground, graded to it (gapGrade). The walkers'
// levels are unchanged (gapWalkY).
const GAP_PU = GAP.HALF - 0.1, GAP_EB = GAP.HALF + 0.4;   // the end piers' centres; the masonry's ends (the piers' outer faces)
// a rounded boulder of the rock: a sphere cut by a few broad cleft planes (a soft minimum), pitched by two octaves of noise,
// its bed flattened onto the pier; (u, y, w) the middle of its bed, half sizes ru, ry, rw. The planes round the sides (low
// elevations) and one over the crown takes its top off a little, so it reads as a weathered boulder, not a dome with a point
function boulder(B, u, y, w, ru, ry, rw, col, wx) {
  const sd = rnd() * 911, P = [], tone = 0.9 + rnd() * 0.2, th0 = rnd() * Math.PI * 2;
  for (let k = 0; k < 5; k++) { const th = th0 + (k + rnd() * 0.6) * Math.PI * 2 / 5, ph = rnd() * 0.7 - 0.25; P.push([Math.cos(th) * Math.cos(ph), Math.sin(ph), Math.sin(th) * Math.cos(ph), 0.8 + rnd() * 0.12]); }
  { const th = rnd() * Math.PI * 2, ph = 1.25 + rnd() * 0.25; P.push([Math.cos(th) * Math.cos(ph), Math.sin(ph), Math.sin(th) * Math.cos(ph), 0.84 + rnd() * 0.06]); }
  const NI = 30, NJ = 18, bed = -0.55;
  B.grid(NI, NJ, (i, j) => {
    const th = (i % NI) / NI * Math.PI * 2, ph = -Math.PI / 2 + j / NJ * Math.PI;
    const dx = Math.cos(ph) * Math.cos(th), dy = Math.sin(ph), dz = Math.cos(ph) * Math.sin(th);
    const n1 = fbm(dx * 1.9 + sd, dy * 1.9 + dz * 1.3 + 3.1), n2 = fbm(dx * 6.3 + dz * 4.1 + sd, dy * 6.3 - 1.7);
    let ex = Math.exp(-16 * (1 + 0.12 * (n1 - 0.5) + 0.035 * (n2 - 0.5)));
    for (const [nx, ny, nz, o] of P) { const c = dx * nx + dy * ny + dz * nz; if (c > 0.05) ex += Math.exp(-16 * (o / c + 0.02 * (n2 - 0.5))); }
    const r = -Math.log(ex) / 16;
    let py = dy * r;
    if (py < bed) py = bed + (py - bed) * 0.06;
    const q = [u + dx * r * ru, y + (py - bed) * ry, w + dz * r * rw];
    const k = tone * (0.84 + 0.3 * n1) * (0.62 + 0.38 * sstep(bed, bed + 0.35, py)) * (0.8 + 0.2 * sstep(0.8, 0.97, r));
    let c = mul(col, k);
    if (wx) c = wx(c, q, 0.05, 1);
    return { p: q, c };
  });
}
// the far level: the CP32 masses (cpLandmarksKit.js buildGapstow) to the end piers only, the piers with their boulders, the
// approaches' paths on the graded banks; no walled ramps, no wing walls
function gapstowFar(group, W, gW, gE) {
  const M = lmMats(), G = GAP, [cx, cz] = G.C, [ax, az] = G.A;
  const mk = () => new LBin().frame(cx, 0, cz, ax, az);
  const SC = mk(), CP = mk(), PV = mk(), DK = mk();
  const cS = K(0x8c8374), cSD = K(0x797164), cSL = K(0x9e9586), cCop = K(0xaca69b), cPav = K(0x6f6b64), cBar = K(0x5d574e), cVL = K(0xa89f90);
  const yS = W + 0.4, yC = W + 3.66, r = yC - yS, R = (G.SPAN * G.SPAN + r * r) / (2 * r), yc = yC - R;
  const yi = (u) => yc + Math.sqrt(Math.max(0, R * R - u * u)), ring = 0.8;
  const yw = (u) => gapWalkY(u, W, gW, gE), W2 = G.W2, PU = GAP_PU, EB = GAP_EB;
  const h = (a, b) => { const s = Math.sin(a * 12.99 + b * 78.23) * 43758.55; return s - Math.floor(s); };
  const nV = 23, th0 = Math.atan2(yS - yc, -G.SPAN), th1 = Math.atan2(yS - yc, G.SPAN);
  for (let k = 0; k < nV; k++) {
    const ta = th0 + (th1 - th0) * k / nV, tb = th0 + (th1 - th0) * (k + 1) / nV;
    const pa = [Math.cos(ta) * R, yc + Math.sin(ta) * R], pb = [Math.cos(tb) * R, yc + Math.sin(tb) * R];
    const qa = [Math.cos(ta) * (R + ring), yc + Math.sin(ta) * (R + ring)], qb = [Math.cos(tb) * (R + ring), yc + Math.sin(tb) * (R + ring)];
    DK.quad([pa[0], pa[1], -W2 + 0.05], [pb[0], pb[1], -W2 + 0.05], [pb[0], pb[1], W2 - 0.05], [pa[0], pa[1], W2 - 0.05], k % 2 ? cSD : cBar);
    const col = h(k, 1) < 0.33 ? cVL : h(k, 1) < 0.66 ? cSL : cS;
    for (const s of [-1, 1]) {
      const w = s * (W2 + 0.06);
      SC.quad([pa[0], pa[1], w], [pb[0], pb[1], w], [qb[0], qb[1], w], [qa[0], qa[1], w], col);
      SC.quad([pa[0], pa[1], s * (W2 - 0.05)], [pb[0], pb[1], s * (W2 - 0.05)], [pb[0], pb[1], w], [pa[0], pa[1], w], cSD);
    }
  }
  const uW = steps(-EB, EB, 48), uP = steps(-PU, PU, 46);
  const low = (u) => (Math.abs(u) < G.SPAN ? Math.min(yw(u) - 0.1, yi(u) + ring * 0.95) : W - 1.0);
  for (const s of [-1, 1]) {
    const w = s * W2;
    for (let i = 0; i + 1 < uW.length; i++) {
      const ua = uW[i], ub = uW[i + 1], am = Math.abs((ua + ub) / 2), y0a = low(ua), y0b = low(ub), y1a = yw(ua), y1b = yw(ub);
      const nC = Math.max(1, Math.round(((y1a + y1b) - (y0a + y0b)) / 2 / 0.42));
      for (let c = 0; c < nC; c++) {
        const ta = c / nC, tb = (c + 1) / nC, st = Math.floor((i + (c % 2)) / 2), hv = h(st * 3.1 + c * 17.3, s * 5.7 + 2.0);
        const colS = am < G.SPAN ? (hv < 0.3 ? cSD : hv < 0.72 ? cS : cSL) : (hv < 0.5 ? cSD : cS);
        SC.quad([ua, y0a + (y1a - y0a) * ta, w], [ub, y0b + (y1b - y0b) * ta, w], [ub, y0b + (y1b - y0b) * tb, w], [ua, y0a + (y1a - y0a) * tb, w], colS);
      }
    }
    for (let i = 0; i + 1 < uP.length; i++) {
      const ua = uP[i], ub = uP[i + 1], ya = yw(ua), yb = yw(ub), wi = s * (W2 - 0.5);
      SC.quad([ua, ya, wi], [ub, yb, wi], [ub, yb + 0.95, wi], [ua, ya + 0.95, wi], cS);
      for (let c = 0; c < 2; c++) {
        const hv = h(Math.floor((i + c) / 2) * 3.1 + c * 29.1 + 7.0, s * 5.7 + 9.0), colP = hv < 0.3 ? cSD : hv < 0.72 ? cS : cSL;
        SC.quad([ua, ya + 0.475 * c, w + s * 0.04], [ub, yb + 0.475 * c, w + s * 0.04], [ub, yb + 0.475 * (c + 1), w + s * 0.04], [ua, ya + 0.475 * (c + 1), w + s * 0.04], colP);
      }
      CP.quad([ua, ya + 0.95, wi - s * 0.04], [ub, yb + 0.95, wi - s * 0.04], [ub, yb + 1.05, w + s * 0.08], [ua, ya + 1.05, w + s * 0.08], cCop);
    }
    // the end piers from the bank up past the coping and the boulder on them
    for (const u of [-PU, PU]) {
      const yt = yw(u) + 1.1;
      SC.box(1.0, yt - (W - 1.0), 0.78, cSL, u, W - 1.0, w - s * 0.24);
      SC.geo(TPL.sphere(10), new THREE.Matrix4().compose(new THREE.Vector3(u, yt + 0.36, w - s * 0.24), new THREE.Quaternion(), new THREE.Vector3(0.5, 0.42, 0.45)), cSL);
    }
  }
  // the ends of the masonry (under the banks), the deck and the approaches' paths
  for (const sg of [-1, 1]) { const u = sg * EB; SC.quad([u, W - 1.0, -W2], [u, W - 1.0, W2], [u, yw(u) - 0.12, W2], [u, yw(u) - 0.12, -W2], cSD); }
  const uA = steps(-(G.HALF + G.RAMP), G.HALF + G.RAMP, 70);
  for (let i = 0; i + 1 < uA.length; i++) { const ua = uA[i], ub = uA[i + 1], ya = yw(ua) + (Math.abs(ua) > EB ? 0.02 : 0), yb = yw(ub) + (Math.abs(ub) > EB ? 0.02 : 0); PV.quad([ua, ya, -(W2 - 0.5)], [ub, yb, -(W2 - 0.5)], [ub, yb, W2 - 0.5], [ua, ya, W2 - 0.5], cPav); }
  const out = [];
  for (const [b, m, nm] of [[SC, M.schist, 'schist'], [CP, M.stone, 'coping'], [PV, M.matte, 'paving'], [DK, M.rock, 'soffit']]) {
    const mesh = b.mesh(m, 'cp34:gapstow:' + nm); if (mesh) { group.add(mesh); out.push([nm, b.tris]); }
  }
  return out;
}
// ---- the banks at Gapstow's ends (CP34) ---------------------------------------------------------------------------------
// With the walled approaches gone, the park's ground is graded to the bridge the way the banks stand against the real one
// (the 3DEP grid smooths the Pond's gorge: the lawn lay 2.6 m under the deck's ends, the probe of 2026-10-01): a corridor
// under each approach's path held at the walk's level, its sides falling 1:2.2 to the ground as it is (filled only, with a
// rounded toe); beside the abutments the banks filled against the spandrel walls, rising to the bridge's ends, off the arch's
// ring, and faded out over the last 6 m to the water (the corridor itself is always carried). cpLandmarks.js gapApply calls
// gapGrade on the tile's ground before the walkers' strip goes in; the triangles there are cut to a 0.8 x 0.6 m lattice in
// the bridge's frame first, so the banks have their shape, and the terrain grid under the corridor is lowered with it where
// the ground stood over the walk. `?cpb34=0`: as CP33 (the ground as it was).
export const CPB34 = CPB33 && !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('cpb34') === '0');
// (S: the banks' fall across, SU: toward the arch along the walls, both under the ground shader's 35 deg schist rule; KN: the
// knee of the soft maximum, so the toe is rounded and the lattice shows no creases)
const GRADE = { kinds: ['grass', 'grassU', 'path', 'sidewalk', 'gravel', 'plaza', 'brick'], off: { path: 0.03, sidewalk: 0.03, gravel: 0.03, plaza: 0.03, brick: 0.03 }, S: 0.46, SU: 0.42, KN: 0.9, du: 0.8, dw: 0.6, WMAX: 15 };
const smax = (a, b, k) => 0.5 * (a + b + Math.sqrt((a - b) * (a - b) + k * k));
// the graded height at (u, w) (the bridge's frame) over the lawn's height y there
export function gapGradeY(u, w, y, W, gW, gE) {
  const G = GAP, S = GRADE.S, PW = G.W2 - 0.25, a = Math.abs(u), aw = Math.abs(w), E = G.HALF + G.RAMP;
  if (a > E + 5 || aw > GRADE.WMAX) return y;
  const d = Math.max(0, aw - PW), kn = GRADE.KN * Math.min(1, d / 1.2);
  if (a >= G.HALF - 0.6) {
    // the corridor held at the walk; off it the banks only filled (a soft maximum never lowers the ground, so the terrain
    // grid under the lawn cannot show through)
    const p = gapWalkY(u, W, gW, gE) - 0.035, k = 1 - sstep(E, E + 5, a);
    const yc = d <= 0 ? p : smax(y, p - S * d, kn);
    return y + (yc - y) * k * (1 - sstep(GRADE.WMAX - 3, GRADE.WMAX, aw));
  }
  if (aw < G.W2) return y;
  const p0 = gapWalkY(Math.sign(u) * (G.HALF - 0.6), W, gW, gE) - 0.035, t = p0 - S * d - GRADE.SU * (G.HALF - 0.6 - a);
  return y + (smax(y, t, kn) - y) * sstep(7.7, 10.4, a) * (1 - sstep(GRADE.WMAX - 3, GRADE.WMAX, aw));
}
// a convex polygon of [u, y, w] cut by the plane (axis i) = c: its two sides, each null when empty
function cutPoly(poly, i, c) {
  const lo = [], hi = [];
  for (let k = 0; k < poly.length; k++) {
    const P = poly[k], Q = poly[(k + 1) % poly.length], p = P[i] - c, q = Q[i] - c;
    if (p <= 0) lo.push(P);
    if (p >= 0) hi.push(P);
    if ((p < 0 && q > 0) || (p > 0 && q < 0)) { const t = p / (p - q), X = [P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t, P[2] + (Q[2] - P[2]) * t]; lo.push(X); hi.push(X); }
  }
  return [lo.length > 2 ? lo : null, hi.length > 2 ? hi : null];
}
export function gapGrade(tile, ox, oz, W, gW, gE, waterAt) {
  if (!CPB34 || !tile || !tile.S) return 0;
  const G = GAP, [cx, cz] = G.C, [ax, az] = G.A, E = G.HALF + G.RAMP + 5, WM = GRADE.WMAX, du = GRADE.du, dw = GRADE.dw;
  const toUW = (x, z) => { const dx = x - cx, dz = z - cz; return [dx * ax + dz * az, -dx * az + dz * ax]; };
  // the water's distance (m, 0 on it, 7 for anything past 6)
  const wdist = (x, z) => { if (!waterAt) return 7; if (waterAt(x, z, 0) !== null) return 0; for (const d of [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6]) if (waterAt(x, z, -d) !== null) return d; return 7; };
  const graded = (u, w, y, off) => {
    const g = gapGradeY(u, w, y - off, W, gW, gE) + off;
    if (Math.abs(g - y) < 1e-4) return y;
    const x = cx + ax * u - az * w, z = cz + az * u + ax * w;
    // near the water the banks keep their own line (the corridor itself is always carried)
    const k = Math.max(sstep(0.5, 6.0, wdist(x, z)), Math.abs(u) >= G.HALF - 0.6 ? 1 - sstep(0, 1.2, Math.abs(w) - (G.W2 - 0.25)) : 0);
    return y + (g - y) * k;
  };
  let tris = 0, moved = 0;
  for (const kind of GRADE.kinds) {
    const a = tile.S[kind];
    if (!a || a.length < 9) continue;
    const off = GRADE.off[kind] || 0, out = [];
    let hit = false;
    for (let o = 0; o + 8 < a.length; o += 9) {
      const P = [0, 3, 6].map((k) => { const [u, w] = toUW(a[o + k] + ox, a[o + k + 2] + oz); return [u, a[o + k + 1], w]; });
      const u0 = Math.min(P[0][0], P[1][0], P[2][0]), u1 = Math.max(P[0][0], P[1][0], P[2][0]), w0 = Math.min(P[0][2], P[1][2], P[2][2]), w1 = Math.max(P[0][2], P[1][2], P[2][2]);
      if (u1 < -E || u0 > E || w1 < -WM || w0 > WM || (u0 > -7.6 && u1 < 7.6)) { for (let k = 0; k < 9; k++) out.push(a[o + k]); continue; }
      hit = true;
      let polys = [P];
      for (let k = Math.ceil(Math.max(u0, -E) / du); k * du < Math.min(u1, E); k++) polys = polys.flatMap((q) => cutPoly(q, 0, k * du).filter(Boolean));
      for (let k = Math.ceil(Math.max(w0, -WM) / dw); k * dw < Math.min(w1, WM); k++) polys = polys.flatMap((q) => cutPoly(q, 2, k * dw).filter(Boolean));
      for (const q of polys) {
        const V = q.map(([u, y, w]) => { const g = graded(u, w, y, off); if (g !== y) moved++; return [cx + ax * u - az * w - ox, g, cz + az * u + ax * w - oz]; });
        for (let i = 1; i + 1 < V.length; i++) { out.push(...V[0], ...V[i], ...V[i + 1]); tris++; }
      }
    }
    if (hit) tile.S[kind] = Float32Array.from(out);
  }
  // the terrain grid under a cut: lowered with the lawn, never raised
  const T = tile.S.terrain, res = tile.header && tile.header.res;
  if (T && res) {
    const n = res + 1, st = 512 / res;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = ox + i * st, z = oz + j * st, [u, w] = toUW(x, z);
      if (Math.abs(u) > E || Math.abs(w) > WM) continue;
      let lo = Infinity;
      for (const [eu, ew] of [[0, 0], [st, 0], [-st, 0], [0, st], [0, -st]]) lo = Math.min(lo, gapGradeY(u + eu, w + ew, T[j * n + i] + 0.27, W, gW, gE) - 0.27 - 0.05);
      if (lo < T[j * n + i]) T[j * n + i] = lo;
    }
  }
  return { tris, moved };
}
// the shrubs at the bridges' ends (city/cpFlora.js plants them with the banks' own, off the paths): the photographs show
// Gapstow's banks thick with shrubs from the parapets' ends to the water on all four corners, and Bow Bridge's ends with the
// railing's scrolls running into the planting (refs/cp33/gapstow, refs/cp33/bow); [x, z, scale]
export function bridgeShrubSpots() {
  if (!CPB34) return [];
  const out = [];
  let q = 34; const r = () => { q = (q * 16807) % 2147483647; return (q - 1) / 2147483646; };
  { const G = GAP, [cx, cz] = G.C, [ax, az] = G.A;
    for (const sg of [-1, 1]) for (const sd of [-1, 1]) {
      // a thicket on the bank against the wall between the arch and the pier, down toward the water
      for (let k = 0; k < 8; k++) {
        const u = sg * (8.2 + r() * 4.0), w = sd * (3.7 + r() * 3.2), s = 0.5 + r() * 0.45;
        out.push([cx + ax * u - az * w, cz + az * u + ax * w, s]);
      }
      // and along the approach's banks, thinning away from the bridge
      for (let k = 0; k < 6; k++) {
        const t = r(), u = sg * (12.4 + t * t * 9.0), w = sd * (4.4 + r() * 3.8), s = 0.5 + r() * 0.5;
        out.push([cx + ax * u - az * w, cz + az * u + ax * w, s]);
      }
    } }
  { const B = BOW, [cx, cz] = B.C, [ax, az] = B.A;
    for (const sg of [-1, 1]) for (const sd of [-1, 1]) for (let k = 0; k < 8; k++) {
      // beside the abutments past the shore, around the railing's scroll and along the bank
      const t = r(), u = sg * (B.SHORE + 0.2 + t * (B.END + 4.5 - B.SHORE)), w = sd * (3.1 + r() * 5.0 + t * 1.5), s = 0.5 + r() * 0.45;
      out.push([cx + ax * u - az * w, cz + az * u + ax * w, s]);
    }
  }
  return out;
}
export function buildGapstowB(group, W, gW, gE) {
  const far = new THREE.Group(); far.name = 'cpb33:gapstow:far';
  if (CPB34) gapstowFar(far, W, gW, gE); else buildGapstow(far, W, gW, gE);
  const near = gapstowNear(W, gW, gE);
  const [cx, cz] = GAP.C;
  nearFar(group, 'cpb33:gapstow', [cx, W + 3, cz], near, far, NEAR.gapstow);
  return [['near', trisOf(near)], ['far', trisOf(far)]];
}

// ---- Bow Bridge --------------------------------------------------------------------------------------------------------
// The ring module of the railing: the outer ring (0.524 m across on the 0.44 m pitch, so neighbours interlock), the inner
// ring, the rosette (a disc pierced by a cinquefoil and its eye), the boss, the ties to the rails: one casting, instanced
let _ringGeo = null;
function ringModule() {
  if (_ringGeo) return _ringGeo;
  const parts = [];
  const o = new THREE.TorusGeometry(0.262, 0.016, 6, 34); o.scale(1, 1, 1.35); parts.push(o);
  parts.push(new THREE.TorusGeometry(0.19, 0.0115, 5, 28));
  const sh = new THREE.Shape(); sh.absarc(0, 0, 0.118, 0, Math.PI * 2, false);
  for (let l = 0; l < 5; l++) { const a = Math.PI / 2 + l * Math.PI * 2 / 5, h = new THREE.Path(); h.absarc(Math.cos(a) * 0.06, Math.sin(a) * 0.06, 0.03, 0, Math.PI * 2, true); sh.holes.push(h); }
  { const h = new THREE.Path(); h.absarc(0, 0, 0.017, 0, Math.PI * 2, true); sh.holes.push(h); }
  const ro = new THREE.ExtrudeGeometry(sh, { depth: 0.018, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1, curveSegments: 5 });
  ro.translate(0, 0, -0.009); parts.push(ro);
  const boss = new THREE.SphereGeometry(0.016, 8, 6); boss.scale(1, 1, 0.7); parts.push(boss);
  // the inner ring's four spokes to the rosette, the ties up to the top rail and down to the plinth
  for (let k = 0; k < 4; k++) { const b = new THREE.CylinderGeometry(0.007, 0.007, 0.075, 5); b.translate(0, 0.155, 0); b.rotateZ(Math.PI / 4 + k * Math.PI / 2); parts.push(b); }
  for (const sg of [-1, 1]) { const t = new THREE.BoxGeometry(0.036, 0.075, 0.03); t.translate(0, sg * 0.296, 0); parts.push(t); }
  const g = mergeGeometries(parts.map((p) => { const q = p.index ? p.toNonIndexed() : p; q.deleteAttribute('uv'); return q; }));
  const c = new Float32Array(g.attributes.position.count * 3), k = COL.iron;
  for (let i = 0; i < c.length; i += 3) { c[i] = k.r; c[i + 1] = k.g; c[i + 2] = k.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.computeBoundingSphere();
  return (_ringGeo = g);
}
const cK = (k) => [k.r, k.g, k.b];
// a round bar along a polyline in the frame's (u, y) plane at w (the scrollwork, the volutes)
function bar(B, pts, w, r, col, seg = 6) {
  const T = pts.map((p, k) => { const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)], du = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(du, dy) || 1; return [-dy / l, du / l]; });
  B.grid(seg, pts.length - 1, (i, j) => { const th = (i / seg) * Math.PI * 2, [nu, ny] = T[j], c = Math.cos(th) * r, s = Math.sin(th) * r; return { p: [pts[j][0] + nu * c, pts[j][1] + ny * c, w + s], c: col }; });
}
function bowNear(W, gS, gN) {
  const B = BOW, [cx, cz] = B.C, [ax, az] = B.A, f = { x0: cx, y0: 0, z0: cz, ax, az };
  const M = bxMats(), LM = lmMats();
  const IR = new MB(f), ST = new MB(f), MO = new MB(f), WD = new MB(f, true), MT = new MB(f), LF = new MB(f);
  const HID = new LBin().frame(cx, 0, cz, ax, az);        // the structure under the deck and inside the spandrels (dark)
  seed(1862);
  const yd = (u) => bowDeckY(u, W, gS, gN), HW = B.HALF, RW = B.RAIL;
  const yS = W + B.SPRING, yC = W + B.DECK0 - 0.42, r0 = yC - yS, R = (B.SPAN * B.SPAN + r0 * r0) / (2 * r0), yc = yC - R;
  const yi = (u) => yc + Math.sqrt(Math.max(0, R * R - u * u)), dep = (u) => 0.2 + 0.36 * (Math.abs(u) / B.SPAN) ** 2;
  const iron = cK(COL.iron), ironS = cK(COL.ironS), ironD = cK(COL.ironD), ironU = cK(COL.ironU);
  // -- the deck: boards along the span with butt joints, chamfered and worn, on a dark bed
  const nPl = 31, pw = (2 * (RW - 0.12)) / nPl, tones = [cK(COL.plank), cK(COL.plankD), cK(COL.plankL), mix3(cK(COL.plank), cK(COL.plankD), 0.5)];
  for (let k = 0; k < nPl; k++) {
    const w0 = -(RW - 0.12) + k * pw + 0.004, w1 = w0 + pw - 0.008;
    let u = -B.IRON - rnd() * 2.0;
    while (u < B.IRON) {
      const a = Math.max(-B.IRON, u), b = Math.min(B.IRON, u + 2.4 + rnd() * 1.8); u = b + 0.006;
      if (b - a < 0.2) continue;
      const tone = tones[Math.floor(rnd() * tones.length)].map((v, i) => v / PLANK_MEAN[i] * (0.9 + rnd() * 0.2)), dy = (rnd() - 0.5) * 0.004, v0 = rnd() * 0.85, tw = rnd() * 0.04;
      const us = steps(a, b, Math.max(2, Math.ceil((b - a) / 0.45)));
      const prof = [[w0, -0.03], [w0, -0.006], [w0 + 0.007, 0], [w1 - 0.007, 0], [w1, -0.006], [w1, -0.03]];
      WD.grid(prof.length - 1, us.length - 1, (i, j) => {
        const uu = us[j], [w, d] = prof[i], wear = 1 - 0.18 * sstep(0.3, 0.9, fbm(uu * 0.7 + k, w * 6));
        return { p: [uu, yd(uu) + d + dy + tw * (w - (w0 + w1) / 2), w], c: mul(tone, wear), t: [uu / 5.0 + v0 * 3.0, v0 + (w - w0) / 2.0 * 0.9] };
      });
    }
  }
  { const us = steps(-B.IRON, B.IRON, 60); MT.grid(us.length - 1, 1, (i, j) => ({ p: [us[i], yd(us[i]) - 0.032, j ? RW : -RW], c: cK(COL.gap) })); }
  for (const sg of [-1, 1]) {
    // the paved approaches, the bollards where the boards meet them
    const us = steps(sg * B.IRON, sg * (B.END + 0.6), 16), pave = cK(COL.pave);
    MT.grid(us.length - 1, 4, (i, j) => { const u = us[i], w = -RW + 2 * RW * j / 4, n = fbm(u * 1.3, w * 1.3); return { p: [u, yd(u) + 0.003 * n, w], c: mul(pave, 0.85 + 0.3 * n) }; });
    for (const w of [-1.25, 0, 1.25]) { const u = sg * (B.IRON + 1.1); rbox(MT, u, yd(u) + 0.45, w, 0.07, 0.45, 0.07, 0.035, cK(COL.bollard), { step: 0.3, ao0: 0.85 }); MT.grid(8, 4, (i, j) => { const th = i / 8 * Math.PI * 2, ph = j / 4 * Math.PI / 2; return { p: [u + Math.cos(th) * Math.cos(ph) * 0.08, yd(u) + 0.9 + Math.sin(ph) * 0.06, w + Math.sin(th) * Math.cos(ph) * 0.08], c: cK(COL.bollard) }; }); }
  }
  // -- the cornice and fascia along both sides (the old section, its mouldings smooth), its cast panels
  // (CP34: the cornice and fascia run on over the abutments to the end posts, as on the bridge; CP33 stopped them at the shore)
  const uF = CPB34 ? steps(-(B.END - 0.35), B.END - 0.35, 170) : steps(-B.SHORE, B.SHORE, 120), pF = upPath(uF, yd);
  const FP = [[[0.005, HW - 0.3], [0.005, HW + 0.11]], [[0.005, HW + 0.11], [-0.05, HW + 0.11]], [[-0.05, HW + 0.11], [-0.062, HW + 0.07], [-0.07, HW + 0.045], [-0.085, HW + 0.032], [-0.1, HW + 0.03], [-0.112, HW + 0.012], [-0.12, HW]],
    [[-0.12, HW], [-0.35, HW]], [[-0.35, HW], [-0.352, HW + 0.02], [-0.36, HW + 0.035], [-0.385, HW + 0.04], [-0.41, HW + 0.035]], [[-0.41, HW + 0.035], [-0.41, HW - 0.25]]];
  for (const mir of [false, true]) sweep(IR, pF, 0, FP, (i, j) => mul(iron, 0.9 + 0.1 * fbm(j * 0.17 + i * 1.3, i * 2.9 + (mir ? 7 : 0))), mir);   // the paint a little grimed in places
  for (const sd of [-1, 1]) for (let u = -B.SHORE + 0.9; u < B.SHORE - 0.8; u += 1.62) {
    if (Math.abs(Math.abs(u) - B.IRON) < 0.6 || Math.abs(Math.abs(u) - (B.PIER - 0.4)) < 0.6) continue;
    const y = yd(u) - 0.235, sl = Math.atan((yd(u + 0.5) - yd(u - 0.5)) / 1.0);
    rbox(IR, u, y, sd * (HW + 0.004), 0.66, 0.075, 0.012, 0.008, ironS, { pitch: sl, step: 0.4, ao0: 0.8, faces: ['+u', '-u', '+y', '-y', sd > 0 ? '+w' : '-w'] });
    IR.grid(14, 3, (i, j) => { const th = i / 14 * Math.PI * 2, rr = [0.06, 0.055, 0.03, 0.0][j], hh = [0, 0.012, 0.022, 0.026][j]; return { p: [u + Math.cos(th) * rr, y + Math.sin(th) * rr, sd * (HW + 0.016 + hh)], c: iron }; });
  }
  // -- the arch: five ribs on the circle (the fascia ribs with beads along their faces); under the deck the cross beams,
  // the posts and the floor plates (flat, in the dark)
  const uA = steps(-B.SPAN, B.SPAN, 64);
  const ribPath = uA.map((u) => { const y = yi(u), nu = u / R, ny = (y - yc) / R; return [u, y, nu, ny]; });
  const rib = (w, b, col, face) => {
    // the soffit, the two sides, the back (the depth grows to the springing)
    IR.grid(1, uA.length - 1, (i, j) => { const [u, y] = ribPath[j]; return { p: [u, y, w + (i ? b / 2 : -b / 2)], c: ironD }; });
    for (const s of [-1, 1]) IR.grid(1, uA.length - 1, (i, j) => { const [u, y, nu, ny] = ribPath[j], d = i ? dep(u) : 0; return { p: [u + nu * d, y + ny * d, w + s * b / 2], c: col }; });
    IR.grid(1, uA.length - 1, (i, j) => { const [u, y, nu, ny] = ribPath[j], d = dep(u); return { p: [u + nu * d, y + ny * d, w + (i ? b / 2 : -b / 2)], c: col }; });
    if (face) {
      const s = Math.sign(w), wf = w + s * b / 2;
      for (const [d0, d1] of [[0.0, 0.06], [0.12, 0.155]]) {
        IR.grid(6, uA.length - 1, (i, j) => { const [u, y, nu, ny] = ribPath[j], th = i / 6 * Math.PI, dc = (d0 + d1) / 2, rr = (d1 - d0) / 2; return { p: [u + nu * (dc - Math.cos(th) * rr), y + ny * (dc - Math.cos(th) * rr), wf + s * Math.sin(th) * rr * 0.9], c: ironS }; });
      }
    }
  };
  rib(-(HW - 0.08), 0.14, iron, true); rib(HW - 0.08, 0.14, iron, true);
  for (const w of [-1.25, 0, 1.25]) rib(w, 0.1, ironU, false);
  const fb = (u) => yd(u) - 0.41;
  for (let u = -B.SPAN + 0.45; u < B.SPAN - 0.3; u += 0.75) {
    const e = yi(u) + dep(u);
    HID.box(0.09, 0.14, 2 * HW - 0.2, COL.ironU, u, e, 0);
    if (fb(u) - e > 0.12) for (const w of [-1.25, 0, 1.25]) HID.box(0.07, fb(u) - e, 0.07, COL.ironU, u, e, w);
  }
  { const uS = steps(-B.SPAN, B.SPAN, 40); for (let i = 0; i + 1 < uS.length; i++) { const ua = uS[i], ub = uS[i + 1]; HID.quad([ua, fb(ua) + 0.02, -(HW - 0.15)], [ub, fb(ub) + 0.02, -(HW - 0.15)], [ub, fb(ub) + 0.02, HW - 0.15], [ua, fb(ua) + 0.02, HW - 0.15], COL.ironU); } }
  // -- the spandrels' scrollwork between the fascia rib's back and the fascia, as round bars: a running stem with a
  // spiral off each crest, its frame bars along the rib and under the fascia
  for (const sd of [-1, 1]) {
    const wf = sd * (HW - 0.06);
    for (const sg of [-1, 1]) {
      const back = (u) => yi(u) + dep(u), Hs = (u) => fb(u) - back(u);
      let u0 = sg * 0.5; for (let u = 0.5; u < B.SPAN; u += 0.02) if (Hs(sg * u) > 0.13) { u0 = sg * u; break; }
      const us = steps(Math.abs(u0), B.SPAN - 0.06, 60).map((a) => sg * a);
      bar(IR, us.map((u) => [u, back(u) + 0.02]), wf, 0.018, iron);
      bar(IR, us.map((u) => [u, fb(u) - 0.02]), wf, 0.018, iron);
      // the stem: a wave between the two frame bars; a spiral scroll off every crest, curling the other way
      const stem = [], per = 0.82;
      for (const u of steps(Math.abs(u0), B.SPAN - 0.1, 90).map((a) => sg * a)) { const m = (back(u) + fb(u)) / 2, h = Hs(u); stem.push([u, m + Math.sin((Math.abs(u) - Math.abs(u0)) / per * Math.PI * 2) * h * 0.26]); }
      bar(IR, stem, wf, 0.013, iron);
      for (let a = Math.abs(u0) + per * 0.25; a < B.SPAN - 0.15; a += per / 2) {
        const u = sg * a, h = Hs(u); if (h < 0.16) continue;
        const up = Math.round((a - Math.abs(u0)) / (per / 2) - 0.5) % 2 === 0, m = (back(u) + fb(u)) / 2, yc0 = m + (up ? 1 : -1) * h * 0.26, r1 = h * 0.2;
        const sp = []; for (let t = 0; t <= 1.0001; t += 0.04) { const th = (up ? 1 : -1) * (Math.PI / 2 + t * 1.6 * Math.PI * 2) * sg, rr = r1 * (1 - 0.8 * t); sp.push([u + Math.cos(th) * rr * sg, yc0 + (up ? -1 : 1) * r1 + Math.sin(th) * rr]); }
        bar(IR, sp, wf, 0.011, iron, 5);
        // a leaf off the stem: a flattened bulb
        IR.grid(8, 4, (i, j) => { const th = i / 8 * Math.PI * 2, ph = j / 4 * Math.PI, l = 0.07 * Math.sin(ph); return { p: [u + sg * 0.12 + Math.cos(th) * l * 0.4 - Math.cos(ph) * 0.09 * sg, m + Math.sin(th) * l * 0.25, wf + sd * 0.012 * Math.sin(ph)], c: iron }; });
      }
    }
  }
  // -- the railings: the plinth rail and the moulded top rail (swept), the rings (instanced castings), the piers with
  // their panels, rosettes and caps, the planting urns, the scroll terminals at the ends
  // CP34 (refs/cp33/bow: the 2024 and spring photographs from the Lake): at each end the railing runs from the post over the
  // springing, its urn on it, on over the granite abutment to the end post with the other urn, and the scroll sweeps down off
  // that post into the planting; CP33 had an urn post at the iron's end (IRON), a plain post past it and 4 m more of rings
  const PW = 0.4, UE = B.END - 0.35 - PW;
  const piers = CPB34 ? [-UE, -B.PIER + 0.4, B.PIER - 0.4, UE] : [-B.IRON, -B.PIER + 0.4, B.PIER - 0.4, B.IRON, -17.6, 17.6];
  const urnAt = new Set(CPB34 ? piers : [-B.IRON, -B.PIER + 0.4, B.PIER - 0.4, B.IRON]);
  const runs = []; { const cuts = [-B.END + 0.35, ...piers.slice().sort((a, b) => a - b), B.END - 0.35]; for (let i = 0; i + 1 < cuts.length; i++) runs.push([cuts[i] + (i ? PW : 0), cuts[i + 1] - (i + 2 < cuts.length ? PW : 0)]); }
  const rings = [];
  const PL = [[[0, -0.06], [0.12, -0.06]], [[0.12, -0.06], [0.12, 0.06]], [[0.12, 0.06], [0, 0.06]]];
  const TR = [[[0.78, -0.09], [0.81, -0.1], [0.84, -0.1], [0.875, -0.093], [0.9, -0.08], [0.918, -0.055], [0.925, -0.03], [0.927, 0], [0.925, 0.03], [0.918, 0.055], [0.9, 0.08], [0.875, 0.093], [0.84, 0.1], [0.81, 0.1], [0.78, 0.09]], [[0.78, 0.09], [0.78, -0.09]]];
  for (const sd of [-1, 1]) {
    const w = sd * RW;
    for (const [u0, u1] of runs) {
      if (u1 - u0 < 0.1) continue;
      const path = upPath(steps(u0, u1, Math.max(2, Math.ceil((u1 - u0) / 0.3))), yd);
      sweep(IR, path, w, PL, iron); sweep(IR, path, w, TR, iron);
      for (let u = u0 + 0.24; u <= u1 - 0.24 + 1e-6; u += 0.44) rings.push([u, yd(u) + 0.45, w]);
    }
    for (const p of piers) {
      const y = yd(p), tp = y + 1.02, h = tp - (y - 0.41);
      rbox(IR, p, y - 0.41 + h / 2, w, PW, h / 2, 0.17, 0.02, iron, { step: 0.3, ao0: 0.82 });
      rbox(IR, p, tp + 0.04, w, PW + 0.06, 0.04, 0.23, 0.015, ironS, { step: 0.3, ao0: 0.85 });
      rbox(IR, p, tp + 0.105, w, PW + 0.02, 0.025, 0.2, 0.01, iron, { step: 0.3, ao0: 0.85 });
      rbox(IR, p, y + 0.51, w + sd * 0.17, PW - 0.08, 0.25, 0.012, 0.008, ironS, { step: 0.3, ao0: 0.8, faces: ['+u', '-u', '+y', '-y', sd > 0 ? '+w' : '-w'] });
      IR.grid(16, 4, (i, j) => { const th = i / 16 * Math.PI * 2, rr = [0.135, 0.13, 0.1, 0.05, 0][j], hh = [0, 0.03, 0.045, 0.05, 0.055][j]; return { p: [p + Math.cos(th) * rr, y + 0.51 + Math.sin(th) * rr, w + sd * (0.18 + hh)], c: j > 2 ? ironS : iron }; });
      if (urnAt.has(p)) {
        // the planting urn (Robinson Iron's replicas, 3.5 ft): a footed, gadrooned bowl on its plinth, planted
        const yb = tp + 0.13;
        rbox(IR, p, yb + 0.05, w, 0.18, 0.05, 0.18, 0.015, iron, { step: 0.3, ao0: 0.85 });
        const prof = [[0.0, 0], [0.12, 0], [0.125, 0.02], [0.12, 0.05], [0.08, 0.09], [0.065, 0.14], [0.06, 0.2], [0.075, 0.25], [0.11, 0.29], [0.2, 0.36], [0.27, 0.44], [0.31, 0.52], [0.34, 0.6], [0.355, 0.66], [0.37, 0.69], [0.365, 0.72], [0.34, 0.725], [0.32, 0.7]];
        const nS = 40;
        IR.grid(nS, prof.length - 1, (i, j) => {
          const th = i / nS * Math.PI * 2, [r, yy] = prof[j], gad = yy > 0.3 && yy < 0.64 ? 1 + 0.055 * Math.cos(th * 16) * Math.sin((yy - 0.3) / 0.34 * Math.PI) : 1;
          return { p: [p + Math.cos(th) * r * gad, yb + 0.1 + yy, w + Math.sin(th) * r * gad], c: yy > 0.3 && yy < 0.64 && Math.cos(th * 16) < -0.5 ? ironS : iron };
        });
        // the planting: a mound of leaves (a displaced dome, dark in its hollows) and the flowers over it
        const leaf = lin(0x4f7a3a), leafD = lin(0x2f4a24), fl = [lin(0xb8445a), lin(0xd06a7a), lin(0xe0d0d8)];
        LF.grid(18, 8, (i, j) => {
          const th = i / 18 * Math.PI * 2, ph = j / 8 * Math.PI / 2, n = fbm(Math.cos(th) * 3 + p, Math.sin(th) * 3 + ph * 4 + sd), rr = 0.36 * (0.78 + 0.45 * n);
          return { p: [p + Math.cos(th) * Math.cos(ph) * rr, yb + 0.78 + Math.sin(ph) * rr * 0.62, w + Math.sin(th) * Math.cos(ph) * rr], c: mix3(leafD, leaf, sstep(0.3, 0.7, n)) };
        });
        for (let k = 0; k < 11; k++) { const a = k * 2.4 + p, rr = 0.1 + (k % 3) * 0.08, c = fl[k % 3]; LF.grid(6, 3, (i, j) => { const th = i / 6 * Math.PI * 2, ph = j / 3 * Math.PI - Math.PI / 2; return { p: [p + Math.cos(a) * rr + Math.cos(th) * Math.cos(ph) * 0.05, yb + 0.98 + (k % 2) * 0.06 + Math.sin(ph) * 0.04, w + Math.sin(a) * rr + Math.sin(th) * Math.cos(ph) * 0.05], c }; }); }
      }
    }
    // the scroll terminals: the rail sweeps down and out into a volute (a round bar on the quarter turn, the volute's disc)
    for (const sg of [-1, 1]) {
      const u0 = sg * (B.END - 0.35), yg = yd(sg * B.END), pts = [];
      for (let k = 0; k <= 14; k++) { const t = k / 14, a = t * Math.PI / 2; pts.push([u0 + sg * Math.sin(a) * 0.75, yg + 0.3 + (yd(u0) + 0.86 - yg - 0.3) * Math.cos(a)]); }
      bar(IR, pts, w + sd * 0.0, 0.085, iron, 10);
      const e = pts[pts.length - 1];
      IR.grid(20, 5, (i, j) => { const th = i / 20 * Math.PI * 2, rr = [0.25, 0.25, 0.22, 0.12, 0.1, 0][j], ww = [-0.15, 0.15, 0.17, 0.17, 0.2, 0.2][j]; return { p: [e[0] + sg * 0.05 + Math.cos(th) * rr, e[1] - 0.12 + Math.sin(th) * rr, w + sd * ww], c: j > 2 ? ironS : iron }; });
      rbox(ST, u0 + sg * 0.25, yg - 0.25 + Math.max(0.2, yd(u0) - yg + 0.25) / 2, w, 0.45, Math.max(0.2, yd(u0) - yg + 0.25) / 2, 0.22, 0.02, cK(COL.graniteD), { rough: 0.004, step: 0.3 });
    }
  }
  // -- the stone: the abutments' granite in courses (dressed, rock-faced a little), the pilasters under the springing
  // piers with their medallions, the skewbacks, the approach walls' coping
  const GR = [cK(COL.granite), cK(COL.graniteD), cK(COL.graniteL), mix3(cK(COL.granite), cK(COL.graniteL), 0.5)];
  const ash = { joint: 0.016, depth: 0.026, rough: 0.008, dome: 0.006, rim: 0.016, tilt: 0.008, freq: 3.0, hmin: 0.42, hmax: 0.6, lmin: 0.8, lmax: 1.5, cols: GR, weather: wetter(W), draft: 0.028, step: 0.11, facets: 3, crag: 0.014, wobble: 0.004, toneVar: 0.26 };
  const bot = Math.min(W, Math.min(gS, gN)) - 1.2;
  for (const sg of [-1, 1]) {
    const ua = Math.min(sg * B.SPAN, sg * (B.END + 0.3)), ub = Math.max(sg * B.SPAN, sg * (B.END + 0.3));
    for (const sd of [-1, 1]) {
      const face = (s, t, z) => [s, t, sd * (HW + 0.06 + z)];
      wall(ST, face, ua, ub, () => bot, (u) => yd(u) - 0.4, ash);
      backing(MO, face, ua, ub, () => bot, (u) => yd(u) - 0.4, lin(0x9a958a), 40);
      const pu = sg * (B.SPAN + 0.4), yt = yd(pu) - 0.41, wp = sd * (HW + 0.06);
      rbox(ST, pu, (W - 0.6 + yt) / 2, wp + sd * 0.1, 0.5, (yt - (W - 0.6)) / 2, 0.1, 0.012, cK(COL.granite), { rough: 0.003, step: 0.3, ao0: 0.85 });
      rbox(ST, pu, W - 0.6 + 0.225, wp + sd * 0.1, 0.58, 0.225, 0.17, 0.015, cK(COL.graniteD), { rough: 0.004, step: 0.3, ao0: 0.8 });
      rbox(ST, pu, yt - 0.05, wp + sd * 0.1, 0.56, 0.05, 0.15, 0.012, cK(COL.graniteL), { step: 0.3, ao0: 0.85 });
      const ym = W + 0.22 + (yt - W) * 0.5;
      ST.grid(18, 4, (i, j) => { const th = i / 18 * Math.PI * 2, rr = [0.19, 0.18, 0.15, 0.08, 0][j], hh = [0, 0.03, 0.05, 0.06, 0.07][j]; return { p: [pu + Math.cos(th) * rr, ym + Math.sin(th) * rr, wp + sd * (0.2 + hh)], c: cK(COL.graniteL) }; });
    }
    // the springing face under the arch and the far end, in courses
    for (const [uu, dir] of [[sg * B.SPAN, -sg], [sg * (B.END + 0.3), sg]]) {
      const face = (s, t, z) => [uu + dir * z, t, s];
      const hi = () => yd(uu) - (dir === -sg ? 0.4 : 0.02);
      wall(ST, face, -(HW + 0.06), HW + 0.06, () => bot, hi, ash);
      backing(MO, face, -(HW + 0.06), HW + 0.06, () => bot, hi, lin(0x9a958a), 8);
    }
    const uc = CPB34 ? steps(sg * (B.END - 0.35), sg * (B.END + 0.3), 3) : steps(sg * B.SHORE, sg * (B.END + 0.3), 14), pc = upPath(uc, yd);
    const CP = [[[0, HW - 0.3], [0, HW + 0.12]], [[0, HW + 0.12], [-0.01, HW + 0.125], [-0.13, HW + 0.125], [-0.14, HW + 0.12]], [[-0.14, HW + 0.12], [-0.14, HW + 0.06]], [[-0.14, HW + 0.06], [-0.42, HW + 0.06]]];
    for (const mir of [false, true]) sweep(ST, pc, 0, CP, cK(COL.graniteL), mir);
    rbox(ST, sg * (B.SPAN - 0.2), yS - 0.25 + 0.25, 0, 0.25, 0.25, HW, 0.015, cK(COL.graniteL), { rough: 0.004, step: 0.35, ao0: 0.8 });
  }
  const grp = new THREE.Group(); grp.name = 'cpb33:bow:near';
  for (const [b, m, nm, cast] of [[IR, M.iron, 'iron', true], [ST, M.granite, 'granite', true], [MO, M.mortar, 'mortar', false], [WD, M.wood, 'boards', true], [MT, M.matte, 'matte', false], [LF, M.leaf, 'planting', false]]) {
    const mesh = b.mesh(m, 'cpb33:bow:' + nm, cast); if (mesh) grp.add(mesh);
  }
  { const mesh = HID.mesh(LM.iron, 'cpb33:bow:under'); if (mesh) { mesh.castShadow = false; grp.add(mesh); } }
  // the rings: one casting, instanced along both railings
  const geo = ringModule(), im = new THREE.InstancedMesh(geo, M.iron, rings.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-az, ax)), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const tint = new THREE.Color();
  rings.forEach(([u, y, w], i) => { v.set(cx + ax * u - az * w, y, cz + az * u + ax * w); m4.compose(v, q, one); im.setMatrixAt(i, m4); const g = 0.9 + 0.1 * fbm(u * 0.5 + w, y * 3.0); tint.setRGB(g, g * 0.99, g * 0.97); im.setColorAt(i, tint); });
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.castShadow = true; im.receiveShadow = true; im.name = 'cpb33:bow:rings';
  grp.add(im);
  return grp;
}
export function buildBowBridgeB(group, W, gS, gN, key) {
  const far = new THREE.Group(); far.name = 'cpb33:bow:far';
  buildBowBridge(far, W, gS, gN, key);
  const near = bowNear(W, gS, gN);
  const [cx, cz] = BOW.C;
  nearFar(group, 'cpb33:bow', [cx, W + 2, cz], near, far, NEAR.bow);
  return [['near', trisOf(near)], ['far', trisOf(far)]];
}
// CP34 (the owner on teaser 4's bridges' ends): past each end CSCL's "CENTRAL PARK BOW BRIDGE" roadway kept its sidewalks,
// kerbs and asphalt beside the landings, and the relief ran them on down the banks into the Lake as flat caps at their own
// levels: pale wedges and dark terraces either side of both ends (shots/cp33/bridges34 b0/bowE_N, bowE_S, a4/bowE_S2), and
// where bowApply had cut the roadway to 6.5 m off the axis no ground lay at all (the probe: surfaceAt null at w +-4..6,
// u +-14..20), so LAND's lowered terrain showed. Beside each landing (outside the railings, from the springing piers to 6 m
// past the ends) the roadway's pieces go, and the bank is laid again as lawn on a 0.7 m lattice: a slope from the landing's
// level down to 0.25 m under the water over the last 4.5 m to the shore, eased into the ground left round it (the lawn and
// the paths, Gaussian weights), 3 cm under it where they overlap. cpLandmarks.js bowApply calls this once the levels are set
// (W, gS, gN); waterAt: LAND's cpWaterY. Returns the triangles dropped plus the cells laid.
export function bowBanks(tile, ox, oz, W, gS, gN, waterAt) {
  if (!CPB34 || !tile || !tile.S || !waterAt) return 0;
  const B = BOW, [cx, cz] = B.C, [ax, az] = B.A, U0 = B.IRON - 1, U1 = B.END + 6, W0 = B.RAIL + 0.2, W1 = 10;
  const toUW = (x, z) => { const dx = x - cx, dz = z - cz; return [dx * ax + dz * az, -dx * az + dz * ax]; };
  const inBox = (u, w) => Math.abs(u) > U0 && Math.abs(u) < U1 && Math.abs(w) > W0 && Math.abs(w) < W1;
  let n = 0;
  // (and the lawn's own flat pieces low on the bank there: they lay as terraces stepping into the water, a6/bowE_S2_a6; the
  // sloping bank's own pieces stay, a7/bowE_N2_a7 showed the lattice creasing against them)
  for (const kind of ['sidewalk', 'asphalt', 'gutter', 'curb', 'paintW', 'paintY', 'paintG', 'warn', 'warnIron', 'busred', 'grass', 'grassU']) {
    const a = tile.S[kind];
    if (!a || a.length < 9) continue;
    const lawn = kind === 'grass' || kind === 'grassU', keep = [];
    for (let o = 0; o + 8 < a.length; o += 9) {
      const x = (a[o] + a[o + 3] + a[o + 6]) / 3 + ox, z = (a[o + 2] + a[o + 5] + a[o + 8]) / 3 + oz, [u, w] = toUW(x, z);
      // (a piece of lawn only when it lies wholly in the box, so the lattice covers what it leaves, and lies flat)
      const whole = () => [0, 3, 6].every((k) => { const [uk, wk] = toUW(a[o + k] + ox, a[o + k + 2] + oz); return inBox(uk, wk); });
      const flat = () => {
        const e1 = [a[o + 3] - a[o], a[o + 4] - a[o + 1], a[o + 5] - a[o + 2]], e2 = [a[o + 6] - a[o], a[o + 7] - a[o + 1], a[o + 8] - a[o + 2]];
        const nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0], l = Math.hypot(nx, ny, nz);
        return l > 1e-9 && Math.abs(ny) / l > 0.996;
      };
      if (inBox(u, w) && (!lawn || ((a[o + 1] + a[o + 4] + a[o + 7]) / 3 < (u < 0 ? gS : gN) - 0.2 && waterAt(x, z, -6) !== null && whole() && flat()))) { n++; continue; }
      for (let k = 0; k < 9; k++) keep.push(a[o + k]);
    }
    if (keep.length !== a.length) tile.S[kind] = Float32Array.from(keep);
  }
  // the ground left round the banks (its triangles for the cover test, its centroids for the heights)
  const HK = ['grass', 'grassU', 'sidewalk', 'path', 'plaza', 'brick', 'gravel', 'asphalt'];
  const tris = [], pts = [];
  for (const kind of HK) {
    const a = tile.S[kind];
    if (!a || a.length < 9) continue;
    for (let o = 0; o + 8 < a.length; o += 9) {
      const P = [0, 3, 6].map((k) => { const [u, w] = toUW(a[o + k] + ox, a[o + k + 2] + oz); return [u, a[o + k + 1], w]; });
      const um = (P[0][0] + P[1][0] + P[2][0]) / 3, wm = (P[0][2] + P[1][2] + P[2][2]) / 3;
      if (Math.abs(um) < U0 - 4 || Math.abs(um) > U1 + 4 || Math.abs(wm) > W1 + 4) continue;
      tris.push(P);
      if (kind === 'grass' || kind === 'path') pts.push([um, (P[0][1] + P[1][1] + P[2][1]) / 3, wm]);
    }
  }
  const covered = (u, w) => tris.some((P) => {
    const d = (p, q) => (u - q[0]) * (p[2] - q[2]) - (p[0] - q[0]) * (w - q[2]);
    const d1 = d(P[1], P[0]), d2 = d(P[2], P[1]), d3 = d(P[0], P[2]);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  });
  // the signed distance to the shore (m, + on the land, - on the water), by bisection on LAND's pad (to 5 m either way)
  const sdist = (x, z) => {
    const wet = waterAt(x, z, 0) !== null;
    let a = 0, b = 5;
    if (wet ? waterAt(x, z, b) !== null : waterAt(x, z, -b) === null) return wet ? -b : b;
    for (let k = 0; k < 7; k++) { const m = (a + b) / 2; if (wet ? waterAt(x, z, m) !== null : waterAt(x, z, -m) === null) a = m; else b = m; }
    return wet ? -(a + b) / 2 : (a + b) / 2;
  };
  // the bank: 0.25 m under the water at the shore, rising steepest there and easing onto the landing's level 4.5 m in (no
  // shelf at the waterline), on under the water at the same pitch; eased into the ground left round it near its edges
  const hAt = (u, w) => {
    const x = cx + ax * u - az * w, z = cz + az * u + ax * w, d = sdist(x, z), g = (u < 0 ? gS : gN) - 0.03, lo = W - 0.25;
    if (d <= 0) return Math.max(lo - 0.6, lo + d * 0.5);
    const t = Math.min(1, d / 4.5), yA = lo + (g - lo) * (1 - (1 - t) * (1 - t));
    let sw = 0, sy = 0;
    for (const [pu, py, pw] of pts) { const d2 = (pu - u) ** 2 + (pw - w) ** 2; if (d2 > 9) continue; const k = Math.exp(-d2 / 1.2); sw += k; sy += k * py; }
    const tI = sw < 1e-4 ? 0 : (1 - Math.exp(-1.5 * sw)) * sstep(0.5, 2.5, d);
    return (sw < 1e-4 ? yA : yA + (sy / sw - yA) * tI) - 0.03;
  };
  const fill = [], du = 0.7, dw = 0.7;
  let cells = 0;
  for (const sg of [-1, 1]) for (const sd of [-1, 1]) {
    const nu = Math.ceil((U1 - U0) / du), nw = Math.ceil((W1 - W0) / dw), H = [];
    for (let i = 0; i <= nu; i++) { H.push([]); for (let j = 0; j <= nw; j++) { const u = sg * (U0 + (U1 - U0) * i / nu), w = sd * (W0 + (W1 - W0) * j / nw); H[i].push([u, hAt(u, w), w]); } }
    for (let i = 0; i < nu; i++) for (let j = 0; j < nw; j++) {
      const um = sg * (U0 + (U1 - U0) * (i + 0.5) / nu), wm = sd * (W0 + (W1 - W0) * (j + 0.5) / nw), xm = cx + ax * um - az * wm, zm = cz + az * um + ax * wm;
      if (waterAt(xm, zm, 1.2) !== null || covered(um, wm)) continue;
      // the abutments' faces stand at w +-(HALF + 0.06) only to the far end's face (END + 0.3); past it the bank is open
      const q = [H[i][j], H[i + 1][j], H[i + 1][j + 1], H[i][j + 1]].map(([u, y, w]) => [cx + ax * u - az * w - ox, y, cz + az * u + ax * w - oz]);
      const up = (q[1][0] - q[0][0]) * (q[2][2] - q[0][2]) - (q[1][2] - q[0][2]) * (q[2][0] - q[0][0]) < 0;
      if (up) fill.push(...q[0], ...q[1], ...q[2], ...q[0], ...q[2], ...q[3]); else fill.push(...q[0], ...q[2], ...q[1], ...q[0], ...q[3], ...q[2]);
      cells++;
    }
  }
  if (fill.length) {
    const g = tile.S.grass, m = new Float32Array((g ? g.length : 0) + fill.length);
    if (g) m.set(g, 0);
    m.set(fill, g ? g.length : 0);
    tile.S.grass = m;
  }
  return n + cells;
}

// ---- Oak Bridge --------------------------------------------------------------------------------------------------------
// Vaux's carved white oak bridge over Bank Rock Bay (1859-60; rebuilt in 2009 on a steel frame, the railings and deck in
// white oak): the planks laid across, each with its own tone, worn ends and nail heads; the oak fascias in boards with butt
// joints and a bead; the steel girders and cross beams under it; eleven posts a side (plinth, chamfered shaft, collar, cap,
// pyramid and turned finial); the capped top rail and the bottom rail swept along the hump; between them the cast-iron
// panels (a roundel with its rosette, four scrolls), one casting instanced; the abutments in coursed schist with a coping.
let _oakPanel = null;
function oakPanelGeo() {
  if (_oakPanel) return _oakPanel;
  const P = new MB({ x0: 0, y0: 0, z0: 0, ax: 1, az: 0 }), col = lin(0x2a2826), colH = lin(0x3a3835);
  const sp = (cs, ct, r0, a0, turns, dir, n = 24) => { const o = []; for (let k = 0; k <= n; k++) { const q = k / n, a = a0 + dir * q * turns * Math.PI * 2, r = r0 * (1 - 0.86 * q); o.push([cs + Math.cos(a) * r, ct + Math.sin(a) * r]); } return o; };
  const ring = (cs, ct, r, n = 28) => { const o = []; for (let k = 0; k <= n; k++) { const a = k / n * Math.PI * 2; o.push([cs + Math.cos(a) * r, ct + Math.sin(a) * r]); } return o; };
  const t0 = 0.0, t1 = 0.78, tm = 0.39;
  bar(P, [[-0.88, t0 + 0.012], [0.88, t0 + 0.012]], 0, 0.013, col, 5);          // the frame bars
  bar(P, [[-0.88, t1 - 0.012], [0.88, t1 - 0.012]], 0, 0.013, col, 5);
  bar(P, ring(0, tm, 0.175), 0, 0.0125, col, 5); bar(P, ring(0, tm, 0.108), 0, 0.01, col, 5);   // the roundel
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + Math.PI / 8; bar(P, [[Math.cos(a) * 0.108, tm + Math.sin(a) * 0.108], [Math.cos(a) * 0.175, tm + Math.sin(a) * 0.175]], 0, 0.007, col, 4); }
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; P.grid(8, 4, (i, j) => { const th = i / 8 * Math.PI * 2, ph = j / 4 * Math.PI, l = 0.05 * Math.sin(ph); return { p: [Math.cos(a) * 0.056 + Math.cos(th) * l * 0.5 + Math.cos(a) * (Math.cos(ph) - 1) * 0.03, tm + Math.sin(a) * 0.056 + Math.sin(th) * l * 0.5 + Math.sin(a) * (Math.cos(ph) - 1) * 0.03, Math.sin(th) * l * 0.5], c: colH }; }); }
  P.grid(10, 6, (i, j) => { const th = i / 10 * Math.PI * 2, ph = j / 6 * Math.PI; return { p: [Math.cos(th) * Math.sin(ph) * 0.034, tm + Math.cos(ph) * 0.034, Math.sin(th) * Math.sin(ph) * 0.034 * 0.7], c: colH }; });   // the boss
  for (const sg of [-1, 1]) for (const up of [-1, 1]) {
    const cs = sg * 0.44, ct = tm + up * 0.18, r0 = 0.15;
    const dirR = Math.atan2(tm - ct, -cs);                                      // from the scroll's centre toward the roundel
    const sc = sp(cs, ct, r0, dirR, 1.3, sg * up, 26);
    bar(P, sc, 0, 0.011, col, 5);
    const s0 = sc[0], ra = Math.atan2(s0[1] - tm, s0[0]), rp = [Math.cos(ra) * 0.175, tm + Math.sin(ra) * 0.175];
    bar(P, [rp, [(rp[0] + s0[0]) / 2, (rp[1] + s0[1]) / 2 + up * 0.012], s0], 0, 0.011, col, 4);
    bar(P, [[cs, ct + up * 0.082], [cs, up > 0 ? t1 - 0.012 : t0 + 0.012]], 0, 0.009, col, 4);                  // the tie to the frame
  }
  for (const sg of [-1, 1]) {
    bar(P, [[sg * 0.88, t0 + 0.012], [sg * 0.88, t1 - 0.012]], 0, 0.013, col, 5);
    bar(P, [[sg * 0.175, tm], [sg * 0.88, tm]], 0, 0.008, col, 4);                                            // the middle bar through the gap between the scrolls
    P.grid(10, 6, (i, j) => { const th = i / 10 * Math.PI * 2, ph = j / 6 * Math.PI; return { p: [sg * 0.74 + Math.cos(ph) * 0.075, tm + Math.cos(th) * Math.sin(ph) * 0.03, Math.sin(th) * Math.sin(ph) * 0.012], c: colH }; });   // the leaf on it
  }
  return (_oakPanel = P.geometry());
}
function oakNear(W, gA, gB) {
  const F = oakFrame(), [cx, cz] = F.C, [ax, az] = F.A, L = F.L, H = L / 2, W2 = OAK.W2, f = { x0: cx, y0: 0, z0: cz, ax, az };
  const WD = new MB(f, true), OK = new MB(f, true), SG = new MB(f), ST = new MB(f), MO = new MB(f), CO = new MB(f), NL = new MB(f);
  seed(1859);
  const M = bxMats(), yd = (u) => oakDeckY(u, W, gA, gB);
  const wd = (c, k = 1) => [c[0] / PLANK_MEAN[0] * k, c[1] / PLANK_MEAN[1] * k, c[2] / PLANK_MEAN[2] * k];
  const decks = [lin(0xa98a62), lin(0x9b7d58), lin(0xb59769), lin(0x8d7050), lin(0xa38460)], post = lin(0x8f7556), rail = lin(0x9a7e5a), fasc = lin(0x7d6445);
  // -- the deck: planks across, 16 cm with 8 mm joints, rounded edges, worn lighter at the middle where the feet go, dark in the joints
  const pw = 0.162, nPl = Math.floor((L - 0.05) / pw), hw = W2 - 0.1;
  for (let k = 0; k < nPl; k++) {
    const u0 = -H + 0.025 + k * pw + 0.004, u1 = u0 + pw - 0.008, uc = (u0 + u1) / 2;
    const tone = wd(decks[Math.floor(rnd() * decks.length)], 0.84 + rnd() * 0.3), v0 = rnd() * 0.9, tw = (rnd() - 0.5) * 0.005;
    const prof = [[u0, -0.04], [u0, -0.007], [u0 + 0.008, 0], [u1 - 0.008, 0], [u1, -0.007], [u1, -0.04]], shade = [0.35, 0.7, 1, 1, 0.7, 0.35];
    WD.grid(5, 6, (i, j) => {
      const [u, d] = prof[i], w = -hw + 2 * hw * j / 6;
      const wear = 1 - 0.24 * sstep(0.3, 0.85, fbm(w * 1.3 + k * 0.7, uc * 0.5)), edge = 1 - 0.18 * sstep(hw - 0.5, hw, Math.abs(w));
      return { p: [u, yd(u) + d + tw * w, w], c: mul(tone, shade[i] * wear * edge), t: [(w + W2) / 2.0, v0 + (u - u0) / 2.0 * 0.9] };
    });
    for (const w of [-1.62, -0.55, 0.55, 1.62]) {              // the nails: countersunk heads over the stringers
      if (rnd() < 0.12) continue;
      const nu = uc + (rnd() - 0.5) * 0.02, rr = 0.0075;
      NL.grid(7, 2, (i, j) => { const th = i / 7 * Math.PI * 2, r = [rr, rr * 0.9, 0][j]; return { p: [nu + Math.cos(th) * r, yd(nu) + [-0.001, 0.0016, 0.0022][j] + tw * w, w + Math.sin(th) * r], c: [0.05, 0.045, 0.04] }; });
    }
  }
  { const us = steps(-H, H, 60); SG.grid(us.length - 1, 1, (i, j) => ({ p: [us[i], yd(us[i]) - 0.045, j ? W2 - 0.1 : -(W2 - 0.1)], c: [0.012, 0.011, 0.01] })); }   // the dark bed under the joints
  // -- the fascias: oak boards 3.3 m long with butt joints, a bead along the lower edge
  const FP = [[[0.012, -0.055], [0.012, 0]], [[0.012, 0], [-0.31, 0]], [[-0.31, 0], [-0.318, 0.012], [-0.332, 0.02], [-0.346, 0.012], [-0.354, 0]], [[-0.354, 0], [-0.354, -0.055]], [[-0.354, -0.055], [0.012, -0.055]]];
  for (const mir of [false, true]) for (let a = -H; a < H - 1e-6;) {
    const b = Math.min(H, a + 3.1 + rnd() * 0.6), path = upPath(steps(a + 0.003, b - 0.003, Math.max(2, Math.ceil((b - a) / 0.5))), yd);
    sweep(OK, path, W2, FP, wd(fasc, 0.85 + rnd() * 0.3), mir);
    a = b;
  }
  // -- the steel: two girders cambered with the deck (flanges and web), cross beams every 1.6 m with their bolts
  const steel = lin(0x3a3c3a), rust = lin(0x5a3c2a), gp = upPath(steps(-H, H, 40), (u) => yd(u) - 0.05);
  const GP = [[[-0.01, -0.09], [-0.01, 0.09]], [[-0.03, -0.09], [-0.03, 0.09]], [[-0.01, -0.09], [-0.03, -0.09]], [[-0.01, 0.09], [-0.03, 0.09]], [[-0.03, -0.006], [-0.37, -0.006]], [[-0.03, 0.006], [-0.37, 0.006]],
    [[-0.37, -0.09], [-0.37, 0.09]], [[-0.39, -0.09], [-0.39, 0.09]], [[-0.37, -0.09], [-0.39, -0.09]], [[-0.37, 0.09], [-0.39, 0.09]]];
  for (const mir of [false, true]) sweep(SG, gp, W2 - 0.4, GP, (i, j) => mix3(steel, rust, 0.35 * fbm(j * 0.4, i + 3)), mir);
  for (let u = -H + 0.8; u < H - 0.5; u += 1.6) rbox(SG, u, yd(u) - 0.3, 0, 0.05, 0.095, W2 - 0.45, 0.008, steel, { step: 0.5, ao0: 0.8 });
  // -- the posts, the rails
  const nP = 10;
  const TR = [[[0, -0.075], [0, 0.075]], [[0, -0.075], [0.045, -0.075]], [[0, 0.075], [0.045, 0.075]], [[0.045, -0.075], [0.062, -0.06], [0.075, -0.035], [0.08, 0], [0.075, 0.035], [0.062, 0.06], [0.045, 0.075]]];
  const BR = [[[0, -0.05], [0, 0.05]], [[0, -0.05], [0.07, -0.05]], [[0, 0.05], [0.07, 0.05]], [[0.07, -0.05], [0.07, 0.05]]];
  const pan = [];
  for (const sd of [-1, 1]) {
    const w = sd * (W2 - 0.12), pt = upPath(steps(-H + 0.05, H - 0.05, 56), (u) => yd(u) + 1.0), pb = upPath(steps(-H + 0.05, H - 0.05, 40), (u) => yd(u) + 0.12);
    sweep(OK, pt, w * sd, TR, wd(rail, 0.9), sd < 0);
    sweep(OK, pb, w * sd, BR, wd(rail, 0.85), sd < 0);
    for (let i = 0; i <= nP; i++) {
      const u = -H + 0.2 + (L - 0.4) * i / nP, y = yd(u), tn = wd(post, 0.88 + rnd() * 0.24), tl = wd(rail, 1.0);
      rbox(OK, u, y + 0.4, w, 0.1, 0.7, 0.1, 0.012, tn, { grain: 1, step: 0.4, ao0: 0.85, rough: 0.003 });
      rbox(OK, u, y + 0.07, w, 0.14, 0.07, 0.14, 0.012, tn, { grain: 1, step: 0.3, ao0: 0.85 });
      rbox(OK, u, y + 0.98, w, 0.118, 0.02, 0.118, 0.008, tl, { grain: 1, step: 0.3, ao0: 0.85 });
      rbox(OK, u, y + 1.135, w, 0.15, 0.035, 0.15, 0.01, tl, { grain: 1, step: 0.3, ao0: 0.85 });
      lathe(OK, u, y + 1.17, w, [[0.205, 0], [0.18, 0.014], [0.125, 0.05], [0.064, 0.09], [0.0, 0.115]], 4, tl, null, Math.PI / 4);
      lathe(OK, u, y + 1.275, w, [[0.0, 0], [0.034, 0.002], [0.026, 0.012], [0.024, 0.024], [0.05, 0.04], [0.058, 0.064], [0.046, 0.09], [0.018, 0.106], [0.0, 0.112]], 10, tl);
      if (i < nP) { const u2 = -H + 0.2 + (L - 0.4) * (i + 1) / nP, um = (u + u2) / 2, sl = Math.atan((yd(u2) - yd(u)) / (u2 - u)); pan.push([um, yd(um) + 0.2, w, sl, sd]); }
    }
  }
  // -- the abutments: coursed rubble, the water face and the sides, a coping of dressed slabs
  const wet = weather(W), rough = { joint: 0.028, depth: 0.045, rough: 0.026, dome: 0.022, rim: 0.04, tilt: 0.03, freq: 5.0, weather: wet, cols: SCH, hmin: 0.22, hmax: 0.44, lmin: 0.34, lmax: 0.95 };
  for (const sg of [-1, 1]) {
    const ua = sg > 0 ? H - 1.4 : -(H + 0.2), ub = sg > 0 ? H + 0.2 : -(H - 1.4), bot = W - 1.0;
    for (const sd of [-1, 1]) {
      const side = (s, t, z) => [s, t, sd * (W2 + 0.4 + z)];
      wall(ST, side, ua, ub, () => bot, (u) => yd(Math.max(-H, Math.min(H, u))) - 0.02, rough);
      backing(MO, side, ua, ub, () => bot, (u) => yd(Math.max(-H, Math.min(H, u))) - 0.02, MORTAR, 12);
    }
    const end = (s, t, z) => [sg * (H - 1.4) - sg * z, t, s];
    wall(ST, end, -(W2 + 0.4), W2 + 0.4, () => bot, () => yd(sg * (H - 1.4)) - 0.02, rough);
    backing(MO, end, -(W2 + 0.4), W2 + 0.4, () => bot, () => yd(sg * (H - 1.4)) - 0.02, MORTAR, 6);
    for (const sd of [-1, 1]) for (let u = ua + 0.04; u < ub - 0.2;) {
      const len = 0.7 + rnd() * 0.35, u1 = Math.min(ub, u + len), um = (u + u1) / 2;
      rbox(CO, um, yd(Math.max(-H, Math.min(H, um))) + 0.03, sd * (W2 + 0.3), (u1 - u) / 2 - 0.006, 0.05, 0.28, 0.02, mul(VOU[Math.floor(rnd() * 4)], 0.95), { rough: 0.008, step: 0.25, ao0: 0.75 });
      u = u1 + 0.01;
    }
    rbox(CO, sg * (H - 1.4), yd(sg * (H - 1.4)) + 0.03, 0, 0.14, 0.05, W2 + 0.4, 0.02, VOU[1], { rough: 0.006, step: 0.3, ao0: 0.75 });
  }
  const grp = new THREE.Group(); grp.name = 'cpb33:oak:near';
  for (const [b, m, nm, cast] of [[WD, M.wood, 'planks', true], [OK, M.wood, 'oak', true], [SG, M.iron, 'steel', true], [ST, M.schist, 'abutments', true], [MO, M.mortar, 'mortar', false], [CO, M.dressed, 'coping', true], [NL, M.iron, 'nails', false]]) {
    const mesh = b.mesh(m, 'cpb33:oak:' + nm, cast); if (mesh) grp.add(mesh);
  }
  // the panels: one casting, instanced on both sides, tilted to the hump
  const geo = oakPanelGeo(), im = new THREE.InstancedMesh(geo, M.iron, pan.length), m4 = new THREE.Matrix4(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), qy = new THREE.Quaternion(), qz = new THREE.Quaternion();
  qy.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-az, ax));
  pan.forEach(([u, y, w, sl], i) => { qz.setFromAxisAngle(new THREE.Vector3(0, 0, 1), sl); v.set(cx + ax * u - az * w, y, cz + az * u + ax * w); m4.compose(v, qy.clone().multiply(qz), one); im.setMatrixAt(i, m4); });
  im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.castShadow = false; im.receiveShadow = true; im.name = 'cpb33:oak:panels';
  grp.add(im);
  return grp;
}
export function buildOakBridgeB(group, W, gA, gB) {
  const far = new THREE.Group(); far.name = 'cpb33:oak:far';
  buildOakBridge(far, W, gA, gB);
  const near = oakNear(W, gA, gB), [cx, cz] = oakFrame().C;
  nearFar(group, 'cpb33:oak', [cx, W + 2, cz], near, far, NEAR.oak);
  return [['near', trisOf(near)], ['far', trisOf(far)]];
}

// ---- Balcony Bridge ----------------------------------------------------------------------------------------------------
// Vaux's 1860 stone arch under the West Drive: a half-round arch of rock-faced voussoirs (paler sandstone) in coursed schist
// faces, the barrel laid in courses across the 15 m of the roadway, the parapets with a coping, and at the middle of each
// face the half-round balcony on stepped corbels with its flagged floor, a curved stone bench and a coped parapet. The
// carriageway (asphalt, granite curbs) and the flagged walks are laid here (LAND's water cut takes the drive's sections off
// the neck); the deck levels are the CP32 part's (balcBuild).
// a surface of revolution about a vertical axis at (cu, cw) opening to side sd: prof [[dr, dy]..] from radius R0 at height y0,
// th from 0 to PI (the half-round), one smooth patch
function arcSweep(B, cu, cw, sd, R0, y0, prof, n, col) {
  B.grid(n, prof.length - 1, (i, j) => { const th = i / n * Math.PI, r = R0 + prof[j][0]; return { p: [cu + Math.cos(th) * r, y0 + prof[j][1], cw + sd * Math.sin(th) * r], c: typeof col === 'function' ? col(i, j) : col }; });
}
function balcNear(W, yA, yB) {
  const Bc = BALC, [cx, cz] = Bc.C, [ax, az] = Bc.A, f = { x0: cx, y0: 0, z0: cz, ax, az };
  const SC = new MB(f), VS = new MB(f), SO = new MB(f), MO = new MB(f), CO = new MB(f), PV = new MB(f), RD = new MB(f), BN = new MB(f);
  seed(1860);
  const M = bxMats(), HU = Bc.HU, HW = Bc.HW, R = Bc.R, yd = (u) => yA + (yB - yA) * (u + HU) / (2 * HU), yS = W + 1.1, ring = 0.7, RO = R + ring, PH = 1.05;
  const wet = weather(W), rough = { joint: 0.028, depth: 0.045, rough: 0.026, dome: 0.022, rim: 0.04, tilt: 0.03, freq: 5.0, weather: wet, cols: SCH, hmin: 0.22, hmax: 0.46, lmin: 0.34, lmax: 0.98 };
  const SAND = [lin(0xa89c86), lin(0x9d917b), lin(0xb2a68f), lin(0x968a75)], BLY = 1.0;
  const bay = 2.1, rb = 2.1, yb = (u) => yd(u);
  const lowF = (u) => (Math.abs(u) < RO ? Math.max(W - 0.8, yS + Math.sqrt(Math.max(0, RO * RO - u * u))) : W - 0.8);
  const topF = (u) => yd(u) + (Math.abs(u) >= bay ? PH : -0.03);
  for (const sd of [-1, 1]) {
    const face = (s, t, z) => [s, t, sd * (HW + z)];
    wall(SC, face, -HU, HU, lowF, topF, { ...rough, res: 0.85 });
    backing(MO, face, -HU, HU, lowF, topF, MORTAR, 90);
    for (const [a0, a1] of [[-RO, -R], [R, RO]]) {                                // the haunches between the springing and the water
      wall(SC, face, a0, a1, () => W - 0.8, () => yS, { ...rough, hmin: 0.22, hmax: 0.4, lmin: 0.2, lmax: 0.5 });
      backing(MO, face, a0, a1, () => W - 0.8, () => yS, MORTAR, 4);
    }
    // the parapet's inner face (toward the roadway) and its coping slabs
    const inner = (s, t, z) => [s, t, sd * (HW - 0.45 - z)];
    for (const [a0, a1] of [[-HU, -bay], [bay, HU]]) {
      wall(SC, inner, a0, a1, (u) => yd(u) + 0.15, (u) => yd(u) + PH, { ...rough, depth: 0.035, rough: 0.018, hmin: 0.2, hmax: 0.36 });
      backing(MO, inner, a0, a1, (u) => yd(u) + 0.15, (u) => yd(u) + PH, MORTAR, 20);
      for (let u = a0 + 0.02; u < a1 - 0.1;) {
        const len = 0.8 + rnd() * 0.45, u1 = Math.min(a1 - 0.02, u + len), um = (u + u1) / 2, sl = (yd(u1) - yd(u)) / Math.max(0.05, u1 - u);
        rbox(CO, um, yd(um) + PH + 0.07, sd * (HW - 0.2), (u1 - u) / 2 - 0.006, 0.07, 0.31, 0.026, mul(SAND[Math.floor(rnd() * 4)], 0.95), { pitch: Math.atan(sl), rough: 0.01, step: 0.25, ao0: 0.72,
          colAt: (c, X, k) => { const up = X[1] > 0.04 ? fbm(X[0] * 4 + um, X[2] * 4 + sd) : 0; return mix3(mul(c, k), [c[0] * 0.55, c[1] * 0.68, c[2] * 0.42], sstep(0.55, 0.75, up) * 0.5); } });
        u = u1 + 0.012;
      }
    }
    // the ring of voussoirs
    const nV = 19, sv = Math.PI * R / nV;
    const vring = (s, t, z) => { const th = s / R; return [Math.cos(th) * (R + t), yS + Math.sin(th) * (R + t), sd * (HW + z)]; };
    const vo = { ...rough, depth: 0.085, rough: 0.032, dome: 0.03, rim: 0.035, joint: 0.022 };
    for (let k = 0; k < nV; k++) if (k !== (nV - 1) / 2) stone(VS, vring, k * sv + 0.011, (k + 1) * sv - 0.011, 0.012, ring - 0.012, { ...vo, col: SAND[Math.floor(rnd() * 4)] });
    stone(VS, vring, ((nV - 1) / 2) * sv + 0.011, ((nV + 1) / 2) * sv - 0.011, 0.012, ring + 0.07, { ...vo, depth: 0.11, col: SAND[2] });
    backing(MO, vring, 0, Math.PI * R, () => 0, () => ring, MORTAR, 50);
    // the balcony on this face
    const cw = sd * HW, y0 = yd(0), fl = y0 + 0.15;
    // its floor: three rings of flags
    const bands = [0, 0.7, 1.4, 2.1];
    for (let b = 0; b < 3; b++) {
      const r0 = bands[b], r1 = bands[b + 1], rm = (r0 + r1) / 2, n = Math.max(2, Math.round(Math.PI * rm / 0.85));
      for (let k = 0; k < n; k++) {
        const polar = (s, t, z) => { const th = s / rm; return [Math.cos(th) * t, fl + z, cw + sd * Math.sin(th) * t]; };
        stone(PV, polar, k * Math.PI * rm / n + 0.006, (k + 1) * Math.PI * rm / n - 0.006, r0 + 0.006, r1 - 0.006, { depth: 0.012, rough: 0.006, dome: 0.004, rim: 0.012, tilt: 0.004, freq: 4, ao0: 0.6, col: mul(SAND[Math.floor(rnd() * 4)], 0.8), weather: wet });
      }
    }
    // the curved parapet wall: stones in courses round the half-circle, from the corbels up to the coping
    const arcW = (s, t, z) => { const th = s / rb; return [Math.cos(th) * (rb + z), t, cw + sd * Math.sin(th) * (rb + z)]; };
    wall(SC, arcW, 0.0, Math.PI * rb, () => y0 - 0.9, () => fl + 0.95, { ...rough, hmin: 0.22, hmax: 0.4, lmin: 0.3, lmax: 0.8 });
    backing(MO, arcW, 0.0, Math.PI * rb, () => y0 - 0.9, () => fl + 0.95, MORTAR, 56);
    const ri = rb - 0.45, arcI = (s, t, z) => { const th = s / ri; return [Math.cos(th) * (ri - z), t, cw + sd * Math.sin(th) * (ri - z)]; };
    wall(SC, arcI, 0.0, Math.PI * ri, () => fl + 0.4, () => fl + 0.95, { ...rough, depth: 0.035, rough: 0.018, hmin: 0.2, hmax: 0.3, lmin: 0.3, lmax: 0.7 });
    // the corbelling under the bay: courses on a cone drawing in from the parapet's radius to 0.75 m over 1.5 m, closed below by a slab
    {
      const yc0 = y0 - 0.9, yc1 = y0 - 2.4, cone = (q, t, z) => { const th = q / rb, f = Math.min(1, Math.max(0, (yc0 - t) / (yc0 - yc1))), r = rb - (rb - 0.75) * f * f * (3 - 2 * f) + z; return [Math.cos(th) * r, t, cw + sd * Math.sin(th) * r]; };
      wall(SC, cone, 0.0, Math.PI * rb, () => yc1, () => yc0 + 0.02, { ...rough, hmin: 0.26, hmax: 0.32, lmin: 0.45, lmax: 0.9, res: 0.6 });
      backing(MO, cone, 0.0, Math.PI * rb, () => yc1, () => yc0, MORTAR, 40, 0, 6);
      SO.grid(20, 2, (i, j) => { const th = i / 20 * Math.PI, r = [0, 0.4, 0.8][j]; return { p: [Math.cos(th) * r, yc1 + 0.02 - 0.0 * j, cw + sd * Math.sin(th) * r], c: mul(SOFF[1], 0.8) }; });
    }
    // the coping all round (a swept moulding), the bench (a curved slab on its base), the sill
    arcSweep(CO, 0, cw, sd, rb, fl + 0.95, [[-0.5, 0], [-0.5, 0.04], [-0.47, 0.1], [-0.4, 0.13], [-0.3, 0.15], [0.0, 0.15], [0.05, 0.12], [0.06, 0.08], [0.06, 0.0]], 56, mul(SAND[1], 0.95));
    arcSweep(CO, 0, cw, sd, rb, fl + 0.95, [[0.06, 0.0], [-0.5, 0]], 56, mul(SAND[1], 0.5));
    arcSweep(BN, 0, cw, sd, rb, fl, [[-0.95, 0.0], [-0.95, 0.4], [-0.93, 0.44], [-0.9, 0.45], [-0.45, 0.45]], 56, mul(SAND[2], 0.9));
  }
  // the barrel: courses along the arch, the stones across the roadway's width
  const soff = (s, t, z) => { const th = t / R; return [Math.cos(th) * (R - z), yS + Math.sin(th) * (R - z), s]; };
  wall(SO, soff, -HW + 0.02, HW - 0.02, () => 0, () => Math.PI * R, { ...rough, depth: 0.04, rough: 0.02, cols: SOFF, hmin: 0.3, hmax: 0.44, lmin: 0.6, lmax: 1.2, weather: weather(W, 1.4, { lichen: 0.25, streak: 0 }), res: 0.6 });
  backing(MO, soff, -HW - 0.03, HW + 0.03, () => 0, () => Math.PI * R, mul(MORTAR, 0.7), 8, 0, 40);
  for (const sg of [-1, 1]) {
    const ab = (s, t, z) => [sg * (R - z), t, s];
    wall(SO, ab, -HW + 0.02, HW - 0.02, () => W - 0.8, () => yS, { ...rough, cols: SOFF, hmin: 0.26, hmax: 0.4, lmin: 0.5, lmax: 1.1, res: 0.7 });
    backing(MO, ab, -HW - 0.03, HW + 0.03, () => W - 0.8, () => yS, mul(MORTAR, 0.7), 6);
  }
  // the roadway: asphalt crowned and worn, granite curbs, flagged walks
  const asph = lin(0x4d4c4a), us = steps(-HU, HU, Math.ceil(2 * HU / 0.5));
  PV.grid(us.length - 1, 12, (i, j) => {
    const u = us[i], w = -5.2 + 10.4 * j / 12, n = fbm(u * 0.8 + 3, w * 0.8), n2 = fbm(u * 6, w * 6);
    return { p: [u, yd(u) + 0.03 * (1 - (w / 5.2) ** 2) + 0.004 * (n2 - 0.5), w], c: mul(asph, 0.78 + 0.34 * n + 0.1 * (n2 - 0.5)) };
  });
  for (const sd of [-1, 1]) {
    for (let u = -HU; u < HU - 0.1;) {
      const len = 1.1 + rnd() * 0.5, u1 = Math.min(HU, u + len), um = (u + u1) / 2, sl = (yd(u1) - yd(u)) / (u1 - u);
      rbox(CO, um, yd(um) + 0.07, sd * 5.3, (u1 - u) / 2 - 0.006, 0.075, 0.1, 0.018, lin(0x9a968c), { pitch: Math.atan(sl), rough: 0.006, step: 0.3, ao0: 0.75 });
      u = u1 + 0.01;
    }
    for (const [w0s, w1s, ua, ub] of [[5.42, 6.25, -HU, HU], [6.25, 7.08, -HU, -bay], [6.25, 7.08, bay, HU], [6.25, HW + 0.03, -bay, bay]]) {
      for (let u = ua; u < ub - 0.05;) {
        const len = 0.8 + rnd() * 0.6, u1 = Math.min(ub, u + len);
        const flag = (s, t, z) => [s, yd(s) + 0.15 + z, sd * t];
        stone(PV, flag, u + 0.006, u1 - 0.006, w0s + 0.006, w1s - 0.006, { depth: 0.014, rough: 0.007, dome: 0.004, rim: 0.014, tilt: 0.004, freq: 4, ao0: 0.6, col: mul(lin(0x8f8b84), 0.85 + rnd() * 0.3), weather: wet });
        u = u1;
      }
    }
  }
  // the roadway ends: the compiled asphalt, curbs and walks take it up at the ends; the face wall's ends are closed by the bank
  const grp = new THREE.Group(); grp.name = 'cpb33:balcony:near';
  for (const [b, m, nm, cast] of [[SC, M.schist, 'schist', true], [VS, M.dressed, 'voussoirs', true], [SO, M.schist, 'barrel', true], [MO, M.mortar, 'mortar', false], [CO, M.dressed, 'coping', true], [BN, M.dressed, 'bench', true], [PV, M.matte, 'roadway', false]]) {
    const mesh = b.mesh(m, 'cpb33:balcony:' + nm, cast); if (mesh) grp.add(mesh);
  }
  return grp;
}
export function buildBalconyB(group, W, yA, yB) {
  const far = new THREE.Group(); far.name = 'cpb33:balcony:far';
  buildBalcony(far, W, yA, yB);
  const near = balcNear(W, yA, yB), [cx, cz] = BALC.C;
  nearFar(group, 'cpb33:balcony', [cx, (yA + yB) / 2, cz], near, far, NEAR.balcony);
  return [['near', trisOf(near)], ['far', trisOf(far)]];
}

// ---- the stone arches --------------------------------------------------------------------------------------------------
// Greyshot, Dalehead, Willowdell, Denesmouth, Green Gap, Springbanks, Glen Span, Winterdale, Eaglevale, Trefoil, Huddlestone
// and the others (cpLandmarks.js ARCHES: the frame of the upper way, its outline u0..u1 x w0..w1): on each face, coursed
// rubble from the ground (sampled along the face) to the parapet, the ring of voussoirs round the opening, the barrel laid
// in courses, the jambs, the parapets' inner faces and their coping. The CP32 buildArch stays as the far level.
const BRK = [lin(0x8a4a3a), lin(0x7c4132), lin(0x96553f), lin(0x70392c), lin(0x8e5240)];
function archNear(A, deckAt, groundAt) {
  const [, name, mat, cx, cz, ax, az, u0, u1, w0, w1] = A, f = { x0: cx, y0: 0, z0: cz, ax, az };
  const P = (u, w) => [cx + ax * u - az * w, cz + az * u + ax * w];
  const dk0 = (u) => { const [x, z] = P(u, 0); return deckAt(x, z); };
  const yMid = dk0(0), g0 = (() => { const [x, z] = P(0, 0); return groundAt(x, z); })();
  if (yMid === null || yMid - g0 < 2.0) return null;
  const SC = new MB(f), VS = new MB(f), SO = new MB(f), MO = new MB(f), CO = new MB(f);
  seed(Math.round(Math.abs(cx * 7 + cz * 13)) + 11);
  const span = Math.max(3.5, Math.min(5.5, (u1 - u0) / 3)), r = span / 2, Hh = yMid - g0, yS = g0 + Math.max(0.6, Hh - r - 1.0), ring = 0.6, RO = r + ring, PH = 0.9;
  const NS = Math.max(6, Math.ceil((u1 - u0) / 0.75)), us = steps(u0, u1, NS);
  // the deck along the way (nearest known where the relief does not reach), and whether it stands over the ground
  const dkv = us.map((u) => dk0(u)); let last = yMid; for (let i = 0; i < dkv.length; i++) { if (dkv[i] === null) dkv[i] = last; else last = dkv[i]; }
  const lerpA = (arr, u) => { const x = (u - u0) / (u1 - u0) * NS, i = Math.max(0, Math.min(NS - 1, Math.floor(x))), t = Math.max(0, Math.min(1, x - i)); return arr[i] * (1 - t) + arr[i + 1] * t; };
  const dk = (u) => lerpA(dkv, u);
  const brick = mat === 'brick', cols = brick ? BRK : SCH, vcols = brick ? VOU : VOU;
  const rough = { joint: 0.028, depth: 0.045, rough: 0.026, dome: 0.022, rim: 0.04, tilt: 0.03, freq: 5.0, weather: weather(g0 - 3, 1, { lichen: 0.9, streak: 1 }), cols, hmin: brick ? 0.16 : 0.22, hmax: brick ? 0.3 : 0.46, lmin: brick ? 0.34 : 0.34, lmax: brick ? 0.8 : 0.98, res: 0.85 };
  for (const wf of [w0, w1]) {
    const sg = wf === w0 ? -1 : 1, face = (s, t, z) => [s, t, wf + sg * z];
    const gv = us.map((u) => { const [x, z] = P(u, wf); return groundAt(x, z); }), gF = (u) => lerpA(gv, u);
    const ok = (u) => dk(u) - gF(u) > 0.5;
    const low = (u) => (Math.abs(u) < RO ? Math.max(gF(u) - 0.4, yS + Math.sqrt(Math.max(0, RO * RO - u * u))) : gF(u) - 0.4);
    const top = (u) => (ok(u) ? dk(u) + PH : low(u));
    wall(SC, face, u0, u1, low, top, rough);
    backing(MO, face, u0, u1, low, top, MORTAR, NS * 2);
    // the ring of voussoirs, the keystone at the crown
    const nV = Math.max(9, 2 * Math.round(Math.PI * r / 0.58 / 2) + 1), sv = Math.PI * r / nV, kc = (nV - 1) / 2;
    const vring = (s, t, z) => { const th = s / r; return [Math.cos(th) * (r + t), yS + Math.sin(th) * (r + t), wf + sg * z]; };
    const vo = { ...rough, depth: 0.08, rough: 0.03, dome: 0.028, rim: 0.034, joint: 0.022, res: 1 };
    for (let k = 0; k < nV; k++) if (k !== kc) stone(VS, vring, k * sv + 0.011, (k + 1) * sv - 0.011, 0.012, ring - 0.012, { ...vo, col: vcols[Math.floor(rnd() * vcols.length)] });
    stone(VS, vring, kc * sv + 0.011, (kc + 1) * sv - 0.011, 0.012, ring + 0.06, { ...vo, depth: 0.1, col: vcols[2] });
    backing(MO, vring, 0, Math.PI * r, () => 0, () => ring, MORTAR, 40);
    // the parapet's inner face and its coping slabs
    const inner = (s, t, z) => [s, t, wf - sg * (0.45 + z)], lo2 = (u) => (ok(u) ? dk(u) - 0.03 : top(u)), hi2 = (u) => top(u);
    wall(SC, inner, u0, u1, lo2, hi2, { ...rough, depth: 0.035, rough: 0.018, hmin: 0.2, hmax: 0.34, res: 0.6 });
    for (let u = u0 + 0.05; u < u1 - 0.1;) {
      const len = 0.8 + rnd() * 0.45, ue = Math.min(u1 - 0.02, u + len), um = (u + ue) / 2;
      if (!ok(u) || !ok(ue)) { u = ue + 0.01; continue; }
      const sl = (dk(ue) - dk(u)) / Math.max(0.05, ue - u);
      rbox(CO, um, dk(um) + PH + 0.07, wf - sg * 0.2, (ue - u) / 2 - 0.006, 0.07, 0.31, 0.026, mul(VOU[Math.floor(rnd() * 4)], 0.95), { pitch: Math.atan(sl), rough: 0.01, step: 0.3, ao0: 0.72,
        colAt: (c, X, k) => { const up = X[1] > 0.04 ? fbm(X[0] * 4 + um, X[2] * 4) : 0; return mix3(mul(c, k), [c[0] * 0.55, c[1] * 0.68, c[2] * 0.42], sstep(0.55, 0.75, up) * 0.5); } });
      u = ue + 0.012;
    }
  }
  // the barrel across the width, the jambs
  const soff = (s, t, z) => { const th = t / r; return [Math.cos(th) * (r - z), yS + Math.sin(th) * (r - z), s]; };
  wall(SO, soff, w0 + 0.02, w1 - 0.02, () => 0, () => Math.PI * r, { ...rough, depth: 0.04, rough: 0.02, cols: SOFF, hmin: 0.3, hmax: 0.44, lmin: 0.6, lmax: 1.2, res: 0.45 });
  backing(MO, soff, w0 - 0.03, w1 + 0.03, () => 0, () => Math.PI * r, mul(MORTAR, 0.7), 8, 0, 32);
  for (const s of [-1, 1]) {
    const ab = (q, t, z) => [s * (r - z), t, q];
    wall(SO, ab, w0 + 0.02, w1 - 0.02, () => g0 - 0.4, () => yS, { ...rough, cols: SOFF, hmin: 0.26, hmax: 0.4, lmin: 0.5, lmax: 1.1, res: 0.45 });
    backing(MO, ab, w0 - 0.03, w1 + 0.03, () => g0 - 0.4, () => yS, mul(MORTAR, 0.7), 6);
  }
  const grp = new THREE.Group(); grp.name = 'cpb33:arch:near:' + (name || A[0]);
  const M = bxMats();
  for (const [b, m, nm, cast] of [[SC, M.schist, 'walls', true], [VS, M.dressed, 'voussoirs', true], [SO, M.schist, 'barrel', false], [MO, M.mortar, 'mortar', false], [CO, M.dressed, 'coping', true]]) {
    const mesh = b.mesh(m, 'cpb33:arch:' + nm, cast); if (mesh) grp.add(mesh);
  }
  return { grp, c: [cx, (yMid + g0) / 2, cz] };
}
// the CP32 level (its three meshes) and the modelled one in a THREE.LOD; returns the near level's triangles, 0 when the arch is not built
export function buildArchB(group, A, deckAt, groundAt) {
  const [, name, , cx, cz, ax, az] = A, M = lmMats();
  const B = new LBin().frame(cx, 0, cz, ax, az), SN = new LBin().frame(cx, 0, cz, ax, az), DK = new LBin().frame(cx, 0, cz, ax, az);
  const t = buildArch(B, SN, DK, A, deckAt, groundAt);
  if (!t) return 0;
  const far = new THREE.Group(); far.name = 'cpb33:arch:far';
  for (const [b, m, nm] of [[B, M.schist, 'walls'], [SN, M.stone, 'dressings'], [DK, M.rock, 'soffit']]) { const mesh = b.mesh(m, 'cp32m:arch:' + nm); if (mesh) far.add(mesh); }
  let near = null;
  try { near = archNear(A, deckAt, groundAt); } catch (e) { console.warn('[cpb33] arch near', name || A[0], e); }
  if (!near) { group.add(far); return t; }
  nearFar(group, 'cpb33:arch:' + (name || A[0]), near.c, near.grp, far, NEAR.arch);
  return trisOf(near.grp) + t;
}
