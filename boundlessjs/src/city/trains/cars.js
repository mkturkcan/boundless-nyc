// TRAINS (AR34, docs/notes/ar34-trains.md): procedural rail cars to the published dimensions.
//   R62A (Bombardier 1984-87; the 1 train, two 5-car units): 51.04 ft (15.557 m) over the couplers, 8.60 ft (2.621 m) wide,
//     11.89 ft (3.624 m) high, platform (floor) height 3.65 ft (1.113 m), three 50 in double doors a side; stainless with
//     the end bonnets (Wikipedia "R62A (New York City Subway car)", read 2026-10-02).
//   M7A (Bombardier 2002-04; Metro-North's Harlem and Hudson lines, married pairs): 85 ft (25.908 m), 10 ft 6 in (3.200 m)
//     wide, 13 ft 3 in (4.039 m) high, floor 4 ft 3 in (1.295 m) (Wikipedia "M7 (railcar)", read 2026-10-02).
//   M8 (Kawasaki 2008-; the New Haven line, married pairs and singles): 85 ft, 10 ft 5 in (3.175 m) wide, 14 ft 7.5 in
//     (4.458 m) over the folded pantograph; red ends (Wikipedia "M8 (railcar)", read 2026-10-02).
// The looks (doors, windows, lamps, the R62A's two rub strips, the number plates, the M7A's blue chevron band, the M8's red
// stripe and ends) from photographs at the two stations (Wikimedia Commons, 2011-2026; listed in the notes).
// Car frame: x along the car (+x = the "front" end of the car), y up from the top of rail, z across.
import { TKit, plane, rrect, vnoise, hash3 } from './kit.js';

const IN = 0.0254, FT = 0.3048;
export const SPECS = {
  r62a: {
    kind: 'r62a', LC: 51.04 * FT, LB: 15.24, W: 8.6 * FT, H: 11.89 * FT, FLOOR: 3.65 * FT, SILL: 0.97, EAVE: 2.99,
    doors: [-5.1, 0, 5.1], doorW: 50 * IN, leaves: 2, doorY1: 2.95, winY: [1.99, 2.87], winR: 0.1,
    // windows per side: [centre x, width, kind] (kind 'sign': the side route sign stands behind it)
    wins: [[-6.75, 0.8], [-2.55, 1.3], [2.55, 1.3, 'sign'], [6.75, 0.8]],
    beads: [1.44, 1.87], roofFlutes: 34, roofN: 2.7,
    truckX: 35 * FT / 2, wheelBase: 2.0, wheelR: 14 * IN, shoe: { z: 1.55, y: 0.062, under: false },
    endKind: 'r62a', seats: 'long', seatCols: [[0.98, 0.52, 0.1], [0.98, 0.7, 0.12]],
    lampZ: 0.86, num: 'num0', numCols: 4,
  },
  m7a: {
    kind: 'm7a', LC: 85 * FT, LB: 25.45, W: 10.5 * FT, H: 13.25 * FT - 0.2, HT: 13.25 * FT, FLOOR: 51 * IN, SILL: 1.0, EAVE: 3.38,
    doors: [-6.36, 6.36], doorW: 1.27, leaves: 2, doorY1: 3.27, winY: [2.22, 2.98], winR: 0.11,
    wins: [[-11.0, 1.05], [-9.55, 1.05], [-8.1, 1.05], [-4.42, 1.05], [-2.95, 1.05], [-1.48, 1.05], [0, 1.05], [1.48, 1.05], [2.95, 1.05], [4.42, 1.05], [8.1, 1.05], [9.55, 1.05], [11.0, 1.05, 'cab']],
    beads: [], roofFlutes: 0, roofN: 3.2,
    truckX: 59.5 * FT / 2, wheelBase: 8.5 * FT, wheelR: 0.42, shoe: { z: 1.42, y: -0.065, under: true },
    endKind: 'm7a', seats: 'trans', seatCols: [[0.27, 0.33, 0.5], [0.3, 0.36, 0.52]],
    lampZ: 1.05, num: 'numM', numCols: 4, numBase: 0,
  },
  m8: {
    kind: 'm8', LC: 85 * FT, LB: 25.45, W: 125 * IN, H: (14 * 12 + 7.5) * IN - 0.53, HT: (14 * 12 + 7.5) * IN, FLOOR: 51 * IN, SILL: 1.0, EAVE: 3.36,
    doors: [-10.55, 10.25], doorW: 1.07, leaves: 1, doorY1: 3.27, winY: [2.12, 3.02], winR: 0.09,
    wins: [[-8.7, 1.15], [-7.3, 1.15], [-5.9, 1.15], [-4.5, 1.15], [-3.1, 1.15], [-1.7, 1.15], [-0.3, 1.15], [1.1, 1.15], [2.5, 1.15], [3.9, 1.15], [5.3, 1.15], [6.7, 1.15], [8.1, 1.15]],
    beads: [], roofFlutes: 0, roofN: 3.0, stripe: [1.62, 2.0],
    truckX: 59.5 * FT / 2, wheelBase: 8.5 * FT, wheelR: 0.42, shoe: { z: 1.42, y: -0.065, under: true },
    endKind: 'm8', seats: 'trans', seatCols: [[0.2, 0.24, 0.34], [0.23, 0.27, 0.38]],
    lampZ: 1.0, num: 'numM', numCols: 4, numBase: 8,
  },
};

// weathering: grime toward the sill and the roof, rubbed streaks, noise (multiplies the class colour)
function weatherFn(S) {
  return (c, p, n) => {
    const y = p[1];
    let k = 1;
    const low = Math.max(0, Math.min(1, (S.SILL + 0.9 - y) / 0.9));          // the lower body darkens toward the sill
    k *= 1 - 0.12 * low * low;
    if (n[1] > 0.35 && y > S.EAVE - 0.05) k *= 0.8 + 0.12 * vnoise(p[0] * 0.7, p[2] * 2.1, 3.1);   // roof grime
    const streak = vnoise(p[0] * 3.1, y * 0.35, p[2] * 0.6);
    k *= 0.95 + 0.06 * streak;
    if (y < S.SILL) k *= 0.85 + 0.15 * vnoise(p[0] * 1.3, y * 2, p[2]);
    return [c[0] * k, c[1] * k, c[2] * k];
  };
}

// the cross-section: from the right sill up the side, over the roof, down the left side ([z, y])
function section(S, flutes) {
  const hw = S.W / 2, b = S.H - S.EAVE, out = [];
  out.push([hw, S.SILL]);
  out.push([hw, S.EAVE]);
  const N = 22;
  for (let i = 1; i <= N; i++) {
    const t = (i / N) * (Math.PI / 2), c = Math.cos(t), s = Math.sin(t);
    out.push([hw * Math.sign(c) * Math.abs(c) ** (2 / S.roofN), S.EAVE + b * Math.abs(s) ** (2 / S.roofN)]);
  }
  const half = out.slice();
  for (let i = half.length - 2; i >= 0; i--) out.push([-half[i][0], half[i][1]]);
  if (!flutes) return out;
  // the R62A's roof sheets: corrugations from the cant rail over the crown (flat facets: ridge / valley)
  const roof = out.filter((p) => p[1] > S.EAVE + 0.12);
  const res = out.filter((p) => p[1] <= S.EAVE + 0.12 && p[0] > 0);
  const tail = out.filter((p) => p[1] <= S.EAVE + 0.12 && p[0] < 0);
  // resample the roof arc in 2*flutes steps, pulling alternate points 12 mm toward the car's middle (the valleys)
  let L = 0; const seg = [];
  for (let i = 1; i < roof.length; i++) { const d = Math.hypot(roof[i][0] - roof[i - 1][0], roof[i][1] - roof[i - 1][1]); seg.push(d); L += d; }
  const M2 = flutes * 2, fl = [];
  for (let j = 0; j <= M2; j++) {
    let s = (L * j) / M2, i = 0; while (i < seg.length - 1 && s > seg[i]) { s -= seg[i]; i++; }
    const t = Math.min(1, s / seg[i]), a = roof[i], q = roof[i + 1];
    const p = [a[0] + (q[0] - a[0]) * t, a[1] + (q[1] - a[1]) * t];
    if (j % 2 === 1) { const dz = -p[0], dy = S.EAVE - 1.0 - p[1], l = Math.hypot(dz, dy) || 1; p[0] += (dz / l) * 0.012; p[1] += (dy / l) * 0.012; }
    fl.push(p);
  }
  return [...res, ...fl, ...tail];
}

const GREY = [1, 1, 1];
// ------------------------------------------------------------------------------------------------ the body
export function buildCar(kind, lod = 0) {
  const S = SPECS[kind], k = new TKit();
  k.weather = weatherFn(S);
  const hw = S.W / 2, xe = S.LB / 2;
  const ST = 'stainless', DK = 'dark', GL = 'glass', IN_ = 'interior', LT = 'lit', LP = 'lamps', SG = 'signs', DC = 'decals', PT = 'paint';
  const red = [0.74, 0.07, 0.07], blue = [0.1, 0.2, 0.5], black = [0.03, 0.03, 0.035];
  const endCol = kind === 'm7a' ? blue : kind === 'm8' ? red : null;     // painted cab ends
  // ---- the shell: sides with the door and window openings, the roof, the ends
  const holesFor = (sgn) => {
    const H = [];
    for (const dx of S.doors) {
      const w = S.leaves === 1 ? S.doorW : S.doorW;
      H.push({ u0: sgn * dx - w / 2, u1: sgn * dx + w / 2, v0: S.SILL - 0.01, v1: S.doorY1, r: 0, door: true });
    }
    for (const [cx, w] of S.wins) H.push({ u0: sgn * cx - w / 2, u1: sgn * cx + w / 2, v0: S.winY[0], v1: S.winY[1], r: S.winR });
    return H;
  };
  for (const sgn of [1, -1]) {
    // +z side: U = +x; -z side: U = -x (u = sgn * x)
    const pl = plane([0, 0, sgn * hw], [sgn, 0, 0], [0, 1, 0]);
    const holes = holesFor(sgn);
    const cu = []; for (let x = -xe; x <= xe; x += 1.0) cu.push(x);
    const cv = [S.SILL + 0.25, S.SILL + 0.6, S.SILL + 1.0, S.winY[0], S.winY[1]];
    if (lod === 0) {
      k.wall(ST, pl, -xe, xe, S.SILL, S.EAVE, holes, GREY, 0, cu, cv);
      // door and window reveals, gaskets (black rubber round the glass), door frame posts
      for (const h of holes) {
        if (h.door) {
          k.reveal(ST, pl, h, 0.05, [0.7, 0.7, 0.72]);
          for (const u of [h.u0 - 0.05, h.u1]) k.box(ST, ...xr(pl, u, u + 0.05), h.v0, h.v1 + 0.04, ...zr(sgn, hw, 0, 0.012), GREY);
          k.box(ST, ...xr(pl, h.u0 - 0.05, h.u1 + 0.05), h.v1, h.v1 + 0.05, ...zr(sgn, hw, 0, 0.012), GREY);
          // the threshold plate
          k.box(DK, ...xr(pl, h.u0, h.u1), S.FLOOR - 0.03, S.FLOOR, ...zr(sgn, hw, -0.08, 0.0), [0.32, 0.3, 0.28]);
        } else {
          const ow = h.u1 - h.u0, oh = h.v1 - h.v0, cx = (h.u0 + h.u1) / 2, cy = (h.v0 + h.v1) / 2;
          k.reveal(ST, pl, h, 0.035, [0.75, 0.75, 0.77]);
          k.band(DK, pl, rrect(cx, cy, ow + 0.05, oh + 0.05, h.r + 0.025, 3), rrect(cx, cy, ow - 0.03, oh - 0.03, Math.max(0.01, h.r - 0.015), 3), [0.05, 0.05, 0.055], 0, 0.008, -0.004);
          k.fan(GL, pl, rrect(cx, cy, ow, oh, h.r, 3), GREY, 0, -0.03);
        }
      }
      // rub strips (half-round beads), broken at the doors
      for (const by of S.beads) {
        const segs = []; let a = -xe + 0.12;
        for (const dx of [...S.doors].sort((p, q) => p - q)) { segs.push([a, dx - S.doorW / 2 - 0.08]); a = dx + S.doorW / 2 + 0.08; }
        segs.push([a, xe - 0.12]);
        for (const [x0, x1] of segs) k.cyl(ST, [x0, by, sgn * (hw + 0.004)], [x1, by, sgn * (hw + 0.004)], 0.012, 6, [1.08, 1.08, 1.08]);
      }
      // the M8's stripe: a red band under the windows, a dark line under it (painted on the side sheet)
      if (S.stripe) {
        const [y0, y1] = S.stripe;
        k.wall(PT, pl, -xe + 0.05, xe - 0.05, y0, y1, holes.filter((h) => h.door).map((h) => ({ ...h, v0: y0 - 1, v1: y1 + 1 })), red, 0, cu, [], 0.003);
        k.wall(PT, pl, -xe + 0.05, xe - 0.05, y0 - 0.07, y0 - 0.03, holes.filter((h) => h.door).map((h) => ({ ...h, v0: y0 - 1, v1: y1 + 1 })), [0.12, 0.12, 0.13], 0, cu, [], 0.003);
      }
      // the side route sign behind the 'sign' window (R62A), door-open lamps at the ends of the side (amber), the number
      // plates and the flag (decals)
      for (const [cx, w, tag] of S.wins) {
        if (tag !== 'sign') continue;
        const u = sgn * cx, uv = cellUVs.side1, sw = Math.min(w - 0.12, 0.98), sh = sw * (uv.h / uv.w);
        quadUV(k, SG, pl, u - sw / 2, u + sw / 2, S.winY[1] - 0.12 - sh, S.winY[1] - 0.12, -0.05, uv, 0);
      }
      for (const ex of [-1, 1]) {
        const u = sgn * ex * (xe - 0.28);
        k.cyl(LP, pl.at(u, S.EAVE - 0.12, 0), pl.at(u, S.EAVE - 0.12, 0.025), 0.035, 8, [1.0, 0.55, 0.08], 5);
      }
      if (kind === 'r62a') {
        for (const ex of [-1, 1]) {
          const xc = ex * 6.05;                  // between the end window and the door (car 2336, Commons 2022)
          const u = sgn * xc, nv = cellUVs.num0, fw = 0.42, fh = fw * (nv.h / nv.w);
          quadUV(k, DC, pl, u - fw / 2, u + fw / 2, S.winY[1] - fh, S.winY[1], 0.004, nv, 1);
          const fv = cellUVs.flag, gw = 0.42, gh = gw * (fv.h / fv.w);
          quadUV(k, DC, pl, u - gw / 2, u + gw / 2, S.winY[1] - fh - 0.08 - gh, S.winY[1] - fh - 0.08, 0.004, fv, 0);
        }
      } else {
        for (const ex of [-1, 1]) {
          const u = sgn * ex * (xe - 1.05), nv = cellUVs.numM, fw = 0.5, fh = fw * (nv.h / nv.w);
          quadUV(k, DC, pl, u - fw / 2, u + fw / 2, S.SILL + 0.25, S.SILL + 0.25 + fh, 0.004, nv, 1);
        }
      }
    } else {
      // LOD1: the side sheet in a few quads, the window and door openings as dark glazing (no interior)
      k.wall(ST, pl, -xe, xe, S.SILL, S.EAVE, holes, GREY, 0, [-xe / 2, 0, xe / 2], [S.SILL + 0.5]);
      for (const h of holes) {
        if (h.door) continue;
        k.fan('winFar', pl, rrect((h.u0 + h.u1) / 2, (h.v0 + h.v1) / 2, h.u1 - h.u0, h.v1 - h.v0, h.r, 2), [0.1, 0.11, 0.12], 0, -0.02);
      }
      if (S.stripe) k.wall(PT, pl, -xe + 0.05, xe - 0.05, S.stripe[0], S.stripe[1], holes.filter((h) => h.door).map((h) => ({ ...h, v0: 0, v1: 9 })), red, 0, [], [], 0.003);
    }
  }
  // the roof (and the cant rail): the section above the eave, extruded; the R62A's corrugated
  const sec = section(S, lod === 0 ? S.roofFlutes : 0).filter((p) => p[1] >= S.EAVE - 1e-6);
  k.extrude(ST, sec, -xe, xe, GREY, 0, { smooth: !(lod === 0 && S.roofFlutes), ctr: [0, S.EAVE - 1], segs: lod === 0 ? 6 : 2 });
  // roof equipment
  if (kind === 'r62a') {
    for (const ex of [-1, 1]) {
      // the air intake grilles near each end (dark louvres in a raised frame)
      const x0 = ex * (xe - 2.9), x1 = ex * (xe - 1.9);
      // (flush with the crown: the published 11.89 ft is the car's height over the roof)
      k.box(ST, Math.min(x0, x1), Math.max(x0, x1), S.H - 0.07, S.H - 0.004, -0.42, 0.42, [0.92, 0.92, 0.94]);
      if (lod === 0) k.box(DK, Math.min(x0, x1) + 0.05, Math.max(x0, x1) - 0.05, S.H - 0.004, S.H, -0.37, 0.37, [0.06, 0.06, 0.06]);
    }
  } else {
    // the HVAC units at both ends and, on the M8, the folded pantograph's base and the roof equipment covers
    // (the housings: louvred sides, a fan grille on top, a darker skirt where they meet the roof; Commons 2026: the M8's
    // stand tall over the cab ends, the M7A's lower)
    const hv = kind === 'm8' ? 0.2 : 0.2, hw2 = kind === 'm8' ? 1.05 : 0.95;
    for (const ex of [-1, 1]) {
      const x0 = ex * (xe - 4.6), x1 = ex * (xe - 1.2), xa0 = Math.min(x0, x1), xa1 = Math.max(x0, x1);
      k.box(ST, xa0, xa1, S.H - 0.08, S.H + hv, -hw2, hw2, [0.84, 0.85, 0.86]);
      k.box(DK, xa0 - 0.02, xa1 + 0.02, S.H - 0.08, S.H - 0.02, -hw2 - 0.02, hw2 + 0.02, [0.16, 0.16, 0.17], 0, 'y');
      if (lod === 0) {
        for (const sz of [-1, 1]) for (let x = xa0 + 0.2; x < xa1 - 0.2; x += 0.12) k.box(DK, x, x + 0.06, S.H + 0.01, S.H + hv - 0.04, ...(sz > 0 ? [hw2, hw2 + 0.012] : [-hw2 - 0.012, -hw2]), [0.09, 0.09, 0.1]);
        // the fan grilles, flush with the housing's top (the published heights are over these units)
        for (const fx of [xa0 + 0.85, xa1 - 0.85]) { k.cyl(DK, [fx, S.H + hv - 0.006, 0], [fx, S.H + hv + 0.0005, 0], 0.42, 16, [0.07, 0.07, 0.075]); k.cyl(ST, [fx, S.H + hv - 0.004, 0], [fx, S.H + hv + 0.001, 0], 0.08, 8, [0.6, 0.6, 0.62]); }
      }
    }
    if (kind === 'm8') {
      k.box(DK, -3.4, 3.4, S.H - 0.05, S.H + 0.32, -1.05, 1.05, [0.24, 0.25, 0.26]);
      if (lod === 0) {
        // the pantograph folded on its base (insulators, frame, the pan head)
        for (const z of [-0.6, 0.6]) for (const x of [-1.2, 1.2]) k.cyl(DK, [x, S.H + 0.32, z], [x, S.H + 0.4, z], 0.06, 8, [0.55, 0.42, 0.3]);
        k.box(DK, -1.4, 1.4, S.H + 0.4, S.H + 0.44, -0.75, 0.75, [0.2, 0.2, 0.21]);
        k.cyl(DK, [-1.3, S.H + 0.45, 0], [1.6, S.H + 0.48, 0], 0.03, 6, [0.25, 0.25, 0.26]);
        k.box(DK, 1.45, 1.75, S.H + 0.48, S.H + 0.53, -0.95, 0.95, [0.18, 0.18, 0.19]);
      }
    }
  }
  // ---- the ends
  for (const ex of [1, -1]) endBuild(k, S, ex, lod, { endCol, black, cab: kind === 'r62a' ? true : ex > 0 });
  // ---- the underframe: sill, floor plate, equipment boxes, reservoirs
  const yU = S.SILL;
  k.box(DK, -xe + 0.05, xe - 0.05, yU - 0.1, yU + 0.02, -hw + 0.02, hw - 0.02, [0.12, 0.115, 0.11], 0, 'Y');
  k.box(DK, -xe + 0.05, xe - 0.05, yU - 0.12, yU - 0.1, -hw + 0.25, hw - 0.25, [0.09, 0.085, 0.08], 0, 'Y');
  const boxes = kind === 'r62a'
    ? [[-3.9, -2.45, 0.42], [-2.25, -0.95, 0.36], [-0.7, 0.85, 0.45], [1.1, 2.55, 0.4], [2.8, 3.95, 0.38]]
    : [[-11.2, -9.6, 0.5], [-7.9, -5.2, 0.62], [-4.9, -2.4, 0.66], [-2.1, 0.4, 0.6], [0.7, 3.6, 0.66], [3.9, 6.9, 0.62], [7.2, 8.6, 0.5]];
  boxes.forEach(([x0, x1, h], i) => {
    for (const sgn of [1, -1]) {
      const c = 0.07 + 0.05 * hash3(i, sgn, 1.7);
      const z0 = sgn > 0 ? 0.25 : -hw + 0.18, z1 = sgn > 0 ? hw - 0.18 : -0.25;
      k.box(DK, x0, x1, yU - 0.12 - h, yU - 0.12, z0, z1, [c, c * 0.97, c * 0.93], 0, 'Y');
      if (lod === 0) {
        // louvres / covers on the outer face
        const zf = sgn > 0 ? z1 : z0;
        for (let x = x0 + 0.15; x < x1 - 0.2; x += 0.45) k.box(DK, x, x + 0.3, yU - 0.12 - h * 0.75, yU - 0.12 - h * 0.25, ...(sgn > 0 ? [zf, zf + 0.012] : [zf - 0.012, zf]), [c * 1.5, c * 1.45, c * 1.4]);
      }
    }
  });
  if (lod === 0) for (const z of [-0.55, 0.55]) k.cyl(DK, [-2.0, yU - 0.42, z], [2.0, yU - 0.42, z], 0.16, 10, [0.1, 0.1, 0.1]);   // air reservoirs
  // ---- the interior (LOD0): floor, liners with the openings, ceiling with light strips and ad cards, seats, poles
  if (lod === 0) interiorBuild(k, S, holesFor);
  const geos = k.build();
  return { geos, tris: k.tris(), spec: S };
}

// x range of a plane's u range (planes with U = +-x)
function xr(pl, u0, u1) { const a = pl.at(u0, 0)[0], b = pl.at(u1, 0)[0]; return [Math.min(a, b), Math.max(a, b)]; }
// z range just outside / inside the side sheet: d0..d1 along the outward normal
function zr(sgn, hw, d0, d1) { const a = sgn * (hw + d0), b = sgn * (hw + d1); return [Math.min(a, b), Math.max(a, b)]; }

// atlas cells (mats.js CELLS, in UV: three's flipY puts v = 0 at the bottom)
import { CELLS, ATLAS } from './mats.js';
const cuv = (name) => { const c = CELLS[name]; return { u0: c[0] / ATLAS.W, u1: (c[0] + c[2]) / ATLAS.W, v0: 1 - (c[1] + c[3]) / ATLAS.H, v1: 1 - c[1] / ATLAS.H, w: c[2], h: c[3] }; };
export const cellUVs = { bullet1: cuv('bullet1'), side1: cuv('side1'), flag: cuv('flag'), num0: cuv('num0'), numM: cuv('numM'), dest0: cuv('dest0'), chevron: cuv('chevron') };
// a textured quad in plane pl (u0..u1, v0..v1 at depth d) mapped to an atlas cell, `aux` 1 = number cell (per instance)
function quadUV(k, key, pl, u0, u1, v0, v1, d, uv, aux) {
  const o = k._b(key), P = [pl.at(u0, v0, d), pl.at(u1, v0, d), pl.at(u1, v1, d), pl.at(u0, v1, d)];
  const T = [[uv.u0, uv.v0], [uv.u1, uv.v0], [uv.u1, uv.v1], [uv.u0, uv.v1]], n = pl.N;
  for (const i of [0, 1, 2, 0, 2, 3]) { o.p.push(...P[i]); o.n.push(...n); o.uv.push(...T[i]); o.c.push(1, 1, 1); o.a.push(aux); }
}

// ------------------------------------------------------------------------------------------------ an end
function endBuild(k, S, ex, lod, o) {
  const hw = S.W / 2, xe = ex * S.LB / 2;
  // the end plane: normal +x at the + end (U = -z), -x at the - end (U = +z)
  const pl = plane([xe, 0, 0], [0, 0, -ex], [0, 1, 0]);
  const ST = 'stainless', DK = 'dark', GL = 'glass', LP = 'lamps', SG = 'signs', PT = 'paint';
  const painted = !!o.endCol && o.cab;
  const BODY = painted ? PT : ST, bodyCol = painted ? o.endCol : [0.84, 0.84, 0.85];   // the ends face the low sun square on: a shade duller than the sides
  const W = S.W, lz = S.lampZ;
  // openings: the storm door (inset panel), the two end windows
  const isR = S.kind === 'r62a';
  const dW = isR ? 0.66 : 0.72, dY0 = S.FLOOR + 0.03, dY1 = S.doorY1;
  const wY0 = isR ? 2.08 : S.FLOOR + 1.12, wY1 = isR ? 2.86 : S.FLOOR + 1.95, wW = isR ? 0.6 : 0.86;
  const holes = [{ u0: -dW / 2, u1: dW / 2, v0: dY0, v1: dY1, r: 0 }];
  if (o.cab) for (const s of [-1, 1]) holes.push({ u0: s * lz - wW / 2, u1: s * lz + wW / 2, v0: wY0, v1: wY1, r: 0.07 });
  if (lod === 0) {
    k.wall(BODY, pl, -hw, hw, S.SILL, S.EAVE, holes, bodyCol, 0, [-0.7, 0.7], [S.SILL + 0.5, S.FLOOR + 0.6]);
  } else k.wall(BODY, pl, -hw, hw, S.SILL, S.EAVE, [], bodyCol, 0, [], []);
  // the bonnet over the eave (the end's top: the roof section closed)
  const sec = section(S, 0).filter((p) => p[1] >= S.EAVE - 1e-6);
  for (let i = 0; i + 1 < sec.length; i++) {
    const a = sec[i], b = sec[i + 1];
    k.tri(BODY, [xe, S.EAVE, 0], [xe, a[1], a[0]], [xe, b[1], b[0]], [ex, 0, 0], bodyCol);
  }
  if (lod > 0) {
    if (o.cab) for (const s of [-1, 1]) k.fan('winFar', pl, rrect(s * lz, (wY0 + wY1) / 2, wW, wY1 - wY0, 0.07, 2), [0.08, 0.09, 0.1], 0, 0.004);
    k.fan(ST, pl, rrect(0, (dY0 + dY1) / 2, dW, dY1 - dY0, 0, 1), painted ? [0.3, 0.3, 0.3] : [0.85, 0.85, 0.87], 0, 0.002);
    lampsEnd(k, S, pl, ex, lz, o, lod);
    return;
  }
  // the storm door: an inset panel with its window, a hand rail
  const sp = plane([xe - ex * 0.035, 0, 0], [0, 0, -ex], [0, 1, 0]);
  const dwH = { u0: -0.21, u1: 0.21, v0: isR ? 2.1 : wY0, v1: isR ? 2.8 : wY1, r: 0.06 };
  k.wall(BODY, sp, -dW / 2, dW / 2, dY0, dY1, [dwH], painted ? o.endCol : [0.8, 0.8, 0.81], 0, [], [dY0 + 0.5]);
  k.reveal(ST, pl, holes[0], 0.035, [0.6, 0.6, 0.62]);
  k.band(DK, sp, rrect(0, (dwH.v0 + dwH.v1) / 2, 0.47, dwH.v1 - dwH.v0 + 0.05, 0.08, 3), rrect(0, (dwH.v0 + dwH.v1) / 2, 0.4, dwH.v1 - dwH.v0 - 0.02, 0.05, 3), [0.04, 0.04, 0.045], 0, 0.008);
  k.fan(GL, sp, rrect(0, (dwH.v0 + dwH.v1) / 2, 0.42, dwH.v1 - dwH.v0, 0.06, 3), GREY, 0, -0.02);
  // the end windows: gaskets, glass; the R62A's route sign stands behind the right one, the cab window has a wiper
  if (o.cab) for (const s of [-1, 1]) {
    const h = holes[s < 0 ? 1 : 2], cx = s * lz, cy = (wY0 + wY1) / 2;
    k.reveal(ST, pl, h, 0.04, [0.6, 0.6, 0.62]);
    k.band(DK, pl, rrect(cx, cy, wW + 0.06, wY1 - wY0 + 0.06, 0.1, 3), rrect(cx, cy, wW - 0.03, wY1 - wY0 - 0.03, 0.05, 3), [0.04, 0.04, 0.045], 0, 0.01);
    k.fan(GL, pl, rrect(cx, cy, wW, wY1 - wY0, 0.07, 3), GREY, 0, -0.035);
    if (isR && s > 0) quadUV(k, SG, pl, cx - 0.21, cx + 0.21, cy - 0.12, cy + 0.3, -0.07, cellUVs.bullet1, 0);
    if (!isR || s < 0) {   // the wiper: arm and blade
      const p0 = pl.at(cx - 0.12 * s, wY1 + 0.03, 0.03), p1 = pl.at(cx + 0.05 * s, wY0 + 0.16, 0.03);
      k.cyl(DK, p0, p1, 0.008, 4, [0.05, 0.05, 0.05], 0, false);
    }
  }
  // the M8's front: the black window surround, the LED destination sign over it
  if (S.kind === 'm8' && o.cab) {
    k.wall(DK, pl, -hw + 0.18, hw - 0.18, wY0 - 0.12, wY1 + 0.1, holes.slice(1).concat([{ ...holes[0], v0: 0, v1: 9 }]), [0.035, 0.035, 0.04], 0, [], [], 0.004);
    const dv = cellUVs.dest0, sw = 1.3, sh = sw * (dv.h / dv.w);
    quadUV(k, SG, pl, -sw / 2, sw / 2, wY1 + 0.2, wY1 + 0.2 + sh, 0.006, { ...dv, v0: dv.v1 - (dv.v1 - dv.v0) }, 2);
    k.box(DK, ...[xe, xe + ex * 0.005].sort((a, b) => a - b), wY1 + 0.16, wY1 + 0.24 + sh, -sw / 2 - 0.04, sw / 2 + 0.04, [0.03, 0.03, 0.03]);
  }
  // the M7A's front band: white chevrons on blue, over the lamps
  if (S.kind === 'm7a' && o.cab) {
    const cv = cellUVs.chevron, y0 = S.FLOOR + 0.42, y1 = y0 + 0.34;
    for (const s of [-1, 1]) quadUV(k, 'decals', pl, s > 0 ? 0.34 : -hw + 0.14, s > 0 ? hw - 0.14 : -0.34, y0, y1, 0.005, cv, 0);
  }
  lampsEnd(k, S, pl, ex, lz, o, lod);
  // the R62A's storm door: the pressed V under its window (two raised strips meeting low on the door; Commons 2025/2026)
  if (isR) for (const s of [-1, 1]) {
    const a = sp.at(s * 0.2, dwH.v0 - 0.06, 0.008), b = sp.at(s * 0.02, S.FLOOR + 0.42, 0.008);
    k.cyl(ST, a, b, 0.014, 5, [0.92, 0.92, 0.93], 0, false);
  }
  // anticlimber (ribbed), the coupler and its head, the step and the grab irons
  const xa = xe, xo = xe + ex * 0.11;
  for (let i = 0; i < 3; i++) { const y = S.SILL - 0.04 + i * 0.05; k.box(DK, Math.min(xa, xo), Math.max(xa, xo), y, y + 0.03, -hw + 0.25, hw - 0.25, [0.15, 0.14, 0.13]); }
  const cy = isR ? 0.78 : 0.88, xc = xe + ex * (S.LC - S.LB) / 2;
  k.box(DK, Math.min(xe, xc - ex * 0.08), Math.max(xe, xc - ex * 0.08), cy - 0.07, cy + 0.07, -0.08, 0.08, [0.14, 0.12, 0.1]);
  k.box(DK, Math.min(xc - ex * 0.1, xc), Math.max(xc - ex * 0.1, xc), cy - 0.14, cy + 0.14, -0.16, 0.16, [0.16, 0.13, 0.1]);
  for (const s of [-1, 1]) {
    const gz = s * (hw - 0.12);
    k.cyl(ST, [xe + ex * 0.06, S.FLOOR + 0.35, gz], [xe + ex * 0.06, S.FLOOR + 1.35, gz], 0.016, 6, [0.9, 0.9, 0.9]);
    k.box(ST, Math.min(xe, xe + ex * 0.08), Math.max(xe, xe + ex * 0.08), S.FLOOR + 0.35, S.FLOOR + 0.37, gz - 0.02, gz + 0.02, [0.9, 0.9, 0.9]);
    k.box(ST, Math.min(xe, xe + ex * 0.08), Math.max(xe, xe + ex * 0.08), S.FLOOR + 1.33, S.FLOOR + 1.35, gz - 0.02, gz + 0.02, [0.9, 0.9, 0.9]);
  }
  if (isR) k.box(ST, Math.min(xe, xe + ex * 0.22), Math.max(xe, xe + ex * 0.22), S.SILL - 0.2, S.SILL - 0.18, -0.6, -0.25, [0.8, 0.8, 0.8]);   // the step
  // the diaphragm (MNR blind ends: a dark bellows round the end door)
  if (!isR && !o.cab) {
    const d0 = xe, d1 = xe + ex * (S.LC - S.LB) / 2 - ex * 0.01;
    k.box(DK, Math.min(d0, d1), Math.max(d0, d1), S.FLOOR - 0.05, S.doorY1 + 0.15, -0.62, -0.5, [0.05, 0.05, 0.05]);
    k.box(DK, Math.min(d0, d1), Math.max(d0, d1), S.FLOOR - 0.05, S.doorY1 + 0.15, 0.5, 0.62, [0.05, 0.05, 0.05]);
    k.box(DK, Math.min(d0, d1), Math.max(d0, d1), S.doorY1 + 0.03, S.doorY1 + 0.15, -0.62, 0.62, [0.05, 0.05, 0.05]);
  }
}
// head / marker lamps on an end: aux 1/2 at the + end (white / red), 3/4 at the - end
function lampsEnd(k, S, pl, ex, lz, o, lod) {
  const LP = 'lamps', DK = 'dark', ST = 'stainless';
  const aW = ex > 0 ? 1 : 3, aR = ex > 0 ? 2 : 4;
  const white = [1.0, 0.93, 0.78], redL = [1.0, 0.08, 0.04];
  const isR = S.kind === 'r62a', seg = lod === 0 ? 14 : 6;
  const lamp = (u, v, r, col, aux) => {
    if (lod === 0) { k.cyl(ST, pl.at(u, v, 0), pl.at(u, v, 0.045), r + 0.03, seg, [0.95, 0.95, 0.97]); k.cyl(DK, pl.at(u, v, 0.045), pl.at(u, v, 0.05), r + 0.012, seg, [0.06, 0.06, 0.06], 0, false); }
    k.disc(LP, pl.at(u, v, lod === 0 ? 0.052 : 0.006), pl.N, r, seg, col, aux);
  };
  if (isR) {
    for (const s of [-1, 1]) { lamp(s * lz, 1.83, 0.075, redL, aR); lamp(s * lz, 1.47, 0.085, white, aW); }
  } else if (S.kind === 'm7a') {
    if (o.cab) {
      for (const s of [-1, 1]) lamp(s * 0.26, S.H - 0.33, 0.085, white, aW);
      for (const s of [-1, 1]) { lamp(s * 0.55, S.FLOOR + 0.59, 0.08, white, aW); lamp(s * 1.12, S.FLOOR + 0.59, 0.07, redL, aR); }
    } else for (const s of [-1, 1]) lamp(s * 1.2, S.FLOOR + 0.6, 0.05, redL, aR);
  } else {
    if (o.cab) {
      lamp(0, S.H - 0.3, 0.09, white, aW);
      for (const s of [-1, 1]) { lamp(s * 1.12, S.FLOOR + 0.52, 0.085, redL, aR); lamp(s * 1.12, S.FLOOR + 0.18, 0.09, white, aW); }
    } else for (const s of [-1, 1]) lamp(s * 1.2, S.FLOOR + 0.6, 0.05, redL, aR);
  }
}

// ------------------------------------------------------------------------------------------------ the interior
function interiorBuild(k, S, holesFor) {
  const hw = S.W / 2, xe = S.LB / 2 - 0.06, IN_ = 'interior', LT = 'lit', F = S.FLOOR;
  const liner = [0.8, 0.78, 0.73], floorC = [0.3, 0.29, 0.28], ceil = [0.88, 0.87, 0.84];
  // floor
  k.box(IN_, -xe, xe, F - 0.02, F, -hw + 0.05, hw - 0.05, floorC, 0, 'y');
  // liners (inner face of the sides) with the openings, facing in
  for (const sgn of [1, -1]) {
    const pl = plane([0, 0, sgn * (hw - 0.06)], [-sgn, 0, 0], [0, 1, 0]);      // normal -sgn z (into the car)
    const holes = holesFor(sgn).map((h) => ({ u0: -h.u1, u1: -h.u0, v0: h.v0, v1: h.v1, r: h.r }));
    k.wall(IN_, pl, -xe, xe, F, S.EAVE - 0.05, holes, liner, 0, [], [F + 0.9]);
  }
  // end walls (inside), with the storm door window
  for (const ex of [1, -1]) {
    const pl = plane([ex * xe, 0, 0], [0, 0, ex], [0, 1, 0]);                 // facing into the car
    k.wall(IN_, pl, -hw + 0.06, hw - 0.06, F, S.EAVE - 0.05, [{ u0: -0.21, u1: 0.21, v0: S.kind === 'r62a' ? 2.1 : F + 1.12, v1: S.kind === 'r62a' ? 2.8 : F + 1.95, r: 0.05 }], [0.74, 0.72, 0.68]);
  }
  // ceiling: a shallow vault from the liners' tops, two light strips, ad cards in the coves
  const y0 = S.EAVE - 0.05, yc = S.H - 0.3;
  const prof = [[hw - 0.06, y0], [hw - 0.45, y0 + 0.2], [0.55, yc - 0.03], [0, yc], [-0.55, yc - 0.03], [-hw + 0.45, y0 + 0.2], [-hw + 0.06, y0]];
  k.extrude(IN_, prof, -xe, xe, ceil, 0, { smooth: false, ctr: [0, 12], segs: 4 });   // facing down, into the car
  const strip = [1.0, 0.97, 0.9];
  for (const s of [-1, 1]) k.box(LT, -xe + 0.3, xe - 0.3, yc - 0.06, yc - 0.035, s * 0.56 - 0.09, s * 0.56 + 0.09, strip, 0, 'Y');
  // ad cards along the coves (blank / invented: flat colour fields with a light band)
  const adCols = [[0.85, 0.3, 0.2], [0.2, 0.45, 0.75], [0.95, 0.8, 0.3], [0.3, 0.6, 0.4], [0.9, 0.9, 0.88], [0.55, 0.3, 0.6]];
  let adI = 0;
  for (let x = -xe + 0.6; x < xe - 1.2; x += 0.95) {
    for (const sgn of [1, -1]) {
      const c = adCols[(adI++ * 7 + (sgn > 0 ? 3 : 0)) % adCols.length];
      const zA = sgn * (hw - 0.07), zB = sgn * (hw - 0.4);
      k.quad(LT, [x, y0 + 0.01, zA], [x + 0.85, y0 + 0.01, zA], [x + 0.85, y0 + 0.17, zB], [x, y0 + 0.17, zB], [0, 0.7, -sgn * 0.7], c.map((v) => v * 0.55));
    }
  }
  // seats
  const doorsSorted = [...S.doors].sort((a, b) => a - b), gaps = [];
  let a = -xe + (S.kind === 'r62a' ? 0.7 : 1.6);
  for (const d of doorsSorted) { gaps.push([a, d - S.doorW / 2 - 0.15]); a = d + S.doorW / 2 + 0.15; }
  gaps.push([a, xe - (S.kind === 'r62a' ? 0.7 : 1.6)]);
  if (S.seats === 'long') {
    let si = 0;
    for (const [g0, g1] of gaps) {
      const n = Math.floor((g1 - g0) / 0.44), w = (g1 - g0) / Math.max(1, n);
      for (let i = 0; i < n; i++) for (const sgn of [1, -1]) {
        const x0 = g0 + i * w + 0.01, x1 = g0 + (i + 1) * w - 0.01, c = S.seatCols[(si++ + (sgn > 0 ? 1 : 0)) % 2];
        const zw = sgn * (hw - 0.07), zi = sgn * (hw - 0.5);
        k.box(IN_, x0, x1, F + 0.4, F + 0.46, Math.min(zw, zi), Math.max(zw, zi), c);
        k.box(IN_, x0, x1, F + 0.46, F + 0.92, Math.min(zw, zw - sgn * 0.08), Math.max(zw, zw - sgn * 0.08), c);
        k.box(IN_, x0 + 0.05, x1 - 0.05, F, F + 0.4, Math.min(zw, sgn * (hw - 0.45)), Math.max(zw, sgn * (hw - 0.45)), [0.55, 0.55, 0.57]);
      }
    }
  } else {
    // transverse 3 + 2 rows facing alternately, an aisle off-centre
    let si = 0;
    for (const [g0, g1] of gaps) {
      const n = Math.floor((g1 - g0) / 0.86);
      for (let i = 0; i < n; i++) {
        const xc = g0 + (i + 0.5) * ((g1 - g0) / n), c = S.seatCols[si++ % 2], face = i % 2 ? 1 : -1;
        for (const [z0, z1] of [[-hw + 0.1, -0.35], [0.3, hw - 0.1]]) {
          k.box(IN_, xc - 0.26, xc + 0.26, F + 0.42, F + 0.5, z0, z1, c);
          k.box(IN_, xc - face * 0.3 - 0.05, xc - face * 0.3 + 0.05, F + 0.5, F + 1.15, z0, z1, c);
          k.box(IN_, xc - 0.2, xc + 0.2, F, F + 0.42, z0 + 0.1, z1 - 0.1, [0.25, 0.25, 0.27]);
        }
      }
    }
  }
  // poles: at the doors and down the middle (R62A); grab rails over the seats
  const pole = [0.85, 0.86, 0.88];
  if (S.seats === 'long') {
    for (const d of S.doors) {
      for (const sgn of [1, -1]) for (const s of [-1, 1]) k.cyl(IN_, [d + s * (S.doorW / 2 + 0.06), F, sgn * (hw - 0.52)], [d + s * (S.doorW / 2 + 0.06), S.EAVE, sgn * (hw - 0.52)], 0.019, 6, pole, 0, false);
      k.cyl(IN_, [d, F, 0], [d, yc - 0.04, 0], 0.019, 6, pole, 0, false);
    }
    for (const sgn of [1, -1]) k.cyl(IN_, [-xe + 0.4, F + 1.95, sgn * (hw - 0.42)], [xe - 0.4, F + 1.95, sgn * (hw - 0.42)], 0.016, 6, pole, 0, false);
  } else {
    for (const d of S.doors) for (const s of [-1, 1]) k.cyl(IN_, [d + s * (S.doorW / 2 + 0.2), F, 0], [d + s * (S.doorW / 2 + 0.2), S.EAVE, 0], 0.02, 6, pole, 0, false);
    for (const sgn of [1, -1]) k.box(IN_, -xe + 1.0, xe - 1.0, S.EAVE - 0.12, S.EAVE - 0.08, sgn * (hw - 0.55), sgn * (hw - 0.15), [0.6, 0.6, 0.62]);   // luggage racks
  }
}

// ------------------------------------------------------------------------------------------------ doors, trucks, wheels
// a door leaf in its own frame: x across the leaf (0 = its middle), y absolute (from the top of rail), z 0 = its outer
// face (+z outward); the runner places it on the side, closed or slid back into the pocket
export function buildDoorLeaf(kind) {
  const S = SPECS[kind], k = new TKit();
  k.weather = weatherFn(S);
  const w = S.doorW / S.leaves, y0 = S.FLOOR + 0.01, y1 = S.doorY1 - 0.005, t = 0.03;
  const pl = plane([0, 0, 0], [1, 0, 0], [0, 1, 0]);
  const painted = false;
  const wy0 = S.kind === 'r62a' ? 1.99 : S.winY[0] + 0.05, wy1 = S.kind === 'r62a' ? 2.79 : S.winY[1];
  const ww = S.leaves === 2 ? Math.min(0.34, w - 0.22) : 0.5;
  const H = { u0: -ww / 2, u1: ww / 2, v0: wy0, v1: wy1, r: 0.07 };
  k.wall('stainless', pl, -w / 2, w / 2, y0, y1, [H], painted ? [0.9, 0.9, 0.9] : [0.97, 0.97, 0.98], 0, [], [y0 + 0.3, wy0]);
  k.box('stainless', -w / 2, w / 2, y0, y1, -t, -t + 0.001, [0.7, 0.7, 0.7], 0, 'xXyYZ');
  k.reveal('stainless', pl, H, t, [0.6, 0.6, 0.62]);
  k.band('dark', pl, rrect(0, (wy0 + wy1) / 2, ww + 0.05, wy1 - wy0 + 0.05, 0.09, 3), rrect(0, (wy0 + wy1) / 2, ww - 0.025, wy1 - wy0 - 0.025, 0.05, 3), [0.04, 0.04, 0.045], 0, 0.006);
  k.fan('glass', pl, rrect(0, (wy0 + wy1) / 2, ww, wy1 - wy0, 0.07, 3), GREY, 0, -0.012);
  // the rubber nosing on the meeting edge (+x edge), the edges
  k.box('dark', w / 2 - 0.025, w / 2 + 0.01, y0, y1, -t, 0.006, [0.03, 0.03, 0.03]);
  k.box('stainless', -w / 2, -w / 2 + 0.01, y0, y1, -t, 0, [0.8, 0.8, 0.8]);
  return { geos: k.build(), w };
}
// a truck frame (the bogie) in its own frame: origin at its centre at rail level; the third-rail shoes on both sides
export function buildTruck(kind) {
  const S = SPECS[kind], k = new TKit(), DK = 'dark';
  const r = S.wheelR, wb = S.wheelBase / 2, big = kind !== 'r62a';
  const dust = (c) => (p) => { const v = vnoise(p[0] * 4, p[1] * 6, p[2] * 4); return [c[0] * (0.85 + 0.3 * v), c[1] * (0.82 + 0.25 * v), c[2] * (0.8 + 0.2 * v)]; };
  const frameC = dust([0.13, 0.115, 0.105]), rust = dust([0.2, 0.135, 0.1]);
  const zf = 0.7175 + (big ? 0.26 : 0.2);
  for (const s of [-1, 1]) {
    // side frame: deep in the middle, rising over the journal boxes
    k.box(DK, -wb - 0.35, wb + 0.35, r - 0.05, r + 0.14, s * zf - 0.07, s * zf + 0.07, frameC);
    k.box(DK, -wb + 0.35, wb - 0.35, r - 0.3, r - 0.05, s * zf - 0.07, s * zf + 0.07, frameC);
    for (const ax of [-wb, wb]) {
      k.box(DK, ax - 0.16, ax + 0.16, r - 0.14, r + 0.12, s * (zf + 0.02) - 0.1, s * (zf + 0.02) + 0.1, rust);   // journal box
      k.cyl(DK, [ax, r + 0.14, s * zf], [ax, r + 0.3, s * zf], 0.07, 8, frameC);                            // the axle spring
      // the tread brake unit acting on the wheel's inner side
      const bx = ax - Math.sign(ax) * (r + 0.06);
      k.box(DK, bx - 0.1, bx + 0.1, r - 0.12, r + 0.12, s * 0.58 - 0.08, s * 0.58 + 0.08, rust);
    }
    // the third-rail shoe: a beam off the journal boxes, the shoe hanger, the paddle at the rail
    const sz = S.shoe.z, beamC = big ? [0.12, 0.12, 0.13] : [0.17, 0.12, 0.09];
    k.box(DK, -wb + 0.2, wb - 0.2, r - 0.08, r + 0.02, s * (zf + 0.12) - 0.05, s * (zf + 0.12) + 0.05, beamC);
    k.box(DK, -0.08, 0.08, S.shoe.y + 0.03, r - 0.04, Math.min(s * (zf + 0.12), s * (sz - 0.05)), Math.max(s * (zf + 0.12), s * (sz - 0.05)), beamC);
    k.box(DK, -0.18, 0.18, S.shoe.y - 0.012, S.shoe.y + 0.012, s * sz - 0.06, s * sz + 0.06, [0.3, 0.27, 0.22]);
  }
  // the bolster across, its springs, the motors on the axles
  k.box(DK, -0.26, 0.26, r + 0.08, r + 0.32, -zf + 0.05, zf - 0.05, frameC);
  for (const ax of [-wb, wb]) k.cyl(DK, [ax - Math.sign(ax) * 0.42, r, -0.45], [ax - Math.sign(ax) * 0.42, r, 0.45], big ? 0.3 : 0.24, 10, frameC);
  return { geos: k.build() };
}
// a wheelset in its own frame: origin on the axle at rail height + r (it spins about z)
export function buildWheelset(kind) {
  const S = SPECS[kind], k = new TKit(), r = S.wheelR, DK = 'dark';
  k.cyl(DK, [0, 0, -0.82], [0, 0, 0.82], 0.075, 8, [0.2, 0.16, 0.12]);
  for (const s of [-1, 1]) {
    const zt0 = s * 0.655, zt1 = s * 0.79;
    // tread (bright where it runs), flange inside, the web with two dust patches so the spin shows
    k.cyl(DK, [0, 0, zt0], [0, 0, zt1], r, 20, [0.42, 0.4, 0.38], 0, false);
    k.cyl(DK, [0, 0, s * 0.632], [0, 0, zt0], r + 0.025, 20, [0.3, 0.28, 0.26], 0, false);
    for (const zz of [s * 0.632, zt1]) {
      const n = [0, 0, zz === zt1 ? s : -s];
      for (let i = 0; i < 20; i++) {
        const a0 = (i / 20) * Math.PI * 2, a1 = ((i + 1) / 20) * Math.PI * 2, rr = zz === zt1 ? r : r + 0.025;
        const c = i % 10 < 2 ? [0.08, 0.06, 0.05] : [0.24, 0.17, 0.12];
        k.tri(DK, [0, 0, zz], [Math.cos(a0) * rr, Math.sin(a0) * rr, zz], [Math.cos(a1) * rr, Math.sin(a1) * rr, zz], n, c);
      }
    }
    k.cyl(DK, [0, 0, s * 0.79], [0, 0, s * 0.86], 0.11, 10, [0.18, 0.14, 0.11]);
  }
  return { geos: k.build() };
}
// the safety barriers between two coupled R62A cars (spring gates both sides of the end doors), in the gap's frame
export function buildGap(kind) {
  const S = SPECS[kind], k = new TKit(), g = (S.LC - S.LB) / 2 + 0.02;
  if (kind !== 'r62a') {
    // MNR: the bellows between cars
    k.box('dark', -g, g, S.FLOOR - 0.05, S.doorY1 + 0.15, -0.68, 0.68, [0.04, 0.04, 0.045], 0, 'xX');
    return { geos: k.build() };
  }
  for (const s of [-1, 1]) {
    const z0 = s * 0.55, z1 = s * (S.W / 2 - 0.15);
    for (const y of [S.FLOOR + 0.35, S.FLOOR + 0.75, S.FLOOR + 1.15]) {
      k.cyl('dark', [-g, y, z0], [g, y - 0.03, z0], 0.012, 4, [0.5, 0.48, 0.45], 0, false);
      k.cyl('dark', [-g, y, z1], [g, y - 0.03, z1], 0.012, 4, [0.5, 0.48, 0.45], 0, false);
    }
    // the lattice (two crossed bars per bay)
    for (const [ya, yb] of [[S.FLOOR + 0.2, S.FLOOR + 0.8], [S.FLOOR + 0.8, S.FLOOR + 1.35]]) {
      k.cyl('dark', [-g, ya, (z0 + z1) / 2], [g, yb, (z0 + z1) / 2], 0.01, 4, [0.45, 0.43, 0.4], 0, false);
      k.cyl('dark', [-g, yb, (z0 + z1) / 2], [g, ya, (z0 + z1) / 2], 0.01, 4, [0.45, 0.43, 0.4], 0, false);
    }
  }
  return { geos: k.build() };
}
