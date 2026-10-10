// AR33 VIADUCT: the IRT Broadway line's Manhattan Valley Viaduct (1904) over W 125th Street (docs/notes/ar33-viaducts.md).
// Frame: u along the line from the 125th St crossing C (NNE +), l across from the centre track (ESE +), y world.
//   archBuild: the three two-hinged parabolic braced ribs over 125th St (168 ft 6 in between the pins, 14 panels,
//     chords 6 ft apart), their shoes and pedestals, the rib webs (laced posts and double-angle diagonals, gussets at
//     every joint), the lateral bracing between the ribs, the spandrel posts from each joint to the floor system and their
//     bracing, the floor beams and stringers over the arch.
import { V, UP, Geo, RIV, path, ibeam, plateGirder, laced, latticeStrut, gusset, angle, castBase, frustum, girderSpikes } from './vkKit.js';
import { steelMat, otherMat } from './vkMats.js';
import { MVV_BENTS } from './vkData.js';

const { add, sub, mul, norm, cross, lerp } = V;
export const MV = {
  C: [1088.46, -3623.33], A: [0.48469, -0.87468], LC: -0.35,
  u0: -257.8, u1: 404.3,               // the OSM bridge ways' ends (663 m)
  RAIL: 19.52,                         // top of rail (elevated.json)
  tracks: [-3.68, 0, 3.75],            // track centres from the centre track (elevated.json)
  span: 51.36, ribs: [-7.47, 0, 7.47], chordC: 1.45, chordD: 0.4, panels: 14,
  plat: { u0: -98.8, u1: 58.0, l0: 5.15, l1: 7.75 },
};
const NRM = [-MV.A[1], MV.A[0]];     // +l (0.87468, 0.48469)
export const DA = [MV.A[0], 0, MV.A[1]], DN = [NRM[0], 0, NRM[1]];
export const P = (u, l, y) => [MV.C[0] + MV.A[0] * u + NRM[0] * (l + MV.LC), y, MV.C[1] + MV.A[1] * u + NRM[1] * (l + MV.LC)];
export const toUL = (x, z) => { const dx = x - MV.C[0], dz = z - MV.C[1]; return [dx * MV.A[0] + dz * MV.A[1], dx * NRM[0] + dz * NRM[1] - MV.LC]; };
// deck levels
export const LV = (() => {
  const TIE_T = MV.RAIL - 0.152, TIE_B = TIE_T - 0.178;
  const STR_T = TIE_B, STR_D = 0.9, FB_D = 1.35;
  return { TIE_T, TIE_B, STR_T, STR_B: STR_T - STR_D, STR_D, FB_T: STR_T, FB_D, FB_B: STR_T - FB_D };
})();

let _M = null;
export function mvvMats() {
  if (_M) return _M;
  _M = {
    // the IRT's dark green, a slightly bluer repaint in patches
    steel: steelMat('irt', { paint: 0x294a4c, paint2: 0x27464a, rust: 0x6c4632, rustD: 0x45301f, rustAmt: 0.3, rough: 0.7, metal: 0.04, spec: 0.32, amb: 0.7, guano: 0.3 }),
    steelS: steelMat('irtS', { paint: 0x294a4c, paint2: 0x27464a, rust: 0x6c4632, rustD: 0x45301f, rustAmt: 0.3, rough: 0.7, metal: 0.04, spec: 0.32, amb: 0.7, guano: 0.3, noShadow: true }),
    // the floor system under the deck: the deck and the station overhead hide most of the sky. The round-1 and b4r0-b4r2 readings of the twin (53-83, then 61-68) were raised by a sun
    // glint's bloom from one station window (gone since b4r4: the glass is dull now); without it amb 0.18 / dir 0.4 read
    // 8-11 (b4r4) and amb 0.6 / dir 0.8 16-20 (b4r5): the floor system takes the whole sky and sun again (amb 1)
    steelU: steelMat('irtU', { paint: 0x33485a, paint2: 0x30455a, rust: 0x6c4632, rustD: 0x45301f, rustAmt: 0.35, rough: 0.74, metal: 0.04, amb: 1.0, spec: 0.32, guano: 0.3, dn: 1.2 }),
    steelUS: steelMat('irtUS', { paint: 0x33485a, paint2: 0x30455a, rust: 0x6c4632, rustD: 0x45301f, rustAmt: 0.35, rough: 0.74, metal: 0.04, amb: 1.0, spec: 0.32, guano: 0.3, dn: 1.2, noShadow: true }),
    conc: otherMat('concrete'),
    granite: otherMat('granite'),
    // the arch's shoe pedestals: sooted dark grey stone, splashed and stained
    ped: steelMat('irtPed', { paint: 0x57544e, paint2: 0x4f4c47, rust: 0x5a4a3a, rustD: 0x3a3028, rustAmt: 0.25, rough: 0.9, metal: 0.0, rivets: false, amb: 0.8, spec: 0.3, chalk: 0.12, guano: 0.15 }),
    // the ties and walkway planks, creosoted and sooted, seen from the street through the floor system (dim like it)
    timber: steelMat('irtTie', { paint: 0x342c25, paint2: 0x2e2722, rust: 0x3a2e24, rustD: 0x2a221c, rustAmt: 0.1, rough: 0.9, metal: 0.0, rivets: false, amb: 0.2, spec: 0.3, guano: 0.15 }), rail: otherMat('rail'), railTop: otherMat('railTop'),
  };
  return _M;
}

// ---------------------------------------------------------------- the arch's geometry (shared with the colliders)
export function archGeom(gy) {
  const H = MV.span / 2, yPin = gy + 1.15, D = MV.chordC, CH = MV.chordD;
  const yCrC = LV.FB_B - 0.04 - CH / 2 - D / 2, R = yCrC - yPin;
  const cy = (u) => yPin + R * (1 - (u / H) ** 2);
  const tan = (u) => norm([1, -2 * R * u / (H * H)]);      // (du, dy)
  const nrm = (u) => { const t = tan(u); return [-t[1], t[0]]; };
  // arc length table
  const NS = 2400, us = [], ss = [0];
  for (let i = 0; i <= NS; i++) us.push(-H + (2 * H * i) / NS);
  for (let i = 1; i <= NS; i++) ss.push(ss[i - 1] + Math.hypot(us[i] - us[i - 1], cy(us[i]) - cy(us[i - 1])));
  const Ltot = ss[NS];
  const uAt = (s) => { let lo = 0, hi = NS; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ss[m] < s) lo = m; else hi = m; } const t = (s - ss[lo]) / (ss[hi] - ss[lo] || 1); return us[lo] + (us[hi] - us[lo]) * t; };
  const sJ = [], uJ = [];
  for (let k = 0; k <= MV.panels; k++) { sJ.push((Ltot * k) / MV.panels); uJ.push(uAt((Ltot * k) / MV.panels)); }
  // depth: full between joints 1 and 13, converging on the pins over the end panels
  const s1 = sJ[1], dPin = 0.34;
  const dep = (s) => { const q = Math.min(s, Ltot - s); return q >= s1 ? D : dPin + (D - dPin) * Math.sin((Math.PI / 2) * (q / s1)); };
  // a point on a chord (side +1 top, -1 bottom) at arc length s, rib l, offset `o` along the rib normal
  const chordPt = (s, side, l, o = 0) => { const u = uAt(s), n = nrm(u), d = dep(s) / 2 * side + o; return P(u + n[0] * d, l, cy(u) + n[1] * d); };
  const nW = (s) => { const n = nrm(uAt(s)); return norm(add(mul(DA, n[0]), [0, n[1], 0])); };
  return { H, yPin, R, cy, tan, nrm, Ltot, uAt, sJ, uJ, dep, chordPt, nW, D, CH };
}

// ---------------------------------------------------------------- the arch, the shoes, the spandrels, the floor over it
export function archBuild(group, gy) {
  const M = mvvMats(), g = new Geo().rivZone(gy + 2.8, MV.C[0], MV.C[1], 110), G = archGeom(gy), st = M.steel, ss = M.steelS;
  const { sJ, uJ, Ltot, chordPt, nW, CH } = G;
  // sample the chords every ~0.8 m, finer over the end panels (the heel)
  const S = [];
  for (let s = 0; s < sJ[1]; s += sJ[1] / 8) S.push(s);
  for (let s = sJ[1]; s < sJ[13] - 1e-6; s += (sJ[13] - sJ[1]) / 48) S.push(s);
  for (let s = sJ[13]; s < Ltot - 1e-6; s += sJ[1] / 8) S.push(s);
  S.push(Ltot);
  const bw = 0.5, tf = 0.022;   // H chord: flanges in the rib plane (0.56 x 24 mm) 0.6 m apart, a web between them
  for (const l of MV.ribs) {
    for (const side of [1, -1]) {
      const pts = S.map((s) => chordPt(s, side, l)), ups = S.map((s) => nW(s));
      for (const sx of [-1, 1]) {
        path(g, st, pts, ups, tf, CH, { off: [sx * (bw / 2 - tf / 2), 0], rv: [null, sx > 0 ? RIV.pair(0.085, 0.1) : null, null, sx < 0 ? RIV.pair(0.085, 0.1) : null], len: Ltot, seed: 11 + l });
        // the web's four angles (0.15 x 0.15): legs against the flange and on the web
        for (const sy of [-1, 1]) {
          path(g, st, pts, ups, 0.014, 0.15, { off: [sx * (bw / 2 - tf - 0.007), sy * (0.01 + 0.075)], len: Ltot, caps: false });
          path(g, st, pts, ups, 0.15, 0.014, { off: [sx * (bw / 2 - tf - 0.075), sy * (0.01 + 0.007)], rv: sy > 0 ? [null, null, RIV.mid(0.1), null] : [RIV.mid(0.1), null, null, null], len: Ltot, caps: false });
        }
      }
      path(g, st, pts, ups, bw - 2 * tf, 0.02, { len: Ltot, caps: false });
      // cover plates on the chord's outer flange edges (the extrados / intrados): a batten every panel
      for (let k = 0; k < MV.panels; k++) {
        const sa = sJ[k] + 0.25, sb = sJ[k + 1] - 0.25;
        const q = []; for (let t = 0; t <= 4; t++) q.push(sa + ((sb - sa) * t) / 4);
        path(g, st, q.map((s) => chordPt(s, side, l, side * (CH / 2 + 0.007))), q.map((s) => nW(s)), bw + 0.02, 0.014, { rv: side > 0 ? [null, null, RIV.edges(0.03, 0.1), null] : [RIV.edges(0.03, 0.1), null, null, null], seed: 5 });
      }
    }
    // the heels: both chords close on the pin between two heel plates over the last 1.5 m, riveted all over
    for (const end of [0, 1]) {
      const hl = 1.5, sa = end ? Ltot - hl : 0, sb = end ? Ltot : hl, K = 3;
      for (const sx of [-1, 1]) {
        for (let k = 0; k < K; k++) {
          const s0 = sa + ((sb - sa) * k) / K, s1 = sa + ((sb - sa) * (k + 1)) / K;
          const lo = sx * (bw / 2 + 0.01);
          const A = chordPt(s0, -1, l + lo, -CH * 0.3), B = chordPt(s1, -1, l + lo, -CH * 0.3), C = chordPt(s1, 1, l + lo, CH * 0.3), D = chordPt(s0, 1, l + lo, CH * 0.3);
          if (sx > 0) gusset(g, st, A, B, C, D, 0.02, { seed: 21 }); else gusset(g, st, D, C, B, A, 0.02, { seed: 21 });
        }
      }
      // the pin (8 in) through the heel and the shoe, its nuts
      const u = end ? G.H : -G.H, pc = P(u, l, G.yPin);
      g.cyl(st, P(u, l - 0.62, G.yPin), P(u, l + 0.62, G.yPin), 0.1, 14);
      for (const sx of [-1, 1]) g.cyl(st, P(u, l + sx * 0.62, G.yPin), P(u, l + sx * 0.7, G.yPin), 0.16, 6);
      // the cast shoe: base plate, the seat with its ribs, the anchor bolts
      const yB = gy + 0.75, dir = end ? 1 : -1;
      g.rect(st, P(u - 0.85, l, yB + 0.04), P(u + 0.85, l, yB + 0.04), UP, 1.5, 0.08, { rv: [null, null, RIV.none, null] });
      g.rect(st, P(u - 0.55, l, yB + 0.16), P(u + 0.55, l, yB + 0.16), UP, 1.1, 0.16);
      for (const sx of [-1, -0.33, 0.33, 1]) {
        const lo = sx * 0.5;
        gusset(g, st, P(u - 0.6, l + lo, yB + 0.24), P(u + 0.6, l + lo, yB + 0.24), P(u + 0.18, l + lo, G.yPin + 0.05), P(u - 0.18, l + lo, G.yPin + 0.05), 0.045, { riv: false, seed: 23 });
      }
      for (const [du, dl] of [[-0.7, -0.62], [-0.7, 0.62], [0.7, -0.62], [0.7, 0.62]]) {
        g.cyl(st, P(u + du, l + dl, yB + 0.08), P(u + du, l + dl, yB + 0.2), 0.035, 6);
        g.cyl(st, P(u + du, l + dl, yB + 0.08), P(u + du, l + dl, yB + 0.13), 0.06, 6);
      }
      // the concrete pedestal (a stepped block on the median), sunk into the street
      // (chamfered: the block, a bevel course, the narrower seat under the base plate)
      g.rect(M.ped, P(u + dir * 0.25, l, gy - 0.3), P(u + dir * 0.25, l, gy + 0.06), DA, 2.5, 3.2);
      { const cc = P(u + dir * 0.25, l, 0), c2 = P(u + dir * 0.1, l, 0);
        frustum(g, M.ped, cc, DN, 2.5, 3.2, 1.7, 2.5, gy + 0.06, yB - 0.18);
        frustum(g, M.ped, c2, DN, 1.6, 2.1, 1.5, 2.0, yB - 0.18, yB); }
      // steel bollards in front of the pedestal
      for (const k of [-1, 0, 1]) {
        const bp = P(u + dir * 1.9, l + k * 0.95, gy), bq = [bp[0], gy + 0.95, bp[2]];
        g.cyl(M.rail, bp, bq, 0.075, 10);
        g.cyl(M.rail, [bp[0], gy + 0.9, bp[2]], [bp[0], gy + 0.99, bp[2]], 0.09, 10);
      }
    }
    // the web: laced posts square to the chords, double-angle diagonals, gusset plates on both chords at every
    // joint (the smaller at mid-panel)
    const joints = [];
    for (let k = 1; k < MV.panels; k++) { joints.push([sJ[k], 1, k]); if (k < MV.panels - 1) joints.push([(sJ[k] + sJ[k + 1]) / 2, 0, k]); }
    for (const [s, main, k] of joints) {
      const b0 = chordPt(s, -1, l, CH / 2), t0 = chordPt(s, 1, l, -CH / 2);
      laced(g, st, b0, t0, DN, main ? 0.24 : 0.2, 0.38, { seed: 30 + k, pitch: 0.3 });
      const gl = main ? 0.34 : 0.24, gd = main ? 0.3 : 0.22;
      for (const side of [1, -1]) {
        for (const sx of [-1, 1]) {
          const lo = l + sx * (bw / 2 + 0.008);
          const o1 = -side * 0.03, o2 = -side * (CH / 2 + gd);
          const A = chordPt(s - gl, side, lo, o1), B = chordPt(s + gl, side, lo, o1);
          const C2 = chordPt(s + gl * 0.5, side, lo, o2), D2 = chordPt(s - gl * 0.5, side, lo, o2);
          const quad = side > 0 ? [D2, C2, B, A] : [A, B, C2, D2];
          if (sx > 0) gusset(g, st, ...quad, 0.014, { seed: 40 + k }); else gusset(g, st, ...quad.slice().reverse(), 0.014, { seed: 40 + k });
        }
      }
    }
    for (const [sp, sq] of [[sJ[1] * 0.56, sJ[1]], [Ltot - sJ[1] * 0.56, Ltot - sJ[1]]]) {
      // the end panels between the heel and the first joint: a post where the chords are still apart, a diagonal
      const b0 = chordPt(sp, -1, l, CH / 2), t0 = chordPt(sp, 1, l, -CH / 2);
      if (V.len(sub(t0, b0)) > 0.3) laced(g, st, b0, t0, DN, 0.22, 0.36, { seed: 36, pitch: 0.28 });
      const p0 = chordPt(sp, 1, l, -CH / 2), p1 = chordPt(sq, -1, l, CH / 2), T = norm(sub(p1, p0));
      for (const fu of [-1, 1]) angle(g, st, add(p0, mul(T, 0.2)), sub(p1, mul(T, 0.25)), DN, 0.13, 0.09, 0.012, { fs: 1, fu, off: [-0.065, fu * 0.008], seed: 37 });
    }
    // one diagonal in every bay between two verticals, from the top chord at the outer vertical down to the bottom chord
    // at the inner one, all falling toward the crown on both halves
    { const vs = joints.map((j) => j[0]).sort((a, b) => a - b), half = Ltot / 2;
      for (let i = 0; i + 1 < vs.length; i++) {
        const sa = vs[i], sb = vs[i + 1], south = (sa + sb) / 2 < half;
        const p0 = chordPt(south ? sa : sb, 1, l, -CH / 2), p1 = chordPt(south ? sb : sa, -1, l, CH / 2);
        const T = norm(sub(p1, p0)), p0b = add(p0, mul(T, 0.22)), p1b = sub(p1, mul(T, 0.22));
        for (const fu of [-1, 1]) angle(g, st, p0b, p1b, DN, 0.13, 0.09, 0.012, { fs: 1, fu, off: [-0.065, fu * 0.008], seed: 60 + i });
      }
    }
  }
  // lateral bracing between the ribs: a lattice strut at every joint on both chords, X angles in both chord planes
  for (let b = 0; b + 1 < MV.ribs.length; b++) {
    const la = MV.ribs[b] + 0.32, lb = MV.ribs[b + 1] - 0.32;
    for (const side of [1, -1]) {
      for (let k = 1; k < MV.panels; k++) {
        const s = sJ[k];
        latticeStrut(g, ss, chordPt(s, side, la), chordPt(s, side, lb), nW(s), 0.42, { seed: 70 + k });
      }
      for (let k = 1; k < MV.panels - 1; k++) {
        const sa = sJ[k] + 0.25, sb = sJ[k + 1] - 0.25;
        for (const [x0, x1] of [[la, lb], [lb, la]]) {
          const A = chordPt(sa, side, x0, side * 0.08), B = chordPt(sb, side, x1, side * 0.08);
          angle(g, ss, A, B, nW((sa + sb) / 2), 0.1, 0.1, 0.011, { fs: 1, fu: side > 0 ? 1 : -1, off: [-0.05, 0], seed: 80 + k });
        }
      }
    }
  }
  // spandrel posts: from each joint's top chord to the floor beams (six per half rib; the crown joint bears directly)
  const posts = [];
  for (let k = 1; k < MV.panels; k++) {
    if (k === MV.panels / 2) continue;
    const s = sJ[k], u = uJ[k], n = G.nrm(u), d = G.dep(s) / 2 + CH / 2;
    // the post stands on the top chord's back at the joint
    posts.push({ k, u: u + n[0] * d, y0: G.cy(u) + n[1] * d + 0.02 });
  }
  for (const p of posts) {
    for (const l of MV.ribs) {
      const y0 = p.y0, y1 = LV.FB_B;
      if (y1 - y0 < 0.4) continue;
      laced(g, st, P(p.u, l, y0), P(p.u, l, y1), DN, 0.44, 0.44, { seed: 90 + p.k, pitch: 0.42 });
      // the post's foot plate on the chord and its cap under the floor beam
      g.rect(st, P(p.u, l, y0 - 0.03), P(p.u, l, y0 + 0.03), DA, 0.62, 0.62, { rv: [null, RIV.edges(0.05, 0.1), null, RIV.edges(0.05, 0.1)] });
      g.rect(st, P(p.u, l, y1 - 0.04), P(p.u, l, y1), DA, 0.62, 0.62);
    }
  }
  // spandrel bracing: X angles in the rib planes between neighbouring tall posts; sway frames across the ribs
  posts.sort((a, b) => a.u - b.u);
  for (let i = 0; i + 1 < posts.length; i++) {
    const a = posts[i], b = posts[i + 1];
    if (b.k - a.k !== 1) continue;
    const ya = Math.max(a.y0, b.y0) + 0.35, yb = LV.FB_B - 0.35;
    if (yb - ya < 4.0) continue;
    for (const l of MV.ribs) {
      for (const [p0, p1] of [[[a.u + 0.25, ya], [b.u - 0.25, yb]], [[a.u + 0.25, yb], [b.u - 0.25, ya]]]) {
        angle(g, ss, P(p0[0], l + 0.24, p0[1]), P(p1[0], l + 0.24, p1[1]), DN, 0.09, 0.09, 0.01, { fs: 1, fu: 1, off: [-0.045, 0], seed: 100 + i });
      }
    }
  }
  for (const p of posts) {
    const h = LV.FB_B - p.y0;
    if (h < 2.2) continue;
    for (let b = 0; b + 1 < MV.ribs.length; b++) {
      const la = MV.ribs[b] + 0.25, lb = MV.ribs[b + 1] - 0.25, ya = p.y0 + 0.4, yb = LV.FB_B - 0.3;
      latticeStrut(g, ss, P(p.u, la, yb - 0.25), P(p.u, lb, yb - 0.25), DA, 0.4, { seed: 110 + p.k });
      for (const [l0, l1] of [[la, lb], [lb, la]]) angle(g, ss, P(p.u + 0.24, l0, ya), P(p.u + 0.24, l1, yb - 0.5), DA, 0.09, 0.09, 0.01, { fs: 1, fu: 1, off: [-0.045, 0], seed: 120 + p.k });
    }
  }
  // the floor over the arch: a floor beam on every post line (and over the crown joint), stringers under the rails
  const fbU = [];
  for (let k = 1; k < MV.panels; k++) fbU.push(uJ[k]);
  const lw = 8.3;
  for (const u of fbU) {
    plateGirder(g, M.steelU, P(u, -lw, LV.FB_T - LV.FB_D / 2), P(u, lw, LV.FB_T - LV.FB_D / 2), UP, LV.FB_D, 0.36, { stiff: 1.4, seed: 130 });
    girderSpikes(g, P(u, -lw + 0.3, LV.FB_T - LV.FB_D / 2), P(u, lw - 0.3, LV.FB_T - LV.FB_D / 2), UP, LV.FB_D, 0);
  }
  const allU = [-G.H - 0.4, ...fbU, G.H + 0.4];
  for (let i = 0; i + 1 < allU.length; i++) {
    const ua = allU[i] + 0.2, ub = allU[i + 1] - 0.2;
    for (const t of MV.tracks) for (const sl of [-0.85, 0.85]) {
      plateGirder(g, M.steelU, P(ua, t + sl, LV.STR_T - LV.STR_D / 2), P(ub, t + sl, LV.STR_T - LV.STR_D / 2), UP, LV.STR_D, 0.3, { stiff: 1.6, seed: 140 + i });
    }
    // the outer (platform) stringers over the outer ribs
    // (under the platform's middle, in the shade of its slab and fascia: at 7.9 they read as a sunlit second band)
    for (const sl of [-6.6, 6.6]) plateGirder(g, M.steelU, P(ua, sl, LV.STR_T - 0.55), P(ub, sl, LV.STR_T - 0.55), UP, 1.1, 0.3, { stiff: 1.6, seed: 150 + i });
  }
  return g.flush(group, 'mvvArch');
}

// ---------------------------------------------------------------- the approach viaduct: bents, towers, girders, deck
// Bents from the arch outward: a tower (two bents 30 ft apart, braced both ways) at each skewback, then 60 ft plate
// girder spans to a single bent and a tower in turn ("single-bent and double-bent steel towers spanned by plate
// girders", 46-72 ft spans). Columns (laced, two channels) on granite-faced piers on Broadway's median, 9.55 m
// transverse girders (31 ft 4 in).
export const COLL = 4.6;           // column lines +-l
const ST34M = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('st34') === '0');
export function mvvBents() {
  // placed off the compiled cross streets by client/tools/ar33/vk/plan_bents.mjs (vk/vkData.js)
  if (MVV_BENTS && MVV_BENTS.length) return MVV_BENTS.map((b) => ({ ...b }));
  const H = MV.span / 2, out = [];
  for (const sgn of [-1, 1]) {
    const end = sgn < 0 ? -MV.u0 : MV.u1;
    let d = 1.9, k = 0;
    const put = (dd, tower, half) => { if (dd < end - 6) out.push({ u: sgn * (H + dd), tower, half, sgn }); };
    while (d < end - 6) {
      const tower = k % 2 === 0;
      put(d, tower, 0);
      if (tower) put(d + 9.14, true, 1);
      d += (tower ? 9.14 : 0) + 18.3;
      k++;
    }
  }
  return out.sort((a, b) => a.u - b.u);
}
const inStation = (u) => u > MV.plat.u0 - 1 && u < MV.plat.u1 + 1;

// one bent: columns on piers, the transverse girder, bracing; `tower`: a tower's bent (the longitudinal bracing to its
// partner is drawn by the half-0 bent)
export function bentBuild(g, M, b, gy, partner) {
  const st = M.steel, ss = M.steelS, u = b.u;
  const yTop = LV.STR_T, XD = 1.4, yX = yTop - XD, yPier = gy + 0.9;
  const lw = inStation(u) ? 8.3 : 5.4;
  plateGirder(g, inStation(u) ? M.steelU : st, P(u, -lw, yTop - XD / 2), P(u, lw, yTop - XD / 2), UP, XD, 0.4, { stiff: 1.2, seed: 200 });
  if (Math.abs(u) < 70) girderSpikes(g, P(u, -lw + 0.3, yTop - XD / 2), P(u, lw - 0.3, yTop - XD / 2), UP, XD, 0);
  for (const l of [-COLL, COLL]) {
    // the granite-faced pier and its coping
    g.rect(M.granite, P(u, l, gy - 0.3), P(u, l, yPier - 0.12), DA, 1.35, 1.35);
    g.rect(M.granite, P(u, l, yPier - 0.12), P(u, l, yPier), DA, 1.5, 1.5);
    // the cast-iron base on the pier (plinth, flared casting, beads, bolt heads) round the column's foot
    castBase(g, st, P(u, l, 0), DA, 0.5, 0.42, yPier);
    // the laced column (two 15 in channels), its cap under the girder
    laced(g, st, P(u, l, yPier + 0.05), P(u, l, yX), DN, 0.5, 0.42, { seed: 220 + (l > 0 ? 1 : 0), pitch: 0.46, double: true });
    g.rect(st, P(u, l, yX - 0.06), P(u, l, yX), DA, 0.75, 0.75);
    // a conduit up the outer face with its clamps and a junction box
    if (Math.abs(u) < 150) {
      const sg = Math.sign(l), lc = l + sg * 0.31, uc = u + 0.14;
      g.cyl(M.steelS, P(uc, lc, yPier + 0.05), P(uc, lc, yX - 0.3), 0.032, 6, { caps: false });
      for (let y = yPier + 0.7; y < yX - 0.5; y += 1.5) g.rect(M.steelS, P(uc, lc - sg * 0.025, y), P(uc, lc - sg * 0.025, y + 0.05), DA, 0.05, 0.11, { rv: [] });
      g.rect(M.steelS, P(uc, lc + sg * 0.05, yPier + 1.35), P(uc, lc + sg * 0.05, yPier + 1.75), DA, 0.12, 0.2, { rv: [] });
    }
    // knee brackets under the girder
    for (const sx of [-1, 1]) {
      const lo = l - Math.sign(l) * 0.26;
      const du = u - 0.03 * sx, sg = Math.sign(l);
      gusset(g, st, P(du, lo, yX - 1.4), P(du, lo - sg * 0.65, yX - 0.71), P(du, lo - sg * 1.3, yX - 0.02), P(du, lo, yX - 0.02), 0.012, { seed: 230 });
    }
  }
  // sway bracing in the bent: two storeys of X angles and a lattice strut between them
  const y0 = yPier + 1.2, y1 = yX - 1.6, ym = (y0 + y1) / 2;
  latticeStrut(g, ss, P(u, -COLL + 0.27, ym), P(u, COLL - 0.27, ym), UP, 0.45, { seed: 240 });
  for (const [ya, yb] of [[y0, ym - 0.25], [ym + 0.25, y1]]) {
    for (const [la, lb] of [[-COLL + 0.3, COLL - 0.3], [COLL - 0.3, -COLL + 0.3]]) {
      angle(g, ss, P(u, la, ya), P(u, lb, yb), DA, 0.1, 0.1, 0.011, { fs: 1, fu: 1, off: [-0.05, 0.02], seed: 250 });
    }
  }
  // a tower: the longitudinal bracing to the partner bent on both column lines
  if (partner) {
    const ua = u + 0.3, ub = partner.u - 0.3;
    // AR34 STATIONS: the tower at the station house (bents -36.72 / -27.58) carries the 1931 mezzanine and its passageways
    // through both column lines: its upper storey of X bracing gives way to the passageways' headers (stations/irt125.js)
    const house = ST34M && Math.min(u, partner.u) < -32 && Math.max(u, partner.u) > -32;
    for (const l of [-COLL, COLL]) {
      latticeStrut(g, ss, P(ua, l, ym), P(ub, l, ym), UP, 0.45, { seed: 260 });
      latticeStrut(g, ss, P(ua, l, yX - 0.5), P(ub, l, yX - 0.5), UP, 0.5, { seed: 261 });
      for (const [ya, yb] of house ? [[y0, ym - 0.25]] : [[y0, ym - 0.25], [ym + 0.25, yX - 0.8]]) {
        for (const [p0, p1] of [[ua, ub], [ub, ua]]) angle(g, ss, P(p0, l + 0.23, ya), P(p1, l + 0.23, yb), DN, 0.1, 0.1, 0.011, { fs: 1, fu: 1, off: [-0.05, 0], seed: 270 });
      }
    }
  }
}

// the girders and the deck between two stations ua..ub (each span built whole by the tile owning its middle)
export function spanBuild(g, M, ua, ub) {
  const st = M.steel, a = ua + 0.22, b = ub - 0.22, L = b - a;
  const deep = Math.min(1.9, Math.max(1.0, L / 11));
  for (const t of MV.tracks) for (const sl of [-0.85, 0.85]) plateGirder(g, M.steelU, P(a, t + sl, LV.STR_T - deep / 2), P(b, t + sl, LV.STR_T - deep / 2), UP, deep, 0.36, { stiff: 1.5, seed: 300 });
  if (inStation((ua + ub) / 2)) for (const sl of [-6.6, 6.6]) plateGirder(g, M.steelU, P(a, sl, LV.STR_T - 0.6), P(b, sl, LV.STR_T - 0.6), UP, 1.2, 0.3, { stiff: 1.5, seed: 310 });
  // outside the station: the edge railings over the walkways (posts every 2 m, a top rail and a mid rail)
  if (!inStation((ua + ub) / 2)) for (const sl of [-5.55, 5.55]) {
    g.rect(M.steelS, P(a, sl, LV.TIE_T + 1.1), P(b, sl, LV.TIE_T + 1.1), UP, 0.06, 0.06, { caps: false, rv: [] });
    g.rect(M.steelS, P(a, sl, LV.TIE_T + 0.6), P(b, sl, LV.TIE_T + 0.6), UP, 0.045, 0.045, { caps: false, rv: [] });
    for (let u = a + 0.3; u < b; u += 2.0) g.rect(M.steelS, P(u, sl, LV.TIE_T), P(u, sl, LV.TIE_T + 1.12), DA, 0.06, 0.06, { rv: [] });
  }
  // cross frames between the girder pairs at the third points
  for (const t of MV.tracks) for (const f of [1 / 3, 2 / 3]) {
    const u = a + L * f;
    for (const [l0, l1] of [[t - 0.8, t + 0.8], [t + 0.8, t - 0.8]]) angle(g, M.steelUS, P(u, l0, LV.STR_T - deep + 0.2), P(u, l1, LV.STR_T - 0.2), DA, 0.08, 0.08, 0.01, { fs: 1, fu: 1, off: [-0.04, 0], seed: 320 });
  }
}
export function deckBuild(g, M, ua, ub) {
  const tim = M.timber, rl = M.rail, L = ub - ua;
  const pitch = 0.5, n = Math.max(1, Math.round(L / pitch));
  for (const t of MV.tracks) {
    for (let k = 0; k < n; k++) {
      const u = ua + (k + 0.5) * (L / n);
      g.rect(tim, P(u, t - 1.35, LV.TIE_B + 0.089), P(u, t + 1.35, LV.TIE_B + 0.089), UP, 0.2, 0.178, { caps: true });
    }
    // guard timbers outside the rails, the running rails (head, web, foot), the third rail and its board
    for (const sl of [-1.05, 1.05]) g.rect(tim, P(ua, t + sl, LV.TIE_T + 0.1), P(ub, t + sl, LV.TIE_T + 0.1), UP, 0.15, 0.2, { caps: false });
    for (const sl of [-0.7175, 0.7175]) {
      g.rect(rl, P(ua, t + sl, LV.TIE_T + 0.008), P(ub, t + sl, LV.TIE_T + 0.008), UP, 0.14, 0.016, { caps: false });
      g.rect(rl, P(ua, t + sl, LV.TIE_T + 0.07), P(ub, t + sl, LV.TIE_T + 0.07), UP, 0.017, 0.11, { caps: false });
      g.rect(M.railTop, P(ua, t + sl, MV.RAIL - 0.022), P(ub, t + sl, MV.RAIL - 0.022), UP, 0.072, 0.044, { caps: false });
    }
    const t3 = t + (t > 0 ? 1.55 : -1.55);
    g.rect(rl, P(ua, t3, LV.TIE_T + 0.12), P(ub, t3, LV.TIE_T + 0.12), UP, 0.08, 0.16, { caps: false });
    g.rect(tim, P(ua, t3, LV.TIE_T + 0.28), P(ub, t3, LV.TIE_T + 0.28), UP, 0.3, 0.04, { caps: false });
  }
  // the walkways between the tracks and along the edges (plank walks on the tie ends)
  for (const l of [-1.84, 1.87, -5.1, 5.15]) g.rect(tim, P(ua, l, LV.TIE_T + 0.03), P(ub, l, LV.TIE_T + 0.03), UP, 0.62, 0.05, { caps: false });
  // see a dark brown underside there where the open tie gaps showed the sky (b4r4 cMvJoint)
  { const a = Math.max(ua, MV.plat.u0), b = Math.min(ub, MV.plat.u1);
    if (b - a > 0.5) g.rect(tim, P(a, 0, LV.TIE_B - 0.03), P(b, 0, LV.TIE_B - 0.03), UP, 2 * MV.plat.l0 - 0.1, 0.03, { caps: false, rv: [] }); }
}
