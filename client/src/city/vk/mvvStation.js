// AR33 VIADUCT: the IRT's 125th Street station on the Manhattan Valley Viaduct (Heins & LaFarge, 1904; platforms
// lengthened 1948, the control house's mezzanine 1931, renovated 2002-04), as:
// * two side platforms (OSM u -98.8.. +58, |l| 5.15.. 7.75): concrete on steel stringers and posts, the yellow
// edge strip, the timber rubbing board;
// * the enclosures: a green plate fascia under each platform, cream framed-panel walls in bays of ~4.2 m between green
// steel pilasters (a panelled dado, three multi-light steel windows, a panelled frieze), a corrugated roof sloping
// out to a red-brown eave on rafter tails, canopy columns along the platform, lamps under the roof;
// * the control house east of the downtown platform at the station's south end (cream panelled walls, small windows,
// the red-brown coping), its corridor to the platform's enclosed stair and a glazed stair down to the east sidewalk.
import { V, UP, RIV, ibeam, plateGirder, gusset, girderSpikes, angle } from './vkKit.js';
import { otherMat, litMat, steelMat, netMat } from './vkMats.js';
import { MV, P, DA, DN, LV, COLL, mvvMats } from './mvv.js';
// AR34 STATIONS: the 1931 mezzanine, the west passageway and escalators, the east escalator and L stair (`?st34=0` off)
import { ST34, ACC, accessBuild, accessColliders, nameSignMat, signQuad } from '../stations/irt125.js';

const { add, sub, mul, norm, lerp } = V;
export const ST = (() => {
  // (AR34 STATIONS: the platform 1.11 m over the top of rail, the R62A's platform height 3.65 ft (Wikipedia, "R62A (New
  // York City Subway car)"; was 1.07); the edges 1.40 m from the track centres on both sides (the car 8.60 ft = 2.62 m
  // wide leaves a 0.09 m gap): east 3.75 + 1.40 = 5.15, west 3.68 + 1.40 = 5.08 (was 5.15 both, 1.47 on the west))
  const yPl = MV.RAIL + 1.11, lE = MV.plat.l0, lW = MV.plat.l1, u0 = MV.plat.u0, u1 = MV.plat.u1;
  const nb = Math.round((u1 - u0) / 4.2);
  return { yPl, lE, lEW: -MV.tracks[0] + 1.40, lW, u0, u1, nb, bay: (u1 - u0) / nb, house: { u0: -38.4, u1: -30.5, l0: 15.9, l1: 19.9, y0: 10.8, y1: 15.95, cu0: -35.5, cl0: 7.9, cy0: 12.1, cy1: 13.15, sl: 22.0 } };
})();
export function stationMats() {
  const M = mvvMats();
  if (!M.panel) {
    // the enclosure's cream paint: smooth, a little dusty, soot-stained at the lower edges (no rivets)
    M.panel = steelMat('irtCream', { paint: 0xe3dccb, paint2: 0xdad3c1, rust: 0x8a7a66, rustD: 0x5d5043, rustAmt: 0.07, rough: 0.74, metal: 0.0, rivets: false, chalk: 0.05 });
    M.red = otherMat('canopy');
    // the roofs: red-brown painted standing-seam metal from above, the eave
    // fascia a weathered dark grey under the corrugation's ends
    M.roof = steelMat('irtRoof', { paint: 0x7b3f30, paint2: 0x733a2c, rust: 0x5a3a2a, rustD: 0x3d2a20, rustAmt: 0.15, rough: 0.66, metal: 0.05, rivets: false, chalk: 0.25, guano: 0.2 });
    // the platform slab: concrete, its underside sooted and in the deck's shade
    M.slab = steelMat('irtSlab', { paint: 0x5f5b55, paint2: 0x58544e, rust: 0x4a4038, rustD: 0x2e2822, rustAmt: 0.25, rough: 0.9, metal: 0.0, rivets: false, amb: 0.8, spec: 0.3, guano: 0.1 });
    M.eave = steelMat('irtEave', { paint: 0x3b403d, paint2: 0x363b38, rust: 0x5a4434, rustD: 0x3a2c22, rustAmt: 0.12, rough: 0.7, metal: 0.04, rivets: false });
    M.yellow = otherMat('yellow'); M.net = netMat(); M.louvre = otherMat('netting');
    // the platforms' benches: varnished timber slats gone grey-brown (AR34 STATIONS)
    M.bench = steelMat('irtBench', { paint: 0x7a5c40, paint2: 0x6e533a, rust: 0x4a3a2a, rustD: 0x3a2c20, rustAmt: 0.1, rough: 0.6, metal: 0.0, rivets: false, chalk: 0.1 });
    M.lamp = litMat('vkPlat', 0xfff1d8, 0.06, 2.6);   // by day the fixtures read dim against the daylight (b4r0)
    // window glass: the sky in it by day (blue-grey), warm light after dark
    M.win = litMat('vkWin', 0x5f6660, 0.05, 0.85, { base: 0x24282b, metal: 0.0, rough: 0.3 });
    // the windows seen from the platform: the daylight beyond (a pale grey-blue by day, dark after dark)
    M.winIn = litMat('vkWinIn', 0x9aa9b0, 0.2, 0.03, { base: 0x5f6b71, metal: 0.0, rough: 0.25 });
    // the platform's walking surface: pale weathered concrete (the photographs; the slab's sooted underside stays dark)
    M.platTop = otherMat('concrete', { tint: '#aaa69d', dirt: 0.45 });
  }
  return M;
}

// a wall along A -> B (world [x, z]) facing n (horizontal unit), y0..y1: a backing plate, raised rails top, bottom (and
// middle) and stiles every ~pw: the station's framed metal panels
const WP = (A, B, n) => (t, y, d = 0) => [A[0] + (B[0] - A[0]) * t + n[0] * d, y, A[1] + (B[1] - A[1]) * t + n[2] * d];
export function panelWall(g, M, A, B, n, y0, y1, pw = 0.7, o = {}) {
  const W = WP(A, B, n), L = Math.hypot(B[0] - A[0], B[1] - A[1]), e = [(B[0] - A[0]) / L, 0, (B[1] - A[1]) / L];
  g.rect(M.panel, W(0, (y0 + y1) / 2, -0.02), W(1, (y0 + y1) / 2, -0.02), UP, 0.04, y1 - y0, { caps: o.caps ?? false });
  const rd = ST34 ? 0.022 : 0.012, rw = ST34 ? 0.044 : 0.024;
  for (const y of [y0 + 0.04, y1 - 0.04, ...(o.midRail ? [(y0 + y1) / 2] : [])]) g.rect(M.panel, W(0, y, rd), W(1, y, rd), UP, rw, 0.08, { caps: false });
  const nS = Math.max(1, Math.round(L / pw));
  for (let k = 0; k <= nS; k++) g.rect(M.panel, W(k / nS, y0 + 0.04, rd), W(k / nS, y1 - 0.04, rd), e, rw, 0.07, { caps: false });
  // raised panels inside the frame: two rows when there is a middle rail
  const rows = o.midRail ? [[y0 + 0.1, (y0 + y1) / 2 - 0.05], [(y0 + y1) / 2 + 0.05, y1 - 0.1]] : [[y0 + 0.1, y1 - 0.1]];
  if (!o.flat) for (let k = 0; k < nS; k++) for (const [ya, yb] of rows) {
    if (yb - ya < 0.2) continue;
    const m = 0.07 / L;
    g.rect(M.panel, W(k / nS + m, (ya + yb) / 2, 0.002), W((k + 1) / nS - m, (ya + yb) / 2, 0.002), UP, 0.02, yb - ya - 0.04, { caps: false });
  }
}
// a multi-light steel window in a wall along A -> B facing n: glass (lit after dark), frame, muntins
export function windowIn(g, M, A, B, n, y0, y1, cols = 3, rows = 2, frame = null) {
  // (frame: the sash's paint; the platforms' windscreens green, the station house's and passageways' windows white-cream,
  // st432 2024-08 at full resolution)
  const W = WP(A, B, n), L = Math.hypot(B[0] - A[0], B[1] - A[1]), e = [(B[0] - A[0]) / L, 0, (B[1] - A[1]) / L], st = frame || M.steelS;
  g.rect(M.win, W(0, (y0 + y1) / 2, -0.03), W(1, (y0 + y1) / 2, -0.03), UP, 0.012, y1 - y0, { caps: false });
  for (const y of [y0, y1]) g.rect(st, W(0, y, 0.01), W(1, y, 0.01), UP, 0.07, 0.06, { rv: [] });
  for (const t of [0, 1]) g.rect(st, W(t, y0, 0.01), W(t, y1, 0.01), e, 0.07, 0.06, { caps: false });
  for (let c = 1; c < cols; c++) g.rect(st, W(c / cols, y0, -0.005), W(c / cols, y1, -0.005), e, 0.03, 0.028, { caps: false });
  for (let r = 1; r < rows; r++) { const y = y0 + ((y1 - y0) * r) / rows; g.rect(st, W(0, y, -0.005), W(1, y, -0.005), UP, 0.03, 0.028, { caps: false }); }
}
const XZ = (p) => [p[0], p[2]];
// framed panels on a wall that climbs with a stair: the wall's plane at lateral l (outward sign sg) from station uA to uB,
// its lower edge yA + h0 rising to yB + h0 and its top yA + h1 .. yB + h1: rails along the slope, vertical stiles, raised
// panels in two rows, and (louvre) a band of dark slats high up
function slopeWall(g, M, l, sg, uA, uB, yA, yB, h0, h1, nx, louvre) {
  const run = uB - uA, lo = l + sg * 0.037, rp = 0.07 / Math.max(1, Math.abs(run));
  const pt = (t, h, d = 0) => P(uA + run * t, lo + sg * d, yA + (yB - yA) * t + h);
  const hm = (h0 + h1) / 2;
  for (const h of [h0 + 0.04, hm, h1 - 0.04]) g.rect(M.panel, pt(0, h), pt(1, h), UP, 0.024, 0.08, { caps: false });
  for (let k = 0; k <= nx; k++) { const t = k / nx; g.rect(M.panel, pt(t, h0 + 0.04), pt(t, h1 - 0.04), DA, 0.024, 0.07, { caps: false }); }
  for (let k = 0; k < nx; k++) for (const [ya, yb] of [[h0 + 0.1, hm - 0.05], [hm + 0.05, h1 - 0.1]]) {
    const ta = k / nx + rp, tb = (k + 1) / nx - rp;
    if (louvre && yb > h1 - 1.0 && ya > hm) continue;   // the louvre band takes the upper row
    g.rect(M.panel, pt(ta, (ya + yb) / 2, -0.01), pt(tb, (ya + yb) / 2, -0.01), UP, 0.02, yb - ya - 0.04, { caps: false });
  }
  if (louvre) {
    const yl0 = hm + 0.1, yl1 = h1 - 0.12;
    g.rect(M.louvre, pt(0.04, (yl0 + yl1) / 2, -0.008), pt(0.96, (yl0 + yl1) / 2, -0.008), UP, 0.012, yl1 - yl0, { caps: false });
    for (let y = yl0 + 0.05; y < yl1 - 0.03; y += 0.1) g.rect(M.steelU, pt(0.04, y, 0.004), pt(0.96, y, 0.004), UP, 0.03, 0.035, { caps: false, rv: [] });   // dark grille
  }
}

export function stationBuild(g, gy) {
  const M = stationMats(), st = M.steel, S = ST;
  const { yPl, lE, lW, u0, u1, nb, bay } = S;
  for (const sgn of [-1, 1]) {
    const L = (x) => sgn * x, n = mul(DN, sgn), lE = sgn < 0 ? S.lEW : S.lE, right = mul(DA, -sgn), inward = mul(n, -1);
    // the platform: slab, the yellow edge strip (6 mm proud of the slab), the timber rubbing board, stringers, posts
    g.rect(M.slab, P(u0, L((lE + lW) / 2), yPl - 0.11), P(u1, L((lE + lW) / 2), yPl - 0.11), UP, lW - lE, 0.22);
    g.rect(M.yellow, P(u0, L(lE + 0.31), yPl + 0.003), P(u1, L(lE + 0.31), yPl + 0.003), UP, 0.6, 0.006, { caps: false });
    if (ST34) g.rect(M.platTop, P(u0, L((lE + 0.61 + lW) / 2), yPl + 0.002), P(u1, L((lE + 0.61 + lW) / 2), yPl + 0.002), UP, lW - lE - 0.61, 0.004, { caps: false });
    g.rect(M.timber, P(u0, L(lE - 0.04), yPl - 0.2), P(u1, L(lE - 0.04), yPl - 0.2), UP, 0.08, 0.36, { caps: false });
    for (const l of [lE + 0.35, lW - 0.3]) ibeam(g, M.steelU, P(u0, L(l), yPl - 0.37), P(u1, L(l), yPl - 0.37), UP, 0.3, 0.16, 0.014, 0.01, { riv: false });
    for (let u = u0 + 1.2; u < u1; u += 2.45) for (const l of [lE + 0.35, lW - 0.3]) ibeam(g, M.steelU, P(u, L(l), LV.STR_T), P(u, L(l), yPl - 0.52), DA, 0.2, 0.16, 0.012, 0.01, { riv: false });
    // under the platform: two conduits along it on hangers and a vandal-proof fixture under every other bay (the lights
    // that show as warm points under the deck after dark)
    for (const dl of [1.05, 1.25]) g.cyl(M.steelU, P(u0 + 0.3, L(lE + dl), yPl - 0.5), P(u1 - 0.3, L(lE + dl), yPl - 0.5), 0.028, 6, { caps: false });
    for (let u = u0 + 1.0; u < u1 - 0.5; u += 2.1) g.rect(M.steelU, P(u, L(lE + 1.15), yPl - 0.47), P(u, L(lE + 1.15), yPl - 0.2), DA, 0.04, 0.3, { rv: [] });
    for (let k = 0; k < nb; k += 2) { const cu = u0 + (k + 0.5) * bay; g.rect(M.steelU, P(cu - 0.32, L(lE + 1.6), yPl - 0.3), P(cu + 0.32, L(lE + 1.6), yPl - 0.3), UP, 0.2, 0.08, { rv: [] }); g.rect(M.lamp, P(cu - 0.28, L(lE + 1.6), yPl - 0.35), P(cu + 0.28, L(lE + 1.6), yPl - 0.35), UP, 0.14, 0.02, { caps: false }); }
    // the fascia girder under the enclosure (the green band) with its stiffeners
    // the narrow dark green ledge under the enclosure's cream dado
    const fb = yPl - 0.18, ft = yPl + 0.14;
    plateGirder(g, st, P(u0, L(lW + 0.1), (fb + ft) / 2), P(u1, L(lW + 0.1), (fb + ft) / 2), UP, ft - fb, 0.22, { stiff: 1.4, seed: 400 });
    girderSpikes(g, P(u0 + 0.5, L(lW + 0.1), (fb + ft) / 2), P(u1 - 0.5, L(lW + 0.1), (fb + ft) / 2), UP, ft - fb, -sgn);   // pigeon spikes on its outer ledge
    // the enclosure: bays between pilasters (dado, windows, frieze), a canopy column and a lamp per bay
    const yD = yPl + 1.0, yW = yPl + 2.45, yT = yPl + 2.95;
    for (let k = 0; k <= nb; k++) {
      const a = u0 + k * bay;
      ibeam(g, st, P(a, L(lW + 0.02), ft), P(a, L(lW + 0.02), yT + 0.1), n, 0.22, 0.2, 0.014, 0.01);
      if (k === nb) break;
      const b = a + bay, A = XZ(P(a + 0.12, L(lW), 0)), B = XZ(P(b - 0.12, L(lW), 0));
      panelWall(g, M, A, B, n, ft, yD, bay / 3, { midRail: true });
      panelWall(g, M, A, B, n, yW, yT, bay / 3);
      const ww = (bay - 0.24 - 4 * 0.16) / 3;
      for (let w = 0; w < 3; w++) {
        const wa = a + 0.28 + w * (ww + 0.16);
        windowIn(g, M, XZ(P(wa, L(lW), 0)), XZ(P(wa + ww, L(lW), 0)), n, yD + 0.05, yW - 0.05, 3, 3);   // 3 x 3 lights
        if (ST34) {
          const wl = L(lW - 0.05), ya = yD + 0.08, yb = yW - 0.08;
          signQuad(g, M.winIn, P(wa + ww / 2, wl, (ya + yb) / 2), right, inward, ww / 2 - 0.03, (yb - ya) / 2);
          for (let c = 1; c < 3; c++) g.rect(st, P(wa + (ww * c) / 3, L(lW - 0.062), ya), P(wa + (ww * c) / 3, L(lW - 0.062), yb), DN, 0.02, 0.035, { caps: false, rv: [] });
          for (let r = 1; r < 3; r++) g.rect(st, P(wa + 0.03, L(lW - 0.062), ya + ((yb - ya) * r) / 3), P(wa + ww - 0.03, L(lW - 0.062), ya + ((yb - ya) * r) / 3), UP, 0.02, 0.035, { caps: false, rv: [] });
        }
      }
      for (let w = 0; w <= 3; w++) { const ma = a + 0.12 + w * (ww + 0.16); g.rect(M.panel, P(ma, L(lW), (yD + yW) / 2), P(ma + 0.16, L(lW), (yD + yW) / 2), UP, 0.06, yW - yD, { caps: false }); }
      const cu = a + bay / 2, cl = L(lE + 0.95);
      g.cyl(st, P(cu, cl, yPl), P(cu, cl, yPl + 3.2), 0.075, 10);
      g.cyl(st, P(cu, cl, yPl), P(cu, cl, yPl + 0.35), 0.13, 10);
      g.rect(st, P(cu, cl, yPl + 2.9), P(cu, L(lW - 0.1), yPl + 3.15), DA, 0.012, 0.28);
      // (ST34: the photographs from the platforms show each column's beam out over the platform edge too, and a curved
      // knee bracket under it on both sides)
      if (ST34) {
        g.rect(st, P(cu, cl, yPl + 2.9), P(cu, L(lE + 0.12), yPl + 3.15), DA, 0.012, 0.28);
        for (const sd of [-1, 1]) {
          const R = 0.75, yb = yPl + 2.9 - R, lc0 = lE + 0.95;
          let prev = null;
          for (let k = 0; k <= 4; k++) { const th = (Math.PI / 2) * (k / 4), q = P(cu, L(lc0 + sd * (R - R * Math.cos(th))), yb + R * Math.sin(th)); if (prev) g.rect(st, prev, q, DA, 0.05, 0.05, { caps: false, rv: [] }); prev = q; }
        }
      }
      g.rect(M.lamp, P(cu - 0.6, L(lE + 1.5), yPl + 3.18), P(cu + 0.6, L(lE + 1.5), yPl + 3.18), UP, 0.12, 0.05);
    }
    g.rect(st, P(u0, L(lW + 0.06), yT + 0.05), P(u1, L(lW + 0.06), yT + 0.05), UP, 0.16, 0.1);   // wall plate
    if (ST34) {
      // AR34 STATIONS (Commons photographs 2015-2025 from the platforms): the station's name on the frieze facing the
      // tracks every fourth bay, timber benches on steel frames against the windscreen between them
      for (let k = 2; k < nb; k += 4) signQuad(g, nameSignMat(), P(u0 + (k + 0.5) * bay, L(lW - 0.06), yW + 0.25), right, inward, 0.95, 0.21);
      for (let k = 0; k < nb; k += 4) {
        const cu = u0 + (k + 0.5) * bay, lb = lW - 0.42;
        g.rect(M.bench, P(cu - 1.15, L(lb), yPl + 0.45), P(cu + 1.15, L(lb), yPl + 0.45), UP, 0.42, 0.05, { rv: [] });
        g.rect(M.bench, P(cu - 1.15, L(lW - 0.2), yPl + 0.72), P(cu + 1.15, L(lW - 0.2), yPl + 0.72), UP, 0.04, 0.34, { rv: [] });
        for (const du of [-0.95, 0.95]) {
          g.rect(st, P(cu + du, L(lb), yPl), P(cu + du, L(lb), yPl + 0.43), DA, 0.4, 0.05, { rv: [] });
          g.rect(st, P(cu + du, L(lW - 0.22), yPl + 0.43), P(cu + du, L(lW - 0.22), yPl + 0.9), DA, 0.04, 0.05, { rv: [] });
        }
      }
    }
    // the roof: from over the platform edge up at the wall and out over the eave, corrugated; the eave fascia, the
    // inner fascia over the platform edge, rafter tails under the eave, purlins
    const yIn = yPl + 3.45, yOut = yPl + 3.17, lIn = lE - 0.25, lOut = lW + 0.75;
    const sl = (l) => yIn + ((yOut - yIn) * (l - lIn)) / (lOut - lIn);
    const rIn = P(0, L(lIn), yIn), rOut = P(0, L(lOut), yOut), across = norm(sub(rOut, rIn));
    const rUp = norm(V.cross(DA, across)), rU = rUp[1] > 0 ? rUp : mul(rUp, -1);
    const wR = V.len(sub(rOut, rIn));
    g.rect(M.roof, P(u0 - 0.3, L((lIn + lOut) / 2), (yIn + yOut) / 2), P(u1 + 0.3, L((lIn + lOut) / 2), (yIn + yOut) / 2), rU, wR, 0.04);
    for (let u = u0 - 0.2; u < u1 + 0.3; u += 0.26) g.rect(M.roof, add(P(u, L(lIn), yIn), mul(rU, 0.035)), add(P(u, L(lOut), yOut), mul(rU, 0.035)), rU, 0.05, 0.03, { caps: false });
    g.rect(M.eave, P(u0 - 0.3, L(lOut + 0.03), yOut - 0.14), P(u1 + 0.3, L(lOut + 0.03), yOut - 0.14), UP, 0.06, 0.42);
    // the soffit under the corrugation, dark grey between the cream rafters
    g.rect(M.eave, add(P(u0 - 0.3, L((lW + lOut) / 2), (sl(lW) + sl(lOut)) / 2), mul(rU, -0.03)), add(P(u1 + 0.3, L((lW + lOut) / 2), (sl(lW) + sl(lOut)) / 2), mul(rU, -0.03)), rU, lOut - lW, 0.01, { caps: false });
    g.rect(M.eave, P(u0 - 0.3, L(lIn - 0.03), yIn - 0.09), P(u1 + 0.3, L(lIn - 0.03), yIn - 0.09), UP, 0.05, 0.3);
    // (ST34: the canopy's ceiling over the platform is painted light, the steel beams under it green: the photographs
    // from the platforms; the roof's red-brown underside read through before)
    if (ST34) { const cA = add(P(0, L(lIn), yIn), mul(rU, -0.05)), cB = add(P(0, L(lW), sl(lW)), mul(rU, -0.05)), cm = mul(add(cA, cB), 0.5), w = V.len(sub(cB, cA));
      g.rect(M.panel, add(cm, mul(DA, u0 - 0.2)), add(cm, mul(DA, u1 + 0.2)), rU, w, 0.012, { caps: false }); }
    // the rafters under the eave, painted cream like the walls: from the street their ends read as a row of light ticks
    // under the dark eave
    for (let u = u0; u <= u1 + 0.01; u += bay / 8) g.rect(M.panel, P(u, L(lW), sl(lW) - 0.12), P(u, L(lOut - 0.03), sl(lOut) - 0.1), UP, 0.06, 0.14);
    for (let k = 0; k <= nb; k++) { const u = u0 + k * bay; g.rect(st, P(u, L(lIn), sl(lIn) - 0.2), P(u, L(lW), sl(lW) - 0.2), UP, 0.1, 0.22); }
    // railings across the platform ends
    for (const u of [u0 + 0.1, u1 - 0.1]) {
      g.rect(st, P(u, L(lE + 0.1), yPl + 1.05), P(u, L(lW - 0.1), yPl + 1.05), UP, 0.05, 0.05);
      for (let l = lE + 0.1; l <= lW - 0.05; l += 0.5) g.rect(st, P(u, L(l), yPl), P(u, L(l), yPl + 1.05), DA, 0.04, 0.04, { caps: false });
    }
  }
  // the black debris netting hung under the deck along the station, sagging between the floor beams
  // (over the arch it runs just under the floor beams, over the ribs; the control house stands east of the deck)
  { const H = MV.span / 2 + 1.8, step = 4.0;
    for (let u = u0 - 2; u < u1 + 2; u += step) {
      const ub = Math.min(u1 + 2, u + step), um = (u + ub) / 2;
      const arch = Math.abs(um) < H, yN = arch ? LV.FB_B - 0.06 : LV.STR_T - 1.95, sag = arch ? 0.0 : 0.22;
      // (ST34: not across the mezzanine, which stands in the tower bay up to just under the floor system)
      const mz = ST34 && ub > ACC.mez.u0 - 0.4 && u < ACC.mez.u1 + 0.4;
      for (const [a, b, ya, yb] of [[u, um, yN, yN - sag], [um, ub, yN - sag, yN]]) {
        for (const [la, lb] of mz ? [[-8.2, -4.2], [4.2, 8.2]] : [[-8.2, 8.2]]) gusset(g, M.net, P(a, la, ya), P(b, la, yb), P(b, lb, yb), P(a, lb, ya), 0.01, { riv: false, seed: 440 });
      }
    }
  }
  // the control house: a cream panelled box EAST of the downtown platform, not under the deck.
  // (432 x c_Kwc and 432 x 486 agree within 0.5 m), the box 4 m deep to l 15.9, a one-storey corridor on a green plate
  // girder from it west to the platform's outer stringer (six windows on its north face), the coping at y 15.95 and the
  // box's foot at 10.8 (from 432 with its 1.5 m terrain offset). From the corridor the enclosed stair runs north along
  // the platform wall, level, then up to the platform; a glazed street stair drops from the box's south end.
  const Hs = S.house, { y0, y1 } = Hs;
  const faces = (ua, ub, la, lb) => [[XZ(P(ua, la, 0)), XZ(P(ub, la, 0)), mul(DN, -1)], [XZ(P(ub, la, 0)), XZ(P(ub, lb, 0)), DA],
    [XZ(P(ub, lb, 0)), XZ(P(ua, lb, 0)), DN], [XZ(P(ua, lb, 0)), XZ(P(ua, la, 0)), mul(DA, -1)]];
  const along = (A, B, n, t, d) => [A[0] + (B[0] - A[0]) * t + n[0] * d, A[1] + (B[1] - A[1]) * t + n[2] * d];
  const winAt = (A, B, n, t0, t1, ya, yb) => windowIn(g, M, along(A, B, n, t0, 0.07), along(A, B, n, t1, 0.07), n, ya, yb, 2, 2, ST34 ? M.panel : null);
  const coping = (A, B, n, y) => g.rect(M.red, [A[0] + n[0] * 0.08, y, A[1] + n[2] * 0.08], [B[0] + n[0] * 0.08, y, B[1] + n[2] * 0.08], UP, 0.16, 0.3);
  const lmB = (Hs.l0 + Hs.l1) / 2, lmC = (Hs.cl0 + Hs.l0) / 2;
  // the box: framed panels in two rows on every face, the red-brown coping, a flat roof and a steel floor
  { const F = faces(Hs.u0, Hs.u1, Hs.l0, Hs.l1);
    for (const [A, B, n] of F) { panelWall(g, M, A, B, n, y0, y1 - 0.3, 0.9, { midRail: true, caps: true }); coping(A, B, n, y1 - 0.15); }
    const [A, B, n] = F[1];   // the north face: two windows high up, toward its east end (432)
    for (const lc of [17.1, 18.7]) { const t = (lc - Hs.l0) / (Hs.l1 - Hs.l0); winAt(A, B, n, t - 0.1, t + 0.1, 14.0, 15.1); }
    const [Ae, Be, ne] = F[2];   // the east face: plain panels and a louvred vent (c_Kwc, 486)
    const v0 = along(Ae, Be, ne, 0.36, 0.05), v1 = along(Ae, Be, ne, 0.44, 0.05);
    g.rect(M.louvre, [v0[0], 13.6, v0[1]], [v1[0], 13.6, v1[1]], UP, 0.03, 0.5, { caps: false });
    for (let y = 13.4; y < 13.85; y += 0.09) g.rect(M.panel, [v0[0] + ne[0] * 0.02, y, v0[1] + ne[2] * 0.02], [v1[0] + ne[0] * 0.02, y, v1[1] + ne[2] * 0.02], UP, 0.03, 0.03, { caps: false, rv: [] });
    g.rect(M.roof, P(Hs.u0 - 0.05, lmB, y1 - 0.32), P(Hs.u1 + 0.05, lmB, y1 - 0.32), UP, Hs.l1 - Hs.l0 + 0.1, 0.08);
    g.rect(M.steelU, P(Hs.u0, lmB, y0 - 0.12), P(Hs.u1, lmB, y0 - 0.12), UP, Hs.l1 - Hs.l0, 0.24);
  }
  // the corridor: cream walls over the green plate girder, six windows on the north face (432)
  // (ST34: the passageway runs on under the platform to the mezzanine in the tower bay, Wikipedia's "enclosed
  // passageway" east of the station house; its girders bear on the header along the column line)
  { const cl0 = ST34 ? ACC.mez.l1 : Hs.cl0, lmC2 = (cl0 + Hs.l0) / 2;
    const F = faces(Hs.cu0, Hs.u1, cl0, Hs.l0);
    for (const k of [1, 3]) { const [A, B, n] = F[k]; panelWall(g, M, A, B, n, Hs.cy1, y1 - 0.3, 0.9, { caps: true }); coping(A, B, n, y1 - 0.15); }
    // (432: six windows from the box to the stair's passage, which hides the corridor's west 2.5 m)
    const [A, B, n] = F[1], nW = 6, t0 = (Hs.cl0 + 2.7 - cl0) / (Hs.l0 - cl0);
    for (let w = 0; w < nW; w++) { const t = t0 + ((1 - t0) * (w + 0.5)) / nW, hw = 0.04 * (Hs.l0 - Hs.cl0) / (Hs.l0 - cl0); winAt(A, B, n, t - hw, t + hw, 14.0, 15.1); }
    g.rect(M.roof, P(Hs.cu0, lmC2, y1 - 0.32), P(Hs.u1, lmC2, y1 - 0.32), UP, Hs.l0 - cl0, 0.08);
    g.rect(M.slab, P(Hs.cu0, lmC2, Hs.cy1 - 0.1), P(Hs.u1, lmC2, Hs.cy1 - 0.1), UP, Hs.l0 - cl0, 0.2);
    for (const u of [Hs.u1 - 0.14, Hs.cu0 + 0.14]) plateGirder(g, st, P(u, ST34 ? COLL - 0.15 : cl0, (Hs.cy0 + Hs.cy1) / 2), P(u, Hs.l0, (Hs.cy0 + Hs.cy1) / 2), UP, Hs.cy1 - Hs.cy0, 0.28, { stiff: 1.1, seed: 431 });
    for (let l = cl0 + 1.3; l < Hs.l0 - 0.5; l += 2.0) ibeam(g, M.steelU, P(Hs.cu0 + 0.2, l, Hs.cy1 - 0.42), P(Hs.u1 - 0.2, l, Hs.cy1 - 0.42), UP, 0.42, 0.18, 0.014, 0.01, { riv: false });
    void lmC;
  }
  // the frame under them: cross girders from the tower's east column line out under the box, knee braces down to the
  // columns, hangers from the corridor's girders
  for (const u of [Hs.u0 + 1.0, Hs.u1 - 0.6]) {
    plateGirder(g, st, P(u, COLL, y0 - 0.55), P(u, Hs.l1 - 0.2, y0 - 0.55), UP, 0.9, 0.26, { stiff: 1.2, seed: 430 });
    angle(g, M.steel, P(u, COLL + 0.2, y0 - 5.2), P(u, Hs.l0 - 2.5, y0 - 1.0), DA, 0.15, 0.15, 0.014, { fs: 1, fu: 1, off: [-0.08, 0], seed: 432 });
    angle(g, M.steel, P(u, COLL + 0.2, y0 - 5.2), P(u, Hs.l0 - 2.5, y0 - 1.0), DA, 0.15, 0.15, 0.014, { fs: -1, fu: 1, off: [0.08, 0], seed: 433 });
    // (hangers only where a passageway girder is over the cross girder: at u -37.4 nothing is, and their tops stood free)
    if (!ST34 || (u > Hs.cu0 && u < Hs.u1)) for (const l of [Hs.cl0 + 1.5, Hs.cl0 + 4.5]) g.rect(M.steelU, P(u, l, y0 - 0.1), P(u, l, Hs.cy0), DA, 0.16, 0.16, { seed: 434 });
  }
  // the enclosed stair from the corridor to the downtown (east) platform along the outside of its wall: a level passage
  // north from the corridor, then a flight whose roof meets the enclosure's base
  { const la = ST.lW + 0.35, lb = ST.lW + 2.6, lm = (la + lb) / 2, yA = Hs.cy1 + 0.05, yB = 17.9;
    const uL = Hs.u1 - 0.1, uA = -21.0, uB = -15.0, run = uB - uA;
    const bot = P(uA, lm, yA), top = P(uB, lm, yB);
    g.rect(M.steel, P(uL, lm, yA - 0.25), add(bot, [0, -0.25, 0]), UP, 2.3, 0.4, { seed: 449 });
    g.rect(M.steel, add(bot, [0, -0.25, 0]), add(top, [0, -0.25, 0]), UP, 2.3, 0.4, { seed: 450 });
    // brackets from the viaduct's outer stringer out under the enclosure, every ~5 m
    for (let u = uL + 1.2; u < uB - 0.5; u += 5.2) {
      const y = (u < uA ? yA : yA + ((yB - yA) * (u - uA)) / run) - 0.45;
      angle(g, M.steel, P(u, ST.lW + 0.15, Math.min(y, LV.STR_T) - 1.6), P(u, lb, y), DA, 0.12, 0.12, 0.012, { fs: 1, fu: 1, off: [-0.06, 0], seed: 455 });
      g.rect(M.steel, P(u, ST.lW + 0.15, y - 0.05), P(u, lb, y - 0.05), DA, 0.18, 0.2, { seed: 456 });
    }
    for (const l of [la, lb]) {
      for (let k = 0; k < 5; k++) {
        const t0 = k / 5, t1 = (k + 1) / 5, ua = uA + run * t0, ub = uA + run * t1, ya = yA + (yB - yA) * t0, yb = yA + (yB - yA) * t1;
        gusset(g, M.panel, P(ua, l, ya - 0.45), P(ub, l, yb - 0.45), P(ub, l, yb + 2.3), P(ua, l, ya + 2.3), 0.05, { riv: false, seed: 451 });
      }
      gusset(g, M.panel, P(uL, l, yA - 0.45), P(uA, l, yA - 0.45), P(uA, l, yA + 2.3), P(uL, l, yA + 2.3), 0.05, { riv: false, seed: 451 });
      slopeWall(g, M, l, l === lb ? 1 : -1, uA, uB, yA, yB, -0.45, 2.3, Math.max(2, Math.round(Math.abs(run) / 1.3)), false);   // the grille only on the passage
      // (ST34, st432 2024-08 / stKwW 2026-08: the flight reads as a cream dado under a dark glazed band, not a white slab)
      if (ST34 && l === lb) for (let k = 0; k < 5; k++) {
        const t0 = k / 5, t1 = (k + 1) / 5, ua = uA + run * t0, ub = uA + run * t1, ya = yA + (yB - yA) * t0, yb = yA + (yB - yA) * t1;
        gusset(g, M.win, P(ua, l + 0.06, ya + 0.95), P(ub, l + 0.06, yb + 0.95), P(ub, l + 0.06, yb + 2.15), P(ua, l + 0.06, ya + 2.15), 0.012, { riv: false, seed: 459 });
        g.rect(M.steelS, P(ua, l + 0.08, ya + 0.95), P(ua, l + 0.08, ya + 2.15), DA, 0.06, 0.05, { caps: false });
      }
      slopeWall(g, M, l, l === lb ? 1 : -1, uL, uA, yA, yA, -0.45, 2.3, Math.max(2, Math.round((uA - uL) / 1.3)), l === lb);
    }
    const sU = norm(V.cross(norm(sub(top, bot)), DN)), rU = sU[1] > 0 ? sU : mul(sU, -1);
    g.rect(M.roof, add(bot, [0, 2.4, 0]), add(top, [0, 2.4, 0]), rU, 2.5, 0.06, { seed: 452 });
    g.rect(M.roof, P(uL, lm, yA + 2.4), add(bot, [0, 2.4, 0]), UP, 2.5, 0.06, { seed: 452 });
    g.rect(M.eave, add(P(uA, lb + 0.2, yA), [0, 2.32, 0]), add(P(uB, lb + 0.2, yB), [0, 2.32, 0]), rU, 0.05, 0.22, { seed: 453 });
    g.rect(M.eave, P(uL, lb + 0.2, yA + 2.32), P(uA, lb + 0.2, yA + 2.32), UP, 0.05, 0.22, { seed: 453 });
    // its head closed against the platform's fascia
    panelWall(g, M, XZ(P(uB, la, 0)), XZ(P(uB, lb, 0)), DA, yB - 0.45, yB + 2.3, 0.8, { caps: true });
  }
  // the street stair: from a landing south of the box down to Broadway's east sidewalk, glazed over a panelled dado under
  // a red-brown roof edge (c_Kwc, 486: it drops south behind the corner shops). On the sidewalk: the compiled tiles have
  // the east kerb at code l ~20 and the sidewalk l 21-24 at u -38..-50 (b4r6 probe; the first placement at l 18.75 put
  // its foot on the asphalt)
  // (ST34 replaces this glazed street stair with the escalator facing south and the L stair, stations/irt125.js)
  if (!ST34) { const lL0 = Hs.l1 - 1.0, lL1 = ST.house.sl + 1.15, uL0 = Hs.u0 - 2.6;
    const F = faces(uL0, Hs.u0, lL0, lL1);
    for (const k of [0, 2, 3]) { const [A, B, n] = F[k]; panelWall(g, M, A, B, n, y0, y0 + 2.6, 0.9, { caps: true }); coping(A, B, n, y0 + 2.75); }
    { const A = XZ(P(Hs.u0, Hs.l1, 0)), B = XZ(P(Hs.u0, lL1, 0)); panelWall(g, M, A, B, DA, y0, y0 + 2.6, 0.9, { caps: true }); coping(A, B, DA, y0 + 2.75); }   // its north side east of the box
    g.rect(M.roof, P(uL0, (lL0 + lL1) / 2, y0 + 2.62), P(Hs.u0, (lL0 + lL1) / 2, y0 + 2.62), UP, lL1 - lL0, 0.08);
    g.rect(M.steelU, P(uL0, (lL0 + lL1) / 2, y0 - 0.12), P(Hs.u0, (lL0 + lL1) / 2, y0 - 0.12), UP, lL1 - lL0, 0.24); }
  if (!ST34) { const l = ST.house.sl, uTop = Hs.u0 - 2.6, run = (y0 - gy) / Math.tan((34 * Math.PI) / 180), uBot = uTop - run;
    const top = P(uTop, l, y0), bot = P(uBot, l, gy);
    g.rect(M.steel, add(bot, [0, -0.2, 0]), add(top, [0, -0.2, 0]), UP, 2.1, 0.35, { seed: 410 });
    const nT = Math.round(run / 0.28);
    for (let k = 0; k < nT; k++) {
      const u = uBot + (run * (k + 0.5)) / nT, y = gy + ((y0 - gy) * (k + 1)) / nT;
      g.rect(M.conc, P(u, l - 0.95, y - 0.03), P(u, l + 0.95, y - 0.03), UP, 0.3, 0.06, { caps: false });
    }
    for (const d of [-1, 1]) {
      const ll = l + d * 1.05;
      for (let k = 0; k < 6; k++) {
        const t0 = k / 6, t1 = (k + 1) / 6, ua = uBot + run * t0, ub = uBot + run * t1, ya = gy + (y0 - gy) * t0, yb = gy + (y0 - gy) * t1;
        gusset(g, M.panel, P(ua, ll, ya - 0.3), P(ub, ll, yb - 0.3), P(ub, ll, yb + 1.0), P(ua, ll, ya + 1.0), 0.05, { riv: false, seed: 420 });
        gusset(g, M.win, P(ua, ll + d * 0.01, ya + 1.0), P(ub, ll + d * 0.01, yb + 1.0), P(ub, ll + d * 0.01, yb + 2.45), P(ua, ll + d * 0.01, ya + 2.45), 0.012, { riv: false, seed: 422 });
        g.rect(M.steelS, P(ua, ll + d * 0.03, ya + 1.0), P(ua, ll + d * 0.03, ya + 2.45), DA, 0.06, 0.05, { caps: false });
      }
      for (const h of [1.0, 2.45]) g.rect(M.steelS, P(uBot, ll + d * 0.03, gy + h), P(uTop, ll + d * 0.03, y0 + h), DN, 0.06, 0.06, { caps: false });
    }
    const sU = norm(V.cross(norm(sub(top, bot)), DN)), rU = sU[1] > 0 ? sU : mul(sU, -1);
    g.rect(M.roof, add(bot, [0, 2.55, 0]), add(top, [0, 2.55, 0]), rU, 2.5, 0.06, { seed: 421 });
    for (const d of [-1, 1]) g.rect(M.red, add(P(uBot, l + d * 1.3, gy), [0, 2.48, 0]), add(P(uTop, l + d * 1.3, y0), [0, 2.48, 0]), rU, 0.05, 0.2, { seed: 423 });
  }
  // AR34 STATIONS: the mezzanine, the west passageway, the escalators and foot houses, the east L stair
  accessBuild(g, M, gy, panelWall, windowIn);
}
// walker obstacles: the street stair's lower half on the sidewalk
export function stationColliders(addBox, gy, rot) {
  if (ST34) { accessColliders(addBox, gy, rot); return; }
  const Hs = ST.house, run = (Hs.y0 - gy) / Math.tan((34 * Math.PI) / 180);
  const p = P(Hs.u0 - 2.6 - run * 0.75, Hs.sl, 0);
  addBox(p[0], gy + 1.2, p[2], run / 4, 1.2, 1.15, rot);
}
void lerp; void RIV;
