// AR33 HPT: the two LONG ISLAND gantries (the Long Island Rail Road's 1925 float-bridge transfer cranes) as real steel (pure
// geometry: Builders per material, no scene; node tests import it). Local frame of one gantry: x across the tracks (to the SSW
// so the words read from the river), y up from the water (the park's deck is at DECK), z toward the river. Measured on the
// Commons photographs (2019 series, docs/notes/ar33-hpt.md):
//   * two battered (tapering) riveted lattice towers, H-section corner posts, angle struts and X diagonals on four faces,
//     gusset plates at the joints, on steel base plates and plinths at the deck;
//   * a deep plate girder on the tower tops, overhanging at both ends, with knee braces down to the towers;
//   * the machinery house on it: riveted wall panels with battens, 4-pane windows, a low gable roof with ribs, the vent stacks
//     along the ridge, gable ends;
//   * the hoist: a sheave housing under the girder and two eyebar chains with pin plates hanging in the opening;
//   * the operator's house between the frames on its own posts with a steep stair, and the railed catwalk between the houses.
import * as THREE from 'three';
import { Builder, angle, wide, rect, circle, channel, railing, X1, Y1, Z1 } from './hptSignSteel.js';

export const DECK = 3.54;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ANG6 = angle(0.15, 0.013), ANG4 = angle(0.1, 0.0095), ANG3 = angle(0.076, 0.0064);
const HCOL = wide(0.36, 0.34, 0.019, 0.026), HBEAM = wide(0.36, 0.17, 0.0075, 0.0115), CH10 = channel(0.25, 0.08, 0.009);

// a rivet head: a five-sided low dome (pyramid) on a surface at p, pointing along the unit normal n
const _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3();
function rivet(B, p, n, r = 0.021, h = 0.014) {
  _t1.set(Math.abs(n.y) < 0.9 ? 0 : 1, Math.abs(n.y) < 0.9 ? 1 : 0, 0).cross(n).normalize(); _t2.crossVectors(n, _t1);
  const apex = V(p.x + n.x * h, p.y + n.y * h, p.z + n.z * h), ring = [];
  for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; ring.push(V(p.x + (_t1.x * Math.cos(a) + _t2.x * Math.sin(a)) * r, p.y + (_t1.y * Math.cos(a) + _t2.y * Math.sin(a)) * r, p.z + (_t1.z * Math.cos(a) + _t2.z * Math.sin(a)) * r)); }
  for (let k = 0; k < 5; k++) {
    const a = ring[k], b = ring[(k + 1) % 5], nn = V(0, 0, 0).add(a).add(b).sub(V(p.x * 2, p.y * 2, p.z * 2)).normalize().multiplyScalar(0.6).addScaledVector(n, 0.8).normalize();
    B.tri(a, b, apex, nn, nn, n, [0, 0], [1, 0], [0.5, 1]);
  }
}
// a gusset with its rivets: the plate (o, ex, ey, poly) plus a head at each (x, y) of `pts` on its front face
function gusset(B, o, ex, ey, poly, t, pts, out) {
  B.plate(o, ex, ey, poly, t);
  const nz = V(0, 0, 0).crossVectors(ex, ey).normalize(), O = V(o[0], o[1], o[2]);
  if (out && nz.dot(out) < 0) nz.negate();           // the heads go on the face that looks out of the tower
  for (const [x, y] of pts) rivet(B, V(O.x + ex.x * x + ey.x * y + nz.x * t / 2, O.y + ex.y * x + ey.y * y + nz.y * t / 2, O.z + ex.z * x + ey.z * y + nz.z * t / 2), nz);
}
const RIV = [[0.1, -0.2], [0.27, -0.2], [0.45, -0.2], [0.1, 0.2], [0.27, 0.2], [0.45, 0.2]];

// a battered riveted lattice tower centred at (cx, cz), from y0 to y1; b* half sizes at the base, t* at the top
function tower(S, cx, cz, y0, y1, bx, bz, tx, tz, N) {
  const lev = (i) => { const t = i / N; return { y: y0 + (y1 - y0) * t, hx: bx + (tx - bx) * t, hz: bz + (tz - bz) * t }; };
  const cor = (i, sx, sz) => { const l = lev(i); return [cx + sx * l.hx, l.y, cz + sz * l.hz]; };
  const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  for (let i = 0; i < N; i++) {
    for (const [sx, sz] of corners) S.member(HCOL, cor(i, sx, sz), cor(i + 1, sx, sz), [sx, 0, sz]);
  }
  // struts and diagonals on the four faces (offset 0.07 out of the face so they clear the posts)
  for (let i = 0; i <= N; i++) {
    const l = lev(i);
    // z faces: x from -hx to +hx at z = +/-hz
    for (const sz of [1, -1]) S.member(ANG4, [cx - l.hx, l.y, cz + sz * (l.hz + 0.05)], [cx + l.hx, l.y, cz + sz * (l.hz + 0.05)], [0, 0, sz]);
    for (const sx of [1, -1]) S.member(ANG4, [cx + sx * (l.hx + 0.05), l.y, cz - l.hz], [cx + sx * (l.hx + 0.05), l.y, cz + l.hz], [sx, 0, 0]);
  }
  for (let i = 0; i < N; i++) {
    const a = lev(i), b = lev(i + 1);
    for (const sz of [1, -1]) {
      S.member(ANG3, [cx - a.hx, a.y + 0.1, cz + sz * (a.hz + 0.08)], [cx + b.hx, b.y - 0.1, cz + sz * (b.hz + 0.08)], [0, 0, sz]);
      S.member(ANG3, [cx + a.hx, a.y + 0.1, cz + sz * (a.hz + 0.08)], [cx - b.hx, b.y - 0.1, cz + sz * (b.hz + 0.08)], [0, 0, sz]);
    }
    for (const sx of [1, -1]) {
      S.member(ANG3, [cx + sx * (a.hx + 0.08), a.y + 0.1, cz - a.hz], [cx + sx * (b.hx + 0.08), b.y - 0.1, cz + b.hz], [sx, 0, 0]);
      S.member(ANG3, [cx + sx * (a.hx + 0.08), a.y + 0.1, cz + a.hz], [cx + sx * (b.hx + 0.08), b.y - 0.1, cz - b.hz], [sx, 0, 0]);
    }
  }
  // gusset plates at the corners of every level, on the two faces that meet there
  for (let i = 0; i <= N; i++) {
    const l = lev(i);
    for (const [sx, sz] of corners) {
      gusset(S, [cx + sx * l.hx, l.y, cz + sz * (l.hz + 0.04)], V(-sx, 0, 0), Y1, [[0, -0.3], [0.55, -0.3], [0.55, 0.3], [0, 0.3]], 0.012, RIV, V(0, 0, sz));
      gusset(S, [cx + sx * (l.hx + 0.04), l.y, cz + sz * l.hz], V(0, 0, -sz), Y1, [[0, -0.3], [0.55, -0.3], [0.55, 0.3], [0, 0.3]], 0.012, RIV, V(sx, 0, 0));
    }
  }
}

// A stair from (x0, y0, z) up to (x1, y1, z) along x: two channel stringers and bar-grating treads with a pipe rail
function stair(S, x0, y0, x1, y1, z, w = 0.85) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), n = Math.round(L / 0.3);
  for (const s of [-1, 1]) S.member(CH10, [x0, y0 - 0.12, z + s * w / 2], [x1, y1 - 0.12, z + s * w / 2], [0, 0, 1]);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, x = x0 + dx * t, y = y0 + dy * t;
    S.box([x, y, z], 0.14, 0.012, w / 2 - 0.02);
  }
  const off = [0, 1, 0];
  for (const s of [-1, 1]) {
    S.member(circle(0.022, 8), [x0, y0 + 1.0, z + s * (w / 2 + 0.03)], [x1, y1 + 1.0, z + s * (w / 2 + 0.03)], off, { smooth: true, caps: false });
    for (let i = 0; i <= 4; i++) { const t = i / 4; S.member(rect(0.04, 0.04), [x0 + dx * t, y0 + dy * t, z + s * (w / 2 + 0.03)], [x0 + dx * t, y0 + dy * t + 1.0, z + s * (w / 2 + 0.03)], [1, 0, 0]); }
  }
}

// One gantry. G = { W, HB, HT } (GANTRY.LONG / ISLAND in hptSignData.js). Returns { steel, roof, glass, conc, wood, rail } Builders.
export function gantryGeo(G, which) {
  const D0 = G.deck ?? DECK;   // the towers' foot (AR34: the south pair stands on caissons lower than the park's deck)
  const steel = new Builder(), roof = new Builder(), glass = new Builder(), conc = new Builder(), wood = new Builder(), rail = new Builder();
  const W = G.W, hw = W / 2, HB = G.HB, HT = G.HT;
  const legX = hw - 1.75, yG0 = HB - 1.45, wallH = (HT - HB) * 0.69, yE = HB + wallH, dz = 1.72;
  // ---- the two lattice towers on base plates and plinths
  for (const sx of [-1, 1]) {
    const cx = sx * legX;
    conc.box([cx, D0 + 0.28, 0], 2.05, 0.28, 2.05);
    steel.box([cx, D0 + 0.58, 0], 1.85, 0.03, 1.85);
    tower(steel, cx, 0, D0 + 0.6, yG0, 1.72, 1.78, 1.4, 1.45, Math.round((yG0 - D0 - 0.6) / 1.15));
    for (const px of [-1, 1]) for (const pz of [-1, 1]) {
      steel.member(circle(0.05, 6), [cx + px * 1.5, D0 + 0.6, cz(pz)], [cx + px * 1.5, D0 + 0.72, cz(pz)], null, { caps: true });
    }
  }
  function cz(p) { return p * 1.5; }
  // ---- the girder on the towers: web, flanges, stiffeners both faces, overhanging ends, knee braces
  const gl = hw + 0.75;
  steel.box([0, (yG0 + HB) / 2, 0], gl, (HB - yG0) / 2 - 0.05, dz - 0.05);
  for (const z of [-dz, dz]) {
    steel.box([0, yG0 + 0.03, z * 0.97], gl, 0.03, 0.17);            // bottom flange plate
    steel.box([0, HB - 0.03, z * 0.97], gl, 0.03, 0.17);             // top flange plate
    for (let x = -gl + 0.6; x < gl - 0.3; x += 1.25) steel.member(ANG4, [x, yG0 + 0.06, z + Math.sign(z) * 0.0], [x, HB - 0.06, z], [0, 0, Math.sign(z)]);
    for (let x = -gl + 0.6; x < gl - 0.3; x += 1.25) steel.box([x + 0.05, (yG0 + HB) / 2, z * 1.0], 0.02, (HB - yG0) / 2 - 0.12, 0.015);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    steel.member(HBEAM, [sx * (legX + 1.1), yG0 - 2.4, sz * 1.4], [sx * (gl - 0.4), yG0 + 0.1, sz * 1.4], [0, 0, 1]);
  }
  // ---- the machinery house: walls, battens and bands, windows, the gable roof with ribs, the stacks
  const hl = hw + 0.45, hz = 1.7;
  steel.box([0, HB + wallH / 2, 0], hl, wallH / 2, hz);
  for (const z of [-1, 1]) {
    for (let x = -hl + 0.65; x < hl - 0.3; x += 1.3) steel.box([x, HB + wallH / 2, z * (hz + 0.012)], 0.045, wallH / 2 - 0.05, 0.012);      // battens
    for (const y of [HB + 0.55, HB + wallH * 0.55, yE - 0.15]) steel.box([0, y, z * (hz + 0.016)], hl - 0.05, 0.06, 0.016);                   // bands
  }
  // windows (4 panes): frame, glass, muntins
  const win = (x, y, z, sgn, w = 0.95, h = 1.25) => {
    steel.box([x, y, z + sgn * 0.02], w / 2 + 0.07, h / 2 + 0.07, 0.03);
    glass.box([x, y, z + sgn * 0.04], w / 2, h / 2, 0.012);
    steel.box([x, y, z + sgn * 0.058], 0.022, h / 2, 0.012); steel.box([x, y, z + sgn * 0.058], w / 2, 0.022, 0.012);
  };
  const nwin = which === 'LONG' ? 3 : 4;
  for (let i = 0; i < nwin; i++) {
    const x = (-0.42 + (0.84 * (i + 0.5)) / nwin) * W;
    win(x, HB + wallH * 0.66, -hz - 0.0, -1);
  }
  const winX = (x, y, sgn, w = 0.9, h = 1.15) => {
    steel.box([x + sgn * 0.02, y, 0], 0.03, h / 2 + 0.07, w / 2 + 0.07);
    glass.box([x + sgn * 0.04, y, 0], 0.012, h / 2, w / 2);
    steel.box([x + sgn * 0.058, y, 0], 0.012, h / 2, 0.022); steel.box([x + sgn * 0.058, y, 0], 0.012, 0.022, w / 2);
  };
  for (const sx of [-1, 1]) winX(sx * hl, HB + wallH * 0.62, sx);
  // the gable ends and the roof: ridge at HT, eaves overhanging 0.35 m
  const eave = hz + 0.4;
  for (const sx of [-1, 1]) {
    const x = sx * (hl + 0.006);
    const tri = [[-hz, yE], [hz, yE], [0, HT - 0.06]];
    steel.plate([x, 0, 0], V(0, 0, sx > 0 ? -1 : 1), Y1, tri.map(([z, y]) => [z, y]), 0.02);
  }
  const slope = Math.hypot(eave, HT - yE);
  for (const sz of [-1, 1]) {
    const a = [-hl - 0.3, yE - 0.02, sz * eave], b = [-hl - 0.3, HT, 0], c = [hl + 0.3, HT, 0], d = [hl + 0.3, yE - 0.02, sz * eave];
    const n = V(0, eave, sz * (HT - yE)).normalize();
    const T = (p, q, r, uvp, uvq, uvr) => roof.tri(V(...p), V(...q), V(...r), n, n, n, uvp, uvq, uvr);
    // two-sided roof sheet (thin): top face only plus an underside via the rib lines
    if (sz > 0) { T(a, d, c, [0, 0], [2 * hl + 0.6, 0], [2 * hl + 0.6, slope]); T(a, c, b, [0, 0], [2 * hl + 0.6, slope], [0, slope]); }
    else { T(a, b, c, [0, 0], [0, slope], [2 * hl + 0.6, slope]); T(a, c, d, [0, 0], [2 * hl + 0.6, slope], [2 * hl + 0.6, 0]); }
    // ribs (corrugation read): a thin bar every 0.75 m up the slope
    for (let x = -hl - 0.15; x < hl + 0.3; x += 0.75) {
      const p0 = [x, yE + 0.01, sz * (eave - 0.02)], p1 = [x, HT + 0.02, sz * 0.02];
      roof.member(rect(0.035, 0.03), p0, p1, [0, 1, 0]);
    }
    // the eave gutter
    roof.member(rect(0.12, 0.1), [-hl - 0.3, yE - 0.06, sz * eave], [hl + 0.3, yE - 0.06, sz * eave], [0, 1, 0]);
  }
  roof.member(circle(0.06, 8), [-hl - 0.3, HT + 0.03, 0], [hl + 0.3, HT + 0.03, 0], null, { smooth: true, caps: false });   // the ridge roll
  const nst = which === 'LONG' ? 4 : 5;
  for (let i = 0; i < nst; i++) {
    const x = (-0.38 + (0.76 * i) / (nst - 1)) * W, h = 1.3 + (i % 2) * 0.55;
    roof.member(circle(0.13, 10), [x, HT - 0.1, 0.0], [x, HT + h, 0.0], null, { smooth: true, caps: true });
    roof.member(circle(0.18, 10), [x, HT + h - 0.06, 0.0], [x, HT + h + 0.05, 0.0], null, { smooth: true, caps: true });
  }
  // ---- the hoists: two per frame, each a spoked sheave under the girder in the
  // frame's plane and two eyebar chains hanging from its sides nearly to the deck, pinned every 2.4 m, a clevis block at the foot
  {
    const yT = yG0 - 0.05, yW = yT - 1.05, R = 0.78, yLow = D0 + 0.95, RIM = rect(0.1, 0.14), SPOKE = rect(0.06, 0.05);
    const xs = which === 'LONG' ? [-0.2 * W, 0.08 * W] : [-0.17 * W, 0.12 * W];
    for (const hx of xs) {
      steel.box([hx, yT - 0.16, 0], 0.42, 0.16, 0.95);                                  // the bearing block under the girder
      for (const z of [-0.5, 0.5]) steel.box([hx, yW + 0.5, z], 0.08, 0.6, 0.05);       // its hangers to the axle
      for (let k = 0; k < 20; k++) {                                                    // the rim
        const a0 = (k / 20) * Math.PI * 2, a1 = ((k + 1) / 20) * Math.PI * 2;
        steel.member(RIM, [hx + Math.cos(a0) * R, yW + Math.sin(a0) * R, 0], [hx + Math.cos(a1) * R, yW + Math.sin(a1) * R, 0], [0, 0, 1], { caps: false });
      }
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + 0.26; steel.member(SPOKE, [hx, yW, 0], [hx + Math.cos(a) * (R - 0.04), yW + Math.sin(a) * (R - 0.04), 0], [0, 0, 1]); }
      steel.member(circle(0.17, 12), [hx, yW, -0.16], [hx, yW, 0.16], null, { smooth: true, caps: true });   // the hub
      steel.member(circle(0.06, 8), [hx, yW, -0.62], [hx, yW, 0.62], null, { smooth: true, caps: true });    // the axle
      for (const sx of [-1, 1]) {
        const x = hx + sx * R;
        for (let y = yW; y > yLow + 0.3; y -= 2.4) {
          const y1 = Math.max(yLow + 0.25, y - 2.4);
          for (const z of [-0.085, 0.085]) steel.box([x, (y + y1) / 2, z], 0.028, (y - y1) / 2, 0.075);      // the eyebar pair
          steel.member(circle(0.075, 8), [x, y1, -0.2], [x, y1, 0.2], null, { smooth: true, caps: true });   // the pin
          steel.box([x, y1, 0], 0.11, 0.16, 0.05);                                      // the link plate between
        }
      }
      steel.box([hx, yLow + 0.12, 0], R + 0.2, 0.2, 0.3);                               // the clevis block
      steel.box([hx, yLow - 0.25, 0], 0.3, 0.25, 0.3);                                  // its foot on the deck
    }
  }
  return { steel, roof, glass, conc, wood, rail, dims: { hw, legX, yG0, yE, dz, hl, wallH } };
}

// The cabin between the frames and the catwalk over it, in a frame centred between the two gantries (x across, y up, z toward the river)
export function cabinGeo(gap) {
  const steel = new Builder(), glass = new Builder(), roof = new Builder();
  const Lw = Math.min(gap - 1.0, 8.4), Dp = 4.2, y0 = 6.4, y1 = 10.0;
  steel.box([0, (y0 + y1) / 2, 0], Lw / 2, (y1 - y0) / 2, Dp / 2);
  for (let x = -Lw / 2 + 0.6; x < Lw / 2 - 0.3; x += 1.2) for (const z of [-1, 1]) steel.box([x, (y0 + y1) / 2, z * (Dp / 2 + 0.012)], 0.04, (y1 - y0) / 2 - 0.06, 0.012);
  // the window band on the land side and the river side, a door
  for (const z of [-1, 1]) for (let k = 0; k < 4; k++) {
    const x = -Lw / 2 + 1.1 + k * ((Lw - 2.2) / 3);
    steel.box([x, 8.6, z * (Dp / 2 + 0.02)], 0.52, 0.72, 0.025); glass.box([x, 8.6, z * (Dp / 2 + 0.04)], 0.44, 0.64, 0.01);
  }
  // a low pitched roof
  const ridge = y1 + 0.9;
  for (const z of [-1, 1]) {
    const a = [-Lw / 2 - 0.25, y1, z * (Dp / 2 + 0.25)], b = [-Lw / 2 - 0.25, ridge, 0], c = [Lw / 2 + 0.25, ridge, 0], d = [Lw / 2 + 0.25, y1, z * (Dp / 2 + 0.25)];
    const n = V(0, Dp / 2 + 0.25, z * (ridge - y1)).normalize();
    const T = (p, q, r, uvp, uvq, uvr) => roof.tri(V(...p), V(...q), V(...r), n, n, n, uvp, uvq, uvr);
    if (z > 0) { T(a, d, c, [0, 0], [Lw, 0], [Lw, 2.2]); T(a, c, b, [0, 0], [Lw, 2.2], [0, 2.2]); } else { T(a, b, c, [0, 0], [0, 2.2], [Lw, 2.2]); T(a, c, d, [0, 0], [Lw, 2.2], [Lw, 0]); }
  }
  // its posts down to the deck
  for (const x of [-Lw / 2 + 0.5, Lw / 2 - 0.5]) for (const z of [-1.5, 1.5]) steel.member(HCOL, [x, DECK + 0.6, z], [x, y0, z], [1, 0, 0]);
  for (const z of [-1.5, 1.5]) { steel.member(ANG4, [-Lw / 2 + 0.5, DECK + 0.8, z], [Lw / 2 - 0.5, y0 - 0.2, z], [0, 0, 1]); steel.member(ANG4, [Lw / 2 - 0.5, DECK + 0.8, z], [-Lw / 2 + 0.5, y0 - 0.2, z], [0, 0, 1]); }
  stair(steel, 3.2, DECK + 0.6, 0.4, y0, -Dp / 2 - 0.6);
  return { steel, glass, roof };
}
// the catwalk between two houses: a grated deck 2 m wide at y, length gap, with truss rails (x from -gap/2 to gap/2)
export function catwalkGeo(gap, y) {
  const steel = new Builder();
  steel.box([0, y - 0.08, 0], gap / 2, 0.08, 1.0);
  for (const z of [-1, 1]) {
    steel.member(ANG3, [-gap / 2, y + 1.05, z * 1.0], [gap / 2, y + 1.05, z * 1.0], [0, 1, 0]);
    steel.member(ANG3, [-gap / 2, y + 0.1, z * 1.0], [gap / 2, y + 0.1, z * 1.0], [0, 1, 0]);
    const n = Math.round(gap / 0.95);
    for (let i = 0; i <= n; i++) { const x = -gap / 2 + (gap * i) / n; steel.member(ANG3, [x, y + 0.1, z], [x, y + 1.05, z], [1, 0, 0]); if (i < n) steel.member(ANG3, [x, y + (i % 2 ? 1.05 : 0.1), z], [x + gap / n, y + (i % 2 ? 0.1 : 1.05), z], [1, 0, 0]); }
  }
  return { steel };
}
