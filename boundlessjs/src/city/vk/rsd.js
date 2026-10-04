// AR33 VIADUCT: the Riverside Drive Viaduct (1900, F. Stuart Williamson chief engineer) carrying Riverside Drive over
// Manhattan Valley, 12th Avenue and W 125th Street next to Dinosaur Bar-B-Que (docs/notes/ar33-viaducts.md).
// Facts: 26 bays of one span each, 22 of 65 ft, the 125th St (then Manhattan St) span 128 ft, 1,564 ft of steel between the
// masonry approaches (New-York Tribune 1899-10-15 via Wikipedia); Scientific American 1900-07-21 pp. 38-39: latticed steel
// columns about 3 x 5 ft carrying arches 3 ft deep, the 125th St arch "semicircular", 130 ft span, under two plate girders
// 130 x 10 x 3 ft, floor beams 5 ft deep, a 60 ft roadway and 10 ft sidewalks on brackets (the cross-section in RS below);
// photographs from 12th Avenue under the deck: a latticed transverse arch at every bent; aluminium-painted steel.
// Frame: u along the OSM line (way 46568321) from its south end A (NNE +), l across (ESE +), y world.
import { V, UP, Geo, RIV, path, plateGirder, laced, latticeStrut, gusset, angle, ibeam, castBase, frustum, girderSpikes } from './vkKit.js';
import { steelMat, otherMat, litMat, fenceMat } from './vkMats.js';
import { RSD_STATIONS, RSD_ARCH } from './vkData.js';

const { add, sub, mul, norm } = V;
export const RS = {
  A: [850.0, -3762.7], dir: [0.48737, -0.87320], L: 466.79, x125: 124.45, span125: 39.3,
  // 2026-10-02 (VIADUCTS batch 6, the owner's showcase): the cross-section as documented and measured. Scientific American,
  // 1900-07-21, pp. 38-39 (public domain): a 60 ft roadway, 10 ft sidewalks "supported on brackets" each side, floor beams
  // 5 ft deep (six to each 65 ft span) under thirteen rows of 12 in I-beam joists and riveted buckle plates; two
  // longitudinal plate girders per span carrying the floor's dead load, their underside "just touching" the arches' crowns
  // (the 125th St span's 130 ft long, 10 ft deep, 3 ft wide); the 65 ft arches 3 ft deep, latticed, rectangular; the 125th
  // St arch "a large semicircular arch of 130 feet span... in its relative proportions exactly similar" to the 65 ft ones.
  // So two rib / girder / tower lines 60 ft apart, the sidewalks cantilevered to the fascia at l +-12 (the fascia rows'
  // fit, batch 5). Heights measured: road 23.3 m, crowns' extrados ~20 m.
  // (lc, the deck's centre east of the OSM line: 1.5 -> 1.0 m, the fixes' mid-point -0.5 and the compiled 12th Avenue roadway
  // under the viaduct, l -9.5.. +8.5 in the old frame, centred there too)
  lc: 1.0, hw: 12.0, ribs: [-9.15, 9.15], gy: 3.38,
  deck: 23.3, crown: 20.05, gird: 23.15,
  // the 125th St arch: intrados radius 65 ft (19.81 m), rib 6 ft deep (the "exactly similar" proportion: an inference);
  // the other arches 3 ft deep, their intrados a semicircle on the column spacing
  riR: 19.81, dBig: 1.83, dTyp: 0.91,
  // the transverse arches' intrados crown over the street
  tCrown: 16.0,
};
const NR = [-RS.dir[1], RS.dir[0]];
export const RA = [RS.dir[0], 0, RS.dir[1]], RN = [NR[0], 0, NR[1]];
export const RP = (u, l, y) => [RS.A[0] + RS.dir[0] * u + NR[0] * (l + RS.lc), y, RS.A[1] + RS.dir[1] * u + NR[1] * (l + RS.lc)];
export const rsUL = (x, z) => { const dx = x - RS.A[0], dz = z - RS.A[1]; return [dx * RS.dir[0] + dz * RS.dir[1], dx * NR[0] + dz * NR[1] - RS.lc]; };
export function rsStations() {
  if (RSD_STATIONS && RSD_STATIONS.length && RSD_ARCH) return { st: RSD_STATIONS.slice(), s0: RSD_ARCH[0], s1: RSD_ARCH[1] };
  const s0 = RS.x125 - RS.span125 / 2, s1 = RS.x125 + RS.span125 / 2, out = [];
  const nS = Math.max(1, Math.round((s0 - 6) / 20.5)), nN = Math.max(1, Math.round((RS.L - 6 - s1) / 21.3));
  for (let i = 0; i <= nS; i++) out.push(6 + ((s0 - 6) * i) / nS);
  for (let i = 0; i <= nN; i++) out.push(s1 + ((RS.L - 6 - s1) * i) / nN);
  return { st: out.sort((a, b) => a - b), s0, s1 };
}
let _M = null;
export function rsdMats() {
  if (_M) return _M;
  _M = {
    // aluminium paint over the steel; the deck's
    // underside in its own shade
    steel: steelMat('rsd', { paint: 0xc4c8cb, paint2: 0xa7acb0, rust: 0x7a5238, rustD: 0x4c3a2e, rustAmt: 0.24, rough: 0.52, metal: 0.1, chalk: 0.18, ground: RS.gy, spec: 0.4, amb: 0.8, grime: 0.28 }),
    steelS: steelMat('rsdS', { paint: 0xc4c8cb, paint2: 0xa7acb0, rust: 0x7a5238, rustD: 0x4c3a2e, rustAmt: 0.24, rough: 0.52, metal: 0.1, chalk: 0.18, ground: RS.gy, spec: 0.4, amb: 0.8, grime: 0.28, noShadow: true }),
    // the deck's corrugated pan seen from below (a darker, sootier silver), ridges every 0.12 m across the deck
    deck: steelMat('rsdDeck', { paint: 0x9fa4a8, paint2: 0x92979c, rust: 0x6e4c36, rustD: 0x45342a, rustAmt: 0.3, rough: 0.6, metal: 0.08, rivets: false, corr: 0.12, ground: RS.gy, spec: 0.4, amb: 0.55 }),
    // the towers' bases: a dark painted block
    base: steelMat('rsdBase', { paint: 0x4b5156, paint2: 0x454b50, rust: 0x5e4636, rustD: 0x3a3029, rustAmt: 0.18, rough: 0.7, metal: 0.05, rivets: false, ground: RS.gy, spec: 0.3, amb: 0.8 }),
    granite: otherMat('granite'), conc: otherMat('concrete'), asphalt: otherMat('asphalt'),
    lamp: litMat('vkRsdLamp', 0xffe2b0, 0.2, 3.0),
    yellowL: otherMat('yellow'), whiteL: otherMat('white'),
  };
  return _M;
}
const Y = (h) => RS.gy + h;
// an arch rib's centreline: the circle about (um, yo) of radius R from angle -a0 to a0 (measured from the crown)
function arcC(um, yo, R, a0) {
  return { R, um, yo, a0, at: (t) => { const a = -a0 + 2 * a0 * t; return [um + R * Math.sin(a), yo + R * Math.cos(a), a]; } };
}
// the rib of the span ua..ub: a semicircular intrados (the 125th St arch's of radius 65 ft, the others' of half the column
// spacing) whose extrados crown touches the girders' underside (Y(RS.crown)); its centre lies below the towers' faces, so the
// rib runs into the tower; the centreline stops 0.4 m inside
// the tower (1.5 m along the line)
export function rsArc(ua, ub, big) {
  const dR = big ? RS.dBig : RS.dTyp, Ri = big ? RS.riR : (ub - ua) / 2, um = (ua + ub) / 2;
  const yo = Y(RS.crown) - dR - Ri, R = Ri + dR / 2, e = (ub - ua) / 2 - 0.75 + 0.4;
  const face = (ub - ua) / 2 - 0.75, yAt = (r) => yo + Math.sqrt(Math.max(0, r * r - face * face));
  return { ...arcC(um, yo, R, Math.asin(Math.min(0.999, e / R))), dR, Ri, yIn: yAt(Ri), yEx: yAt(Ri + dR) };
}

// one span between stations ua, ub (the 125th St arch when big): ribs, spandrels, the deck and its fascia, parapet
export function rsdSpan(g, M, ua, ub, big) {
  const st = M.steel, ss = M.steelS;
  const yTop = Y(RS.deck), yG = Y(RS.crown), yGt = Y(RS.gird);
  const arc = rsArc(ua, ub, big), dR = arc.dR;
  const N = big ? 44 : 26;
  // two ribs per span, one under each girder (the documented "two longitudinal plate girders"; no rib between them: the
  // 60 ft floor beams span the whole roadway)
  const RIBS = RS.ribs;
  for (const l of RIBS) {
    const outer = true;
    const pts = [], ups = [], uu = [];
    for (let k = 0; k <= N; k++) { const [u, y, a] = arc.at(k / N); pts.push(RP(u, l, y)); ups.push(norm(add(mul(RA, Math.sin(a)), [0, Math.cos(a), 0]))); uu.push(u); }
    // the rib: a box of two web plates and wide flange plates, the flange angles inside
    const bw = big ? 1.05 : 0.8, wo = bw / 2 - 0.1;
    for (const sx of [-1, 1]) path(g, st, pts, ups, 0.014, dR, { off: [sx * wo, 0], rv: [null, RIV.edges(0.07, 0.11), null, RIV.edges(0.07, 0.11)], seed: 500 + l });
    for (const sy of [-1, 1]) {
      path(g, st, pts, ups, bw, 0.03, { off: [0, sy * (dR / 2 + 0.015)], rv: sy > 0 ? [null, null, RIV.pair(wo, 0.1), null] : [RIV.pair(wo, 0.1), null, null, null], seed: 510 });
      for (const sx of [-1, 1]) path(g, st, pts, ups, 0.014, 0.14, { off: [sx * (wo - 0.014), sy * (dR / 2 - 0.07)], caps: false, seed: 511 });
    }
    const nSt = Math.round((arc.R * 2 * arc.a0) / 1.2);
    for (let k = 1; k < nSt; k++) {
      const [u, y, a] = arc.at(k / nSt), c = RP(u, l, y), up = norm(add(mul(RA, Math.sin(a)), [0, Math.cos(a), 0]));
      for (const sx of [-1, 1]) g.rect(st, add(c, add(mul(RN, sx * (wo + 0.05)), mul(up, -dR / 2 + 0.03))), add(c, add(mul(RN, sx * (wo + 0.05)), mul(up, dR / 2 - 0.03))), RA, 0.08, 0.012, { rv: [] });
    }
    // spandrel posts from the rib's back to the deck's stringers, every ~1.45 m; on the fascia ribs the arcade: slim cast
    // columns (a base ring, a capital ring) under round arches, every ~2.2 m
    const nP = Math.max(3, Math.round((ub - ua) / (outer ? 2.2 : 1.45)));
    const posts = [];
    const nearA = Math.abs((ua + ub) / 2 - RS.x125) < 140;
    for (let k = 1; k < nP; k++) {
      const u = ua + ((ub - ua) * k) / nP;
      const du = u - arc.um; if (Math.abs(du) > arc.R * Math.sin(arc.a0) + 0.1) continue;
      const yb = arc.yo + Math.sqrt(Math.max(0, arc.R * arc.R - du * du)) + dR / 2 + 0.03;
      const yt = yG;
      if (yt - yb < 0.35) continue;
      if (outer) {
        g.cyl(st, RP(u, l, yb), RP(u, l, yt), 0.07, 8, { caps: false });
        if (nearA) {
          g.cyl(st, RP(u, l, yb), RP(u, l, yb + 0.14), 0.1, 8);
          g.cyl(st, RP(u, l, yt - 0.42), RP(u, l, yt - 0.3), 0.1, 8);
        }
      } else ibeam(g, st, RP(u, l, yb), RP(u, l, yt), RN, 0.2, 0.2, 0.014, 0.01, { riv: false });
      posts.push([u, yb, yt]);
    }
    if (outer) {
      // the arcade: tall round-headed bays between the posts, each
      // head a double ring (two concentric semicircles) whose crown nearly meets the girder above, its springing ~1.7 m
      // over a moulded rail; where the spandrel is deep a further tier under each rail, its heads just under it (two
      // tiers over the 125th St arch's haunches); no rosettes
      for (let i = 0; i + 1 < posts.length; i++) {
        // (b6r4 close-up: the rings' feet stood 0.1 m off the posts in the air: the outer ring now springs from the posts and
        // both rings land on an impost bar between them)
        const [pa, ba, ta] = posts[i], [pb, bb] = posts[i + 1], w = pb - pa, r = w / 2 - 0.07, cu = (pa + pb) / 2;
        const low = Math.max(ba, bb);
        let top = ta - 0.22;
        for (let tier = 0; tier < 3; tier++) {
          const cy = top - r;
          if (cy - 0.15 < low) break;
          for (const [rr, bw, bh, sd] of [[r, 0.12, 0.07, 520], [r - 0.13, 0.07, 0.045, 522]]) {
            const q = [], qu = [], nS = nearA ? 7 : 4;
            for (let j = 0; j <= 2 * nS; j++) { const a = Math.PI - (Math.PI * j) / (2 * nS); q.push(RP(cu + rr * Math.cos(a), l, cy + rr * Math.sin(a))); qu.push(norm(add(mul(RA, Math.cos(a)), [0, Math.sin(a), 0]))); }
            path(g, st, q, qu, bw, bh, { seed: sd });
          }
          g.rect(st, RP(pa, l, cy - 0.03), RP(pb, l, cy - 0.03), UP, 0.1, 0.06, { rv: [] });
          const yr = cy - 1.7;
          if (yr - 0.1 < low) break;
          g.rect(st, RP(pa, l, yr), RP(pb, l, yr), UP, 0.12, 0.09, { rv: [] });
          top = yr - 0.2;
        }
      }
    }
  }
  // no struts between the ribs (the photographs along 12th Avenue under the deck show none: the bents' transverse arches
  // and the floor's lateral system brace them); the floor's lateral bracing: crossed angles under the floor beams in every
  // panel (the photographs: an X between each pair of floor beams)
  // the floor (Scientific American 1900-07-21): floor beams 5 ft deep, six to each 65 ft span (twelve under the 130 ft
  // one), framed between the two girders under the 60 ft roadway; on them thirteen rows of 12 in I-beam joists 5 ft apart
  // (the outer two are the girders' lines: eleven drawn) and riveted buckle plates under the paving
  const rb = RS.ribs[1], nF = big ? 12 : 6, yFb = yTop - 0.42 - 0.76;
  // (each floor beam frames into the girders' webs; a span's end floor beams 0.35 m off the bent's centre, so the joists'
  // ends sit on them)
  const uF = (k) => (k === 0 ? ua + 0.35 : k === nF ? ub - 0.35 : ua + ((ub - ua) * k) / nF);
  for (let k = 0; k <= nF; k++) { const u = uF(k); plateGirder(g, st, RP(u, -rb + 0.02, yFb), RP(u, rb - 0.02, yFb), UP, 1.52, 0.3, { stiff: 1.52, seed: 550 }); }
  { const us = []; for (let k = 0; k <= nF; k++) us.push(uF(k));
    const yB = yFb - 0.7;
    for (let k = 0; k + 1 < us.length; k++) {
      angle(g, ss, RP(us[k], -rb + 0.6, yB), RP(us[k + 1], rb - 0.6, yB), UP, 0.1, 0.1, 0.011, { fs: 1, fu: 1, off: [0, -0.05], seed: 540 });
      angle(g, ss, RP(us[k], rb - 0.6, yB), RP(us[k + 1], -rb + 0.6, yB), UP, 0.1, 0.1, 0.011, { fs: 1, fu: 1, off: [0, -0.05], seed: 541 });
    } }
  for (let k = 1; k < 12; k++) { const l = -rb + (2 * rb * k) / 12; ibeam(g, st, RP(ua + 0.2, l, yTop - 0.27), RP(ub - 0.2, l, yTop - 0.27), UP, 0.3, 0.14, 0.015, 0.01, { seed: 560, riv: false }); }
  g.rect(M.deck, RP(ua, 0, yTop - 0.09), RP(ub, 0, yTop - 0.09), UP, 2 * RS.hw - 0.2, 0.14, { caps: false });
  // the roadway between the girders (60 ft): asphalt, the double yellow centre line, white edge lines; the sidewalks out
  // to the fascia over the brackets
  g.rect(M.asphalt, RP(ua, 0, yTop + 0.02), RP(ub, 0, yTop + 0.02), UP, 2 * rb, 0.04, { caps: false });
  for (const l of [-0.15, 0.15]) g.rect(M.yellowL, RP(ua, l, yTop + 0.043), RP(ub, l, yTop + 0.043), UP, 0.1, 0.006, { caps: false });
  for (const l of [-rb + 0.6, rb - 0.6]) g.rect(M.whiteL, RP(ua, l, yTop + 0.043), RP(ub, l, yTop + 0.043), UP, 0.12, 0.006, { caps: false });
  for (const sgn of [-1, 1]) g.rect(M.conc, RP(ua, sgn * (rb + RS.hw) / 2, yTop + 0.1), RP(ub, sgn * (rb + RS.hw) / 2, yTop + 0.1), UP, RS.hw - rb, 0.2, { caps: false });
  const near = ua < RS.x125 + 100 && ub > RS.x125 - 100;
  for (const sgn of [-1, 1]) {
    const l = sgn * rb, yGc = (yG + yGt) / 2;
    // the longitudinal plate girder over the rib (the 125th St span's 10 ft deep and 3 ft wide; the others' width not
    // documented), its underside on the arch's crown, its ends on the towers
    plateGirder(g, st, RP(ua, l, yGc), RP(ub, l, yGc), UP, yGt - yG, big ? 0.91 : 0.6, { stiff: near ? 0.9 : 1.8, seed: 570 });
    if (ua < RS.x125 + 70 && ub > RS.x125 - 70) girderSpikes(g, RP(ua + 0.3, l, yGc), RP(ub - 0.3, l, yGc), UP, yGt - yG, -sgn);
    // the sidewalk's cantilever brackets from the girder's outer face to the fascia:
    // a web plate with a curved bottom flange and a top flange under the sidewalk
    const lg = sgn * (rb + (big ? 0.47 : 0.32)), le = sgn * (RS.hw - 0.06), W = Math.abs(le - lg);
    const yB = yTop - 1.75, yT = yTop - 0.17, ex = mul(RN, sgn), nB = Math.max(2, Math.round((ub - ua) / (near ? 2.2 : 3.25)));
    for (let k = 0; k <= nB; k++) {
      const u = ua + 0.45 + ((ub - ua - 0.9) * k) / nB, O = RP(u, lg, yB), H = yT - yB;
      const bot = []; for (let j = 0; j <= 7; j++) { const t = j / 7; bot.push([W * t, (H - 0.32) * Math.pow(t, 1.7)]); }
      path(g, ss, bot.map(([x, y]) => add(O, add(mul(ex, x), [0, y, 0]))), RA, 0.03, 0.14, { caps: false, seed: 575 });
      g.rect(ss, add(O, [0, H - 0.04, 0]), add(O, add(mul(ex, W), [0, H - 0.04, 0])), RA, 0.1, 0.06, { rv: [] });
      g.rect(ss, add(O, [0, 0, 0]), add(O, [0, H, 0]), RA, 0.12, 0.05, { rv: [] });
      for (const f of [0.3, 0.55, 0.8]) { const yb = (H - 0.32) * Math.pow(f, 1.7); g.rect(ss, add(O, add(mul(ex, W * f), [0, yb, 0])), add(O, add(mul(ex, W * f), [0, H - 0.07, 0])), RA, 0.05, 0.012, { rv: [] }); }
    }
    // sidewalk joists on the brackets
    for (const f of [0.35, 0.75]) ibeam(g, ss, RP(ua, sgn * (rb + (RS.hw - rb) * f), yT - 0.13), RP(ub, sgn * (rb + (RS.hw - rb) * f), yT - 0.13), UP, 0.24, 0.12, 0.012, 0.008, { seed: 562, riv: false });
    // the fascia at the sidewalk's edge: an edge plate and the cornice
    const lf = sgn * RS.hw;
    g.rect(st, RP(ua, lf, yTop - 0.3), RP(ub, lf, yTop - 0.3), UP, 0.03, 0.62, { caps: false, rv: [] });
    g.rect(st, RP(ua, lf + sgn * 0.12, yTop + 0.06), RP(ub, lf + sgn * 0.12, yTop + 0.06), UP, 0.62, 0.16, { caps: false, rv: [] });
    g.rect(st, RP(ua, lf + sgn * 0.08, yTop - 0.62), RP(ub, lf + sgn * 0.08, yTop - 0.62), UP, 0.2, 0.06, { caps: false, rv: [] });
    // the parapet: posts every 2.3 m, a curved top rail over each panel, a bottom rail,
    // pickets and the wire infill
    const lr = lf - sgn * 0.12, yR = yTop + 0.14;
    const nPn = Math.max(1, Math.round((ub - ua) / 2.3));
    for (let k = 0; k < nPn; k++) {
      const u0 = ua + ((ub - ua) * k) / nPn, u1 = ua + ((ub - ua) * (k + 1)) / nPn, q = [];
      for (let j = 0; j <= 6; j++) { const t = j / 6; q.push(RP(u0 + (u1 - u0) * t, lr, yR + 1.0 + 0.2 * Math.sin(Math.PI * t))); }
      path(g, ss, q, UP, 0.1, 0.07, { caps: false, seed: 577 });
      g.rect(ss, RP(u0 + 0.1, lr, yR), RP(u0 + 0.1, lr, yR + 1.08), RA, 0.14, 0.14, { rv: [] });
    }
    g.rect(ss, RP(ua, lr, yR + 0.12), RP(ub, lr, yR + 0.12), UP, 0.08, 0.06, { caps: false, rv: [] });
    for (let u = ua + 0.3; u < ub; u += 0.3) g.rect(ss, RP(u, lr, yR + 0.15), RP(u, lr, yR + 1.0), RA, 0.028, 0.028, { caps: false, rv: [] });
    g.rect(fenceMat(), RP(ua, lr + sgn * 0.03, yR + 0.58), RP(ub, lr + sgn * 0.03, yR + 0.58), UP, 0.004, 0.88, { caps: false, rv: [] });   // the wire infill
  }
}
// a bent: a steel tower (column) under each girder line, braced across, carrying the arches' heels and the girders' ends;
// the columns "oblong in section, about 3 by 5 feet, of latticed plate-girder construction", their plating "carried up
// ... between the spandrels of the arches to the level of the under side of the longitudinal plate girders" (Scientific
// American 1900-07-21)
export function rsdBent(g, M, u, pier) {
  const st = M.steel, ss = M.steelS, yTop = Y(RS.deck), yG = Y(RS.crown);
  // the tower: 1.5 m along the line (the flank the street sees), 1.15 m across
  const TA = 1.5, TB = 1.15;
  // the arches either side of this bent: where their ribs meet the tower's faces
  const { st: S, s0, s1 } = rsStations(), i = S.findIndex((x) => Math.abs(x - u) < 0.01), sides = [];
  if (i > 0) sides.push([-1, rsArc(S[i - 1], u, Math.abs(S[i - 1] - s0) < 0.5 && Math.abs(u - s1) < 0.5), Math.abs(S[i - 1] - s0) < 0.5 && Math.abs(u - s1) < 0.5]);
  if (i >= 0 && i + 1 < S.length) sides.push([1, rsArc(u, S[i + 1], Math.abs(u - s0) < 0.5 && Math.abs(S[i + 1] - s1) < 0.5), Math.abs(u - s0) < 0.5 && Math.abs(S[i + 1] - s1) < 0.5]);
  for (const l of RS.ribs) {
    const sg = Math.sign(l);
    // the base: a dark painted block round the tower's foot
    // (the other columns stand on pale concrete pedestals about 1.5 m high: the photographs from 12th Avenue)
    const PA = 1.95, PB = 2.4, bm = pier ? M.base : M.conc, hp = pier ? 0.7 : 1.25;
    g.rect(bm, RP(u, l, RS.gy - 0.3), RP(u, l, Y(hp)), RA, PA, PB);
    frustum(g, bm, RP(u, l, 0), RN, PA, PB, PA - 0.25, PB - 0.25, Y(hp), Y(hp + 0.25));
    // the tower: solid plate flanks (the street sides) with flat-bar strips and splice bands, a diamond lattice on the
    // faces along the line, up to the girder's underside
    const yF = Y(hp + 0.25);
    laced(g, st, RP(u, l, yF), RP(u, l, yG), RA, TB, TA, { seed: 600, pitch: 0.75, double: true, bar: 0.09 });
    for (const sx of [-1, 1]) {
      const lf = l + sx * (TB / 2 + 0.015);
      for (let du = -0.6; du <= 0.601; du += 0.3) g.rect(st, RP(u + du, lf, yF + 0.1), RP(u + du, lf, yG - 0.7), RA, 0.03, 0.09, { rv: [null, null, null, null] });
      for (const fy of [0.2, 0.4, 0.6, 0.8]) {
        const yb = yF + (yG - yF) * fy;
        g.rect(st, RP(u - TA / 2 + 0.05, l + sx * (TB / 2 + 0.03), yb), RP(u + TA / 2 - 0.05, l + sx * (TB / 2 + 0.03), yb), UP, 0.02, 0.3, { rv: [null, RIV.edges(0.05, 0.1), null, RIV.edges(0.05, 0.1)] });
      }
    }
    // a downspout down the street flank with its brackets
    { const lf = l + sg * (TB / 2 + 0.1), ux = u - TA / 2 + 0.2;
      g.cyl(ss, RP(ux, lf, yF), RP(ux, lf, yG - 0.5), 0.055, 8, { caps: false });
      for (let y = yF + 0.65; y < yG - 0.6; y += 1.7) g.rect(ss, RP(ux, lf - sg * 0.06, y), RP(ux, lf - sg * 0.06, y + 0.06), RA, 0.05, 0.12, { rv: [] });
    }
    // the tower's cast foot and its cap under the girder: two shallow bands
    castBase(g, st, RP(u, l, 0), RA, TA, TB, yF, { h: 1.1 });
    // the 125th St arch's towers plated on the faces along the line too
    if (pier) for (const sd of [-1, 1]) g.rect(st, RP(u + sd * (TA / 2 + 0.008), l, Y(1.0)), RP(u + sd * (TA / 2 + 0.008), l, yG - 0.6), RA, TB - 0.04, 0.014, { rv: [null, RIV.edges(0.05, 0.1), null, RIV.edges(0.05, 0.1)] });
    g.rect(st, RP(u, l, yG - 0.6), RP(u, l, yG - 0.4), RA, TB + 0.08, TA + 0.06, { rv: [] });
    g.rect(st, RP(u, l, yG - 0.4), RP(u, l, yG), RA, TB + 0.14, TA + 0.12, { rv: [] });
    // the skewback where each arch's rib enters the tower: side plates either side of the heel from below its intrados
    // to above its extrados, and a riveted shelf under it
    for (const [sd, arc, big] of sides) {
      const uf = u + sd * (TA / 2 - 0.02), half = (big ? 1.05 : 0.8) / 2 + 0.03, out = big ? 1.4 : 0.8;
      const yi = arc.yIn, ye = arc.yEx;
      for (const dl of [-half, half]) gusset(g, st, RP(uf, l + dl, yi - 0.7), RP(uf + sd * out, l + dl, yi - 0.1), RP(uf + sd * out, l + dl, ye + 0.15), RP(uf, l + dl, ye + 0.45), 0.022, { seed: 650 });
      g.rect(st, RP(uf, l, yi - 0.72), RP(uf + sd * 0.55, l, yi - 0.72), UP, 2 * half + 0.1, 0.05, { rv: [] });
    }
  }
  // the bent's transverse arch across 12th Avenue: a semicircle on the clear width between the
  // columns, 3 ft deep (as the 65 ft arches), two chords and a double diamond lattice, its feet in the columns' inner faces;
  // over it an arcade of posts and round heads up to a lattice cap under the girders
  const rb = RS.ribs[1], clear = rb - TB / 2, dT = 0.91, yo = Y(RS.tCrown) - clear, RT = clear + dT / 2;
  const a0 = Math.asin(Math.min(0.999, (clear + 0.3) / RT)), NA = 28;
  const at = (t, r) => { const a = -a0 + 2 * a0 * t; return [r * Math.sin(a), yo + r * Math.cos(a), a]; };
  for (const dc of [-1, 1]) {
    const q = [], qu = [];
    for (let k = 0; k <= NA; k++) { const [l, y, a] = at(k / NA, RT + dc * (dT / 2 - 0.05)); q.push(RP(u, l, y)); qu.push(norm(add(mul(RN, Math.sin(a)), [0, Math.cos(a), 0]))); }
    path(g, st, q, qu.map(() => RA), 0.012, 0.42, { seed: 660 });                       // the chord's plate (0.42 wide along the line)
    path(g, st, q, qu, 0.36, 0.1, { seed: 661, caps: false, rv: [] });                      // the chord's angles
  }
  const nL = Math.round((RT * 2 * a0) / 0.55);
  for (const du of [-0.19, 0.19]) {
    for (let k = 0; k < nL; k++) {
      const [l0, y0] = at(k / nL, RT - dT / 2 + 0.06), [l1, y1] = at((k + 1) / nL, RT + dT / 2 - 0.06);
      const [l2, y2] = at(k / nL, RT + dT / 2 - 0.06), [l3, y3] = at((k + 1) / nL, RT - dT / 2 + 0.06);
      g.rect(ss, RP(u + du, l0, y0), RP(u + du, l1, y1), RA, 0.08, 0.012, { rv: [] });
      g.rect(ss, RP(u + du, l2, y2), RP(u + du, l3, y3), RA, 0.08, 0.012, { rv: [] });
    }
  }
  // the lattice cap under the girders and the arcade between it and the arch's back
  const yCap = yG - 0.8;
  latticeStrut(g, ss, RP(u, -rb + 0.6, yCap), RP(u, rb - 0.6, yCap), UP, 0.8, { seed: 640 });
  const nPo = 8, posts = [];
  for (let k = 1; k < nPo; k++) {
    const l = -clear + (2 * clear * k) / nPo, yb = yo + Math.sqrt(Math.max(0, (clear + dT) ** 2 - l * l)) + 0.02, yt = yCap - 0.4;
    if (yt - yb < 0.4) { posts.push(null); continue; }
    g.cyl(ss, RP(u, l, yb), RP(u, l, yt), 0.065, 8, { caps: false });
    posts.push([l, yb, yt]);
  }
  for (let k = 0; k + 1 < posts.length; k++) {
    if (!posts[k] || !posts[k + 1]) continue;
    const [la, ba] = posts[k], [lb, bb] = posts[k + 1], r = (lb - la) / 2 - 0.065, cl = (la + lb) / 2, cy = yCap - 0.45 - r;
    if (cy < Math.max(ba, bb) + 0.2) continue;
    const q = [], qu = [];
    for (let j = 0; j <= 10; j++) { const a = Math.PI - (Math.PI * j) / 10; q.push(RP(u, cl + r * Math.cos(a), cy + r * Math.sin(a))); qu.push(norm(add(mul(RN, Math.cos(a)), [0, Math.sin(a), 0]))); }
    path(g, ss, q, qu, 0.1, 0.06, { seed: 662 });
    g.rect(ss, RP(u, la, cy - 0.03), RP(u, lb, cy - 0.03), UP, 0.08, 0.05, { rv: [] });
  }
  // a lamp pole on the parapet at every other station
  return [RP(u, -RS.hw + 0.12, yTop + 0.14), RP(u, RS.hw - 0.12, yTop + 0.14)];
}
export function rsdLamp(g, M, base, sgn) {
  const top = add(base, [0, 8.8, 0]), arm = add(top, mul(RN, -sgn * 1.8));
  g.cyl(M.steelS, base, top, 0.09, 8);
  g.cyl(M.steelS, base, add(base, [0, 0.6, 0]), 0.16, 8);
  g.rect(M.steelS, top, arm, UP, 0.08, 0.08, { rv: [] });
  g.rect(M.lamp, add(arm, [0, -0.12, 0]), add(arm, mul(RN, -sgn * 0.7)).map((v, i) => (i === 1 ? v - 0.12 : v)), UP, 0.3, 0.14, { rv: [] });
}
void sub;
